import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Tool, ToolResult } from '@arix/core'
import { runCommand, truncate } from '../shell/exec.js'

type Runner = 'vitest' | 'jest' | 'mocha' | 'pytest' | 'go' | 'cargo'

function detectRunner(cwd: string): Runner | null {
  const pkgPath = join(cwd, 'package.json')
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as Record<string, Record<string, string> | undefined>
      const deps = { ...(pkg['dependencies'] ?? {}), ...(pkg['devDependencies'] ?? {}) }
      if (deps['vitest']) return 'vitest'
      if (deps['jest'])   return 'jest'
      if (deps['mocha'])  return 'mocha'
    } catch { /* fall through */ }
  }
  if (existsSync(join(cwd, 'pyproject.toml')) || existsSync(join(cwd, 'pytest.ini')) || existsSync(join(cwd, 'tests'))) return 'pytest'
  if (existsSync(join(cwd, 'go.mod')))   return 'go'
  if (existsSync(join(cwd, 'Cargo.toml'))) return 'cargo'
  return null
}

interface CmdSpec { cmd: string; args: string[] }

function buildCmd(runner: Runner, pattern?: string, file?: string): CmdSpec {
  switch (runner) {
    case 'vitest': return { cmd: 'npx', args: ['vitest', 'run', ...(file ? [file] : []), ...(pattern ? ['-t', pattern] : [])] }
    case 'jest':   return { cmd: 'npx', args: ['jest',   ...(file ? [file] : []), ...(pattern ? ['-t', pattern] : [])] }
    case 'mocha':  return { cmd: 'npx', args: ['mocha',  ...(file ? [file] : []), ...(pattern ? ['--grep', pattern] : [])] }
    case 'pytest': return { cmd: 'pytest', args: [...(file ? [file] : []), ...(pattern ? ['-k', pattern] : [])] }
    case 'go':     return { cmd: 'go',  args: ['test', file ?? './...', ...(pattern ? ['-run', pattern] : [])] }
    case 'cargo':  return { cmd: 'cargo', args: ['test', ...(pattern ? [pattern] : [])] }
  }
}

export class TestRunnerTool implements Tool {
  readonly name = 'test_runner'
  readonly description =
    'Run tests selectively. Auto-detects vitest/jest/mocha/pytest/go test/cargo test. Optional pattern (-t/-k/--grep) and file filter.'
  readonly requiresConfirmation = false
  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      pattern: { type: 'string', description: 'Test name pattern' },
      file:    { type: 'string', description: 'Specific test file or path' },
      runner:  { type: 'string', enum: ['vitest', 'jest', 'mocha', 'pytest', 'go', 'cargo'] },
      cwd:     { type: 'string' },
    },
  }

  constructor(private readonly cwd: string) {}

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const cwd = resolve((input['cwd'] as string | undefined) ?? this.cwd)
    const runner = (input['runner'] as Runner | undefined) ?? detectRunner(cwd)
    if (!runner) return { toolCallId: '', success: false, output: '', error: 'No test runner detected' }

    const spec = buildCmd(runner, input['pattern'] as string | undefined, input['file'] as string | undefined)
    const { stdout, stderr, exitCode } = await runCommand(spec.cmd, spec.args, { cwd, timeoutMs: 300_000 })
    const output = truncate([stdout, stderr].filter(Boolean).join('\n'), 16_000)
    return {
      toolCallId: '',
      success: exitCode === 0,
      output: output || '(no output)',
      ...(exitCode !== 0 ? { error: `${runner} exited with ${exitCode}` } : {}),
    }
  }
}
