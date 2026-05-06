import { randomUUID } from 'node:crypto'
import type { AgentEvent, ToolConfirmationRequest } from '@arix/core'
import type { ChatMessage } from '../types.js'

/**
 * Pure state machine for stream consumption — no React dependency.
 * The useStream hook wraps this with useState/useCallback.
 */
export class StreamState {
  messages: ChatMessage[]
  streaming = false
  error: string | undefined = undefined
  pendingConfirm: ToolConfirmationRequest | undefined = undefined

  private listeners: Array<() => void> = []
  private currentAssistantId: string | undefined = undefined
  private bufferText = ''
  private bufferTimer: ReturnType<typeof setTimeout> | undefined = undefined

  constructor(initialMessages?: ChatMessage[]) {
    this.messages = initialMessages ? [...initialMessages] : []
  }

  onChange(fn: () => void): () => void {
    this.listeners.push(fn)
    return () => { this.listeners = this.listeners.filter((l) => l !== fn) }
  }

  private notify(): void {
    for (const l of this.listeners) l()
  }

  addUserMessage(content: string): void {
    this.messages = [...this.messages, { id: randomUUID(), role: 'user', content }]
    this.notify()
  }

  clearError(): void {
    this.error = undefined
    this.notify()
  }

  private flushBuffer(): void {
    if (this.bufferTimer !== undefined) {
      clearTimeout(this.bufferTimer)
      this.bufferTimer = undefined
    }
    if (this.bufferText === '') return
    const text = this.bufferText
    this.bufferText = ''
    const id = this.currentAssistantId

    if (!id) return
    const existing = this.messages.findIndex((m) => m.id === id)
    if (existing >= 0) {
      this.messages = this.messages.map((m) =>
        m.id === id ? { ...m, content: m.content + text } : m,
      )
    } else {
      this.messages = [...this.messages, { id, role: 'assistant', content: text, streaming: true }]
    }
    this.notify()
  }

  private scheduleFlush(): void {
    if (this.bufferTimer !== undefined) clearTimeout(this.bufferTimer)
    this.bufferTimer = setTimeout(() => this.flushBuffer(), 50)
  }

  async consume(stream: AsyncIterable<AgentEvent>): Promise<void> {
    this.streaming = true
    this.error = undefined
    this.currentAssistantId = randomUUID()
    this.notify()

    try {
      for await (const event of stream) {
        switch (event.type) {
          case 'text':
            this.bufferText += event.chunk
            this.scheduleFlush()
            break

          case 'tool_start': {
            this.flushBuffer()
            // Mark current assistant message done
            this.messages = this.messages.map((m) =>
              m.id === this.currentAssistantId ? { ...m, streaming: false } : m,
            )
            this.currentAssistantId = randomUUID()

            const toolId = `tool-${event.call.id}`
            this.messages = [
              ...this.messages,
              {
                id: toolId,
                role: 'tool',
                content: '',
                toolName: event.call.name,
                toolInput: event.call.input,
                streaming: true,
              },
            ]
            this.notify()
            break
          }

          case 'tool_result': {
            const resultId = `tool-${event.result.toolCallId}`
            this.messages = this.messages.map((m) =>
              m.id === resultId
                ? { ...m, content: event.result.output, toolSuccess: event.result.success, streaming: false }
                : m,
            )
            this.notify()
            break
          }

          case 'tool_confirm': {
            this.flushBuffer()
            this.pendingConfirm = event.request
            this.notify()

            // Pause until resolved
            await new Promise<void>((resolve) => {
              const originalResolve = event.request.resolve
              event.request.resolve = (approved: boolean) => {
                originalResolve(approved)
                this.pendingConfirm = undefined
                this.notify()
                resolve()
              }
            })
            break
          }

          case 'error':
            this.flushBuffer()
            this.error = event.error
            this.streaming = false
            this.notify()
            return

          case 'done':
            this.flushBuffer()
            this.messages = this.messages.map((m) =>
              m.id === this.currentAssistantId ? { ...m, streaming: false } : m,
            )
            this.notify()
            break
        }
      }
    } finally {
      this.flushBuffer()
      this.streaming = false
      this.notify()
    }
  }
}
