import { describe, it, expect } from 'vitest'
import { ProviderRegistry } from '../provider/registry.js'
import { BaseProvider } from '../provider/base.js'
import { ArixError } from '../errors.js'
import type { ModelInfo, ChatRequest, StreamChunk } from '../types.js'

function makeProvider(id: string) {
  return new (class extends BaseProvider {
    readonly id = id
    readonly name = id
    supportsTools() { return true }
    supportsVision() { return false }
    async listModels(): Promise<ModelInfo[]> { return [] }
    async chat(_: ChatRequest): Promise<AsyncIterable<StreamChunk>> {
      async function* g(): AsyncIterable<StreamChunk> { yield { done: true } }
      return g()
    }
  })()
}

describe('ProviderRegistry', () => {
  it('registers and retrieves a provider', () => {
    const registry = new ProviderRegistry()
    const p = makeProvider('openrouter')
    registry.register(p)
    expect(registry.get('openrouter')).toBe(p)
  })

  it('lists all registered providers', () => {
    const registry = new ProviderRegistry()
    registry.register(makeProvider('a'))
    registry.register(makeProvider('b'))
    expect(registry.list().map((p) => p.id)).toEqual(['a', 'b'])
  })

  it('returns undefined for unknown provider', () => {
    const registry = new ProviderRegistry()
    expect(registry.get('nope')).toBeUndefined()
  })

  it('getDefault returns first registered provider', () => {
    const registry = new ProviderRegistry()
    const p = makeProvider('first')
    registry.register(p)
    registry.register(makeProvider('second'))
    expect(registry.getDefault()).toBe(p)
  })

  it('getDefault throws when empty', () => {
    const registry = new ProviderRegistry()
    expect(() => registry.getDefault()).toThrow(ArixError)
  })
})
