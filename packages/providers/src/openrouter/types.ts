export type OpenRouterMessage =
  | { role: 'user' | 'assistant' | 'system'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> }
  | { role: 'tool'; tool_call_id: string; content: string }

export interface OpenRouterChatRequest {
  model: string
  messages: OpenRouterMessage[]
  stream: true
  stream_options?: { include_usage: boolean }
  tools?: Array<{
    type: 'function'
    function: { name: string; description: string; parameters: unknown }
  }>
  max_tokens?: number
  temperature?: number
}

export interface OpenRouterModelInfo {
  id: string
  name: string
  context_length: number
  description?: string
  pricing?: { prompt: string; completion: string }
  top_provider?: { is_moderated: boolean }
}

export interface OpenRouterDelta {
  content?: string
  tool_calls?: Array<{
    index: number
    id?: string
    function?: { name?: string; arguments?: string }
  }>
}

export interface OpenRouterChunk {
  choices: Array<{ delta: OpenRouterDelta; finish_reason: string | null }>
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
}
