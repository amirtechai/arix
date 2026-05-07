import { BaseProvider, ArixError } from '@arix-code/core'
import type { ModelInfo, ChatRequest, StreamChunk } from '@arix-code/core'
import { OpenAIProvider } from '../openai/index.js'

// MiniMax catalogue — long context, multi-modal
const MODELS: ModelInfo[] = [
  { id: 'MiniMax-Text-01',  name: 'MiniMax Text-01',  contextLength: 1_000_000, supportsTools: true,  supportsVision: false, pricing: { input: 0.20, output: 1.10 } },
  { id: 'MiniMax-M1',       name: 'MiniMax M1',       contextLength: 1_000_000, supportsTools: true,  supportsVision: false, pricing: { input: 0.30, output: 1.60 } },
]

export class MiniMaxProvider extends BaseProvider {
  readonly id = 'minimax'
  readonly name = 'MiniMax'
  private readonly delegate: OpenAIProvider

  constructor(options: { apiKey?: string } = {}) {
    super()
    const key = options.apiKey ?? process.env['ARIX_MINIMAX_KEY'] ?? process.env['MINIMAX_API_KEY']
    if (!key) throw new ArixError('AUTH_ERROR', 'MINIMAX_API_KEY not set (set ARIX_MINIMAX_KEY)')
    this.delegate = new OpenAIProvider({ apiKey: key, baseURL: 'https://api.minimax.io/v1' })
  }

  supportsTools() { return true }
  supportsVision() { return false }

  async listModels(): Promise<ModelInfo[]> { return MODELS }

  async chat(req: ChatRequest): Promise<AsyncIterable<StreamChunk>> {
    return this.delegate.chat(req)
  }
}
