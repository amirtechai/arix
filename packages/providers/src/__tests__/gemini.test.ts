import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GeminiProvider } from '../gemini/index.js'
import type { ChatRequest } from '@arix/core'

function makeStreamResult(parts: Array<{ text?: string; functionCall?: { name: string; args: Record<string, unknown> } }>) {
  const chunks = parts.map((p) => ({
    candidates: [{
      content: { parts: [p] },
      finishReason: undefined,
    }],
  }))
  return {
    stream: (async function* () { for (const c of chunks) yield c })(),
  }
}

describe('GeminiProvider', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('throws when API key is missing', () => {
    delete process.env['GEMINI_API_KEY']
    expect(() => new GeminiProvider()).toThrow('GEMINI_API_KEY')
  })

  it('streams text chunks', async () => {
    const provider = new GeminiProvider({ apiKey: 'test-key' })
    const mockModel = {
      generateContentStream: vi.fn().mockResolvedValue(
        makeStreamResult([{ text: 'Hello' }, { text: ' world' }]),
      ),
    }
    vi.spyOn(provider['client'], 'getGenerativeModel').mockReturnValue(mockModel as never)

    const req: ChatRequest = { model: 'gemini-1.5-flash', messages: [{ role: 'user', content: 'Hi' }] }
    const chunks = []
    for await (const chunk of await provider.chat(req)) {
      chunks.push(chunk)
    }

    const texts = chunks.filter((c) => 'text' in c).map((c) => (c as { text: string }).text)
    expect(texts.join('')).toBe('Hello world')
    expect(chunks[chunks.length - 1]).toEqual({ done: true })
  })

  it('yields tool call chunk', async () => {
    const provider = new GeminiProvider({ apiKey: 'test-key' })
    const mockModel = {
      generateContentStream: vi.fn().mockResolvedValue(
        makeStreamResult([
          { functionCall: { name: 'read_file', args: { path: '/tmp/x' } } },
        ]),
      ),
    }
    vi.spyOn(provider['client'], 'getGenerativeModel').mockReturnValue(mockModel as never)

    const req: ChatRequest = { model: 'gemini-1.5-flash', messages: [{ role: 'user', content: 'read file' }] }
    const chunks = []
    for await (const chunk of await provider.chat(req)) chunks.push(chunk)

    const toolChunk = chunks.find((c) => 'toolCall' in c) as { toolCall: { name: string } } | undefined
    expect(toolChunk?.toolCall.name).toBe('read_file')
  })

  it('listModels returns Gemini models', async () => {
    const provider = new GeminiProvider({ apiKey: 'test-key' })
    const models = await provider.listModels()
    expect(models.length).toBeGreaterThan(0)
    expect(models.every((m) => m.id.startsWith('gemini'))).toBe(true)
  })
})
