/**
 * Google Vertex AI Provider
 * Uses the Vertex AI REST API — same models as Gemini but via GCP.
 * Required env vars:
 *   VERTEX_PROJECT_ID
 *   VERTEX_LOCATION    (default: us-central1)
 *   GOOGLE_ACCESS_TOKEN (short-lived OAuth2 token — use `gcloud auth print-access-token`)
 *
 * For production use, integrate with @google-cloud/vertexai SDK for ADC support.
 */
import { BaseProvider, ArixError } from '@arix-code/core'
import type { ModelInfo, ChatRequest, StreamChunk, Message, ContentBlock } from '@arix-code/core'

const VERTEX_MODELS: ModelInfo[] = [
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro (Vertex)', contextLength: 1_000_000, supportsTools: true, supportsVision: true },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (Vertex)', contextLength: 1_000_000, supportsTools: true, supportsVision: true },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro (Vertex)', contextLength: 2_000_000, supportsTools: true, supportsVision: true },
]

interface VertexPart { text?: string; functionCall?: { name: string; args: Record<string, unknown> } }
interface VertexContent { role: 'user' | 'model'; parts: VertexPart[] }

export class VertexAIProvider extends BaseProvider {
  readonly id = 'vertex'
  readonly name = 'Google Vertex AI'
  private readonly projectId: string
  private readonly location: string

  constructor(options: { projectId?: string; location?: string } = {}) {
    super()
    const projectId = options.projectId ?? process.env['VERTEX_PROJECT_ID']
    if (!projectId) throw new ArixError('AUTH_ERROR', 'VERTEX_PROJECT_ID not set')
    this.projectId = projectId
    this.location = options.location ?? process.env['VERTEX_LOCATION'] ?? 'us-central1'
  }

  supportsTools() { return true }
  supportsVision() { return true }

  async listModels(): Promise<ModelInfo[]> { return VERTEX_MODELS }

  async chat(req: ChatRequest): Promise<AsyncIterable<StreamChunk>> {
    const token = process.env['GOOGLE_ACCESS_TOKEN']
    if (!token) throw new ArixError('AUTH_ERROR', 'GOOGLE_ACCESS_TOKEN not set (run: gcloud auth print-access-token)')

    const modelId = req.model
    const url = `https://${this.location}-aiplatform.googleapis.com/v1/projects/${this.projectId}/locations/${this.location}/publishers/google/models/${modelId}:streamGenerateContent`

    const body = JSON.stringify({
      contents: flattenToVertex(req.messages),
      ...(req.systemPrompt ? { systemInstruction: { parts: [{ text: req.systemPrompt }] } } : {}),
      generationConfig: { maxOutputTokens: req.maxTokens ?? 8192 },
    })

    const response = await this.retry(() =>
      fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(30_000),
      }),
    )

    if (!response.ok) {
      const err = await response.text()
      throw new ArixError('PROVIDER_ERROR', `Vertex AI error ${response.status}: ${err.slice(0, 200)}`)
    }

    return this.parseStream(response)
  }

  private async *parseStream(response: Response): AsyncIterable<StreamChunk> {
    const reader = response.body?.getReader()
    if (!reader) { yield { done: true }; return }

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // Vertex streams JSON array items separated by commas
      // Each item: { candidates: [{ content: { parts: [...] }, finishReason }] }
      const starts = [...buffer.matchAll(/\{/g)].map((m) => m.index!)
      for (const start of starts) {
        let depth = 0
        let end = -1
        for (let i = start; i < buffer.length; i++) {
          if (buffer[i] === '{') depth++
          else if (buffer[i] === '}') { depth--; if (depth === 0) { end = i; break } }
        }
        if (end < 0) continue
        try {
          const obj = JSON.parse(buffer.slice(start, end + 1)) as {
            candidates?: Array<{
              content?: { parts?: VertexPart[] }
              finishReason?: string
            }>
          }
          buffer = buffer.slice(end + 1)
          for (const part of obj.candidates?.[0]?.content?.parts ?? []) {
            if (part.text) yield { text: part.text, done: false }
            if (part.functionCall) {
              yield { toolCall: { id: `vertex-${Date.now()}`, name: part.functionCall.name, input: part.functionCall.args }, done: false }
            }
          }
          if (obj.candidates?.[0]?.finishReason === 'STOP') { yield { done: true }; return }
        } catch { /* incomplete JSON */ }
      }
    }
    yield { done: true }
  }
}

function flattenToVertex(messages: Message[]): VertexContent[] {
  return messages
    .filter((m) => m.role !== 'system')
    .map((m) => {
      const text = typeof m.content === 'string'
        ? m.content
        : (m.content as ContentBlock[]).filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('\n')
      return { role: (m.role === 'assistant' ? 'model' : 'user') as 'user' | 'model', parts: [{ text }] }
    })
}
