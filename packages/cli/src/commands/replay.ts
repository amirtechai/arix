/**
 * arix replay <sessionId> — turn-by-turn animated replay of a saved session
 * (O5). Useful for sharing a session, demonstrating a workflow, or auditing
 * what an autonomous run actually did.
 */

import type { Command } from 'commander'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { SessionManager } from '@arix-code/core'
import type { ContentBlock, Message } from '@arix-code/core'

const sessionDir = join(homedir(), '.arix', 'sessions')

function flatten(content: Message['content']): { kind: 'text' | 'tool_use' | 'tool_result'; body: string; tool?: string }[] {
  if (typeof content === 'string') return [{ kind: 'text', body: content }]
  return content.map((block: ContentBlock) => {
    if (block.type === 'text')        return { kind: 'text' as const, body: block.text }
    if (block.type === 'tool_use')    return { kind: 'tool_use' as const, body: JSON.stringify(block.input), tool: block.name }
    return { kind: 'tool_result' as const, body: block.output }
  })
}

const COLORS = {
  user:      '\x1b[36m',   // cyan
  assistant: '\x1b[32m',   // green
  tool:      '\x1b[33m',   // yellow
  result:    '\x1b[35m',   // magenta
  dim:       '\x1b[2m',
  reset:     '\x1b[0m',
}

export function registerReplay(program: Command): void {
  program
    .command('replay <sessionId>')
    .description('Turn-by-turn replay of a saved session')
    .option('--speed <n>', 'Char delay in ms (smaller = faster, 0 = instant)', '8')
    .option('--no-color', 'Disable ANSI colours')
    .option('--from <n>', 'Start from message index N')
    .option('--to <n>', 'Stop at message index N')
    .action(async (id: string, opts: { speed: string; color: boolean; from?: string; to?: string }) => {
      const mgr = new SessionManager(sessionDir)
      let session
      try { session = await mgr.load(id) }
      catch { process.stderr.write(`Session not found: ${id}\n`); process.exitCode = 1; return }

      const speed = Math.max(0, parseInt(opts.speed, 10))
      const start = opts.from ? parseInt(opts.from, 10) : 0
      const end = opts.to ? parseInt(opts.to, 10) : session.messages.length
      const c = opts.color ? COLORS : Object.fromEntries(Object.keys(COLORS).map((k) => [k, ''])) as typeof COLORS

      process.stdout.write(`${c.dim}─── replay: ${session.title} (${session.id}) ───${c.reset}\n\n`)

      for (let i = start; i < end; i++) {
        const msg = session.messages[i]
        if (!msg) continue
        const role = msg.role
        const blocks = flatten(msg.content)
        for (const b of blocks) {
          if (b.kind === 'text') {
            const colour = role === 'user' ? c.user : c.assistant
            process.stdout.write(`${colour}${role === 'user' ? '▶ user' : '◀ assistant'}${c.reset}\n`)
            await typeOut(b.body, speed)
          } else if (b.kind === 'tool_use') {
            process.stdout.write(`${c.tool}⚙ tool: ${b.tool}${c.reset}\n${c.dim}${b.body}${c.reset}\n`)
          } else {
            process.stdout.write(`${c.result}↪ result${c.reset}\n${c.dim}${b.body.slice(0, 500)}${b.body.length > 500 ? '…' : ''}${c.reset}\n`)
          }
          process.stdout.write('\n')
        }
      }
      process.stdout.write(`${c.dim}─── end (${end - start} messages) ───${c.reset}\n`)
    })
}

async function typeOut(text: string, msPerChar: number): Promise<void> {
  if (msPerChar === 0) {
    process.stdout.write(text + '\n')
    return
  }
  for (const ch of text) {
    process.stdout.write(ch)
    if (ch === ' ' || ch === '\n' || ch === '.') await sleep(msPerChar)
  }
  process.stdout.write('\n')
}
