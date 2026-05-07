/**
 * arix chat — interactive REPL + single-shot message
 *
 * Features:
 *   - Streaming markdown rendering (bold, code, headers)
 *   - Tool execution with timing
 *   - REPL history (~/.arix/history.txt)
 *   - Built-in /commands: /model, /cost, /clear, /memory, /save, /help
 *   - --continue: resumes latest session automatically
 */

import type { Command } from 'commander'
import { createInterface } from 'node:readline'
import { appendFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { bootstrap } from '../bootstrap.js'
import { buildFileContext } from '../file-context.js'
import { classifyTask } from '../task-classifier.js'
import type { AgentEvent, Session } from '@arix-code/core'
import { CostTracker, ProjectMemory, ModelCatalogue } from '@arix-code/core'

const HISTORY_FILE = join(homedir(), '.arix', 'history.txt')
const MAX_HISTORY = 500

// ── ANSI helpers ────────────────────────────────────────────────────────────

const isTTY = process.stdout.isTTY

const c = {
  reset:   isTTY ? '\x1b[0m'  : '',
  bold:    isTTY ? '\x1b[1m'  : '',
  dim:     isTTY ? '\x1b[2m'  : '',
  cyan:    isTTY ? '\x1b[36m' : '',
  green:   isTTY ? '\x1b[32m' : '',
  yellow:  isTTY ? '\x1b[33m' : '',
  red:     isTTY ? '\x1b[31m' : '',
  blue:    isTTY ? '\x1b[34m' : '',
  magenta: isTTY ? '\x1b[35m' : '',
  gray:    isTTY ? '\x1b[90m' : '',
}

/** Light markdown rendering for terminal output. */
function renderMarkdown(text: string): string {
  if (!isTTY) return text
  return text
    // Code blocks (```...```)
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_, _lang, code) =>
      `${c.gray}┌─────────────────────────────────────────┐${c.reset}\n` +
      code.split('\n').map((l: string) => `${c.gray}│${c.reset} ${c.cyan}${l}${c.reset}`).join('\n') + '\n' +
      `${c.gray}└─────────────────────────────────────────┘${c.reset}`)
    // Inline code
    .replace(/`([^`]+)`/g, `${c.cyan}$1${c.reset}`)
    // Bold
    .replace(/\*\*([^*]+)\*\*/g, `${c.bold}$1${c.reset}`)
    // Headers
    .replace(/^### (.+)$/gm, `${c.bold}${c.blue}$1${c.reset}`)
    .replace(/^## (.+)$/gm, `${c.bold}${c.magenta}$1${c.reset}`)
    .replace(/^# (.+)$/gm, `${c.bold}${c.cyan}$1${c.reset}`)
    // Bullet points
    .replace(/^- (.+)$/gm, `  ${c.dim}•${c.reset} $1`)
}

// ── History management ───────────────────────────────────────────────────────

async function loadHistory(): Promise<string[]> {
  try {
    const content = await readFile(HISTORY_FILE, 'utf8')
    return content.trim().split('\n').filter(Boolean).slice(-MAX_HISTORY)
  } catch {
    return []
  }
}

async function appendHistory(line: string): Promise<void> {
  if (!line.trim() || line.startsWith('/')) return
  try {
    await appendFile(HISTORY_FILE, line + '\n')
  } catch { /* non-fatal */ }
}

// ── REPL commands ────────────────────────────────────────────────────────────

function printHelp(): void {
  process.stdout.write(`
${c.bold}Arix REPL Commands:${c.reset}
  ${c.cyan}/help${c.reset}              Show this help
  ${c.cyan}/model${c.reset}             Show current model
  ${c.cyan}/model suggest${c.reset}     Analyze last message and suggest best model
  ${c.cyan}/cost${c.reset}              Show session cost
  ${c.cyan}/memory${c.reset}            Show project memory facts
  ${c.cyan}/clear${c.reset}             Clear terminal screen
  ${c.cyan}/save${c.reset}              Force save session
  ${c.cyan}/sessions${c.reset}          List recent sessions (resume with arix --resume <id>)
  ${c.cyan}/exit${c.reset}              Exit (also Ctrl+C)

