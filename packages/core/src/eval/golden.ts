/**
 * Golden trace replay (M2) — record a known-good agent session to NDJSON,
 * replay it later, diff the new run against the recorded events. Catches
 * regressions where prompt changes silently flip behaviour.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname } from 'node:path'

export interface GoldenEvent {
  /** turn ordinal (0-based) */
  turn: number
  type: 'text' | 'tool_call' | 'tool_result' | 'error'
  /** for type=text the assistant text concatenated for this turn */
  text?: string
  /** for tool_call */
  tool?: string
  input?: Record<string, unknown>
  /** for tool_result — only structural fields, never raw content (size!) */
  output?: { length: number; sha1Prefix: string; success: boolean }
  /** for error */
  error?: string
}

export interface GoldenTrace {
  name: string
  recordedAt: string
  events: GoldenEvent[]
}

import { createHash } from 'node:crypto'

function sha1Prefix(s: string): string {
  return createHash('sha1').update(s).digest('hex').slice(0, 8)
}

/** Build a structural fingerprint from a transcript of agent events. */
export function buildTrace(name: string, events: Array<{
  turn: number
  type: 'text' | 'tool_call' | 'tool_result' | 'error'
  text?: string
  tool?: string
  input?: Record<string, unknown>
  output?: string
  success?: boolean
  error?: string
}>): GoldenTrace {
  return {
    name,
    recordedAt: new Date().toISOString(),
    events: events.map((e) => {
      if (e.type === 'tool_result' && e.output !== undefined) {
        return {
          turn: e.turn,
          type: 'tool_result',
          output: { length: e.output.length, sha1Prefix: sha1Prefix(e.output), success: e.success ?? true },
        }
      }
      if (e.type === 'tool_call') {
        return { turn: e.turn, type: 'tool_call', ...(e.tool ? { tool: e.tool } : {}), ...(e.input ? { input: e.input } : {}) }
      }
      if (e.type === 'text') {
        return { turn: e.turn, type: 'text', ...(e.text ? { text: e.text } : {}) }
      }
      return { turn: e.turn, type: 'error', ...(e.error ? { error: e.error } : {}) }
    }),
  }
}

export async function saveTrace(path: string, trace: GoldenTrace): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(trace, null, 2), 'utf-8')
}

export async function loadTrace(path: string): Promise<GoldenTrace> {
  if (!existsSync(path)) throw new Error(`Golden trace not found: ${path}`)
  return JSON.parse(await readFile(path, 'utf-8')) as GoldenTrace
}

export interface TraceDiff {
  match: boolean
  /** Differences in [recorded, observed] order */
  differences: Array<{
    index: number
    field: 'type' | 'tool' | 'input' | 'output.length' | 'output.success' | 'turn'
    recorded: unknown
    observed: unknown
  }>
}

export function diffTraces(recorded: GoldenTrace, observed: GoldenTrace): TraceDiff {
  const diffs: TraceDiff['differences'] = []
  const len = Math.max(recorded.events.length, observed.events.length)
  for (let i = 0; i < len; i++) {
    const a = recorded.events[i]
    const b = observed.events[i]
    if (!a || !b) {
      diffs.push({
        index: i,
        field: 'type',
        recorded: a?.type ?? '(absent)',
        observed: b?.type ?? '(absent)',
      })
      continue
    }
    if (a.type !== b.type) diffs.push({ index: i, field: 'type', recorded: a.type, observed: b.type })
    if (a.turn !== b.turn) diffs.push({ index: i, field: 'turn', recorded: a.turn, observed: b.turn })
    if (a.type === 'tool_call' && b.type === 'tool_call') {
      if (a.tool !== b.tool) diffs.push({ index: i, field: 'tool', recorded: a.tool, observed: b.tool })
      if (JSON.stringify(a.input) !== JSON.stringify(b.input)) {
        diffs.push({ index: i, field: 'input', recorded: a.input, observed: b.input })
      }
    }
    if (a.type === 'tool_result' && b.type === 'tool_result') {
      if (a.output?.length !== b.output?.length) {
        diffs.push({ index: i, field: 'output.length', recorded: a.output?.length, observed: b.output?.length })
      }
      if (a.output?.success !== b.output?.success) {
        diffs.push({ index: i, field: 'output.success', recorded: a.output?.success, observed: b.output?.success })
      }
    }
  }
  return { match: diffs.length === 0, differences: diffs }
}
