import OpenAI from 'openai'
import { BaseProvider, ArixError } from '@arix-code/core'
import type { ContentBlock, ModelInfo, ChatRequest, Message, StreamChunk } from '@arix-code/core'

function mapOpenAIError(err: unknown, provider = 'openai'): never {
  if (err instanceof ArixError) throw err
  if (err instanceof OpenAI.NotFoundError)
    throw new ArixError('MODEL_NOT_FOUND', err.message, { provider })
  if (err instanceof OpenAI.AuthenticationError)
    throw new ArixError('AUTH_ERROR', err.message, { provider })
  if (err instanceof OpenAI.RateLimitError)
    throw new ArixError('RATE_LIMIT', err.message, { retryable: true, provider })
  if (err instanceof OpenAI.InternalServerError)
    throw new ArixError('PROVIDER_UNAVAILABLE', err.message, { retryable: true, provider })
  if (err instanceof OpenAI.BadRequestError && err.code === 'content_filter')
    throw new ArixError('CONTENT_FILTERED', err.message, { provider })
  if (err instanceof OpenAI.BadRequestError &&
      (err.code === 'context_length_exceeded' || /context.*length|maximum context|too many tokens/i.test(err.message)))
    throw new ArixError('CONTEXT_TOO_LONG', err.message, { provider })
  const msg = err instanceof Error ? err.message : String(err)
  throw new ArixError('PROVIDER_ERROR', msg, { provider })
}

export class OpenAIProvider extends BaseProvider {
  readonly id = 'openai'
  readonly name = 'OpenAI'
  private readonly client: OpenAI

  constructor(options: { apiKey?: string; baseURL?: string } = {}) {
    super()
    const key = options.apiKey ?? process.env['OPENAI_API_KEY']
    if (!key) throw new ArixError('AUTH_ERROR', 'OPENAI_API_KEY not set')
    this.client = new OpenAI({ apiKey: key, ...(options.baseURL ? { baseURL: options.baseURL } : {}) })
  }

  supportsTools() { return true }
  supportsVision() { return true }

  async listModels(): Promise<ModelInfo[]> {
    const models = await this.client.models.list()
    return models.data
      .filter((m) => m.id.startsWith('gpt-') || m.id.startsWith('o'))
      .map((m) => ({
        id: m.id,
        name: m.id,
        contextLength: 128_000,
        supportsTools: true,
        supportsVision: m.id.includes('vision') || m.id.includes('gpt-4o'),
      }))
  }

  async chat(req: ChatRequest): Promise<AsyncIterable<StreamChunk>> {
    let stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>
    try {
      stream = await this.retry(() =>
        this.client.chat.completions.create({
          model: req.model,
          messages: flattenToOpenAI(req.messages),
          stream: true,
          ...(req.maxTokens ? { max_tokens: req.maxTokens } : {}),
          ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
          ...(req.tools ? {
            tools: req.tools.map((t) => ({
              type: 'function' as const,
              function: { name: t.name, description: t.description, parameters: t.inputSchema },
            })),
          } : {}),
        }),
      )
    } catch (err) {
      mapOpenAIError(err, this.id)
    }

    return this.toAsyncIterable(stream)
  }

  private async *toAsyncIterable(
    stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>,
  ): AsyncIterable<StreamChunk> {
    for await (const chunk of stream) {
      const choice = chunk.choices[0]
      if (!choice) continue
      const delta = choice.delta
      if (delta.content) yield { text: delta.content, done: false }
      if (delta.tool_calls?.[0]) {
        const tc = delta.tool_calls[0]
        if (tc.id && tc.function?.name) {
          let input: Record<string, unknown> = {}
          try { input = JSON.parse(tc.function.arguments ?? '{}') as Record<string, unknown> } catch { /* empty */ }
          yield { toolCall: { id: tc.id, name: tc.function.name, input }, done: false }
        }
      }
      if (choice.finish_reason === 'content_filter')
        throw new ArixError('CONTENT_FILTERED', 'Response blocked by content filter', { provider: this.id })
      if (choice.finish_reason === 'stop') yield { done: true }
    }
  }
}

// ── Message mapping ──────────────────────────────────────────────────────────

type OpenAIMsg = OpenAI.Chat.Completions.ChatCompletionMessageParam

function flattenToOpenAI(messages: Message[]): OpenAIMsg[] {
  const result: OpenAIMsg[] = []
  for (const m of messages) {
    if (typeof m.content === 'string') {
      result.push({ role: m.role as 'user' | 'assistant' | 'system', content: m.content })
      continue
    }

    const blocks = m.content as ContentBlock[]
    const toolUseBlocks = blocks.filter((b): b is Extract<ContentBlock, { type: 'tool_use' }> => b.type === 'tool_use')
    const toolResultBlocks = blocks.filter((b): b is Extract<ContentBlock, { type: 'tool_result' }> => b.type === 'tool_result')
    const textBlocks = blocks.filter((b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text')

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
