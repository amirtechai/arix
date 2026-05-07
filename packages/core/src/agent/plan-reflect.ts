import type { ChatRequest, Message, StreamChunk } from '../types.js'

export interface PlanReflectProvider {
  chat(req: ChatRequest): Promise<AsyncIterable<StreamChunk>>
}

export interface PlanReflectOptions {
  provider: PlanReflectProvider
  /** Cheap planning model — defaults to the agent's main model */
  model: string
  maxTokens?: number
}

async function collect(stream: AsyncIterable<StreamChunk>): Promise<string> {
  let text = ''
  for await (const chunk of stream) {
    if (chunk.error) throw new Error(chunk.error)
    if (chunk.text) text += chunk.text
  }
  return text
}

const PLAN_PROMPT = `You are a planning subroutine. Given the user's latest request and the conversation so far, produce a SHORT plan (3–6 bullets) describing the steps you intend to take and which tools you will call. Do NOT execute anything. Be specific about file paths and tool names. If the request is trivial (single tool call or pure conversation), output: \`(no plan needed)\`.`

const REFLECT_PROMPT = `You are a self-critic subroutine. Given the assistant's most recent turn (text + tool results), identify in 1–4 bullets:
1. Any obvious mistakes, broken outputs, or hallucinated tool calls.
2. Whether the user's request is satisfied yet.
3. The single most important next action, if any.
Be terse. If the turn looks correct and complete, output: \`(ok)\`.`

/**
 * Generates a one-shot plan before a turn.
 * Returns the plan text (may be `(no plan needed)`).
 */
export async function planTurn(
  opts: PlanReflectOptions,
  history: Message[],
  userMessage: string,
): Promise<string> {
  const messages: Message[] = [
    ...history,
    { role: 'user', content: userMessage, timestamp: Date.now() },
  ]
  const stream = await opts.provider.chat({
    model: opts.model,
    messages,
    systemPrompt: PLAN_PROMPT,
    maxTokens: opts.maxTokens ?? 400,
    temperature: 0,
  })
  return (await collect(stream)).trim()
}

/**
 * One-shot self-critique after a turn. Returns the critique text. The agent
 * may decide to feed this back as a synthetic user message to retry.
 */
export async function reflectTurn(
  opts: PlanReflectOptions,
  history: Message[],
): Promise<string> {
  const stream = await opts.provider.chat({
    model: opts.model,
    messages: history,
    systemPrompt: REFLECT_PROMPT,
    maxTokens: opts.maxTokens ?? 300,
    temperature: 0,
  })
  return (await collect(stream)).trim()
}
