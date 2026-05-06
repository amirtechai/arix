import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { SessionManager } from '../session/index.js'

let storageDir: string
let manager: SessionManager

beforeEach(async () => {
  storageDir = await mkdtemp(join(tmpdir(), 'arix-session-'))
  manager = new SessionManager(storageDir)
})

afterEach(async () => {
  await rm(storageDir, { recursive: true, force: true })
})

describe('SessionManager', () => {
  it('creates a session with defaults', async () => {
    const session = await manager.create({ cwd: '/tmp', provider: 'anthropic', model: 'claude-3-5-sonnet' })
    expect(session.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(session.title).toBe('New session')
    expect(session.provider).toBe('anthropic')
    expect(session.model).toBe('claude-3-5-sonnet')
    expect(session.messages).toEqual([])
    expect(session.tokenUsage).toEqual({ input: 0, output: 0 })
  })

  it('creates a session with custom title', async () => {
    const session = await manager.create({ cwd: '/tmp', provider: 'openai', model: 'gpt-4o', title: 'My session' })
    expect(session.title).toBe('My session')
  })

  it('saves and loads a session', async () => {
    const session = await manager.create({ cwd: '/tmp', provider: 'anthropic', model: 'claude-3-5-sonnet' })
    session.messages.push({ role: 'user', content: 'hello', timestamp: Date.now() })
    await manager.save(session)

    const loaded = await manager.load(session.id)
    expect(loaded.messages).toHaveLength(1)
    expect(loaded.messages[0]?.content).toBe('hello')
  })

  it('throws SESSION_NOT_FOUND for missing id', async () => {
    await expect(manager.load('nonexistent-id')).rejects.toMatchObject({
      code: 'SESSION_NOT_FOUND',
    })
  })

  it('lists sessions as summaries', async () => {
    await manager.create({ cwd: '/tmp', provider: 'anthropic', model: 'claude-3-5-sonnet' })
    await manager.create({ cwd: '/tmp', provider: 'openai', model: 'gpt-4o' })
    const list = await manager.list()
    expect(list).toHaveLength(2)
    expect(list[0]).not.toHaveProperty('messages')
  })

  it('deletes a session', async () => {
    const session = await manager.create({ cwd: '/tmp', provider: 'anthropic', model: 'claude-3-5-sonnet' })
    await manager.delete(session.id)
    const list = await manager.list()
    expect(list).toHaveLength(0)
  })

  it('finds sessions by prefix', async () => {
    const session = await manager.create({ cwd: '/tmp', provider: 'anthropic', model: 'claude-3-5-sonnet' })
    const prefix = session.id.slice(0, 8)
    const found = await manager.find(prefix)
    expect(found).toHaveLength(1)
    expect(found[0]?.id).toBe(session.id)
  })

  it('loads latest session', async () => {
    await manager.create({ cwd: '/tmp', provider: 'anthropic', model: 'claude-3-5-sonnet' })
    const second = await manager.create({ cwd: '/tmp', provider: 'openai', model: 'gpt-4o' })
    const latest = await manager.loadLatest()
    expect(latest?.id).toBe(second.id)
  })

  it('returns null for loadLatest when empty', async () => {
    const latest = await manager.loadLatest()
    expect(latest).toBeNull()
  })

  it('generates title from first message', () => {
    const title = manager.generateTitle('What is the capital of France? I need to know for my geography quiz.')
    expect(title).toHaveLength(60)
    expect(title.startsWith('What is the capital')).toBe(true)
  })

  it('exports session to file', async () => {
    const session = await manager.create({ cwd: '/tmp', provider: 'anthropic', model: 'claude-3-5-sonnet' })
    const outputPath = join(storageDir, 'export.json')
    await manager.export(session.id, outputPath)

    const { readFile } = await import('node:fs/promises')
    const content = await readFile(outputPath, 'utf-8')
    const parsed = JSON.parse(content)
    expect(parsed.id).toBe(session.id)
  })
})
