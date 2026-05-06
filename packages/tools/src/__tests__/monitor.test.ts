import { describe, it, expect } from 'vitest'
import { MonitorTool, ProcessMonitor } from '../monitor/index.js'

describe('ProcessMonitor', () => {
  it('emits lines from stdout', async () => {
    const monitor = new ProcessMonitor()
    const lines: string[] = []
    monitor.on('line', (_, line) => lines.push(line))

    await new Promise<void>((resolve) => {
      monitor.on('exit', () => resolve())
      monitor.start('echo', ['hello world'], process.cwd())
    })

    expect(lines.join(' ')).toContain('hello world')
    expect(monitor.isRunning()).toBe(false)
  })

  it('reports exit code', async () => {
    const monitor = new ProcessMonitor()
    let exitCode: number | null = null

    await new Promise<void>((resolve) => {
      monitor.on('exit', (code) => { exitCode = code; resolve() })
      monitor.start('true', [], process.cwd())
    })

    expect(exitCode).toBe(0)
  })

  it('reports non-zero exit code', async () => {
    const monitor = new ProcessMonitor()
    let exitCode: number | null = null

    await new Promise<void>((resolve) => {
      monitor.on('exit', (code) => { exitCode = code; resolve() })
      monitor.start('false', [], process.cwd())
    })

    expect(exitCode).toBe(1)
  })
})

describe('MonitorTool', () => {
  it('captures output from a command', async () => {
    const tool = new MonitorTool()
    const result = await tool.execute({ command: 'echo', args: ['test output'] })
    expect(result.success).toBe(true)
    expect(result.output).toContain('test output')
  })

  it('reports failure for non-zero exit', async () => {
    const tool = new MonitorTool()
    const result = await tool.execute({ command: 'sh', args: ['-c', 'exit 2'] })
    expect(result.success).toBe(false)
    expect(result.output).toContain('exit code: 2')
  })

  it('captures multiple lines', async () => {
    const tool = new MonitorTool()
    const result = await tool.execute({ command: 'sh', args: ['-c', 'echo line1; echo line2; echo line3'] })
    expect(result.success).toBe(true)
    expect(result.output).toContain('line1')
    expect(result.output).toContain('line3')
  })

  it('respects timeout', async () => {
    const tool = new MonitorTool()
    const result = await tool.execute({
      command: 'sleep',
      args: ['10'],
      timeoutMs: 200,
    })
    expect(result.output).toContain('timeout')
  })
})
