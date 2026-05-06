import { describe, it, expect, vi } from 'vitest'
import { BaseProvider } from '../provider/base.js'
import { ArixError } from '../errors.js'
import type { ModelInfo, ChatRequest, StreamChunk } from '../types.js'

// Concrete subclass for testing
class TestProvider extends BaseProvider {
  readonly id = 'test'
  readonly name = 'Test Provider'

  supportsTools() { return true }
  supportsVision() { return false }

  async listModels(): Promise<ModelInfo[]> {
    return [{ id: 'test-model', name: 'Test', contextLength: 8192, supportsTools: true, supportsVision: false }]
  }

  async chat(_req: ChatRequest): Promise<AsyncIterable<StreamChunk>> {
    async function* gen() { yield { text: 'hello', done: false }; yield { done: true } }
    return gen()
  }
}

describe('BaseProvider', () => {
  it('retry calls fn multiple times on retryable error', async () => {
    const provider = new TestProvider()
    let attempts = 0
    const fn = vi.fn(async () => {
      attempts++
      if (attempts < 3) throw new ArixError('RATE_LIMIT', 'retry', { retryable: true })
      return 'success'
    })

    const result = await provider.testRetry(fn, 3, 0)
    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('does not retry non-retryable errors', async () => {
    const provider = new TestProvider()
    const fn = vi.fn(async () => {
      throw new ArixError('AUTH_ERROR', 'bad key')
    })

    await expect(provider.testRetry(fn, 3, 0)).rejects.toThrow('bad key')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('throws after max attempts', async () => {
    const provider = new TestProvider()
    const fn = vi.fn(async () => {
      throw new ArixError('RATE_LIMIT', 'still limited', { retryable: true })
    })

    await expect(provider.testRetry(fn, 2, 0)).rejects.toThrow('still limited')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('normalizeMessages merges consecutive same-role messages', () => {
    const provider = new TestProvider()
    const messages = [
      { role: 'user' as const, content: 'hello' },
      { role: 'user' as const, content: 'world' },
      { role: 'assistant' as const, content: 'hi' },
    ]
    const result = provider.testNormalize(messages)
    expect(result).toHaveLength(2)
    expect(result[0]?.content).toBe('hello\nworld')
    expect(result[1]?.content).toBe('hi')
  })
})
