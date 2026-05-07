import { describe, it, expect } from 'vitest'
import { OpenAIProvider } from '../openai/index.js'
import { ArixError } from '@arix-code/core'

describe('OpenAIProvider', () => {
  it('throws AUTH_ERROR when no API key provided', () => {
    const savedKey = process.env['OPENAI_API_KEY']
    delete process.env['OPENAI_API_KEY']
    expect(() => new OpenAIProvider()).toThrow(ArixError)
    if (savedKey) process.env['OPENAI_API_KEY'] = savedKey
  })

  it('constructs successfully with API key option', () => {
    expect(() => new OpenAIProvider({ apiKey: 'test-key' })).not.toThrow()
  })

  it('supportsTools returns true', () => {
    const p = new OpenAIProvider({ apiKey: 'test-key' })
    expect(p.supportsTools()).toBe(true)
  })

  it('has id openai', () => {
    const p = new OpenAIProvider({ apiKey: 'test-key' })
    expect(p.id).toBe('openai')
  })
})
