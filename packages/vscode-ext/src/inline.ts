import * as vscode from 'vscode'
import { spawn } from 'node:child_process'

const PREFIX_LINES = 80
const SUFFIX_LINES = 20

function sliceContext(document: vscode.TextDocument, position: vscode.Position): { prefix: string; suffix: string } {
  const startLine = Math.max(0, position.line - PREFIX_LINES)
  const endLine = Math.min(document.lineCount - 1, position.line + SUFFIX_LINES)

  const prefixRange = new vscode.Range(new vscode.Position(startLine, 0), position)
  const suffixRange = new vscode.Range(position, new vscode.Position(endLine, document.lineAt(endLine).text.length))

  return {
    prefix: document.getText(prefixRange),
    suffix: document.getText(suffixRange),
  }
}

interface CompleteOptions {
  cliPath: string
  provider?: string
  model?: string
  maxTokens: number
  timeoutMs: number
}

function runComplete(
  prefix: string,
  suffix: string,
  lang: string,
  path: string,
  opts: CompleteOptions,
  token: vscode.CancellationToken,
): Promise<string> {
  return new Promise((resolve) => {
    const args = [
      'complete',
      '--suffix', suffix,
      '--lang', lang,
      '--path', path,
      '--max-tokens', String(opts.maxTokens),
    ]
    if (opts.provider) args.push('--provider', opts.provider)
    if (opts.model) args.push('--model', opts.model)

    const child = spawn(opts.cliPath, args, { stdio: ['pipe', 'pipe', 'pipe'] })

    let out = ''
    let err = ''
    let settled = false

    const timer = setTimeout(() => {
      if (!settled) { settled = true; child.kill(); resolve('') }
    }, opts.timeoutMs)

    const cancelSub = token.onCancellationRequested(() => {
      if (!settled) { settled = true; clearTimeout(timer); child.kill(); resolve('') }
    })

    child.stdout.on('data', (d: Buffer) => { out += d.toString() })
    child.stderr.on('data', (d: Buffer) => { err += d.toString() })

    child.on('error', () => {
      if (!settled) { settled = true; clearTimeout(timer); cancelSub.dispose(); resolve('') }
    })
    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      cancelSub.dispose()
      if (code !== 0 && err) {
        console.error('[arix complete]', err.slice(0, 200))
      }
      resolve(out)
    })

    child.stdin.write(prefix)
    child.stdin.end()
  })
}

export class ArixInlineProvider implements vscode.InlineCompletionItemProvider {
  private debounceTimer: NodeJS.Timeout | undefined
  private inflight: vscode.CancellationTokenSource | undefined

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken,
  ): Promise<vscode.InlineCompletionItem[] | undefined> {
    const config = vscode.workspace.getConfiguration('arix')
    if (!config.get<boolean>('inlineCompletions.enabled', false)) return

    // Skip empty / pure-whitespace lines on automatic invocation
    const linePrefix = document.lineAt(position.line).text.slice(0, position.character)
    if (linePrefix.trim().length < 2 && _context.triggerKind === vscode.InlineCompletionTriggerKind.Automatic) {
      return
    }

    const debounceMs = config.get<number>('inlineCompletions.debounceMs', 350)
    await new Promise<void>((r) => {
      if (this.debounceTimer) clearTimeout(this.debounceTimer)
      this.debounceTimer = setTimeout(r, debounceMs)
    })
    if (token.isCancellationRequested) return

    // Cancel any inflight request
    this.inflight?.cancel()
    const cts = new vscode.CancellationTokenSource()
    this.inflight = cts
    token.onCancellationRequested(() => cts.cancel())

    const { prefix, suffix } = sliceContext(document, position)
    if (!prefix.trim()) return

    const cliPath = config.get<string>('cliPath', 'arix')
    const opts: CompleteOptions = {
      cliPath,
      maxTokens: config.get<number>('inlineCompletions.maxTokens', 80),
      timeoutMs: config.get<number>('inlineCompletions.timeoutMs', 4000),
    }
    const provider = config.get<string>('inlineCompletions.provider')
    const model = config.get<string>('inlineCompletions.model')
    if (provider) opts.provider = provider
    if (model) opts.model = model

    const completion = await runComplete(
      prefix,
      suffix,
      document.languageId,
      vscode.workspace.asRelativePath(document.uri),
      opts,
      cts.token,
    )

    if (cts.token.isCancellationRequested || !completion.trim()) return

    return [new vscode.InlineCompletionItem(completion, new vscode.Range(position, position))]
  }
}
