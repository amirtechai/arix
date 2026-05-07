/**
 * Cost arbitrage (K1) — score candidate (provider, model) pairs by quality/cost
 * trade-off and pick the cheapest one whose quality stays within the user's
 * tolerance for a specific task tier.
 */

import type { TaskTier } from '../registry/models.js'

export interface ArbitrageCandidate {
  provider: string
  model: string
  /** USD per million input tokens */
  inputUsdPerM: number
  /** USD per million output tokens */
  outputUsdPerM: number
  /** Quality score on a 0..1 scale for the relevant tier (subjective) */
  quality: number
  /** Throughput tokens/sec (optional; used for fast tier) */
  tokensPerSec?: number
}

export interface ArbitrageOptions {
  tier: TaskTier
  /** Estimated input/output for this turn — used to score $$ */
  estInputTokens: number
  estOutputTokens: number
  /** 0..1 — how much quality we're willing to lose. 0.05 = up to 5% drop OK */
  qualityTolerance?: number
  /** Strong preference baseline; arbitrage compares others against it */
  preferred?: { provider: string; model: string }
}

export interface ArbitrageDecision {
  chosen: ArbitrageCandidate
  reason: string
  estCostUsd: number
  savedVsPreferredUsd?: number
  qualityDelta?: number
}

function estCost(c: ArbitrageCandidate, inT: number, outT: number): number {
  return (c.inputUsdPerM * inT + c.outputUsdPerM * outT) / 1_000_000
}

/**
 * Pick the cheapest candidate whose quality stays within tolerance of the
 * preferred candidate. Falls back to the highest-quality option if no
 * candidate meets the tolerance.
 */
export function chooseArbitrage(
  candidates: ArbitrageCandidate[],
  opts: ArbitrageOptions,
): ArbitrageDecision {
  if (candidates.length === 0) throw new Error('No candidates supplied to chooseArbitrage')

  const tolerance = opts.qualityTolerance ?? 0.05
  const preferred =
    (opts.preferred &&
      candidates.find((c) => c.provider === opts.preferred!.provider && c.model === opts.preferred!.model)) ||
    [...candidates].sort((a, b) => b.quality - a.quality)[0]!

  const minAcceptableQuality = preferred.quality * (1 - tolerance)
  const eligible = candidates.filter((c) => c.quality >= minAcceptableQuality)
  const ranked = (eligible.length > 0 ? eligible : candidates).slice().sort((a, b) => {
    const ca = estCost(a, opts.estInputTokens, opts.estOutputTokens)
    const cb = estCost(b, opts.estInputTokens, opts.estOutputTokens)
    return ca - cb
  })

  const chosen = ranked[0]!
  const cost = estCost(chosen, opts.estInputTokens, opts.estOutputTokens)
  const preferredCost = estCost(preferred, opts.estInputTokens, opts.estOutputTokens)

  const sameAsPreferred = chosen.provider === preferred.provider && chosen.model === preferred.model
  return {
    chosen,
    reason: sameAsPreferred
      ? 'preferred remained cheapest within quality budget'
      : `swapped ${preferred.provider}/${preferred.model} → ${chosen.provider}/${chosen.model} (saved $${(preferredCost - cost).toFixed(4)} at -${((preferred.quality - chosen.quality) * 100).toFixed(1)}% quality)`,
    estCostUsd: cost,
    ...(sameAsPreferred ? {} : { savedVsPreferredUsd: preferredCost - cost, qualityDelta: chosen.quality - preferred.quality }),
  }
}
