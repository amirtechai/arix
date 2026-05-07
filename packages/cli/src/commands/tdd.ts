/**
 * arix tdd — Test-Driven Development enforcement mode
 *
 * Enforces the Red → Green → Refactor cycle:
 *   1. RED:     agent writes a failing test for the requirement
 *   2. VERIFY:  runs the test suite — confirms test actually fails
 *   3. GREEN:   agent writes minimal implementation to make it pass
 *   4. VERIFY:  runs the test suite — confirms test passes
 *   5. REFACTOR: agent improves the code without breaking tests
 *   6. VERIFY:  final test run — confirms nothing regressed
 *
 * Usage:
 *   arix tdd "add user authentication with JWT"
 *   arix tdd --skip-refactor "add pagination to user list"
 *   arix tdd --test-cmd "jest --testPathPattern=auth" "fix login bug"
 */

import type { Command } from 'commander'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { bootstrap } from '../bootstrap.js'
import type { AgentEvent } from '@arix-code/core'

const exec = promisify(execFile)

const _PHASES = ['RED', 'GREEN', 'REFACTOR'] as const
type Phase = typeof PHASES[number]

export function registerTdd(program: Command): void {
  program
    .command('tdd <requirement...>')
    .description('Test-Driven Development: Red → Green → Refactor cycle')
    .option('--test-cmd <cmd>', 'Test command to run (default: auto-detect)')
    .option('--skip-refactor', 'Skip refactor phase')
    .option('--max-attempts <n>', 'Max fix attempts per phase', '3')
    .option('--model <model>', 'Override model')
    .action(async (
      requirementParts: string[],
      opts: { testCmd?: string; skipRefactor: boolean; maxAttempts: string; model?: string },
    ) => {
      const requirement = requirementParts.join(' ')
      const cwd = process.cwd()
      const maxAttempts = parseInt(opts.maxAttempts, 10)

      // Detect test command
      const testCmd = opts.testCmd ?? await detectTestCommand(cwd)
      if (!testCmd) {
        console.error('Cannot detect test runner. Use --test-cmd to specify one.')
        process.exit(1)
      }

      console.log(`\nTDD Mode: ${requirement}`)
      console.log(`Test command: ${testCmd}`)
      console.log(`Phases: RED → GREEN${opts.skipRefactor ? '' : ' → REFACTOR'}\n`)

      const { loop } = await bootstrap(cwd, undefined, opts.model ? { model: opts.model } : undefined)

      // Helper: run tests and return { passed, output }
      const runTests = async (): Promise<{ passed: boolean; output: string }> => {
        const [cmd, ...args] = testCmd.split(' ')
        if (!cmd) return { passed: false, output: 'No test command' }
        try {
          const { stdout, stderr } = await exec(cmd, args, { cwd })
          return { passed: true, output: stdout + stderr }
        } catch (err: unknown) {
          const e = err as { stdout?: string; stderr?: string; message?: string }
          return { passed: false, output: (e.stdout ?? '') + (e.stderr ?? '') + (e.message ?? '') }
        }
      }

      // Helper: run a phase with the agent
      const runPhase = async (phase: Phase, prompt: string): Promise<string> => {
        printPhaseHeader(phase)
        let output = ''
        for await (const event of loop.run(prompt) as AsyncIterable<AgentEvent>) {
          if (event.type === 'text') {
            process.stdout.write(event.chunk)
            output += event.chunk
          }
          if (event.type === 'error') {
            console.error('\nAgent error:', event.error)
          }
        }
        process.stdout.write('\n\n')
        return output
      }

      // ── Phase 1: RED ──────────────────────────────────────────────────
      await runPhase('RED', `You are implementing a feature using Test-Driven Development.

REQUIREMENT: ${requirement}

Phase: RED — Write a failing test.

Instructions:
1. Write a test that specifies the expected behaviour for this requirement
2. The test MUST fail right now (no implementation exists yet)
3. The test should be minimal and focused — one clear assertion
4. Use the project's existing test framework and patterns
5. Place the test in the appropriate test file location

Write ONLY the test code, no implementation.`)

      // Verify RED: test must FAIL
      let testResult = await runTests()
      if (testResult.passed) {
        console.log('⚠️  Test passed when it should have failed. Possibly already implemented?')
        console.log('   Continuing to GREEN phase...')
      } else {
        console.log('✓ RED: Test is failing (expected)\n')
      }

      // ── Phase 2: GREEN ────────────────────────────────────────────────
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        await runPhase('GREEN', `Phase: GREEN — Write minimal implementation to make the test pass.

Requirement: ${requirement}
Test output from RED phase:
${testResult.output.slice(0, 3000)}

Instructions:
1. Write the MINIMAL code to make the failing test pass
2. Do NOT over-engineer — just make the test green
3. Do NOT change the test
4. Focus only on making this specific test pass`)

        testResult = await runTests()
        if (testResult.passed) {
          console.log('✓ GREEN: All tests passing\n')
          break
        } else {
          if (attempt < maxAttempts) {
            console.log(`✗ Tests still failing (attempt ${attempt}/${maxAttempts})\n`)
          } else {
            console.log(`✗ Could not make tests pass after ${maxAttempts} attempts`)
            console.log('Test output:')
            console.log(testResult.output.slice(0, 2000))
            process.exit(1)
          }
        }
      }

      if (opts.skipRefactor) {
        console.log('\n✓ TDD cycle complete (refactor skipped)')
        return
      }

      // ── Phase 3: REFACTOR ─────────────────────────────────────────────
      await runPhase('REFACTOR', `Phase: REFACTOR — Improve the code while keeping tests green.

Requirement: ${requirement}

Instructions:
1. Improve the implementation code (not the test)
2. Remove duplication, improve naming, apply SOLID principles
3. Do NOT add new functionality
4. The tests MUST continue to pass after your changes`)

      // Final verify
      const finalResult = await runTests()
      if (finalResult.passed) {
        console.log('✓ REFACTOR: Tests still passing\n')
        console.log('✅ TDD cycle complete: Red → Green → Refactor')
      } else {
        console.log('✗ Refactor broke the tests!')
        console.log(finalResult.output.slice(0, 2000))
        process.exit(1)
      }
    })
}

function printPhaseHeader(phase: Phase): void {
  const colors: Record<Phase, string> = { RED: '\x1b[31m', GREEN: '\x1b[32m', REFACTOR: '\x1b[33m' }
  const color = colors[phase]
  const reset = '\x1b[0m'
  console.log(`${color}${'─'.repeat(50)}`)
  console.log(`  Phase: ${phase}`)
  console.log(`${'─'.repeat(50)}${reset}\n`)
}

async function detectTestCommand(cwd: string): Promise<string | null> {
  const { readFile } = await import('node:fs/promises')
  try {
    const pkg = JSON.parse(await readFile(`${cwd}/package.json`, 'utf8')) as {
      scripts?: Record<string, string>
    }
    const test = pkg.scripts?.test
    if (test && !test.includes('no test specified')) return test

    // Common defaults
    if (pkg.scripts?.['test:unit']) return pkg.scripts['test:unit']
    if (pkg.scripts?.['vitest']) return 'vitest run'
  } catch { /* no package.json */ }

  // Try common runners
  for (const cmd of ['vitest run', 'jest', 'pytest', 'cargo test', 'go test ./...']) {
    try {
      const [bin] = cmd.split(' ')
      if (!bin) continue
      await promisify(execFile)('which', [bin])
      return cmd
    } catch { /* not found */ }
  }

  return null
}
