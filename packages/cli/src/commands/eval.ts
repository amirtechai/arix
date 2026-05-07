import type { Command } from 'commander'
import { runSuite, formatReport, skillRegressionSuite } from '@arix/core'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export function registerEval(program: Command): void {
  program
    .command('eval')
    .description('Run quality evaluation suites (skill regression, provider conformance, custom suites)')
    .option('--suite <name>', 'Specific suite name to run', 'all')
    .option('--file <path>', 'Path to a custom suite module (default export = EvalSuite[])')
    .option('--json', 'Emit JSON report instead of human-readable')
    .action(async (opts: { suite: string; file?: string; json?: boolean }) => {
      const reports = []

      if (opts.suite === 'all' || opts.suite === 'skill-regression') {
        reports.push(await runSuite(await skillRegressionSuite()))
      }

      if (opts.file) {
        const path = resolve(opts.file)
        if (!existsSync(path)) {
          process.stderr.write(`Suite file not found: ${path}\n`)
          process.exitCode = 1
          return
        }
        // Custom suites must be JSON manifests for now (safer than dynamic require)
        try {
          const raw = await readFile(path, 'utf-8')
          const manifest = JSON.parse(raw) as { name: string; cases: Array<{ id: string; input: string; expected: string }> }
          reports.push(await runSuite({
            name: manifest.name,
            run: async (i: string) => i,
            cases: manifest.cases.map((c) => ({
              id: c.id,
              input: c.input,
              grade: (out: string) => out === c.expected ? 1 : 0,
            })),
          }))
        } catch (err) {
          process.stderr.write(`Failed to load suite: ${(err as Error).message}\n`)
          process.exitCode = 1
          return
        }
      }

      if (opts.json) {
        process.stdout.write(JSON.stringify(reports, null, 2) + '\n')
      } else {
        process.stdout.write('\nEval results:\n\n')
        for (const r of reports) process.stdout.write('  ' + formatReport(r) + '\n')
        process.stdout.write('\n')
      }

      const failed = reports.reduce((s, r) => s + r.failed, 0)
      if (failed > 0) process.exitCode = 1
    })
}
