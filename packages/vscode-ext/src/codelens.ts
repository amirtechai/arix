import * as vscode from 'vscode'

// Matches function/method/class declarations in common languages
const DECLARATION_PATTERN = /^[\t ]*(export\s+)?(async\s+)?function\s+\w+|^[\t ]*(export\s+)?class\s+\w+|^[\t ]*(public|private|protected|static|\s)*(async\s+)?\w+\s*\(/m

export class ArixCodeLensProvider implements vscode.CodeLensProvider {
  private readonly _onDidChangeCodeLenses = new vscode.EventEmitter<void>()
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const config = vscode.workspace.getConfiguration('arix')
    if (!config.get<boolean>('codeLens', true)) return []

    const lenses: vscode.CodeLens[] = []
    const text = document.getText()
    const lines = text.split('\n')

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!
      if (!DECLARATION_PATTERN.test(line)) continue
      // Skip very short lines (likely closing braces picked up accidentally)
      if (line.trim().length < 8) continue

      const range = new vscode.Range(i, 0, i, line.length)

      lenses.push(
        new vscode.CodeLens(range, {
          title: '$(sparkle) Ask Arix',
          command: 'arix.askLine',
          arguments: [document, i],
          tooltip: 'Ask Arix about this code',
        }),
        new vscode.CodeLens(range, {
          title: '$(tools) Fix',
          command: 'arix.fixLine',
          arguments: [document, i],
          tooltip: 'Ask Arix to fix issues in this function',
        }),
        new vscode.CodeLens(range, {
          title: '$(book) Explain',
          command: 'arix.explainLine',
          arguments: [document, i],
          tooltip: 'Ask Arix to explain this code',
        }),
      )
    }

    return lenses
  }
}

// Extracts the function/block body starting at lineIndex
export function extractBlockAt(document: vscode.TextDocument, lineIndex: number): string {
  const lines: string[] = []
  let braceDepth = 0
  let started = false

  for (let i = lineIndex; i < Math.min(lineIndex + 80, document.lineCount); i++) {
    const line = document.lineAt(i).text
    lines.push(line)

    for (const ch of line) {
      if (ch === '{') { braceDepth++; started = true }
      if (ch === '}') braceDepth--
    }

    if (started && braceDepth <= 0) break
  }

  return lines.join('\n')
}
