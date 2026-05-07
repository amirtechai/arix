/**
 * Adaptive prompt caching (P5) — annotates an Anthropic ChatRequest with
 * cache_control breakpoints on the system prompt and the largest static
 * context blocks. The provider adapter passes these through to the API.
 *
 * Anthropic charges 0.1× input cost on cache hits and 1.25× on cache writes;
 * net win when the same system prompt or large file context is reused for
 * 2+ turns.
 */

import type { ChatRequest } from '../types.js'

export interface PromptCacheOptions {
  /** Minimum size in characters worth caching (default 2048 ~= 512 tokens) */
  minChars?: number
  /** Cap on the number of cache breakpoints (Anthropic max = 4) */
  maxBreakpoints?: number
}

interface AnnotatedRequest extends ChatRequest {
  /** Provider-specific extension surfaced to AnthropicProvider */
  cacheControl?: {
    systemPrompt?: boolean
    /** Indices of message content blocks to mark cache-eligible */
    messageIndices?: number[]
  }
}

/**
 * Annotate a request with cache breakpoints. Returns a new request — does
 * not mutate the input. Provider adapters that don't understand cacheControl
 * can ignore it safely.
 */
export function annotateForCache(req: ChatRequest, opts: PromptCacheOptions = {}): AnnotatedRequest {
  const minChars = opts.minChars ?? 2048
  const maxBP = opts.maxBreakpoints ?? 4

  const annotated: AnnotatedRequest = { ...req }
  let used = 0

  if (req.systemPrompt && req.systemPrompt.length >= minChars && used < maxBP) {
    annotated.cacheControl = { systemPrompt: true }
    used++
  }

  // Mark the N largest user/assistant text blocks from the start of history
  const sizes: Array<{ index: number; chars: number }> = []
  req.messages.forEach((msg, i) => {
    if (typeof msg.content === 'string') {
      sizes.push({ index: i, chars: msg.content.length })
    } else {
      const total = msg.content.reduce((s, b) => s + (b.type === 'text' ? b.text.length : 0), 0)
      sizes.push({ index: i, chars: total })
    }
  })
  sizes.sort((a, b) => b.chars - a.chars)
  const indices: number[] = []
  for (const s of sizes) {
    if (used >= maxBP) break
    if (s.chars < minChars) break
    indices.push(s.index)
    used++
  }
  if (indices.length > 0) {
    indices.sort((a, b) => a - b)
    annotated.cacheControl = {
      ...(annotated.cacheControl ?? {}),
      messageIndices: indices,
    }
  }
  return annotated
}