`)
}

// ── Tool input preview ───────────────────────────────────────────────────────

const PREVIEW_KEYS = ['path', 'file_path', 'command', 'pattern', 'query', 'url', 'content'] as const
const PREVIEW_MAX = 50

export function toolInputPreview(name: string, input: Record<string, unknown>): string {
  void name
  for (const key of PREVIEW_KEYS) {
    const val = input[key]
    if (typeof val === 'string' && val.length > 0) {
      return val.length > PREVIEW_MAX ? val.slice(0, PREVIEW_MAX) + '...' : val
    }
  }
  return ''
}

// ── Event renderer ──────────────────────────────────────────────────────────

interface RenderState {
  buffer: string
  inCodeBlock: boolean
  toolStart: number
  thinking: boolean
  spinnerTimer: ReturnType<typeof setInterval> | null
}

const SPINNER = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏']

function startSpinner(s: RenderState): void {
  if (!isTTY || s.spinnerTimer !== null) return
  let frame = 0
  s.thinking = true
  s.spinnerTimer = setInterval(() => {
    process.stdout.write(`\r${c.gray}${SPINNER[frame++ % SPINNER.length]} thinking...${c.reset}`)
  }, 80)
}

function stopSpinner(s: RenderState): void {
  if (s.spinnerTimer !== null) {
    clearInterval(s.spinnerTimer)
    s.spinnerTimer = null
    if (isTTY) process.stdout.write('\r\x1b[K')
  }
  s.thinking = false
}

export function createRenderer(): {
  onEvent: (e: AgentEvent, state: RenderState) => void
  state: RenderState
} {
  const state: RenderState = { buffer: '', inCodeBlock: false, toolStart: 0, thinking: false, spinnerTimer: null }

  const onEvent = (e: AgentEvent, s: RenderState): void => {
    switch (e.type) {
      case 'text':
        stopSpinner(s)
        s.buffer += e.chunk
        // Flush completed lines with rendering
        const lines = s.buffer.split('\n')
        for (let i = 0; i < lines.length - 1; i++) {
          process.stdout.write(renderMarkdown(lines[i]!) + '\n')
        }
        s.buffer = lines[lines.length - 1] ?? ''
        break

      case 'tool_start': {
        if (s.buffer) { process.stdout.write(renderMarkdown(s.buffer) + '\n'); s.buffer = '' }
        const preview = toolInputPreview(e.call.name, e.call.input as Record<string, unknown>)
        const previewStr = preview ? ` ${c.gray}(${preview})${c.reset}` : ''
        process.stdout.write(`${c.gray}  ▶ ${c.cyan}${e.call.name}${c.reset}${previewStr}${c.gray}...${c.reset}`)
        s.toolStart = Date.now()
        break
      }

      case 'tool_result': {
        const ms = Date.now() - s.toolStart
        const icon = e.result.success !== false ? `${c.green}✓${c.reset}` : `${c.red}✗${c.reset}`
        process.stdout.write(` ${icon}${c.gray} (${ms}ms)${c.reset}\n`)
        if (e.result.error) {
          process.stdout.write(`${c.red}  Error: ${e.result.error}${c.reset}\n`)
        }
        break
      }

      case 'done':
        stopSpinner(s)
        if (s.buffer) { process.stdout.write(renderMarkdown(s.buffer)); s.buffer = '' }
        process.stdout.write('\n')
        break

      case 'error':
        stopSpinner(s)
        if (s.buffer) { process.stdout.write(renderMarkdown(s.buffer) + '\n'); s.buffer = '' }
        process.stderr.write(`\n${c.red}Error: ${e.error}${c.reset}\n`)
        break
    }
  }

  return { onEvent, state }
}

// ── Memory extraction at session end ─────────────────────────────────────────

async function maybeExtractMemory(
  session: Session,
  cwd: string,
  loop: { run(msg: string): AsyncGenerator<AgentEvent> },
): Promise<void> {
  // Only extract if we had a meaningful session (at least 3 messages)
  if (session.messages.length < 3) return

  const summary = session.messages
    .slice(-10)  // last 10 messages for context
    .map((m) => `${m.role}: ${typeof m.content === 'string' ? m.content.slice(0, 200) : '[tool calls]'}`)
    .join('\n')

  const prompt = ProjectMemory.extractionPrompt(summary)
  let jsonResponse = ''

  try {
    for await (const event of loop.run(prompt)) {
      if (event.type === 'text') jsonResponse += event.chunk
    }
  } catch {
    return
  }

  const mem = new ProjectMemory(cwd)
  await mem.load()
  const count = mem.applyExtracted(jsonResponse)
  if (count > 0) await mem.save(cwd)
}

// ── Main command ─────────────────────────────────────────────────────────────

export function registerChat(program: Command): void {
  program
    .command('chat [message]')
    .description('Start a chat session (omit message for interactive REPL)')
    .option('-p, --provider <provider>', 'Override provider')
    .option('-m, --model <model>', 'Override model')
    .option('-s, --skill <skill>', 'Use a specific skill for this session')
    .option('-r, --resume [id]', 'Resume a previous session by ID prefix (no id = interactive picker)')
    .option('-c, --continue', 'Resume the most recent session')
    .option('--auto', 'Auto-select model based on task complexity')
    .option('--profile <name>', 'Model profile: budget | power | local')
    .option('--budget <usd>', 'Stop after spending this many USD')
    .option('-f, --file <path>', 'Add file to context (repeatable)', collect, [])
    .option('-d, --dir <path>', 'Add directory to context (repeatable)', collect, [])
    .option('--git-diff', 'Add git-changed files to context automatically')
    .option('--no-session', 'Do not persist session')
    .action(async (message: string | undefined, opts: Record<string, unknown>) => {
      const cwd = process.cwd()
      const skillName = opts['skill'] as string | undefined
      const providerOpt = opts['provider'] as string | undefined
      const modelOpt = opts['model'] as string | undefined
      const continueLatest = opts['continue'] as boolean | undefined
      const autoModel = opts['auto'] as boolean | undefined
      const profileOpt = opts['profile'] as string | undefined
      const budgetUsd = opts['budget'] ? parseFloat(opts['budget'] as string) : undefined
      const fileArgs = opts['file'] as string[]
      const dirArgs = opts['dir'] as string[]
      const useGitDiff = opts['gitDiff'] as boolean | undefined

      // --resume can be: undefined (not passed), true (passed without id), or string (id prefix)
      const resumeOpt = opts['resume'] as string | boolean | undefined
      let resumeId: string | undefined =
        typeof resumeOpt === 'string' ? resumeOpt : undefined
      const resumeInteractive = resumeOpt === true

      // Build file context before bootstrap so it can be appended to system prompt
      const hasFileContext = fileArgs.length > 0 || dirArgs.length > 0 || useGitDiff
      const fileCtx = hasFileContext
        ? await buildFileContext({ files: fileArgs, dirs: dirArgs, ...(useGitDiff !== undefined ? { gitDiff: useGitDiff } : {}), cwd })
        : null

      const { loop, sessionManager, configManager, mcpRegistry, resolvedModel, resolvedProvider } = await bootstrap(cwd, undefined, {
        ...(skillName !== undefined ? { skill: skillName } : {}),
        ...(providerOpt !== undefined ? { provider: providerOpt } : {}),
        ...(modelOpt !== undefined ? { model: modelOpt } : {}),
        ...(autoModel ? { autoModel: true, autoTier: 'medium' } : {}),
        ...(profileOpt ? { profile: profileOpt as 'budget' | 'power' | 'local' } : {}),
        ...(message ? { initialPrompt: message } : {}),
        ...(fileCtx?.content ? { extraSystemPrompt: fileCtx.content } : {}),
      })
      const _config = await configManager.load()

      // --continue: find most recent session
      if (continueLatest && resumeId === undefined && !resumeInteractive) {
        const all = await sessionManager.list()
        if (all.length > 0) {
          resumeId = all[0]!.id.slice(0, 8)
        }
      }

      // --resume without id: interactive picker
      if (resumeInteractive && resumeId === undefined) {
        const sessions = await sessionManager.list()
        if (sessions.length === 0) {
          process.stderr.write(`${c.yellow}No saved sessions to resume.${c.reset}\n`)
          process.exitCode = 1
          return
        }
        const top = sessions.slice(0, 10)
        process.stdout.write(`\n${c.bold}Recent Sessions:${c.reset}\n`)
        top.forEach((s, i) => {
          const date = new Date(s.updatedAt).toLocaleString()
          process.stdout.write(
            `  ${c.cyan}${String(i + 1).padStart(2)}${c.reset}  ` +
            `${c.gray}${s.id.slice(0, 8)}${c.reset}  ${s.title.padEnd(45)}  ${c.gray}${date}${c.reset}\n`,
          )
        })
        const rl = createInterface({ input: process.stdin, output: process.stdout })
        const ans = await new Promise<string>((res) =>
          rl.question(`\n${c.green}Select [1-${top.length}] (Enter to cancel):${c.reset} `, res),
        )
        rl.close()
        const n = parseInt(ans.trim(), 10)
        if (!Number.isFinite(n) || n < 1 || n > top.length) {
          process.stdout.write(`${c.gray}Cancelled.${c.reset}\n`)
          return
        }
        resumeId = top[n - 1]!.id.slice(0, 8)
      }

      // Resolve resume session
      let initialSession
      if (resumeId !== undefined) {
        const matches = await sessionManager.find(resumeId)
        if (matches.length === 0) {
          process.stderr.write(`No session found matching: ${resumeId}\n`)
          process.exitCode = 1
          return
        }
        if (matches.length > 1) {
          process.stderr.write(`Ambiguous session ID "${resumeId}" — be more specific\n`)
          process.exitCode = 1
          return
        }
        initialSession = matches[0]
      }

      const provider = resolvedProvider
      const model = resolvedModel

      const session = initialSession ?? await sessionManager.create({
        cwd,
        provider,
        model,
      })
      const costTracker = new CostTracker(provider, model, session.id)

      if (initialSession !== undefined) {
        process.stdout.write(`${c.gray}Resuming: ${session.title}${c.reset}\n\n`)
      }

      if (fileCtx && fileCtx.fileCount > 0) {
        const truncNote = fileCtx.truncated ? ` ${c.yellow}(truncated to ~20k tokens)${c.reset}` : ''
        process.stdout.write(
          `${c.gray}Context: ${c.cyan}${fileCtx.fileCount} file${fileCtx.fileCount !== 1 ? 's' : ''}${c.reset}` +
          ` ${c.gray}(~${Math.round(fileCtx.totalChars / 4).toLocaleString()} tokens)${c.reset}${truncNote}\n\n`
        )
      }

      const { onEvent, state } = createRenderer()

      type BudgetStatus = 'ok' | 'warning' | 'exceeded'
      const checkBudget = (): BudgetStatus => {
        if (budgetUsd === undefined) return 'ok'
        const spent = costTracker.summary().totalUsd ?? 0
        if (spent >= budgetUsd) return 'exceeded'
        if (spent >= budgetUsd * 0.8) return 'warning'
        return 'ok'
      }

      const runMessage = async (msg: string): Promise<void> => {
        if (session.messages.length === 0) {
          session.title = sessionManager.generateTitle(msg)
        }
        session.messages.push({ role: 'user', content: msg, timestamp: Date.now() })

        process.stdout.write('\n')
        startSpinner(state)
        let assistantText = ''
        let aborted = false

        const gen = loop.run(msg)
        const sigintHandler = (): void => {
          aborted = true
          stopSpinner(state)
          void gen.return(undefined)
          process.stdout.write(`\n${c.yellow}↩ Aborted${c.reset}\n`)
        }
        process.once('SIGINT', sigintHandler)

        try {
          for await (const event of gen) {
            onEvent(event, state)
            if (event.type === 'text') assistantText += event.chunk

            if (event.type === 'tool_confirm') {
              const rl = createInterface({ input: process.stdin, output: process.stdout })
              const answer = await new Promise<string>((resolve) =>
                rl.question(`\n${c.yellow}Allow ${event.request.tool}?${c.reset} [y/N] `, resolve),
              )
              rl.close()
              event.request.resolve(answer.toLowerCase() === 'y')
            }
          }
        } finally {
          process.off('SIGINT', sigintHandler)
        }

        if (aborted) return

        if (assistantText) {
          session.messages.push({ role: 'assistant', content: assistantText, timestamp: Date.now() })
        }
        if (opts['session'] !== false) {
          await sessionManager.save(session)
        }
        await appendHistory(msg)
      }

      // Single-shot mode
      if (message) {
        await runMessage(message)
        if (isTTY) {
          const summary = costTracker.format()
          if (summary) {
            const budgetSuffix = budgetUsd !== undefined
              ? ` ${c.gray}/ $${budgetUsd.toFixed(2)} budget${c.reset}`
              : ''
            process.stdout.write(`${c.gray}${summary}${c.reset}${budgetSuffix}\n`)
          }
        }
        await maybeExtractMemory(session, cwd, loop)
        mcpRegistry.disconnectAll()
        return
      }

      // Interactive REPL
      const history = await loadHistory()
      const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true,
        history,
        historySize: MAX_HISTORY,
        removeHistoryDuplicates: true,
      })

      const budgetInfo = budgetUsd !== undefined ? ` ${c.yellow}· budget $${budgetUsd.toFixed(2)}${c.reset}` : ''
      process.stdout.write(
        `${c.bold}${c.cyan}Arix${c.reset} ${c.gray}(${model})${c.reset}${budgetInfo} — type ${c.cyan}/help${c.reset} for commands, Ctrl+C to exit\n\n`
      )

      const prompt = (): void => {
        rl.question(`${c.green}>${c.reset} `, async (input) => {
          const trimmed = input.trim()
          if (!trimmed) { prompt(); return }

          // Handle /commands
          if (trimmed.startsWith('/')) {
            const [cmd, ...args] = trimmed.slice(1).split(' ')
            switch (cmd) {
              case 'help':
                printHelp()
                break
              case 'model':
                if (args[0] === 'suggest') {
                  // Classify last user message and suggest best model
                  const lastUserMsg = session.messages.filter((m) => m.role === 'user').at(-1)
                  const msgText = lastUserMsg
                    ? typeof lastUserMsg.content === 'string' ? lastUserMsg.content : '[tool result]'
                    : trimmed
                  const cls = classifyTask(msgText)
                  const suggested = ModelCatalogue.recommend({
                    tier: cls.type === 'planning' ? 'complex' : cls.type === 'simple' ? 'simple' : 'medium',
                    providers: [provider],
                    requireTools: true,
                  })
                  process.stdout.write(
                    `\n${c.bold}Task Analysis:${c.reset}\n` +
                    `  Type      : ${c.cyan}${cls.type}${c.reset}  (${c.gray}${cls.reason}${c.reset})\n` +
                    `  Current   : ${c.cyan}${model}${c.reset}\n` +
                    (suggested && suggested.id !== model
                      ? `  Suggested : ${c.green}${suggested.id}${c.reset} (${c.gray}${suggested.tier} tier, $${suggested.pricing?.input.toFixed(3) ?? 'free'}/M tokens${c.reset})\n` +
                        `  ${c.dim}To switch: restart with \`arix chat --profile power\` or \`-m ${suggested.id}\`${c.reset}\n`
                      : `  ${c.green}✓ Current model is appropriate for this task type${c.reset}\n`)
                  )
                } else if (args[0]) {
                  process.stdout.write(`${c.yellow}Model switching mid-session not yet supported. Start new session with -m${c.reset}\n`)
                } else {
                  const profileLabel = profileOpt ? ` ${c.yellow}[${profileOpt} profile]${c.reset}` : ''
                  process.stdout.write(`${c.gray}Current model: ${c.cyan}${model}${c.reset}${profileLabel}\n`)
                }
                break
              case 'cost': {
                const s = costTracker.summary()
                process.stdout.write(
                  `${c.gray}Session cost: ${c.yellow}$${s.totalUsd?.toFixed(6) ?? '0'}${c.reset}` +
                  ` ${c.gray}| ${s.turns} turns | ${s.totalInputTokens}↑ ${s.totalOutputTokens}↓ tokens${c.reset}\n`
                )
                break
              }
              case 'memory': {
                const { ProjectMemory } = await import('@arix-code/core')
                const mem = new ProjectMemory(cwd)
                await mem.load()
                if (mem.size === 0) {
                  process.stdout.write(`${c.gray}No project memory yet.${c.reset}\n`)
                } else {
                  process.stdout.write(`\n${c.bold}Project Memory (${mem.size} facts):${c.reset}\n`)
                  for (const f of mem.facts) {
                    const conf = '●'.repeat(Math.min(f.confidence, 5)) + '○'.repeat(Math.max(0, 5 - f.confidence))
                    process.stdout.write(`  ${c.gray}[${conf}]${c.reset} ${c.cyan}${f.key}${c.reset}: ${f.value}\n`)
                  }
                  process.stdout.write('\n')
                }
                break
              }
              case 'clear':
                process.stdout.write('\x1b[2J\x1b[0f')
                break
              case 'save':
                await sessionManager.save(session)
                process.stdout.write(`${c.green}Session saved: ${session.id.slice(0, 8)}${c.reset}\n`)
                break
              case 'sessions': {
                const sessions = await sessionManager.list()
                if (sessions.length === 0) {
                  process.stdout.write(`${c.gray}No saved sessions.${c.reset}\n`)
                  break
                }
                const top = sessions.slice(0, 10)
                process.stdout.write(`\n${c.bold}Recent Sessions:${c.reset}\n`)
                top.forEach((s, i) => {
                  const date = new Date(s.updatedAt).toLocaleString()
                  const marker = s.id === session.id ? `${c.green}▶${c.reset}` : ' '
                  process.stdout.write(
                    `  ${marker} ${c.cyan}${String(i + 1).padStart(2)}${c.reset}  ` +
                    `${c.gray}${s.id.slice(0, 8)}${c.reset}  ${s.title.padEnd(45)}  ${c.gray}${date}${c.reset}\n`,
                  )
                })
                const pickRl = createInterface({ input: process.stdin, output: process.stdout })
                const ans = await new Promise<string>((res) =>
                  pickRl.question(`\n${c.green}Switch to [1-${top.length}] (Enter to cancel):${c.reset} `, res),
                )
                pickRl.close()
                const n = parseInt(ans.trim(), 10)
                if (!Number.isFinite(n) || n < 1 || n > top.length) {
                  process.stdout.write(`${c.gray}Cancelled.${c.reset}\n\n`)
                  break
                }
                const target = top[n - 1]!
                if (target.id === session.id) {
                  process.stdout.write(`${c.gray}Already on this session.${c.reset}\n\n`)
                  break
                }
                // Save current, then re-launch with the chosen session
                await sessionManager.save(session)
                mcpRegistry.disconnectAll()
                rl.close()
                const { spawn } = await import('node:child_process')
                const child = spawn(process.argv[0]!, [process.argv[1]!, '--resume', target.id.slice(0, 8)], {
                  stdio: 'inherit',
                  detached: false,
                })
                child.on('exit', (code) => process.exit(code ?? 0))
                return
              }
              case 'exit':
              case 'quit':
                process.exit(0)
                break
              default:
                process.stdout.write(`${c.red}Unknown command: /${cmd}. Type /help for list.${c.reset}\n`)
            }
            prompt()
            return
          }

          await runMessage(trimmed)

          // Show cost hint after each turn (dim, unobtrusive)
          const costStr = costTracker.format()
          if (costStr) {
            const _spent = costTracker.summary().totalUsd ?? 0
            const budgetSuffix = budgetUsd !== undefined
              ? ` ${c.gray}/ $${budgetUsd.toFixed(2)}${c.reset}`
              : ''
            process.stdout.write(`${c.gray}${costStr}${c.reset}${budgetSuffix}\n`)
          }

          // Budget enforcement
          const budgetStatus = checkBudget()
          if (budgetStatus === 'exceeded') {
            const spent = costTracker.summary().totalUsd ?? 0
            process.stdout.write(
              `\n${c.red}Budget limit reached: $${spent.toFixed(4)} of $${budgetUsd!.toFixed(2)} spent. Session stopped.${c.reset}\n`
            )
            rl.close()
            return
          }
          if (budgetStatus === 'warning') {
            const spent = costTracker.summary().totalUsd ?? 0
            process.stdout.write(
              `${c.yellow}⚠  Budget: $${spent.toFixed(4)} of $${budgetUsd!.toFixed(2)} used (80%+)${c.reset}\n`
            )
          }

          prompt()
        })
      }

      rl.on('close', async () => {
        if (opts['session'] !== false) await sessionManager.save(session)
        await maybeExtractMemory(session, cwd, loop)
        mcpRegistry.disconnectAll()
        process.stdout.write(`\n${c.gray}Session saved: ${session.id.slice(0, 8)}${c.reset}\n`)
        process.exit(0)
      })

      prompt()
    })
}

function collect(val: string, acc: string[]): string[] {
  acc.push(val)
  return acc
}
