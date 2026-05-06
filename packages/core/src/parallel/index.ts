/**
 * ParallelAgentPool — run multiple AgentLoop instances concurrently and
 * collect/stream their results.
 *
 * Unlike the CoordinatorAgent (which decomposes serially), the Pool fires
 * N workers at the same time and merges the output streams.
 *
 * Usage:
 *   const pool = new ParallelAgentPool({ concurrency: 3, loopFactory })
 *   const results = await pool.run([
 *     { id: 'security', prompt: 'Review for security issues' },
 *     { id: 'perf',     prompt: 'Review for performance issues' },
 *     { id: 'style',    prompt: 'Review for code style' },
 *   ])
 */

import type { AgentEvent } from '../types.js'

// ── Types ──────────────────────────────────────────────────────────────────

export interface WorkerTask {
  id: string
  prompt: string
  /** Optional system prompt override for this worker */
  systemPrompt?: string
}

export interface WorkerResult {
  id: string
  text: string
  error: string | undefined
  durationMs: number
}

export interface ParallelPoolOptions {
  /** Max concurrent workers. Default: 4 */
  concurrency?: number
  /**
   * Factory that creates a new AgentLoop-like object for each worker.
   * Takes an optional system prompt override.
   */
  loopFactory: (systemPrompt?: string) => {
    run(prompt: string): AsyncIterable<AgentEvent>
  }
  /** Called when a worker emits a text chunk (for live streaming) */
  onChunk?: (workerId: string, chunk: string) => void
  /** Called when a worker finishes */
  onWorkerDone?: (result: WorkerResult) => void
}

// ── ParallelAgentPool ──────────────────────────────────────────────────────

export class ParallelAgentPool {
  private readonly concurrency: number
  private readonly loopFactory: ParallelPoolOptions['loopFactory']
  private readonly onChunk: ParallelPoolOptions['onChunk']
  private readonly onWorkerDone: ParallelPoolOptions['onWorkerDone']

  constructor(opts: ParallelPoolOptions) {
    this.concurrency = opts.concurrency ?? 4
    this.loopFactory = opts.loopFactory
    this.onChunk = opts.onChunk
    this.onWorkerDone = opts.onWorkerDone
  }

  /**
   * Run all tasks with bounded concurrency.
   * Returns results in the same order as tasks (regardless of completion order).
   */
  async run(tasks: WorkerTask[]): Promise<WorkerResult[]> {
    const results: WorkerResult[] = new Array(tasks.length)
    const queue = tasks.map((task, i) => ({ task, index: i }))
    let queueIdx = 0

    const worker = async (): Promise<void> => {
      while (true) {
        const item = queue[queueIdx++]
        if (!item) return

        const { task, index } = item
        const start = Date.now()
        let text = ''
        let error: string | undefined

        try {
          const loop = this.loopFactory(task.systemPrompt)
          for await (const event of loop.run(task.prompt)) {
            if (event.type === 'text') {
              text += event.chunk
              this.onChunk?.(task.id, event.chunk)
            }
            if (event.type === 'error') {
              error = event.error
            }
          }
        } catch (err) {
          error = err instanceof Error ? err.message : String(err)
        }

        const result: WorkerResult = { id: task.id, text, error, durationMs: Date.now() - start }
        results[index] = result
        this.onWorkerDone?.(result)
      }
    }

    // Start `concurrency` workers in parallel
    await Promise.all(
      Array.from({ length: Math.min(this.concurrency, tasks.length) }, () => worker()),
    )

    return results
  }
}

// ── Synthesis ──────────────────────────────────────────────────────────────

/**
 * Merge multiple worker results into a single structured report.
 * Each result becomes a section headed by its id.
 */
export function mergeResults(results: WorkerResult[]): string {
  return results
    .filter((r) => r.text || r.error)
    .map((r) => {
      const header = `## ${r.id.charAt(0).toUpperCase() + r.id.slice(1)}`
      const body = r.error ? `⚠️ Error: ${r.error}` : r.text.trim()
      return `${header}\n\n${body}`
    })
    .join('\n\n---\n\n')
}
