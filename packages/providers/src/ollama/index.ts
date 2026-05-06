import { BaseProvider } from '@arix/core'
import type { ModelInfo, ChatRequest, StreamChunk } from '@arix/core'
import { parseSSEStream } from '../openrouter/stream.js'

interface OllamaModel {
  name: string
  size: number
  digest: string
  modified_at: string
}

export class OllamaProvider extends BaseProvider {
  readonly id = 'ollama'
  readonly name = 'Ollama (Local)'
  private readonly baseURL: string

  constructor(options: { baseURL?: string } = {}) {
    super()
    this.baseURL = options.baseURL ?? (process.env['OLLAMA_BASE_URL'] ?? 'http://localhost:11434')
  }

  supportsTools() { return true }
  supportsVision() { return false }

  async isAvailable(): Promise<boolean> {
    try {
      await globalThis.fetch(`${this.baseURL}/api/tags`, { signal: AbortSignal.timeout(2000) })
      return true
    } catch {
      return false
    }
  }

  mapModel(m: OllamaModel): ModelInfo {
    return {
      id: m.name,
      name: m.name,
      contextLength: 32_768,
      supportsTools: true,
      supportsVision: false,
      pricing: { input: 0, output: 0 },
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const res = await globalThis.fetch(`${this.baseURL}/api/tags`)
      const data = (await res.json()) as { models: OllamaModel[] }
      return data.models.map((m) => this.mapModel(m))
    } catch {
      return [] // Ollama not running — return empty list, don't throw
    }
  }

  async chat(req: ChatRequest): Promise<AsyncIterable<StreamChunk>> {
    const res = await globalThis.fetch(`${this.baseURL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: req.model,
        messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
        stream: true,
        ...(req.maxTokens ? { max_tokens: req.maxTokens } : {}),
        ...(req.tools?.length ? {
          tools: req.tools.map((t) => ({
            type: 'function' as const,
            function: { name: t.name, description: t.description, parameters: t.inputSchema },
          })),
          tool_choice: 'auto',
        } : {}),
      }),
    })

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => res.statusText)
      throw new Error(`Ollama error ${res.status}: ${text}`)
    }

    return parseSSEStream(res.body)
  }
}
