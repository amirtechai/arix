import { describe, it, expect, beforeEach } from 'vitest'
import { CostTracker } from '../cost/index.js'

describe('CostTracker', () => {
  let tracker: CostTracker

  beforeEach(() => {
    tracker = new CostTracker('anthropic', 'claude-sonnet-4-6', 'test-session')
  })

  it('starts with zero state', () => {
    const s = tracker.summary()
    expect(s.turns).toBe(0)
    expect(s.totalInputTokens).toBe(0)
    expect(s.totalOutputTokens).toBe(0)
    expect(s.totalUsd ?? 0).toBe(0)
  })

  it('records a turn and calculates cost', () => {
    const turn = tracker.record(1000, 500)
    expect(turn.inputTokens).toBe(1000)
    expect(turn.outputTokens).toBe(500)
    expect(turn.usd).toBeGreaterThan(0)
    // $3/M input * 1000/1M = $0.003, $15/M output * 500/1M = $0.0075
    expect(turn.usd).toBeCloseTo(0.003 + 0.0075, 6)
  })

  it('accumulates across turns', () => {
    tracker.record(1000, 500)
    tracker.record(2000, 1000)
    const s = tracker.summary()
    expect(s.turns).toBe(2)
    expect(s.totalInputTokens).toBe(3000)
    expect(s.totalOutputTokens).toBe(1500)
  })

  it('computes avgUsdPerTurn', () => {
    tracker.record(1_000_000, 0)  // exactly $3
    tracker.record(1_000_000, 0)  // exactly $3
    const s = tracker.summary()
    expect(s.avgUsdPerTurn).toBeCloseTo(3, 4)
  })

  it('formats a readable string', () => {
    tracker.record(12_000, 3_000)
    const str = tracker.format()
    expect(str).toContain('↑')
    expect(str).toContain('↓')
    expect(str).toContain('$')
    expect(str).toContain('turn')
  })

  it('handles unknown model pricing gracefully', () => {
    const t = new CostTracker('ollama', 'llama3.2:3b', 'free-session')
    const turn = t.record(5000, 2000)
    expect(turn.usd).toBe(0)  // free model
  })
})
