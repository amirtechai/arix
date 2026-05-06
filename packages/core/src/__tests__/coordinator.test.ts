import { describe, it, expect } from 'vitest'
import { CoordinatorAgent, TeamMemory } from '../coordinator/index.js'
import { AgentLoop, BaseProvider } from '../index.js'
import type { ChatRequest, StreamChunk, ModelInfo, TaskType } from '../index.js'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeStream(chunks: StreamChunk[]): AsyncIterable<StreamChunk> {
  async function* g() { for (const c of chunks) yield c }
  return g()
}

class ScriptedProvider extends BaseProvider {
  readonly id = 'scripted'
  readonly name = 'Scripted'
  private scripts: StreamChunk[][]
  constructor(scripts: StreamChunk[][]) { super(); this.scripts = [...scripts] }
  supportsTools() { return false }
  supportsVision() { return false }
  async listModels(): Promise<ModelInfo[]> { return [] }
  async chat(_req: ChatRequest): Promise<AsyncIterable<StreamChunk>> {
    const s = this.scripts.shift()
    if (!s) return makeStream([{ done: true }])
    return makeStream(s)
  }
}

// ── TeamMemory tests ──────────────────────────────────────────────────────────

describe('TeamMemory', () => {
  it('stores and retrieves entries', () => {
    const mem = new TeamMemory('/tmp/test-memory.json')
    mem.set('key1', 'value1')
    expect(mem.get('key1')).toBe('value1')
  })

  it('updates existing entry', () => {
    const mem = new TeamMemory('/tmp/test-memory.json')
    mem.set('key1', 'v1')
    mem.set('key1', 'v2')
    expect(mem.get('key1')).toBe('v2')
  })

  it('toContextString returns empty when no entries', () => {
    const mem = new TeamMemory('/tmp/test-memory.json')
    expect(mem.toContextString()).toBe('')
  })

  it('toContextString formats entries', () => {
    const mem = new TeamMemory('/tmp/test-memory.json')
    mem.set('project', 'Arix CLI')
    const ctx = mem.toContextString()
    expect(ctx).toContain('Team Memory')
    expect(ctx).toContain('Arix CLI')
  })
})

// ── CoordinatorAgent tests ────────────────────────────────────────────────────

describe('CoordinatorAgent', () => {
  function makeFactory(scripts: StreamChunk[][][]) {
    let callIdx = 0
    return (_type: TaskType, _sys?: string) => {
      const providerScripts = scripts[callIdx++] ?? [[{ done: true }]]
      const provider = new ScriptedProvider(providerScripts)
      return new AgentLoop({ provider, model: 'test' })
    }
  }

  it('surfaces coordinator text events', async () => {
    const planText = 'TASK[1]: type=general prompt=Simple task\nDone.'
    const factory = makeFactory([
      // coordinator turn
      [[{ text: planText, done: false }, { done: true }]],
      // sub-task execution
      [[{ text: 'Sub result', done: false }, { done: true }]],
      // synthesis
      [[{ text: 'Final summary', done: false }, { done: true }]],
    ])

    const coordinator = new CoordinatorAgent({ agentFactory: factory })
    const events: string[] = []
    for await (const ev of coordinator.run('Do a simple task')) {
      events.push(ev.type)
    }
    expect(events).toContain('text')
    expect(events).toContain('done')
  })

  it('handles direct answer with no TASK lines', async () => {
    const factory = makeFactory([
      [[{ text: 'Direct answer without tasks', done: false }, { done: true }]],
    ])
    const coordinator = new CoordinatorAgent({ agentFactory: factory })
    const texts: string[] = []
    for await (const ev of coordinator.run('Quick question')) {
      if (ev.type === 'text') texts.push(ev.chunk)
    }
    expect(texts.join('')).toContain('Direct answer')
  })

  it('integrates with TeamMemory', async () => {
    const mem = new TeamMemory('/tmp/test-team-mem.json')
    mem.set('context', 'TypeScript project')

    const planText = 'TASK[1]: type=coding prompt=Fix bug\n'
    const factory = makeFactory([
      [[{ text: planText, done: false }, { done: true }]],
      [[{ text: 'Fixed the bug', done: false }, { done: true }]],
      [[{ text: 'Summary', done: false }, { done: true }]],
    ])
    const coordinator = new CoordinatorAgent({ agentFactory: factory, teamMemory: mem })
    for await (const _ of coordinator.run('Fix the bug')) { /* consume */ }

    // Memory should have been updated with sub-task result
    expect(mem.get('task-1-result')).toBeDefined()
  })
})
