import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { ArixError } from '@arix/core'
import type { Tool, ToolResult } from '@arix/core'

const SEARCH_RE  = /^<{5,}\s*SEARCH\s*$/
const DIVIDER_RE = /^={5,}\s*$/
const REPLACE_RE = /^>{5,}\s*REPLACE\s*$/

export interface DiffBlock {
  search: string
  replace: string
}

/** Parse Aider-style search/replace blocks. */
export function parseDiffBlocks(diff: string): DiffBlock[] {
  const lines = diff.split(/\r?\n/)
  const blocks: DiffBlock[] = []
  let mode: 'idle' | 'search' | 'replace' = 'idle'
  let buf: string[] = []
  let pending: { search: string } | null = null

  for (const line of lines) {
    if (mode === 'idle') {
      if (SEARCH_RE.test(line)) {
        mode = 'search'
        buf = []
      }
    } else if (mode === 'search') {
      if (DIVIDER_RE.test(line)) {
        pending = { search: buf.join('\n') }
        mode = 'replace'
        buf = []
      } else {
        buf.push(line)
      }
    } else if (mode === 'replace') {
      if (REPLACE_RE.test(line)) {
        if (pending) blocks.push({ search: pending.search, replace: buf.join('\n') })
        pending = null
        mode = 'idle'
        buf = []
      } else {
        buf.push(line)
      }
    }
  }

  if (mode !== 'idle') {
    throw new Error('Unterminated diff block — expected matching SEARCH/======/REPLACE markers')
  }
  return blocks
}

function assertAllowedPath(target: string, allowedPaths: string[]): void {
  const resolved = resolve(target)
  const allowed = allowedPaths.some((p) => {
    const base = resolve(p)
    return resolved === base || resolved.startsWith(base + '/')
  })
  if (!allowed) {
    throw new ArixError('PATH_FORBIDDEN', `Path not allowed: ${target}`)
  }
}

/**
 * apply_diff — applies one or more Aider-style search/replace blocks to a file.
 *
 * Block format:
 *   <<<<<<< SEARCH
 *   exact text to find (verbatim)
 *   =======
 *   replacement text
 *   >>>>>>> REPLACE
 *
 * Each SEARCH must match exactly once. Whole-file rewrite is avoided — saves
 * tokens, atomic at file level.
 */
export class ApplyDiffTool implements Tool {
  readonly name = 'apply_diff'
  readonly description =
    'Apply Aider-style search/replace blocks to a file. Each <<<<<<< SEARCH / ======= / >>>>>>> REPLACE block must match exactly once. Cheaper than rewriting the whole file.'
  readonly requiresConfirmation = true
  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'File to patch' },
      diff: { type: 'string', description: 'One or more SEARCH/REPLACE blocks' },
    },
    required: ['path', 'diff'],
  }

  constructor(private readonly allowedPaths: string[]) {}

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const path = input['path'] as string
    const diff = input['diff'] as string

    assertAllowedPath(path, this.allowedPaths)
    const abs = resolve(path)

    let blocks: DiffBlock[]
    try {
      blocks = parseDiffBlocks(diff)
    } catch (err) {
      return { toolCallId: '', success: false, output: '', error: (err as Error).message }
    }
    if (blocks.length === 0) {
      return { toolCallId: '', success: false, output: '', error: 'No SEARCH/REPLACE blocks found in diff' }
    }

    let content: string
    try {
      content = await readFile(abs, 'utf-8')
    } catch {
      return { toolCallId: '', success: false, output: '', error: `Cannot read file: ${path}` }
    }

    let netLines = 0
    for (const [i, block] of blocks.entries()) {
      const idx = content.indexOf(block.search)
      if (idx === -1) {
        return {
          toolCallId: '', success: false, output: '',
          error: `Block #${i + 1}: SEARCH text not found in ${path}`,
        }
      }
      const second = content.indexOf(block.search, idx + 1)
      if (second !== -1) {
        return {
          toolCallId: '', success: false, output: '',
          error: `Block #${i + 1}: SEARCH text appears multiple times in ${path} — add more context`,
        }
      }
      content = content.slice(0, idx) + block.replace + content.slice(idx + block.search.length)
      netLines += block.replace.split('\n').length - block.search.split('\n').length
    }

    await writeFile(abs, content, 'utf-8')
    const sign = netLines >= 0 ? '+' : ''
    return {
      toolCallId: '', success: true,
      output: `Applied ${blocks.length} block${blocks.length === 1 ? '' : 's'} to ${path} (${sign}${netLines} lines)`,
    }
  }
}
