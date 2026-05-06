import { createWriteStream } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { ArixError } from '../errors.js'

// ── Registry contract ─────────────────────────────────────────────────────────

export interface MarketplaceEntry {
  name: string
  description: string
  version: string
  author: string
  /** Raw URL to the .md (skill) or .js (tool) file */
  url: string
  type: 'skill' | 'tool'
  tags?: string[]
}

// ── MarketplaceClient ─────────────────────────────────────────────────────────

const DEFAULT_REGISTRY = 'https://raw.githubusercontent.com/your-org/arix-registry/main'

export class MarketplaceClient {
  constructor(private readonly registryBase = DEFAULT_REGISTRY) {}

  async search(query: string, type?: 'skill' | 'tool'): Promise<MarketplaceEntry[]> {
    const all = await this._fetchIndex(type)
    const q = query.toLowerCase()
    return all.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        (e.tags ?? []).some((t) => t.toLowerCase().includes(q)),
    )
  }

  async install(name: string, targetDir: string, type: 'skill' | 'tool'): Promise<void> {
    const all = await this._fetchIndex(type)
    const entry = all.find((e) => e.name === name)
    if (!entry) {
      throw new ArixError('MARKETPLACE_NOT_FOUND', `${type} "${name}" not found in registry`)
    }
    await mkdir(targetDir, { recursive: true })
    const content = await this._fetchText(entry.url)
    const ext = type === 'skill' ? '.md' : '.js'
    await writeFile(join(targetDir, `${name}${ext}`), content, 'utf-8')
  }

  // ── private ─────────────────────────────────────────────────────────────────

  private readonly _cache = new Map<string, MarketplaceEntry[]>()

  private async _fetchIndex(type?: 'skill' | 'tool'): Promise<MarketplaceEntry[]> {
    const url = `${this.registryBase}/index.json`
    if (this._cache.has(url)) {
      const cached = this._cache.get(url)!
      return type ? cached.filter((e) => e.type === type) : cached
    }

    const res = await fetch(url)
    if (!res.ok) {
      throw new ArixError(
        'MARKETPLACE_UNAVAILABLE',
        `Registry responded with ${res.status}: ${url}`,
        { retryable: res.status >= 500 },
      )
    }
    const data = (await res.json()) as MarketplaceEntry[]
    this._cache.set(url, data)
    return type ? data.filter((e) => e.type === type) : data
  }

  private async _fetchText(url: string): Promise<string> {
    const res = await fetch(url)
    if (!res.ok) {
      throw new ArixError(
        'MARKETPLACE_FETCH_FAILED',
        `Failed to fetch ${url}: ${res.status}`,
      )
    }
    return res.text()
  }
}
