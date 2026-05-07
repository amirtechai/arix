import type { StreamChunk } from '@arix-code/core'

// Minimal Anthropic stream event shapes we care about
interface TextDeltaEvent {
  type: 'content_block_delta'
  index: number
  delta: { type: 'text_delta'; text: string } | { type: 'input_json_delta'; partial_json: string }
}

interface MessageStopEvent { type: 'message_stop' }
interface MessageDeltaEvent {
  type: 'message_delta'
  usage?: { output_tokens: number }
}
interface MessageStartEvent {
  type: 'message_start'
  message?: { usage?: { input_tokens: number; output_tokens: number } }
}
interface ContentBlockStartEvent {
  type: 'content_block_start'
  index: number
  content_block: { type: 'tool_use'; id: string; name: string }
}

type AnthropicEvent = TextDeltaEvent | MessageStopEvent | MessageDeltaEvent | MessageStartEvent | ContentBlockStartEvent | { type: string; [key: string]: unknown }

/** Per-request accumulator — avoids global state leaking across concurrent requests. */
export class AnthropicStreamMapper {
  private readonly accumulator = new Map<number, { id: string; name: string; json: string }>()
  private inputTokens = 0
  private outputTokens = 0

  map(event: AnthropicEvent): StreamChunk | null {
    if (event.type === 'message_start') {
      const e = event as MessageStartEvent
      this.inputTokens = e.message?.usage?.input_tokens ?? 0
      this.outputTokens = e.message?.usage?.output_tokens ?? 0
      return null
    }

    if (event.type === 'message_delta') {
      const e = event as MessageDeltaEvent
      if (e.usage?.output_tokens) this.outputTokens = e.usage.output_tokens
      return null
    }

    if (event.type === 'message_stop') {
      const usage = this.inputTokens > 0 || this.outputTokens > 0
        ? { inputTokens: this.inputTokens, outputTokens: this.outputTokens }
        : undefined
      return { done: true, ...(usage ? { usage } : {}) }
    }

    if (event.type === 'content_block_start') {
      const e = event as ContentBlockStartEvent
      if (e.content_block.type === 'tool_use') {
        this.accumulator.set(e.index, { id: e.content_block.id, name: e.content_block.name, json: '' })
      }
      return null
    }

    if (event.type === 'content_block_delta') {
      const e = event as TextDeltaEvent
      if (e.delta.type === 'text_delta') {
        return { text: e.delta.text, done: false }
      }
      if (e.delta.type === 'input_json_delta') {
        const acc = this.accumulator.get(e.index)
        if (acc) acc.json += e.delta.partial_json
        return null
      }
    }

    return null
  }

  flush(): StreamChunk[] {
    const chunks: StreamChunk[] = []
    for (const [, acc] of this.accumulator) {
      let input: Record<string, unknown> = {}
      try { input = JSON.parse(acc.json) as Record<string, unknown> } catch { /* empty tool input */ }
      chunks.push({ toolCall: { id: acc.id, name: acc.name, input }, done: false })
    }
    this.accumulator.clear()
    return chunks
  }
}
