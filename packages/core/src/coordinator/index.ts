import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { AgentLoop } from '../agent/index.js'
import type { AgentEvent } from '../agent/index.js'

// ── TeamMemory ────────────────────────────────────────────────────────────────

export interface TeamMemoryEntry {
  key: string
  value: string
  createdAt: number
  updatedAt: number
}

export class TeamMemory {
  private entries: Map<string, TeamMemoryEntry> = new Map()

  constructor(private readonly filePath: string) {}

  async load(): Promise<void> {
    if (!existsSync(this.filePath)) return
    try {
      const raw = await readFile(this.filePath, 'utf-8')
      const data = JSON.parse(raw) as TeamMemoryEntry[]
      for (const entry of data) {
        this.entries.set(entry.key, entry)
      }
    } catch { /* ignore parse errors on first load */ }
  }

  async save(): Promise<void> {
    await mkdir(join(this.filePath, '..'), { recursive: true })
    const data: TeamMemoryEntry[] = [...this.entries.values()]
    await writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf-8')
  }

  set(key: string, value: string): void {
    const now = Date.now()
    const existing = this.entries.get(key)
    this.entries.set(key, {
      key,
      value,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    })
  }

  get(key: string): string | undefined {
    return this.entries.get(key)?.value
  }

  all(): TeamMemoryEntry[] {
    return [...this.entries.values()]
  }

  toContextString(): string {
    if (this.entries.size === 0) return ''
    return (
      '## Shared Team Memory\n\n' +
      [...this.entries.values()].map((e) => `**${e.key}**: ${e.value}`).join('\n')
    )
  }
}

// ── SubTask ───────────────────────────────────────────────────────────────────

export type TaskType = 'coding' | 'search' | 'review' | 'analysis' | 'general'

export interface SubTask {
  id: string
  type: TaskType
  prompt: string
  result?: string
  error?: string
}

// ── CoordinatorAgent ──────────────────────────────────────────────────────────

/** Parse a simple decomposition plan from coordinator response text. */
function parseSubTasks(text: string): SubTask[] {
  // Expected format from coordinator:
  // TASK[1]: type=coding prompt=Fix the type error in src/foo.ts
  // TASK[2]: type=search prompt=Find documentation for X
  const taskRe = /TASK\[(\d+)\]:\s*type=(\w+)\s+prompt=(.+)/gi
  const tasks: SubTask[] = []
  let m: RegExpExecArray | null
  while ((m = taskRe.exec(text)) !== null) {
    const type = m[2]!.toLowerCase() as TaskType
    tasks.push({
      id: m[1]!,
      type: ['coding', 'search', 'review', 'analysis'].includes(type) ? type : 'general',
      prompt: m[3]!.trim(),
    })
  }
  return tasks
}

const COORDINATOR_SYSTEM = `You are a coordinator agent that decomposes complex tasks into sub-tasks.

When given a task, respond with a decomposition plan using this exact format:
TASK[1]: type=<coding|search|review|analysis|general> prompt=<specific prompt for this sub-task>
TASK[2]: type=<type> prompt=<prompt>
... (up to 5 sub-tasks)

After all TASK lines, add a brief explanation of your decomposition strategy.

If the task is simple enough for one agent, emit a single TASK[1].
Task types:
- coding: file edits, bug fixes, implementations
- search: web search, documentation lookup
- review: code review, quality checks
- analysis: understand code, explain behavior
- general: anything else`

export interface CoordinatorOptions {
  /** Factory that returns an AgentLoop for a given task type */
  agentFactory: (taskType: TaskType, systemPrompt?: string) => AgentLoop
  /** Optional shared team memory */
  teamMemory?: TeamMemory
  /** Max sub-tasks per coordination run */
  maxSubTasks?: number
  /** Run sub-tasks in parallel (default: true) */
  parallel?: boolean
}

export class CoordinatorAgent {
  private readonly agentFactory: CoordinatorOptions['agentFactory']
  private readonly teamMemory: TeamMemory | undefined
  private readonly maxSubTasks: number
  private readonly parallel: boolean

