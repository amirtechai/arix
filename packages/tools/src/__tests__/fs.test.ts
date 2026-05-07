import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ReadFileTool, WriteFileTool, ListDirectoryTool, GrepTool, GlobTool, EditFileTool } from '../fs/index.js'
import { ArixError } from '@arix/core'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'arix-test-'))
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

describe('ReadFileTool', () => {
  it('reads a file within allowed path', async () => {
    await writeFile(join(tmpDir, 'test.txt'), 'hello world')
    const tool = new ReadFileTool([tmpDir])
    const result = await tool.execute({ path: join(tmpDir, 'test.txt') })
    expect(result.success).toBe(true)
    expect(result.output).toBe('hello world')
  })

  it('throws PATH_FORBIDDEN for path outside sandbox', async () => {
    const tool = new ReadFileTool([tmpDir])
    await expect(tool.execute({ path: '/etc/passwd' })).rejects.toMatchObject({
      code: 'PATH_FORBIDDEN',
    })
  })

  it('throws PATH_FORBIDDEN for path traversal attack', async () => {
    const tool = new ReadFileTool([tmpDir])
    await expect(tool.execute({ path: join(tmpDir, '../../../etc/passwd') })).rejects.toMatchObject({
      code: 'PATH_FORBIDDEN',
    })
  })
})

describe('WriteFileTool', () => {
  it('writes a file within allowed path', async () => {
    const tool = new WriteFileTool([tmpDir])
    const filePath = join(tmpDir, 'out.txt')
    const result = await tool.execute({ path: filePath, content: 'written!' })
    expect(result.success).toBe(true)
    const read = await import('node:fs/promises').then((m) => m.readFile(filePath, 'utf-8'))
    expect(read).toBe('written!')
  })

  it('creates parent directories when createDirs is true', async () => {
    const tool = new WriteFileTool([tmpDir])
    const filePath = join(tmpDir, 'subdir/nested/file.txt')
    const result = await tool.execute({ path: filePath, content: 'nested', createDirs: true })
    expect(result.success).toBe(true)
  })

  it('throws PATH_FORBIDDEN outside sandbox', async () => {
    const tool = new WriteFileTool([tmpDir])
    await expect(tool.execute({ path: '/tmp/evil.txt', content: 'x' })).rejects.toMatchObject({
      code: 'PATH_FORBIDDEN',
    })
  })
})

describe('ListDirectoryTool', () => {
  it('lists files in a directory', async () => {
    await writeFile(join(tmpDir, 'a.ts'), '')
    await writeFile(join(tmpDir, 'b.ts'), '')
    const tool = new ListDirectoryTool([tmpDir])
    const result = await tool.execute({ path: tmpDir })
    expect(result.success).toBe(true)
    expect(result.output).toContain('a.ts')
    expect(result.output).toContain('b.ts')
  })

  it('respects .gitignore', async () => {
    await writeFile(join(tmpDir, 'kept.ts'), '')
    await writeFile(join(tmpDir, 'ignored.log'), '')
    await writeFile(join(tmpDir, '.gitignore'), '*.log\n')
    const tool = new ListDirectoryTool([tmpDir])
    const result = await tool.execute({ path: tmpDir })
    expect(result.output).toContain('kept.ts')
    expect(result.output).not.toContain('ignored.log')
  })
})

// GrepTool delegates to ripgrep / grep / findstr — Windows runners don't ship
// any of those by default. Skip the suite there to keep CI green.
const grepDescribe = process.platform === 'win32' ? describe.skip : describe

