/**
 * CostTracker — real-time token + USD cost accounting per session.
 *
 * Tracks input/output tokens for every turn, calculates cumulative cost,
 * and persists a running ledger to ~/.arix/costs.json.
 *
 * Usage:
 *   const tracker = new CostTracker('anthropic', 'claude-sonnet-4-6')
 *   tracker.record(inputTokens, outputTokens)
 *   console.log(tracker.summary())  // { turns: 3, totalUsd: 0.0042, ... }
 */

import { writeFile, readFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { ModelCatalogue as ModelRegistry } from '../registry/models.js'

// ── Types ──────────────────────────────────────────────────────────────────

export interface TurnCost {
  ts: string
  inputTokens: number
  outputTokens: number
  usd: number | null
}

export interface SessionCost {
  sessionId: string
  provider: string
  model: string
  startedAt: string
  turns: TurnCost[]
  totalInputTokens: number
  totalOutputTokens: number
  totalUsd: number | null
}

export interface CostSummary {
  turns: number
  totalInputTokens: number
  totalOutputTokens: number
  totalUsd: number | null
  avgUsdPerTurn: number | null
  formatted: string
}

// ── CostTracker ────────────────────────────────────────────────────────────

export class CostTracker {
  private readonly session: SessionCost

  constructor(provider: string, model: string, sessionId?: string) {
    this.session = {
      sessionId: sessionId ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      provider,
      model,
      startedAt: new Date().toISOString(),
      turns: [],
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalUsd: null,
    }
  }

  /** Record tokens for one turn (one model response). */
  record(inputTokens: number, outputTokens: number): TurnCost {
    const usd = ModelRegistry.estimateCost(
      this.session.provider,
      this.session.model,
      inputTokens,
      outputTokens,
    )

    const turn: TurnCost = {
      ts: new Date().toISOString(),
      inputTokens,
      outputTokens,
      usd,
    }

    this.session.turns.push(turn)
    this.session.totalInputTokens += inputTokens
    this.session.totalOutputTokens += outputTokens

    if (usd !== null) {
      this.session.totalUsd = (this.session.totalUsd ?? 0) + usd
    }

    return turn
  }

  /** Current session summary. */
  summary(): CostSummary {
    const { turns, totalInputTokens, totalOutputTokens, totalUsd } = this.session
    const n = turns.length

    return {
      turns: n,
      totalInputTokens,
      totalOutputTokens,
      totalUsd,
      avgUsdPerTurn: totalUsd !== null && n > 0 ? totalUsd / n : null,
      formatted: this.format(),
    }
  }

  /** One-line status for TUI display, e.g. "↑12k ↓3k · $0.0042 · 4 turns" */
  format(): string {
    const { totalInputTokens, totalOutputTokens, totalUsd, turns } = this.session
    const tokens = `↑${fmtK(totalInputTokens)} ↓${fmtK(totalOutputTokens)}`
    const cost = totalUsd !== null ? ` · $${totalUsd.toFixed(4)}` : ''
    return `${tokens}${cost} · ${turns.length} turn${turns.length !== 1 ? 's' : ''}`
  }

  /** Provider + model being tracked. */
  get model(): string { return this.session.model }
  get provider(): string { return this.session.provider }
  get sessionId(): string { return this.session.sessionId }

  /** Persist this session to ~/.arix/costs.json (appends). */
  async persist(): Promise<void> {
    const dir = join(homedir(), '.arix')
    await mkdir(dir, { recursive: true })
    const path = join(dir, 'costs.json')

    let ledger: SessionCost[] = []
    try {
      const raw = await readFile(path, 'utf8')
      ledger = JSON.parse(raw) as SessionCost[]
    } catch { /* first run or corrupt */ }

    // Keep last 1000 sessions
    ledger.push(this.session)
    if (ledger.length > 1000) ledger = ledger.slice(-1000)

    await writeFile(path, JSON.stringify(ledger, null, 2), 'utf8')
  }

  /** Load all saved sessions. */
  static async loadLedger(): Promise<SessionCost[]> {
    const path = join(homedir(), '.arix', 'costs.json')
    try {
      const raw = await readFile(path, 'utf8')
      return JSON.parse(raw) as SessionCost[]
    } catch {
      return []
    }
  }

  /** Summarise total spend from the ledger. */
  static async totalSpend(): Promise<{ sessions: number; usd: number; formatted: string }> {
    const ledger = await this.loadLedger()
    const usd = ledger.reduce((acc, s) => acc + (s.totalUsd ?? 0), 0)
    return {
      sessions: ledger.length,
      usd,
      formatted: `$${usd.toFixed(4)} across ${ledger.length} session${ledger.length !== 1 ? 's' : ''}`,
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function fmtK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}k`
  return String(n)
}
