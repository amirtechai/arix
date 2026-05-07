import { describe, it, expect, vi } from 'vitest'
import { CostTracker } from '../cost/index.js'
import { HardBudget, BudgetExceededError } from '../agent/budget.js'

describe('HardBudget', () => {
  it('throws when spend crosses the limit', () => {
    const tracker = new CostTracker('openai', 'gpt-4o')
    const budget = new HardBudget(tracker, { maxUsd: 0.01 })
    // Force a high turn cost
    tracker.record(1_000_000, 1_000_000)
    expect(() => budget.check()).toThrow(BudgetExceededError)
  })

  it('fires onWarn at threshold once', () => {
    const tracker = new CostTracker('anthropic', 'claude-sonnet-4-6')
    const onWarn = vi.fn()
    const budget = new HardBudget(tracker, { maxUsd: 100, warnAt: 0.5, onWarn })
    tracker.record(10, 10)
    expect(() => budget.check()).not.toThrow()
    // simulate large input that brings spend above 50% of $100 but below $100
    for (let i = 0; i < 20; i++) tracker.record(1_000_000, 0)
    budget.check()
    expect(onWarn).toHaveBeenCalledTimes(1)
    // does not refire
    budget.check()
    expect(onWarn).toHaveBeenCalledTimes(1)
  })
})
