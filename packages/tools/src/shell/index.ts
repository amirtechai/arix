import { spawn } from 'node:child_process'
import { resolve, sep } from 'node:path'
import { parse as parseShell } from 'shell-quote'
import { ArixError } from '@arix/core'
import type { Tool, ToolResult } from '@arix/core'

const MAX_OUTPUT_BYTES = 50 * 1024 // 50KB
const DEFAULT_TIMEOUT = 30_000
const MAX_TIMEOUT = 120_000

// Patterns that are always blocked, regardless of permission mode
const BLOCKLIST: RegExp[] = [
  /rm\s+-[rf]+\s+\/($|\s)/,          // rm -rf /
  /rm\s+-[rf]+\s+~($|\s)/,           // rm -rf ~
  /\bsudo\b/,                          // any sudo usage
  /curl\s+.*\|\s*(ba)?sh/,            // curl | sh
  /wget\s+.*\|\s*(ba)?sh/,            // wget | sh
  /chmod\s+-R\s+777\s+\//,           // chmod -R 777 /
  /\bdd\s+if=.*of=\/dev\//,          // dd to device
  /\bmkfs\b/,                          // mkfs any variant
  /:\(\)\s*\{\s*:\|:&\s*\}/,         // fork bomb
]

// Env vars to strip when executing shell commands
const SENSITIVE_ENV_RE = /KEY|SECRET|TOKEN|PASS/i

function assertNotBlocked(command: string): void {
  for (const pattern of BLOCKLIST) {
    if (pattern.test(command)) {
      throw new ArixError('SHELL_BLOCKED', `Command blocked by security policy: ${command}`)
    }
  }
}

function sanitizeEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (!SENSITIVE_ENV_RE.test(key)) {
      env[key] = value
    }
  }
  return env
}

export class ShellExecTool implements Tool {
  readonly name = 'shell_exec'
  readonly description = 'Execute a shell command in the working directory'
  readonly requiresConfirmation = true
  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      command: { type: 'string', description: 'Shell command to execute' },
      cwd: { type: 'string', description: 'Working directory (must be within allowed paths)' },
      timeout: { type: 'number', description: 'Timeout in milliseconds (max 120000)' },
    },
    required: ['command'],
  }

  constructor(private readonly allowedPaths: string[]) {}

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const command = input['command'] as string
    const cwdInput = input['cwd'] as string | undefined
    const timeoutMs = Math.min((input['timeout'] as number | undefined) ?? DEFAULT_TIMEOUT, MAX_TIMEOUT)

    assertNotBlocked(command)

    const cwd = cwdInput ? resolve(cwdInput) : resolve(this.allowedPaths[0] ?? process.cwd())

    // Validate cwd is within allowed paths
    const allowed = this.allowedPaths.some((p) => {
      const base = resolve(p)
      return cwd === base || cwd.startsWith(base + sep)
    })
    if (!allowed) {
      throw new ArixError('PATH_FORBIDDEN', `Working directory not allowed: ${cwd}`)
    }

    // Parse command safely to prevent shell injection via concatenation
    const parsed = parseShell(command)
    const args = parsed.filter((a): a is string => typeof a === 'string')
    if (args.length === 0) {
      return { toolCallId: '', success: false, output: '', error: 'Empty command' }
    }

    const [cmd, ...rest] = args as [string, ...string[]]

    return new Promise((resolve_) => {
      let output = ''
      let truncated = false
      let timedOut = false

      const child = spawn(cmd, rest, {
        cwd,
        env: sanitizeEnv(),
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
      })

      const timer = setTimeout(() => {
        timedOut = true
        child.kill('SIGTERM')
      }, timeoutMs)

      const appendOutput = (data: Buffer) => {
        if (truncated) return
        const chunk = data.toString()
        if (output.length + chunk.length > MAX_OUTPUT_BYTES) {
          output += chunk.slice(0, MAX_OUTPUT_BYTES - output.length)
          output += '\n[Output truncated at 50KB]'
          truncated = true
        } else {
          output += chunk
        }
      }

      child.stdout.on('data', appendOutput)
      child.stderr.on('data', appendOutput)

      child.on('close', (code) => {
        clearTimeout(timer)
        if (timedOut) {
          resolve_({
            toolCallId: '',
            success: false,
            output,
            error: `Command timed out after ${timeoutMs}ms`,
          })
        } else {
          resolve_({
            toolCallId: '',
            success: code === 0,
            output,
            ...(code !== 0 ? { error: `Exit code ${code}` } : {}),
          })
        }
      })

      child.on('error', (err) => {
        clearTimeout(timer)
        resolve_({ toolCallId: '', success: false, output: '', error: err.message })
      })
    })
  }
}
