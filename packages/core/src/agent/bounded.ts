/**
 * Cost-bounded execution (R3) — combines HardBudget with a "best-effort
 * checkpoint" guarantee: the agent is told via system context how much
 * budget is left, and BudgetExceededError causes a graceful stop with the
 * partial result intact.
 *
 * This module provides the system-prompt fragment and the budget tracker.
 */

import { CostTracker } from '../cost/index.js'
import { HardBudget } from './budget.js'

export interface BoundedRunOptions {
  /** Provider id used by the CostTracker */
  provider: string
  /** Model id */
  model: string
  /** USD cap; the agent stops gracefully when crossed */
  maxUsd: number
  /** Warn when this fraction is reached (e.g. 0.8) */
  warnAt?: number
}

export interface BoundedRunHandle {
  tracker: CostTracker
  budget: HardBudget
  /** System-prompt fragment to append, telling the model the cap */
  budgetSystemPrompt: string
}

export function createBoundedRun(opts: BoundedRunOptions): BoundedRunHandle {
  const tracker = new CostTracker(opts.provider, opts.model)
  let warned = false
  const budget = new HardBudget(tracker, {
    maxUsd: opts.maxUsd,
    ...(opts.warnAt !== undefined ? { warnAt: opts.warnAt } : {}),
    onWarn: (spent, limit) => {
      if (warned) return
      warned = true
      process.stderr.write(`\n[budget] approaching cap: $${spent.toFixed(4)} / $${limit.toFixed(4)}\n`)
    },
  })

  const budgetSystemPrompt =
    `\n\n# Budget constraint\n` +
    `This conversation has a hard USD cap of $${opts.maxUsd.toFixed(4)}.\n` +
    `Prioritise the smallest viable change. Skip nice-to-haves. ` +
    `If you're approaching the cap, summarise progress and stop early instead of starting new work.\n`

  return { tracker, budget, budgetSystemPrompt }
}
