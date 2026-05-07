import { describe, it, expect } from 'vitest'
import { MCP_CATALOG, findMcpEntry, materialiseMcpEntry } from '../mcp/catalog.js'

describe('MCP catalog', () => {
  it('contains the documented servers', () => {
    const ids = MCP_CATALOG.map((e) => e.id)
    for (const required of ['filesystem', 'github', 'postgres', 'playwright', 'memory', 'time', 'sentry']) {
      expect(ids).toContain(required)
    }
  })

  it('findMcpEntry resolves by id', () => {
    expect(findMcpEntry('github')?.name).toMatch(/GitHub/i)
    expect(findMcpEntry('does-not-exist')).toBeUndefined()
  })

  it('materialise injects env and sets enabled=true', () => {
    const entry = findMcpEntry('github')!
    const cfg = materialiseMcpEntry(entry, { GITHUB_PERSONAL_ACCESS_TOKEN: 'tok_abc' })
    expect(cfg.name).toBe('github')
    expect(cfg.enabled).toBe(true)
    expect(cfg.env?.['GITHUB_PERSONAL_ACCESS_TOKEN']).toBe('tok_abc')
    expect(cfg.transport).toBe('stdio')
  })
})
