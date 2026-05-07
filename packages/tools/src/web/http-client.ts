import type { Tool, ToolResult } from '@arix/core'

const MAX_BODY = 200 * 1024
const TIMEOUT_MS = 30_000

const PRIVATE_HOST_RE = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[01])\.|::1|fc00:|fe80:|0\.0\.0\.0|metadata\.google\.internal)/i

function assertExternalUrl(rawUrl: string): URL {
  let u: URL
  try {
    u = new URL(rawUrl)
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`)
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error(`Only http(s) URLs allowed: ${u.protocol}`)
  }
  if (PRIVATE_HOST_RE.test(u.hostname)) {
    throw new Error(`Refusing to fetch private/local address: ${u.hostname}`)
  }
  return u
}

/**
 * http_client — richer than `web_fetch`: any method, custom headers, JSON or
 * form bodies, redirect control. Designed for testing public APIs.
 *
 * SSRF-hardened: rejects loopback / RFC1918 / link-local / cloud metadata hosts.
 */
export class HttpClientTool implements Tool {
  readonly name = 'http_client'
  readonly description =
    'Make an HTTP request to a public URL. Supports GET/POST/PUT/PATCH/DELETE, custom headers, JSON or form bodies. Returns status, headers, and body (truncated).'
  readonly requiresConfirmation = true
  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      url:     { type: 'string' },
      method:  { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] },
      headers: { type: 'object', description: 'Header name → value map' },
      body:    { type: 'string', description: 'Raw body (string or JSON string)' },
      json:    { type: 'object', description: 'Convenience: serialised as application/json' },
      followRedirects: { type: 'boolean', description: 'Default true' },
    },
    required: ['url'],
  }

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const rawUrl = input['url'] as string
    const method = ((input['method'] as string | undefined) ?? 'GET').toUpperCase()
    const headers = (input['headers'] as Record<string, string> | undefined) ?? {}
    const body    = input['body'] as string | undefined
    const json    = input['json'] as Record<string, unknown> | undefined
    const follow  = (input['followRedirects'] as boolean | undefined) ?? true

    let url: URL
    try {
      url = assertExternalUrl(rawUrl)
    } catch (err) {
      return { toolCallId: '', success: false, output: '', error: (err as Error).message }
    }

    const init: RequestInit = {
      method,
      headers: { 'user-agent': 'arix-http-client/1.0', ...headers },
      redirect: follow ? 'follow' : 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }
    if (json !== undefined) {
      init.body = JSON.stringify(json)
      ;(init.headers as Record<string, string>)['content-type'] = 'application/json'
    } else if (body !== undefined) {
      init.body = body
    }

    try {
      const res = await fetch(url, init)
      const buf = await res.arrayBuffer()
      const text = Buffer.from(buf).toString('utf-8')
      const truncated = text.length > MAX_BODY ? text.slice(0, MAX_BODY) + '\n[body truncated]' : text
      const headerLines: string[] = []
      res.headers.forEach((v, k) => { headerLines.push(`${k}: ${v}`) })
      const output = `HTTP/${res.status} ${res.statusText}\n${headerLines.join('\n')}\n\n${truncated}`
      return { toolCallId: '', success: res.ok, output, ...(res.ok ? {} : { error: `${res.status} ${res.statusText}` }) }
    } catch (err) {
      return { toolCallId: '', success: false, output: '', error: err instanceof Error ? err.message : String(err) }
    }
  }
}
