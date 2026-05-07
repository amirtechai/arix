import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ApplyDiffTool, parseDiffBlocks } from '../fs/apply-diff.js'

describe('parseDiffBlocks', () => {
  it('parses a single block', () => {
    const blocks = parseDiffBlocks(`<<<<<<< SEARCH\nfoo\n=======\nbar\n>>>>>>> REPLACE`)
    expect(blocks).toEqual([{ search: 'foo', replace: 'bar' }])
  })

  it('parses multiple blocks', () => {
    const diff = `<<<<<<< SEARCH
a
=======
A
>>>>>>> REPLACE
junk text between
<<<<<<< SEARCH
b
=======
B
>>>>>>> REPLACE`
    expect(parseDiffBlocks(diff)).toEqual([
      { search: 'a', replace: 'A' },
      { search: 'b', replace: 'B' },
    ])
  })

  it('throws on unterminated block', () => {
    expect(() => parseDiffBlocks(`<<<<<<< SEARCH\nfoo\n=======\nbar`)).toThrow()
  })
})

describe('ApplyDiffTool', () => {
  it('applies a block atomically', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'diff-'))
    try {
      const file = join(dir, 'a.txt')
      writeFileSync(file, 'line1\nfoo\nline3\n')
      const tool = new ApplyDiffTool([dir])
      const res = await tool.execute({
        path: file,
        diff: `<<<<<<< SEARCH\nfoo\n=======\nbar\n>>>>>>> REPLACE`,
      })
      expect(res.success).toBe(true)
      expect(readFileSync(file, 'utf-8')).toBe('line1\nbar\nline3\n')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('rejects ambiguous SEARCH', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'diff-'))
    try {
      const file = join(dir, 'a.txt')
      writeFileSync(file, 'foo\nfoo\n')
      const tool = new ApplyDiffTool([dir])
      const res = await tool.execute({
        path: file,
        diff: `<<<<<<< SEARCH\nfoo\n=======\nX\n>>>>>>> REPLACE`,
      })
      expect(res.success).toBe(false)
      expect(res.error).toMatch(/multiple times/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('rejects path traversal', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'diff-'))
    try {
      const tool = new ApplyDiffTool([dir])
      await expect(tool.execute({
        path: '/etc/passwd',
        diff: `<<<<<<< SEARCH\nx\n=======\ny\n>>>>>>> REPLACE`,
      })).rejects.toThrow()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
