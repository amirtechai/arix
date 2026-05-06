import type { Tool, ToolResult, JSONSchema } from '../types.js'
import type { McpClient } from './client.js'
import type { McpTool } from './types.js'

/** Wraps an MCP tool as a Arix Tool, routing execution through McpClient. */
export class McpToolAdapter implements Tool {
  readonly name: string
  readonly description: string
  readonly inputSchema: JSONSchema
  readonly requiresConfirmation = false

  constructor(
    private readonly client: McpClient,
    private readonly mcpTool: McpTool,
  ) {
    this.name = `${client.serverName}__${mcpTool.name}`
    this.description = mcpTool.description ?? mcpTool.name
    this.inputSchema = mcpTool.inputSchema as JSONSchema
  }

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    try {
      const result = await this.client.callTool(this.mcpTool.name, input)
      const text = result.content
        .map((c) => (c.type === 'text' ? c.text ?? '' : `[${c.type}]`))
        .join('\n')
      return {
        toolCallId: '',
        output: text,
        success: result.isError !== true,
        ...(result.isError ? { error: text } : {}),
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { toolCallId: '', output: '', success: false, error: msg }
    }
  }
}
