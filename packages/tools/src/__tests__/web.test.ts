import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WebSearchTool, WebFetchTool } from '../web/index.js'

function mockFetch(html: string, status = 200, contentType = 'text/html') {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => contentType },
    text: () => Promise.resolve(html),
  })
}

const DDG_HTML = `
<div class="result results_links">
  <a class="result__a" href="/l/?uddg=https%3A%2F%2Fexample.com%2Fpage1">Example Page 1</a>
  <a class="result__snippet">This is the first snippet about the topic.</a>
</div>
<div class="result results_links">
  <a class="result__a" href="https://example.org/page2">Example Page 2</a>
  <a class="result__snippet">Second result snippet here.</a>
</div>
`

describe('WebSearchTool', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('returns formatted results on success', async () => {
    vi.stubGlobal('fetch', mockFetch(DDG_HTML))
    const tool = new WebSearchTool()
    const result = await tool.execute({ query: 'test query' })
    expect(result.success).toBe(true)
    expect(result.output).toContain('Example Page')
    expect(result.output).toContain('example')
  })

  it('returns no-results message when page has no links', async () => {
    vi.stubGlobal('fetch', mockFetch('<html><body>no results</body></html>'))
    const tool = new WebSearchTool()
    const result = await tool.execute({ query: 'xyzzy12345' })
    expect(result.success).toBe(true)
    expect(result.output).toContain('No results')
  })

  it('returns error on HTTP failure', async () => {
    vi.stubGlobal('fetch', mockFetch('', 429))
    const tool = new WebSearchTool()
    const result = await tool.execute({ query: 'test' })
    expect(result.success).toBe(false)
    expect(result.error).toContain('429')
  })

  it('returns error on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')))
    const tool = new WebSearchTool()
    const result = await tool.execute({ query: 'test' })
    expect(result.success).toBe(false)
    expect(result.error).toContain('network error')
  })
})

describe('WebFetchTool', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('converts HTML to readable text', async () => {
    const html = '<html><body><h1>Title</h1><p>Hello world</p></body></html>'
    vi.stubGlobal('fetch', mockFetch(html))
    const tool = new WebFetchTool()
    const result = await tool.execute({ url: 'https://example.com' })
    expect(result.success).toBe(true)
    expect(result.output).toContain('Title')
    expect(result.output).toContain('Hello world')
  })

  it('returns JSON as-is', async () => {
    const json = '{"key":"value"}'
    vi.stubGlobal('fetch', mockFetch(json, 200, 'application/json'))
    const tool = new WebFetchTool()
    const result = await tool.execute({ url: 'https://api.example.com/data' })
    expect(result.success).toBe(true)
    expect(result.output).toContain('"key"')
  })

  it('blocks localhost URLs', async () => {
    const tool = new WebFetchTool()
    const result = await tool.execute({ url: 'http://localhost:3000/admin' })
    expect(result.success).toBe(false)
    expect(result.error).toContain('Private')
  })

  it('blocks 127.x.x.x URLs', async () => {
    const tool = new WebFetchTool()
    const result = await tool.execute({ url: 'http://127.0.0.1/secret' })
    expect(result.success).toBe(false)
    expect(result.error).toContain('Private')
  })

  it('blocks 192.168.x.x URLs', async () => {
    const tool = new WebFetchTool()
    const result = await tool.execute({ url: 'http://192.168.1.1/router' })
    expect(result.success).toBe(false)
    expect(result.error).toContain('Private')
  })

  it('returns error on invalid URL', async () => {
    const tool = new WebFetchTool()
    const result = await tool.execute({ url: 'not-a-url' })
    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid URL')
  })

  it('returns error on HTTP failure', async () => {
    vi.stubGlobal('fetch', mockFetch('', 404))
    const tool = new WebFetchTool()
    const result = await tool.execute({ url: 'https://example.com/missing' })
    expect(result.success).toBe(false)
    expect(result.error).toContain('404')
  })
})
