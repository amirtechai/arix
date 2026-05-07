/**
 * Bootstrap integration test — wires all packages together with a mock provider.
 * Exercises: config loading, tool registration, skill resolution, agent loop.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from "node:fs/promises"
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { AgentLoop, ConfigManager, SessionManager, SkillManager } from '@arix-code/core'

// Minimal mock provider
function makeMockProvider() {
  return {
    chat: vi.fn().mockImplementation(async function* () {
      yield { text: 'Hello from mock', done: false }
      yield { done: true }
    }),
    listModels: vi.fn().mockResolvedValue([]),
    isAvailable: vi.fn().mockResolvedValue(true),
  }
}

describe('bootstrap integration', () => {
  let configDir: string

  beforeEach(async () => {
    configDir = await mkdtemp(join(tmpdir(), 'arix-int-'))
  })

  afterEach(async () => {
    await rm(configDir, { recursive: true, force: true })
  })

  it('ConfigManager creates default config on first load', async () => {
    const mgr = new ConfigManager(configDir)
    const config = await mgr.load()
    expect(config.provider).toBe('anthropic')
    expect(config.maxTurns).toBe(20)
    expect(config.permissionMode).toBe('standard')
  })

  it('ConfigManager persists and reloads values', async () => {
    const mgr = new ConfigManager(configDir)
    await mgr.set('provider', 'openai')
    await mgr.set('maxTurns', 5)
    const config = await mgr.load()
    expect(config.provider).toBe('openai')
    expect(config.maxTurns).toBe(5)
  })

  it('SessionManager creates and loads a session', async () => {
    const sm = new SessionManager(join(configDir, 'sessions'))
    const session = await sm.create({ cwd: '/tmp', provider: 'anthropic', model: 'claude-3-5-sonnet' })
    expect(session.id).toHaveLength(36)  // UUID
    const loaded = await sm.load(session.id)
    expect(loaded.id).toBe(session.id)
  })

  it('AgentLoop produces text events with mock provider', async () => {
    const provider = makeMockProvider()
    const loop = new AgentLoop({ provider: provider as any, model: 'test-model' })

    const events = []
    for await (const event of loop.run('hello')) {
      events.push(event)
    }

    const textEvents = events.filter((e) => e.type === 'text')
    expect(textEvents.length).toBeGreaterThan(0)
    expect((textEvents[0] as any).chunk).toBe('Hello from mock')
    expect(events[events.length - 1]?.type).toBe('done')
  })

  it('SkillManager resolves built-in skill and provides system prompt', async () => {
    const sm = new SkillManager()
    const skill = sm.get('coding')
    expect(skill).toBeDefined()
    expect(skill!.systemPrompt.length).toBeGreaterThan(20)
  })

  it('AgentLoop uses skill system prompt when provided', async () => {
    const capturedRequests: any[] = []
    const provider = {
      chat: vi.fn().mockImplementation(async (req: any) => {
        capturedRequests.push(req)
        return (async function* () {
          yield { text: 'ok', done: false }
          yield { done: true }
        })()
      }),
      listModels: vi.fn(),
      isAvailable: vi.fn().mockResolvedValue(true),
    }

    const loop = new AgentLoop({
      provider: provider as any,
      model: 'test-model',
      systemPrompt: 'You are a test assistant.',
    })

    for await (const _ of loop.run('hi')) { /* consume */ }

    expect(capturedRequests[0]?.systemPrompt).toBe('You are a test assistant.')
  })
})
