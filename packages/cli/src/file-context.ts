/**
 * File context loader for --file / --dir / --git-diff flags.
 * Reads files, applies a token budget, and returns a formatted context block
 * suitable for injection into the system prompt.
 */

import { readFile, readdir, stat } from 'node:fs/promises'
import { join, relative, extname } from 'node:path'
import { execSync } from 'node:child_process'

// ~4 chars per token, leave room for system prompt + conversation
const MAX_CONTEXT_CHARS = 80_000  // ~20k tokens

const TEXT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.rs', '.go', '.java', '.kt', '.swift',
  '.c', '.cpp', '.h', '.hpp',
  '.json', '.yaml', '.yml', '.toml', '.env.example',
  '.md', '.txt', '.sh', '.bash', '.zsh',
  '.html', '.css', '.scss', '.sql', '.prisma',
  '.dart', '.vue', '.svelte',
])

export interface FileContextResult {
  content: string
  fileCount: number
  truncated: boolean
  totalChars: number
}

export async function buildFileContext(opts: {
  files?: string[]
  dirs?: string[]
  gitDiff?: boolean
  cwd: string
}): Promise<FileContextResult> {
  const paths: string[] = []

  // Explicit files
  if (opts.files?.length) {
    for (const f of opts.files) {
      paths.push(f.startsWith('/') ? f : join(opts.cwd, f))
    }
  }

  // Directory scan (non-recursive, skip node_modules / .git / dist)
  if (opts.dirs?.length) {
    for (const dir of opts.dirs) {
      const absDir = dir.startsWith('/') ? dir : join(opts.cwd, dir)
      const found = await collectDir(absDir, opts.cwd)
      paths.push(...found)
    }
  }

  // Git diff — changed files in working tree vs HEAD
  if (opts.gitDiff) {
    const changed = getGitDiffFiles(opts.cwd)
    paths.push(...changed)
  }

  // Deduplicate
  const unique = [...new Set(paths)]

  if (unique.length === 0) {
    return { content: '', fileCount: 0, truncated: false, totalChars: 0 }
  }

  const sections: string[] = []
  let totalChars = 0
  let truncated = false
  let fileCount = 0

  for (const absPath of unique) {
    if (totalChars >= MAX_CONTEXT_CHARS) { truncated = true; break }

    const relPath = relative(opts.cwd, absPath)
    const ext = extname(absPath).toLowerCase()
    if (!TEXT_EXTENSIONS.has(ext)) continue

    let content: string
    try {
      content = await readFile(absPath, 'utf8')
    } catch {
      continue
    }

    const remaining = MAX_CONTEXT_CHARS - totalChars
    let fileContent = content
    let fileTruncated = false
    if (fileContent.length > remaining) {
      fileContent = fileContent.slice(0, remaining)
      fileTruncated = true
      truncated = true
    }

    sections.push(
      `### ${relPath}${fileTruncated ? ' (truncated)' : ''}\n\`\`\`${langFromExt(ext)}\n${fileContent}\n\`\`\``
    )
    totalChars += fileContent.length
    fileCount++
  }

  if (sections.length === 0) {
    return { content: '', fileCount: 0, truncated: false, totalChars: 0 }
  }

  const header = `## File Context (${fileCount} file${fileCount !== 1 ? 's' : ''})\n\n`
  return {
    content: header + sections.join('\n\n'),
    fileCount,
    truncated,
    totalChars,
  }
}

async function collectDir(absDir: string, cwd: string): Promise<string[]> {
  const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', '.dart_tool'])
  const result: string[] = []

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > 4) return
    let entries: string[]
    try {
      entries = await readdir(dir)
    } catch {
      return
    }

    for (const entry of entries) {
      if (SKIP.has(entry)) continue
      const full = join(dir, entry)
      let s
      try { s = await stat(full) } catch { continue }
      if (s.isDirectory()) {
        await walk(full, depth + 1)
      } else if (s.isFile()) {
        const ext = extname(entry).toLowerCase()
        if (TEXT_EXTENSIONS.has(ext)) result.push(full)
      }
    }
  }

  await walk(absDir, 0)
  return result
}

function getGitDiffFiles(cwd: string): string[] {
  try {
    const output = execSync('git diff --name-only HEAD', { cwd, stdio: ['pipe', 'pipe', 'pipe'] })
      .toString()
      .trim()
    if (!output) return []
    return output.split('\n').map((f) => join(cwd, f.trim())).filter(Boolean)
  } catch {
    return []
  }
}

function langFromExt(ext: string): string {
  const MAP: Record<string, string> = {
    '.ts': 'typescript', '.tsx': 'tsx', '.js': 'javascript', '.jsx': 'jsx',
    '.py': 'python', '.rs': 'rust', '.go': 'go', '.java': 'java',
    '.kt': 'kotlin', '.swift': 'swift', '.dart': 'dart',
    '.json': 'json', '.yaml': 'yaml', '.yml': 'yaml', '.toml': 'toml',
    '.md': 'markdown', '.sh': 'bash', '.bash': 'bash',
    '.html': 'html', '.css': 'css', '.scss': 'scss',
    '.sql': 'sql', '.prisma': 'prisma', '.vue': 'vue', '.svelte': 'svelte',
  }
  return MAP[ext] ?? ''
}