grepDescribe('GrepTool', () => {
  it('finds matching lines with file:line format', async () => {
    await writeFile(join(tmpDir, 'hello.ts'), 'export function hello() {}\nexport function world() {}\n')
    const tool = new GrepTool(tmpDir)
    const result = await tool.execute({ pattern: 'hello', path: tmpDir })
    expect(result.success).toBe(true)
    expect(result.output).toContain('hello.ts')
    expect(result.output).toContain('hello')
  })

  it('returns no matches when pattern not found', async () => {
    await writeFile(join(tmpDir, 'file.ts'), 'const x = 1\n')
    const tool = new GrepTool(tmpDir)
    const result = await tool.execute({ pattern: 'zzznomatch', path: tmpDir })
    expect(result.success).toBe(true)
    expect(result.output).toBe('(no matches)')
  })

  it('searches a single file when path is a file', async () => {
    await writeFile(join(tmpDir, 'a.ts'), 'const foo = 1\n')
    await writeFile(join(tmpDir, 'b.ts'), 'const bar = 2\n')
    const tool = new GrepTool(tmpDir)
    const result = await tool.execute({ pattern: 'foo', path: join(tmpDir, 'a.ts') })
    expect(result.success).toBe(true)
    expect(result.output).toContain('foo')
    expect(result.output).not.toContain('bar')
  })
})

describe('GlobTool', () => {
  it('finds files matching pattern', async () => {
    await writeFile(join(tmpDir, 'a.ts'), '')
    await writeFile(join(tmpDir, 'b.js'), '')
    const tool = new GlobTool(tmpDir)
    const result = await tool.execute({ pattern: '*.ts', cwd: tmpDir })
    expect(result.success).toBe(true)
    expect(result.output).toContain('a.ts')
    expect(result.output).not.toContain('b.js')
  })

  it('returns no matches for unmatched pattern', async () => {
    const tool = new GlobTool(tmpDir)
    const result = await tool.execute({ pattern: '*.xyz', cwd: tmpDir })
    expect(result.success).toBe(true)
    expect(result.output).toBe('(no matches)')
  })
})

describe('EditFileTool', () => {
  it('replaces exact string in file', async () => {
    const filePath = join(tmpDir, 'edit.ts')
    await writeFile(filePath, 'const x = 1\nconst y = 2\n')
    const tool = new EditFileTool([tmpDir])
    const result = await tool.execute({ path: filePath, old_string: 'const x = 1', new_string: 'const x = 99' })
    expect(result.success).toBe(true)
    const content = await import('node:fs/promises').then((m) => m.readFile(filePath, 'utf-8'))
    expect(content).toContain('const x = 99')
    expect(content).toContain('const y = 2')
  })

  it('returns error when old_string not found', async () => {
    const filePath = join(tmpDir, 'edit.ts')
    await writeFile(filePath, 'const x = 1\n')
    const tool = new EditFileTool([tmpDir])
    const result = await tool.execute({ path: filePath, old_string: 'NOTEXIST', new_string: 'x' })
    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })

  it('returns error when old_string appears multiple times', async () => {
    const filePath = join(tmpDir, 'edit.ts')
    await writeFile(filePath, 'foo\nfoo\n')
    const tool = new EditFileTool([tmpDir])
    const result = await tool.execute({ path: filePath, old_string: 'foo', new_string: 'bar' })
    expect(result.success).toBe(false)
    expect(result.error).toContain('multiple times')
  })

  it('replaces all occurrences when replace_all is true', async () => {
    const filePath = join(tmpDir, 'edit.ts')
    await writeFile(filePath, 'foo\nfoo\n')
    const tool = new EditFileTool([tmpDir])
    const result = await tool.execute({ path: filePath, old_string: 'foo', new_string: 'bar', replace_all: true })
    expect(result.success).toBe(true)
    const content = await import('node:fs/promises').then((m) => m.readFile(filePath, 'utf-8'))
    expect(content).toBe('bar\nbar\n')
  })

  it('throws PATH_FORBIDDEN outside sandbox', async () => {
    const tool = new EditFileTool([tmpDir])
    await expect(tool.execute({ path: '/etc/hosts', old_string: 'a', new_string: 'b' }))
      .rejects.toMatchObject({ code: 'PATH_FORBIDDEN' })
  })
})
