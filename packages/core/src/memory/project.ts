/**
 * ProjectMemory — persistent, session-spanning knowledge about a codebase.
 *
 * After each session the agent can extract facts it learned about the project
 * (architecture patterns, key files, conventions, known gotchas) and persist
 * them to ~/.arix/projects/<hash>/memory.json.
 *
 * On next session start, the memory is injected into the system prompt so the
 * agent doesn't re-discover the same things from scratch.
 *
 * Facts are stored as free-form key→value pairs. The agent decides what to
 * record via a structured extraction prompt run at session end.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createHash } from 'node:crypto'

// ── Types ──────────────────────────────────────────────────────────────────

export interface MemoryFact {
  key: string
  value: string
  /** ISO timestamp of last update */
  updatedAt: string
  /** How many times this fact was seen/confirmed */
  confidence: number
}

export interface ProjectMemoryData {
  projectId: string
  projectRoot: string
  lastUpdated: string
  facts: MemoryFact[]
}

// ── ProjectMemory ──────────────────────────────────────────────────────────

export class ProjectMemory {
  private readonly projectId: string
  private readonly memPath: string
  private data: ProjectMemoryData | null = null

  constructor(projectRoot: string) {
    // Stable ID from the absolute path
    this.projectId = createHash('sha256').update(projectRoot).digest('hex').slice(0, 16)
    this.memPath = join(homedir(), '.arix', 'projects', this.projectId, 'memory.json')
  }

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.memPath, 'utf8')
      this.data = JSON.parse(raw) as ProjectMemoryData
    } catch {
      this.data = null
    }
  }

  /** All known facts. Returns [] if not loaded yet. */
  get facts(): MemoryFact[] {
    return this.data?.facts ?? []
  }

  /** Number of known facts. */
  get size(): number {
    return this.facts.length
  }

  /**
   * Upsert a fact. If the key already exists, updates value and bumps confidence.
   */
  set(key: string, value: string): void {
    if (!this.data) {
      this.data = {
        projectId: this.projectId,
        projectRoot: '',
        lastUpdated: new Date().toISOString(),
        facts: [],
      }
    }

    const existing = this.data.facts.find((f) => f.key === key)
    if (existing) {
      existing.value = value
      existing.updatedAt = new Date().toISOString()
      existing.confidence = Math.min(existing.confidence + 1, 10)
    } else {
      this.data.facts.push({
        key,
        value,
        updatedAt: new Date().toISOString(),
        confidence: 1,
      })
    }
    this.data.lastUpdated = new Date().toISOString()
  }

  /** Remove a fact by key. */
  forget(key: string): boolean {
    if (!this.data) return false
    const before = this.data.facts.length
    this.data.facts = this.data.facts.filter((f) => f.key !== key)
    return this.data.facts.length < before
  }

  /** Clear all facts. */
  clear(): void {
    if (this.data) this.data.facts = []
  }

  /**
   * Generate a system prompt injection from current facts.
   * Inlined into the agent's system prompt at session start.
   */
  toSystemPromptSection(): string {
    const facts = this.facts
    if (facts.length === 0) return ''

    const lines = facts
      .sort((a, b) => b.confidence - a.confidence)
      .map((f) => `• **${f.key}**: ${f.value}`)
      .join('\n')

    return `## Project Knowledge (learned from previous sessions)\n${lines}\n`
  }

  /**
   * Extract a structured extraction prompt for the agent to run at session end.
   * The agent should respond with JSON: Array<{ key: string, value: string }>
   */
  static extractionPrompt(sessionSummary: string): string {
    return `Based on the following session summary, extract key facts about the codebase that would be useful to remember for future sessions.

Session summary:
${sessionSummary}

Return a JSON array of fact objects. Each fact should have:
- "key": short descriptor (e.g. "auth-system", "test-framework", "main-entry-point")
- "value": concise description (1-2 sentences max)

Focus on:
- Architecture patterns and conventions
- Key file locations and their purposes
- Framework/library choices and versions
- Known gotchas or non-obvious behaviours
- Current work-in-progress state

Return ONLY valid JSON, no other text. Example:
[{"key":"state-management","value":"Uses Zustand, stores in src/stores/"},{"key":"test-runner","value":"Vitest with jsdom, run with pnpm test"}]`
  }

  /**
   * Parse agent response and apply extracted facts.
   * Returns number of facts added/updated.
   */
  applyExtracted(jsonResponse: string): number {
    let facts: Array<{ key: string; value: string }>
    try {
      // Extract JSON from possible markdown code block
      const match = jsonResponse.match(/\[[\s\S]*\]/)
      facts = JSON.parse(match?.[0] ?? jsonResponse) as Array<{ key: string; value: string }>
    } catch {
      return 0
    }

    let count = 0
    for (const fact of facts) {
      if (typeof fact.key === 'string' && typeof fact.value === 'string') {
        this.set(fact.key, fact.value)
        count++
      }
    }
    return count
  }

  async save(projectRoot: string): Promise<void> {
    if (!this.data) return
    this.data.projectRoot = projectRoot
    this.data.lastUpdated = new Date().toISOString()
    await mkdir(join(homedir(), '.arix', 'projects', this.projectId), { recursive: true })
    await writeFile(this.memPath, JSON.stringify(this.data, null, 2), 'utf8')
  }
}
