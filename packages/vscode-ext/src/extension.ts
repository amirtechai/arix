import * as vscode from 'vscode'
import * as ws from 'ws'
import { ArixSidebarProvider } from './sidebar.js'
import { ArixCodeLensProvider, extractBlockAt } from './codelens.js'
import { ArixInlineProvider } from './inline.js'

// ── WebSocket connection to Arix server ─────────────────────────────────────

let socket: ws.WebSocket | null = null

function getOrCreateSocket(port = 50052): ws.WebSocket {
  if (socket?.readyState === ws.WebSocket.OPEN) return socket
  socket = new ws.WebSocket(`ws://localhost:${port}`)
  socket.on('error', () => { socket = null })
  socket.on('close', () => { socket = null })
  return socket
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getSelectedText(editor: vscode.TextEditor): string {
  const selection = editor.selection
  return editor.document.getText(selection.isEmpty ? undefined : selection)
}

function currentFileContext(editor: vscode.TextEditor): string {
  const lang = editor.document.languageId
  const path = vscode.workspace.asRelativePath(editor.document.uri)
  const text = editor.document.getText()
  return `\`\`\`${lang}\n// ${path}\n${text}\n\`\`\``
}

async function sendToArix(
  prompt: string,
  outputChannel: vscode.OutputChannel,
): Promise<void> {
  const config = vscode.workspace.getConfiguration('arix')
  const provider = config.get<string>('provider', 'anthropic')
  const model = config.get<string>('model', 'claude-sonnet-4-6')

  outputChannel.show()
  outputChannel.appendLine(`\n─── Arix (${model}) ───`)
  outputChannel.appendLine(prompt.slice(0, 200) + (prompt.length > 200 ? '…' : ''))
  outputChannel.appendLine('───────────────────────────')

  try {
    const sock = getOrCreateSocket()
    const payload = JSON.stringify({ prompt, provider, model })

    await new Promise<void>((resolve, reject) => {
      if (sock.readyState !== ws.WebSocket.OPEN) {
        sock.once('open', () => sock.send(payload))
      } else {
        sock.send(payload)
      }

      const onMessage = (data: ws.RawData) => {
        const msg = JSON.parse(data.toString()) as { type: string; chunk?: string; error?: string }
        if (msg.type === 'text' && msg.chunk) {
          outputChannel.append(msg.chunk)
        } else if (msg.type === 'done') {
          outputChannel.appendLine('')
          sock.off('message', onMessage)
          resolve()
        } else if (msg.type === 'error') {
          outputChannel.appendLine(`\nError: ${msg.error}`)
          sock.off('message', onMessage)
          reject(new Error(msg.error))
        }
      }

      sock.on('message', onMessage)
      sock.once('error', reject)
    })
  } catch {
    // Fallback: terminal
    openArixTerminal(prompt)
  }
}

function openArixTerminal(initialPrompt?: string): vscode.Terminal {
  const terminal = vscode.window.createTerminal({
    name: 'Arix',
    iconPath: new vscode.ThemeIcon('sparkle'),
  })
  if (initialPrompt) {
    const escaped = initialPrompt.replace(/"/g, '\\"').replace(/\n/g, ' ')
    terminal.sendText(`arix chat --message "${escaped}"`)
  } else {
    terminal.sendText('arix chat')
  }
  terminal.show()
  return terminal
}

// ── Extension activation ──────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel('Arix')

  // ── Sidebar ──────────────────────────────────────────────────────────────
  const sidebarProvider = new ArixSidebarProvider()
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('arixSidebar', sidebarProvider),
  )

  // ── CodeLens ─────────────────────────────────────────────────────────────
  const codeLensProvider = new ArixCodeLensProvider()
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      ['typescript', 'javascript', 'python', 'go', 'rust', 'java', 'dart', 'swift', 'cpp', 'c'],
      codeLensProvider,
    ),
  )

  // ── Inline completions ───────────────────────────────────────────────────
  const inlineProvider = new ArixInlineProvider()
  context.subscriptions.push(
    vscode.languages.registerInlineCompletionItemProvider({ scheme: 'file' }, inlineProvider),
  )

  // ── Core commands ─────────────────────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand('arix.ask', async () => {
      const editor = vscode.window.activeTextEditor
      if (!editor) { vscode.window.showWarningMessage('Open a file first.'); return }
      const selection = getSelectedText(editor)
      const q = await vscode.window.showInputBox({ prompt: 'Ask Arix:', placeHolder: 'Explain this code...' })
      if (!q) return
      const prompt = selection ? `${q}\n\n\`\`\`\n${selection}\n\`\`\`` : q
      await sendToArix(prompt, outputChannel)
    }),

    vscode.commands.registerCommand('arix.fix', async () => {
      const editor = vscode.window.activeTextEditor
      if (!editor) return
      const selection = getSelectedText(editor)
      if (!selection) { vscode.window.showWarningMessage('Select code to fix.'); return }
      await sendToArix(`Fix this code:\n\n\`\`\`\n${selection}\n\`\`\``, outputChannel)
    }),

    vscode.commands.registerCommand('arix.explain', async () => {
      const editor = vscode.window.activeTextEditor
      if (!editor) return
      const selection = getSelectedText(editor)
      if (!selection) { vscode.window.showWarningMessage('Select code to explain.'); return }
      await sendToArix(`Explain this code:\n\n\`\`\`\n${selection}\n\`\`\``, outputChannel)
    }),

    // ── Terminal integration ────────────────────────────────────────────────

    vscode.commands.registerCommand('arix.open', () => {
      openArixTerminal()
    }),

    vscode.commands.registerCommand('arix.openWithContext', () => {
      const editor = vscode.window.activeTextEditor
      if (!editor) { openArixTerminal(); return }
      const path = vscode.workspace.asRelativePath(editor.document.uri)
      const terminal = vscode.window.createTerminal({
        name: 'Arix',
        iconPath: new vscode.ThemeIcon('sparkle'),
      })
      terminal.sendText(`arix chat --file "${path}"`)
      terminal.show()
    }),

    vscode.commands.registerCommand('arix.find', async () => {
      const query = await vscode.window.showInputBox({
        prompt: 'Semantic search:',
        placeHolder: 'find authentication logic',
      })
      if (!query) return
      const terminal = vscode.window.createTerminal({ name: 'Arix Find', iconPath: new vscode.ThemeIcon('search') })
      terminal.sendText(`arix find "${query.replace(/"/g, '\\"')}"`)
      terminal.show()
    }),

    // ── CodeLens line commands ──────────────────────────────────────────────

    vscode.commands.registerCommand('arix.askLine', async (document: vscode.TextDocument, lineIndex: number) => {
      const block = extractBlockAt(document, lineIndex)
      const q = await vscode.window.showInputBox({ prompt: 'Ask Arix:', placeHolder: 'What does this do?' })
      if (!q) return
      await sendToArix(`${q}\n\n\`\`\`${document.languageId}\n${block}\n\`\`\``, outputChannel)
    }),

    vscode.commands.registerCommand('arix.fixLine', async (document: vscode.TextDocument, lineIndex: number) => {
      const block = extractBlockAt(document, lineIndex)
      await sendToArix(`Fix any bugs or issues in this code:\n\n\`\`\`${document.languageId}\n${block}\n\`\`\``, outputChannel)
    }),

    vscode.commands.registerCommand('arix.explainLine', async (document: vscode.TextDocument, lineIndex: number) => {
      const block = extractBlockAt(document, lineIndex)
      await sendToArix(`Explain this function clearly:\n\n\`\`\`${document.languageId}\n${block}\n\`\`\``, outputChannel)
    }),

    // ── Sidebar action commands ─────────────────────────────────────────────

    vscode.commands.registerCommand('arix.costHistory', () => {
      const terminal = vscode.window.createTerminal({ name: 'Arix Cost', iconPath: new vscode.ThemeIcon('graph') })
      terminal.sendText('arix cost history')
      terminal.show()
    }),

    vscode.commands.registerCommand('arix.costOptimize', () => {
      const terminal = vscode.window.createTerminal({ name: 'Arix Cost', iconPath: new vscode.ThemeIcon('lightbulb') })
      terminal.sendText('arix cost optimize')
      terminal.show()
    }),

    vscode.commands.registerCommand('arix.refreshSidebar', () => {
      sidebarProvider.refresh()
    }),

    vscode.commands.registerCommand('arix.toggleInlineCompletions', async () => {
      const config = vscode.workspace.getConfiguration('arix')
      const enabled = config.get<boolean>('inlineCompletions.enabled', false)
      await config.update('inlineCompletions.enabled', !enabled, vscode.ConfigurationTarget.Global)
      vscode.window.showInformationMessage(`Arix inline completions ${!enabled ? 'enabled' : 'disabled'}`)
    }),

    // ── Status bar ──────────────────────────────────────────────────────────

    (() => {
      const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100)
      statusBar.text = '$(sparkle) Arix'
      statusBar.tooltip = 'Open Arix Chat (Cmd+Shift+G)'
      statusBar.command = 'arix.open'
      statusBar.show()
      context.subscriptions.push(statusBar)
      return { dispose: () => {} }
    })(),
  )

  // Refresh sidebar when any file saves (memory/cost may have changed)
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(() => sidebarProvider.refresh()),
  )
}

export function deactivate(): void {
  socket?.close()
}
