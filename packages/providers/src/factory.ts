import type { Provider } from '@arix/core'
import { OpenRouterProvider } from './openrouter/index.js'
import { AnthropicProvider } from './anthropic/index.js'
import { OpenAIProvider } from './openai/index.js'
import { OllamaProvider } from './ollama/index.js'
import { GeminiProvider } from './gemini/index.js'
import { AzureOpenAIProvider } from './azure/index.js'
import { BedrockProvider } from './bedrock/index.js'
import { VertexAIProvider } from './vertex/index.js'
import { NvidiaProvider } from './nim/index.js'
import { MiniMaxProvider } from './minimax/index.js'

export interface ProviderOptions {
  apiKey?: string
  baseUrl?: string
}

export class ProviderFactory {
  static create(name: string, opts: ProviderOptions = {}): Provider {
    switch (name) {
      case 'openrouter':
        return new OpenRouterProvider({
          ...(opts.apiKey !== undefined ? { apiKey: opts.apiKey } : {}),
        })
      case 'anthropic':
        return new AnthropicProvider({
          ...(opts.apiKey !== undefined ? { apiKey: opts.apiKey } : {}),
        })
      case 'openai':
        return new OpenAIProvider({
          ...(opts.apiKey !== undefined ? { apiKey: opts.apiKey } : {}),
          ...(opts.baseUrl !== undefined ? { baseURL: opts.baseUrl } : {}),
        })
      case 'ollama':
        return new OllamaProvider({
          ...(opts.baseUrl !== undefined ? { baseURL: opts.baseUrl } : {}),
        })
      case 'gemini':
        return new GeminiProvider({
          ...(opts.apiKey !== undefined ? { apiKey: opts.apiKey } : {}),
        })
      case 'azure':
        return new AzureOpenAIProvider({
          ...(opts.apiKey !== undefined ? { apiKey: opts.apiKey } : {}),
          ...(opts.baseUrl !== undefined ? { endpoint: opts.baseUrl } : {}),
        })
      case 'bedrock':
        return new BedrockProvider()
      case 'vertex':
        return new VertexAIProvider()
      case 'nvidia':
      case 'nim':
        return new NvidiaProvider({
          ...(opts.apiKey !== undefined ? { apiKey: opts.apiKey } : {}),
        })
      case 'minimax':
        return new MiniMaxProvider({
          ...(opts.apiKey !== undefined ? { apiKey: opts.apiKey } : {}),
        })
      default:
        throw new Error(`Unknown provider: ${name}. Valid options: openrouter, anthropic, openai, ollama, gemini, azure, bedrock, vertex, nvidia, minimax`)
    }
  }
}
