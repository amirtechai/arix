import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve, basename } from 'node:path'
import { homedir } from 'node:os'

/**
 * Multi-repo workspaces (K3) — a session can attach N repository roots; tool
 * calls automatically receive the union of allowed paths, and the agent can
 * cross-reference modules across repos.
 *
 * Stored at ~/.arix/workspaces/<name>.json
 */

export interface RepoEntry {
  /** Short alias for use in prompts */
  alias: string
  /** Absolute repo root */
  path: string
  /** Optional description */
  description?: string
}

export interface WorkspaceData {
  name: string
  createdAt: string
  repos: RepoEntry[]
}

export class WorkspaceManager {
  private readonly storeDir: string

  constructor(storeDir?: string) {
    this.storeDir = storeDir ?? join(homedir(), '.arix', 'workspaces')
  }

  private path(name: string): string {
    return join(this.storeDir, `${name}.json`)
  }

  async create(name: string, repos: string[]): Promise<WorkspaceData> {
    await mkdir(this.storeDir, { recursive: true })
    const entries: RepoEntry[] = repos.map((p) => {
      const abs = resolve(p)
      return { alias: basename(abs), path: abs }
    })
    const data: WorkspaceData = {
      name,
      createdAt: new Date().toISOString(),
      repos: entries,
    }
    await writeFile(this.path(name), JSON.stringify(data, null, 2), 'utf-8')
    return data
  }

  async load(name: string): Promise<WorkspaceData | null> {
    if (!existsSync(this.path(name))) return null
    return JSON.parse(await readFile(this.path(name), 'utf-8')) as WorkspaceData
  }

  async list(): Promise<string[]> {
    if (!existsSync(this.storeDir)) return []
    const { readdir } = await import('node:fs/promises')
    const files = await readdir(this.storeDir)
    return files.filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''))
  }

  async addRepo(name: string, repoPath: string, alias?: string): Promise<WorkspaceData> {
    const ws = await this.load(name)
    if (!ws) throw new Error(`Workspace not found: ${name}`)
    const abs = resolve(repoPath)
    const entry: RepoEntry = { alias: alias ?? basename(abs), path: abs }
    if (!ws.repos.find((r) => r.path === abs)) ws.repos.push(entry)
    await writeFile(this.path(name), JSON.stringify(ws, null, 2), 'utf-8')
    return ws
  }

  async removeRepo(name: string, alias: string): Promise<WorkspaceData> {
    const ws = await this.load(name)
    if (!ws) throw new Error(`Workspace not found: ${name}`)
    ws.repos = ws.repos.filter((r) => r.alias !== alias)
    await writeFile(this.path(name), JSON.stringify(ws, null, 2), 'utf-8')
    return ws
  }

  /** Return all repo paths — feed into Tool allowed-path lists. */
  static allowedPaths(ws: WorkspaceData): string[] {
    return ws.repos.map((r) => r.path)
  }
}
