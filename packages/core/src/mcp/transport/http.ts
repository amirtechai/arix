import type { JsonRpcRequest, JsonRpcNotification, JsonRpcResponse } from '../types.js'

export class HttpTransport {
  private msgId = 0
  private closed = false

  constructor(
    private readonly url: string,
    private readonly headers: Record<string, string> = {},
  ) {}

  async start(): Promise<void> {
    // HTTP transport is stateless — nothing to do at startup
  }

  async request(method: string, params?: Record<string, unknown>, timeoutMs = 30_000): Promise<unknown> {
    if (this.closed) throw new Error('MCP HTTP transport is closed')
    const id = ++this.msgId
    const msg: JsonRpcRequest = { jsonrpc: '2.0', id, method, ...(params ? { params } : {}) }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const res = await fetch(this.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...this.headers,
        },
        body: JSON.stringify(msg),
        signal: controller.signal,
      })

      if (!res.ok) {
        throw new Error(`MCP HTTP error: ${res.status} ${res.statusText}`)
      }

      const data = await res.json() as JsonRpcResponse
      if (data.error) {
        throw new Error(`MCP error ${data.error.code}: ${data.error.message}`)
      }
      return data.result
    } finally {
      clearTimeout(timer)
    }
  }

  notify(method: string, params?: Record<string, unknown>): void {
    if (this.closed) return
    const msg: JsonRpcNotification = { jsonrpc: '2.0', method, ...(params ? { params } : {}) }
    // Fire-and-forget notification
    void fetch(this.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.headers },
      body: JSON.stringify(msg),
    }).catch(() => { /* non-fatal */ })
  }

  close(): void {
    this.closed = true
  }

  get isAlive(): boolean {
    return !this.closed
  }
}
