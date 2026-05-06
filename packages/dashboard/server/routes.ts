import type { Router, Request, Response } from 'express'
import { Router as createRouter } from 'express'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { SessionManager, ConfigManager } from '@arix/core'
import type { Message } from '@arix/core'
import { ProviderFactory } from '@arix/providers'

const CONFIG_DIR = join(homedir(), '.arix')

interface LedgerEntry {
  sessionId: string
  provider: string
  model: string
  startedAt: string
  totalUsd: number | null
  totalInputTokens: number
  totalOutputTokens: number
  turns: Array<{ ts: string; usd: number | null }>
}

interface MemoryEntry {
  key: string
  value: string
  updatedAt?: string
}

async function loadCostLedger(): Promise<LedgerEntry[]> {
  try {
    const raw = await readFile(join(CONFIG_DIR, 'costs.json'), 'utf8')
    return JSON.parse(raw) as LedgerEntry[]
  } catch {
    return []
  }
}

async function loadMemory(cwd: string): Promise<MemoryEntry[]> {
  try {
    const raw = await readFile(join(cwd, '.arix-memory.json'), 'utf8')
    return JSON.parse(raw) as MemoryEntry[]
  } catch {
    return []
  }
}

export function createApiRouter(sessionManager: SessionManager): Router {
  const router = createRouter()

  // GET /api/sessions — list all sessions
  router.get('/sessions', async (_req: Request, res: Response) => {
    try {
      const summaries = await sessionManager.list()
      res.json(summaries)
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  })

  // GET /api/sessions/:id — single session detail
  router.get('/sessions/:id', async (req: Request, res: Response) => {
    try {
      const session = await sessionManager.load(req.params['id'] ?? '')
      if (session === null) {
        res.status(404).json({ error: 'Session not found' })
        return
      }
      res.json(session)
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  })

  // GET /api/sessions/:id/export — download as markdown
  router.get('/sessions/:id/export', async (req: Request, res: Response) => {
    try {
      const session = await sessionManager.load(req.params['id'] ?? '')
      if (session === null) {
        res.status(404).json({ error: 'Session not found' })
        return
      }

      const lines: string[] = [
        `# ${session.title}`,
        ``,
        `**Model:** ${session.model}  `,
        `**Provider:** ${session.provider}  `,
        `**Created:** ${new Date(session.createdAt).toLocaleString()}  `,
        `**Working Dir:** ${session.cwd}  `,
        ``,
        `---`,
        ``,
      ]

      for (const msg of session.messages) {
        if (msg.role === 'system') continue
        const label = msg.role === 'user' ? '**User**' : '**Assistant**'
        const text = typeof msg.content === 'string'
          ? msg.content
          : (msg.content as Array<{ type: string; text?: string }>)
              .filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n')
        lines.push(`${label}:`, ``, text, ``, `---`, ``)
      }

      const filename = `${session.id}.md`
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      res.send(lines.join('\n'))
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  })

  // GET /api/stats — aggregated statistics
  router.get('/stats', async (_req: Request, res: Response) => {
    try {
      const summaries = await sessionManager.list()
      const models: Record<string, number> = {}
      const providers: Record<string, number> = {}
      let totalMessages = 0
      let totalTokens = 0

      for (const s of summaries) {
        models[s.model] = (models[s.model] ?? 0) + 1
        providers[s.provider] = (providers[s.provider] ?? 0) + 1
        totalMessages += s.messageCount
      }

      // Sum token usage from full sessions if needed
      // For now, estimate from message counts (avoids loading all sessions)
      totalTokens = totalMessages * 500 // rough estimate

      // Load token usage from sessions in background when feasible
      // Full load is optional — summaries are fast

      res.json({
        totalSessions: summaries.length,
        totalMessages,
        totalTokens,
        models,
        providers,
      })
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  })

  // GET /api/costs — cost ledger with daily + model breakdown
  router.get('/costs', async (_req: Request, res: Response) => {
    try {
      const ledger = await loadCostLedger()

      // Daily totals
      const byDay: Record<string, number> = {}
      // Per-model totals
      const byModel: Record<string, { usd: number; sessions: number; input: number; output: number }> = {}

      for (const entry of ledger) {
        const day = entry.startedAt.slice(0, 10) // YYYY-MM-DD
        byDay[day] = (byDay[day] ?? 0) + (entry.totalUsd ?? 0)

        const mk = `${entry.provider}/${entry.model}`
        const existing = byModel[mk] ?? { usd: 0, sessions: 0, input: 0, output: 0 }
        existing.usd += entry.totalUsd ?? 0
        existing.sessions += 1
        existing.input += entry.totalInputTokens
        existing.output += entry.totalOutputTokens
        byModel[mk] = existing
      }

      // Last 30 days sorted
      const sortedDays = Object.entries(byDay)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-30)
        .map(([date, usd]) => ({ date, usd: Math.round(usd * 10000) / 10000 }))

      const sortedModels = Object.entries(byModel)
        .sort((a, b) => b[1].usd - a[1].usd)
        .map(([model, stats]) => ({ model, ...stats, usd: Math.round(stats.usd * 10000) / 10000 }))

      const totalUsd = ledger.reduce((acc, e) => acc + (e.totalUsd ?? 0), 0)

      res.json({
        totalUsd: Math.round(totalUsd * 10000) / 10000,
        totalSessions: ledger.length,
        byDay: sortedDays,
        byModel: sortedModels,
      })
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  })

  // GET /api/memory — project memory entries
  router.get('/memory', async (req: Request, res: Response) => {
    try {
      const cwd = typeof req.query['cwd'] === 'string' ? req.query['cwd'] : process.cwd()
      const entries = await loadMemory(cwd)
      res.json({ cwd, entries })
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  })

  // PUT /api/memory — update a memory entry
  router.put('/memory', async (req: Request, res: Response) => {
    try {
      const { cwd, key, value } = req.body as { cwd: string; key: string; value: string }
      if (!cwd || !key) { res.status(400).json({ error: 'cwd and key required' }); return }
      const entries = await loadMemory(cwd)
      const idx = entries.findIndex((e) => e.key === key)
      const entry: MemoryEntry = { key, value, updatedAt: new Date().toISOString() }
      if (idx >= 0) entries[idx] = entry
      else entries.push(entry)
      await writeFile(join(cwd, '.arix-memory.json'), JSON.stringify(entries, null, 2), 'utf8')
      res.json({ ok: true })
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  })

  // DELETE /api/memory/:key — remove a memory entry
  router.delete('/memory/:key', async (req: Request, res: Response) => {
    try {
      const { cwd } = req.query as { cwd?: string }
      const dir = cwd ?? process.cwd()
      const key = decodeURIComponent(req.params['key'] ?? '')
      const entries = await loadMemory(dir)
      if (entries.length === 0) {
        // Nothing to delete — file didn't exist
        res.json({ ok: true })
        return
      }
      const filtered = entries.filter((e) => e.key !== key)
      await writeFile(join(dir, '.arix-memory.json'), JSON.stringify(filtered, null, 2), 'utf8')
      res.json({ ok: true })
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  })

  // POST /api/chat — Server-Sent Events streaming chat
  router.post('/chat', async (req: Request, res: Response) => {
    const body = req.body as {
      messages?: Message[]
      provider?: string
      model?: string
      temperature?: number
      maxTokens?: number
    }

    if (!body.messages || body.messages.length === 0) {
      res.status(400).json({ error: 'messages required' })
      return
    }

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders?.()

    const send = (event: string, data: unknown): void => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    }

    let aborted = false
    req.on('close', () => { aborted = true })

    try {
      const configManager = new ConfigManager(CONFIG_DIR)
      const config = await configManager.load()
      const providerName = body.provider ?? config.provider ?? 'anthropic'
      const apiKey = configManager.resolveApiKey(providerName)
      const provider = ProviderFactory.create(providerName, apiKey ? { apiKey } : {})
      const model = body.model ?? config.model ?? 'claude-sonnet-4-6'

      const stream = await provider.chat({
        model,
        messages: body.messages,
        ...(body.temperature !== undefined ? { temperature: body.temperature } : {}),
        ...(body.maxTokens !== undefined ? { maxTokens: body.maxTokens } : {}),
        ...(config.systemPrompt ? { systemPrompt: config.systemPrompt } : {}),
      })

      for await (const chunk of stream) {
        if (aborted) break
        if (chunk.error) { send('error', { message: chunk.error }); break }
        if (chunk.text) send('text', { chunk: chunk.text })
        if (chunk.usage) send('usage', chunk.usage)
        if (chunk.done) break
      }
      if (!aborted) send('done', { ok: true })
    } catch (err: unknown) {
      send('error', { message: err instanceof Error ? err.message : String(err) })
    } finally {
      res.end()
    }
  })

  return router
}
