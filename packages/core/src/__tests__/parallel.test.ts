import { describe, it, expect, vi } from 'vitest'
import { ParallelAgentPool, mergeResults } from '../parallel/index.js'
import type { WorkerTask, WorkerResult } from '../parallel/index.js'

function makePool(concurrency: number) {
  const loopFactory = (sp?: string) => ({
    async *run(prompt: string) {
      yield { type: 'text' as const, chunk: `result:${prompt}` }
      yield { type: 'done' as const }
    },
  })
  return new ParallelAgentPool({ concurrency, loopFactory })
}

describe('ParallelAgentPool', () => {
  it('runs tasks and collects results', async () => {
    const pool = makePool(2)
    const tasks: WorkerTask[] = [
      { id: 'a', prompt: 'task-a' },
      { id: 'b', prompt: 'task-b' },
    ]
    const results = await pool.run(tasks)
    expect(results).toHaveLength(2)
    expect(results.find((r) => r.id === 'a')?.text).toContain('result:task-a')
    expect(results.find((r) => r.id === 'b')?.text).toContain('result:task-b')
  })

  it('respects concurrency limit', async () => {
    let concurrent = 0
    let maxConcurrent = 0

    const loopFactory = () => ({
      async *run(prompt: string) {
        concurrent++
        maxConcurrent = Math.max(maxConcurrent, concurrent)
        await new Promise((r) => setTimeout(r, 10))
        yield { type: 'text' as const, chunk: prompt }
        concurrent--
        yield { type: 'done' as const }
      },
    })

    const pool = new ParallelAgentPool({ concurrency: 2, loopFactory })
    const tasks: WorkerTask[] = Array.from({ length: 6 }, (_, i) => ({ id: String(i), prompt: `t${i}` }))
    await pool.run(tasks)
    expect(maxConcurrent).toBeLessThanOrEqual(2)
  })

  it('handles empty task list', async () => {
    const pool = makePool(2)
    const results = await pool.run([])
    expect(results).toHaveLength(0)
  })

  it('calls onChunk callback for each text event', async () => {
    const onChunk = vi.fn()
    const loopFactory = () => ({
      async *run() {
        yield { type: 'text' as const, chunk: 'hello' }
        yield { type: 'done' as const }
      },
    })
    const pool = new ParallelAgentPool({ concurrency: 1, loopFactory, onChunk })
    await pool.run([{ id: 'x', prompt: 'hi' }])
    expect(onChunk).toHaveBeenCalledWith('x', 'hello')
  })

  it('captures errors without throwing', async () => {
    const loopFactory = () => ({
      async *run() {
        throw new Error('worker failed')
        yield { type: 'done' as const }  // unreachable
      },
    })
    const pool = new ParallelAgentPool({ concurrency: 1, loopFactory })
    const results = await pool.run([{ id: 'err', prompt: 'boom' }])
    expect(results[0]?.error).toContain('worker failed')
  })
})

describe('mergeResults', () => {
  it('formats results with section headers', () => {
    const results: WorkerResult[] = [
      { id: 'security', text: 'no issues', error: undefined, durationMs: 10 },
      { id: 'performance', text: 'looks good', error: undefined, durationMs: 20 },
    ]
    const merged = mergeResults(results)
    expect(merged).toContain('## Security')
    expect(merged).toContain('no issues')
    expect(merged).toContain('## Performance')
    expect(merged).toContain('looks good')
  })

  it('shows error in output when worker failed', () => {
    const results: WorkerResult[] = [
      { id: 'style', text: '', error: 'timed out', durationMs: 5000 },
    ]
    const merged = mergeResults(results)
    expect(merged).toContain('timed out')
  })
})
