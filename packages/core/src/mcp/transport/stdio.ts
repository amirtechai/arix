import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { createInterface } from 'node:readline'
import type { JsonRpcRequest, JsonRpcNotification, JsonRpcResponse } from '../types.js'

type PendingRequest = {
  resolve: (value: JsonRpcResponse) => void
  reject: (reason: Error) => void
  timer: NodeJS.Timeout
}

export class StdioTransport {
  private process: ChildProcess | null = null
  private pending = new Map<string | number, PendingRequest>()
  private msgId = 0
  private closed = false

  constructor(
    private readonly command: string,
    private readonly args: string[],
    private readonly env?: Record<string, string>,
  ) {}

  async start(): Promise<void> {
    this.process = spawn(this.command, this.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...this.env },
    })

    const rl = createInterface({ input: this.process.stdout! })
    rl.on('line', (line: string) => this.handleLine(line))

    this.process.stderr?.on('data', (data: Buffer) => {
      // Forward MCP server stderr to our stderr (non-fatal)
      process.stderr.write(`[mcp] ${data.toString()}`)
    })

    this.process.on('exit', () => {
      this.closed = true
      for (const [, pending] of this.pending) {
        clearTimeout(pending.timer)
        pending.reject(new Error('MCP server process exited unexpectedly'))
      }
      this.pending.clear()
    })

    await new Promise<void>((resolve, reject) => {
      this.process!.on('spawn', resolve)
      this.process!.on('error', reject)
    })
  }

  private handleLine(line: string): void {
    const trimmed = line.trim()
    if (!trimmed) return
    let msg: JsonRpcResponse
    try {
      msg = JSON.parse(trimmed) as JsonRpcResponse
    } catch {
      return
    }
    if (!('id' in msg) || msg.id === null || msg.id === undefined) return
    const pending = this.pending.get(msg.id)
    if (!pending) return
    clearTimeout(pending.timer)
    this.pending.delete(msg.id)
    pending.resolve(msg)
  }

  async request(method: string, params?: Record<string, unknown>, timeoutMs = 30_000): Promise<unknown> {
    if (this.closed || !this.process?.stdin) throw new Error('MCP transport is closed')
    const id = ++this.msgId
    const msg: JsonRpcRequest = { jsonrpc: '2.0', id, method, ...(params ? { params } : {}) }
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`MCP request timed out: ${method}`))
      }, timeoutMs)

      this.pending.set(id, {
        resolve: (resp) => {
          if (resp.error) {
            reject(new Error(`MCP error ${resp.error.code}: ${resp.error.message}`))
          } else {
            resolve(resp.result)
          }
        },
        reject,
        timer,
      })

      const line = JSON.stringify(msg) + '\n'
      this.process!.stdin!.write(line, (err) => {
        if (err) {
          clearTimeout(timer)
          this.pending.delete(id)
          reject(err)
        }
      })
    })
  }

  notify(method: string, params?: Record<string, unknown>): void {
    if (this.closed || !this.process?.stdin) return
    const msg: JsonRpcNotification = { jsonrpc: '2.0', method, ...(params ? { params } : {}) }
    this.process.stdin.write(JSON.stringify(msg) + '\n')
  }

  close(): void {
    this.closed = true
    this.process?.stdin?.end()
    this.process?.kill()
  }

  get isAlive(): boolean {
    return !this.closed && this.process !== null && this.process.exitCode === null
  }
}
