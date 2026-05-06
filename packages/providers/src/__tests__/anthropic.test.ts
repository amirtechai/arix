import { describe, it, expect } from 'vitest'
import { AnthropicStreamMapper } from '../anthropic/mapper.js'
import type { StreamChunk } from '@arix/core'

describe('AnthropicStreamMapper', () => {
  it('maps text_delta to StreamChunk with text', () => {
    const mapper = new AnthropicStreamMapper()
    const chunk = mapper.map({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: 'hello' },
    })
    expect(chunk).toEqual<StreamChunk>({ text: 'hello', done: false })
  })

  it('returns null for non-delta events', () => {
    const mapper = new AnthropicStreamMapper()
    const chunk = mapper.map({ type: 'message_start', message: {} })
    expect(chunk).toBeNull()
  })

  it('maps message_stop to done chunk', () => {
    const mapper = new AnthropicStreamMapper()
    const chunk = mapper.map({ type: 'message_stop' })
    expect(chunk).toEqual<StreamChunk>({ done: true })
  })

  it('accumulates input_json_delta and flushes as tool call', () => {
    const mapper = new AnthropicStreamMapper()
    // Start a tool use block
    mapper.map({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_01', name: 'read_file' } })
    // Accumulate JSON
    const r1 = mapper.map({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"path"' } })
    const r2 = mapper.map({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: ':"/foo"}' } })
    expect(r1).toBeNull()
    expect(r2).toBeNull()
    // Flush
    const flushed = mapper.flush()
    expect(flushed).toHaveLength(1)
    expect(flushed[0]?.toolCall?.id).toBe('toolu_01')
    expect(flushed[0]?.toolCall?.name).toBe('read_file')
    expect(flushed[0]?.toolCall?.input).toEqual({ path: '/foo' })
  })

  it('is stateless across instances (no global leakage)', () => {
    const m1 = new AnthropicStreamMapper()
    const m2 = new AnthropicStreamMapper()
    m1.map({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_m1', name: 'tool_a' } })
    // m2 flush should be empty — no leakage from m1
    expect(m2.flush()).toHaveLength(0)
    expect(m1.flush()).toHaveLength(1)
  })
})
