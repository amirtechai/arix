import { describe, it, expect } from 'vitest'
import { ContextManager } from '../context/index.js'

describe('ContextManager', () => {
  it('adds messages and exports them', () => {
    const ctx = new ContextManager()
    ctx.addMessage({ role: 'user', content: 'hello' })
    ctx.addMessage({ role: 'assistant', content: 'hi' })
    expect(ctx.export()).toHaveLength(2)
  })

  it('injects system prompt in getMessages', () => {
    const ctx = new ContextManager({ systemPrompt: 'You are helpful' })
    ctx.addMessage({ role: 'user', content: 'hello' })
    const msgs = ctx.getMessages(10_000)
    expect(msgs[0]).toMatchObject({ role: 'system', content: 'You are helpful' })
  })

  it('counts tokens roughly', () => {
    const ctx = new ContextManager()
    ctx.addMessage({ role: 'user', content: 'a'.repeat(400) }) // ~100 tokens
    expect(ctx.getTokenCount()).toBeGreaterThan(50)
    expect(ctx.getTokenCount()).toBeLessThan(200)
  })

  it('windows messages when approaching context limit', () => {
    const ctx = new ContextManager({ systemPrompt: 'sys' })
    // Add 100 short messages
    for (let i = 0; i < 100; i++) {
      ctx.addMessage({ role: 'user', content: `msg${i}` })
    }
    // With very small context (100 tokens) and MIN_KEEP=20, should truncate
    const msgs = ctx.getMessages(100)
    // Should have system msg + summary marker + kept messages
    const summaryIdx = msgs.findIndex((m) => typeof m.content === 'string' && m.content.includes('summarized'))
    expect(summaryIdx).toBeGreaterThan(-1)
    // Last message should be the last added
    expect(msgs[msgs.length - 1]?.content).toBe('msg99')
  })

  it('clears messages', () => {
    const ctx = new ContextManager()
    ctx.addMessage({ role: 'user', content: 'hello' })
    ctx.clear()
    expect(ctx.export()).toHaveLength(0)
  })

  it('adds tool result as user message', () => {
    const ctx = new ContextManager()
    ctx.addToolResult({ toolCallId: 'x', success: true, output: 'file content' })
    const msgs = ctx.export()
    expect(msgs[0]?.role).toBe('user')
    expect(msgs[0]?.content).toContain('file content')
  })
})
