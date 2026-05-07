/**
 * screenshot (N3) — capture a screenshot of the user's screen and save to a
 * file. Returns an absolute path that vision-capable models can reference.
 *
 * Uses platform built-ins:
 *   macOS  →  `screencapture`
 *   Linux  →  `grim` (Wayland) or `import` (X11/ImageMagick)
 *   Windows→  PowerShell + System.Drawing
 */

import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { existsSync } from 'node:fs'
import type { Tool, ToolResult } from '@arix-code/core'
import { runCommand } from '../shell/exec.js'

export class ScreenshotTool implements Tool {
  readonly name = 'screenshot'
  readonly description =
    "Capture the user's screen to a PNG and return its absolute path. Optional `region` for partial capture (macOS only)."
  readonly requiresConfirmation = true
  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      path:   { type: 'string', description: 'Output PNG path (default: tmpdir)' },
      region: { type: 'boolean', description: 'macOS: prompt user to select a region' },
    },
  }

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const out = (input['path'] as string | undefined) ?? join(tmpdir(), `arix-screenshot-${Date.now()}.png`)
    const region = (input['region'] as boolean | undefined) ?? false

    if (process.platform === 'darwin') {
      const args = region ? ['-i', '-x', out] : ['-x', out]
      const r = await runCommand('screencapture', args, { timeoutMs: 60_000 })
      if (r.exitCode !== 0) return { toolCallId: '', success: false, output: '', error: r.stderr || `screencapture exit ${r.exitCode}` }
      return existsSync(out)
        ? { toolCallId: '', success: true, output: out }
        : { toolCallId: '', success: false, output: '', error: 'capture cancelled' }
    }

    if (process.platform === 'linux') {
      if (process.env['WAYLAND_DISPLAY']) {
        const r = await runCommand('grim', [out], { timeoutMs: 30_000 })
        if (r.exitCode !== 0) return { toolCallId: '', success: false, output: '', error: 'install `grim` for Wayland screenshots' }
      } else {
        const r = await runCommand('import', ['-window', 'root', out], { timeoutMs: 30_000 })
        if (r.exitCode !== 0) return { toolCallId: '', success: false, output: '', error: 'install ImageMagick (`import`) for X11 screenshots' }
      }
      return { toolCallId: '', success: true, output: out }
    }

    if (process.platform === 'win32') {
      const ps = `Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; ` +
        `$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds; ` +
        `$bmp = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height; ` +
        `$g = [System.Drawing.Graphics]::FromImage($bmp); ` +
        `$g.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size); ` +
        `$bmp.Save("${out.replace(/\\/g, '\\\\')}", [System.Drawing.Imaging.ImageFormat]::Png)`
      const r = await runCommand('powershell', ['-NoProfile', '-Command', ps], { timeoutMs: 30_000 })
      if (r.exitCode !== 0) return { toolCallId: '', success: false, output: '', error: r.stderr }
      return { toolCallId: '', success: true, output: out }
    }

    return { toolCallId: '', success: false, output: '', error: `Screenshot not supported on ${process.platform}` }
  }
}
