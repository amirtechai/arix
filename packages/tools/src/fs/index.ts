import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { resolve, relative, join, dirname, sep } from 'node:path'
import { existsSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { ArixError } from '@arix-code/core'
import type { Tool, ToolResult } from '@arix-code/core'

const execFileAsync = promisify(execFile)
 
import ignoreLib from 'ignore'
const ignore = ignoreLib as unknown as (opts?: unknown) => { ignores(p: string): boolean; add(content: string): void }

function assertAllowedPath(target: string, allowedPaths: string[]): void {
  const resolved = resolve(target)
  const allowed = allowedPaths.some((p) => {
    const base = resolve(p)
    // Use platform separator so Windows paths (C:\foo\bar) work correctly.
    return resolved === base || resolved.startsWith(base + sep)
  })
  if (!allowed) {
    throw new ArixError('PATH_FORBIDDEN', `Path not allowed: ${target}`)
  }
}

export class ReadFileTool implements Tool {
  readonly name = 'read_file'
  readonly description = 'Read the contents of a file'
  readonly requiresConfirmation = false
  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'File path to read' },
    },
    required: ['path'],
  }

  constructor(private readonly allowedPaths: string[]) {}

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const path = input['path'] as string
    assertAllowedPath(path, this.allowedPaths)
    const content = await readFile(resolve(path), 'utf-8')
    return { toolCallId: '', success: true, output: content }
  }
}

export class WriteFileTool implements Tool {
  readonly name = 'write_file'
  readonly description = 'Write content to a file'
  readonly requiresConfirmation = true
  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'File path to write' },
      content: { type: 'string', description: 'Content to write' },
      createDirs: { type: 'boolean', description: 'Create parent directories if missing' },
    },
    required: ['path', 'content'],
  }

  constructor(private readonly allowedPaths: string[]) {}

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const path = input['path'] as string
    const content = input['content'] as string
    const createDirs = input['createDirs'] as boolean | undefined
    assertAllowedPath(path, this.allowedPaths)
    if (createDirs) await mkdir(dirname(resolve(path)), { recursive: true })
    await writeFile(resolve(path), content, 'utf-8')
    return { toolCallId: '', success: true, output: `Written ${path}` }
  }
}

export class ListDirectoryTool implements Tool {
  readonly name = 'list_directory'
  readonly description = 'List files in a directory'
  readonly requiresConfirmation = false
  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Directory path' },
      recursive: { type: 'boolean', description: 'List recursively' },
    },
    required: ['path'],
  }

  constructor(private readonly allowedPaths: string[]) {}

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const path = input['path'] as string
    const recursive = input['recursive'] as boolean | undefined
    assertAllowedPath(path, this.allowedPaths)
    const absPath = resolve(path)

    const ig = ignore()
    const gitignorePath = join(absPath, '.gitignore')
    if (existsSync(gitignorePath)) {
      const content = await readFile(gitignorePath, 'utf-8')
      ig.add(content)
    }

    const entries = await this.listDir(absPath, absPath, ig, recursive ?? false)
    return { toolCallId: '', success: true, output: entries.join('\n') }
  }

  private async listDir(base: string, dir: string, ig: { ignores(p: string): boolean; add(content: string): void }, recursive: boolean): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true })
    const result: string[] = []
    for (const entry of entries) {
      const full = join(dir, entry.name)
      const rel = relative(base, full)
      if (ig.ignores(rel)) continue
      result.push(rel)
      if (entry.isDirectory() && recursive) {
        result.push(...await this.listDir(base, full, ig, true))
      }
    }
    return result
  }
}

// ── GrepTool ─────────────────────────────────────────────────────────────────

export class GrepTool implements Tool {
  readonly name = 'grep'
  readonly description = 'Search for a regex pattern in files, returns matching lines with file:line context'
  readonly requiresConfirmation = false
  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      pattern:   { type: 'string', description: 'Regular expression pattern to search for' },
      path:      { type: 'string', description: 'Directory or file to search in (default: cwd)' },
      include:   { type: 'string', description: 'Glob pattern to filter files, e.g. "**/*.ts"' },
      maxResults: { type: 'number', description: 'Maximum number of matching lines (default: 100)' },
    },
    required: ['pattern'],
  }

  constructor(private readonly cwd: string) {}

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const pattern    = input['pattern'] as string
    const searchPath = resolve((input['path'] as string | undefined) ?? this.cwd)
    const include    = (input['include'] as string | undefined) ?? ''
    const maxResults = (input['maxResults'] as number | undefined) ?? 100

    // Prefer ripgrep (cross-platform), fall back to grep (Unix), then findstr (Windows).
    // Regex is passed directly to the OS binary — not evaluated by JS RegExp,
    // so ReDoS against the JS engine is not possible.
    const isWin = process.platform === 'win32'

    // Try ripgrep first (available on all platforms via PATH)
    try {
      const rgArgs = [
        '--line-number', '--no-heading', '--color=never',
        `-m`, String(maxResults),
        pattern,
        searchPath,
        ...(include ? ['--glob', include] : []),
      ]
      const { stdout } = await execFileAsync('rg', rgArgs, { maxBuffer: 2 * 1024 * 1024 })
      const lines = stdout.trim().split('\n').filter(Boolean).slice(0, maxResults)
      const suffix = lines.length >= maxResults ? `\n(truncated at ${maxResults} results)` : ''
      return { toolCallId: '', success: true, output: lines.join('\n') + suffix || '(no matches)' }
    } catch (rgErr: unknown) {
      // rg not available or no matches (exit 1) — fall through to next option
      const child = rgErr as { code?: number }
      if (child.code === 1) return { toolCallId: '', success: true, output: '(no matches)' }
    }

    if (isWin) {
      // findstr: /S recursive, /N line numbers, /R regex, /I case-insensitive
      const findstrArgs = ['/S', '/N', '/R', pattern, searchPath]
      try {
        const { stdout } = await execFileAsync('findstr', findstrArgs, { maxBuffer: 2 * 1024 * 1024 })
        const lines = stdout.trim().split('\r\n').filter(Boolean).slice(0, maxResults)
        return { toolCallId: '', success: true, output: lines.join('\n') || '(no matches)' }
      } catch (err: unknown) {
        const child = err as { code?: number }
        if (child.code === 1) return { toolCallId: '', success: true, output: '(no matches)' }
        return { toolCallId: '', success: false, output: '', error: 'grep/findstr not available' }
      }
    }

    // Unix grep fallback
    const args: string[] = [
      '-rEn', '--color=never', `-m`, String(maxResults),
      pattern, searchPath,
    ]
    if (include) args.splice(args.indexOf(pattern), 0, `--include=${include}`)
    try {
      const { stdout } = await execFileAsync('grep', args, { maxBuffer: 2 * 1024 * 1024 })
      const lines = stdout.trim().split('\n').filter(Boolean)
      const output = lines
        .map((l) => l.replace(searchPath + '/', relative(this.cwd, searchPath) + '/'))
        .slice(0, maxResults)
        .join('\n')
      const suffix = lines.length >= maxResults ? `\n(truncated at ${maxResults} results)` : ''
      return { toolCallId: '', success: true, output: output + suffix || '(no matches)' }
    } catch (err: unknown) {
      const child = err as { code?: number }
      if (child.code === 1) return { toolCallId: '', success: true, output: '(no matches)' }
      const msg = err instanceof Error ? err.message : String(err)
      return { toolCallId: '', success: false, output: '', error: `grep failed: ${msg}` }
    }
  }
}

