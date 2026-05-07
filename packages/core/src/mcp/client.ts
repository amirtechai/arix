import { StdioTransport } from './transport/stdio.js'
import { HttpTransport } from './transport/http.js'
import type {
  McpServerConfig,
  McpTool,
  McpToolsListResult,
  McpCallToolResult,
  McpInitializeResult,
  McpInitializeParams,
} from './types.js'
import { MCP_PROTOCOL_VERSION as PROTOCOL_VER } from './types.js'

type Transport = StdioTransport | HttpTransport

export class McpClient {
  private transport: Transport | null = null
  private initialized = false
  private _tools: McpTool[] = []

  constructor(private readonly config: McpServerConfig) {}

  async connect(): Promise<void> {
    if (this.config.transport === 'stdio') {
      if (!this.config.command) throw new Error('MCP stdio transport requires a command')
      this.transport = new StdioTransport(
        this.config.command,
        this.config.args ?? [],
        this.config.env,
      )
    } else {
      if (!this.config.url) throw new Error('MCP http transport requires a url')
      this.transport = new HttpTransport(this.config.url, this.config.headers)
    }

    await this.transport.start()
    await this.initialize()
  }

  private async initialize(): Promise<void> {
    const params: McpInitializeParams = {
      protocolVersion: PROTOCOL_VER,
      capabilities: { tools: {} },
      clientInfo: { name: 'arix', version: '0.1.0' },
    }
    const result = await this.transport!.request('initialize', params as unknown as Record<string, unknown>) as McpInitializeResult
    this.transport!.notify('notifications/initialized')
    this.initialized = true

    // Eagerly discover tools
    await this.refreshTools()

    process.stderr.write(
      `[mcp] Connected: ${result.serverInfo.name} v${result.serverInfo.version} (${this._tools.length} tools)\n`
    )
  }

  async refreshTools(): Promise<McpTool[]> {
    this.ensureReady()
    const result = await this.transport!.request('tools/list') as McpToolsListResult
    this._tools = result.tools ?? []
    return this._tools
  }

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<McpCallToolResult> {
    this.ensureReady()
    const result = await this.transport!.request('tools/call', { name, arguments: args }) as McpCallToolResult
    return result
  }

  get tools(): McpTool[] {
    return this._tools
  }

  get serverName(): string {
    return this.config.name
  }

  get isConnected(): boolean {
    return this.initialized && (this.transport?.isAlive ?? false)
  }

  disconnect(): void {
    this.transport?.close()
    this.transport = null
    this.initialized = false
  }

  private ensureReady(): void {
    if (!this.initialized || !this.transport) {
      throw new Error(`MCP client "${this.config.name}" is not connected`)
    }
  }
}
