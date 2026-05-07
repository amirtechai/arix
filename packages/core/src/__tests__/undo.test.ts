import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { UndoStack } from '../agent/undo.js'

describe('UndoStack', () => {
  it('snapshots a file, then reverts it on undoLast', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'undo-'))
    try {
      const file = join(dir, 'a.txt')
      writeFileSync(file, 'original')
      const stack = new UndoStack(join(dir, 'store'))
      await stack.snapshot('write_file', 'write', file)
      writeFileSync(file, 'modified')
      const reverted = await stack.undoLast()
      expect(reverted).not.toBeNull()
      expect(readFileSync(file, 'utf-8')).toBe('original')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('removes a file that did not exist before the snapshot', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'undo-'))
    try {
      const file = join(dir, 'new.txt')
      const stack = new UndoStack(join(dir, 'store'))
      await stack.snapshot('write_file', 'create', file)
      writeFileSync(file, 'created')
      await stack.undoLast()
      expect(existsSync(file)).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
