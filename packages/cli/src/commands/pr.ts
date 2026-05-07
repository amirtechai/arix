/**
 * arix pr — AI-powered PR generator
 *
 * Reads git diff since branch diverged from base, generates a structured
 * PR title + description, and optionally creates the GitHub PR via `gh`.
 *
 * Usage:
 *   arix pr                    # generate description, print to stdout
 *   arix pr --create           # push branch + create GitHub PR
 *   arix pr --base main        # compare against main (default)
 *   arix pr --copy             # copy to clipboard
 */

import type { Command } from 'commander'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { bootstrap } from '../bootstrap.js'
import type { AgentEvent } from '@arix-code/core'

const exec = promisify(execFile)

export function registerPr(program: Command): void {
  program
    .command('pr')
    .description('Generate a pull request description from git diff')
    .option('--base <branch>', 'Base branch to diff against', 'main')
    .option('--create', 'Push branch and create GitHub PR with the generated description')
    .option('--model <model>', 'Override model for generation')
    .action(async (opts: { base: string; create: boolean; model?: string }) => {
      const cwd = process.cwd()

      // 1. Gather git info
      let diff = ''
      let currentBranch = ''
      let commitLog = ''

      try {
        const { stdout: branch } = await exec('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd })
        currentBranch = branch.trim()

        const { stdout: d } = await exec(
          'git', ['diff', `${opts.base}...HEAD`, '--stat', '--patch', '--no-color'], { cwd },
        )
        diff = d.trim()

        const { stdout: log } = await exec(
          'git', ['log', `${opts.base}..HEAD`, '--oneline', '--no-merges'], { cwd },
        )
        commitLog = log.trim()
      } catch (err) {
        console.error('Git error:', err instanceof Error ? err.message : String(err))
        process.exit(1)
      }

      if (!diff) {
        console.log('No changes found vs', opts.base)
        process.exit(0)
      }

      // Truncate diff if huge
      const MAX_DIFF_CHARS = 20_000
      const truncated = diff.length > MAX_DIFF_CHARS
      const diffText = truncated ? diff.slice(0, MAX_DIFF_CHARS) + '\n... (truncated)' : diff

      const prompt = `You are a senior software engineer writing a GitHub pull request description.

Branch: ${currentBranch}
Base: ${opts.base}

Commits:
${commitLog || '(no commits yet)'}

Diff:
${diffText}

Generate a pull request with this EXACT format:

TITLE: <concise title under 72 chars, imperative mood>

## Summary
<2-4 bullet points describing what changed and why>

## Changes
<list key files/modules changed with one-line explanation each>

## Test Plan
<checklist of how to verify this works>

Be specific. Reference actual file names, function names, and concepts from the diff.`

      // 2. Run agent
      const { loop } = await bootstrap(cwd, undefined, opts.model ? { model: opts.model } : undefined)

      let fullOutput = ''
      process.stdout.write('\n')

      for await (const event of loop.run(prompt) as AsyncIterable<AgentEvent>) {
        if (event.type === 'text') {
          process.stdout.write(event.chunk)
          fullOutput += event.chunk
        }
        if (event.type === 'error') {
          console.error('\nError:', event.error)
          process.exit(1)
        }
      }
      process.stdout.write('\n\n')

      // 3. Optionally create GitHub PR
      if (opts.create) {
        const titleMatch = fullOutput.match(/^TITLE:\s*(.+)$/m)
        const title = titleMatch?.[1]?.trim() ?? `Changes from ${currentBranch}`
        const body = fullOutput.replace(/^TITLE:.*$/m, '').trim()

        console.log('Creating GitHub PR...')
        try {
          await exec('git', ['push', '-u', 'origin', currentBranch], { cwd })
          const { stdout } = await exec(
            'gh', ['pr', 'create', '--title', title, '--body', body, '--base', opts.base],
            { cwd },
          )
          console.log('PR created:', stdout.trim())
        } catch (err) {
          console.error('Failed to create PR:', err instanceof Error ? err.message : String(err))
          console.log('(Make sure `gh` CLI is installed and authenticated)')
        }
      }
    })
}
