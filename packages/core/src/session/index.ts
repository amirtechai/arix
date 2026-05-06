import { readFile, writeFile, mkdir, rm, rename } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { ArixError } from '../errors.js'
import type { Message, ToolCall } from '../types.js'

export interface SessionMetadata {
  cwd: string
  provider: string
  model: string
  title?: string
}

export interface Session {
  id: string
  createdAt: string
  updatedAt: string
  title: string
  cwd: string
  provider: string
  model: string
  messages: Message[]
  toolCalls: ToolCall[]
  tokenUsage: { input: number; output: number }
}

export interface SessionSummary {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  provider: string
  model: string
  messageCount: number
}

export class SessionManager {
  private readonly storageDir: string
  private readonly indexPath: string

  constructor(storageDir: string) {
    this.storageDir = resolve(storageDir)
    this.indexPath = join(this.storageDir, 'index.json')
  }

  private async ensureDir(): Promise<void> {
    await mkdir(this.storageDir, { recursive: true })
  }

  private sessionPath(id: string): string {
    return join(this.storageDir, `${id}.json`)
  }

  generateTitle(firstMessage: string): string {
    return firstMessage.slice(0, 60).replace(/\n/g, ' ').trim()
  }

  async create(metadata: SessionMetadata): Promise<Session> {
    await this.ensureDir()
    const now = new Date().toISOString()
    const session: Session = {
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      title: metadata.title ?? 'New session',
      cwd: metadata.cwd,
      provider: metadata.provider,
      model: metadata.model,
      messages: [],
      toolCalls: [],
      tokenUsage: { input: 0, output: 0 },
    }
    await this.save(session)
    return session
  }

  async save(session: Session): Promise<void> {
    await this.ensureDir()
    session.updatedAt = new Date().toISOString()
    const tmpPath = this.sessionPath(session.id) + '.tmp'
    await writeFile(tmpPath, JSON.stringify(session, null, 2), 'utf-8')
    await rename(tmpPath, this.sessionPath(session.id))
    await this.updateIndex(session)
  }

  async load(id: string): Promise<Session> {
    const path = this.sessionPath(id)
    if (!existsSync(path)) {
      throw new ArixError('SESSION_NOT_FOUND', `Session not found: ${id}`)
    }
    const content = await readFile(path, 'utf-8')
    return JSON.parse(content) as Session
  }

  async find(prefix: string): Promise<Session[]> {
    const summaries = await this.list()
    const matches = summaries.filter((s) => s.id.startsWith(prefix))
    return Promise.all(matches.map((s) => this.load(s.id)))
  }

  async loadLatest(): Promise<Session | null> {
    const summaries = await this.list()
    if (summaries.length === 0) return null
    // Stable sort: by updatedAt desc, then by array position desc (last inserted wins on ties)
    const indexed = summaries.map((s, i) => ({ s, i }))
    indexed.sort((a, b) => {
      const timeDiff = new Date(b.s.updatedAt).getTime() - new Date(a.s.updatedAt).getTime()
      return timeDiff !== 0 ? timeDiff : b.i - a.i
    })
    const latest = indexed[0]!.s
    return this.load(latest.id)
  }

  async list(): Promise<SessionSummary[]> {
    if (!existsSync(this.indexPath)) return []
    const content = await readFile(this.indexPath, 'utf-8')
    return JSON.parse(content) as SessionSummary[]
  }

  async delete(id: string): Promise<void> {
    const path = this.sessionPath(id)
    if (existsSync(path)) await rm(path)
    const summaries = await this.list()
    const updated = summaries.filter((s) => s.id !== id)
    await this.writeIndex(updated)
  }

  async export(id: string, outputPath: string): Promise<void> {
    const session = await this.load(id)
    await writeFile(resolve(outputPath), JSON.stringify(session, null, 2), 'utf-8')
  }

  private async updateIndex(session: Session): Promise<void> {
    const summaries = await this.list()
    const idx = summaries.findIndex((s) => s.id === session.id)
    const summary: SessionSummary = {
      id: session.id,
      title: session.title,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      provider: session.provider,
      model: session.model,
      messageCount: session.messages.length,
    }
    if (idx >= 0) {
      summaries[idx] = summary
    } else {
      summaries.push(summary)
    }
    await this.writeIndex(summaries)
  }

  private async writeIndex(summaries: SessionSummary[]): Promise<void> {
    const tmpPath = this.indexPath + '.tmp'
    await writeFile(tmpPath, JSON.stringify(summaries, null, 2), 'utf-8')
    await rename(tmpPath, this.indexPath)
  }
}
