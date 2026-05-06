import { describe, it, expect, vi } from 'vitest'
import { AgentLoop } from '../agent/index.js'
import type { AgentEvent, ChatRequest, ContentBlock, Message, StreamChunk, ToolResult } from '../types.js'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeStream(chunks: StreamChunk[]): AsyncIterable<StreamChunk> {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const chunk of chunks) yield chunk
    },
  }
}

function makeProvider(stream: AsyncIterable<StreamChunk>) {
  return {
    chat: vi.fn().mockResolvedValue(stream),
    listModels: vi.fn().mockResolvedValue([]),
    isAvailable: vi.fn().mockResolvedValue(true),
  }
}

function makeTool(name: string, result: ToolResult, requiresConfirmation = false) {
  return {
    name,
    description: `${name} tool`,
    inputSchema: { type: 'object', properties: {} },
    requiresConfirmation,
    execute: vi.fn().mockResolvedValue(result),
  }
}

async function collectEvents(loop: AgentLoop, message: string): Promise<AgentEvent[]> {
  const events: AgentEvent[] = []
  for await (const event of loop.run(message)) {
    events.push(event)
  }
  return events
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AgentLoop', () => {
  it('emits text chunks and done event', async () => {
    const stream = makeStream([
      { text: 'Hello', done: false },
      { text: ' world', done: false },
      { done: true },
    ])
    const provider = makeProvider(stream)

    const loop = new AgentLoop({ provider: provider as any, model: 'gpt-4o' })
    const events = await collectEvents(loop, 'hi')

    const textEvents = events.filter((e) => e.type === 'text')
    expect(textEvents).toHaveLength(2)
    expect((textEvents[0] as any).chunk).toBe('Hello')
    expect((textEvents[1] as any).chunk).toBe(' world')
    expect(events[events.length - 1]?.type).toBe('done')
  })

  it('executes a tool and emits tool events', async () => {
    const toolCallChunk: StreamChunk = {
      toolCall: { id: 'tc1', name: 'read_file', input: { path: '/tmp/test.txt' } },
      done: false,
    }
    // First turn: tool call; second turn: final text
    let callCount = 0
    const provider = {
      chat: vi.fn().mockImplementation(() => {
        if (callCount++ === 0) {
          return Promise.resolve(makeStream([toolCallChunk, { done: true }]))
        }
        return Promise.resolve(makeStream([{ text: 'Done', done: false }, { done: true }]))
      }),
      listModels: vi.fn(),
      isAvailable: vi.fn().mockResolvedValue(true),
    }

    const tool = makeTool('read_file', { toolCallId: 'tc1', success: true, output: 'file contents' })
    const loop = new AgentLoop({ provider: provider as any, model: 'gpt-4o', tools: [tool as any] })
    const events = await collectEvents(loop, 'read the file')

    expect(events.some((e) => e.type === 'tool_start')).toBe(true)
    expect(events.some((e) => e.type === 'tool_result')).toBe(true)
    expect(tool.execute).toHaveBeenCalledWith({ path: '/tmp/test.txt' })
    expect(events[events.length - 1]?.type).toBe('done')
  })

  it('emits tool_confirm when requiresConfirmation=true and auto-approves', async () => {
    const toolCallChunk: StreamChunk = {
      toolCall: { id: 'tc2', name: 'write_file', input: { path: '/tmp/out.txt', content: 'hi' } },
      done: false,
    }
    let callCount = 0
    const provider = {
      chat: vi.fn().mockImplementation(() => {
        if (callCount++ === 0) {
          return Promise.resolve(makeStream([toolCallChunk, { done: true }]))
        }
        return Promise.resolve(makeStream([{ text: 'Written', done: false }, { done: true }]))
      }),
      listModels: vi.fn(),
      isAvailable: vi.fn().mockResolvedValue(true),
    }

    const tool = makeTool('write_file', { toolCallId: 'tc2', success: true, output: 'ok' }, true)
    // onConfirm auto-approves
    const loop = new AgentLoop({
      provider: provider as any,
      model: 'gpt-4o',
      tools: [tool as any],
      onConfirm: async (_req) => true,
    })
    const events = await collectEvents(loop, 'write the file')

    expect(events.some((e) => e.type === 'tool_confirm')).toBe(true)
    expect(tool.execute).toHaveBeenCalled()
  })

  it('skips tool execution when confirmation denied', async () => {
    const toolCallChunk: StreamChunk = {
      toolCall: { id: 'tc3', name: 'delete_file', input: { path: '/tmp/file.txt' } },
      done: false,
    }
    const provider = {
      chat: vi.fn().mockResolvedValue(makeStream([toolCallChunk, { done: true }])),
      listModels: vi.fn(),
      isAvailable: vi.fn().mockResolvedValue(true),
    }

    const tool = makeTool('delete_file', { toolCallId: 'tc3', success: true, output: 'deleted' }, true)
    const loop = new AgentLoop({
      provider: provider as any,
      model: 'gpt-4o',
      tools: [tool as any],
      onConfirm: async (_req) => false,
    })
    const events = await collectEvents(loop, 'delete the file')

    expect(tool.execute).not.toHaveBeenCalled()
    const toolResult = events.find((e) => e.type === 'tool_result') as any
    expect(toolResult?.result?.error).toContain('denied')
  })

  it('emits error event on provider failure', async () => {
    const provider = {
      chat: vi.fn().mockRejectedValue(new Error('Network error')),
      listModels: vi.fn(),
      isAvailable: vi.fn().mockResolvedValue(true),
    }

    const loop = new AgentLoop({ provider: provider as any, model: 'gpt-4o' })
    const events = await collectEvents(loop, 'hello')

    const errorEvent = events.find((e) => e.type === 'error') as any
    expect(errorEvent).toBeDefined()
    expect(errorEvent.error).toContain('Network error')
  })

  it('resumes conversation from initialMessages', async () => {
    const capturedRequests: ChatRequest[] = []
    const provider = {
      chat: vi.fn().mockImplementation(async (req: ChatRequest) => {
        capturedRequests.push(req)
        return makeStream([{ text: 'reply', done: false }, { done: true }])
      }),
      listModels: vi.fn(),
      isAvailable: vi.fn().mockResolvedValue(true),
    }

    const initial: Message[] = [
      { role: 'user', content: 'prior question', timestamp: 0 },
      { role: 'assistant', content: 'prior answer', timestamp: 0 },
    ]
    const loop = new AgentLoop({ provider: provider as any, model: 'gpt-4o', initialMessages: initial })
    await collectEvents(loop, 'follow-up question')

    // Provider receives: 2 initial + 1 new user = 3 messages
    expect(capturedRequests[0]?.messages).toHaveLength(3)
    expect(capturedRequests[0]?.messages[2]?.content).toBe('follow-up question')
  })

  it('accumulates history across multiple run() calls', async () => {
    const provider = {
      chat: vi.fn().mockImplementation(() =>
        Promise.resolve(makeStream([{ text: 'ok', done: false }, { done: true }])),
      ),
      listModels: vi.fn(),
      isAvailable: vi.fn().mockResolvedValue(true),
    }

    const loop = new AgentLoop({ provider: provider as any, model: 'gpt-4o' })
    await collectEvents(loop, 'first')
    await collectEvents(loop, 'second')

    const history = loop.getHistory()
    // At minimum: user:'first', assistant:'ok', user:'second', assistant:'ok'
    expect(history.length).toBeGreaterThanOrEqual(4)
    expect(history.filter((m) => m.role === 'user').map((m) => m.content))
      .toEqual(expect.arrayContaining(['first', 'second']))
  })

  it('sends tool_use ContentBlock in second turn request', async () => {
    const capturedRequests: ChatRequest[] = []
    let callCount = 0
    const provider = {
      chat: vi.fn().mockImplementation(async (req: ChatRequest) => {
        capturedRequests.push(req)
        if (callCount++ === 0) {
          return makeStream([
            { toolCall: { id: 'tc-read', name: 'read_file', input: { path: '/a.ts' } }, done: false },
            { done: true },
          ])
        }
        return makeStream([{ text: 'done', done: false }, { done: true }])
      }),
      listModels: vi.fn(),
      isAvailable: vi.fn().mockResolvedValue(true),
    }

    const tool = makeTool('read_file', { toolCallId: 'tc-read', success: true, output: 'const x = 1' })
    const loop = new AgentLoop({ provider: provider as any, model: 'model', tools: [tool as any] })
    await collectEvents(loop, 'read it')

    // Second request messages should contain ContentBlocks
    const secondReqMessages = capturedRequests[1]?.messages ?? []
    const assistantMsg = secondReqMessages.find((m) => m.role === 'assistant')
    expect(Array.isArray(assistantMsg?.content)).toBe(true)
    const blocks = assistantMsg?.content as ContentBlock[]
    expect(blocks.some((b) => b.type === 'tool_use' && b.id === 'tc-read')).toBe(true)

    const toolResultMsg = secondReqMessages[secondReqMessages.length - 1]
    expect(Array.isArray(toolResultMsg?.content)).toBe(true)
    const resultBlocks = toolResultMsg?.content as ContentBlock[]
    expect(resultBlocks.some((b) => b.type === 'tool_result' && b.toolCallId === 'tc-read')).toBe(true)
  })

  it('respects maxTurns limit', async () => {
    // Always return a tool call to create an infinite loop
    const toolCallChunk: StreamChunk = {
      toolCall: { id: 'tc_loop', name: 'loop_tool', input: {} },
      done: false,
    }
    const provider = {
      chat: vi.fn().mockResolvedValue(makeStream([toolCallChunk, { done: true }])),
      listModels: vi.fn(),
      isAvailable: vi.fn().mockResolvedValue(true),
    }

    const tool = makeTool('loop_tool', { toolCallId: 'tc_loop', success: true, output: 'looping' })
    const loop = new AgentLoop({
      provider: provider as any,
      model: 'gpt-4o',
      tools: [tool as any],
      maxTurns: 3,
    })
    const events = await collectEvents(loop, 'loop forever')

    expect(events[events.length - 1]?.type).toBe('done')
    // provider.chat called at most maxTurns times
    expect(provider.chat.mock.calls.length).toBeLessThanOrEqual(3)
  })
})
