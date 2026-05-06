import type { Command } from 'commander'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { ConfigManager } from '@arix/core'

type Goal = 'coding' | 'speed' | 'cost' | 'local' | 'reasoning'

interface ProfileRecommendation {
  provider: string
  model: string
  reason: string
}

const RECOMMENDATIONS: Record<Goal, ProfileRecommendation> = {
  coding: {
    provider: 'anthropic',
    model: 'anthropic/claude-sonnet-4-6',
    reason: 'Best code quality + tool use, excellent instruction following',
  },
  reasoning: {
    provider: 'openrouter',
    model: 'openrouter/deepseek/r1',
    reason: 'Chain-of-thought reasoning, strong at complex analysis (low cost)',
  },
  speed: {
    provider: 'anthropic',
    model: 'anthropic/claude-haiku-4-5',
    reason: 'Fastest response, good for simple completions and quick tasks',
  },
  cost: {
    provider: 'openrouter',
    model: 'openrouter/google/gemini-flash-1.5',
    reason: 'Very low cost per token, adequate for most tasks',
  },
  local: {
    provider: 'ollama',
    model: 'ollama/qwen2.5-coder:7b',
    reason: 'Runs locally — no API cost, no data leaves your machine',
  },
}

export function registerProfile(program: Command): void {
  const profileCmd = program
    .command('profile')
    .description('Manage model profiles')

  profileCmd
    .command('recommend')
    .description('Get a model recommendation for your goal')
    .option('--goal <goal>', 'Goal: coding | speed | cost | local | reasoning (default: coding)')
    .action(async (opts: Record<string, unknown>) => {
      const goal = (opts['goal'] as Goal | undefined) ?? 'coding'
      const rec = RECOMMENDATIONS[goal]
      if (!rec) {
        console.error(`Unknown goal: ${goal}. Valid: coding, speed, cost, local, reasoning`)
        process.exitCode = 1
        return
      }

      console.log(`\nRecommended profile for goal: ${goal}\n`)
      console.log(`  Provider : ${rec.provider}`)
      console.log(`  Model    : ${rec.model}`)
      console.log(`  Reason   : ${rec.reason}`)
      console.log(`\nApply with: arix profile apply --goal ${goal}`)
      console.log()
    })

  profileCmd
    .command('apply')
    .description('Apply a recommended profile to your config')
    .option('--goal <goal>', 'Goal: coding | speed | cost | local | reasoning')
    .action(async (opts: Record<string, unknown>) => {
      const goal = (opts['goal'] as Goal | undefined) ?? 'coding'
      const rec = RECOMMENDATIONS[goal]
      if (!rec) {
        console.error(`Unknown goal: ${goal}`)
        process.exitCode = 1
        return
      }

      const configMgr = new ConfigManager(join(homedir(), '.arix'))
      await configMgr.set('provider', rec.provider)
      await configMgr.set('model', rec.model)
      console.log(`Profile applied: provider=${rec.provider}, model=${rec.model}`)
    })

  profileCmd
    .command('list')
    .description('List all available profiles')
    .action(() => {
      console.log('\nAvailable profiles:\n')
      for (const [goal, rec] of Object.entries(RECOMMENDATIONS)) {
        console.log(`  ${goal.padEnd(12)}  ${rec.model}`)
        console.log(`  ${''.padEnd(12)}  ${rec.reason}`)
        console.log()
      }
    })
}