// ── GlobTool ─────────────────────────────────────────────────────────────────

export class GlobTool implements Tool {
  readonly name = 'glob'
  readonly description = 'Find files matching a glob pattern, returns relative paths sorted by name'
  readonly requiresConfirmation = false
  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      pattern: { type: 'string', description: 'Glob pattern, e.g. "src/**/*.ts"' },
      cwd:     { type: 'string', description: 'Base directory (default: project root)' },
    },
    required: ['pattern'],
  }

  constructor(private readonly projectRoot: string) {}

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const pattern = input['pattern'] as string
    const base = resolve((input['cwd'] as string | undefined) ?? this.projectRoot)

    try {
      // Use the `glob` npm package — node:fs/promises#glob is experimental on
      // Node <22 and unavailable on older runtimes.
      const { glob } = await import('glob')
      const matches = (await glob(pattern, { cwd: base, nodir: false })).sort()
      if (matches.length === 0) return { toolCallId: '', success: true, output: '(no matches)' }
      return { toolCallId: '', success: true, output: matches.join('\n') }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { toolCallId: '', success: false, output: '', error: msg }
    }
  }
}

// ── EditFileTool ──────────────────────────────────────────────────────────────

export class EditFileTool implements Tool {
  readonly name = 'edit_file'
  readonly description = 'Replace an exact string in a file. Fails if old_string is not found or appears multiple times.'
  readonly requiresConfirmation = true
  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      path:       { type: 'string', description: 'Path to the file to edit' },
      old_string: { type: 'string', description: 'Exact string to find and replace' },
      new_string: { type: 'string', description: 'Replacement string' },
      replace_all: { type: 'boolean', description: 'Replace all occurrences (default: false)' },
    },
    required: ['path', 'old_string', 'new_string'],
  }

  constructor(private readonly allowedPaths: string[]) {}

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const filePath   = input['path'] as string
    const oldString  = input['old_string'] as string
    const newString  = input['new_string'] as string
    const replaceAll = (input['replace_all'] as boolean | undefined) ?? false

    assertAllowedPath(filePath, this.allowedPaths)
    const abs = resolve(filePath)

    let content: string
    try {
      content = await readFile(abs, 'utf-8')
    } catch {
      return { toolCallId: '', success: false, output: '', error: `Cannot read file: ${filePath}` }
    }

    if (!content.includes(oldString)) {
      return { toolCallId: '', success: false, output: '', error: `old_string not found in ${filePath}` }
    }

    let updated: string
    if (replaceAll) {
      updated = content.split(oldString).join(newString)
    } else {
      const idx = content.indexOf(oldString)
      const second = content.indexOf(oldString, idx + 1)
      if (second !== -1) {
        return {
          toolCallId: '', success: false, output: '',
          error: `old_string appears multiple times in ${filePath} — use replace_all:true or provide more context`,
        }
      }
      updated = content.slice(0, idx) + newString + content.slice(idx + oldString.length)
    }

    await writeFile(abs, updated, 'utf-8')
    const additions = newString.split('\n').length - oldString.split('\n').length
    const sign = additions >= 0 ? '+' : ''
    return { toolCallId: '', success: true, output: `Edited ${filePath} (${sign}${additions} lines)` }
  }
}

export { ApplyDiffTool, parseDiffBlocks } from './apply-diff.js'
export type { DiffBlock } from './apply-diff.js'

import { ApplyDiffTool } from './apply-diff.js'

export function createFsTools(cwd: string, extraPaths: string[] = []): Tool[] {
  const allowedPaths = [cwd, ...extraPaths]
  return [
    new ReadFileTool(allowedPaths),
    new WriteFileTool(allowedPaths),
    new ListDirectoryTool(allowedPaths),
    new GrepTool(cwd),
    new GlobTool(cwd),
    new EditFileTool(allowedPaths),
    new ApplyDiffTool(allowedPaths),
  ]
}
