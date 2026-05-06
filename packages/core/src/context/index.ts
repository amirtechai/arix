import type { Message, ToolResult } from '../types.js'

const CHARS_PER_TOKEN = 4
const WINDOW_TRIGGER = 0.80   // start windowing at 80% of context
const MIN_KEEP_MESSAGES = 20
const SUMMARY_MARKER = '--- Earlier conversation summarized ---'

export interface ContextConfig {
  systemPrompt?: string
  maxTokens?: number    // override model's context length
}

/** Estimate token count for a message's content (string or ContentBlock[]) */
function contentTokens(content: Message['content']): number {
  if (typeof content === 'string') return Math.ceil(content.length / CHARS_PER_TOKEN)
  // For ContentBlock[], count only text block characters
  const text = content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('')
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

export class ContextManager {
  private messages: Message[] = []
  private readonly systemPrompt: string | undefined
  private readonly maxTokens: number | undefined
  // Perf: incrementally maintained token sum — avoids O(n) scan on every call
  private _tokenSum = 0

  constructor(config: ContextConfig = {}) {
    this.systemPrompt = config.systemPrompt
    this.maxTokens = config.maxTokens
  }

  addMessage(msg: Message): void {
    this.messages.push({ ...msg, timestamp: msg.timestamp ?? Date.now() })
    this._tokenSum += contentTokens(msg.content)
  }

  addToolResult(result: ToolResult): void {
    const content = result.success
      ? `Tool result: ${result.output}`
      : `Tool error: ${result.error ?? 'unknown error'}`
    this.messages.push({ role: 'user', content, timestamp: Date.now() })
    this._tokenSum += Math.ceil(content.length / CHARS_PER_TOKEN)
  }

  getMessages(modelContextLength: number): Message[] {
    const budget = Math.floor((this.maxTokens ?? modelContextLength) * WINDOW_TRIGGER)
    const systemTokens = this.systemPrompt ? Math.ceil(this.systemPrompt.length / CHARS_PER_TOKEN) : 0
    let remaining = budget - systemTokens

    // Walk from the end, keeping messages that fit within budget
    const kept: Message[] = []
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const msg = this.messages[i]!
      const tokens = contentTokens(msg.content)
      if (remaining - tokens < 0 && kept.length >= MIN_KEEP_MESSAGES) break
      remaining -= tokens
      kept.unshift(msg)
    }

    // If we truncated, prepend summary marker
    const truncated = kept.length < this.messages.length
    const result: Message[] = []
    if (this.systemPrompt) {
      result.push({ role: 'system', content: this.systemPrompt })
    }
    if (truncated) {
      result.push({ role: 'user', content: SUMMARY_MARKER })
    }
    result.push(...kept)
    return result
  }

  getTokenCount(): number {
    const systemTokens = this.systemPrompt ? Math.ceil(this.systemPrompt.length / CHARS_PER_TOKEN) : 0
    return systemTokens + this._tokenSum
  }

  clear(): void {
    this.messages = []
    this._tokenSum = 0
  }

  export(): Message[] {
    return [...this.messages]
  }
}
