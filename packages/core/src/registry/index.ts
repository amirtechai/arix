import type { ModelRoleConfig, TaskType } from '../types.js'

const DEFAULTS: Required<ModelRoleConfig> = {
  coding: 'anthropic/claude-sonnet-4-6',
  reasoning: 'openrouter/openai/o3',
  cheap: 'openrouter/google/gemma-3-4b-it',
  fast: 'openrouter/meta-llama/llama-3.1-8b-instruct',
  local: 'ollama/qwen2.5-coder:7b',
  'long-context': 'openrouter/anthropic/claude-opus-4-6',
}

const KNOWN_PROVIDERS = ['openrouter', 'anthropic', 'openai', 'ollama'] as const

export class ModelRegistry {
  private readonly config: Required<ModelRoleConfig>

  constructor(config: ModelRoleConfig) {
    this.config = { ...DEFAULTS, ...config }
  }

  getModel(role: TaskType): string {
    return this.config[role]
  }

  setModel(role: TaskType, modelId: string): void {
    this.config[role] = modelId
  }

  parseModelId(modelId: string): { provider: string; model: string } {
    for (const provider of KNOWN_PROVIDERS) {
      if (modelId.startsWith(provider + '/')) {
        return { provider, model: modelId.slice(provider.length + 1) }
      }
    }
    // Unknown prefix — treat first segment as provider
    const slash = modelId.indexOf('/')
    if (slash === -1) return { provider: 'openrouter', model: modelId }
    return { provider: modelId.slice(0, slash), model: modelId.slice(slash + 1) }
  }
}
