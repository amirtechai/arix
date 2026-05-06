import { describe, it, expect } from 'vitest'
import { StreamState } from '../hooks/StreamState.js'
import type { AgentEvent } from '@arix/core'
import type { ChatMessage } from '../types.js'

async function* makeEvents(events: AgentEvent[]): AsyncGenerator<AgentEvent> {
  for (const event of events) {
    yield event
    await new Promise((r) => setTimeout(r, 0))
  }
}

describe('StreamState', () => {
  it('accumulates text from text events', async () => {
    const state = new StreamState()
    await state.consume(
      makeEvents([
        { type: 'text', chunk: 'Hello' },
        { type: 'text', chunk: ' world' },
        { type: 'done' },
      ]),
    )
    const assistant = state.messages.find((m) => m.role === 'assistant')
    expect(assistant?.content).toBe('Hello world')
    expect(state.streaming).toBe(false)
  })

  it('records tool_start and tool_result messages', async () => {
    const state = new StreamState()
    await state.consume(
      makeEvents([
        { type: 'tool_start', call: { id: 'tc1', name: 'read_file', input: { path: '/tmp/x' } } },
        { type: 'tool_result', result: { toolCallId: 'tc1', success: true, output: 'content' } },
        { type: 'done' },
      ]),
    )
    const toolMsg = state.messages.find((m) => m.role === 'tool')
    expect(toolMsg?.toolName).toBe('read_file')
    expect(toolMsg?.content).toBe('content')
    expect(toolMsg?.toolSuccess).toBe(true)
  })

  it('sets error on error event', async () => {
    const state = new StreamState()
    await state.consume(makeEvents([{ type: 'error', error: 'Something failed' }]))
    expect(state.error).toBe('Something failed')
    expect(state.streaming).toBe(false)
  })

  it('addUserMessage adds a user message', () => {
    const state = new StreamState()
    state.addUserMessage('Hello AI')
    expect(state.messages[0]?.role).toBe('user')
    expect(state.messages[0]?.content).toBe('Hello AI')
  })

  it('emits onChange when state updates', async () => {
    const state = new StreamState()
    const snapshots: number[] = []
    state.onChange(() => snapshots.push(state.messages.length))

    await state.consume(
      makeEvents([
        { type: 'text', chunk: 'Hi' },
        { type: 'done' },
      ]),
    )

    expect(snapshots.length).toBeGreaterThan(0)
  })

  it('initializes with provided messages', () => {
    const initial: ChatMessage[] = [
      { id: '1', role: 'user', content: 'hello' },
      { id: '2', role: 'assistant', content: 'hi there' },
    ]
    const state = new StreamState(initial)
    expect(state.messages).toHaveLength(2)
    expect(state.messages[0]?.content).toBe('hello')
    expect(state.messages[1]?.role).toBe('assistant')
  })

  it('handles tool confirmation', async () => {
    const state = new StreamState()
    let resolved = false

    // Auto-approve in background
    const consumePromise = state.consume(
      makeEvents([
        {
          type: 'tool_confirm',
          request: {
            tool: 'write_file',
            input: { path: '/tmp/out.txt' },
            resolve: (approved) => { resolved = approved },
          },
        },
        { type: 'done' },
      ]),
    )

    // Wait a tick for the confirm to be pending
    await new Promise((r) => setTimeout(r, 10))
    expect(state.pendingConfirm?.tool).toBe('write_file')

    // Approve
    state.pendingConfirm?.resolve(true)
    await consumePromise

    expect(resolved).toBe(true)
  })
})
