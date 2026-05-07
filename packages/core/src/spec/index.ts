import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { createHash } from 'node:crypto'

/**
 * Spec-driven development (K6) — convert a `<feature>.md` spec into a checked
 * implementation plan, then track drift between the spec and the resulting
 * code over time.
 *
 * Specs are versioned by their content hash. The agent stores the hash that
 * implementation was generated from, so future runs can detect "spec changed
 * but code didn't" and "code drifted from spec".
 */

export interface SpecTask {
  id: string
  title: string
  description: string
  acceptance: string[]
  /** Files the agent expects to touch — populated during plan */
  files?: string[]
  status: 'pending' | 'in_progress' | 'done'
}

export interface SpecPlan {
  specPath: string
  specHash: string
  generatedAt: string
  tasks: SpecTask[]
}

const HEADING_RE = /^##\s+(.+)$/
const ACCEPT_RE = /^[-*]\s+\[\s*\]\s+(.+)$/

/**
 * Parse a spec file into discrete tasks. Convention:
 *   ## Task title
 *   Description paragraph(s).
 *   - [ ] Acceptance criterion 1
 *   - [ ] Acceptance criterion 2
 */
export function parseSpec(content: string): SpecTask[] {
  const lines = content.split(/\r?\n/)
  const tasks: SpecTask[] = []
  let current: SpecTask | null = null
  const descBuf: string[] = []

  const flush = () => {
    if (!current) return
    current.description = descBuf.join('\n').trim()
    tasks.push(current)
    current = null
    descBuf.length = 0
  }

  let n = 0
  for (const line of lines) {
    const heading = line.match(HEADING_RE)
    if (heading) {
      flush()
      n++
      current = {
        id: `t${n}`,
        title: heading[1]!.trim(),
        description: '',
        acceptance: [],
        status: 'pending',
      }
      continue
    }
    if (!current) continue
    const accept = line.match(ACCEPT_RE)
    if (accept) {
      current.acceptance.push(accept[1]!.trim())
      continue
    }
    descBuf.push(line)
  }
  flush()
  return tasks
}

export function hashSpec(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16)
}

export class SpecManager {
  constructor(private readonly stateDir: string) {}

  private statePath(specPath: string): string {
    const hash = createHash('md5').update(resolve(specPath)).digest('hex').slice(0, 12)
    return join(this.stateDir, `${hash}.json`)
  }

  async expand(specPath: string): Promise<SpecPlan> {
    const abs = resolve(specPath)
    const content = await readFile(abs, 'utf-8')
    const tasks = parseSpec(content)
    if (tasks.length === 0) {
      throw new Error(`No tasks parsed from ${specPath}. Use "## Task" headings with "- [ ] criteria".`)
    }
    const plan: SpecPlan = {
      specPath: abs,
      specHash: hashSpec(content),
      generatedAt: new Date().toISOString(),
      tasks,
    }
    await mkdir(this.stateDir, { recursive: true })
    await writeFile(this.statePath(abs), JSON.stringify(plan, null, 2), 'utf-8')
    return plan
  }

  async loadPlan(specPath: string): Promise<SpecPlan | null> {
    const p = this.statePath(specPath)
    if (!existsSync(p)) return null
    return JSON.parse(await readFile(p, 'utf-8')) as SpecPlan
  }

  /** Compare current spec against the saved plan. */
  async diff(specPath: string): Promise<{ changed: boolean; previousHash?: string; currentHash: string }> {
    const abs = resolve(specPath)
    const content = await readFile(abs, 'utf-8')
    const currentHash = hashSpec(content)
    const plan = await this.loadPlan(abs)
    if (!plan) return { changed: true, currentHash }
    return {
      changed: plan.specHash !== currentHash,
      previousHash: plan.specHash,
      currentHash,
    }
  }

  async updateTaskStatus(specPath: string, taskId: string, status: SpecTask['status']): Promise<void> {
    const plan = await this.loadPlan(specPath)
    if (!plan) throw new Error(`No plan stored for ${specPath} — call expand() first`)
    const task = plan.tasks.find((t) => t.id === taskId)
    if (!task) throw new Error(`Task not found: ${taskId}`)
    task.status = status
    await mkdir(dirname(this.statePath(specPath)), { recursive: true })
    await writeFile(this.statePath(specPath), JSON.stringify(plan, null, 2), 'utf-8')
  }
}
