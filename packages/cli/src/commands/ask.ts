/**
 * arix ask — single-shot question with optional parallel multi-model comparison
 *
 *   arix ask "What is 2+2?"                    # single model
 *   arix ask --parallel "Explain recursion"    # 3 models answer simultaneously
 *   arix ask --models gpt-4o,claude-3-5-sonnet-20241022,gemini-1.5-pro "Compare these answers"
 */

import type { Command } from 'commander'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { bootstrap } from '../bootstrap.js'
import { ConfigManager, ModelCatalogue, AgentLoop } from '@arix-code/core'
import { ProviderFactory } from '@arix-code/providers'

const isTTY = process.stdout.isTTY

const c = {
  reset:   isTTY ? '\x1b[0m'  : '',
  bold:    isTTY ? '\x1b[1m'  : '',
  dim:     isTTY ? '\x1b[2m'  : '',
  cyan:    isTTY ? '\x1b[36m' : '',
  green:   isTTY ? '\x1b[32m' : '',
  yellow:  isTTY ? '\x1b[33m' : '',
  blue:    isTTY ? '\x1b[34m' : '',
  magenta: isTTY ? '\x1b[35m' : '',
  gray:    isTTY ? '\x1b[90m' : '',
}

const MODEL_COLORS = [c.cyan, c.green, c.yellow, c.magenta]

// Diverse set: pick best medium-tier model from 3 different providers
// when API keys are available. Falls back gracefully.
function buildDefaultParallelModels(): Array<{ provider: string; model: string }> {
  const candidates: Array<{ provider: string; tier: 'medium' | 'complex' | 'simple' }> = [
    { provider: 'anthropic', tier: 'medium' },
    { provider: 'openai',    tier: 'medium' },
    { provider: 'openrouter', tier: 'medium' },
    { provider: 'gemini',    tier: 'medium' },
  ]
  return candidates.flatMap(({ provider, tier }) => {
    const best = ModelCatalogue.recommend({ providers: [provider], tier, requireTools: true })
    return best ? [{ provider, model: best.id }] : []
  }).slice(0, 3)
}

export function registerAsk(program: Command): void {
  program
    .command('ask <question>')
    .description('Ask a single question (use --parallel for multi-model comparison)')
    .option('-p, --provider <provider>', 'Provider to use')
    .option('-m, --model <model>', 'Model to use')
    .option('--parallel', 'Ask 3 models simultaneously and compare answers')
    .option('--models <models>', 'Comma-separated provider:model pairs for parallel mode')
    .option('--no-label', 'Hide model labels in parallel output')
    .action(async (question: string, opts: Record<string, unknown>) => {
      const isParallel = opts['parallel'] as boolean | undefined
      const modelsOpt = opts['models'] as string | undefined
      const showLabels = opts['label'] !== false

      if (isParallel) {
        await runParallel(question, modelsOpt, showLabels)
      } else {
        await runSingle(question, opts)
      }
    })
}

// ── Single model ──────────────────────────────────────────────────────────────

async function runSingle(question: string, opts: Record<string, unknown>): Promise<void> {
  const cwd = process.cwd()
  const { loop, mcpRegistry } = await bootstrap(cwd, undefined, {
    ...(opts['provider'] ? { provider: opts['provider'] as string } : {}),
    ...(opts['model'] ? { model: opts['model'] as string } : {}),
  })

  try {
    for await (const event of loop.run(question)) {
      if (event.type === 'text') process.stdout.write(event.chunk)
      if (event.type === 'done') process.stdout.write('\n')
      if (event.type === 'error') {
        process.stderr.write(`Error: ${event.error}\n`)
        process.exitCode = 1
      }
    }
  } finally {
    mcpRegistry.disconnectAll()
  }
}

// ── Parallel multi-model ──────────────────────────────────────────────────────

async function runParallel(question: string, modelsOpt: string | undefined, showLabels: boolean): Promise<void> {
  const configDir = join(homedir(), '.arix')
  const configManager = new ConfigManager(configDir)
  const config = await configManager.load()

  const configuredProvider = config.provider ?? 'anthropic'

  // Parse models from CLI or use defaults
  const targets = modelsOpt
    ? modelsOpt.split(',').map((s) => {
        const [p, m] = s.trim().split(':')
        return { provider: p ?? configuredProvider, model: m ?? s.trim() }
      })
    : buildDefaultParallelModels()

  // Resolve available targets (skip if API key missing)
  const available = targets.filter(({ provider }) => {
    if (provider === 'ollama') return true
    const keyEnv: Record<string, string> = {
      anthropic: 'ARIX_ANTHROPIC_KEY',
      openai:    'ARIX_OPENAI_KEY',
      openrouter: 'ARIX_OPENROUTER_KEY',
      gemini:    'ARIX_GEMINI_KEY',
    }
    const envVar = keyEnv[provider]
    return !envVar || !!process.env[envVar]
  })

  if (available.length === 0) {
    process.stderr.write('No providers available. Set ARIX_ANTHROPIC_KEY or similar.\n')
    process.exitCode = 1
    return
  }

  if (showLabels) {
    process.stdout.write(`\n${c.bold}Asking ${available.length} models in parallel...${c.reset}\n\n`)
    process.stdout.write('─'.repeat(60) + '\n')
  }

  const results = await Promise.allSettled(
    available.map(async ({ provider, model }, i) => {
      const color = MODEL_COLORS[i % MODEL_COLORS.length] ?? c.cyan
      const label = `${model} (${provider})`
      let output = ''

      try {
        const apiKey = configManager.resolveApiKey(provider)
        const prov = ProviderFactory.create(provider, apiKey ? { apiKey } : {})
        const loop = new AgentLoop({ provider: prov, model, maxTurns: 1 })

        for await (const event of loop.run(question)) {
          if (event.type === 'text') output += event.chunk
        }
      } catch (err) {
        output = `Error: ${err instanceof Error ? err.message : String(err)}`
      }

      return { label, output, color }
    }),
  )

  // Display results
  for (const r of results) {
    if (r.status === 'fulfilled') {
      const { label, output, color } = r.value
      if (showLabels) {
        process.stdout.write(`\n${color}${c.bold}[${label}]${c.reset}\n`)
      }
      process.stdout.write(output.trim() + '\n')
      if (showLabels) process.stdout.write('─'.repeat(60) + '\n')
    } else {
      if (showLabels) process.stdout.write(`\n${c.gray}[failed: ${r.reason}]${c.reset}\n`)
    }
  }

  process.stdout.write('\n')
}
