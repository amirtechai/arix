import { createHash } from 'node:crypto'
import type { Tool, ToolResult } from '../types.js'

/**
 * Tool names whose output is idempotent for a given input — safe to memoise
 * within a single agent turn (and across turns when nothing has been written
 * since the last call).
 */
const DEFAULT_CACHEABLE = new Set<string>([
  'read_file',
  'list_directory',
  'glob',
  'grep',
  'git_status',
  'git_diff',
  'git_log',
  'git_blame',
  'git_branch',
  'web_fetch',
  'web_search',
  'http_client', // GET only — handled below
])

interface CacheEntry { result: ToolResult; ts: number }

export interface ToolCacheOptions {
  /** Default 60_000 ms */
  ttlMs?: number
  /** Override the cacheable-tool set */
  cacheable?: Set<string>
}

/**
 * Wraps a tool with a short-lived (cwd, name, input-hash) cache. Cached results
 * are returned synchronously for the second call within `ttlMs`.
 *
 * Important: the cache is invalidated when any *write* tool runs through the
 * registry — call `ToolResultCache#invalidate()` from the agent loop after
 * destructive operations.
 */
export class ToolResultCache {
  private readonly store = new Map<string, CacheEntry>()
  private readonly ttl: number
  private readonly cacheable: Set<string>

  constructor(opts: ToolCacheOptions = {}) {
    this.ttl = opts.ttlMs ?? 60_000
    this.cacheable = opts.cacheable ?? DEFAULT_CACHEABLE
  }

  /** Wrap a tool so its outputs are memoised (if it's listed as cacheable). */
  wrap(tool: Tool): Tool {
    if (!this.cacheable.has(tool.name)) return tool
    const cache = this
    const wrapper: Tool = {
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      requiresConfirmation: tool.requiresConfirmation,
      async execute(input: Record<string, unknown>): Promise<ToolResult> {
        // http_client: only cache GET (default) requests
        if (tool.name === 'http_client') {
          const m = ((input['method'] as string | undefined) ?? 'GET').toUpperCase()
          if (m !== 'GET') return tool.execute(input)
        }
        const key = cache._key(tool.name, input)
        const hit = cache.store.get(key)
        if (hit && Date.now() - hit.ts < cache.ttl) return hit.result
        const result = await tool.execute(input)
        if (result.success) cache.store.set(key, { result, ts: Date.now() })
        return result
      },
    }
    return wrapper
  }

  invalidate(): void { this.store.clear() }
  size(): number { return this.store.size }

  private _key(name: string, input: Record<string, unknown>): string {
    const stable = JSON.stringify(input, Object.keys(input).sort())
    return name + ':' + createHash('sha1').update(stable).digest('hex')
  }
}
