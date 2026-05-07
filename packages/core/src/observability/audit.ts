/**
 * Audit log (I5) — append-only NDJSON record of every tool call, confirmation
 * decision, provider request, and config mutation. Records include a SHA-256
 * chain so tampering is detectable.
 */

import { appendFile, readFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { createHash } from 'node:crypto'

export interface AuditEntry {
  ts: string
  actor: string
  action: string
  details: Record<string, unknown>
  prevHash: string | null
  hash: string
}

export class AuditLog {
  private readonly path: string
  private lastHash: string | null = null

  constructor(filePath?: string) {
    this.path = filePath ?? join(homedir(), '.arix', 'audit.log')
  }

  async append(actor: string, action: string, details: Record<string, unknown> = {}): Promise<AuditEntry> {
    if (!existsSync(this.path)) {
      await mkdir(dirname(this.path), { recursive: true })
    } else if (this.lastHash === null) {
      // Recover last hash so the chain stays continuous across processes
      try {
        const raw = await readFile(this.path, 'utf-8')
        const lines = raw.trim().split('\n')
        const last = lines[lines.length - 1]
        if (last) {
          const parsed = JSON.parse(last) as AuditEntry
          this.lastHash = parsed.hash
        }
      } catch { /* ignore corrupted */ }
    }

    const entry: Omit<AuditEntry, 'hash'> = {
      ts: new Date().toISOString(),
      actor,
      action,
      details,
      prevHash: this.lastHash,
    }
    const hash = createHash('sha256').update(JSON.stringify(entry)).digest('hex')
    const full: AuditEntry = { ...entry, hash }
    await appendFile(this.path, JSON.stringify(full) + '\n', 'utf-8')
    this.lastHash = hash
    return full
  }

  /** Verify integrity of the log file. Returns the index of the first broken entry, or -1. */
  async verify(): Promise<number> {
    if (!existsSync(this.path)) return -1
    const raw = await readFile(this.path, 'utf-8')
    const lines = raw.trim().split('\n').filter(Boolean)
    let prev: string | null = null
    for (let i = 0; i < lines.length; i++) {
      const e = JSON.parse(lines[i]!) as AuditEntry
      if (e.prevHash !== prev) return i
      const expected: string = createHash('sha256')
        .update(JSON.stringify({ ts: e.ts, actor: e.actor, action: e.action, details: e.details, prevHash: e.prevHash }))
        .digest('hex')
      if (expected !== e.hash) return i
      prev = e.hash
    }
    return -1
  }
}
