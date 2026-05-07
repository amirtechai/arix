import type { Tool, ToolResult } from '@arix-code/core'
import { runCommand } from '../shell/exec.js'

interface ClipboardCmd { read: { cmd: string; args: string[] }; write: { cmd: string; args: string[] } }

function pickBackend(): ClipboardCmd | null {
  if (process.platform === 'darwin') return { read: { cmd: 'pbpaste', args: [] }, write: { cmd: 'pbcopy', args: [] } }
  if (process.platform === 'linux') {
    if (process.env['WAYLAND_DISPLAY']) return { read: { cmd: 'wl-paste', args: [] }, write: { cmd: 'wl-copy', args: [] } }
    return { read: { cmd: 'xclip', args: ['-selection', 'clipboard', '-o'] }, write: { cmd: 'xclip', args: ['-selection', 'clipboard'] } }
  }
  if (process.platform === 'win32') {
    return { read: { cmd: 'powershell', args: ['-NoProfile', '-Command', 'Get-Clipboard'] }, write: { cmd: 'clip', args: [] } }
  }
  return null
}

export class ClipboardReadTool implements Tool {
  readonly name = 'clipboard_read'
  readonly description = 'Read the current OS clipboard contents (text)'
  readonly requiresConfirmation = false
  readonly inputSchema = { type: 'object' as const, properties: {} }

  async execute(_input: Record<string, unknown>): Promise<ToolResult> {
    const b = pickBackend()
    if (!b) return { toolCallId: '', success: false, output: '', error: 'Clipboard not supported on this platform' }
    const { stdout, stderr, exitCode } = await runCommand(b.read.cmd, b.read.args, { timeoutMs: 5_000 })
    if (exitCode !== 0) return { toolCallId: '', success: false, output: '', error: stderr || `${b.read.cmd} exit ${exitCode}` }
    return { toolCallId: '', success: true, output: stdout }
  }
}

export class ClipboardWriteTool implements Tool {
  readonly name = 'clipboard_write'
  readonly description = 'Write text to the OS clipboard'
  readonly requiresConfirmation = true
  readonly inputSchema = {
    type: 'object' as const,
    properties: { content: { type: 'string' } },
    required: ['content'],
  }

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const content = input['content'] as string
    const b = pickBackend()
    if (!b) return { toolCallId: '', success: false, output: '', error: 'Clipboard not supported on this platform' }

    return new Promise((resolve_) => {
      const { spawn } = require('node:child_process') as typeof import('node:child_process')
      const child = spawn(b.write.cmd, b.write.args, { stdio: ['pipe', 'ignore', 'pipe'] })
      let err = ''
      child.stderr.on('data', (d: Buffer) => { err += d.toString() })
      child.on('error', (e) => resolve_({ toolCallId: '', success: false, output: '', error: e.message }))
      child.on('close', (code) => {
        if (code === 0) resolve_({ toolCallId: '', success: true, output: `Copied ${content.length} chars` })
        else            resolve_({ toolCallId: '', success: false, output: '', error: err || `exit ${code}` })
      })
      child.stdin.end(content)
    })
  }
}
