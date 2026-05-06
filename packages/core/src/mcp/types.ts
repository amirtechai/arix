// MCP (Model Context Protocol) type definitions — JSON-RPC 2.0 based

export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: string | number
  method: string
  params?: Record<string, unknown>
}

export interface JsonRpcNotification {
  jsonrpc: '2.0'
  method: string
  params?: Record<string, unknown>
}

export interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: string | number
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

// ── Initialize ────────────────────────────────────────────────────────────────

export interface McpClientInfo {
  name: string
  version: string
}

export interface McpCapabilities {
  tools?: Record<string, unknown>
  resources?: Record<string, unknown>
  prompts?: Record<string, unknown>
}

export interface McpInitializeParams {
  protocolVersion: string
  capabilities: McpCapabilities
  clientInfo: McpClientInfo
}

export interface McpInitializeResult {
  protocolVersion: string
  capabilities: McpCapabilities
  serverInfo: { name: string; version: string }
}

// ── Tools ─────────────────────────────────────────────────────────────────────

export interface McpTool {
  name: string
  description?: string
  inputSchema: {
    type: 'object'
    properties?: Record<string, unknown>
    required?: string[]
    [key: string]: unknown
  }
}

export interface McpToolsListResult {
  tools: McpTool[]
}

export interface McpCallToolParams {
  name: string
  arguments?: Record<string, unknown>
}

export interface McpContentItem {
  type: 'text' | 'image' | 'resource'
  text?: string
  data?: string
  mimeType?: string
}

export interface McpCallToolResult {
  content: McpContentItem[]
  isError?: boolean
}

// ── Resources ─────────────────────────────────────────────────────────────────

export interface McpResource {
  uri: string
  name: string
  description?: string
  mimeType?: string
}

export interface McpResourcesListResult {
  resources: McpResource[]
}

// ── Server Config ─────────────────────────────────────────────────────────────

export type McpTransportType = 'stdio' | 'http'

export interface McpServerConfig {
  name: string
  transport: McpTransportType
  /** For stdio: command to spawn (e.g. "npx", "node") */
  command?: string
  /** For stdio: args to pass */
  args?: string[]
  /** For stdio: environment variables */
  env?: Record<string, string>
  /** For http: server URL */
  url?: string
  /** For http: auth headers */
  headers?: Record<string, string>
  /** Whether this server is enabled */
  enabled?: boolean
}

export const MCP_PROTOCOL_VERSION = '2024-11-05'
