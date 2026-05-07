import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export interface RunResult {
  stdout: string
  stderr: string
  exitCode: number
}

const MAX_OUTPUT = 200 * 1024

/** Run a binary with args (no shell). Captures stdout/stderr/exit cleanly. */
export async function runCommand(
  cmd: string,
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number } = {},
): Promise<RunResult> {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, {
      cwd: opts.cwd,
      env: opts.env ?? process.env,
      timeout: opts.timeoutMs ?? 60_000,
      maxBuffer: MAX_OUTPUT,
    })
    return { stdout, stderr, exitCode: 0 }
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; code?: number; message?: string }
    return {
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? e.message ?? '',
      exitCode: typeof e.code === 'number' ? e.code : 1,
    }
  }
}

export function truncate(s: string, max = 8000): string {
  return s.length <= max ? s : s.slice(0, max) + `\n[truncated, ${s.length - max} bytes omitted]`
}
