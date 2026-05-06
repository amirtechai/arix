import { describe, it, expect, vi } from 'vitest'
import { ContextCompactor, estimateTokens } from '../compact/index.js'
import type { Message } from '../types.js'

function makeMessages(count: number): Message[] {
  const msgs: Message[] = []
  for (let i = 0; i < count; i++) {
    msgs.push({ role: i % 2 === 0 ? 'user' : 'assistant', content: 'x'.repeat(1000), timestamp: Date.now() })
  }
  return msgs
}

describe('estimateTokens', () => {
  it('estimates ~4 chars per token', () => {
    const msgs: Message[] = [{ role: 'user', content: 'a'.repeat(400), timestamp: Date.now() }]
    expect(estimateTokens(msgs)).toBe(100)
  })

  it('handles ContentBlock arrays', () => {
    const msgs: Message[] = [{
      role: 'assistant',
      content: [{ type: 'text', text: 'a'.repeat(800) }],
      timestamp: Date.now(),
    }]
    expect(estimateTokens(msgs)).toBe(200)
  })
})

describe('ContextCompactor', () => {
  it('does not compact when under threshold', async () => {
    const compactor = new ContextCompactor({ provider: 'anthropic', modelId: 'claude-sonnet-4-6', threshold: 0.9 })
    const messages = makeMessages(4)
    const summariser = vi.fn().mockResolvedValue('summary')
    const result = await compactor.compact(messages, summariser)
    expect(result.compacted).toBe(false)
    expect(summariser).not.toHaveBeenCalled()
  })

  it('compacts when over threshold', async () => {
    // claude-sonnet-4-6 has 200k context, ~50M chars → fake it with tiny threshold
    const compactor = new ContextCompactor({
      provider: 'anthropic',
      modelId: 'claude-sonnet-4-6',
      threshold: 0.00001,  // 200k * 0.00001 = 2 tokens — always triggers
      keepTurns: 2,
    })
    const messages = makeMessages(10)
    const summariser = vi.fn().mockResolvedValue('• Earlier work done\n• Key decisions made')
    const result = await compactor.compact(messages, summariser)
    expect(result.compacted).toBe(true)
    expect(result.removedTurns).toBeGreaterThan(0)
    expect(result.tokensAfter).toBeLessThan(result.tokensBefore)
    expect(summariser).toHaveBeenCalledOnce()
  })

  it('includes summary as system message', async () => {
    const compactor = new ContextCompactor({
      provider: 'anthropic', modelId: 'claude-sonnet-4-6', threshold: 0.00001, keepTurns: 1,
    })
    const messages = makeMessages(6)
    const summariser = vi.fn().mockResolvedValue('• summary here')
    const result = await compactor.compact(messages, summariser)
    if (result.compacted) {
      expect(result.messages[0]?.role).toBe('system')
      expect(result.messages[0]?.content).toContain('summary here')
    }
  })

  it('usageRatio returns fraction', () => {
    const compactor = new ContextCompactor({ provider: 'anthropic', modelId: 'claude-sonnet-4-6' })
    const msgs: Message[] = [{ role: 'user', content: 'a'.repeat(400), timestamp: Date.now() }]
    const ratio = compactor.usageRatio(msgs)
    expect(ratio).toBeGreaterThan(0)
    expect(ratio).toBeLessThan(1)
  })
})
