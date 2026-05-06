import { ArixError } from '@arix/core'
import type { StreamChunk, TokenUsage } from '@arix/core'
import type { OpenRouterChunk } from './types.js'

export async function* parseSSEStream(
  stream: ReadableStream<Uint8Array>,
): AsyncIterable<StreamChunk> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let pendingUsage: TokenUsage | undefined

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith(':')) continue
        if (!trimmed.startsWith('data: ')) continue

        const data = trimmed.slice(6)
        if (data === '[DONE]') {
          yield { done: true, ...(pendingUsage ? { usage: pendingUsage } : {}) }
          return
        }

        let parsed: OpenRouterChunk
        try { parsed = JSON.parse(data) as OpenRouterChunk }
        catch { continue }

        // Capture usage from the final chunk (requires stream_options.include_usage)
        if (parsed.usage) {
          pendingUsage = {
            inputTokens: parsed.usage.prompt_tokens,
            outputTokens: parsed.usage.completion_tokens,
          }
        }

        const choice = parsed.choices[0]
        if (!choice) continue

        if (choice.finish_reason === 'content_filter')
          throw new ArixError('CONTENT_FILTERED', 'Response blocked by content filter', { provider: 'openrouter' })

        const delta = choice.delta
        if (delta.content) {
          yield { text: delta.content, done: false }
        } else if (delta.tool_calls?.[0]) {
          const tc = delta.tool_calls[0]
          if (tc.id && tc.function?.name) {
            let input: Record<string, unknown> = {}
            try { input = JSON.parse(tc.function.arguments ?? '{}') as Record<string, unknown> }
            catch { /* leave empty */ }
            yield {
              toolCall: { id: tc.id, name: tc.function.name, input },
              done: false,
            }
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
