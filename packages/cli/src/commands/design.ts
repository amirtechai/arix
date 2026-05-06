/**
 * arix design — Architecture-First Development
 *
 * Produces a full design spec before any code is written:
 *   - High-level architecture
 *   - Component breakdown
 *   - Data model + Mermaid ERD
 *   - API contracts
 *   - User flow (ASCII diagram)
 *   - Trade-off analysis
 *   - Implementation roadmap
 *
 * Flags:
 *   --build   Generate project scaffold from the spec
 *   --save    Save spec to docs/design/<slug>.md (default: true)
 *   --model   Override model (default: most capable available)
 */

import type { Command } from 'commander'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { bootstrap } from '../bootstrap.js'
import type { AgentEvent } from '@arix/core'

// ── ANSI ────────────────────────────────────────────────────────────────────

const isTTY = process.stdout.isTTY
const c = {
  reset:   isTTY ? '\x1b[0m'  : '',
  bold:    isTTY ? '\x1b[1m'  : '',
  dim:     isTTY ? '\x1b[2m'  : '',
  cyan:    isTTY ? '\x1b[36m' : '',
  green:   isTTY ? '\x1b[32m' : '',
  yellow:  isTTY ? '\x1b[33m' : '',
  magenta: isTTY ? '\x1b[35m' : '',
  gray:    isTTY ? '\x1b[90m' : '',
}

// ── Design prompt ────────────────────────────────────────────────────────────

function buildDesignPrompt(description: string, includeBuild: boolean): string {
  return `You are a world-class software architect. Produce a comprehensive design specification for the following feature/system. Be thorough, concrete, and opinionated.

## Feature Request
${description}

## Required Output Sections

### 1. Overview
One paragraph executive summary: what this is, why it matters, key constraints.

### 2. Architecture
High-level architecture description. Then produce a Mermaid architecture diagram:
\`\`\`mermaid
graph TD
  ...
\`\`\`

### 3. Component Breakdown
Table of all components/modules:
| Component | Responsibility | Technology | Notes |
|-----------|---------------|------------|-------|

### 4. Data Model
Key entities and relationships. Include a Mermaid ERD:
\`\`\`mermaid
erDiagram
  ...
\`\`\`

### 5. API Contracts
For each public interface, specify:
- Method signature / endpoint
- Input/output types
- Error cases

### 6. User Flow
Step-by-step user journey. Include ASCII flow diagram:
\`\`\`
[User] → [Step 1] → [Step 2] → [Result]
\`\`\`

### 7. Edge Cases & Error Handling
Enumerate at least 5 edge cases and how each is handled.

### 8. Trade-off Analysis
| Option | Pros | Cons | Decision |
|--------|------|------|----------|

### 9. Security Considerations
Authentication, authorization, input validation, sensitive data handling.

### 10. Implementation Roadmap
Ordered list of implementation steps with estimated complexity:
1. [Step] — [complexity: low/medium/high] — [dependencies]
2. ...

${includeBuild ? `
### 11. Project Scaffold
Generate the complete folder structure and key file templates for this implementation. Use this format:
\`\`\`
project/
├── src/
│   ├── components/
│   │   └── ComponentName.ts  # Brief description
│   └── ...
\`\`\`
Then provide the content of the 3 most important files with full production-ready code.
` : ''}

Be specific, not generic. Name actual technologies, libraries, patterns. No placeholder text.`
}

// ── Slugify ──────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 50)
}

// ── Markdown renderer ────────────────────────────────────────────────────────

function renderLine(line: string): string {
  if (!isTTY) return line
  return line
    .replace(/```(\w*)/g, `${c.gray}▌ ${c.cyan}$1${c.reset}`)
    .replace(/^#{3}\s+(.+)$/gm, `${c.bold}${c.cyan}$1${c.reset}`)
    .replace(/^#{2}\s+(.+)$/gm, `${c.bold}${c.magenta}$1${c.reset}`)
    .replace(/^#{1}\s+(.+)$/gm, `${c.bold}${c.yellow}$1${c.reset}`)
    .replace(/\*\*([^*]+)\*\*/g, `${c.bold}$1${c.reset}`)
    .replace(/`([^`]+)`/g, `${c.cyan}$1${c.reset}`)
    .replace(/^\|\s*(.+)/gm, `${c.dim}│${c.reset} $1`)
}

// ── Main command ─────────────────────────────────────────────────────────────

export function registerDesign(program: Command): void {
  program
    .command('design <description...>')
    .description('Produce an architecture design spec before writing code')
    .option('--build', 'Also generate a project scaffold from the spec')
    .option('--no-save', 'Do not save spec to docs/design/')
    .option('-m, --model <model>', 'Override model (default: most capable)')
    .option('-p, --provider <provider>', 'Override provider')
    .action(async (descriptionWords: string[], opts: Record<string, unknown>) => {
      const description = descriptionWords.join(' ')
      const includeBuild = Boolean(opts['build'])
      const doSave = opts['save'] !== false
      const cwd = process.cwd()

      process.stdout.write(
        `\n${c.bold}${c.cyan}Arix Design${c.reset} ${c.gray}— Architecture-First Development${c.reset}\n` +
        `${c.dim}Feature: ${description}${c.reset}\n\n`
      )

      const { loop, mcpRegistry } = await bootstrap(cwd, undefined, {
        ...(opts['model'] ? { model: opts['model'] as string } : {}),
        ...(opts['provider'] ? { provider: opts['provider'] as string } : {}),
      })

      const prompt = buildDesignPrompt(description, includeBuild)
      let fullOutput = ''
      let buffer = ''

      process.stdout.write(`${c.gray}Designing...${c.reset}\n\n`)

      try {
        for await (const event of loop.run(prompt) as AsyncIterable<AgentEvent>) {
          if (event.type === 'text') {
            fullOutput += event.chunk
            buffer += event.chunk
            // Flush completed lines
            const lines = buffer.split('\n')
            for (let i = 0; i < lines.length - 1; i++) {
              process.stdout.write(renderLine(lines[i]!) + '\n')
            }
            buffer = lines[lines.length - 1] ?? ''
          } else if (event.type === 'done') {
            if (buffer) { process.stdout.write(renderLine(buffer) + '\n'); buffer = '' }
          } else if (event.type === 'error') {
            process.stderr.write(`\n${c.yellow}Error: ${event.error}${c.reset}\n`)
          }
        }
      } finally {
        mcpRegistry.disconnectAll()
      }

      // Save to docs/design/
      if (doSave && fullOutput) {
        const slug = slugify(description)
        const timestamp = new Date().toISOString().slice(0, 10)
        const filename = `${timestamp}-${slug}.md`
        const docsDir = join(cwd, 'docs', 'design')

        try {
          await mkdir(docsDir, { recursive: true })
          const header = `# Design: ${description}\n\n> Generated by Arix on ${new Date().toLocaleString()}\n\n`
          await writeFile(join(docsDir, filename), header + fullOutput, 'utf-8')
          process.stdout.write(
            `\n${c.green}✓${c.reset} ${c.gray}Spec saved to ${c.reset}${c.cyan}docs/design/${filename}${c.reset}\n`
          )
        } catch {
          process.stdout.write(`\n${c.gray}(Could not save spec — no write access)${c.reset}\n`)
        }
      }

      process.stdout.write('\n')
    })
}
