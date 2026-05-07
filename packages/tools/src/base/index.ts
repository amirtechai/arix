import EventEmitter from 'node:events'
import type { Tool, ToolCall, ToolResult, ToolDefinition, PermissionMode, ToolConfirmationRequest } from '@arix-code/core'

export class ToolRegistry {
  private readonly tools = new Map<string, Tool>()

  register(tool: Tool): void {
    this.tools.set(tool.name, tool)
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name)
  }

  list(): Tool[] {
    return Array.from(this.tools.values())
  }

  toDefinitions(): ToolDefinition[] {
    return this.list().map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }))
  }
}

export class ToolExecutor extends EventEmitter {
  constructor(
    private readonly registry: ToolRegistry,
    private readonly mode: PermissionMode,
  ) {
    super()
  }

  async execute(call: ToolCall): Promise<ToolResult> {
    const tool = this.registry.get(call.name)
    if (!tool) {
      return {
        toolCallId: call.id,
        success: false,
        output: '',
        error: `Tool '${call.name}' not found`,
      }
    }
    try {
      const result = await tool.execute(call.input)
      return { ...result, toolCallId: call.id }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { toolCallId: call.id, success: false, output: '', error: msg }
    }
  }

  async requiresConfirmation(call: ToolCall): Promise<boolean> {
    if (this.mode === 'safe' || this.mode === 'auto') return false
    const tool = this.registry.get(call.name)
    return tool?.requiresConfirmation ?? false
  }

  requestConfirmation(call: ToolCall): Promise<boolean> {
    return new Promise((resolve) => {
      const request: ToolConfirmationRequest = {
        tool: call.name,
        input: call.input,
        resolve,
      }
      this.emit('confirm', request)
    })
  }
}
