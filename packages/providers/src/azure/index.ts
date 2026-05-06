/**
 * Azure OpenAI Provider
 * Uses the OpenAI SDK with Azure-specific base URL + api-version.
 * Required env vars:
 *   AZURE_OPENAI_API_KEY
 *   AZURE_OPENAI_ENDPOINT  (e.g. https://my-resource.openai.azure.com)
 *   AZURE_OPENAI_DEPLOYMENT (e.g. gpt-4o)
 *   AZURE_OPENAI_API_VERSION (default: 2024-08-01-preview)
 */
import OpenAI from 'openai'
import { BaseProvider, ArixError } from '@arix/core'
import type { ContentBlock, ModelInfo, ChatRequest, Message, StreamChunk } from '@arix/core'

export class AzureOpenAIProvider extends BaseProvider {
  readonly id = 'azure'
  readonly name = 'Azure OpenAI'
  private readonly client: OpenAI
  private readonly deployment: string

  constructor(options: {
    apiKey?: string
    endpoint?: string
    deployment?: string
    apiVersion?: string
  } = {}) {
    super()
    const key = options.apiKey ?? process.env['AZURE_OPENAI_API_KEY']
    const endpoint = options.endpoint ?? process.env['AZURE_OPENAI_ENDPOINT']
    const deployment = options.deployment ?? process.env['AZURE_OPENAI_DEPLOYMENT'] ?? 'gpt-4o'
    const apiVersion = options.apiVersion ?? process.env['AZURE_OPENAI_API_VERSION'] ?? '2024-08-01-preview'

    if (!key) throw new ArixError('AUTH_ERROR', 'AZURE_OPENAI_API_KEY not set')
    if (!endpoint) throw new ArixError('AUTH_ERROR', 'AZURE_OPENAI_ENDPOINT not set')

    this.deployment = deployment
    this.client = new OpenAI({
      apiKey: key,
      baseURL: `${endpoint.replace(/\/$/, '')}/openai/deployments/${deployment}`,
      defaultHeaders: { 'api-key': key },
      defaultQuery: { 'api-version': apiVersion },
    })
  }

  supportsTools() { return true }
  supportsVision() { return true }

  async listModels(): Promise<ModelInfo[]> {
    return [{ id: this.deployment, name: `Azure ${this.deployment}`, contextLength: 128_000, supportsTools: true, supportsVision: true }]
  }

  async chat(req: ChatRequest): Promise<AsyncIterable<StreamChunk>> {
    const stream = await this.retry(() =>
      this.client.chat.completions.create({
        model: this.deployment,
        messages: flattenToOpenAI(req.messages),
        stream: true,
        ...(req.maxTokens ? { max_tokens: req.maxTokens } : {}),
        ...(req.tools ? {
          tools: req.tools.map((t) => ({
            type: 'function' as const,
            function: { name: t.name, description: t.description, parameters: t.inputSchema },
          })),
        } : {}),
      }),
    )
    return this.streamToChunks(stream)
  }

  private async *streamToChunks(
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
      if (choice.finish_reason === 'stop') yield { done: true }
    }
  }
}

type OpenAIMsg = OpenAI.Chat.Completions.ChatCompletionMessageParam

function flattenToOpenAI(messages: Message[]): OpenAIMsg[] {
  const result: OpenAIMsg[] = []
  for (const m of messages) {
    if (typeof m.content === 'string') {
      result.push({ role: m.role as 'user' | 'assistant' | 'system', content: m.content })
    } else {
      const blocks = m.content as ContentBlock[]
      const text = blocks.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('\n')
      if (text) result.push({ role: m.role as 'user' | 'assistant', content: text })
    }
  }
  return result
}
