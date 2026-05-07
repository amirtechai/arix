/**
 * FallbackProvider — tries providers in order, switches on error.
 *
 * Usage:
 *   const provider = new FallbackProvider([
 *     ProviderFactory.create('anthropic', { apiKey }),
 *     ProviderFactory.create('openrouter', { apiKey: orKey }),
 *     ProviderFactory.create('ollama'),
 *   ])
 *
 * On rate limit (429) or auth error, automatically falls back to the next provider.
 */

import type { ChatRequest, ModelInfo, StreamChunk } from '@arix-code/core'
import { BaseProvider } from '@arix-code/core'

export class FallbackProvider extends BaseProvider {
  readonly id = 'fallback'
  readonly name = 'Fallback Provider'

  supportsTools() { return true }
  supportsVision() { return false }

  constructor(private readonly chain: BaseProvider[]) {
    super()
    if (chain.length === 0) throw new Error('FallbackProvider requires at least one provider')
  }

  async listModels(): Promise<ModelInfo[]> {
    const all = await Promise.all(this.chain.map((p) => p.listModels().catch(() => [] as ModelInfo[])))
    return all.flat()
  }

  async chat(req: ChatRequest): Promise<AsyncIterable<StreamChunk>> {
    let lastError: Error | undefined
    for (const provider of this.chain) {
      try {
        return await provider.chat(req)
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
        const isRetryable = this.isRetryableError(lastError)
        if (!isRetryable) throw lastError
        // Log fallback (non-fatal)
        process.stderr.write(`[fallback] ${provider.id} failed (${lastError.message.slice(0, 60)}), trying next...\n`)
      }
    }
    throw lastError ?? new Error('All providers failed')
  }

  private isRetryableError(err: Error): boolean {
    const msg = err.message.toLowerCase()
    return (
      msg.includes('429') ||
      msg.includes('rate limit') ||
      msg.includes('overloaded') ||
      msg.includes('503') ||
      msg.includes('502') ||
      msg.includes('unavailable') ||
      msg.includes('auth') ||
      msg.includes('api key')
    )
  }
}
