import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MarketplaceClient } from '../marketplace/index.js'
import type { MarketplaceEntry } from '../marketplace/index.js'

const ENTRIES: MarketplaceEntry[] = [
  { name: 'flutter-expert', description: 'Flutter best practices', version: '1.0.0', author: 'arix', url: 'https://example.com/flutter-expert.md', type: 'skill', tags: ['flutter', 'dart'] },
  { name: 'supabase', description: 'Supabase queries and auth', version: '1.1.0', author: 'arix', url: 'https://example.com/supabase.md', type: 'skill', tags: ['supabase', 'postgres'] },
  { name: 'shell-tool', description: 'Advanced shell execution', version: '0.9.0', author: 'community', url: 'https://example.com/shell-tool.js', type: 'tool', tags: ['shell'] },
]

function mockFetch(entries: MarketplaceEntry[] = ENTRIES) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(entries),
    text: () => Promise.resolve('# skill content'),
  })
}

describe('MarketplaceClient', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('search returns all entries when no query', async () => {
    vi.stubGlobal('fetch', mockFetch())
    const client = new MarketplaceClient('https://example.com')
    const results = await client.search('')
    expect(results).toHaveLength(3)
  })

  it('search filters by name', async () => {
    vi.stubGlobal('fetch', mockFetch())
    const client = new MarketplaceClient('https://example.com')
    const results = await client.search('flutter')
    expect(results).toHaveLength(1)
    expect(results[0]!.name).toBe('flutter-expert')
  })

  it('search filters by tag', async () => {
    vi.stubGlobal('fetch', mockFetch())
    const client = new MarketplaceClient('https://example.com')
    const results = await client.search('postgres')
    expect(results).toHaveLength(1)
    expect(results[0]!.name).toBe('supabase')
  })

  it('search with type=skill returns only skills', async () => {
    vi.stubGlobal('fetch', mockFetch())
    const client = new MarketplaceClient('https://example.com')
    const results = await client.search('', 'skill')
    expect(results.every((e) => e.type === 'skill')).toBe(true)
    expect(results).toHaveLength(2)
  })

  it('search with type=tool returns only tools', async () => {
    vi.stubGlobal('fetch', mockFetch())
    const client = new MarketplaceClient('https://example.com')
    const results = await client.search('', 'tool')
    expect(results).toHaveLength(1)
    expect(results[0]!.type).toBe('tool')
  })

  it('install writes file to targetDir', async () => {
    vi.stubGlobal('fetch', mockFetch())
    const { mkdtemp, readFile } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')

    const tmpDir = await mkdtemp(join(tmpdir(), 'arix-test-'))
    const client = new MarketplaceClient('https://example.com')
    await client.install('flutter-expert', tmpDir, 'skill')

    const content = await readFile(join(tmpDir, 'flutter-expert.md'), 'utf-8')
    expect(content).toBe('# skill content')
  })

  it('install throws ArixError when name not found', async () => {
    vi.stubGlobal('fetch', mockFetch())
    const client = new MarketplaceClient('https://example.com')
    await expect(client.install('nonexistent', '/tmp', 'skill')).rejects.toThrow('not found in registry')
  })

  it('search throws when registry is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }))
    const client = new MarketplaceClient('https://example.com')
    await expect(client.search('x')).rejects.toThrow('503')
  })
})
