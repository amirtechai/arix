import type { Tool, ToolResult } from '@arix/core'
import { runCommand, truncate } from '../shell/exec.js'

/**
 * docker_exec — run a command inside an ephemeral Docker container.
 * Useful as a sandbox for running untrusted code, language tooling not on the
 * host, or reproducing CI environments.
 *
 * Defaults are conservative: read-only root, no network, mounts only `cwd`.
 */
export class DockerExecTool implements Tool {
  readonly name = 'docker_exec'
  readonly description =
    'Run a command inside an ephemeral Docker container (sandbox). Defaults: --rm, no network, read-only root, mounts cwd at /work.'
  readonly requiresConfirmation = true
  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      image:    { type: 'string', description: 'e.g. "node:20", "python:3.12-slim"' },
      command:  { type: 'array', items: { type: 'string' }, description: 'argv array' },
      mountCwd: { type: 'boolean', description: 'Mount cwd at /work (default true)' },
      network:  { type: 'boolean', description: 'Allow network (default false)' },
      env:      { type: 'object', description: 'Env vars passed in' },
      cwd:      { type: 'string', description: 'Host cwd to mount' },
      timeoutMs:{ type: 'number' },
    },
    required: ['image', 'command'],
  }

  constructor(private readonly defaultCwd: string) {}

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const image    = input['image'] as string
    const command  = input['command'] as string[]
    const mountCwd = (input['mountCwd'] as boolean | undefined) ?? true
    const network  = (input['network'] as boolean | undefined) ?? false
    const env      = (input['env'] as Record<string, string> | undefined) ?? {}
    const cwd      = (input['cwd'] as string | undefined) ?? this.defaultCwd
    const timeout  = (input['timeoutMs'] as number | undefined) ?? 60_000

    if (!Array.isArray(command) || command.length === 0) {
      return { toolCallId: '', success: false, output: '', error: 'command must be a non-empty argv array' }
    }

    const args = ['run', '--rm', '--read-only']
    if (!network) args.push('--network', 'none')
    if (mountCwd) args.push('-v', `${cwd}:/work:ro`, '-w', '/work')
    for (const [k, v] of Object.entries(env)) args.push('-e', `${k}=${v}`)
    args.push(image, ...command)

    const { stdout, stderr, exitCode } = await runCommand('docker', args, { timeoutMs: timeout })
    const output = truncate([stdout, stderr].filter(Boolean).join('\n'), 16_000)
    return {
      toolCallId: '',
      success: exitCode === 0,
      output: output || '(no output)',
      ...(exitCode !== 0 ? { error: `docker exited with ${exitCode}` } : {}),
    }
  }
}
