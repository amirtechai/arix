/**
 * arix team — Multi-agent parallel task execution
 *
 * Decomposes a complex task into subtasks, assigns each to a specialized
 * agent running in parallel, then synthesizes results.
 *
 * Usage:
 *   arix team "refactor the auth module and add tests"
 *   arix team --sequential "complex task"
 */

import type { Command } from 'commander'
import { bootstrap } from '../bootstrap.js'
import { AgentLoop, CoordinatorAgent, TeamMemory, ModelCatalogue } from '@arix/core'
import type { AgentEvent, TaskType } from '@arix/core'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { ProviderFactory } from '@arix/providers'

// ── ANSI ─────────────────────────────────────────────────────────────────────

const isTTY = process.stdout.isTTY
const c = {
  reset:   isTTY ? '\x1b[0m'  : '',
  bold:    isTTY ? '\x1b[1m'  : '',
  cyan:    isTTY ? '\x1b[36m' : '',
  green:   isTTY ? '\x1b[32m' : '',
  yellow:  isTTY ? '\x1b[33m' : '',
  magenta: isTTY ? '\x1b[35m' : '',
  gray:    isTTY ? '\x1b[90m' : '',
  dim:     isTTY ? '\x1b[2m'  : '',
}

const TASK_LABELS: Record<TaskType, string> = {
  coding:   'Coder',
  search:   'Researcher',
  review:   'Reviewer',
  analysis: 'Analyst',
  general:  'Assistant',
}

export function registerTeam(program: Command): void {
  program
    .command('team <task...>')
    .description('Decompose a complex task and run it with a team of parallel agents')
    .option('--sequential', 'Run agents sequentially instead of in parallel')
    .option('-p, --provider <provider>', 'Override provider for all agents')
    .option('-m, --model <model>', 'Override model for all agents')
    .action(async (taskWords: string[], opts: Record<string, unknown>) => {
      const task = taskWords.join(' ')
      const sequential = Boolean(opts['sequential'])
      const cwd = process.cwd()

      process.stdout.write(
        `\n${c.bold}${c.cyan}Arix Team${c.reset} ${c.gray}— Parallel Multi-Agent Execution${c.reset}\n` +
        `${c.dim}Task: ${task}${c.reset}\n\n`
      )

      const { configManager, mcpRegistry } = await bootstrap(cwd, undefined, {
        ...(opts['provider'] ? { provider: opts['provider'] as string } : {}),
        ...(opts['model'] ? { model: opts['model'] as string } : {}),
      })

      const config = await configManager.load()
      const providerName = (opts['provider'] as string | undefined) ?? config.provider ?? 'anthropic'
      const modelName = (opts['model'] as string | undefined) ?? config.model ?? ModelCatalogue.defaultModel(providerName)
      const apiKey = configManager.resolveApiKey(providerName)

      const teamMemory = new TeamMemory(join(homedir(), '.arix', 'team-memory.json'))
      await teamMemory.load()

      // Build a shared provider instance — all agents reuse it
      const sharedProvider = ProviderFactory.create(providerName, {
        ...(apiKey ? { apiKey } : {}),
      })

      const factory = (taskType: TaskType, systemPrompt?: string): AgentLoop => {
        const label = TASK_LABELS[taskType] ?? 'Assistant'
        return new AgentLoop({
          provider: sharedProvider,
          model: modelName,
          tools: [],
          systemPrompt: systemPrompt ?? `You are a ${label} agent. Focus precisely on your assigned subtask.`,
          maxTurns: 10,
        })
      }

      const coordinator = new CoordinatorAgent({
        agentFactory: factory,
        teamMemory,
        parallel: !sequential,
      })

      try {
        for await (const event of coordinator.run(task) as AsyncIterable<AgentEvent>) {
          if (event.type === 'text') {
            if (event.chunk.includes('─── ')) {
              process.stdout.write(`\n${c.bold}${c.magenta}${event.chunk}${c.reset}`)
            } else if (event.chunk.startsWith('\n[') && event.chunk.includes(']')) {
              process.stdout.write(`\n${c.bold}${c.cyan}${event.chunk}${c.reset}`)
            } else {
              process.stdout.write(event.chunk)
            }
          } else if (event.type === 'tool_start') {
            process.stdout.write(`\n  ${c.gray}▶ ${event.call.name}...${c.reset}`)
          } else if (event.type === 'tool_result') {
            const ok = event.result.success !== false
            process.stdout.write(` ${ok ? c.green + '✓' : c.yellow + '⚠'}${c.reset}\n`)
          } else if (event.type === 'error') {
            process.stderr.write(`\n${c.yellow}Agent error: ${event.error}${c.reset}\n`)
          }
        }
      } finally {
        mcpRegistry.disconnectAll()
      }

      process.stdout.write(`\n${c.green}✓${c.reset} ${c.gray}Team task complete${c.reset}\n\n`)
    })
}
