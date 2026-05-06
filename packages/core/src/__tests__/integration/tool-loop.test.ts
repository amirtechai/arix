import { describe, it, expect, vi } from 'vitest'
import { AgentLoop, BaseProvider, ArixError } from '../../index.js'
import type { ChatRequest, StreamChunk, ModelInfo, Tool, ToolResult } from '../../index.js'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeStream(chunks: StreamChunk[]): AsyncIterable<StreamChunk> {
  async function* g() { for (const c of chunks) yield c }
  return g()
}

class ScriptedProvider extends BaseProvider {
  readonly id = 'scripted'
  readonly name = 'Scripted'
  private calls: ChatRequest[] = []
  private scripts: StreamChunk[][]

  constructor(scripts: StreamChunk[][]) {
    super()
    this.scripts = [...scripts]
  }

  getCalls() { return this.calls }
  supportsTools() { return true }
  supportsVision() { return false }
  async listModels(): Promise<ModelInfo[]> { return [] }

  async chat(req: ChatRequest): Promise<AsyncIterable<StreamChunk>> {
    this.calls.push(req)
    const script = this.scripts.shift()
    if (!script) throw new ArixError('PROVIDER_UNAVAILABLE', 'No more scripts')
    return makeStream(script)
  }
}

function echoTool(name: string): Tool {
  return {
    name,
    description: `Echo tool: ${name}`,
    requiresConfirmation: false,
    inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    async execute(input): Promise<ToolResult> {
      return { toolCallId: '', success: true, output: `echo: ${input['text'] as string}` }
    },
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Tool Execution Loop Integration', () => {
  it('single text response — no tool calls', async () => {
    const provider = new ScriptedProvider([
      [{ text: 'Hello!', done: false }, { done: true }],
    ])
    const loop = new AgentLoop({ provider, model: 'test-model' })
    const events: string[] = []
    for await (const ev of loop.run('Hi')) {
      events.push(ev.type)
    }
    expect(events).toContain('text')
    expect(events).toContain('done')
    expect(provider.getCalls()).toHaveLength(1)
  })

  it('tool call → result → second turn', async () => {
    const provider = new ScriptedProvider([
      // Turn 1: tool call
      [
        { toolCall: { id: 'tc-1', name: 'echo', input: { text: 'hello' } }, done: false },
        { done: true },
      ],
      // Turn 2: final text after tool result
      [{ text: 'Done', done: false }, { done: true }],
    ])
    const loop = new AgentLoop({ provider, model: 'test-model', tools: [echoTool('echo')] })

    const toolResults: string[] = []
    for await (const ev of loop.run('test')) {
      if (ev.type === 'tool_result') toolResults.push(ev.result.output)
    }

    expect(toolResults).toHaveLength(1)
    expect(toolResults[0]).toBe('echo: hello')
    // Second turn must have received tool_result ContentBlock
    const secondCall = provider.getCalls()[1]!
    const lastMsg = secondCall.messages[secondCall.messages.length - 1]!
    expect(Array.isArray(lastMsg.content)).toBe(true)
    const blocks = lastMsg.content as Array<{ type: string }>
    expect(blocks.some((b) => b.type === 'tool_result')).toBe(true)
  })

  it('unknown tool returns error result', async () => {
    const provider = new ScriptedProvider([
      [
        { toolCall: { id: 'tc-x', name: 'nonexistent', input: {} }, done: false },
        { done: true },
      ],
      [{ text: 'ok', done: false }, { done: true }],
    ])
    const loop = new AgentLoop({ provider, model: 'm' })

    const results: ToolResult[] = []
    for await (const ev of loop.run('go')) {
      if (ev.type === 'tool_result') results.push(ev.result)
    }
    expect(results[0]?.success).toBe(false)
    expect(results[0]?.error).toContain('Unknown tool')
  })

  it('onConfirm=false denies tool and stops', async () => {
    const tool: Tool = {
      ...echoTool('sensitive'),
      requiresConfirmation: true,
    }
    const provider = new ScriptedProvider([
      [
        { toolCall: { id: 'tc-2', name: 'sensitive', input: { text: 'x' } }, done: false },
        { done: true },
      ],
      [{ text: 'fallback', done: false }, { done: true }],
    ])
    const loop = new AgentLoop({
      provider,
      model: 'm',
      tools: [tool],
      onConfirm: async () => false,
    })

    const results: ToolResult[] = []
    for await (const ev of loop.run('go')) {
      if (ev.type === 'tool_result') results.push(ev.result)
    }
    expect(results[0]?.error).toContain('denied')
  })

  it('respects maxTurns limit', async () => {
    // Each turn returns another tool call → should stop at maxTurns
    const scripts: StreamChunk[][] = Array.from({ length: 10 }, (_, i) => [
      { toolCall: { id: `tc-${i}`, name: 'echo', input: { text: 'x' } }, done: false },
      { done: true },
    ])
    const provider = new ScriptedProvider(scripts)
    const loop = new AgentLoop({
      provider,
      model: 'm',
      tools: [echoTool('echo')],
      maxTurns: 3,
    })

    const events: string[] = []
    for await (const ev of loop.run('go')) events.push(ev.type)

    expect(provider.getCalls().length).toBeLessThanOrEqual(3)
  })

  it('error chunk propagates as error event', async () => {
    const provider = new ScriptedProvider([
      [{ error: 'network timeout', done: false }],
    ])
    const loop = new AgentLoop({ provider, model: 'm' })

    const events: Array<{ type: string; error?: string }> = []
    for await (const ev of loop.run('test')) {
      events.push(ev as { type: string; error?: string })
    }
    const errEv = events.find((e) => e.type === 'error')
    expect(errEv?.error).toContain('network timeout')
  })

  it('history is persisted after successful run', async () => {
    const provider = new ScriptedProvider([
      [{ text: 'response', done: false }, { done: true }],
    ])
    const loop = new AgentLoop({ provider, model: 'm' })
    for await (const _ of loop.run('hello')) { /* consume */ }
    const history = loop.getHistory()
    expect(history.length).toBe(2) // user + assistant
    expect(history[0]?.role).toBe('user')
    expect(history[1]?.role).toBe('assistant')
  })
})

describe('ProviderRegistry lazy loading', () => {
  it('instantiates provider only on first get()', async () => {
    const { ProviderRegistry } = await import('../../provider/registry.js')
    const reg = new ProviderRegistry()
    let instantiated = false
    reg.registerLazy('lazy', () => {
      instantiated = true
      return {
        id: 'lazy', name: 'Lazy',
        supportsTools: () => false, supportsVision: () => false,
        listModels: async () => [],
        chat: async () => { async function* g() { yield { done: true as const } } return g() },
      } as unknown as import('../../provider/base.js').Provider
    })
    expect(instantiated).toBe(false)
    reg.get('lazy')
    expect(instantiated).toBe(true)
  })
})
