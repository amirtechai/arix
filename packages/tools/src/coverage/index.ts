/**
 * coverage_report (N7) — read coverage output from common tools and surface
 * the lowest-covered files so the agent can target test additions.
 */

import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { Tool, ToolResult } from '@arix-code/core'

interface FileCov {
  path: string
  pct: number
  uncoveredLines: number
}

async function readJsonSummary(file: string): Promise<FileCov[] | null> {
  if (!existsSync(file)) return null
  try {
    const raw = JSON.parse(await readFile(file, 'utf-8')) as Record<string, {
      lines?: { pct?: number; total?: number; covered?: number }
    }>
    const out: FileCov[] = []
    for (const [path, cov] of Object.entries(raw)) {
      if (path === 'total') continue
      const pct = cov.lines?.pct ?? 0
      const uncovered = (cov.lines?.total ?? 0) - (cov.lines?.covered ?? 0)
      out.push({ path, pct, uncoveredLines: uncovered })
    }
    return out
  } catch { return null }
}

async function readLcov(file: string): Promise<FileCov[] | null> {
  if (!existsSync(file)) return null
  const text = await readFile(file, 'utf-8')
  const out: FileCov[] = []
  let path = '', found = 0, hit = 0
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('SF:')) { path = line.slice(3); found = 0; hit = 0 }
    else if (line.startsWith('LF:')) { found = Number(line.slice(3)) }
    else if (line.startsWith('LH:')) { hit = Number(line.slice(3)) }
    else if (line.startsWith('end_of_record')) {
      const pct = found === 0 ? 100 : (hit / found) * 100
      out.push({ path, pct, uncoveredLines: found - hit })
      path = ''; found = 0; hit = 0
    }
  }
  return out.length > 0 ? out : null
}

export class CoverageReportTool implements Tool {
  readonly name = 'coverage_report'
  readonly description =
    'Parse a coverage report (coverage-summary.json from nyc/c8/jest, or lcov.info) and list the N least-covered files.'
  readonly requiresConfirmation = false
  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      cwd:    { type: 'string' },
      top:    { type: 'number', description: 'How many files to surface (default 10)' },
      threshold: { type: 'number', description: 'Only include files below this percentage (default 80)' },
      file:   { type: 'string', description: 'Explicit path to coverage file (overrides auto-detect)' },
    },
  }

  constructor(private readonly cwd: string) {}

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const cwd = resolve((input['cwd'] as string | undefined) ?? this.cwd)
    const top = (input['top'] as number | undefined) ?? 10
    const threshold = (input['threshold'] as number | undefined) ?? 80
    const explicit = input['file'] as string | undefined

    const candidates = explicit ? [resolve(cwd, explicit)] : [
      join(cwd, 'coverage', 'coverage-summary.json'),
      join(cwd, 'coverage', 'coverage-final.json'),
      join(cwd, 'coverage', 'lcov.info'),
    ]

    let cov: FileCov[] | null = null
    let used = ''
    for (const c of candidates) {
      cov = c.endsWith('.info') ? await readLcov(c) : await readJsonSummary(c)
      if (cov) { used = c; break }
    }
    if (!cov) {
      return { toolCallId: '', success: false, output: '', error: 'No coverage report found. Run tests with coverage first.' }
    }

    const filtered = cov.filter((f) => f.pct < threshold).sort((a, b) => a.pct - b.pct).slice(0, top)
    const totalAvg = cov.reduce((s, f) => s + f.pct, 0) / Math.max(cov.length, 1)
    const lines = [
      `Coverage source: ${used}`,
      `Average: ${totalAvg.toFixed(1)}%   files below ${threshold}%: ${filtered.length}/${cov.length}`,
      '',
      ...filtered.map((f) => `  ${f.pct.toFixed(1).padStart(6)}%  (${f.uncoveredLines} uncovered)  ${f.path}`),
    ]
    return { toolCallId: '', success: true, output: lines.join('\n') }
  }
}
