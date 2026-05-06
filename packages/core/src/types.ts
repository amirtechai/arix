// ─── JSON Schema ──────────────────────────────────────────────────────────────

export interface JSONSchema {
  type?: string | string[]
  properties?: Record<string, JSONSchema>
  required?: string[]
  items?: JSONSchema
  description?: string
  enum?: unknown[]
  [key: string]: unknown
}

// ─── Content Blocks (for tool use / tool result in multi-turn) ────────────────

export interface TextBlock {
  type: 'text'
  text: string
}

export interface ToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

export interface ToolResultBlock {
  type: 'tool_result'
  toolCallId: string
  output: string
  isError?: boolean
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock

// ─── Messages ─────────────────────────────────────────────────────────────────

export interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string | ContentBlock[]
  id?: string
  timestamp?: number
}

// ─── Streaming ────────────────────────────────────────────────────────────────

export interface ToolCall {
  id: string
  name: string
  input: Record<string, unknown>
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
}

export interface StreamChunk {
  text?: string
  toolCall?: ToolCall
  done: boolean
  error?: string
  usage?: TokenUsage
}

export interface ToolResult {
  toolCallId: string
  success: boolean
  output: string
  error?: string
}

// ─── Models ───────────────────────────────────────────────────────────────────

export interface ModelPricing {
  input: number   // USD per million tokens
  output: number
}

export interface ModelInfo {
  id: string
  name: string
  contextLength: number
  supportsTools: boolean
  supportsVision: boolean
  pricing?: ModelPricing
}

// ─── Provider Request ─────────────────────────────────────────────────────────

export interface ToolDefinition {
  name: string
  description: string
  inputSchema: JSONSchema
}

export interface ChatRequest {
  model: string
  messages: Message[]
  tools?: ToolDefinition[]
  maxTokens?: number
  temperature?: number
  systemPrompt?: string
}

// ─── Registry ─────────────────────────────────────────────────────────────────

export type TaskType = 'coding' | 'reasoning' | 'cheap' | 'fast' | 'local' | 'long-context'

export interface ModelRoleConfig {
  coding?: string
  reasoning?: string
  cheap?: string
  fast?: string
  local?: string
  'long-context'?: string
}

// ─── Security ─────────────────────────────────────────────────────────────────

export type PermissionMode = 'safe' | 'standard' | 'auto'

// ─── Tool System ──────────────────────────────────────────────────────────────

export interface Tool {
  readonly name: string
  readonly description: string
  readonly inputSchema: JSONSchema
  readonly requiresConfirmation: boolean
  execute(input: Record<string, unknown>): Promise<ToolResult>
}

export interface ToolConfirmationRequest {
  tool: string
  input: Record<string, unknown>
  resolve: (approved: boolean) => void
}

// ─── Agent Events ─────────────────────────────────────────────────────────────

export type AgentEvent =
  | { type: 'text'; chunk: string }
  | { type: 'tool_start'; call: ToolCall }
  | { type: 'tool_result'; result: ToolResult }
  | { type: 'tool_confirm'; request: ToolConfirmationRequest }
  | { type: 'done' }
  | { type: 'error'; error: string }
