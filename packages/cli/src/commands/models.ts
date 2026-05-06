/**
 * arix models — browse and compare all available models
 *
 * Usage:
 *   arix models list                    # all models, all providers
 *   arix models list --provider openai  # filter by provider
 *   arix models list --tier complex     # filter by capability tier
 *   arix models recommend --tier medium # suggest cheapest model for task
 *   arix models cost gpt-4o 10000 2000  # estimate cost for token counts
 */

import type { Command } from 'commander'
import { ModelCatalogue as ModelRegistry, type TaskTier } from "@arix/core"

const TIER_EMOJI: Record<TaskTier, string> = { simple: '⚡', medium: '🔧', complex: '🧠' }

export function registerModels(program: Command): void {
  const cmd = program
    .command('models')
    .description('Browse and compare all available models')

  // ── models list ─────────────────────────────────────────────────────────
  cmd
    .command('list')
    .description('List all models')
    .option('--provider <name>', 'Filter by provider')
    .option('--tier <tier>', 'Filter by tier: simple | medium | complex')
    .action((opts: { provider?: string; tier?: string }) => {
      let models = ModelRegistry.all()

      if (opts.provider) {
        models = models.filter((m) => m.provider === opts.provider)
      }
      if (opts.tier) {
        models = models.filter((m) => m.tier === opts.tier)
      }

      if (models.length === 0) {
        console.log('No models match the given filters.')
        return
      }

      // Group by provider
      const byProvider = models.reduce<Record<string, typeof models>>((acc, m) => {
        acc[m.provider] ??= []
        acc[m.provider]!.push(m)
        return acc
      }, {})

      for (const [provider, provModels] of Object.entries(byProvider)) {
        console.log(`\n${provider.toUpperCase()}`)
        console.log('─'.repeat(70))

        for (const m of provModels) {
          const tier = TIER_EMOJI[m.tier]
          const ctx = fmtCtx(m.contextLength)
          const price = m.pricing
            ? `$${m.pricing.input.toFixed(3)}/$${m.pricing.output.toFixed(3)}`
            : 'free'
          const tools = m.supportsTools ? '🔨' : '  '
          const vision = m.supportsVision ? '👁' : ' '
          console.log(
            `  ${tier} ${tools}${vision}  ${m.id.padEnd(50)} ${ctx.padEnd(8)} ${price}`
          )
        }
      }

      console.log(`\nTotal: ${models.length} models across ${Object.keys(byProvider).length} providers`)
      console.log('Tiers: ⚡ simple  🔧 medium  🧠 complex | 🔨 tools  👁 vision')
      console.log('Price: $input/$output per 1M tokens')
    })

  // ── models recommend ────────────────────────────────────────────────────
  cmd
    .command('recommend')
    .description('Recommend cheapest model for a task')
    .option('--tier <tier>', 'Task complexity: simple | medium | complex', 'medium')
    .option('--provider <name>', 'Restrict to provider(s), comma-separated')
    .option('--tools', 'Must support tool use')
    .option('--vision', 'Must support vision')
    .option('--context <tokens>', 'Minimum context length required')
    .option('--budget <usd>', 'Max input cost per 1M tokens (USD)')
    .action((opts: {
      tier: string
      provider?: string
      tools?: boolean
      vision?: boolean
      context?: string
      budget?: string
    }) => {
      const providers = opts.provider ? opts.provider.split(',') : undefined

      const model = ModelRegistry.recommend({
        tier: (opts.tier as TaskTier) ?? 'medium',
        ...(providers !== undefined ? { providers } : {}),
        ...(opts.tools !== undefined ? { requireTools: opts.tools } : {}),
        ...(opts.vision !== undefined ? { requireVision: opts.vision } : {}),
        ...(opts.context ? { minContext: parseInt(opts.context, 10) } : {}),
        ...(opts.budget ? { maxInputCostPerMillion: parseFloat(opts.budget) } : {}),
      })

      if (!model) {
        console.log('No model found matching these constraints.')
        return
      }

      const price = model.pricing
        ? ModelRegistry.formatPrice(model.pricing)
        : 'free (local)'

      console.log(`\nRecommended: ${model.name}`)
      console.log(`  Provider  : ${model.provider}`)
      console.log(`  Model ID  : ${model.id}`)
      console.log(`  Tier      : ${model.tier}`)
      console.log(`  Context   : ${fmtCtx(model.contextLength)}`)
      console.log(`  Price     : ${price}`)
      console.log(`  Tools     : ${model.supportsTools ? 'yes' : 'no'}`)
      console.log(`  Vision    : ${model.supportsVision ? 'yes' : 'no'}`)
    })

  // ── models cost ─────────────────────────────────────────────────────────
  cmd
    .command('cost <model-id> <input-tokens> <output-tokens>')
    .description('Estimate cost for a model and token counts')
    .option('--provider <name>', 'Provider name (e.g. anthropic, openai, gemini, ollama)')
    .action((modelId: string, inputStr: string, outputStr: string, opts: { provider: string }) => {
      const input = parseInt(inputStr, 10)
      const output = parseInt(outputStr, 10)

      const cost = ModelRegistry.estimateCost(opts.provider, modelId, input, output)
      if (cost === null) {
        console.log(`No pricing data for ${opts.provider}/${modelId}`)
        return
      }

      console.log(`\nCost estimate for ${modelId}:`)
      console.log(`  Input  tokens: ${input.toLocaleString()}`)
      console.log(`  Output tokens: ${output.toLocaleString()}`)
      console.log(`  Total cost   : $${cost.toFixed(6)} USD`)
    })
}

function fmtCtx(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}k`
  return String(n)
}
