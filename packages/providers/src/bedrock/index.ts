/**
 * AWS Bedrock Provider
 * Uses native fetch against the Bedrock runtime REST API (no AWS SDK dependency).
 * Required env vars:
 *   AWS_ACCESS_KEY_ID
 *   AWS_SECRET_ACCESS_KEY
 *   AWS_REGION (default: us-east-1)
 *
 * Supports Claude models via Bedrock's converse-stream API.
 */
import { createHmac, createHash } from 'node:crypto'
import { BaseProvider, ArixError } from '@arix/core'
import type { ModelInfo, ChatRequest, StreamChunk, Message, ContentBlock } from '@arix/core'

const BEDROCK_MODELS: ModelInfo[] = [
  { id: 'anthropic.claude-3-5-sonnet-20241022-v2:0', name: 'Claude Sonnet 3.5 (Bedrock)', contextLength: 200_000, supportsTools: true, supportsVision: true },
  { id: 'anthropic.claude-3-haiku-20240307-v1:0', name: 'Claude Haiku 3 (Bedrock)', contextLength: 200_000, supportsTools: true, supportsVision: true },
  { id: 'meta.llama3-70b-instruct-v1:0', name: 'Llama 3 70B (Bedrock)', contextLength: 128_000, supportsTools: false, supportsVision: false },
]

export class BedrockProvider extends BaseProvider {
  readonly id = 'bedrock'
  readonly name = 'AWS Bedrock'
  private readonly accessKeyId: string
  private readonly secretAccessKey: string
  private readonly region: string

  constructor(options: {
    accessKeyId?: string
    secretAccessKey?: string
    region?: string
  } = {}) {
    super()
    const keyId = options.accessKeyId ?? process.env['AWS_ACCESS_KEY_ID']
    const secretKey = options.secretAccessKey ?? process.env['AWS_SECRET_ACCESS_KEY']
    if (!keyId) throw new ArixError('AUTH_ERROR', 'AWS_ACCESS_KEY_ID not set')
    if (!secretKey) throw new ArixError('AUTH_ERROR', 'AWS_SECRET_ACCESS_KEY not set')
    this.accessKeyId = keyId
    this.secretAccessKey = secretKey
    this.region = options.region ?? process.env['AWS_REGION'] ?? 'us-east-1'
  }

  supportsTools() { return true }
  supportsVision() { return true }

  async listModels(): Promise<ModelInfo[]> {
    return BEDROCK_MODELS
  }

  async chat(req: ChatRequest): Promise<AsyncIterable<StreamChunk>> {
    const modelId = req.model
    const endpoint = `https://bedrock-runtime.${this.region}.amazonaws.com/model/${encodeURIComponent(modelId)}/converse-stream`

    const body = JSON.stringify({
      messages: flattenToBedrock(req.messages),
      ...(req.systemPrompt ? { system: [{ text: req.systemPrompt }] } : {}),
      inferenceConfig: { maxTokens: req.maxTokens ?? 8192 },
    })

    const response = await this.retry(() =>
      this.signedFetch(endpoint, body),
    )

    if (!response.ok) {
      throw new ArixError('PROVIDER_ERROR', `Bedrock error: ${response.status}`)
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

      // Bedrock event-stream parsing: lines starting with ":event-type"
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.startsWith('{')) continue
        try {
          const event = JSON.parse(line) as {
            contentBlockDelta?: { delta?: { text?: string } }
            stopReason?: string
          }
          if (event.contentBlockDelta?.delta?.text) {
            yield { text: event.contentBlockDelta.delta.text, done: false }
          }
          if (event.stopReason) {
            yield { done: true }
            return
          }
        } catch { /* skip malformed events */ }
      }
    }
    yield { done: true }
  }

  /** AWS SigV4 signing for Bedrock requests */
  private async signedFetch(url: string, body: string): Promise<Response> {
    const now = new Date()
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z'
    const dateStamp = amzDate.slice(0, 8)

    const service = 'bedrock'
    const parsed = new URL(url)
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'host': parsed.hostname,
      'x-amz-date': amzDate,
    }

    const signedHeaders = Object.keys(headers).sort().join(';')
    const canonicalHeaders = Object.entries(headers).sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}\n`).join('')

    const bodyHash = createHash('sha256').update(body).digest('hex')
    const canonicalRequest = [
      'POST', parsed.pathname, '',
      canonicalHeaders, signedHeaders, bodyHash,
    ].join('\n')

    const credentialScope = `${dateStamp}/${this.region}/${service}/aws4_request`
    const stringToSign = [
      'AWS4-HMAC-SHA256', amzDate, credentialScope,
      createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n')

    const getKey = (key: string | Buffer, data: string) =>
      createHmac('sha256', typeof key === 'string' ? Buffer.from(key, 'utf-8') : key).update(data).digest()

    const signingKey = getKey(
      getKey(
        getKey(
          getKey(`AWS4${this.secretAccessKey}`, dateStamp),
          this.region
        ).toString('hex'),
        service
      ).toString('hex'),
      'aws4_request'
    )

    const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex')
    const authHeader = `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

    return fetch(url, {
      method: 'POST',
      headers: { ...headers, 'Authorization': authHeader },
      body,
      signal: AbortSignal.timeout(30_000),
    })
  }
}

function flattenToBedrock(messages: Message[]): Array<{ role: string; content: Array<{ text: string }> }> {
  return messages
    .filter((m) => m.role !== 'system')
    .map((m) => {
      const text = typeof m.content === 'string'
        ? m.content
        : (m.content as ContentBlock[]).filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('\n')
      return { role: m.role === 'assistant' ? 'assistant' : 'user', content: [{ text }] }
    })
    .filter((m) => m.content[0]?.text)
}
