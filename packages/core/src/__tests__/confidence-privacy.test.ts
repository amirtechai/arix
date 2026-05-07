import { describe, it, expect } from 'vitest'
import { parseConfidenceClaims, lowConfidence, stripConfidenceMarkers, meanConfidence } from '../agent/confidence.js'
import { classifyPayload, privacyRoute } from '../router/privacy.js'

describe('confidence calibration', () => {
  it('parses inline [conf:N] markers', () => {
    const claims = parseConfidenceClaims('[conf:0.4] this is uncertain. [conf:0.95] this is solid.')
    expect(claims).toHaveLength(2)
    expect(claims[0]?.confidence).toBe(0.4)
    expect(claims[1]?.confidence).toBe(0.95)
  })

  it('lowConfidence filters by threshold', () => {
    const claims = parseConfidenceClaims('[conf:0.3] x. [conf:0.9] y.')
    expect(lowConfidence(claims, 0.7)).toHaveLength(1)
    expect(lowConfidence(claims, 0.7)[0]?.confidence).toBe(0.3)
  })

  it('strips markers from text', () => {
    const out = stripConfidenceMarkers('[conf:0.5] hello world')
    expect(out).toBe('hello world')
  })

  it('meanConfidence weighs by claim length', () => {
    const claims = parseConfidenceClaims('[conf:1.0] a [conf:0.0] aaaaaaaa')
    const m = meanConfidence(claims)!
    expect(m).toBeLessThan(0.5)
  })
})

describe('privacy routing', () => {
  it('classifies a public payload', () => {
    expect(classifyPayload('hello world').class).toBe('public')
  })

  it('classifies an API key as secret', () => {
    expect(classifyPayload('export GH=ghp_abcdefghijklmnopqrstuvwxyz0123456789').class).toBe('secret')
  })

  it('classifies SSN as PII', () => {
    expect(classifyPayload('My SSN is 123-45-6789').class).toBe('pii')
  })

  it('suggests local provider when payload is sensitive', () => {
    const d = privacyRoute('AKIAIOSFODNN7EXAMPLE', { provider: 'anthropic', model: 'claude-sonnet-4-6' })
    expect(d.class).toBe('secret')
    expect(d.suggestProvider).toBe('ollama')
  })

  it('does not suggest swap when already on local provider', () => {
    const d = privacyRoute('AKIAIOSFODNN7EXAMPLE', { provider: 'ollama', model: 'llama3.2:3b' })
    expect(d.class).toBe('secret')
    expect(d.suggestProvider).toBeUndefined()
  })

  it('respects disabled policy', () => {
    const d = privacyRoute('AKIAIOSFODNN7EXAMPLE',
      { provider: 'anthropic', model: 'x' },
      { localProvider: 'ollama', localModel: 'y', disabled: true })
    expect(d.class).toBe('public')
  })
})
