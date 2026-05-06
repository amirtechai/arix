import {
  GoogleGenerativeAI,
  type GenerateContentStreamResult,
  type Content,
  type Part,
  type FunctionDeclaration,
} from '@google/generative-ai'
import { BaseProvider, ArixError } from '@arix/core'
import type { ContentBlock, ModelInfo, ChatRequest, StreamChunk, Message, TextBlock, ToolUseBlock, ToolResultBlock } from '@arix/core'

const MODELS: ModelInfo[] = [
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', contextLength: 1_000_000, supportsTools: true, supportsVision: true },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', contextLength: 1_000_000, supportsTools: true, supportsVision: true },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', contextLength: 2_000_000, supportsTools: true, supportsVision: true },
  { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', contextLength: 1_000_000, supportsTools: true, supportsVision: true },
]

export class GeminiProvider extends BaseProvider {
  readonly id = 'gemini'
  readonly name = 'Google Gemini'
  private readonly client: GoogleGenerativeAI

  constructor(options: { apiKey?: string } = {}) {
    super()
    const key = options.apiKey ?? process.env['GEMINI_API_KEY']
    if (!key) throw new ArixError('AUTH_ERROR', 'GEMINI_API_KEY not set')
    this.client = new GoogleGenerativeAI(key)
  }

  supportsTools() { return true }
  supportsVision() { return true }

  async listModels(): Promise<ModelInfo[]> {
    return MODELS
  }

  async chat(req: ChatRequest): Promise<AsyncIterable<StreamChunk>> {
    const systemInstruction = req.systemPrompt
      ?? req.messages.find((m) => m.role === 'system')?.content
    const systemText = typeof systemInstruction === 'string' ? systemInstruction : undefined

    const userMessages = req.messages.filter((m) => m.role !== 'system')

    const model = this.client.getGenerativeModel({
      model: req.model,
      ...(systemText ? { systemInstruction: systemText } : {}),
      ...(req.tools ? {
        tools: [{
          functionDeclarations: req.tools.map((t) => ({
            name: t.name,
            description: t.description ?? '',
            parameters: t.inputSchema as FunctionDeclaration['parameters'],
          })) as FunctionDeclaration[],
        }],
      } : {}),
    })

    const contents = flattenToGemini(userMessages)

    const streamResult = await this.retry(() =>
      model.generateContentStream({ contents }),
    )

    return this.toStreamChunks(streamResult)
  }

  private async *toStreamChunks(
    result: GenerateContentStreamResult,
  ): AsyncIterable<StreamChunk> {
    try {
      for await (const chunk of result.stream) {
        const candidate = chunk.candidates?.[0]
        if (!candidate) continue
        const parts = candidate.content?.parts ?? []
        for (const part of parts) {
          if (part.text) {
            yield { text: part.text, done: false }
          } else if (part.functionCall) {
            yield {
              toolCall: {
                id: `gemini-${Date.now()}`,
                name: part.functionCall.name,
                input: (part.functionCall.args ?? {}) as Record<string, unknown>,
              },
              done: false,
            }
          }
        }
        if (candidate.finishReason && candidate.finishReason !== 'STOP') {
          // Non-standard finish — surface as error
          yield { error: `Gemini finish reason: ${candidate.finishReason}`, done: false }
        }
      }
      yield { done: true }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      // thought_signature edge case: filter Gemini internal tokens
      if (msg.includes('thought_signature')) {
        yield { done: true }
        return
      }
      yield { error: msg, done: false }
      yield { done: true }
    }
  }
}

// ── Message mapping ───────────────────────────────────────────────────────────

function flattenToGemini(messages: Message[]): Content[] {
  const result: Content[] = []
  for (const m of messages) {
    if (typeof m.content === 'string') {
      result.push({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })
      continue
    }
    const blocks = m.content as ContentBlock[]
    const toolResultBlocks = blocks.filter((b): b is ToolResultBlock => b.type === 'tool_result')
    const toolUseBlocks = blocks.filter((b): b is ToolUseBlock => b.type === 'tool_use')
    const textBlocks = blocks.filter((b): b is TextBlock => b.type === 'text')

    if (toolResultBlocks.length > 0) {
      // Function response goes in 'user' role
      result.push({
        role: 'user',
        parts: toolResultBlocks.map((b) => ({
          functionResponse: {
            name: b.toolCallId, // best-effort: use call id as name
            response: { output: b.output },
          },
        })),
      })
    } else if (toolUseBlocks.length > 0) {
      const parts: Part[] = []
      if (textBlocks.length > 0) parts.push({ text: textBlocks[0]!.text })
      for (const b of toolUseBlocks) {
        parts.push({ functionCall: { name: b.name, args: b.input as Record<string, unknown> } })
      }
      result.push({ role: 'model', parts })
    } else if (textBlocks.length > 0) {
      result.push({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: textBlocks[0]!.text }],
      })
    }
  }
  return result
}
