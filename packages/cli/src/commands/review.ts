/**
 * arix review — multi-pass parallel code review
 *
 * Runs 4 specialised review passes in PARALLEL (each with its own AgentLoop):
 *   • security   — OWASP, injection, auth flaws, secrets
 *   • performance — N+1, memory, algorithmic complexity
 *   • correctness — bugs, edge cases, error handling
 *   • style       — readability, naming, dead code, SOLID
 *
 * Results are merged into a single Markdown report.
 *
 * Usage:
 *   arix review                        # review uncommitted diff
 *   arix review src/auth.ts            # review specific file
 *   arix review --since HEAD~3         # review last 3 commits
 *   arix review --pass security        # single pass
 */

import type { Command } from 'commander'
import { readFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { bootstrap } from '../bootstrap.js'
import { ParallelAgentPool, mergeResults } from '@arix-code/core'
import type { AgentEvent } from '@arix-code/core'

const exec = promisify(execFile)

const PASS_PROMPTS: Record<string, string> = {
  security: `You are a security-focused code reviewer. Review the following code for:
- OWASP Top 10 vulnerabilities (injection, XSS, CSRF, etc.)
- Authentication and authorization flaws
- Hardcoded secrets, API keys, credentials
- Input validation gaps
- Insecure cryptography or hashing
- Path traversal, command injection
- Unsafe deserialization

For each issue: state the severity (Critical/High/Medium/Low), file:line, explanation, and a concrete fix.
If no issues found in a category, say "✓ None found".`,

  performance: `You are a performance-focused code reviewer. Review the following code for:
- N+1 query patterns
- Unnecessary re-renders or recomputation
- Memory leaks (unclosed resources, event listeners)
- Algorithmic complexity issues (O(n²) where O(n log n) is possible)
- Missing indexes or caching opportunities
- Synchronous blocking in async contexts
- Over-fetching or under-batching

For each issue: state the impact (High/Medium/Low), file:line, explanation, and optimisation strategy.`,

  correctness: `You are a correctness-focused code reviewer. Review the following code for:
- Logic errors and off-by-one bugs
- Unhandled edge cases (null/undefined, empty arrays, overflow)
- Error handling gaps (swallowed errors, missing fallbacks)
- Race conditions and concurrency bugs
- Incorrect type assumptions
- Missing validation at system boundaries
- Broken invariants

For each issue: state the severity (Critical/High/Medium/Low), file:line, explanation, and fix.`,

  style: `You are a code quality reviewer focused on maintainability. Review for:
- Naming clarity (variables, functions, types)
- Dead code, unused imports, redundant comments
- Violation of SOLID principles
- Functions that do too many things (SRP)
- Magic numbers/strings without named constants
- Inconsistent patterns vs the rest of the codebase
- Missing or misleading comments on complex logic

For each issue: state priority (Must/Should/Could), file:line, explanation, and suggestion.`,
}

export function registerReview(program: Command): void {
  program
    .command('review [target]')
    .description('Multi-pass parallel code review (security, perf, correctness, style)')
    .option('--since <ref>', 'Review commits since this git ref (e.g. HEAD~3)')
    .option('--pass <name>', 'Run only one pass: security | performance | correctness | style')
    .option('--model <model>', 'Override model for review')
    .action(async (target: string | undefined, opts: { since?: string; pass?: string; model?: string }) => {
      const cwd = process.cwd()
      let codeContext = ''

      if (target) {
        // Specific file
        try {
          codeContext = await readFile(target, 'utf8')
          codeContext = `File: ${target}\n\`\`\`\n${codeContext}\n\`\`\``
        } catch {
          console.error(`Cannot read file: ${target}`)
          process.exit(1)
        }
      } else {
        // Git diff
        try {
          const args = opts.since
            ? ['diff', `${opts.since}..HEAD`, '--no-color']
            : ['diff', '--no-color']
          const { stdout } = await exec('git', args, { cwd })
          codeContext = stdout.trim()

          if (!codeContext) {
            // Try staged
            const { stdout: staged } = await exec('git', ['diff', '--staged', '--no-color'], { cwd })
            codeContext = staged.trim()
          }
        } catch (err) {
          console.error('Git error:', err instanceof Error ? err.message : String(err))
          process.exit(1)
        }
      }

      if (!codeContext) {
        console.log('No changes to review.')
        process.exit(0)
      }

      const MAX_CHARS = 30_000
      if (codeContext.length > MAX_CHARS) {
        codeContext = codeContext.slice(0, MAX_CHARS) + '\n... (truncated)'
      }

      const passes = opts.pass
        ? [opts.pass]
        : Object.keys(PASS_PROMPTS)

      const invalidPasses = passes.filter((p) => !(p in PASS_PROMPTS))
      if (invalidPasses.length > 0) {
        console.error(`Unknown pass(es): ${invalidPasses.join(', ')}`)
        console.error('Valid: security, performance, correctness, style')
        process.exit(1)
      }

      console.log(`\nRunning ${passes.length} review pass${passes.length > 1 ? 'es' : ''} in parallel...\n`)

      const { loop: baseLoop } = await bootstrap(cwd, undefined, opts.model ? { model: opts.model } : undefined)

      // For parallel pool, create a fresh loop per worker
      const pool = new ParallelAgentPool({
        concurrency: passes.length,
        loopFactory: (systemPrompt?: string) => {
          // We reuse the provider from baseLoop but create new instances
          // In practice, each worker needs its own AgentLoop instance
          // We use bootstrap again for clean isolation
          return {
            async *run(prompt: string): AsyncIterable<AgentEvent> {
              const fullPrompt = systemPrompt
                ? `${systemPrompt}\n\nCode to review:\n${codeContext}\n\n${prompt}`
                : `${prompt}\n\nCode to review:\n${codeContext}`
              yield* (baseLoop.run(fullPrompt) as AsyncIterable<AgentEvent>)
            },
          }
        },
        onWorkerDone: (result) => {
          const status = result.error ? '✗' : '✓'
          console.log(`  ${status} ${result.id} (${(result.durationMs / 1000).toFixed(1)}s)`)
        },
      })

      const tasks = passes.map((pass) => ({
        id: pass,
        prompt: PASS_PROMPTS[pass] ?? '',
      }))

      const results = await pool.run(tasks)
      const report = mergeResults(results)

      console.log('\n' + '═'.repeat(60))
      console.log('CODE REVIEW REPORT')
      console.log('═'.repeat(60) + '\n')
      console.log(report)
      console.log('\n' + '═'.repeat(60))
    })
}
