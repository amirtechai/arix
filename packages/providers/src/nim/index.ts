import { BaseProvider, ArixError } from '@arix-code/core'
import type { ModelInfo, ChatRequest, StreamChunk } from '@arix-code/core'
import { OpenAIProvider } from '../openai/index.js'

// NVIDIA NIM catalogue — fast inference, OpenAI-compatible endpoint
const MODELS: ModelInfo[] = [
  { id: 'meta/llama-3.3-70b-instruct',     name: 'Llama 3.3 70B Instruct',  contextLength: 128_000, supportsTools: true,  supportsVision: false, pricing: { input: 0.27, output: 0.27 } },
  { id: 'meta/llama-3.1-405b-instruct',    name: 'Llama 3.1 405B Instruct', contextLength: 128_000, supportsTools: true,  supportsVision: false, pricing: { input: 3.99, output: 3.99 } },
  { id: 'nvidia/llama-3.1-nemotron-70b-instruct', name: 'Nemotron 70B',    contextLength: 128_000, supportsTools: true,  supportsVision: false, pricing: { input: 0.35, output: 0.40 } },
  { id: 'mistralai/mixtral-8x22b-instruct', name: 'Mixtral 8x22B',         contextLength: 64_000,  supportsTools: true,  supportsVision: false, pricing: { input: 0.60, output: 0.60 } },
  { id: 'google/gemma-2-27b-it',           name: 'Gemma 2 27B',            contextLength: 8_192,   supportsTools: false, supportsVision: false, pricing: { input: 0.20, output: 0.20 } },
]

export class NvidiaProvider extends BaseProvider {
  readonly id = 'nvidia'
  readonly name = 'NVIDIA NIM'
  private readonly delegate: OpenAIProvider

  constructor(options: { apiKey?: string } = {}) {
    super()
    const key = options.apiKey ?? process.env['ARIX_NVIDIA_KEY'] ?? process.env['NVIDIA_API_KEY']
    if (!key) throw new ArixError('AUTH_ERROR', 'NVIDIA_API_KEY not set (set ARIX_NVIDIA_KEY)')
    this.delegate = new OpenAIProvider({ apiKey: key, baseURL: 'https://integrate.api.nvidia.com/v1' })
  }

  supportsTools() { return true }
  supportsVision() { return false }

  async listModels(): Promise<ModelInfo[]> { return MODELS }

  async chat(req: ChatRequest): Promise<AsyncIterable<StreamChunk>> {
    return this.delegate.chat(req)
  }
}
