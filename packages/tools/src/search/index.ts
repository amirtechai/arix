/**
 * SemanticSearchTool — natural-language code search.
 *
 * Uses ripgrep (preferred) or grep fallback. Features:
 *  - Query decomposition: "auth logic" → [auth, login, signin, token, authenticate]
 *  - Symbol context: shows enclosing function/class signature for each match
 *  - Ranked results: definition hits > usage hits > comment hits
 *  - Language-aware file filtering
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { resolve, relative } from 'node:path'
import type { Tool, ToolResult } from '@arix/core'

const execFileAsync = promisify(execFile)

// ── Query expansion ───────────────────────────────────────────────────────────

const SYNONYMS: Record<string, string[]> = {
  auth:           ['auth', 'login', 'signin', 'authenticate', 'token', 'jwt', 'session'],
  user:           ['user', 'account', 'profile', 'member'],
  database:       ['db', 'database', 'repo', 'repository', 'store', 'storage', 'prisma', 'supabase'],
  connect:        ['connect', 'connection', 'pool', 'socket'],
  error:          ['error', 'exception', 'catch', 'throw', 'fail'],
  payment:        ['payment', 'billing', 'stripe', 'charge', 'subscription', 'invoice'],
  route:          ['route', 'router', 'endpoint', 'path', 'handler'],
  config:         ['config', 'configuration', 'settings', 'env', 'options'],
  test:           ['test', 'spec', 'describe', 'it(', 'expect'],
  middleware:     ['middleware', 'interceptor', 'guard', 'hook'],
  validation:     ['valid', 'validate', 'schema', 'zod', 'yup', 'joi'],
  cache:          ['cache', 'redis', 'memcache', 'ttl'],
  file:           ['file', 'upload', 'download', 'storage', 'bucket', 's3'],
  notification:   ['notif', 'email', 'sms', 'push', 'webhook', 'alert'],
  search:         ['search', 'query', 'filter', 'find', 'index', 'elastic'],
  permission:     ['permission', 'role', 'acl', 'rbac', 'scope', 'grant', 'policy'],
}

function expandQuery(query: string): string[] {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2)
  const terms = new Set<string>()

  for (const word of words) {
    terms.add(word)
    // Direct synonym match
    for (const [key, syns] of Object.entries(SYNONYMS)) {
      if (word.includes(key) || key.includes(word)) {
        syns.forEach((s) => terms.add(s))
        break
      }
    }
  }

  // Keep top 6 terms to avoid over-broad searches
  return [...terms].slice(0, 6)
}

// ── Symbol context extraction ─────────────────────────────────────────────────

// Detects function/class/method definition lines
const DEFINITION_RE = /^\s*(export\s+)?(async\s+)?(function|class|const|let|var|def|fn|func|interface|type|enum)\s+(\w+)/

function scoreMatch(line: string): number {
  if (DEFINITION_RE.test(line)) return 3        // definition
  if (/^\s*(\/\/|#|\/\*|\*)\s/.test(line)) return 1   // comment
  return 2                                       // usage
}

// ── Grep runner (rg with grep fallback) ──────────────────────────────────────

interface RawMatch {
  file: string
  lineNo: number
  line: string
  context: string[]
  score: number
  enclosing?: string
}

async function runSearch(
  terms: string[],
  searchPath: string,
  cwd: string,
  filePattern: string | undefined,
  maxResults: number,
  definitionsOnly: boolean,
): Promise<RawMatch[]> {
  const results: RawMatch[] = []
  const seen = new Set<string>()  // "file:lineNo" dedup

  // Try rg first, fall back to grep
  const useRg = await checkCommand('rg')
  const cmd = useRg ? 'rg' : 'grep'

  for (const term of terms) {
    const args = useRg
      ? buildRgArgs(term, searchPath, filePattern)
      : buildGrepArgs(term, searchPath, filePattern)

    let stdout = ''
    try {
      const res = await execFileAsync(cmd, args, { maxBuffer: 2 * 1024 * 1024 })
      stdout = res.stdout
    } catch (err: unknown) {
      const e = err as { code?: number }
      if (e.code === 1) continue  // no matches — not an error
      continue
    }

    for (const block of parseOutput(stdout, useRg)) {
      const key = `${block.file}:${block.lineNo}`
      if (seen.has(key)) continue
      seen.add(key)
      const score = scoreMatch(block.line)
      if (definitionsOnly && score !== 3) continue
      results.push({ ...block, score })
    }
  }

  // Sort: definitions first, then usage, then comments; within each group by file
  results.sort((a, b) => b.score - a.score || a.file.localeCompare(b.file))

  const trimmed = results.slice(0, maxResults)
  // Enrich with enclosing symbol via lazy file reads (cached per file)
  await enrichEnclosing(trimmed)

  return trimmed.map((r) => ({ ...r, file: relative(cwd, r.file) }))
}

// ── Enclosing symbol resolution ───────────────────────────────────────────────

async function enrichEnclosing(matches: RawMatch[]): Promise<void> {
  const { readFile } = await import('node:fs/promises')
  const fileCache = new Map<string, string[]>()

  for (const m of matches) {
    if (m.score === 3) continue  // already a definition itself
    let lines = fileCache.get(m.file)
    if (!lines) {
      try {
        const content = await readFile(m.file, 'utf8')
        lines = content.split('\n')
        fileCache.set(m.file, lines)
      } catch {
        continue
      }
    }
    // Backward scan from match line for nearest definition
    for (let i = Math.min(m.lineNo - 1, lines.length - 1); i >= 0; i--) {
      const candidate = lines[i]!
      const def = candidate.match(DEFINITION_RE)
      if (def) {
        const sig = candidate.trim().slice(0, 80)
        m.enclosing = sig + (candidate.trim().length > 80 ? '…' : '')
        break
      }
    }
  }
}

function buildRgArgs(term: string, path: string, pattern?: string): string[] {
  const args = ['-n', '--no-heading', '-C', '2', '--max-count', '20', term, path]
  if (pattern) args.splice(-2, 0, '--glob', pattern)
  return args
}

function buildGrepArgs(term: string, path: string, pattern?: string): string[] {
  const args = ['-rn', '--color=never', '-E', '-A', '2', '-B', '2', term, path]
  if (pattern) args.splice(-1, 0, `--include=${pattern}`)
  return args
}

async function checkCommand(cmd: string): Promise<boolean> {
  try {
    await execFileAsync(cmd, ['--version'])
    return true
  } catch {
    return false
  }
}

interface ParsedMatch {
  file: string
  lineNo: number
  line: string
  context: string[]
}

function parseOutput(stdout: string, isRg: boolean): ParsedMatch[] {
  const results: ParsedMatch[] = []
  const lines = stdout.trim().split('\n')

  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
    // rg: "path/file.ts:42:matched content" or grep context separator "--"
    if (line === '--') { i++; continue }

    const matchLine = isRg
      ? line.match(/^(.+?):(\d+):(.*)$/)
      : line.match(/^(.+?):(\d+):(.*)$/)

    if (!matchLine) { i++; continue }

    const [, file, lineNoStr, content] = matchLine
    if (!file || !lineNoStr || content === undefined) { i++; continue }

    // Collect context lines (- separator lines from grep/rg)
    const context: string[] = []
    let j = i + 1
    while (j < lines.length && j < i + 5) {
      const ctx = lines[j]!
      if (ctx === '--') break
      // rg context: "file-lineNo-content" (dash instead of colon)
      const ctxMatch = ctx.match(/^.+?[-:](\d+)[-:](.*)$/)
      if (ctxMatch) context.push(ctxMatch[2]!)
      j++
    }

    results.push({ file, lineNo: parseInt(lineNoStr, 10), line: content, context })
    i = j
  }

  return results
}

// ── Format output ─────────────────────────────────────────────────────────────

function formatResults(matches: RawMatch[], query: string): string {
  if (matches.length === 0) return `No results for: "${query}"`

  const grouped = new Map<string, RawMatch[]>()
  for (const m of matches) {
    const list = grouped.get(m.file) ?? []
    list.push(m)
    grouped.set(m.file, list)
  }

  const lines: string[] = [`Found ${matches.length} result${matches.length !== 1 ? 's' : ''} for "${query}"\n`]

  for (const [file, fileMatches] of grouped) {
    lines.push(`── ${file}`)
    for (const m of fileMatches) {
      const kind = m.score === 3 ? '[def]' : m.score === 1 ? '[doc]' : '[use]'
      lines.push(`  ${kind} L${m.lineNo}: ${m.line.trimStart()}`)
      if (m.enclosing) {
        lines.push(`         ↪ in: ${m.enclosing}`)
      }
      if (m.context.length > 0) {
        lines.push(...m.context.slice(0, 2).map((c) => `         ${c.trimStart()}`))
      }
    }
    lines.push('')
  }

  return lines.join('\n').trimEnd()
}

// ── Tool ─────────────────────────────────────────────────────────────────────

export class SemanticSearchTool implements Tool {
  readonly name = 'semantic_search'
  readonly description =
    'Natural-language code search. Finds relevant code by expanding query terms and searching across the codebase. Better than grep for conceptual queries like "auth logic" or "payment flow".'
  readonly requiresConfirmation = false
  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: 'Natural language search query, e.g. "authentication logic" or "database connection pool"',
      },
      path: {
        type: 'string',
        description: 'Directory to search in (default: cwd)',
      },
      filePattern: {
        type: 'string',
        description: 'Glob to filter files, e.g. "*.ts" or "**/*.py"',
      },
      maxResults: {
        type: 'number',
        description: 'Max results to return (default: 30)',
      },
      definitionsOnly: {
        type: 'boolean',
        description: 'Return only definition matches (functions, classes, types). Skips usages and comments.',
      },
    },
    required: ['query'],
  }

  constructor(private readonly cwd: string) {}

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const query = input['query'] as string
    const searchPath = resolve((input['path'] as string | undefined) ?? this.cwd)
    const filePattern = input['filePattern'] as string | undefined
    const maxResults = (input['maxResults'] as number | undefined) ?? 30
    const definitionsOnly = (input['definitionsOnly'] as boolean | undefined) ?? false

    const terms = expandQuery(query)
    const matches = await runSearch(terms, searchPath, this.cwd, filePattern, maxResults, definitionsOnly)
    const output = formatResults(matches, query)

    return { toolCallId: '', success: true, output }
  }
}
