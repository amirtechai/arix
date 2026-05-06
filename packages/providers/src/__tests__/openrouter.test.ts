import { describe, it, expect } from 'vitest'
import { parseSSEStream } from '../openrouter/stream.js'

describe('parseSSEStream', () => {
  it('parses a text chunk', async () => {
    const raw = 'data: {"choices":[{"delta":{"content":"hello"},"finish_reason":null}]}\n\n'
    const stream = makeStream(raw)
    const chunks = await collect(parseSSEStream(stream))
    expect(chunks).toEqual([{ text: 'hello', done: false }])
  })

  it('handles [DONE] terminator', async () => {
    const raw = 'data: [DONE]\n\n'
    const stream = makeStream(raw)
    const chunks = await collect(parseSSEStream(stream))
    expect(chunks).toEqual([{ done: true }])
  })

  it('parses tool_calls chunk', async () => {
    const raw = `data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"tc_1","function":{"name":"read_file","arguments":"{\\"path\\":\\"/foo\\"}"}}]},"finish_reason":null}]}\n\n`
    const stream = makeStream(raw)
    const chunks = await collect(parseSSEStream(stream))
    expect(chunks[0]).toMatchObject({
      toolCall: { id: 'tc_1', name: 'read_file', input: { path: '/foo' } },
      done: false,
    })
  })

  it('skips empty lines and comment lines', async () => {
    const raw = ': comment\n\ndata: {"choices":[{"delta":{"content":"x"},"finish_reason":null}]}\n\n'
    const stream = makeStream(raw)
    const chunks = await collect(parseSSEStream(stream))
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toMatchObject({ text: 'x' })
  })
})

// Helpers
function makeStream(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text))
      controller.close()
    },
  })
}

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const results: T[] = []
  for await (const item of iter) results.push(item)
  return results
}
