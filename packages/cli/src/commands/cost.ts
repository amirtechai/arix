/**
 * arix cost — session cost history, spending summary, and optimization
 *
 * Usage:
 *   arix cost show              # total spend summary
 *   arix cost history           # last N sessions
 *   arix cost reset             # clear cost ledger
 *   arix cost models            # pricing table for all models
 *   arix cost optimize          # analyze history and suggest savings
 *   arix cost compare <prompt>  # compare models side-by-side for a prompt
 */

import type { Command } from 'commander'
import { CostTracker, ModelCatalogue } from '@arix/core'

export function registerCost(program: Command): void {
  const cmd = program
    .command('cost')
    .description('Show AI usage costs and spending history')

  cmd
    .command('show')
    .description('Show total spend summary')
    .action(async () => {
      const summary = await CostTracker.totalSpend()
      if (summary.sessions === 0) {
        console.log('No cost data yet. Start a chat session to track spending.')
        return
      }
      console.log(`\nTotal spend: ${summary.formatted}`)
    })

  cmd
    .command('history')
    .description('Show recent session costs')
    .option('-n <count>', 'Number of sessions to show', '20')
    .action(async (opts: { n: string }) => {
      const n = parseInt(opts.n, 10)
      const ledger = await CostTracker.loadLedger()

      if (ledger.length === 0) {
        console.log('No cost history found.')
        return
      }

      const recent = ledger.slice(-n).reverse()
      console.log(`\nRecent ${recent.length} session${recent.length !== 1 ? 's' : ''}:\n`)
      console.log('Date'.padEnd(22) + 'Provider/Model'.padEnd(40) + 'Turns'.padEnd(8) + 'Cost')
      console.log('─'.repeat(80))

      for (const s of recent) {
        const date = new Date(s.startedAt).toLocaleString()
        const pm = `${s.provider}/${s.model}`.slice(0, 38)
        const cost = s.totalUsd !== null ? `$${s.totalUsd.toFixed(4)}` : 'unknown'
        console.log(date.padEnd(22) + pm.padEnd(40) + String(s.turns.length).padEnd(8) + cost)
      }

      const total = recent.reduce((acc, s) => acc + (s.totalUsd ?? 0), 0)
      console.log('─'.repeat(80))
      console.log(`Total for shown sessions: $${total.toFixed(4)}`)
    })

  cmd
    .command('reset')
    .description('Clear all cost history')
    .action(async () => {
      const { writeFile } = await import('node:fs/promises')
      const { join } = await import('node:path')
      const { homedir } = await import('node:os')
      await writeFile(join(homedir(), '.arix', 'costs.json'), '[]', 'utf8')
      console.log('Cost history cleared.')
    })

  // ── breakdown: by-model or by-day with ASCII bar chart ──────────────────
  cmd
    .command('breakdown')
    .description('Spending breakdown with ASCII bar chart')
    .option('--by-model', 'Group by model (default)')
    .option('--by-day', 'Group by calendar day')
    .option('-n <days>', 'Limit to last N days (with --by-day)', '30')
    .action(async (opts: { byModel?: boolean; byDay?: boolean; n: string }) => {
      const ledger = await CostTracker.loadLedger()
      if (ledger.length === 0) { console.log('No cost data yet.'); return }

      const useByDay = opts.byDay === true

      if (useByDay) {
        const days = parseInt(opts.n, 10)
        const byDay = new Map<string, number>()
        for (const s of ledger) {
          const day = s.startedAt.slice(0, 10)
          byDay.set(day, (byDay.get(day) ?? 0) + (s.totalUsd ?? 0))
        }
        const sorted = [...byDay.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .slice(-days)

        const maxVal = Math.max(...sorted.map(([, v]) => v), 0.000_01)
        const BAR_WIDTH = 40

        console.log(`\nDaily spend (last ${sorted.length} days):\n`)
        let grandTotal = 0
        for (const [day, usd] of sorted) {
          grandTotal += usd
          const bars = Math.round((usd / maxVal) * BAR_WIDTH)
          const bar = '█'.repeat(bars) + '░'.repeat(BAR_WIDTH - bars)
          console.log(`${day}  ${bar}  $${usd.toFixed(4)}`)
        }
        console.log(`\nTotal: $${grandTotal.toFixed(4)}`)
      } else {
        // By model
        const byModel = new Map<string, { usd: number; sessions: number; input: number; output: number }>()
        for (const s of ledger) {
          const key = `${s.provider}/${s.model}`
          const cur = byModel.get(key) ?? { usd: 0, sessions: 0, input: 0, output: 0 }
          cur.usd += s.totalUsd ?? 0
          cur.sessions += 1
          cur.input += s.totalInputTokens
          cur.output += s.totalOutputTokens
          byModel.set(key, cur)
        }
        const sorted = [...byModel.entries()].sort((a, b) => b[1].usd - a[1].usd)
        const maxVal = Math.max(...sorted.map(([, v]) => v.usd), 0.000_01)
        const BAR_WIDTH = 30

        console.log('\nSpend by model:\n')
        let grandTotal = 0
        for (const [model, stats] of sorted) {
          grandTotal += stats.usd
          const bars = Math.round((stats.usd / maxVal) * BAR_WIDTH)
          const bar = '█'.repeat(bars) + '░'.repeat(BAR_WIDTH - bars)
          const label = model.slice(0, 36).padEnd(36)
          console.log(`${label}  ${bar}  $${stats.usd.toFixed(4)}  (${stats.sessions} sessions)`)
        }
        console.log(`\nTotal: $${grandTotal.toFixed(4)}`)
      }
    })

  // ── models: pricing table ────────────────────────────────────────────────
  cmd
    .command('models')
    .description('Show pricing table for all known models')
    .option('--tier <tier>', 'Filter by tier: simple, medium, complex')
    .option('--provider <name>', 'Filter by provider')
    .option('--tools', 'Only show models that support tool calling')
    .action((opts: { tier?: string; provider?: string; tools?: boolean }) => {
      let models = ModelCatalogue.all().filter((m) => m.pricing)
      if (opts.tier) models = models.filter((m) => m.tier === opts.tier)
      if (opts.provider) models = models.filter((m) => m.provider === opts.provider)
      if (opts.tools) models = models.filter((m) => m.supportsTools)

      // Sort by combined cost ascending
      models.sort((a, b) => {
        const ca = (a.pricing!.input + a.pricing!.output) / 2
        const cb = (b.pricing!.input + b.pricing!.output) / 2
        return ca - cb
      })

      const COL = { name: 38, provider: 12, tier: 9, input: 12, output: 12, ctx: 10 }
      const header = [
        'Model'.padEnd(COL.name),
        'Provider'.padEnd(COL.provider),
        'Tier'.padEnd(COL.tier),
        'Input/1M'.padEnd(COL.input),
        'Output/1M'.padEnd(COL.output),
        'Context',
      ].join('')

      console.log(`\n${header}`)
      console.log('─'.repeat(95))

      for (const m of models) {
        const p = m.pricing!
        const fmtPrice = (n: number) => n === 0 ? 'free'.padEnd(COL.input - 2) : `$${n.toFixed(3)}`.padEnd(COL.input - 2)
        const ctx = m.contextLength >= 1_000_000 ? `${m.contextLength / 1_000_000}M` : `${m.contextLength / 1_000}K`
        console.log([
          m.name.slice(0, COL.name - 2).padEnd(COL.name),
          m.provider.padEnd(COL.provider),
          m.tier.padEnd(COL.tier),
          fmtPrice(p.input),
          fmtPrice(p.output),
          ctx,
        ].join(''))
      }
      console.log(`\n${models.length} models shown. Use --tier, --provider, --tools to filter.`)
    })

  // ── optimize: analyze history and suggest cheaper alternatives ──────────
  cmd
    .command('optimize')
    .description('Analyze spending history and suggest cheaper alternatives')
    .action(async () => {
      const ledger = await CostTracker.loadLedger()
      if (ledger.length === 0) {
        console.log('No cost history. Start a chat session first.')
        return
      }

      // Aggregate by provider+model
      type ModelAgg = { provider: string; model: string; totalUsd: number; totalInput: number; totalOutput: number; sessions: number }
      const agg = new Map<string, ModelAgg>()
      for (const s of ledger) {
        if (!s.totalUsd) continue
        const key = `${s.provider}/${s.model}`
        const existing = agg.get(key) ?? { provider: s.provider, model: s.model, totalUsd: 0, totalInput: 0, totalOutput: 0, sessions: 0 }
        existing.totalUsd += s.totalUsd
        existing.totalInput += s.totalInputTokens
        existing.totalOutput += s.totalOutputTokens
        existing.sessions += 1
        agg.set(key, existing)
      }

      if (agg.size === 0) {
        console.log('No sessions with cost data found.')
        return
      }

      console.log('\n📊 Spending by model:\n')
      let totalSpend = 0
      let totalSavings = 0

      for (const entry of [...agg.values()].sort((a, b) => b.totalUsd - a.totalUsd)) {
        totalSpend += entry.totalUsd
        console.log(`  ${entry.provider}/${entry.model}`)
        console.log(`    Sessions: ${entry.sessions}  |  Tokens: ${entry.totalInput.toLocaleString()} in / ${entry.totalOutput.toLocaleString()} out`)
        console.log(`    Spent: $${entry.totalUsd.toFixed(4)}`)

        // Find the cheapest alternative at same tier with tools support
        const current = ModelCatalogue.get(entry.provider, entry.model)
        const tier = current?.tier ?? 'medium'
        const cheaper = ModelCatalogue.recommend({
          tier,
          requireTools: current?.supportsTools ?? false,
          maxInputCostPerMillion: (current?.pricing?.input ?? Infinity) - 0.001,
        })

        if (cheaper && cheaper.pricing) {
          const savedUsd = entry.totalUsd - ModelCatalogue.estimateCost(
            cheaper.provider, cheaper.id, entry.totalInput, entry.totalOutput,
          )!
          if (savedUsd > 0) {
            totalSavings += savedUsd
            console.log(`    💡 Switch to ${cheaper.provider}/${cheaper.id} → save ~$${savedUsd.toFixed(4)}`)
          }
        }
        console.log()
      }

      console.log(`Total spend: $${totalSpend.toFixed(4)}`)
      if (totalSavings > 0) {
        const pct = Math.round((totalSavings / totalSpend) * 100)
        console.log(`Potential savings: $${totalSavings.toFixed(4)} (${pct}% reduction) by switching models`)
      } else {
        console.log('You are already using cost-optimal cloud models. ✓')
      }

      // Y27: suggest local Ollama for simple-tier sessions
      const hasSimpleSessions = [...agg.values()].some((e) => {
        const m = ModelCatalogue.get(e.provider, e.model)
        return m?.tier === 'simple' && e.totalUsd > 0
      })
      if (hasSimpleSessions) {
        console.log('\n💡 Tip: Use --profile local or --provider ollama for simple tasks → free, runs on your machine')
        console.log('   arix config set profile budget  ← auto-routes simple tasks to Ollama')
      }
    })

  // ── compare: estimate cost for a prompt across multiple models ───────────
  cmd
    .command('compare <prompt>')
    .description('Estimate cost for a prompt across models')
    .option('--tier <tier>', 'Model tier to compare: simple, medium, complex', 'medium')
    .option('--output-tokens <n>', 'Estimated output tokens', '500')
    .action((prompt: string, opts: { tier: string; outputTokens: string }) => {
      // Rough token estimate: ~4 chars per token
      const inputTokens = Math.ceil(prompt.length / 4)
      const outputTokens = parseInt(opts.outputTokens, 10)

      const models = ModelCatalogue.all().filter(
        (m) => m.pricing && m.tier === opts.tier && m.supportsTools,
      ).sort((a, b) => {
        const ca = ModelCatalogue.estimateCost(a.provider, a.id, inputTokens, outputTokens) ?? Infinity
        const cb = ModelCatalogue.estimateCost(b.provider, b.id, inputTokens, outputTokens) ?? Infinity
        return ca - cb
      })

      console.log(`\nCost estimate: ~${inputTokens} input + ${outputTokens} output tokens`)
      console.log(`Tier: ${opts.tier} | ${models.length} models\n`)
      console.log('Model'.padEnd(40) + 'Provider'.padEnd(14) + 'Est. Cost')
      console.log('─'.repeat(72))

      for (const m of models) {
        const cost = ModelCatalogue.estimateCost(m.provider, m.id, inputTokens, outputTokens)
        const costStr = cost === 0 ? 'free (local)' : cost !== null ? `$${cost.toFixed(6)}` : 'unknown'
        console.log(m.name.slice(0, 38).padEnd(40) + m.provider.padEnd(14) + costStr)
      }
    })
}
