/**
 * ModelRegistry — centralised, auto-updating catalogue of every model
 * available across all Arix providers.
 *
 * Design goals:
 *   • Zero-extra-cost: pricing data is embedded (updated per release) and
 *     optionally refreshed from the provider at runtime when possible.
 *   • Offline-first: always falls back to the embedded catalogue.
 *   • Task-routing: exposes a `recommend()` method that picks the cheapest
 *     model capable of handling a given task complexity + constraints.
 */

import type { ModelInfo, ModelPricing } from '../types.js'

// ── Embedded catalogue (updated with each release) ────────────────────────
// Prices: USD per 1 million tokens (input / output).

const CATALOGUE: Array<ModelInfo & { provider: string; tier: TaskTier }> = [
  // ── Anthropic ──────────────────────────────────────────────────────────
  { provider: 'anthropic', id: 'claude-opus-4-6',            name: 'Claude Opus 4.6',           contextLength: 200_000, supportsTools: true, supportsVision: true,  tier: 'complex',  pricing: { input: 15,    output: 75    } },
  { provider: 'anthropic', id: 'claude-sonnet-4-6',          name: 'Claude Sonnet 4.6',         contextLength: 200_000, supportsTools: true, supportsVision: true,  tier: 'medium',   pricing: { input: 3,     output: 15    } },
  { provider: 'anthropic', id: 'claude-haiku-4-5-20251001',  name: 'Claude Haiku 4.5',          contextLength: 200_000, supportsTools: true, supportsVision: true,  tier: 'simple',   pricing: { input: 0.8,   output: 4     } },
  { provider: 'anthropic', id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet',         contextLength: 200_000, supportsTools: true, supportsVision: true,  tier: 'medium',   pricing: { input: 3,     output: 15    } },
  { provider: 'anthropic', id: 'claude-3-5-haiku-20241022',  name: 'Claude 3.5 Haiku',          contextLength: 200_000, supportsTools: true, supportsVision: true,  tier: 'simple',   pricing: { input: 0.8,   output: 4     } },

  // ── OpenAI ─────────────────────────────────────────────────────────────
  { provider: 'openai',    id: 'gpt-4o',                     name: 'GPT-4o',                    contextLength: 128_000, supportsTools: true, supportsVision: true,  tier: 'complex',  pricing: { input: 5,     output: 15    } },
  { provider: 'openai',    id: 'gpt-4o-mini',                name: 'GPT-4o Mini',               contextLength: 128_000, supportsTools: true, supportsVision: true,  tier: 'simple',   pricing: { input: 0.15,  output: 0.6   } },
  { provider: 'openai',    id: 'o3',                         name: 'o3',                        contextLength: 200_000, supportsTools: true, supportsVision: true,  tier: 'complex',  pricing: { input: 10,    output: 40    } },
  { provider: 'openai',    id: 'o4-mini',                    name: 'o4-mini',                   contextLength: 200_000, supportsTools: true, supportsVision: false, tier: 'medium',   pricing: { input: 1.1,   output: 4.4   } },
  { provider: 'openai',    id: 'gpt-4.1',                    name: 'GPT-4.1',                   contextLength: 1_000_000, supportsTools: true, supportsVision: true, tier: 'complex', pricing: { input: 2,     output: 8     } },
  { provider: 'openai',    id: 'gpt-4.1-mini',               name: 'GPT-4.1 Mini',              contextLength: 1_000_000, supportsTools: true, supportsVision: true, tier: 'simple',  pricing: { input: 0.4,   output: 1.6   } },
  { provider: 'openai',    id: 'gpt-4.1-nano',               name: 'GPT-4.1 Nano',              contextLength: 1_000_000, supportsTools: true, supportsVision: true, tier: 'simple',  pricing: { input: 0.1,   output: 0.4   } },

  // ── Google Gemini ──────────────────────────────────────────────────────
  { provider: 'gemini',    id: 'gemini-2.5-pro-preview-05-06', name: 'Gemini 2.5 Pro',          contextLength: 1_000_000, supportsTools: true, supportsVision: true, tier: 'complex', pricing: { input: 1.25,  output: 10    } },
  { provider: 'gemini',    id: 'gemini-2.5-flash-preview-04-17', name: 'Gemini 2.5 Flash',      contextLength: 1_000_000, supportsTools: true, supportsVision: true, tier: 'medium',  pricing: { input: 0.15,  output: 0.6   } },
  { provider: 'gemini',    id: 'gemini-2.0-flash',            name: 'Gemini 2.0 Flash',          contextLength: 1_000_000, supportsTools: true, supportsVision: true, tier: 'simple',  pricing: { input: 0.1,   output: 0.4   } },
  { provider: 'gemini',    id: 'gemini-2.0-flash-lite',       name: 'Gemini 2.0 Flash Lite',     contextLength: 1_000_000, supportsTools: true, supportsVision: true, tier: 'simple',  pricing: { input: 0.075, output: 0.3   } },

  // ── OpenRouter (best-of-web routing) ──────────────────────────────────
  { provider: 'openrouter', id: 'anthropic/claude-opus-4',   name: 'Claude Opus 4 (OR)',        contextLength: 200_000, supportsTools: true, supportsVision: true,  tier: 'complex',  pricing: { input: 15,    output: 75    } },
  { provider: 'openrouter', id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4 (OR)',      contextLength: 200_000, supportsTools: true, supportsVision: true,  tier: 'medium',   pricing: { input: 3,     output: 15    } },
  { provider: 'openrouter', id: 'google/gemini-2.5-pro',     name: 'Gemini 2.5 Pro (OR)',       contextLength: 1_000_000, supportsTools: true, supportsVision: true, tier: 'complex', pricing: { input: 1.25,  output: 10    } },
  { provider: 'openrouter', id: 'deepseek/deepseek-r2',      name: 'DeepSeek R2 (OR)',          contextLength: 128_000, supportsTools: true, supportsVision: false, tier: 'complex',  pricing: { input: 0.55,  output: 2.19  } },
  { provider: 'openrouter', id: 'meta-llama/llama-4-maverick', name: 'Llama 4 Maverick (OR)',   contextLength: 128_000, supportsTools: true, supportsVision: true,  tier: 'medium',   pricing: { input: 0.2,   output: 0.6   } },
  { provider: 'openrouter', id: 'mistralai/mistral-large-2',  name: 'Mistral Large 2 (OR)',     contextLength: 128_000, supportsTools: true, supportsVision: false, tier: 'medium',   pricing: { input: 2,     output: 6     } },

  // ── AWS Bedrock ────────────────────────────────────────────────────────
  { provider: 'bedrock',   id: 'anthropic.claude-3-5-sonnet-20241022-v2:0', name: 'Claude 3.5 Sonnet (Bedrock)', contextLength: 200_000, supportsTools: true, supportsVision: true, tier: 'medium', pricing: { input: 3, output: 15 } },
  { provider: 'bedrock',   id: 'anthropic.claude-3-haiku-20240307-v1:0',    name: 'Claude 3 Haiku (Bedrock)',    contextLength: 200_000, supportsTools: true, supportsVision: true, tier: 'simple', pricing: { input: 0.25, output: 1.25 } },
  { provider: 'bedrock',   id: 'meta.llama3-70b-instruct-v1:0',             name: 'Llama 3 70B (Bedrock)',       contextLength: 128_000, supportsTools: false, supportsVision: false, tier: 'medium', pricing: { input: 0.99, output: 0.99 } },

  // ── Azure OpenAI ───────────────────────────────────────────────────────
  { provider: 'azure',     id: 'gpt-4o',                     name: 'GPT-4o (Azure)',             contextLength: 128_000, supportsTools: true, supportsVision: true,  tier: 'complex',  pricing: { input: 5,     output: 15    } },
  { provider: 'azure',     id: 'gpt-4o-mini',                name: 'GPT-4o Mini (Azure)',        contextLength: 128_000, supportsTools: true, supportsVision: true,  tier: 'simple',   pricing: { input: 0.15,  output: 0.6   } },

  // ── Google Vertex AI ───────────────────────────────────────────────────
  { provider: 'vertex',    id: 'gemini-2.5-pro',             name: 'Gemini 2.5 Pro (Vertex)',    contextLength: 1_000_000, supportsTools: true, supportsVision: true, tier: 'complex', pricing: { input: 1.25, output: 10 } },
  { provider: 'vertex',    id: 'gemini-2.5-flash',           name: 'Gemini 2.5 Flash (Vertex)',  contextLength: 1_000_000, supportsTools: true, supportsVision: true, tier: 'medium',  pricing: { input: 0.15, output: 0.6 } },

  // ── NVIDIA NIM (fast inference) ───────────────────────────────────────
  { provider: 'nvidia',    id: 'meta/llama-3.3-70b-instruct',            name: 'Llama 3.3 70B (NIM)',    contextLength: 128_000, supportsTools: true,  supportsVision: false, tier: 'medium',  pricing: { input: 0.27, output: 0.27 } },
  { provider: 'nvidia',    id: 'meta/llama-3.1-405b-instruct',           name: 'Llama 3.1 405B (NIM)',   contextLength: 128_000, supportsTools: true,  supportsVision: false, tier: 'complex', pricing: { input: 3.99, output: 3.99 } },
  { provider: 'nvidia',    id: 'nvidia/llama-3.1-nemotron-70b-instruct', name: 'Nemotron 70B (NIM)',     contextLength: 128_000, supportsTools: true,  supportsVision: false, tier: 'medium',  pricing: { input: 0.35, output: 0.40 } },
  { provider: 'nvidia',    id: 'mistralai/mixtral-8x22b-instruct',       name: 'Mixtral 8x22B (NIM)',    contextLength: 64_000,  supportsTools: true,  supportsVision: false, tier: 'medium',  pricing: { input: 0.60, output: 0.60 } },

  // ── MiniMax (long context) ─────────────────────────────────────────────
  { provider: 'minimax',   id: 'MiniMax-Text-01', name: 'MiniMax Text-01', contextLength: 1_000_000, supportsTools: true,  supportsVision: false, tier: 'medium',  pricing: { input: 0.20, output: 1.10 } },
  { provider: 'minimax',   id: 'MiniMax-M1',      name: 'MiniMax M1',      contextLength: 1_000_000, supportsTools: true,  supportsVision: false, tier: 'complex', pricing: { input: 0.30, output: 1.60 } },

  // ── Ollama (local — zero cost) ─────────────────────────────────────────
  { provider: 'ollama',    id: 'llama3.2:3b',                name: 'Llama 3.2 3B (local)',       contextLength: 128_000, supportsTools: false, supportsVision: false, tier: 'simple', pricing: { input: 0, output: 0 } },
  { provider: 'ollama',    id: 'llama3.2:latest',            name: 'Llama 3.2 (local)',          contextLength: 128_000, supportsTools: false, supportsVision: false, tier: 'medium', pricing: { input: 0, output: 0 } },
  { provider: 'ollama',    id: 'qwen2.5-coder:7b',           name: 'Qwen 2.5 Coder 7B (local)', contextLength: 128_000, supportsTools: false, supportsVision: false, tier: 'medium', pricing: { input: 0, output: 0 } },
  { provider: 'ollama',    id: 'qwen2.5-coder:32b',          name: 'Qwen 2.5 Coder 32B (local)',contextLength: 128_000, supportsTools: false, supportsVision: false, tier: 'complex', pricing: { input: 0, output: 0 } },
  { provider: 'ollama',    id: 'mistral:latest',             name: 'Mistral (local)',            contextLength: 32_000,  supportsTools: false, supportsVision: false, tier: 'medium', pricing: { input: 0, output: 0 } },
  { provider: 'ollama',    id: 'phi4:latest',                name: 'Phi-4 (local)',              contextLength: 16_000,  supportsTools: false, supportsVision: false, tier: 'simple', pricing: { input: 0, output: 0 } },
]

// ── Types ──────────────────────────────────────────────────────────────────

export type TaskTier = 'simple' | 'medium' | 'complex'

export interface RouteOptions {
  /** Task complexity — drives model tier selection */
  tier?: TaskTier
  /** Prefer models below this cost (USD per 1M input tokens) */
  maxInputCostPerMillion?: number
  /** Provider must be in this list */
  providers?: string[]
  /** Model must support tool/function calling */
  requireTools?: boolean
  /** Model must support vision / image input */
  requireVision?: boolean
  /** Minimum context length required (tokens) */
  minContext?: number
}

export interface CatalogueEntry extends ModelInfo {
  provider: string
  tier: TaskTier
}

// ── ModelRegistry ──────────────────────────────────────────────────────────

export class ModelCatalogue {
  private static readonly catalogue: CatalogueEntry[] = CATALOGUE

  /** All models for a given provider (from catalogue). */
  static forProvider(provider: string): CatalogueEntry[] {
    return ModelCatalogue.catalogue.filter((m) => m.provider === provider)
  }

  /** All models across all providers. */
  static all(): CatalogueEntry[] {
    return [...this.catalogue]
  }

  /** Look up a specific model by provider + id. */
  static get(provider: string, modelId: string): CatalogueEntry | undefined {
    return ModelCatalogue.catalogue.find((m) => m.provider === provider && m.id === modelId)
  }

  /** All known providers. */
  static providers(): string[] {
    return [...new Set(this.catalogue.map((m) => m.provider))]
  }

  /**
   * Returns the best default model ID for a given provider.
   * Uses 'medium' tier, tools required. Falls back to first model for that provider,
   * or 'claude-sonnet-4-6' only when Anthropic is selected and nothing else matches.
   */
  static defaultModel(provider: string): string {
    const best = this.recommend({ providers: [provider], tier: 'medium', requireTools: true })
    if (best) return best.id
    // Fallback: first model for this provider (any tier)
    const any = this.forProvider(provider)[0]
    if (any) return any.id
    // Last resort: Anthropic default (should never reach here)
    return 'claude-sonnet-4-6'
  }

  /**
   * Recommend the best model for a task given constraints.
   * Strategy: among eligible models, pick the cheapest that meets requirements.
   * Tier ordering: simple ⊂ medium ⊂ complex (a complex model can do simple tasks).
   */
  static recommend(opts: RouteOptions = {}): CatalogueEntry | undefined {
    const TIER_RANK: Record<TaskTier, number> = { simple: 0, medium: 1, complex: 2 }
    const requiredRank = TIER_RANK[opts.tier ?? 'medium']

    const eligible = this.catalogue.filter((m) => {
      if (TIER_RANK[m.tier] < requiredRank) return false
      if (opts.providers && !opts.providers.includes(m.provider)) return false
      if (opts.requireTools && !m.supportsTools) return false
      if (opts.requireVision && !m.supportsVision) return false
      if (opts.minContext && m.contextLength < opts.minContext) return false
      if (opts.maxInputCostPerMillion !== undefined) {
        const cost = m.pricing?.input ?? Infinity
        if (cost > opts.maxInputCostPerMillion) return false
      }
      return true
    })

    if (eligible.length === 0) return undefined

    // Sort by input cost ascending (cheapest first), break ties by context length
    return eligible.sort((a, b) => {
      const ca = a.pricing?.input ?? Infinity
      const cb = b.pricing?.input ?? Infinity
      return ca !== cb ? ca - cb : b.contextLength - a.contextLength
    })[0]
  }

  /**
   * Estimate USD cost for a given token count.
   * Returns null if model has no pricing data.
   */
  static estimateCost(
    provider: string,
    modelId: string,
    inputTokens: number,
    outputTokens: number,
  ): number | null {
    const entry = this.get(provider, modelId)
    if (!entry?.pricing) return null
    return (entry.pricing.input * inputTokens + entry.pricing.output * outputTokens) / 1_000_000
  }

  /** Human-readable price string, e.g. "$3.00 / $15.00 per 1M tokens" */
  static formatPrice(pricing: ModelPricing): string {
    const fmt = (n: number) => n < 1 ? `$${n.toFixed(3)}` : `$${n.toFixed(2)}`
    return `${fmt(pricing.input)} in / ${fmt(pricing.output)} out per 1M tokens`
  }
}
