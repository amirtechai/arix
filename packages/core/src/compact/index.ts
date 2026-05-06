/**
 * ContextCompactor — transparent auto-compression of conversation history.
 *
 * When the estimated token count of current messages exceeds `threshold`
 * (default 80%) of the model's context limit, it:
 *   1. Keeps the last `keepTurns` complete user↔assistant exchanges intact
 *   2. Summarises everything older into a single "summary" system message
 *   3. Returns the new compacted message array
 *
 * The summarisation call is made to the same provider using a lightweight
 * prompt — no extra dependency needed.
 */

import type { Message, ContentBlock } from '../types.js'
import { ModelCatalogue as ModelRegistry } from '../registry/models.js'

// ── Types ──────────────────────────────────────────────────────────────────

export interface CompactOptions {
  provider: string
  modelId: string
  /** Fraction of context limit that triggers compaction. Default: 0.80 */
  threshold?: number
  /** Number of recent turns to preserve verbatim. Default: 6 */
  keepTurns?: number
}

export interface CompactResult {
  messages: Message[]
  compacted: boolean
  /** Estimated tokens before / after */
  tokensBefore: number
  tokensAfter: number
  removedTurns: number
}

// ── Helpers ───────────────────────────────────────────────────────────────

/** Rough token estimate: ~4 chars per token (good enough for headroom checks). */
export function estimateTokens(messages: Message[]): number {
  return Math.ceil(
    messages.reduce((acc, m) => {
      const text = typeof m.content === 'string'
        ? m.content
        : (m.content as ContentBlock[])
            .map((b) => ('text' in b ? (b as { text: string }).text : JSON.stringify(b)))
            .join('\n')
      return acc + text.length
    }, 0) / 4,
  )
}

/**
 * Format old messages as a transcript for summarisation.
 * Outputs a compact human-readable form the summariser can reason over.
 */
function renderTranscript(messages: Message[]): string {
  return messages
    .filter((m) => m.role !== 'system')
    .map((m) => {
      const roleLabel = m.role === 'user' ? 'User' : 'Assistant'
      const text = typeof m.content === 'string'
        ? m.content
        : (m.content as ContentBlock[])
            .filter((b) => b.type === 'text')
            .map((b) => (b as { text: string }).text)
            .join('\n')
      return `${roleLabel}: ${text.trim()}`
    })
    .filter(Boolean)
    .join('\n\n')
}

// ── ContextCompactor ───────────────────────────────────────────────────────

export class ContextCompactor {
  private readonly opts: Required<CompactOptions>

  constructor(opts: CompactOptions) {
    this.opts = {
      threshold: opts.threshold ?? 0.80,
      keepTurns: opts.keepTurns ?? 6,
      provider: opts.provider,
      modelId: opts.modelId,
    }
  }

  /**
   * Check if compaction is needed and, if so, run it.
   * `summariser` is an async fn that receives the summary prompt and returns the summary text.
   */
  async compact(
    messages: Message[],
    summariser: (prompt: string) => Promise<string>,
  ): Promise<CompactResult> {
    const entry = ModelRegistry.get(this.opts.provider, this.opts.modelId)
    const contextLimit = entry?.contextLength ?? 200_000
    const tokensBefore = estimateTokens(messages)

    const threshold = Math.floor(contextLimit * this.opts.threshold)
    if (tokensBefore < threshold) {
      return { messages, compacted: false, tokensBefore, tokensAfter: tokensBefore, removedTurns: 0 }
    }

    // Split into "old" (to summarise) and "recent" (to keep)
    // A "turn" = 1 user msg + 1 assistant msg = 2 messages
    const keepCount = this.opts.keepTurns * 2
    const oldMessages = messages.slice(0, -keepCount)
    const recentMessages = messages.slice(-keepCount)

    if (oldMessages.length === 0) {
      // Can't compact further — nothing old enough to summarise
      return { messages, compacted: false, tokensBefore, tokensAfter: tokensBefore, removedTurns: 0 }
    }

    const transcript = renderTranscript(oldMessages)
    const prompt = `Summarize the following conversation transcript concisely. Preserve:
- All decisions made and conclusions reached
- File paths, function names, and specific technical details
- Any errors encountered and how they were resolved
- The overall goal and current progress

Transcript:
${transcript}

Write a clear summary in 3-8 bullet points starting with "•".`

    const summaryText = await summariser(prompt)

    const summaryMessage: Message = {
      role: 'system',
      content: `[Conversation summary — earlier context compacted]\n${summaryText}`,
      timestamp: Date.now(),
    }

    const compacted = [summaryMessage, ...recentMessages]
    const tokensAfter = estimateTokens(compacted)

    return { messages: compacted, compacted: true, tokensBefore, tokensAfter, removedTurns: Math.floor(oldMessages.length / 2) }
  }

  /** Fraction of context window currently used. */
  usageRatio(messages: Message[]): number {
    const entry = ModelRegistry.get(this.opts.provider, this.opts.modelId)
    const contextLimit = entry?.contextLength ?? 200_000
    return estimateTokens(messages) / contextLimit
  }
}
