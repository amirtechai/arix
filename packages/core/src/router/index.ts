import { ArixError } from '../errors.js'
import type { ModelRegistry } from '../registry/index.js'
import type { ProviderRegistry } from '../provider/registry.js'
import type { Provider } from '../provider/base.js'
import type { Message, TaskType, StreamChunk, ChatRequest } from '../types.js'

export interface RouterRequest {
  messages: Message[]
  taskType?: TaskType
  modelOverride?: string   // role name ('fast') or full id ('openrouter/deepseek/r2')
  requiresTools?: boolean
  maxTokens?: number
  temperature?: number
  systemPrompt?: string
}

const TASK_TYPES: TaskType[] = ['coding', 'reasoning', 'cheap', 'fast', 'local', 'long-context']

export class ModelRouter {
  constructor(
    private readonly registry: ModelRegistry,
    private readonly providers: ProviderRegistry,
    private readonly fallbackChain: string[],
  ) {}

  async route(req: RouterRequest): Promise<{ provider: Provider; model: string; stream: AsyncIterable<StreamChunk> }> {
    const { providerId, model } = this.resolveModel(req)
    const orderedProviders = this.buildProviderOrder(providerId)

    const errors: string[] = []
    for (const pid of orderedProviders) {
      const provider = this.providers.get(pid)
      if (!provider) continue
      try {
        const chatReq: ChatRequest = {
          model,
          messages: req.messages,
          ...(req.maxTokens !== undefined ? { maxTokens: req.maxTokens } : {}),
          ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
          ...(req.systemPrompt !== undefined ? { systemPrompt: req.systemPrompt } : {}),
        }
        const stream = await provider.chat(chatReq)
        return { provider, model, stream }
      } catch (err) {
        if (err instanceof ArixError && err.retryable) {
          errors.push(`${pid}: ${err.message}`)
          continue
        }
        throw err
      }
    }

    throw new ArixError(
      'ALL_PROVIDERS_FAILED',
      `All providers failed: ${errors.join('; ')}`,
    )
  }

  private resolveModel(req: RouterRequest): { providerId: string; model: string } {
    let modelId: string

    if (req.modelOverride) {
      // Could be a role name or a full model ID
      if (TASK_TYPES.includes(req.modelOverride as TaskType)) {
        modelId = this.registry.getModel(req.modelOverride as TaskType)
      } else {
        modelId = req.modelOverride
      }
    } else {
      const role: TaskType = req.taskType ?? 'coding'
      modelId = this.registry.getModel(role)
    }

    const { provider, model } = this.registry.parseModelId(modelId)
    return { providerId: provider, model }
  }

  private buildProviderOrder(primaryId: string): string[] {
    const order = [primaryId]
    for (const id of this.fallbackChain) {
      if (!order.includes(id)) order.push(id)
    }
    return order
  }
}
