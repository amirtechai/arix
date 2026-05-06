import * as vscode from 'vscode'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'

// ── Tree item types ────────────────────────────────────────────────────────────

export class ArixTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    public readonly itemType: 'section' | 'session' | 'memory' | 'cost' | 'action',
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly data?: unknown,
  ) {
    super(label, collapsibleState)
  }
}

// ── Data loading ───────────────────────────────────────────────────────────────

const CONFIG_DIR = join(homedir(), '.arix')

async function loadRecentSessions(limit = 10): Promise<Array<{ id: string; model: string; date: string; cost: string }>> {
  try {
    const raw = await readFile(join(CONFIG_DIR, 'costs.json'), 'utf8')
    const ledger = JSON.parse(raw) as Array<{ sessionId: string; model: string; startedAt: string; totalUsd: number | null }>
    return ledger
      .slice(-limit)
      .reverse()
      .map((s) => ({
        id: s.sessionId,
        model: s.model,
        date: new Date(s.startedAt).toLocaleDateString(),
        cost: s.totalUsd !== null ? `$${s.totalUsd.toFixed(4)}` : '—',
      }))
  } catch {
    return []
  }
}

async function loadMemoryItems(): Promise<string[]> {
  try {
    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd()
    const raw = await readFile(join(cwd, '.arix-memory.json'), 'utf8')
    const mem = JSON.parse(raw) as Array<{ key: string; value: string }>
    return mem.map((m) => `${m.key}: ${m.value}`.slice(0, 80))
  } catch {
    return []
  }
}

async function loadTodaySpend(): Promise<{ total: string; sessions: number }> {
  try {
    const raw = await readFile(join(CONFIG_DIR, 'costs.json'), 'utf8')
    const ledger = JSON.parse(raw) as Array<{ startedAt: string; totalUsd: number | null }>
    const today = new Date().toDateString()
    const todaySessions = ledger.filter((s) => new Date(s.startedAt).toDateString() === today)
    const total = todaySessions.reduce((acc, s) => acc + (s.totalUsd ?? 0), 0)
    return { total: `$${total.toFixed(4)}`, sessions: todaySessions.length }
  } catch {
    return { total: '$0.0000', sessions: 0 }
  }
}

// ── Sidebar TreeDataProvider ──────────────────────────────────────────────────

export class ArixSidebarProvider implements vscode.TreeDataProvider<ArixTreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<ArixTreeItem | undefined>()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined)
  }

  getTreeItem(element: ArixTreeItem): vscode.TreeItem {
    return element
  }

  async getChildren(element?: ArixTreeItem): Promise<ArixTreeItem[]> {
    if (!element) {
      return [
        this.makeSection('$(terminal) Terminal', 'terminal-section'),
        this.makeSection('$(history) Recent Sessions', 'sessions-section'),
        this.makeSection('$(database) Project Memory', 'memory-section'),
        this.makeSection('$(graph) Cost Today', 'cost-section'),
      ]
    }

    if (element.label === '$(terminal) Terminal') {
      return [
        this.makeAction('$(play) Open Arix Chat', 'arix.open'),
        this.makeAction('$(add) New Chat with File Context', 'arix.openWithContext'),
        this.makeAction('$(search) Find in Codebase', 'arix.find'),
      ]
    }

    if (element.label === '$(history) Recent Sessions') {
      const sessions = await loadRecentSessions()
      if (sessions.length === 0) {
        return [new ArixTreeItem('No sessions yet', 'session', vscode.TreeItemCollapsibleState.None)]
      }
      return sessions.map((s) => {
        const item = new ArixTreeItem(
          `${s.model} — ${s.cost}`,
          'session',
          vscode.TreeItemCollapsibleState.None,
          s,
        )
        item.description = s.date
        item.tooltip = `Session ${s.id}\n${s.date}\nCost: ${s.cost}`
        return item
      })
    }

    if (element.label === '$(database) Project Memory') {
      const items = await loadMemoryItems()
      if (items.length === 0) {
        return [new ArixTreeItem('No memory entries', 'memory', vscode.TreeItemCollapsibleState.None)]
      }
      return items.map((text) => {
        const item = new ArixTreeItem(text, 'memory', vscode.TreeItemCollapsibleState.None)
        item.tooltip = text
        return item
      })
    }

    if (element.label === '$(graph) Cost Today') {
      const spend = await loadTodaySpend()
      return [
        (() => {
          const item = new ArixTreeItem(`Total: ${spend.total}`, 'cost', vscode.TreeItemCollapsibleState.None)
          item.description = `${spend.sessions} session${spend.sessions !== 1 ? 's' : ''}`
          return item
        })(),
        this.makeAction('$(list-unordered) Full History', 'arix.costHistory'),
        this.makeAction('$(lightbulb) Optimize Spend', 'arix.costOptimize'),
      ]
    }

    return []
  }

  private makeSection(label: string, _key: string): ArixTreeItem {
    const item = new ArixTreeItem(label, 'section', vscode.TreeItemCollapsibleState.Collapsed)
    item.contextValue = 'section'
    return item
  }

  private makeAction(label: string, command: string): ArixTreeItem {
    const item = new ArixTreeItem(label, 'action', vscode.TreeItemCollapsibleState.None)
    item.command = { command, title: label, arguments: [] }
    item.contextValue = 'action'
    return item
  }
}
