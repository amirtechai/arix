import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import type { Tool, ToolResult } from '@arix-code/core'

// ── ProcessMonitor (event emitter) ───────────────────────────────────────────

export interface MonitorEvents {
  line: [source: 'stdout' | 'stderr', line: string, pid: number]
  exit: [code: number | null, signal: NodeJS.Signals | null, pid: number]
  error: [err: Error, pid: number]
}

export class ProcessMonitor extends EventEmitter<MonitorEvents> {
  private pid: number | undefined
  private running = false
  private buffer = { stdout: '', stderr: '' }

  start(command: string, args: string[], cwd: string): void {
    if (this.running) throw new Error('ProcessMonitor: already running')

    const child = spawn(command, args, {
      cwd,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    this.pid = child.pid
    this.running = true

    const handleChunk = (source: 'stdout' | 'stderr') => (chunk: Buffer) => {
      this.buffer[source] += chunk.toString('utf-8')
      const lines = this.buffer[source].split('\n')
      this.buffer[source] = lines.pop() ?? ''
      for (const line of lines) {
        this.emit('line', source, line, this.pid!)
      }
    }

    child.stdout.on('data', handleChunk('stdout'))
    child.stderr.on('data', handleChunk('stderr'))

    child.on('error', (err) => {
      this.running = false
      this.emit('error', err, this.pid ?? 0)
    })

    child.on('close', (code, signal) => {
      // Flush remaining buffer
      for (const source of ['stdout', 'stderr'] as const) {
        if (this.buffer[source].length > 0) {
          this.emit('line', source, this.buffer[source], this.pid!)
          this.buffer[source] = ''
        }
      }
      this.running = false
      this.emit('exit', code, signal, this.pid!)
    })
  }

  isRunning() { return this.running }
  getPid() { return this.pid }
}

// ── MonitorTool ───────────────────────────────────────────────────────────────

const MAX_LINES = 200
const TIMEOUT_MS = 30_000

/** Run a command and collect its output, up to MAX_LINES or TIMEOUT_MS. */
export class MonitorTool implements Tool {
  readonly name = 'monitor'
  readonly description = 'Run a shell command and stream its stdout/stderr output line by line (up to 200 lines or 30s)'
  readonly requiresConfirmation = true
  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      command: { type: 'string', description: 'Command to run' },
      args: {
        type: 'array',
        items: { type: 'string' },
        description: 'Command arguments',
      },
      cwd: { type: 'string', description: 'Working directory (default: current directory)' },
      timeoutMs: { type: 'number', description: `Timeout in milliseconds (default: ${TIMEOUT_MS}, max: 120000)` },
    },
    required: ['command'],
  }

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const command = input['command'] as string
    const args = (input['args'] as string[] | undefined) ?? []
    const cwd = (input['cwd'] as string | undefined) ?? process.cwd()
    const timeoutMs = Math.min(Number(input['timeoutMs'] ?? TIMEOUT_MS), 120_000)

    const lines: string[] = []
    let exitCode: number | null = null

    await new Promise<void>((resolve) => {
      const monitor = new ProcessMonitor()
      const timer = setTimeout(() => {
        lines.push(`[timeout after ${timeoutMs}ms]`)
        resolve()
      }, timeoutMs)

      monitor.on('line', (source, line) => {
        const prefix = source === 'stderr' ? '[stderr] ' : ''
        lines.push(`${prefix}${line}`)
        if (lines.length >= MAX_LINES) {
          lines.push(`[truncated at ${MAX_LINES} lines]`)
          clearTimeout(timer)
          resolve()
        }
      })

      monitor.on('exit', (code) => {
        exitCode = code
        clearTimeout(timer)
        resolve()
      })

      monitor.on('error', (err) => {
        lines.push(`[error] ${err.message}`)
        clearTimeout(timer)
        resolve()
      })

      try {
        monitor.start(command, args, cwd)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        clearTimeout(timer)
        lines.push(`[start error] ${msg}`)
        resolve()
      }
    })

    const exitLine = exitCode !== null ? `\n[exit code: ${exitCode}]` : ''
    const output = lines.join('\n') + exitLine
    return {
      toolCallId: '',
      success: exitCode === 0 || exitCode === null,
      output,
      ...(exitCode !== 0 && exitCode !== null ? { error: `Process exited with code ${exitCode}` } : {}),
    }
  }
}
