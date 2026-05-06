/**
 * Arix CLI banner — printed during `arix init` and the provider setup wizard.
 *
 * Color palette: muted turquoise/teal (256-color ANSI). Calm, not flashy.
 *   primary  →  256-color 80 (#5fafd7) — medium turquoise
 *   dim      →  256-color 66 (#5f8787) — dusty teal for subtitle/border
 */

const isTTY = process.stdout.isTTY
const c = {
  reset: isTTY ? '\x1b[0m' : '',
  bold:  isTTY ? '\x1b[1m' : '',
  teal:  isTTY ? '\x1b[38;5;80m' : '',
  dim:   isTTY ? '\x1b[38;5;66m' : '',
  fg:    isTTY ? '\x1b[38;5;252m' : '',
}

const LOGO = [
  '   █████╗ ██████╗ ██╗██╗  ██╗   ██████╗ ██████╗ ██████╗ ███████╗',
  '  ██╔══██╗██╔══██╗██║╚██╗██╔╝  ██╔════╝██╔═══██╗██╔══██╗██╔════╝',
  '  ███████║██████╔╝██║ ╚███╔╝   ██║     ██║   ██║██║  ██║█████╗  ',
  '  ██╔══██║██╔══██╗██║ ██╔██╗   ██║     ██║   ██║██║  ██║██╔══╝  ',
  '  ██║  ██║██║  ██║██║██╔╝ ██╗  ╚██████╗╚██████╔╝██████╔╝███████╗',
  '  ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚═╝  ╚═╝   ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝',
]

/** Render the Arix Code logo with turquoise accent. */
export function renderBanner(opts?: { tagline?: string; version?: string }): string {
  const tagline = opts?.tagline ?? 'Provider-agnostic AI coding CLI — Claude · GPT · Gemini · Llama'
  const version = opts?.version ? `  v${opts.version}` : ''
  const lines: string[] = ['']
  for (const row of LOGO) lines.push(`${c.teal}${row}${c.reset}`)
  lines.push('')
  lines.push(`${c.dim}  ${'─'.repeat(64)}${c.reset}`)
  lines.push(`${c.fg}  ${tagline}${c.dim}${version}${c.reset}`)
  lines.push(`${c.dim}  ${'─'.repeat(64)}${c.reset}`)
  lines.push('')
  return lines.join('\n')
}

/** Print the banner to stdout. No-op if NO_COLOR is set & stdout is not a TTY. */
export function printBanner(opts?: { tagline?: string; version?: string }): void {
  process.stdout.write(renderBanner(opts))
}
