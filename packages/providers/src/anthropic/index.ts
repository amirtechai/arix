import Anthropic from '@anthropic-ai/sdk'
import { BaseProvider, ArixError } from '@arix/core'
import type { ContentBlock, ModelInfo, ChatRequest, StreamChunk, Message } from '@arix/core'
import { AnthropicStreamMapper } from './mapper.js'

function mapAnthropicError(err: unknown): never {
  if (err instanceof ArixError) throw err
  if (err instanceof Anthropic.NotFoundError)
    throw new ArixError('MODEL_NOT_FOUND', err.message, { provider: 'anthropic' })
  if (err instanceof Anthropic.AuthenticationError)
    throw new ArixError('AUTH_ERROR', err.message, { provider: 'anthropic' })
  if (err instanceof Anthropic.RateLimitError)
    throw new ArixError('RATE_LIMIT', err.message, { retryable: true, provider: 'anthropic' })
  if (err instanceof Anthropic.InternalServerError)
    throw new ArixError('PROVIDER_UNAVAILABLE', err.message, { retryable: true, provider: 'anthropic' })
  if (err instanceof Anthropic.BadRequestError &&
      /prompt is too long|max.*tokens|context.*length|too long/i.test(err.message))
    throw new ArixError('CONTEXT_TOO_LONG', err.message, { provider: 'anthropic' })
  if (err instanceof Anthropic.BadRequestError && (err.message.includes('content') || err.message.includes('policy')))
    throw new ArixError('CONTENT_FILTERED', err.message, { provider: 'anthropic' })
  const msg = err instanceof Error ? err.message : String(err)
  throw new ArixError('PROVIDER_ERROR', msg, { provider: 'anthropic' })
}

const MODELS: ModelInfo[] = [
  { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', contextLength: 200_000, supportsTools: true, supportsVision: true, pricing: { input: 15, output: 75 } },
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', contextLength: 200_000, supportsTools: true, supportsVision: true, pricing: { input: 3, output: 15 } },
  { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', contextLength: 200_000, supportsTools: true, supportsVision: true, pricing: { input: 0.8, output: 4 } },
]

export class AnthropicProvider extends BaseProvider {
  readonly id = 'anthropic'
  readonly name = 'Anthropic'
  private readonly client: Anthropic

  constructor(options: { apiKey?: string } = {}) {
    super()
    const key = options.apiKey ?? process.env['ANTHROPIC_API_KEY']
    if (!key) throw new ArixError('AUTH_ERROR', 'ANTHROPIC_API_KEY not set')
    this.client = new Anthropic({ apiKey: key })
  }

  supportsTools() { return true }
  supportsVision() { return true }

  async listModels(): Promise<ModelInfo[]> {
    return MODELS
  }

  async chat(req: ChatRequest): Promise<AsyncIterable<StreamChunk>> {
    const rawSystem = req.systemPrompt ?? req.messages.find((m) => m.role === 'system')?.content
    const systemMsg = typeof rawSystem === 'string' ? rawSystem : undefined
    const userMessages = req.messages.filter((m): m is Message & { role: 'user' | 'assistant' } =>
      m.role !== 'system',
    )

    // System prompt with cache_control reduces cost 40-90% for repeated sessions
    const systemBlock: Anthropic.TextBlockParam | undefined = systemMsg
      ? { type: 'text', text: systemMsg, cache_control: { type: 'ephemeral' } }
      : undefined

    let stream: ReturnType<Anthropic['messages']['stream']>
    try {
      stream = this.client.messages.stream({
        model: req.model,
        max_tokens: req.maxTokens ?? 8192,
        ...(systemBlock ? { system: [systemBlock] } : {}),
        messages: userMessages.map((m) => toAnthropicMessage(m)),
        ...(req.tools ? {
          tools: req.tools.map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: t.inputSchema as Anthropic.Tool['input_schema'],
          })),
        } : {}),
      } as Parameters<typeof this.client.messages.stream>[0])
    } catch (err) {
      mapAnthropicError(err)
    }

    return this.toAsyncIterable(stream)
  }

  private async *toAsyncIterable(
    stream: ReturnType<Anthropic['messages']['stream']>,
  ): AsyncIterable<StreamChunk> {
    const mapper = new AnthropicStreamMapper()
    for await (const event of stream) {
      const chunk = mapper.map(event as Parameters<AnthropicStreamMapper['map']>[0])
      if (chunk) {
        if (chunk.done) {
          yield* mapper.flush()
        }
        yield chunk
      }
    }
  }
}

// ── Message mapping ──────────────────────────────────────────────────────────

type AnthropicMessageParam = Anthropic.MessageParam

function toAnthropicMessage(m: Message): AnthropicMessageParam {
  if (typeof m.content === 'string') {
    return { role: m.role as 'user' | 'assistant', content: m.content }
  }

  const blocks = m.content as ContentBlock[]
  const anthropicContent: Anthropic.ContentBlockParam[] = blocks.map((block) => {
    if (block.type === 'text') {
      return { type: 'text', text: block.text } satisfies Anthropic.TextBlockParam
    }
    if (block.type === 'tool_use') {
      return {
        type: 'tool_use',
        id: block.id,
        name: block.name,
        input: block.input,
      } satisfies Anthropic.ToolUseBlockParam
    }
    // tool_result
    return {
      type: 'tool_result',
      tool_use_id: block.toolCallId,
      content: block.output,
      ...(block.isError ? { is_error: true } : {}),
    } satisfies Anthropic.ToolResultBlockParam
  })

  return { role: m.role as 'user' | 'assistant', content: anthropicContent }
}
