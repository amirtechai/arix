import { ArixError } from '../errors.js'
import type { ModelInfo, ChatRequest, StreamChunk, Message } from '../types.js'

export interface Provider {
  readonly id: string
  readonly name: string
  listModels(): Promise<ModelInfo[]>
  chat(req: ChatRequest): Promise<AsyncIterable<StreamChunk>>
  supportsTools(): boolean
  supportsVision(): boolean
}

export abstract class BaseProvider implements Provider {
  abstract readonly id: string
  abstract readonly name: string

  abstract listModels(): Promise<ModelInfo[]>
  abstract chat(req: ChatRequest): Promise<AsyncIterable<StreamChunk>>
  abstract supportsTools(): boolean
  abstract supportsVision(): boolean

  protected async retry<T>(
    fn: () => Promise<T>,
    maxAttempts: number = 3,
    backoffMs: number = 1000,
  ): Promise<T> {
    return this.testRetry(fn, maxAttempts, backoffMs)
  }

  // Exposed for testing (protected retry with delay bypass)
  async testRetry<T>(
    fn: () => Promise<T>,
    maxAttempts: number,
    backoffMs: number,
  ): Promise<T> {
    let lastError: Error = new Error('Unknown error')
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await fn()
      } catch (err) {
        if (err instanceof ArixError && !err.retryable) throw err
        lastError = err instanceof Error ? err : new Error(String(err))
        if (attempt < maxAttempts - 1 && backoffMs > 0) {
          await new Promise((r) => setTimeout(r, backoffMs * Math.pow(2, attempt)))
        }
      }
    }
    throw lastError
  }

  protected normalizeMessages(messages: Message[]): Message[] {
    return this.testNormalize(messages)
  }

  testNormalize(messages: Message[]): Message[] {
    if (messages.length === 0) return []
    const result: Message[] = [{ ...messages[0]! }]
    for (let i = 1; i < messages.length; i++) {
      const prev = result[result.length - 1]!
      const curr = messages[i]!
      if (prev.role === curr.role) {
        prev.content = prev.content + '\n' + curr.content
      } else {
        result.push({ ...curr })
      }
    }
    return result
  }
}
