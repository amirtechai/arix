import { describe, it, expect } from 'vitest'
import { ToolResultCache } from '../agent/cache.js'
import type { Tool, ToolResult } from '../types.js'

function makeReadFile(): Tool & { calls: number } {
  let calls = 0
  return {
    name: 'read_file',
    description: 'r',
    inputSchema: { type: 'object' },
    requiresConfirmation: false,
    get calls() { return calls },
    async execute(input): Promise<ToolResult> {
      calls++
      return { toolCallId: '', success: true, output: `content of ${input['path']}` }
    },
  } as Tool & { calls: number }
}

describe('ToolResultCache', () => {
  it('memoises identical inputs for cacheable tools', async () => {
    const tool = makeReadFile()
    const cache = new ToolResultCache()
    const wrapped = cache.wrap(tool)

    await wrapped.execute({ path: 'a' })
    await wrapped.execute({ path: 'a' })
    await wrapped.execute({ path: 'b' })

    // 'a' should be cached after first call; 'b' invokes once
    expect(tool.calls).toBe(2)
  })

  it('does not wrap non-cacheable tools', async () => {
    const tool: Tool = {
      name: 'write_file',
      description: '',
      inputSchema: { type: 'object' },
      requiresConfirmation: true,
      execute: async () => ({ toolCallId: '', success: true, output: 'ok' }),
    }
    const cache = new ToolResultCache()
    expect(cache.wrap(tool)).toBe(tool)
  })

  it('invalidate clears cached entries', async () => {
    const tool = makeReadFile()
    const cache = new ToolResultCache()
    const wrapped = cache.wrap(tool)
    await wrapped.execute({ path: 'a' })
    await wrapped.execute({ path: 'a' })
    cache.invalidate()
    await wrapped.execute({ path: 'a' })
    expect(tool.calls).toBe(2)
  })
})
