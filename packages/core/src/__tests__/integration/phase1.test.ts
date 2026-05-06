import { describe, it, expect } from 'vitest'
import { ModelRegistry, ModelRouter, ProviderRegistry, BaseProvider, ArixError } from '../../index.js'
import type { ModelInfo, ChatRequest, StreamChunk } from '../../index.js'

// Fake provider that records calls
class FakeProvider extends BaseProvider {
  calls: string[] = []
  constructor(
    readonly id: string,
    readonly name: string,
    private shouldFail = false,
  ) { super() }

  supportsTools() { return true }
  supportsVision() { return false }
  async listModels(): Promise<ModelInfo[]> { return [] }
  async chat(req: ChatRequest): Promise<AsyncIterable<StreamChunk>> {
    if (this.shouldFail) throw new ArixError('PROVIDER_UNAVAILABLE', `${this.id} down`, { retryable: true })
    this.calls.push(req.model)
    async function* g(): AsyncIterable<StreamChunk> { yield { text: `${req.model}`, done: false }; yield { done: true } }
    return g()
  }
}

describe('Phase 1 Integration', () => {
  it('routes coding task to Anthropic by default', async () => {
    const registry = new ModelRegistry({})
    const providers = new ProviderRegistry()
    const anthropic = new FakeProvider('anthropic', 'Anthropic')
    providers.register(anthropic)
    const router = new ModelRouter(registry, providers, ['anthropic'])

    const { provider, model } = await router.route({ messages: [] })
    expect(provider.id).toBe('anthropic')
    expect(model).toBe('claude-sonnet-4-6')
  })

  it('falls back from failed provider to next in chain', async () => {
    const registry = new ModelRegistry({ coding: 'anthropic/claude-sonnet-4-6' })
    const providers = new ProviderRegistry()
    const dead = new FakeProvider('anthropic', 'Dead Anthropic', true)
    const alive = new FakeProvider('openrouter', 'OpenRouter')
    providers.register(dead)
    providers.register(alive)
    const router = new ModelRouter(registry, providers, ['anthropic', 'openrouter'])

    const { provider } = await router.route({ messages: [] })
    expect(provider.id).toBe('openrouter')
  })

  it('parseModelId round-trips all provider prefixes', () => {
    const registry = new ModelRegistry({})
    expect(registry.parseModelId('anthropic/claude-sonnet-4-6')).toEqual({ provider: 'anthropic', model: 'claude-sonnet-4-6' })
    expect(registry.parseModelId('openrouter/deepseek/r2')).toEqual({ provider: 'openrouter', model: 'deepseek/r2' })
    expect(registry.parseModelId('ollama/qwen2.5-coder:7b')).toEqual({ provider: 'ollama', model: 'qwen2.5-coder:7b' })
    expect(registry.parseModelId('openai/gpt-4o')).toEqual({ provider: 'openai', model: 'gpt-4o' })
  })

  it('ArixError carries correct metadata', () => {
    const err = new ArixError('RATE_LIMIT', 'Too fast', { retryable: true, provider: 'openrouter' })
    expect(err.code).toBe('RATE_LIMIT')
    expect(err.retryable).toBe(true)
    expect(err.provider).toBe('openrouter')
    expect(err).toBeInstanceOf(Error)
  })
})
