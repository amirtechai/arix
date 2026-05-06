import { BaseProvider, ArixError } from '@arix/core'
import type { ContentBlock, ModelInfo, ChatRequest, Message, StreamChunk } from '@arix/core'
import type { TextBlock, ToolUseBlock, ToolResultBlock } from '@arix/core'
import type { OpenRouterChatRequest, OpenRouterMessage, OpenRouterModelInfo } from './types.js'
import { parseSSEStream } from './stream.js'

const BASE_URL = 'https://openrouter.ai/api/v1'

export class OpenRouterProvider extends BaseProvider {
  readonly id = 'openrouter'
  readonly name = 'OpenRouter'

  private readonly apiKey: string
  private readonly timeout: number

  constructor(options: { apiKey?: string; timeout?: number } = {}) {
    super()
    const key = options.apiKey ?? process.env['OPENROUTER_API_KEY']
    if (!key) throw new ArixError('AUTH_ERROR', 'OPENROUTER_API_KEY not set')
    this.apiKey = key
    this.timeout = options.timeout ?? 30_000
  }

  supportsTools() { return true }
  supportsVision() { return true }

  async listModels(): Promise<ModelInfo[]> {
    const res = await this.fetch('/models')
    const data = (await res.json()) as { data: OpenRouterModelInfo[] }
    return data.data.map((m) => ({
      id: `openrouter/${m.id}`,
      name: m.name,
      contextLength: m.context_length,
      supportsTools: true as const,
      supportsVision: false as const,
      ...(m.pricing ? {
        pricing: { input: parseFloat(m.pricing.prompt) * 1e6, output: parseFloat(m.pricing.completion) * 1e6 },
      } : {}),
    }))
  }

  async chat(req: ChatRequest): Promise<AsyncIterable<StreamChunk>> {
    const body: OpenRouterChatRequest = {
      model: req.model,
      messages: flattenToOpenRouter(req.messages),
      stream: true,
      stream_options: { include_usage: true },
      ...(req.maxTokens ? { max_tokens: req.maxTokens } : {}),
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      ...(req.tools ? {
        tools: req.tools.map((t) => ({
          type: 'function' as const,
          function: { name: t.name, description: t.description, parameters: t.inputSchema },
        })),
      } : {}),
    }

    const res = await this.retry(() => this.fetch('/chat/completions', body))
    if (!res.body) throw new ArixError('PROVIDER_UNAVAILABLE', 'No response body')
    return parseSSEStream(res.body)
  }

  private async fetch(path: string, body?: unknown): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeout)

    try {
      const res = await globalThis.fetch(`${BASE_URL}${path}`, {
        method: body ? 'POST' : 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/arix/arix',
          'X-Title': 'Arix',
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      })

      if (res.status === 401) throw new ArixError('AUTH_ERROR', 'Invalid OpenRouter API key', { provider: 'openrouter' })
      if (res.status === 404) throw new ArixError('MODEL_NOT_FOUND', `Model not found on OpenRouter`, { provider: 'openrouter' })
      if (res.status === 429) throw new ArixError('RATE_LIMIT', 'Rate limited', { retryable: true, provider: 'openrouter' })
      if (res.status >= 500) throw new ArixError('PROVIDER_UNAVAILABLE', `OpenRouter ${res.status}`, { retryable: true, provider: 'openrouter' })

      return res
    } catch (err) {
      if (err instanceof ArixError) throw err
      const msg = err instanceof Error ? err.message : String(err)
      throw new ArixError('PROVIDER_UNAVAILABLE', `OpenRouter fetch failed: ${msg}`, { retryable: true, provider: 'openrouter' })
    } finally {
      clearTimeout(timer)
    }
  }
}

// ── Message mapping ──────────────────────────────────────────────────────────

function flattenToOpenRouter(messages: Message[]): OpenRouterMessage[] {
  const result: OpenRouterMessage[] = []

  for (const m of messages) {
    if (typeof m.content === 'string') {
      result.push({ role: m.role as 'user' | 'assistant' | 'system', content: m.content })
      continue
    }

    const blocks = m.content as ContentBlock[]
    const toolUseBlocks = blocks.filter((b): b is ToolUseBlock => b.type === 'tool_use')
    const toolResultBlocks = blocks.filter((b): b is ToolResultBlock => b.type === 'tool_result')
    const textBlocks = blocks.filter((b): b is TextBlock => b.type === 'text')

    if (toolResultBlocks.length > 0) {
      // Each tool_result → separate { role: 'tool' } message
      for (const block of toolResultBlocks) {
        result.push({ role: 'tool', tool_call_id: block.toolCallId, content: block.output })
      }
    } else if (toolUseBlocks.length > 0) {
      // Assistant message with tool_calls
      result.push({
        role: 'assistant',
        content: textBlocks.length > 0 ? textBlocks[0]!.text : null,
        tool_calls: toolUseBlocks.map((b) => ({
          id: b.id,
          type: 'function' as const,
          function: { name: b.name, arguments: JSON.stringify(b.input) },
        })),
      })
    } else if (textBlocks.length > 0) {
      result.push({ role: m.role as 'user' | 'assistant', content: textBlocks[0]!.text })
    }
  }

  return result
}
