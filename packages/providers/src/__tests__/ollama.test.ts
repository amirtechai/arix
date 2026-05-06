import { describe, it, expect } from 'vitest'
import { OllamaProvider } from '../ollama/index.js'

describe('OllamaProvider', () => {
  it('constructs with default base URL', () => {
    expect(() => new OllamaProvider()).not.toThrow()
  })

  it('id is ollama', () => {
    expect(new OllamaProvider().id).toBe('ollama')
  })

  it('isAvailable returns false when connection refused', async () => {
    const p = new OllamaProvider({ baseURL: 'http://localhost:19999' })
    const available = await p.isAvailable()
    expect(available).toBe(false)
  })

  it('pricing is free', async () => {
    // Can't test listModels without Ollama running — unit test the mapping logic
    const p = new OllamaProvider()
    const mapped = p.mapModel({ name: 'llama3:8b', size: 1234, digest: 'abc', modified_at: '' })
    expect(mapped.pricing).toEqual({ input: 0, output: 0 })
    expect(mapped.id).toBe('llama3:8b')
  })
})