  constructor(opts: CoordinatorOptions) {
    this.agentFactory = opts.agentFactory
    this.teamMemory = opts.teamMemory
    this.maxSubTasks = opts.maxSubTasks ?? 10
    this.parallel = opts.parallel ?? true
  }

  async *run(task: string): AsyncGenerator<AgentEvent> {
    // Step 1: Decompose task using coordinator agent
    const memoryContext = this.teamMemory?.toContextString() ?? ''
    const fullTask = memoryContext ? `${memoryContext}\n\n## Task\n${task}` : task
    const coordinator = this.agentFactory('general', COORDINATOR_SYSTEM)
    let planText = ''

    for await (const ev of coordinator.run(fullTask)) {
      if (ev.type === 'text') planText += ev.chunk
      yield ev // surface coordinator thinking to caller
    }

    const subTasks = parseSubTasks(planText).slice(0, this.maxSubTasks)
    if (subTasks.length === 0) {
      // Coordinator gave direct answer — we're done
      return
    }

    yield { type: 'text', chunk: `\n\n─── Executing ${subTasks.length} sub-task(s) ${this.parallel ? '(parallel)' : '(sequential)'} ───\n` }

    if (this.parallel && subTasks.length > 1) {
      yield* this.runParallel(subTasks)
    } else {
      yield* this.runSequential(subTasks)
    }

    // Step 3: Synthesize results
    const synthesis = subTasks
      .map((t) => `### Sub-task ${t.id} (${t.type})\n${t.result ?? t.error ?? '(no output)'}`)
      .join('\n\n')
    const synPrompt = `Based on these sub-task results, provide a concise final answer:\n\n${synthesis}`

    yield { type: 'text', chunk: '\n\n─── Synthesizing results ───\n' }
    const synthesizer = this.agentFactory('general')
    for await (const ev of synthesizer.run(synPrompt)) {
      yield ev
    }

    if (this.teamMemory) {
      await this.teamMemory.save()
    }
  }

  private async *runSequential(subTasks: SubTask[]): AsyncGenerator<AgentEvent> {
    for (const subTask of subTasks) {
      yield { type: 'text', chunk: `\n[${subTask.id}/${subTasks.length}] ${subTask.type}: ${subTask.prompt}\n` }
      const agent = this.agentFactory(subTask.type)
      let result = ''
      for await (const ev of agent.run(subTask.prompt)) {
        if (ev.type === 'text') result += ev.chunk
        yield ev
      }
      subTask.result = result
      if (this.teamMemory && result) {
        this.teamMemory.set(`task-${subTask.id}-result`, result.slice(0, 500))
      }
    }
  }

  private async *runParallel(subTasks: SubTask[]): AsyncGenerator<AgentEvent> {
    // Collect all results in parallel, then yield them in order
    yield { type: 'text', chunk: `  Starting ${subTasks.length} agents simultaneously...\n` }

    const promises = subTasks.map(async (subTask) => {
      const agent = this.agentFactory(subTask.type)
      let result = ''
      const events: AgentEvent[] = []
      for await (const ev of agent.run(subTask.prompt)) {
        if (ev.type === 'text') result += ev.chunk
        events.push(ev)
      }
      subTask.result = result
      return { subTask, events }
    })

    const results = await Promise.allSettled(promises)

    for (const outcome of results) {
      if (outcome.status === 'fulfilled') {
        const { subTask, events } = outcome.value
        yield { type: 'text', chunk: `\n[${subTask.id}/${subTasks.length}] ${subTask.type}: ${subTask.prompt}\n` }
        for (const ev of events) yield ev
        if (this.teamMemory && subTask.result) {
          this.teamMemory.set(`task-${subTask.id}-result`, subTask.result.slice(0, 500))
        }
      } else {
        yield { type: 'text', chunk: `\n[subtask failed]: ${String(outcome.reason)}\n` }
      }
    }
  }
}
