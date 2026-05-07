/**
 * arix drift — periodic spec-vs-code drift watcher (R4).
 *
 *   arix drift check <spec.md>   # exit 1 if spec content has changed
 *   arix drift check --all       # all known specs in ~/.arix/specs/
 */

import type { Command } from 'commander'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { readdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { SpecManager } from '@arix-code/core'

const stateDir = join(homedir(), '.arix', 'specs')

export function registerDrift(program: Command): void {
  const cmd = program
    .command('drift')
    .description('Detect drift between specs and saved plans (CI-friendly)')

  cmd
    .command('check [spec]')
    .description('Compare a single spec or every saved spec; exit non-zero on drift')
    .option('--all', 'Walk every saved plan in ~/.arix/specs/')
    .action(async (spec: string | undefined, opts: { all?: boolean }) => {
      const sm = new SpecManager(stateDir)
      let anyDrift = false

      if (spec && !opts.all) {
        const d = await sm.diff(spec)
        if (!d.previousHash) {
          process.stdout.write(`No saved plan for ${spec}. Run "arix spec ${spec}" first.\n`)
          return
        }
        if (d.changed) {
          process.stdout.write(`✶ DRIFT  ${spec}  was ${d.previousHash}, now ${d.currentHash}\n`)
          process.exitCode = 1
        } else {
          process.stdout.write(`✓ ok    ${spec}  (${d.currentHash})\n`)
        }
        return
      }

      if (!existsSync(stateDir)) {
        process.stdout.write('No saved plans.\n')
        return
      }
      const plans = (await readdir(stateDir)).filter((f) => f.endsWith('.json'))
      for (const f of plans) {
        try {
          const plan = JSON.parse(await readFile(join(stateDir, f), 'utf-8')) as { specPath: string }
          if (!existsSync(plan.specPath)) {
            process.stdout.write(`? missing  ${plan.specPath}\n`)
            continue
          }
          const d = await sm.diff(plan.specPath)
          if (d.changed) {
            anyDrift = true
            process.stdout.write(`✶ DRIFT  ${plan.specPath}\n`)
          } else {
            process.stdout.write(`✓ ok     ${plan.specPath}\n`)
          }
        } catch (err) {
          process.stderr.write(`error reading ${f}: ${(err as Error).message}\n`)
        }
      }
      if (anyDrift) process.exitCode = 1
    })
}
