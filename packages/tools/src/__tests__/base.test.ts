import { describe, it, expect} from 'vitest'
import { ToolRegistry, ToolExecutor } from '../base/index.js'
import type { Tool, ToolResult } from '@arix-code/core'

function makeTool(name: string, requiresConfirmation = false): Tool {
  return {
    name,
    description: `${name} tool`,
    inputSchema: { type: 'object', properties: {} },
    requiresConfirmation,
    async execute(input): Promise<ToolResult> {
      return { toolCallId: '', success: true, output: `${name}:${JSON.stringify(input)}` }
    },
  }
}

describe('ToolRegistry', () => {
  it('registers and retrieves tools', () => {
    const reg = new ToolRegistry()
    const t = makeTool('read_file')
    reg.register(t)
    expect(reg.get('read_file')).toBe(t)
  })

  it('lists all tools', () => {
    const reg = new ToolRegistry()
    reg.register(makeTool('a'))
    reg.register(makeTool('b'))
    expect(reg.list().map((t) => t.name)).toEqual(['a', 'b'])
  })

  it('toDefinitions returns ToolDefinition array', () => {
    const reg = new ToolRegistry()
    reg.register(makeTool('read_file'))
    const defs = reg.toDefinitions()
    expect(defs[0]).toMatchObject({ name: 'read_file', description: 'read_file tool' })
  })

  it('returns undefined for unknown tool', () => {
    expect(new ToolRegistry().get('nope')).toBeUndefined()
  })
})

describe('ToolExecutor', () => {
  it('executes a registered tool', async () => {
    const reg = new ToolRegistry()
    reg.register(makeTool('read_file'))
    const exec = new ToolExecutor(reg, 'standard')
    const result = await exec.execute({ id: 'c1', name: 'read_file', input: { path: 'foo' } })
    expect(result.success).toBe(true)
    expect(result.output).toContain('read_file')
  })

  it('returns error result for unknown tool', async () => {
    const exec = new ToolExecutor(new ToolRegistry(), 'standard')
    const result = await exec.execute({ id: 'c1', name: 'unknown', input: {} })
    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })

  it('requiresConfirmation: safe mode always false', async () => {
    const reg = new ToolRegistry()
    reg.register(makeTool('shell_exec', true))
    const exec = new ToolExecutor(reg, 'safe')
    expect(await exec.requiresConfirmation({ id: 'c1', name: 'shell_exec', input: {} })).toBe(false)
  })

  it('requiresConfirmation: standard mode true for destructive tools', async () => {
    const reg = new ToolRegistry()
    reg.register(makeTool('shell_exec', true))
    const exec = new ToolExecutor(reg, 'standard')
    expect(await exec.requiresConfirmation({ id: 'c1', name: 'shell_exec', input: {} })).toBe(true)
  })

  it('requiresConfirmation: auto mode always false', async () => {
    const reg = new ToolRegistry()
    reg.register(makeTool('write_file', true))
    const exec = new ToolExecutor(reg, 'auto')
    expect(await exec.requiresConfirmation({ id: 'c1', name: 'write_file', input: {} })).toBe(false)
  })
})
