import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Tool, ToolResult } from '@arix/core'
import { runCommand, truncate } from '../shell/exec.js'

type Linter = 'eslint' | 'biome' | 'ruff' | 'flake8' | 'clippy' | 'golangci'

function detect(cwd: string): Linter | null {
  if (
    existsSync(join(cwd, '.eslintrc.json')) ||
    existsSync(join(cwd, '.eslintrc.js')) ||
    existsSync(join(cwd, '.eslintrc.cjs')) ||
    existsSync(join(cwd, 'eslint.config.js')) ||
    existsSync(join(cwd, 'eslint.config.mjs'))
  ) return 'eslint'
  if (existsSync(join(cwd, 'biome.json'))) return 'biome'
  const pkgPath = join(cwd, 'package.json')
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as Record<string, Record<string, string> | undefined>
      const deps = { ...(pkg['dependencies'] ?? {}), ...(pkg['devDependencies'] ?? {}) }
      if (deps['eslint']) return 'eslint'
      if (deps['@biomejs/biome']) return 'biome'
    } catch { /* ignore */ }
  }
  if (existsSync(join(cwd, 'ruff.toml')) || existsSync(join(cwd, 'pyproject.toml'))) return 'ruff'
  if (existsSync(join(cwd, '.flake8'))) return 'flake8'
  if (existsSync(join(cwd, 'Cargo.toml'))) return 'clippy'
  if (existsSync(join(cwd, 'go.mod'))) return 'golangci'
  return null
}

interface CmdSpec { cmd: string; args: string[] }

function buildCmd(l: Linter, target: string, fix: boolean): CmdSpec {
  switch (l) {
    case 'eslint':   return { cmd: 'npx', args: ['eslint', ...(fix ? ['--fix'] : []), target] }
    case 'biome':    return { cmd: 'npx', args: ['biome', fix ? 'check' : 'lint', ...(fix ? ['--apply'] : []), target] }
    case 'ruff':     return { cmd: 'ruff', args: [fix ? 'check' : 'check', ...(fix ? ['--fix'] : []), target] }
    case 'flake8':   return { cmd: 'flake8', args: [target] }
    case 'clippy':   return { cmd: 'cargo', args: ['clippy', ...(fix ? ['--fix', '--allow-dirty'] : []), '--', '-D', 'warnings'] }
    case 'golangci': return { cmd: 'golangci-lint', args: ['run', ...(fix ? ['--fix'] : []), target] }
  }
}

export class LinterTool implements Tool {
  readonly name = 'linter'
  readonly description =
    'Run a linter and report issues. Auto-detects eslint/biome/ruff/flake8/clippy/golangci-lint. `fix:true` applies safe auto-fixes.'
  readonly requiresConfirmation = false
  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      target: { type: 'string', description: 'Path or glob (default: project root)' },
      fix:    { type: 'boolean' },
      linter: { type: 'string', enum: ['eslint', 'biome', 'ruff', 'flake8', 'clippy', 'golangci'] },
      cwd:    { type: 'string' },
    },
  }

  constructor(private readonly cwd: string) {}

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const cwd = resolve((input['cwd'] as string | undefined) ?? this.cwd)
    const linter = (input['linter'] as Linter | undefined) ?? detect(cwd)
    if (!linter) return { toolCallId: '', success: false, output: '', error: 'No supported linter detected' }
    const target = (input['target'] as string | undefined) ?? '.'
    const fix    = (input['fix'] as boolean | undefined) ?? false

    const spec = buildCmd(linter, target, fix)
    const { stdout, stderr, exitCode } = await runCommand(spec.cmd, spec.args, { cwd, timeoutMs: 180_000 })
    const output = truncate([stdout, stderr].filter(Boolean).join('\n'), 16_000)
    return {
      toolCallId: '',
      success: exitCode === 0,
      output: output || '(no issues)',
      ...(exitCode !== 0 ? { error: `${linter} reported issues (exit ${exitCode})` } : {}),
    }
  }
}
