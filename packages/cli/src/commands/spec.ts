import type { Command } from 'commander'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { SpecManager } from '@arix/core'

const stateDir = join(homedir(), '.arix', 'specs')

export function registerSpec(program: Command): void {
  const spec = program
    .command('spec <file>')
    .description('Spec-driven development — expand a feature.md into tracked tasks, detect drift')
    .option('--diff', 'Show whether the spec has changed since the saved plan')
    .option('--show', 'Print the saved plan')
    .action(async (file: string, opts: { diff?: boolean; show?: boolean }) => {
      const sm = new SpecManager(stateDir)

      if (opts.diff) {
        const d = await sm.diff(file)
        if (!d.previousHash) {
          process.stdout.write(`No saved plan for ${file}. Run "arix spec ${file}" to expand.\n`)
          return
        }
        if (d.changed) {
          process.stdout.write(`✶ Spec drifted: was ${d.previousHash}, now ${d.currentHash}\n`)
        } else {
          process.stdout.write(`✓ Spec unchanged (${d.currentHash})\n`)
        }
        return
      }

      if (opts.show) {
        const plan = await sm.loadPlan(file)
        if (!plan) {
          process.stdout.write(`No saved plan for ${file}.\n`)
          return
        }
        process.stdout.write(`\nPlan for ${plan.specPath} (${plan.specHash})\nGenerated: ${plan.generatedAt}\n\n`)
        for (const t of plan.tasks) {
          const status = t.status === 'done' ? '✓' : t.status === 'in_progress' ? '◐' : '○'
          process.stdout.write(`  ${status} ${t.id}  ${t.title}\n`)
          for (const a of t.acceptance) process.stdout.write(`       - ${a}\n`)
        }
        process.stdout.write('\n')
        return
      }

      const plan = await sm.expand(file)
      process.stdout.write(`\nExpanded ${plan.tasks.length} task(s) from ${file} (${plan.specHash}):\n\n`)
      for (const t of plan.tasks) {
        process.stdout.write(`  ○ ${t.id}  ${t.title}\n`)
        for (const a of t.acceptance) process.stdout.write(`       - ${a}\n`)
      }
      process.stdout.write('\nUse "arix spec <file> --diff" later to detect spec changes.\n\n')
    })

  return spec as unknown as void
}
