import { appendFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

// ── Types ────────────────────────────────────────────────────────────────────

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  level: LogLevel
  message: string
  timestamp: string
  data?: Record<string, unknown>
}

// ── Sensitive field scrubbing ─────────────────────────────────────────────────
// Never write API keys, tokens, or passwords to any output.

const SENSITIVE_KEYS = new Set([
  'apikey', 'api_key', 'apiKey',
  'password', 'passwd', 'pass',
  'token', 'accesstoken', 'access_token', 'refreshtoken', 'refresh_token',
  'secret', 'authorization', 'auth',
  'credential', 'credentials',
  'private_key', 'privatekey',
])

function scrub(obj: unknown): unknown {
  if (typeof obj !== 'object' || obj === null) return obj
  if (Array.isArray(obj)) return obj.map(scrub)
  const result: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    result[k] = SENSITIVE_KEYS.has(k.toLowerCase()) ? '[REDACTED]' : scrub(v)
  }
  return result
}

// ── ANSI colours (no external dependency) ───────────────────────────────────

const RESET  = '\x1b[0m'
const GREY   = '\x1b[90m'
const CYAN   = '\x1b[36m'
const YELLOW = '\x1b[33m'
const RED    = '\x1b[31m'
const BOLD   = '\x1b[1m'

const LEVEL_COLOR: Record<LogLevel, string> = {
  debug: GREY,
  info:  CYAN,
  warn:  YELLOW,
  error: `${BOLD}${RED}`,
}

// ── LogManager ───────────────────────────────────────────────────────────────

const LEVEL_RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }

class LogManager {
  private debugMode: boolean
  private logDir: string
  private _currentLogFile: string | null = null

  constructor() {
    this.debugMode = process.env['ARIX_DEBUG'] === '1' || process.env['XCLAUDE_DEBUG'] === '1'
    this.logDir = join(homedir(), '.arix', 'logs')
  }

  // Call once from CLI entry point when --debug flag is passed
  enableDebug(): void {
    this.debugMode = true
  }

  private get minLevel(): LogLevel {
    return this.debugMode ? 'debug' : 'info'
  }

  private get logFile(): string {
    if (!this._currentLogFile) {
      const date = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
      this._currentLogFile = join(this.logDir, `arix-${date}.log`)
    }
    return this._currentLogFile
  }

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_RANK[level] >= LEVEL_RANK[this.minLevel]
  }

  private format(level: LogLevel, message: string, data?: Record<string, unknown>): string {
    const ts = new Date().toISOString()
    const color = LEVEL_COLOR[level]
    const label = level.toUpperCase().padEnd(5)
    const dataStr = data ? ` ${GREY}${JSON.stringify(scrub(data))}${RESET}` : ''
    return `${GREY}${ts}${RESET} ${color}${label}${RESET} ${message}${dataStr}`
  }

  private async writeToFile(entry: LogEntry): Promise<void> {
    try {
      if (!existsSync(this.logDir)) {
        await mkdir(this.logDir, { recursive: true })
      }
      const line = JSON.stringify({ ...entry, data: scrub(entry.data) }) + '\n'
      await appendFile(this.logFile, line, 'utf-8')
    } catch {
      // Log file write failure must never crash the app
    }
  }

  private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) return

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...(data !== undefined ? { data } : {}),
    }

    // Console output (coloured)
    const formatted = this.format(level, message, data)
    if (level === 'error' || level === 'warn') {
      process.stderr.write(formatted + '\n')
    } else if (this.debugMode || level !== 'debug') {
      process.stdout.write(formatted + '\n')
    }

    // Async file write (fire and forget — never await in hot path)
    void this.writeToFile(entry)
  }

  debug(message: string, data?: Record<string, unknown>): void { this.log('debug', message, data) }
  info (message: string, data?: Record<string, unknown>): void { this.log('info',  message, data) }
  warn (message: string, data?: Record<string, unknown>): void { this.log('warn',  message, data) }
  error(message: string, data?: Record<string, unknown>): void { this.log('error', message, data) }

  /** Rotate: delete log files older than `keepDays` days */
  async rotate(keepDays = 7): Promise<void> {
    try {
      const { readdir, unlink, stat } = await import('node:fs/promises')
      if (!existsSync(this.logDir)) return
      const files = await readdir(this.logDir)
      const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000
      for (const file of files) {
        if (!file.startsWith('arix-') || !file.endsWith('.log')) continue
        const full = join(this.logDir, file)
        const s = await stat(full).catch(() => null)
        if (s && s.mtimeMs < cutoff) await unlink(full).catch(() => null)
      }
    } catch {
      // Rotation failure is non-fatal
    }
  }
}

// Singleton — import { logger } from '@arix-code/core'
export const logger = new LogManager()
