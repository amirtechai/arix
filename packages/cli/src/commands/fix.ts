import type { Command } from 'commander'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { bootstrap } from '../bootstrap.js'

const execFileAsync = promisify(execFile)

const MAX_CYCLES = 5

interface CheckResult {
  name: string
  passed: boolean
  output: string
}

// ── Project check runners ─────────────────────────────────────────────────────

async function runCheck(name: string, cmd: string, args: string[], cwd: string): Promise<CheckResult> {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, { cwd, timeout: 60_000 })
    return { name, passed: true, output: (stdout + stderr).trim() }
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string }
    const combined = (e.stdout ?? '') + (e.stderr ?? '')
    const output = (combined || (e.message ?? 'unknown error')).trim()
    return { name, passed: false, output }
  }
}

/** Detect which checks to run based on project package.json */
async function detectChecks(cwd: string): Promise<Array<{ name: string; cmd: string; args: string[] }>> {
  const pkgPath = join(cwd, 'package.json')
  if (!existsSync(pkgPath)) return []

  const { readFile } = await import('node:fs/promises')
  let scripts: Record<string, string> = {}
  try {
    const pkg = JSON.parse(await readFile(pkgPath, 'utf-8')) as { scripts?: Record<string, string> }
    scripts = pkg.scripts ?? {}
  } catch { /* ignore parse errors */ }

  const checks: Array<{ name: string; cmd: string; args: string[] }> = []

  // Determine package manager
  const pm = existsSync(join(cwd, 'pnpm-lock.yaml'))
    ? 'pnpm'
    : existsSync(join(cwd, 'yarn.lock'))
      ? 'yarn'
      : 'npm'

  if ('lint' in scripts) checks.push({ name: 'lint', cmd: pm, args: ['run', 'lint'] })
  if ('typecheck' in scripts) checks.push({ name: 'typecheck', cmd: pm, args: ['run', 'typecheck'] })
  if ('test' in scripts) checks.push({ name: 'test', cmd: pm, args: ['run', 'test', '--', '--run'] })

  // Fallbacks if no scripts found
  if (checks.length === 0 && existsSync(join(cwd, 'tsconfig.json'))) {
    checks.push({ name: 'typecheck', cmd: 'npx', args: ['tsc', '--noEmit'] })
  }

  return checks
}

// ── Command ───────────────────────────────────────────────────────────────────

export function registerFix(program: Command): void {
  program
    .command('fix')
    .description('Run lint/typecheck/tests and auto-fix errors using the AI agent')
    .option('--max-cycles <n>', 'Maximum fix cycles (default: 5)', '5')
    .option('--dry-run', 'Show errors but do not run the agent')
    .action(async (opts: Record<string, unknown>) => {
      const cwd = process.cwd()
      const maxCycles = Math.min(parseInt(String(opts['maxCycles'] ?? '5'), 10), MAX_CYCLES)
      const dryRun = Boolean(opts['dryRun'] ?? false)

      const checks = await detectChecks(cwd)
      if (checks.length === 0) {
        console.error('No lint/typecheck/test scripts found in package.json.')
        process.exitCode = 1
        return
      }

      console.log(`Running ${checks.map((c) => c.name).join(' + ')} — up to ${maxCycles} fix cycles\n`)

      for (let cycle = 1; cycle <= maxCycles; cycle++) {
        // Run all checks
        const results: CheckResult[] = []
        for (const check of checks) {
          process.stdout.write(`  [${cycle}/${maxCycles}] ${check.name}... `)
          const result = await runCheck(check.name, check.cmd, check.args, cwd)
          process.stdout.write(result.passed ? '✓\n' : '✗\n')
          results.push(result)
        }

        const failures = results.filter((r) => !r.passed)
        if (failures.length === 0) {
          console.log('\nAll checks passed.')
          return
        }

        if (dryRun) {
          console.log('\nErrors found (--dry-run, skipping agent):')
          for (const f of failures) {
            console.log(`\n── ${f.name} ──\n${f.output}`)
          }
          process.exitCode = 1
          return
        }

        // Build prompt for agent
        const errorBlock = failures
          .map((f) => `### ${f.name}\n\`\`\`\n${f.output.slice(0, 4000)}\n\`\`\``)
          .join('\n\n')
        const prompt = `Fix the following errors in the current codebase. Do not change test logic — only fix the source code to make the checks pass.\n\n${errorBlock}\n\nAfter fixing, confirm what you changed.`

        console.log(`\n  Sending ${failures.length} error(s) to agent for fix...\n`)

        const { loop } = await bootstrap(cwd)
        for await (const ev of loop.run(prompt)) {
          if (ev.type === 'text') process.stdout.write(ev.chunk)
          if (ev.type === 'error') {
            console.error(`\nAgent error: ${ev.error}`)
            process.exitCode = 1
            return
          }
        }
        console.log('\n')
      }

      console.error(`\nMax fix cycles (${maxCycles}) reached — some errors may remain.`)
      process.exitCode = 1
    })
}
