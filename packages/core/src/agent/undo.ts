import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'

/**
 * Reversible runs — every destructive tool call records a snapshot of the
 * affected file(s) before the change. `arix undo` rolls back the most recent
 * stack frame.
 */

export type UndoOpKind = 'write' | 'edit' | 'delete' | 'create'

export interface UndoFrame {
  id: string
  ts: number
  tool: string
  kind: UndoOpKind
  /** Absolute path of the file that changed */
  path: string
  /** Pre-change file contents (null if file did not exist before) */
  before: string | null
}

export class UndoStack {
  private readonly storeDir: string
  private readonly metaPath: string
  private frames: UndoFrame[] = []

  constructor(storeDir?: string) {
    this.storeDir = storeDir ?? join(homedir(), '.arix', 'undo')
    this.metaPath = join(this.storeDir, 'index.json')
  }

  async load(): Promise<void> {
    if (!existsSync(this.metaPath)) return
    try {
      this.frames = JSON.parse(await readFile(this.metaPath, 'utf-8')) as UndoFrame[]
    } catch {
      this.frames = []
    }
  }

  async save(): Promise<void> {
    await mkdir(this.storeDir, { recursive: true })
    await writeFile(this.metaPath, JSON.stringify(this.frames, null, 2), 'utf-8')
  }

  /** Capture the current state of `filePath` before a destructive change. */
  async snapshot(tool: string, kind: UndoOpKind, filePath: string): Promise<UndoFrame> {
    const abs = resolve(filePath)
    let before: string | null = null
    if (existsSync(abs)) {
      try { before = await readFile(abs, 'utf-8') } catch { before = null }
    }
    const frame: UndoFrame = {
      id: randomUUID(),
      ts: Date.now(),
      tool,
      kind,
      path: abs,
      before,
    }
    this.frames.push(frame)
    await this.save()
    return frame
  }

  list(): readonly UndoFrame[] { return this.frames }

  /** Pop and revert the most recent frame. Returns the reverted frame or null. */
  async undoLast(): Promise<UndoFrame | null> {
    const frame = this.frames.pop()
    if (!frame) return null
    await this._revert(frame)
    await this.save()
    return frame
  }

  /** Revert a specific frame by id (out-of-order undo). */
  async undoById(id: string): Promise<UndoFrame | null> {
    const idx = this.frames.findIndex((f) => f.id === id)
    if (idx === -1) return null
    const [frame] = this.frames.splice(idx, 1) as [UndoFrame]
    await this._revert(frame)
    await this.save()
    return frame
  }

  clear(): void { this.frames = [] }

  private async _revert(frame: UndoFrame): Promise<void> {
    if (frame.before === null) {
      // File didn't exist before — delete it now (if it exists)
      if (existsSync(frame.path)) await unlink(frame.path)
      return
    }
    await mkdir(dirname(frame.path), { recursive: true })
    await writeFile(frame.path, frame.before, 'utf-8')
  }
}
