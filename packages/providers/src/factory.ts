import type { Provider } from '@arix-code/core'
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

/**
 * OpenAI-compatible provider aliases — these vendors expose an OpenAI-style
 * `/v1/chat/completions` endpoint. We reuse OpenAIProvider with a custom baseURL.
 */
export const OPENAI_COMPATIBLE_PROVIDERS: Record<string, { baseUrl: string; envKey: string }> = {
  deepseek:    { baseUrl: 'https://api.deepseek.com/v1',                    envKey: 'DEEPSEEK_API_KEY' },
  together:    { baseUrl: 'https://api.together.xyz/v1',                    envKey: 'TOGETHER_API_KEY' },
  groq:        { baseUrl: 'https://api.groq.com/openai/v1',                 envKey: 'GROQ_API_KEY' },
  fireworks:   { baseUrl: 'https://api.fireworks.ai/inference/v1',          envKey: 'FIREWORKS_API_KEY' },
  cerebras:    { baseUrl: 'https://api.cerebras.ai/v1',                     envKey: 'CEREBRAS_API_KEY' },
  xai:         { baseUrl: 'https://api.x.ai/v1',                            envKey: 'XAI_API_KEY' },
  grok:        { baseUrl: 'https://api.x.ai/v1',                            envKey: 'XAI_API_KEY' },
  perplexity:  { baseUrl: 'https://api.perplexity.ai',                      envKey: 'PERPLEXITY_API_KEY' },
  mistral:     { baseUrl: 'https://api.mistral.ai/v1',                      envKey: 'MISTRAL_API_KEY' },
  cohere:      { baseUrl: 'https://api.cohere.com/compatibility/v1',        envKey: 'COHERE_API_KEY' },
  replicate:   { baseUrl: 'https://openai-proxy.replicate.com/v1',          envKey: 'REPLICATE_API_TOKEN' },
}

export class ProviderFactory {
  static listProviders(): string[] {
    return [
      'openrouter', 'anthropic', 'openai', 'ollama', 'gemini',
      'azure', 'bedrock', 'vertex', 'nvidia', 'minimax',
      ...Object.keys(OPENAI_COMPATIBLE_PROVIDERS),
    ]
  }

  static create(name: string, opts: ProviderOptions = {}): Provider {
    const compat = OPENAI_COMPATIBLE_PROVIDERS[name]
    if (compat) {
      const apiKey = opts.apiKey ?? process.env[compat.envKey]
      return new OpenAIProvider({
        ...(apiKey !== undefined ? { apiKey } : {}),
        baseURL: opts.baseUrl ?? compat.baseUrl,
      })
    }
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
        throw new Error(`Unknown provider: ${name}. Valid options: ${ProviderFactory.listProviders().join(', ')}`)
    }
  }
}
