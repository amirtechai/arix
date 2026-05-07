import type { Command } from 'commander'
import { mkdir, writeFile, access } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { printBanner } from '../banner.js'
import { existsSync } from 'node:fs'

// Project-level templates for opinionated bootstrapping.
const TEMPLATES: Record<string, { agentsMd: string; description: string }> = {
  default: {
    description: 'Minimal AGENTS.md / CLAUDE.md with sensible safety defaults',
    agentsMd: `# Project guide for AI agents

## Style
- Prefer small, focused changes. Don't introduce abstractions for hypothetical needs.
- Edit existing files instead of creating new ones unless the task demands it.
- Keep comments to the WHY (non-obvious constraints), not the WHAT.

## Safety
- Never commit secrets, .env files, or credentials.
- Never run destructive git commands (force push, reset --hard, branch -D) without explicit user approval.
- For database migrations or production-affecting changes, surface the plan before executing.

## Tests
- TDD: write a failing test, then minimal code to pass, then refactor.
- New code must come with tests covering happy path + at least one edge case.

## Commits
- Use Conventional Commits: feat / fix / refactor / docs / test / chore.
- One logical change per commit; keep diffs small.
`,
  },
  tdd: {
    description: 'Strict TDD discipline + RED-GREEN-REFACTOR enforcement',
    agentsMd: `# Project guide for AI agents

## TDD is mandatory

1. **RED** — write a failing test that captures the behaviour. Run it; confirm it fails for the *expected reason*.
2. **GREEN** — write the minimum code to make the test pass.
3. **REFACTOR** — improve names, extract helpers, remove duplication. Tests stay green.

Never write production code without a failing test demanding it.
Never edit a passing test to make new code work — fix the code.

## Other rules
- Keep functions small (<50 lines).
- Avoid mocking what you own; use real implementations in integration tests.
- Coverage target: 80% on new code.
`,
  },
  'safety-first': {
    description: 'Maximum safety — confirm before any write, no shell exec',
    agentsMd: `# Project guide for AI agents

## Safety first

This project requires elevated caution. Apply these rules without exception:

- **Confirm every write.** Even one-line edits get a confirmation prompt.
- **No shell execution.** Use the dedicated tools (test_runner, package_manager, linter, git_*) — never raw shell.
- **Read before write.** Always Read a file before editing it.
- **Investigate before deleting.** Unfamiliar files / branches may be in-progress work.
- **Migration scripts must be reversible.** Down migration mandatory.
- **PII is local-only.** Privacy-aware routing is on; do not disable.
`,
  },
  startup: {
    description: 'Move-fast template for early-stage projects',
    agentsMd: `# Project guide for AI agents

## Speed wins

- Working code beats perfect code. Ship the smallest viable change.
- Don't over-engineer; we'll refactor when the requirement clarifies.
- Skip docs / comments unless something is genuinely surprising.

## But not at the cost of:
- Tests for anything users touch (auth, payment, data ingestion).
- Reversibility — destructive operations are still confirmed.
- Cost — pre-flight expensive turns; downgrade when a cheaper model would do.

## Stack
- Default to boring tech we already know.
- Only introduce a new dep when the alternative is materially worse.
`,
  },
}

interface InitOpts { template?: string; project?: boolean }

// Default config uses anthropic as example — user can change provider/model freely.
// Supported providers: anthropic, openai, gemini, openrouter, ollama, bedrock, azure, vertex
const EXAMPLE_CONFIG = {
  provider: 'anthropic',
  model: 'claude-sonnet-4-6',
  permissionMode: 'standard',
  maxTurns: 20,
}

const EXAMPLE_SKILL = `---
description: My custom skill — describe what it does here
---
You are a helpful assistant with expertise in the following area:

<!-- Add your custom system prompt here. -->
`

export function registerInit(program: Command): void {
  program
    .command('init')
    .description('Initialize Arix in ~/.arix/ and (optionally) drop an AGENTS.md template into the current project')
    .option('--template <name>', `Project template: ${Object.keys(TEMPLATES).join(', ')}`, 'default')
    .option('--project', 'Also write AGENTS.md to the current working directory')
    .option('--list-templates', 'List available templates and exit')
    .action(async (opts: InitOpts & { listTemplates?: boolean }) => {
      if (opts.listTemplates) {
        process.stdout.write('Available templates:\n')
        for (const [name, t] of Object.entries(TEMPLATES)) {
          process.stdout.write(`  ${name.padEnd(14)} ${t.description}\n`)
        }
        return
      }
      printBanner()
      const configDir = join(homedir(), '.arix')
      const dirs = [
        configDir,
        join(configDir, 'sessions'),
        join(configDir, 'skills'),
        join(configDir, 'plugins'),
      ]

      for (const dir of dirs) {
        await mkdir(dir, { recursive: true })
      }

      // Write config only if it doesn't exist
      const configPath = join(configDir, 'config.json')
      const configExists = await access(configPath).then(() => true).catch(() => false)
      if (!configExists) {
        await writeFile(configPath, JSON.stringify(EXAMPLE_CONFIG, null, 2) + '\n', 'utf-8')
        console.log(`  created  ${configPath}`)
      } else {
        console.log(`  exists   ${configPath}`)
      }

      // Write example skill if skills dir is empty
      const exampleSkillPath = join(configDir, 'skills', 'example.md')
      const skillExists = await access(exampleSkillPath).then(() => true).catch(() => false)
      if (!skillExists) {
        await writeFile(exampleSkillPath, EXAMPLE_SKILL, 'utf-8')
        console.log(`  created  ${exampleSkillPath}`)
      }

      // Optional project template
      if (opts.project) {
        const tName = opts.template ?? 'default'
        const tpl = TEMPLATES[tName]
        if (!tpl) {
          console.log(`\nUnknown template: ${tName}`)
          console.log(`Try: ${Object.keys(TEMPLATES).join(', ')}`)
        } else {
          const target = join(process.cwd(), 'AGENTS.md')
          if (existsSync(target)) {
            console.log(`  exists   ${target}  (untouched)`)
          } else {
            await writeFile(target, tpl.agentsMd, 'utf-8')
            console.log(`  created  ${target}  (template: ${tName})`)
          }
        }
      }

      console.log('\nArix initialized.')
      console.log(`Config dir: ${configDir}`)
      console.log('\nNext steps:')
      console.log('  Set API keys for the providers you want to use:')
      console.log('    export ARIX_ANTHROPIC_KEY=sk-ant-...')
      console.log('    export ARIX_OPENAI_KEY=sk-...')
      console.log('    export ARIX_GEMINI_KEY=AIza...')
      console.log('    export ARIX_OPENROUTER_KEY=sk-or-...')
      console.log('  Or use local models (no key needed):')
      console.log('    arix chat -p ollama -m qwen2.5-coder:7b')
      console.log('  Switch provider/model:')
      console.log('    arix config set provider openai')
      console.log('    arix config set model gpt-4o')
      console.log('  Start a session:    arix chat')
      console.log('  List all models:    arix models list')
    })
}
