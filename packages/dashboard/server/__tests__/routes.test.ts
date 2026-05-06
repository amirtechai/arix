import { describe, it, expect, beforeEach, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createApiRouter } from '../routes.js'
import type { SessionSummary, Session } from '@arix/core'

// Minimal mock matching SessionManager interface
function makeSessionManager(overrides?: Partial<{
  list: () => Promise<SessionSummary[]>
  load: (id: string) => Promise<Session | null>
}>) {
  return {
    list: overrides?.list ?? (() => Promise.resolve([])),
    load: overrides?.load ?? ((_id: string) => Promise.resolve(null)),
  } as unknown as import('@arix/core').SessionManager
}

function makeApp(sm: ReturnType<typeof makeSessionManager>) {
  const app = express()
  app.use(express.json())
  app.use('/api', createApiRouter(sm))
  return app
}

const MOCK_SUMMARY: SessionSummary = {
  id: 'test-id',
  title: 'Test session',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T01:00:00Z',
  provider: 'openrouter',
  model: 'claude-3-5-sonnet',
  messageCount: 4,
}

const MOCK_SESSION: Session = {
  id: 'test-id',
  title: 'Test session',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T01:00:00Z',
  cwd: '/home/user/project',
  provider: 'openrouter',
  model: 'claude-3-5-sonnet',
  messages: [
    { role: 'user', content: 'Hello', timestamp: 1704067200000 },
    { role: 'assistant', content: 'Hi there!', timestamp: 1704067201000 },
  ],
  toolCalls: [],
  tokenUsage: { input: 100, output: 200 },
}

describe('GET /api/sessions', () => {
  it('returns empty array when no sessions', async () => {
    const app = makeApp(makeSessionManager())
    const res = await request(app).get('/api/sessions')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('returns session list', async () => {
    const app = makeApp(makeSessionManager({ list: () => Promise.resolve([MOCK_SUMMARY]) }))
    const res = await request(app).get('/api/sessions')
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].id).toBe('test-id')
  })
})

describe('GET /api/sessions/:id', () => {
  it('returns 404 when session not found', async () => {
    const app = makeApp(makeSessionManager())
    const res = await request(app).get('/api/sessions/missing')
    expect(res.status).toBe(404)
  })

  it('returns session data', async () => {
    const app = makeApp(makeSessionManager({ load: () => Promise.resolve(MOCK_SESSION) }))
    const res = await request(app).get('/api/sessions/test-id')
    expect(res.status).toBe(200)
    expect(res.body.id).toBe('test-id')
    expect(res.body.messages).toHaveLength(2)
  })
})

describe('GET /api/sessions/:id/export', () => {
  it('returns markdown content', async () => {
    const app = makeApp(makeSessionManager({ load: () => Promise.resolve(MOCK_SESSION) }))
    const res = await request(app).get('/api/sessions/test-id/export')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/markdown/)
    expect(res.text).toContain('# Test session')
    expect(res.text).toContain('**User**')
    expect(res.text).toContain('Hello')
    expect(res.text).toContain('**Assistant**')
    expect(res.text).toContain('Hi there!')
  })

  it('returns 404 when session not found', async () => {
    const app = makeApp(makeSessionManager())
    const res = await request(app).get('/api/sessions/missing/export')
    expect(res.status).toBe(404)
  })
})

describe('GET /api/stats', () => {
  it('returns zero stats when empty', async () => {
    const app = makeApp(makeSessionManager())
    const res = await request(app).get('/api/stats')
    expect(res.status).toBe(200)
    expect(res.body.totalSessions).toBe(0)
    expect(res.body.totalMessages).toBe(0)
    expect(res.body.models).toEqual({})
    expect(res.body.providers).toEqual({})
  })

  it('aggregates stats from sessions', async () => {
    const summaries: SessionSummary[] = [
      { ...MOCK_SUMMARY, model: 'claude-3-5-sonnet', provider: 'openrouter', messageCount: 4 },
      { ...MOCK_SUMMARY, id: 'id2', model: 'gpt-4o', provider: 'openai', messageCount: 2 },
    ]
    const app = makeApp(makeSessionManager({ list: () => Promise.resolve(summaries) }))
    const res = await request(app).get('/api/stats')
    expect(res.status).toBe(200)
    expect(res.body.totalSessions).toBe(2)
    expect(res.body.totalMessages).toBe(6)
    expect(res.body.models['claude-3-5-sonnet']).toBe(1)
    expect(res.body.models['gpt-4o']).toBe(1)
    expect(res.body.providers['openrouter']).toBe(1)
    expect(res.body.providers['openai']).toBe(1)
  })
})

describe('GET /api/costs', () => {
  it('returns zero totals when no cost ledger exists', async () => {
    const app = makeApp(makeSessionManager())
    const res = await request(app).get('/api/costs')
    expect(res.status).toBe(200)
    expect(res.body.totalUsd).toBe(0)
    expect(res.body.totalSessions).toBe(0)
    expect(res.body.byDay).toEqual([])
    expect(res.body.byModel).toEqual([])
  })
})

describe('GET /api/memory', () => {
  it('returns empty entries when no memory file exists', async () => {
    const app = makeApp(makeSessionManager())
    const tmpDir = '/tmp/arix-test-memory-' + Date.now()
    const res = await request(app).get('/api/memory').query({ cwd: tmpDir })
    expect(res.status).toBe(200)
    expect(res.body.cwd).toBe(tmpDir)
    expect(res.body.entries).toEqual([])
  })
})

describe('PUT /api/memory', () => {
  it('returns 400 when cwd or key missing', async () => {
    const app = makeApp(makeSessionManager())
    const res = await request(app).put('/api/memory').send({ value: 'test' })
    expect(res.status).toBe(400)
  })
})

describe('POST /api/chat', () => {
  it('returns 400 when messages missing', async () => {
    const app = makeApp(makeSessionManager())
    const res = await request(app).post('/api/chat').send({})
    expect(res.status).toBe(400)
  })

  it('returns 400 when messages array empty', async () => {
    const app = makeApp(makeSessionManager())
    const res = await request(app).post('/api/chat').send({ messages: [] })
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/memory/:key', () => {
  it('returns ok even when memory file does not exist', async () => {
    const app = makeApp(makeSessionManager())
    const tmpDir = '/tmp/arix-test-del-' + Date.now()
    const res = await request(app)
      .delete('/api/memory/some-key')
      .query({ cwd: tmpDir })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })
})
