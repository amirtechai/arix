/**
 * Cost reporting helpers (P2, P3, P6).
 *
 *   bySkill()         — per-skill aggregation (requires labelled sessions)
 *   regression()      — week-over-week alert if spend > 2× prior week
 *   tokenPreflight()  — pre-flight estimate before sending a turn
 */

import { CostTracker } from './index.js'
import type { SessionCost } from './index.js'
import { ModelCatalogue } from '../registry/models.js'

export interface SkillCostRow {
  skill: string
  sessions: number
  inputTokens: number
  outputTokens: number
  totalUsd: number
  avgUsdPerSession: number
}

/**
 * Group ledger sessions by skill name (set as a tag on SessionCost). Sessions
 * without a skill tag are bucketed under '(unlabelled)'.
 */
export function bySkill(ledger: Array<SessionCost & { skill?: string }>): SkillCostRow[] {
  const buckets = new Map<string, SkillCostRow>()
  for (const s of ledger) {
    const key = s.skill ?? '(unlabelled)'
    const row = buckets.get(key) ?? {
      skill: key, sessions: 0, inputTokens: 0, outputTokens: 0, totalUsd: 0, avgUsdPerSession: 0,
    }
    row.sessions++
    row.inputTokens += s.totalInputTokens
    row.outputTokens += s.totalOutputTokens
    row.totalUsd += s.totalUsd ?? 0
    buckets.set(key, row)
  }
  for (const row of buckets.values()) {
    row.avgUsdPerSession = row.sessions === 0 ? 0 : row.totalUsd / row.sessions
  }
  return [...buckets.values()].sort((a, b) => b.totalUsd - a.totalUsd)
}

export interface RegressionResult {
  alert: boolean
  thisWeekUsd: number
  priorWeekUsd: number
  multiplier: number
  reason?: string
}

/** Alert when the most recent 7-day window exceeds the prior 7-day window by `factor`. */
export function regression(ledger: SessionCost[], opts: { factor?: number; now?: Date } = {}): RegressionResult {
  const factor = opts.factor ?? 2
  const now = opts.now ?? new Date()
  const sevenDays = 7 * 24 * 60 * 60 * 1000
  const cutoff1 = new Date(now.getTime() - sevenDays)
  const cutoff2 = new Date(now.getTime() - 2 * sevenDays)

  let thisWeek = 0, priorWeek = 0
  for (const s of ledger) {
    const ts = new Date(s.startedAt)
    const usd = s.totalUsd ?? 0
    if (ts >= cutoff1 && ts <= now) thisWeek += usd
    else if (ts >= cutoff2 && ts < cutoff1) priorWeek += usd
  }
  const multiplier = priorWeek === 0 ? (thisWeek > 0 ? Infinity : 0) : thisWeek / priorWeek
  const alert = priorWeek > 0 && multiplier >= factor
  return {
    alert,
    thisWeekUsd: thisWeek,
    priorWeekUsd: priorWeek,
    multiplier,
    ...(alert ? { reason: `Spend rose ${multiplier.toFixed(2)}× from $${priorWeek.toFixed(2)} to $${thisWeek.toFixed(2)} (threshold ${factor}×)` } : {}),
  }
}

export interface PreflightEstimate {
  estInputTokens: number
  maxOutputTokens: number
  estCostUsd: number | null
  /** rough char-to-token ratio used (~4 chars/token) */
  ratio: number
}

/**
 * Compute a pre-flight token + cost estimate for a planned turn. Cheap and
 * deterministic — useful for surfacing "this turn will cost ~$X" before the
 * agent commits to the call.
 */
export function tokenPreflight(opts: {
  prompt: string
  systemPrompt?: string
  contextChars?: number
  maxOutputTokens: number
  provider: string
  model: string
}): PreflightEstimate {
  const ratio = 4
  const chars = opts.prompt.length + (opts.systemPrompt?.length ?? 0) + (opts.contextChars ?? 0)
  const estInputTokens = Math.ceil(chars / ratio)

  const entry = ModelCatalogue.all().find((m) => m.provider === opts.provider && m.id === opts.model)
  const cost = entry?.pricing
    ? (entry.pricing.input * estInputTokens + entry.pricing.output * opts.maxOutputTokens) / 1_000_000
    : null

  return {
    estInputTokens,
    maxOutputTokens: opts.maxOutputTokens,
    estCostUsd: cost,
    ratio,
  }
}

export { CostTracker }
