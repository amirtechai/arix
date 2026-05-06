import express from 'express'
import cors from 'cors'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { SessionManager } from '@arix/core'
import { createApiRouter } from './routes.js'

export interface DashboardOptions {
  port?: number
  storageDir: string
  open?: boolean
}

export interface DashboardServer {
  port: number
  url: string
  close: () => Promise<void>
}

export async function startDashboard(opts: DashboardOptions): Promise<DashboardServer> {
  const port = opts.port ?? 7432
  const sessionManager = new SessionManager(opts.storageDir)

  const app = express()
  app.use(cors())
  app.use(express.json())

  // API routes
  app.use('/api', createApiRouter(sessionManager))

  // Serve built frontend
  const thisDir = fileURLToPath(new URL('.', import.meta.url))
  const staticDir = join(thisDir, '..', 'static')

  if (existsSync(staticDir)) {
    app.use(express.static(staticDir))
    // SPA fallback
    app.get('*', (_req, res) => {
      res.sendFile(join(staticDir, 'index.html'))
    })
  } else {
    app.get('/', (_req, res) => {
      res.send(
        '<html><body style="background:#0f1117;color:#e2e8f0;font-family:monospace;padding:2rem">' +
          '<h2>Arix Dashboard</h2>' +
          '<p>Frontend not built yet. Run <code>pnpm build:fe</code> in packages/dashboard.</p>' +
          '<p><a href="/api/sessions" style="color:#6c7dff">View API: /api/sessions</a></p>' +
          '</body></html>',
      )
    })
  }

  return new Promise((resolve, reject) => {
    const server = app.listen(port, '127.0.0.1', () => {
      const url = `http://localhost:${port}`
      resolve({
        port,
        url,
        close: () =>
          new Promise((res, rej) => server.close((err) => (err ? rej(err) : res()))),
      })
    })
    server.once('error', reject)
  })
}
