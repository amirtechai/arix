import type { CostTracker } from '../cost/index.js'

/**
 * Hard kill-switch for cost or token limits. Wraps a CostTracker and a max
 * dollar budget; throws BudgetExceededError as soon as a record() pushes the
 * session above the cap. The agent loop catches this and stops gracefully.
 */
export class BudgetExceededError extends Error {
  override readonly name = 'BudgetExceededError'
  constructor(public readonly limitUsd: number, public readonly spentUsd: number) {
    super(`Budget exceeded: $${spentUsd.toFixed(4)} > $${limitUsd.toFixed(4)}`)
  }
}

export interface HardBudgetOptions {
  /** Max session spend in USD (inclusive — first record that crosses it throws) */
  maxUsd: number
  /** Optional warning threshold (0..1) — fires once via onWarn */
  warnAt?: number
  onWarn?: (spentUsd: number, limitUsd: number) => void
}

export class HardBudget {
  private warned = false
  constructor(private readonly tracker: CostTracker, private readonly opts: HardBudgetOptions) {}

  /** Call after every cost record. Throws if over budget. */
  check(): void {
    const summary = this.tracker.summary()
    const spent = summary.totalUsd ?? 0
    if (this.opts.warnAt && !this.warned && spent >= this.opts.maxUsd * this.opts.warnAt) {
      this.warned = true
      this.opts.onWarn?.(spent, this.opts.maxUsd)
    }
    if (spent >= this.opts.maxUsd) {
      throw new BudgetExceededError(this.opts.maxUsd, spent)
    }
  }
}
