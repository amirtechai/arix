export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'tool' | 'system'
  content: string
  // Tool-specific fields
  toolName?: string
  toolInput?: Record<string, unknown>
  toolSuccess?: boolean
  // Streaming
  streaming?: boolean
}

export interface AppState {
  messages: ChatMessage[]
  streaming: boolean
  error: string | undefined
  tokenCount: number
}
