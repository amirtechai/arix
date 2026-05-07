/**
 * Predictive routing (P1) — pre-flight cost+latency estimate; auto-downgrade
 * a model when the predicted cost exceeds a threshold.
 */

import { ModelCatalogue } from '../registry/models.js'
import type { CatalogueEntry } from '../registry/models.js'

export interface RouteEstimate {
  provider: string
  model: string
  estInputTokens: number
  estOutputTokens: number
  estCostUsd: number
  estLatencyMs: number
}

export interface PredictiveRouteOptions {
  /** Approximate input tokens for the upcoming turn */
  estInputTokens: number
  /** Cap on output tokens the provider will return (used for upper-bound cost) */
  maxOutputTokens?: number
  /** Hard cap; if predicted cost exceeds, downgrade */
  thresholdUsd?: number
  /** Preferred (provider, model) — start here, downgrade if over budget */
  preferred: { provider: string; model: string }
  /** Allow downgrading across providers? Default false (only same provider). */
  crossProvider?: boolean
}

/** Heuristic: ~50 tokens/sec for "complex" tier, 120 for medium, 250 for simple. */
function estLatency(entry: CatalogueEntry, outputTokens: number): number {
  const tps = entry.tier === 'complex' ? 50 : entry.tier === 'medium' ? 120 : 250
  return Math.round((outputTokens / tps) * 1000) + 600 /* p50 cold-start */
}

function computeCost(entry: CatalogueEntry, inT: number, outT: number): number {
  if (!entry.pricing) return 0
  return (entry.pricing.input * inT + entry.pricing.output * outT) / 1_000_000
}

/**
 * Returns the chosen model + estimate. If `thresholdUsd` is set and the
 * preferred model exceeds it, picks the cheapest model whose tier is no
 * lower than the preferred (and still under threshold).
 */
export function predictiveRoute(opts: PredictiveRouteOptions): RouteEstimate {
  const all = ModelCatalogue.all()
  const preferred = all.find((e) => e.provider === opts.preferred.provider && e.id === opts.preferred.model)
  if (!preferred) {
    throw new Error(`Preferred model not found in catalogue: ${opts.preferred.provider}/${opts.preferred.model}`)
  }
  const outT = opts.maxOutputTokens ?? 2048
  const preferredCost = computeCost(preferred, opts.estInputTokens, outT)

  const buildEstimate = (e: CatalogueEntry): RouteEstimate => ({
    provider: e.provider,
    model: e.id,
    estInputTokens: opts.estInputTokens,
    estOutputTokens: outT,
    estCostUsd: computeCost(e, opts.estInputTokens, outT),
    estLatencyMs: estLatency(e, outT),
  })

  if (!opts.thresholdUsd || preferredCost <= opts.thresholdUsd) {
    return buildEstimate(preferred)
  }

  // Downgrade: same tier or one below, same provider unless crossProvider
  const TIER_RANK = { simple: 0, medium: 1, complex: 2 } as const
  const preferredRank = TIER_RANK[preferred.tier]
  const candidates = all
    .filter((e) => (opts.crossProvider ? true : e.provider === preferred.provider))
    .filter((e) => TIER_RANK[e.tier] <= preferredRank)
    .filter((e) => e.id !== preferred.id && e.pricing)
    .map(buildEstimate)
    .filter((e) => !opts.thresholdUsd || e.estCostUsd <= opts.thresholdUsd)
    .sort((a, b) => b.estCostUsd - a.estCostUsd) // pick the most expensive that fits

  return candidates[0] ?? buildEstimate(preferred)
}
