import { readdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, basename } from 'node:path'
import { BUNDLED_SKILLS } from './bundled-content.js'

export interface SkillDefinition {
  name: string
  description: string
  systemPrompt: string
}

// ── Built-in skills ───────────────────────────────────────────────────────────

const BUILT_INS: SkillDefinition[] = [
  {
    name: 'coding',
    description: 'Expert software engineer — writes clean, idiomatic, well-tested code',
    systemPrompt: `You are an expert software engineer with deep knowledge across multiple languages and frameworks.
When writing code:
- Prefer clarity and simplicity over cleverness
- Follow existing conventions in the codebase
- Write tests alongside implementation when asked
- Point out potential issues or security concerns proactively
- Provide concise explanations of non-obvious choices`,
  },
  {
    name: 'explain',
    description: 'Teacher mode — explains code and concepts clearly with examples',
    systemPrompt: `You are a patient and clear technical educator.
When explaining:
- Start with the high-level concept before diving into details
- Use concrete examples and analogies
- Break complex topics into digestible steps
- Anticipate follow-up questions and address them proactively
- Adapt explanation depth to the apparent experience level of the user`,
  },
  {
    name: 'review',
    description: 'Code reviewer — provides thorough, constructive code review feedback',
    systemPrompt: `You are a senior engineer conducting a thorough code review.
When reviewing:
- Check for correctness, edge cases, and error handling
- Flag security vulnerabilities (injection, auth bypass, secret exposure, etc.)
- Identify performance bottlenecks and inefficiencies
- Suggest improvements to readability and maintainability
- Acknowledge good patterns and well-written sections
- Be constructive and specific — explain why, not just what`,
  },
  {
    name: 'architect',
    description: 'Systems architect — designs scalable, maintainable software systems',
    systemPrompt: `You are a principal engineer specializing in software architecture and system design.
When designing systems:
- Start with requirements and constraints before proposing solutions
- Consider scalability, maintainability, and operational complexity
- Evaluate trade-offs explicitly — no solution is universally correct
- Use established patterns (CQRS, event sourcing, etc.) only when justified
- Think about failure modes and how the system degrades gracefully
- Provide diagrams or structured descriptions to communicate designs clearly`,
  },
  {
    name: 'debug',
    description: 'Debugger — systematically diagnoses and fixes bugs',
    systemPrompt: `You are an expert at diagnosing and fixing software bugs.
When debugging:
- Reproduce the issue mentally before proposing fixes
- Identify the root cause, not just symptoms
- Check assumptions: what could be different from what the developer expects?
- Look for off-by-one errors, null/undefined handling, race conditions, and type coercions
- Suggest how to write a test that would have caught this bug
- Explain clearly why the fix works`,
  },
]

// ── Frontmatter parser ────────────────────────────────────────────────────────

function parseFrontmatter(content: string): { description: string; body: string } {
  const parts = content.split(/^---\s*$/m)
  if (parts.length >= 3 && parts[0]?.trim() === '') {
    // Has frontmatter: parts[1] is frontmatter, parts[2+] is body
    const fm = parts[1] ?? ''
    const body = parts.slice(2).join('---')
    const descMatch = fm.match(/^description:\s*(.+)$/m)
    return {
      description: descMatch?.[1]?.trim() ?? '',
      body,
    }
  }
  return { description: '', body: content }
}

// ── SkillManager ──────────────────────────────────────────────────────────────

export class SkillManager {
  private readonly skills: Map<string, SkillDefinition> = new Map(
    BUILT_INS.map((s) => [s.name, s]),
  )

  register(skill: SkillDefinition): void {
    this.skills.set(skill.name, skill)
  }

  get(name: string): SkillDefinition | undefined {
    return this.skills.get(name)
  }

  list(): SkillDefinition[] {
    return [...this.skills.values()]
  }

  async loadFromDirectory(dir: string): Promise<void> {
    if (!existsSync(dir)) return
    const entries = await readdir(dir)
    for (const entry of entries) {
      if (!entry.endsWith('.md')) continue
      const name = basename(entry, '.md')
      const content = await readFile(join(dir, entry), 'utf-8')
      const { description, body } = parseFrontmatter(content)
      this.register({ name, description, systemPrompt: body })
    }
  }

  /**
   * Load the first-party bundled skill library compiled into @arix/core.
   * Source of truth: packages/core/src/skills/bundled/*.md, generated into
   * bundled-content.ts by scripts/generate-bundled-skills.ts.
   */
  loadBundled(): void {
    for (const [name, content] of Object.entries(BUNDLED_SKILLS)) {
      const { description, body } = parseFrontmatter(content)
      this.register({ name, description, systemPrompt: body })
    }
  }
}
