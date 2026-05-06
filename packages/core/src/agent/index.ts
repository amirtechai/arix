import type { AgentEvent, ChatRequest, ContentBlock, Message, StreamChunk, TokenUsage, Tool, ToolCall, ToolConfirmationRequest, ToolDefinition, ToolResult } from '../types.js'
export type { AgentEvent }
import type { CostTracker } from '../cost/index.js'
import type { ContextCompactor } from '../compact/index.js'
import { estimateTokens } from '../compact/index.js'

export interface AgentLoopOptions {
  provider: {
    chat(req: ChatRequest): Promise<AsyncIterable<StreamChunk>>
  }
  model: string
  tools?: Tool[]
  systemPrompt?: string
  maxTokens?: number
  temperature?: number
  maxTurns?: number
  initialMessages?: Message[]
  onConfirm?: (req: ToolConfirmationRequest) => Promise<boolean>
  costTracker?: CostTracker
  compactor?: ContextCompactor
  summariser?: (transcript: string) => Promise<string>
}

export class AgentLoop {
  private readonly provider: AgentLoopOptions['provider']
  private readonly model: string
  private readonly tools: Tool[]
  private readonly systemPrompt: string | undefined
  private readonly maxTokens: number | undefined
  private readonly temperature: number | undefined
  private readonly maxTurns: number
  private readonly onConfirm: ((req: ToolConfirmationRequest) => Promise<boolean>) | undefined
  private readonly costTracker: CostTracker | undefined
  private readonly compactor: ContextCompactor | undefined
  private readonly summariser: ((transcript: string) => Promise<string>) | undefined
  private history: Message[]

  constructor(opts: AgentLoopOptions) {
    this.provider = opts.provider
    this.model = opts.model
    this.tools = opts.tools ?? []
    this.systemPrompt = opts.systemPrompt
    this.maxTokens = opts.maxTokens
    this.temperature = opts.temperature
    this.maxTurns = opts.maxTurns ?? 20
    this.onConfirm = opts.onConfirm
    this.costTracker = opts.costTracker
    this.compactor = opts.compactor
    this.summariser = opts.summariser
    this.history = opts.initialMessages ? [...opts.initialMessages] : []
  }

  getHistory(): readonly Message[] {
    return this.history
  }

  async *run(userMessage: string): AsyncGenerator<AgentEvent> {
    const messages: Message[] = [
      ...this.history,
      { role: 'user', content: userMessage, timestamp: Date.now() },
    ]

    try {
      for (let turn = 0; turn < this.maxTurns; turn++) {
        // Auto-compact if context is getting full
        if (this.compactor && this.summariser) {
          const result = await this.compactor.compact(messages, this.summariser)
          if (result.compacted) {
            messages.length = 0
            messages.push(...result.messages)
            yield { type: 'text', chunk: `\n[Context compacted: ${result.removedTurns} turns summarised]\n` }
          }
        }

        const req: ChatRequest = {
          model: this.model,
          messages: [...messages],  // snapshot — provider must not mutate
          ...(this.tools.length > 0 ? { tools: this.tools.map(this.toDefinition) } : {}),
          ...(this.systemPrompt !== undefined ? { systemPrompt: this.systemPrompt } : {}),
          ...(this.maxTokens !== undefined ? { maxTokens: this.maxTokens } : {}),
          ...(this.temperature !== undefined ? { temperature: this.temperature } : {}),
        }

        const stream = await this.provider.chat(req)
        const { text, toolCalls, usage } = yield* this.consumeStream(stream)

        if (this.costTracker) {
          const inputTokens = usage?.inputTokens ?? estimateTokens(messages)
          const outputTokens = usage?.outputTokens ?? Math.ceil(
            (text.length + toolCalls.reduce((n, tc) => n + JSON.stringify(tc.input).length, 0)) / 4
          )
          this.costTracker.record(inputTokens, outputTokens)
        }

        // Accumulate assistant message with ContentBlocks
        if (text || toolCalls.length > 0) {
          const blocks: ContentBlock[] = []
          if (text) blocks.push({ type: 'text', text })
          for (const tc of toolCalls) {
            blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input })
          }
          messages.push({
            role: 'assistant',
            content: blocks.length === 1 && blocks[0]?.type === 'text' ? text : blocks,
            timestamp: Date.now(),
          })
        }

        // If no tool calls, we're done
        if (toolCalls.length === 0) break

        // Execute all tool calls and batch results into a single user message
        const resultBlocks: ContentBlock[] = []
        for (const call of toolCalls) {
          const result = yield* this.executeTool(call)
          resultBlocks.push({
            type: 'tool_result',
            toolCallId: call.id,  // always use the provider-assigned ID, not the tool's
            output: result.output,
            ...(result.error !== undefined ? { isError: true } : {}),
          })
        }
        messages.push({ role: 'user', content: resultBlocks, timestamp: Date.now() })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      yield { type: 'error', error: msg }
      return
    }

    this.history = messages
    yield { type: 'done' }
  }

  private async *consumeStream(
    stream: AsyncIterable<StreamChunk>,
  ): AsyncGenerator<AgentEvent, { text: string; toolCalls: ToolCall[]; usage: TokenUsage | undefined }> {
    let text = ''
    const toolCalls: ToolCall[] = []
    let usage: TokenUsage | undefined

    for await (const chunk of stream) {
      if (chunk.error) {
        throw new Error(chunk.error)
      }
      if (chunk.text) {
        text += chunk.text
        yield { type: 'text', chunk: chunk.text }
      }
      if (chunk.toolCall) {
        toolCalls.push(chunk.toolCall)
        yield { type: 'tool_start', call: chunk.toolCall }
      }
      if (chunk.usage) {
        usage = chunk.usage
      }
    }

    return { text, toolCalls, usage }
  }

  private async *executeTool(call: ToolCall): AsyncGenerator<AgentEvent, ToolResult> {
    const tool = this.tools.find((t) => t.name === call.name)

    if (!tool) {
      const result: ToolResult = {
        toolCallId: call.id,
        success: false,
        output: '',
        error: `Unknown tool: ${call.name}`,
      }
      yield { type: 'tool_result', result }
      return result
    }

    // Confirmation gate
    if (tool.requiresConfirmation) {
      let approved = false
      yield {
        type: 'tool_confirm',
        request: {
          tool: call.name,
          input: call.input,
          resolve: (a: boolean) => { approved = a },
        },
      }

      if (this.onConfirm) {
        approved = await this.onConfirm({ tool: call.name, input: call.input, resolve: () => {} })
      }

      if (!approved) {
        const result: ToolResult = {
          toolCallId: call.id,
          success: false,
          output: '',
          error: 'Tool execution denied by user',
        }
        yield { type: 'tool_result', result }
        return result
      }
    }

    const result = await tool.execute(call.input)
    yield { type: 'tool_result', result }
    return result
  }

  private toDefinition(tool: Tool): ToolDefinition {
    return {
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }
  }
}
