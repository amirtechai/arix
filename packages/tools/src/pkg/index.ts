import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Tool, ToolResult } from '@arix-code/core'
import { runCommand, truncate } from '../shell/exec.js'

type Pm = 'npm' | 'pnpm' | 'yarn' | 'pip' | 'uv' | 'cargo' | 'go'

function detectPm(cwd: string): Pm | null {
  if (existsSync(join(cwd, 'pnpm-lock.yaml'))) return 'pnpm'
  if (existsSync(join(cwd, 'yarn.lock')))      return 'yarn'
  if (existsSync(join(cwd, 'package-lock.json')) || existsSync(join(cwd, 'package.json'))) return 'npm'
  if (existsSync(join(cwd, 'uv.lock')))         return 'uv'
  if (existsSync(join(cwd, 'pyproject.toml')) || existsSync(join(cwd, 'requirements.txt'))) return 'pip'
  if (existsSync(join(cwd, 'Cargo.toml')))      return 'cargo'
  if (existsSync(join(cwd, 'go.mod')))          return 'go'
  return null
}

interface CmdSpec { cmd: string; args: string[] }

function buildCmd(pm: Pm, action: 'add' | 'remove' | 'install' | 'audit' | 'outdated', pkg?: string, dev?: boolean): CmdSpec | null {
  const p = pkg ?? ''
  switch (pm) {
    case 'npm':
      if (action === 'add')      return { cmd: 'npm',  args: ['install', ...(dev ? ['-D'] : []), p] }
      if (action === 'remove')   return { cmd: 'npm',  args: ['uninstall', p] }
      if (action === 'install')  return { cmd: 'npm',  args: ['install'] }
      if (action === 'audit')    return { cmd: 'npm',  args: ['audit'] }
      if (action === 'outdated') return { cmd: 'npm',  args: ['outdated'] }
      break
    case 'pnpm':
      if (action === 'add')      return { cmd: 'pnpm', args: ['add', ...(dev ? ['-D'] : []), p] }
      if (action === 'remove')   return { cmd: 'pnpm', args: ['remove', p] }
      if (action === 'install')  return { cmd: 'pnpm', args: ['install'] }
      if (action === 'audit')    return { cmd: 'pnpm', args: ['audit'] }
      if (action === 'outdated') return { cmd: 'pnpm', args: ['outdated'] }
      break
    case 'yarn':
      if (action === 'add')      return { cmd: 'yarn', args: ['add', ...(dev ? ['--dev'] : []), p] }
      if (action === 'remove')   return { cmd: 'yarn', args: ['remove', p] }
      if (action === 'install')  return { cmd: 'yarn', args: ['install'] }
      if (action === 'audit')    return { cmd: 'yarn', args: ['npm', 'audit'] }
      if (action === 'outdated') return { cmd: 'yarn', args: ['outdated'] }
      break
    case 'pip':
      if (action === 'add')      return { cmd: 'pip',  args: ['install', p] }
      if (action === 'remove')   return { cmd: 'pip',  args: ['uninstall', '-y', p] }
      if (action === 'install')  return { cmd: 'pip',  args: ['install', '-r', 'requirements.txt'] }
      if (action === 'audit')    return { cmd: 'pip-audit', args: [] }
      if (action === 'outdated') return { cmd: 'pip',  args: ['list', '--outdated'] }
      break
    case 'uv':
      if (action === 'add')      return { cmd: 'uv',   args: ['add', p] }
      if (action === 'remove')   return { cmd: 'uv',   args: ['remove', p] }
      if (action === 'install')  return { cmd: 'uv',   args: ['sync'] }
      if (action === 'audit')    return { cmd: 'pip-audit', args: [] }
      if (action === 'outdated') return { cmd: 'uv',   args: ['pip', 'list', '--outdated'] }
      break
    case 'cargo':
      if (action === 'add')      return { cmd: 'cargo', args: ['add', p] }
      if (action === 'remove')   return { cmd: 'cargo', args: ['remove', p] }
      if (action === 'install')  return { cmd: 'cargo', args: ['build'] }
      if (action === 'audit')    return { cmd: 'cargo', args: ['audit'] }
      if (action === 'outdated') return { cmd: 'cargo', args: ['outdated'] }
      break
    case 'go':
      if (action === 'add')      return { cmd: 'go',   args: ['get', p] }
      if (action === 'remove')   return { cmd: 'go',   args: ['mod', 'tidy'] }
      if (action === 'install')  return { cmd: 'go',   args: ['mod', 'download'] }
      if (action === 'audit')    return { cmd: 'govulncheck', args: ['./...'] }
      if (action === 'outdated') return { cmd: 'go',   args: ['list', '-u', '-m', 'all'] }
      break
  }
  return null
}

export class PackageManagerTool implements Tool {
  readonly name = 'package_manager'
  readonly description =
    'Manage project dependencies. Auto-detects npm/pnpm/yarn/pip/uv/cargo/go from lockfiles. Actions: add, remove, install, audit, outdated.'
  readonly requiresConfirmation = true
  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      action:  { type: 'string', enum: ['add', 'remove', 'install', 'audit', 'outdated'] },
      package: { type: 'string', description: 'Package name (for add/remove)' },
      dev:     { type: 'boolean', description: 'Install as dev dependency' },
      manager: { type: 'string', enum: ['npm', 'pnpm', 'yarn', 'pip', 'uv', 'cargo', 'go'], description: 'Override auto-detected PM' },
      cwd:     { type: 'string', description: 'Working directory (default: project root)' },
    },
    required: ['action'],
  }

  constructor(private readonly cwd: string) {}

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const action = input['action'] as 'add' | 'remove' | 'install' | 'audit' | 'outdated'
    const pkg     = input['package'] as string | undefined
    const dev     = input['dev'] as boolean | undefined
    const override = input['manager'] as Pm | undefined
    const cwd     = resolve((input['cwd'] as string | undefined) ?? this.cwd)

    const pm = override ?? detectPm(cwd)
    if (!pm) return { toolCallId: '', success: false, output: '', error: 'No supported package manager detected' }
    if ((action === 'add' || action === 'remove') && !pkg) {
      return { toolCallId: '', success: false, output: '', error: `'${action}' requires a package name` }
    }

    const spec = buildCmd(pm, action, pkg, dev)
    if (!spec) return { toolCallId: '', success: false, output: '', error: `Action '${action}' not supported for ${pm}` }

    const { stdout, stderr, exitCode } = await runCommand(spec.cmd, spec.args, { cwd, timeoutMs: 300_000 })
    const output = truncate([stdout, stderr].filter(Boolean).join('\n'))
    return {
      toolCallId: '',
      success: exitCode === 0,
      output: output || `(${pm} ${action} completed)`,
      ...(exitCode !== 0 ? { error: `${pm} exited with ${exitCode}` } : {}),
    }
  }
}
