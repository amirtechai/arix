import { describe, it, expect, vi, beforeEach } from 'vitest'
import { McpToolAdapter } from '../mcp/tool-adapter.js'
import type { McpClient } from '../mcp/client.js'
import type { McpTool } from '../mcp/types.js'

const makeMockClient = (serverName: string, callResult: string): McpClient => ({
  serverName,
  tools: [],
  isConnected: true,
  connect: vi.fn(),
  disconnect: vi.fn(),
  refreshTools: vi.fn(),
  callTool: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: callResult }],
    isError: false,
  }),
} as unknown as McpClient)

describe('McpToolAdapter', () => {
  const mcpTool: McpTool = {
    name: 'read_resource',
    description: 'Reads a resource',
    inputSchema: {
      type: 'object',
      properties: { uri: { type: 'string' } },
      required: ['uri'],
    },
  }

  it('prefixes tool name with server name', () => {
    const client = makeMockClient('my-server', '')
    const adapter = new McpToolAdapter(client, mcpTool)
    expect(adapter.name).toBe('my-server__read_resource')
  })

  it('uses tool description', () => {
    const client = makeMockClient('srv', '')
    const adapter = new McpToolAdapter(client, mcpTool)
    expect(adapter.description).toBe('Reads a resource')
  })

  it('returns success result from callTool', async () => {
    const client = makeMockClient('srv', 'file contents here')
    const adapter = new McpToolAdapter(client, mcpTool)
    const result = await adapter.execute({ uri: '/foo' })
    expect(result.success).toBe(true)
    expect(result.output).toBe('file contents here')
  })

  it('returns error result when isError is true', async () => {
    const client = {
      serverName: 'srv',
      callTool: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'resource not found' }],
        isError: true,
      }),
    } as unknown as McpClient
    const adapter = new McpToolAdapter(client, mcpTool)
    const result = await adapter.execute({ uri: '/missing' })
    expect(result.success).toBe(false)
    expect(result.error).toBe('resource not found')
  })

  it('handles callTool throwing an error', async () => {
    const client = {
      serverName: 'srv',
      callTool: vi.fn().mockRejectedValue(new Error('connection refused')),
    } as unknown as McpClient
    const adapter = new McpToolAdapter(client, mcpTool)
    const result = await adapter.execute({})
    expect(result.success).toBe(false)
    expect(result.error).toContain('connection refused')
  })

  it('falls back to tool name as description when description is missing', () => {
    const tool: McpTool = { name: 'no_desc', inputSchema: { type: 'object' } }
    const client = makeMockClient('srv', '')
    const adapter = new McpToolAdapter(client, tool)
    expect(adapter.description).toBe('no_desc')
  })

  it('concatenates multiple content items with newline', async () => {
    const client = {
      serverName: 'srv',
      callTool: vi.fn().mockResolvedValue({
        content: [
          { type: 'text', text: 'line1' },
          { type: 'text', text: 'line2' },
        ],
        isError: false,
      }),
    } as unknown as McpClient
    const adapter = new McpToolAdapter(client, mcpTool)
    const result = await adapter.execute({})
    expect(result.output).toBe('line1\nline2')
  })
})
