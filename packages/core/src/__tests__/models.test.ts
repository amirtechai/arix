import { describe, it, expect } from 'vitest'
import { ModelCatalogue } from '../registry/models.js'

describe('ModelCatalogue', () => {
  it('returns all models', () => {
    const all = ModelCatalogue.all()
    expect(all.length).toBeGreaterThan(30)
  })

  it('filters by provider', () => {
    const anthropic = ModelCatalogue.forProvider('anthropic')
    expect(anthropic.every((m) => m.provider === 'anthropic')).toBe(true)
    expect(anthropic.length).toBeGreaterThan(0)
  })

  it('gets a specific model', () => {
    const m = ModelCatalogue.get('anthropic', 'claude-sonnet-4-6')
    expect(m).toBeDefined()
    expect(m?.name).toBe('Claude Sonnet 4.6')
    expect(m?.tier).toBe('medium')
  })

  it('returns undefined for unknown model', () => {
    expect(ModelCatalogue.get('anthropic', 'nonexistent')).toBeUndefined()
  })

  it('lists all providers', () => {
    const providers = ModelCatalogue.providers()
    expect(providers).toContain('anthropic')
    expect(providers).toContain('openai')
    expect(providers).toContain('gemini')
    expect(providers).toContain('ollama')
  })

  describe('recommend', () => {
    it('recommends cheapest model for tier', () => {
      const m = ModelCatalogue.recommend({ tier: 'simple', requireTools: true })
      expect(m).toBeDefined()
      expect(m?.supportsTools).toBe(true)
    })

    it('recommends model within budget', () => {
      const m = ModelCatalogue.recommend({ tier: 'medium', maxInputCostPerMillion: 1 })
      expect(m).toBeDefined()
      expect((m?.pricing?.input ?? Infinity)).toBeLessThanOrEqual(1)
    })

    it('filters by provider list', () => {
      const m = ModelCatalogue.recommend({ tier: 'medium', providers: ['openai'] })
      expect(m?.provider).toBe('openai')
    })

    it('returns undefined when no model matches', () => {
      const m = ModelCatalogue.recommend({ tier: 'complex', maxInputCostPerMillion: 0.001, requireTools: true, requireVision: true })
      expect(m).toBeUndefined()
    })

    it('prefers cheapest model', () => {
      const m1 = ModelCatalogue.recommend({ tier: 'simple' })
      const m2 = ModelCatalogue.recommend({ tier: 'medium' })
      expect((m1?.pricing?.input ?? 0)).toBeLessThanOrEqual(m2?.pricing?.input ?? Infinity)
    })
  })

  describe('estimateCost', () => {
    it('calculates cost for known model', () => {
      const cost = ModelCatalogue.estimateCost('anthropic', 'claude-sonnet-4-6', 1_000_000, 500_000)
      expect(cost).toBeCloseTo(3 + 7.5, 1)  // $3/M in + $15/M out * 0.5M
    })

    it('returns null for unknown model', () => {
      expect(ModelCatalogue.estimateCost('anthropic', 'fake', 100, 100)).toBeNull()
    })

    it('returns 0 for free models', () => {
      const cost = ModelCatalogue.estimateCost('ollama', 'llama3.2:3b', 10_000, 5_000)
      expect(cost).toBe(0)
    })
  })

  it('formats price string', () => {
    const str = ModelCatalogue.formatPrice({ input: 3, output: 15 })
    expect(str).toContain('3')
    expect(str).toContain('15')
  })
})
