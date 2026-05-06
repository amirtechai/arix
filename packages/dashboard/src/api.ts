import type { Session, SessionSummary, Stats, CostData, MemoryData } from './types.js'

const BASE = '/api'

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`)
  return res.json() as Promise<T>
}

async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`)
  return res.json() as Promise<T>
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`)
  return res.json() as Promise<T>
}

export const api = {
  listSessions: (): Promise<SessionSummary[]> => get('/sessions'),
  getSession: (id: string): Promise<Session> => get(`/sessions/${id}`),
  getStats: (): Promise<Stats> => get('/stats'),
  exportUrl: (id: string): string => `${BASE}/sessions/${id}/export`,
  getCosts: (): Promise<CostData> => get('/costs'),
  getMemory: (cwd?: string): Promise<MemoryData> => get(`/memory${cwd ? `?cwd=${encodeURIComponent(cwd)}` : ''}`),
  updateMemory: (cwd: string, key: string, value: string): Promise<{ ok: boolean }> =>
    put('/memory', { cwd, key, value }),
  deleteMemory: (key: string, cwd?: string): Promise<{ ok: boolean }> =>
    del(`/memory/${encodeURIComponent(key)}${cwd ? `?cwd=${encodeURIComponent(cwd)}` : ''}`),

  /**
   * Stream a chat completion. Returns an async iterator of events from the SSE
   * endpoint. Caller can pass an AbortSignal to cancel.
   */
  async *streamChat(
    body: { messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>; provider?: string; model?: string },
    signal?: AbortSignal,
  ): AsyncGenerator<{ event: string; data: unknown }> {
    const res = await fetch(`${BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
    if (!res.ok || !res.body) throw new Error(`Chat error ${res.status}`)

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // SSE messages are separated by blank lines
      let idx: number
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        const raw = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)
        let event = 'message'
        let data = ''
        for (const line of raw.split('\n')) {
          if (line.startsWith('event: ')) event = line.slice(7)
          else if (line.startsWith('data: ')) data += line.slice(6)
        }
        try {
          yield { event, data: JSON.parse(data) }
        } catch {
          yield { event, data }
        }
      }
    }
  },
}
