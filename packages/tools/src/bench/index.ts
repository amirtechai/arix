/**
 * bench_runner (N8) — wrapper around hyperfine. If absent, falls back to a
 * pure-JS sampling loop (less accurate, no warm-up control).
 */

import type { Tool, ToolResult } from '@arix/core'
import { runCommand, truncate } from '../shell/exec.js'

export class BenchRunnerTool implements Tool {
  readonly name = 'bench_runner'
  readonly description =
    'Benchmark a shell command. Uses hyperfine when installed (preferred), otherwise a JS timing loop. Returns mean/median/stddev.'
  readonly requiresConfirmation = true
  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      command:  { type: 'string', description: 'Command to benchmark (passed to a shell)' },
      runs:     { type: 'number', description: 'Sample size (default 10)' },
      warmup:   { type: 'number', description: 'Warm-up runs (default 2)' },
      cwd:      { type: 'string' },
    },
    required: ['command'],
  }

  constructor(private readonly cwd: string) {}

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const command = input['command'] as string
    const runs = (input['runs'] as number | undefined) ?? 10
    const warmup = (input['warmup'] as number | undefined) ?? 2
    const cwd = (input['cwd'] as string | undefined) ?? this.cwd

    const hyper = await runCommand('hyperfine', ['--version'], { timeoutMs: 5_000 })
    if (hyper.exitCode === 0) {
      const args = ['--runs', String(runs), '--warmup', String(warmup), '--style', 'basic', command]
      const r = await runCommand('hyperfine', args, { cwd, timeoutMs: 600_000 })
      return {
        toolCallId: '', success: r.exitCode === 0,
        output: truncate([r.stdout, r.stderr].filter(Boolean).join('\n'), 8_000),
        ...(r.exitCode !== 0 ? { error: `hyperfine exit ${r.exitCode}` } : {}),
      }
    }

    // Fallback — JS-side timing (no shell flush, less accurate)
    const samples: number[] = []
    for (let i = 0; i < warmup; i++) await runCommand('sh', ['-c', command], { cwd, timeoutMs: 600_000 })
    for (let i = 0; i < runs; i++) {
      const t0 = process.hrtime.bigint()
      const r = await runCommand('sh', ['-c', command], { cwd, timeoutMs: 600_000 })
      const t1 = process.hrtime.bigint()
      if (r.exitCode !== 0) {
        return { toolCallId: '', success: false, output: '', error: `command failed on run ${i + 1}: ${r.stderr.slice(0, 200)}` }
      }
      samples.push(Number(t1 - t0) / 1e6)
    }
    samples.sort((a, b) => a - b)
    const mean = samples.reduce((s, v) => s + v, 0) / samples.length
    const median = samples[Math.floor(samples.length / 2)]!
    const stddev = Math.sqrt(samples.reduce((s, v) => s + (v - mean) ** 2, 0) / samples.length)
    const min = samples[0]!
    const max = samples[samples.length - 1]!
    return {
      toolCallId: '', success: true,
      output:
        `Benchmark (JS fallback, hyperfine not found)\n` +
        `  command: ${command}\n` +
        `  runs:    ${runs}  (warmup ${warmup})\n` +
        `  mean:    ${mean.toFixed(2)} ms\n` +
        `  median:  ${median.toFixed(2)} ms\n` +
        `  stddev:  ${stddev.toFixed(2)} ms\n` +
        `  min..max:${min.toFixed(2)} ms .. ${max.toFixed(2)} ms\n`,
    }
  }
}
