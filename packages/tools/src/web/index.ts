import type { Tool, ToolResult } from '@arix/core'

// ── HTML helpers ──────────────────────────────────────────────────────────────

/** Strip all HTML tags, decode basic entities, collapse whitespace. */
function htmlToText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// ── WebSearchTool ─────────────────────────────────────────────────────────────

export interface SearchResult {
  title: string
  url: string
  snippet: string
}

/** Parse DuckDuckGo HTML search results page. */
function parseDDGResults(html: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = []

  // Each result block: <div class="result results_links..."> ... <a class="result__a" href="...">title</a> ... <a class="result__snippet">snippet</a>
  const blockRe = /<div[^>]+class="[^"]*result[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi
  let blockMatch: RegExpExecArray | null

  // Simpler: extract all result__a links + result__snippet in order
  const linkRe = /<a[^>]+class="[^"]*result__a[^"]*"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi
  const snippetRe = /<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi

  const links: Array<{ url: string; title: string }> = []
  let m: RegExpExecArray | null
  while ((m = linkRe.exec(html)) !== null && links.length < maxResults) {
    const url = m[1]!
    const title = htmlToText(m[2]!)
    // DDG redirects use /l/?uddg=... — decode the real URL
    const realUrl = url.startsWith('/l/') ? decodeURIComponent(url.replace(/.*uddg=([^&]*).*/, '$1')) : url
    links.push({ url: realUrl, title })
  }

  const snippets: string[] = []
  while ((m = snippetRe.exec(html)) !== null) {
    snippets.push(htmlToText(m[1]!))
  }

  for (let i = 0; i < links.length; i++) {
    results.push({
      title: links[i]!.title,
      url: links[i]!.url,
      snippet: snippets[i] ?? '',
    })
  }
  return results
}

export class WebSearchTool implements Tool {
  readonly name = 'web_search'
  readonly description = 'Search the web via DuckDuckGo and return top results with title, URL, and snippet'
  readonly requiresConfirmation = false
  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      query: { type: 'string', description: 'Search query' },
      maxResults: { type: 'number', description: 'Max results to return (default 5, max 10)' },
    },
    required: ['query'],
  }

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const query = input['query'] as string
    const maxResults = Math.min(Number(input['maxResults'] ?? 5), 10)

    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
    let html: string
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Arix/0.1.0 (AI coding agent; +https://github.com/your-org/arix)',
          'Accept': 'text/html',
        },
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) {
        return { toolCallId: '', success: false, output: '', error: `Search failed: HTTP ${res.status}` }
      }
      html = await res.text()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return { toolCallId: '', success: false, output: '', error: `Search request failed: ${msg}` }
    }

    const results = parseDDGResults(html, maxResults)
    if (results.length === 0) {
      return { toolCallId: '', success: true, output: `No results found for: ${query}` }
    }

    const lines = results.map(
      (r, i) => `${i + 1}. **${r.title}**\n   URL: ${r.url}\n   ${r.snippet}`,
    )
    return { toolCallId: '', success: true, output: lines.join('\n\n') }
  }
}

// ── WebFetchTool ──────────────────────────────────────────────────────────────

const MAX_CONTENT_CHARS = 20_000

/** Convert HTML to readable markdown-ish text, preserving structure. */
function htmlToMarkdown(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, t) => `\n# ${htmlToText(t)}\n`)
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, t) => `\n## ${htmlToText(t)}\n`)
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_, t) => `\n### ${htmlToText(t)}\n`)
    .replace(/<h[4-6][^>]*>([\s\S]*?)<\/h[4-6]>/gi, (_, t) => `\n#### ${htmlToText(t)}\n`)
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, t) => `- ${htmlToText(t)}\n`)
    .replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, t) => `\n\`\`\`\n${htmlToText(t)}\n\`\`\`\n`)
    .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_, t) => `\`${htmlToText(t)}\``)
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_, t) => `\n${htmlToText(t)}\n`)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export class WebFetchTool implements Tool {
  readonly name = 'web_fetch'
  readonly description = 'Fetch a URL and return its content as readable text (HTML → markdown)'
  readonly requiresConfirmation = false
  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      url: { type: 'string', description: 'URL to fetch' },
      raw: { type: 'boolean', description: 'Return raw HTML instead of converting to text (default false)' },
    },
    required: ['url'],
  }

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const url = input['url'] as string
    const raw = Boolean(input['raw'] ?? false)

    // Basic SSRF protection: block private/loopback ranges
    try {
      const parsed = new URL(url)
      const host = parsed.hostname.toLowerCase()
      if (
        host === 'localhost' ||
        host.startsWith('127.') ||
        host.startsWith('10.') ||
        host.startsWith('192.168.') ||
        host.startsWith('172.') ||
        host === '0.0.0.0' ||
        host === '::1'
      ) {
        return { toolCallId: '', success: false, output: '', error: 'Private/loopback URLs are not allowed' }
      }
    } catch {
      return { toolCallId: '', success: false, output: '', error: `Invalid URL: ${url}` }
    }

    let body: string
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Arix/0.1.0 (AI coding agent; +https://github.com/your-org/arix)',
          'Accept': 'text/html,text/plain,application/json',
        },
        signal: AbortSignal.timeout(15_000),
      })
      if (!res.ok) {
        return { toolCallId: '', success: false, output: '', error: `HTTP ${res.status}: ${url}` }
      }
      const contentType = res.headers.get('content-type') ?? ''
      body = await res.text()
      // Non-HTML responses: return as-is (truncated)
      if (!contentType.includes('html') || raw) {
        const truncated = body.slice(0, MAX_CONTENT_CHARS)
        const suffix = body.length > MAX_CONTENT_CHARS ? `\n\n[truncated — ${body.length} chars total]` : ''
        return { toolCallId: '', success: true, output: truncated + suffix }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return { toolCallId: '', success: false, output: '', error: `Fetch failed: ${msg}` }
    }

    const markdown = htmlToMarkdown(body)
    const truncated = markdown.slice(0, MAX_CONTENT_CHARS)
    const suffix = markdown.length > MAX_CONTENT_CHARS ? `\n\n[truncated — ${markdown.length} chars total]` : ''
    return { toolCallId: '', success: true, output: truncated + suffix }
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createWebTools(): Tool[] {
  return [new WebSearchTool(), new WebFetchTool()]
}
