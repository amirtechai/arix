import { describe, it, expect, vi } from 'vitest'
import { PluginRegistry } from '../plugins/index.js'
import type { ArixPlugin, PluginToolRegistry } from '../plugins/index.js'
import type { Tool } from '../types.js'

function makeMockRegistry(): PluginToolRegistry & { tools: Map<string, Tool> } {
  const tools = new Map<string, Tool>()
  return { tools, register: (t) => tools.set(t.name, t) }
}

function makeTool(name: string): Tool {
  return {
    name,
    description: `${name} tool`,
    inputSchema: { type: 'object', properties: {} },
    requiresConfirmation: false,
    execute: vi.fn().mockResolvedValue({ toolCallId: 'x', success: true, output: 'done' }),
  }
}

describe('PluginRegistry', () => {
  it('registers and retrieves a plugin', () => {
    const registry = new PluginRegistry()
    const plugin: ArixPlugin = { name: 'test-plugin', setup: vi.fn() }
    registry.register(plugin)
    expect(registry.get('test-plugin')).toBe(plugin)
  })

  it('lists registered plugins', () => {
    const registry = new PluginRegistry()
    registry.register({ name: 'plugin-a', setup: vi.fn() })
    registry.register({ name: 'plugin-b', setup: vi.fn() })
    const names = registry.list().map((p) => p.name)
    expect(names).toContain('plugin-a')
    expect(names).toContain('plugin-b')
  })

  it('plugin setup() receives tool registry and registers tools', () => {
    const toolRegistry = makeMockRegistry()
    const plugin: ArixPlugin = {
      name: 'tool-provider',
      setup(reg) {
        reg.register(makeTool('custom_tool'))
      },
    }
    plugin.setup(toolRegistry)
    expect(toolRegistry.tools.get('custom_tool')).toBeDefined()
  })

  it('setupAll() calls setup on all plugins', () => {
    const toolRegistry = makeMockRegistry()
    const pluginRegistry = new PluginRegistry()
    const setupA = vi.fn()
    const setupB = vi.fn()
    pluginRegistry.register({ name: 'a', setup: setupA })
    pluginRegistry.register({ name: 'b', setup: setupB })
    pluginRegistry.setupAll(toolRegistry)
    expect(setupA).toHaveBeenCalledWith(toolRegistry)
    expect(setupB).toHaveBeenCalledWith(toolRegistry)
  })

  it('returns undefined for unregistered plugin', () => {
    const registry = new PluginRegistry()
    expect(registry.get('missing')).toBeUndefined()
  })
})
