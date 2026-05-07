import { describe, it, expect } from 'vitest'
import { bySkill, regression, tokenPreflight } from '../cost/reports.js'
import { predictiveRoute } from '../cost/predictive.js'
import { annotateForCache } from '../cost/prompt-cache.js'
import type { SessionCost } from '../cost/index.js'

function session(daysAgo: number, usd: number, skill?: string): SessionCost & { skill?: string } {
  return {
    sessionId: `s-${Math.random()}`,
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    startedAt: new Date(Date.now() - daysAgo * 86400_000).toISOString(),
    turns: [],
    totalInputTokens: 1000,
    totalOutputTokens: 500,
    totalUsd: usd,
    ...(skill ? { skill } : {}),
  }
}

describe('cost reports', () => {
  it('bySkill aggregates per skill bucket', () => {
    const ledger = [
      session(1, 0.10, 'tdd'),
      session(2, 0.20, 'tdd'),
      session(3, 0.05, 'review'),
      session(4, 0.03),
    ]
    const rows = bySkill(ledger)
    expect(rows.find((r) => r.skill === 'tdd')?.totalUsd).toBeCloseTo(0.30)
    expect(rows.find((r) => r.skill === '(unlabelled)')?.sessions).toBe(1)
    expect(rows[0]!.totalUsd).toBeGreaterThanOrEqual(rows[1]!.totalUsd)
  })

  it('regression alerts when this week ≥ factor × prior week', () => {
    const ledger = [
      session(1, 1.0),
      session(2, 1.0),
      session(8, 0.20),
      session(9, 0.10),
    ]
    const r = regression(ledger, { factor: 2 })
    expect(r.alert).toBe(true)
    expect(r.multiplier).toBeGreaterThan(2)
  })

  it('regression no alert when spend stays flat', () => {
    const ledger = [
      session(1, 0.5),
      session(8, 0.5),
    ]
    expect(regression(ledger, { factor: 2 }).alert).toBe(false)
  })

  it('tokenPreflight estimates cost using model pricing', () => {
    const r = tokenPreflight({
      prompt: 'hello world '.repeat(1000),
      maxOutputTokens: 1024,
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
    })
    expect(r.estInputTokens).toBeGreaterThan(2000)
    expect(r.estCostUsd).toBeGreaterThan(0)
  })
})

describe('predictiveRoute', () => {
  it('returns preferred when no threshold', () => {
    const r = predictiveRoute({
      estInputTokens: 100,
      preferred: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
    })
    expect(r.model).toBe('claude-sonnet-4-6')
  })

  it('downgrades when threshold exceeded', () => {
    const r = predictiveRoute({
      estInputTokens: 1_000_000, // forces a large cost
      preferred: { provider: 'anthropic', model: 'claude-opus-4-6' },
      thresholdUsd: 1.0,
    })
    expect(r.model).not.toBe('claude-opus-4-6')
  })
})

describe('annotateForCache', () => {
  it('marks the system prompt cache-eligible when long enough', () => {
    const req = {
      model: 'x',
      messages: [{ role: 'user' as const, content: 'short', timestamp: 0 }],
      systemPrompt: 'a'.repeat(3000),
    }
    const r = annotateForCache(req)
    expect(r.cacheControl?.systemPrompt).toBe(true)
  })

  it('does not annotate when content is small', () => {
    const r = annotateForCache({
      model: 'x',
      messages: [{ role: 'user' as const, content: 'small', timestamp: 0 }],
      systemPrompt: 'short',
    })
    expect(r.cacheControl).toBeUndefined()
  })
})
