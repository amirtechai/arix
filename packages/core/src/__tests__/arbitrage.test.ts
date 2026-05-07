import { describe, it, expect } from 'vitest'
import { chooseArbitrage, type ArbitrageCandidate } from '../router/arbitrage.js'

const sonnet:    ArbitrageCandidate = { provider: 'anthropic', model: 'claude-sonnet-4-6', inputUsdPerM: 3,    outputUsdPerM: 15,  quality: 0.95 }
const haiku:     ArbitrageCandidate = { provider: 'anthropic', model: 'claude-haiku-4-5',  inputUsdPerM: 0.8,  outputUsdPerM: 4,   quality: 0.85 }
const deepseek:  ArbitrageCandidate = { provider: 'deepseek',  model: 'deepseek-chat',     inputUsdPerM: 0.14, outputUsdPerM: 0.28, quality: 0.88 }

describe('arbitrage', () => {
  it('keeps preferred when nothing is significantly cheaper-or-better', () => {
    const decision = chooseArbitrage([sonnet], {
      tier: 'complex',
      estInputTokens: 1000,
      estOutputTokens: 500,
      preferred: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
    })
    expect(decision.chosen.model).toBe('claude-sonnet-4-6')
  })

  it('swaps to deepseek when within tolerance and cheaper', () => {
    const decision = chooseArbitrage([sonnet, haiku, deepseek], {
      tier: 'simple',
      estInputTokens: 10_000,
      estOutputTokens: 5_000,
      qualityTolerance: 0.1,
      preferred: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
    })
    expect(decision.chosen.provider).toBe('deepseek')
    expect(decision.savedVsPreferredUsd).toBeGreaterThan(0)
  })

  it('falls back to highest-quality when none are within tolerance', () => {
    const lowQ: ArbitrageCandidate = { provider: 'x', model: 'y', inputUsdPerM: 0.01, outputUsdPerM: 0.01, quality: 0.4 }
    const decision = chooseArbitrage([sonnet, lowQ], {
      tier: 'complex',
      estInputTokens: 1000,
      estOutputTokens: 1000,
      qualityTolerance: 0.05,
      preferred: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
    })
    expect(decision.chosen.provider).toBe('anthropic')
  })
})
