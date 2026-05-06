import { describe, it, expect } from 'vitest'
import { ModelRouter } from '../router/index.js'
import { ModelRegistry } from '../registry/index.js'
import { ProviderRegistry } from '../provider/registry.js'
import { BaseProvider } from '../provider/base.js'
import { ArixError } from '../errors.js'
import type { ModelInfo, ChatRequest, StreamChunk } from '../types.js'

function makeProvider(id: string, failWith?: ArixError) {
  return new (class extends BaseProvider {
    readonly id = id
    readonly name = id
    supportsTools() { return true }
    supportsVision() { return false }
    async listModels(): Promise<ModelInfo[]> { return [] }
    async chat(req: ChatRequest): Promise<AsyncIterable<StreamChunk>> {
      if (failWith) throw failWith
      async function* g(): AsyncIterable<StreamChunk> { yield { text: req.model, done: false }; yield { done: true } }
      return g()
    }
  })()
}

function makeRouter() {
  const registry = new ModelRegistry({
    coding: 'anthropic/claude-sonnet-4-6',
    fast: 'openrouter/meta-llama/llama-3.1-8b-instruct',
  })
  const providers = new ProviderRegistry()
  providers.register(makeProvider('anthropic'))
  providers.register(makeProvider('openrouter'))
  return new ModelRouter(registry, providers, ['anthropic', 'openrouter'])
}

describe('ModelRouter', () => {
  it('routes to coding role by default', async () => {
    const router = makeRouter()
    const { provider, model } = await router.route({ messages: [] })
    expect(provider.id).toBe('anthropic')
    expect(model).toBe('claude-sonnet-4-6')
  })

  it('respects explicit role override', async () => {
    const router = makeRouter()
    const { provider, model } = await router.route({ messages: [], taskType: 'fast' })
    expect(provider.id).toBe('openrouter')
    expect(model).toBe('meta-llama/llama-3.1-8b-instruct')
  })

  it('uses explicit model string override', async () => {
    const router = makeRouter()
    const { provider, model } = await router.route({ messages: [], modelOverride: 'openrouter/deepseek/r2' })
    expect(provider.id).toBe('openrouter')
    expect(model).toBe('deepseek/r2')
  })

  it('falls back when primary provider throws retryable error', async () => {
    const registry = new ModelRegistry({ coding: 'anthropic/claude-sonnet-4-6' })
    const providers = new ProviderRegistry()
    providers.register(makeProvider('anthropic', new ArixError('PROVIDER_UNAVAILABLE', 'down', { retryable: true })))
    providers.register(makeProvider('openrouter'))
    const router = new ModelRouter(registry, providers, ['anthropic', 'openrouter'])
    const { provider } = await router.route({ messages: [] })
    expect(provider.id).toBe('openrouter')
  })

  it('throws ALL_PROVIDERS_FAILED when all fail', async () => {
    const registry = new ModelRegistry({ coding: 'anthropic/x' })
    const providers = new ProviderRegistry()
    providers.register(makeProvider('anthropic', new ArixError('PROVIDER_UNAVAILABLE', 'down', { retryable: true })))
    const router = new ModelRouter(registry, providers, ['anthropic'])
    await expect(router.route({ messages: [] })).rejects.toThrow(ArixError)
  })
})
