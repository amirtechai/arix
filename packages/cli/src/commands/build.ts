/**
 * arix build — Magic Build Mode
 *
 * Generates a complete project scaffold from a natural-language description.
 * The AI uses write_file tool calls to create each file in real-time.
 *
 * Usage:
 *   arix build "Next.js + Supabase SaaS starter"
 *   arix build "REST API with auth" --template api --dir ./my-api
 *   arix build "Flutter app" --template mobile --dry-run
 */

import type { Command } from 'commander'
import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { bootstrap } from '../bootstrap.js'

// ── ANSI helpers ──────────────────────────────────────────────────────────────

const isTTY = process.stdout.isTTY
const c = {
  reset:   isTTY ? '\x1b[0m'  : '',
  bold:    isTTY ? '\x1b[1m'  : '',
  dim:     isTTY ? '\x1b[2m'  : '',
  cyan:    isTTY ? '\x1b[36m' : '',
  green:   isTTY ? '\x1b[32m' : '',
  yellow:  isTTY ? '\x1b[33m' : '',
  red:     isTTY ? '\x1b[31m' : '',
  gray:    isTTY ? '\x1b[90m' : '',
  magenta: isTTY ? '\x1b[35m' : '',
  blue:    isTTY ? '\x1b[34m' : '',
}

// ── Templates ─────────────────────────────────────────────────────────────────

const TEMPLATES: Record<string, string> = {
  saas: `
Stack: Next.js 15 (App Router), TypeScript, Tailwind CSS, Supabase (auth + postgres), Stripe (billing).
Include: landing page, auth (login/signup/reset), dashboard, subscription gate, Supabase client, env.example.
`,
  api: `
Stack: Node.js, TypeScript, Fastify, Zod validation, Prisma ORM, JWT auth, Docker.
Include: routes, middleware, schema validation, error handling, tests (Vitest), Dockerfile, env.example.
`,
  cli: `
Stack: Node.js, TypeScript, Commander.js, tsup (build), Vitest (tests), semantic-release.
Include: main entry, commands/, utils/, tests/, package.json with scripts, tsconfig, README.
`,
  mobile: `
Stack: Flutter, Dart, Riverpod (state), GoRouter (nav), Supabase (backend), Freezed (models).
Include: lib/ structure, screens, providers, models, services, constants, pubspec.yaml.
`,
  lib: `
Stack: TypeScript library, tsup (build), Vitest (tests), semantic-release, JSDoc.
Include: src/index.ts, types, utils, tests, package.json (ESM+CJS), tsconfig, README.
`,
}

// ── Build prompt ──────────────────────────────────────────────────────────────

function buildPrompt(description: string, template: string | undefined, outDir: string, dryRun: boolean): string {
  const templateHint = template && TEMPLATES[template] ? `\nTemplate constraints:\n${TEMPLATES[template].trim()}` : ''

  const action = dryRun
    ? 'List every file you WOULD create with a one-line description — do NOT use write_file tool.'
    : `Use the write_file tool to create EVERY file. Write real, production-ready code — no placeholders, no "TODO: implement", no skeleton stubs. Each file must be complete and functional.`

  return `You are building a complete software project from scratch.

Project description: "${description}"${templateHint}

Output directory: ${outDir}

${action}

Requirements:
- Create ALL necessary files: package.json / pubspec.yaml, configs (tsconfig, eslint, prettier), entry points, source files, tests, .gitignore, .env.example, README.md
- Use modern best practices for the chosen stack
- Every source file must be fully implemented — real logic, real imports, real types
- README.md must include: what it is, setup steps, usage examples, env variables table
- Keep files focused (< 200 lines each) — split large concerns into separate modules
- Include at least 2 test files covering core functionality

Start immediately — create files in this order: config/setup files first, then core logic, then tests, then README.`
}

// ── Interactive stack questions ───────────────────────────────────────────────

async function askQuestion(prompt: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => rl.question(prompt, (ans) => { rl.close(); resolve(ans.trim()) }))
}

async function gatherInteractiveContext(description: string): Promise<string> {
  process.stdout.write(`\n${c.bold}${c.cyan}Magic Build — Interactive Setup${c.reset}\n\n`)
  process.stdout.write(`${c.gray}Press Enter to accept defaults${c.reset}\n\n`)

  const extras: string[] = []

  const authAns = await askQuestion(`${c.yellow}Authentication?${c.reset} [supabase/jwt/none] → `)
  if (authAns && authAns !== 'none') extras.push(`Auth: ${authAns}`)

  const dbAns = await askQuestion(`${c.yellow}Database?${c.reset} [postgres/sqlite/mongo/none] → `)
  if (dbAns && dbAns !== 'none') extras.push(`Database: ${dbAns}`)

  const testAns = await askQuestion(`${c.yellow}Test framework?${c.reset} [vitest/jest/none] → `)
  if (testAns && testAns !== 'none') extras.push(`Tests: ${testAns}`)

  const extraAns = await askQuestion(`${c.yellow}Any other requirements?${c.reset} (optional) → `)
  if (extraAns) extras.push(extraAns)

  process.stdout.write('\n')

  return extras.length > 0
    ? `${description}. Additional requirements: ${extras.join(', ')}.`
    : description
}

// ── slug helper ───────────────────────────────────────────────────────────────

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'project'
}

// ── Main command ──────────────────────────────────────────────────────────────

export function registerBuild(program: Command): void {
  program
    .command('build <description>')
    .description('Magic Build: scaffold a complete project from a description')
    .option('-t, --template <name>', 'Preset: saas | api | cli | mobile | lib')
    .option('-d, --dir <path>', 'Output directory (default: ./<project-slug>)')
    .option('-p, --provider <provider>', 'Override AI provider')
    .option('-m, --model <model>', 'Override AI model')
    .option('--profile <name>', 'Model profile: budget | power | local')
    .option('--dry-run', 'Show file plan without writing anything')
    .option('-i, --interactive', 'Ask clarifying questions before building')
    .action(async (
      description: string,
      opts: {
        template?: string
        dir?: string
        provider?: string
        model?: string
        profile?: string
        dryRun?: boolean
        interactive?: boolean
      },
    ) => {
      // Validate template
      if (opts.template && !TEMPLATES[opts.template]) {
        process.stderr.write(`Unknown template: "${opts.template}". Available: ${Object.keys(TEMPLATES).join(', ')}\n`)
        process.exitCode = 1
        return
      }

      // Interactive clarification
      let finalDescription = description
      if (opts.interactive) {
        finalDescription = await gatherInteractiveContext(description)
      }

      // Resolve output directory
      const slug = slugify(finalDescription)
      const outDir = resolve(opts.dir ?? `./${slug}`)

      if (!opts.dryRun) {
        await mkdir(outDir, { recursive: true })
      }

      process.stdout.write(
        `\n${c.bold}${c.cyan}✦ Arix Magic Build${c.reset}\n` +
        `${c.gray}Project: ${c.reset}${finalDescription}\n` +
        (opts.template ? `${c.gray}Template: ${c.reset}${opts.template}\n` : '') +
        `${c.gray}Output:  ${c.reset}${outDir}\n` +
        (opts.dryRun ? `${c.yellow}Mode:    dry-run (no files written)${c.reset}\n` : '') +
        '\n'
      )

      const prompt = buildPrompt(finalDescription, opts.template, outDir, opts.dryRun ?? false)

      const { loop } = await bootstrap(outDir, undefined, {
        ...(opts.provider ? { provider: opts.provider } : {}),
        ...(opts.model ? { model: opts.model } : {}),
        ...(opts.profile ? { profile: opts.profile as 'budget' | 'power' | 'local' } : { profile: 'power' }),
        initialPrompt: finalDescription,
        ...(opts.dryRun ? {} : { extraSystemPrompt: `You are in Magic Build mode. You MUST use write_file tool to create every project file. Create ALL files without asking for confirmation — just build it. Real code only, no stubs.` }),
      })

      let filesWritten = 0
      let currentFile = ''
      let outputBuffer = ''

      process.stdout.write(`${c.bold}Building...${c.reset}\n\n`)

      for await (const event of loop.run(prompt)) {
        switch (event.type) {
          case 'text':
            outputBuffer += event.chunk
            if (opts.dryRun) {
              // Stream dry-run plan directly
              process.stdout.write(event.chunk)
            }
            break

          case 'tool_start':
            if (event.call.name === 'write_file') {
              currentFile = String(event.call.input['path'] ?? '')
              const rel = currentFile.replace(outDir, '').replace(/^\//, '')
              process.stdout.write(`  ${c.green}+${c.reset} ${rel}`)
            } else if (event.call.name === 'shell_exec') {
              process.stdout.write(`  ${c.cyan}$${c.reset} ${c.gray}${String(event.call.input['command'] ?? '').slice(0, 60)}${c.reset}`)
            } else {
              process.stdout.write(`  ${c.gray}▶ ${event.call.name}${c.reset}`)
            }
            break

          case 'tool_result':
            if (currentFile) {
              filesWritten++
              const ok = event.result.success !== false
              process.stdout.write(` ${ok ? c.green + '✓' : c.red + '✗'}${c.reset}\n`)
              currentFile = ''
            } else {
              process.stdout.write(` ${c.green}✓${c.reset}\n`)
            }
            break

          case 'error':
            process.stderr.write(`\n${c.red}Error: ${event.error}${c.reset}\n`)
            break

          case 'done':
            if (opts.dryRun) {
              process.stdout.write('\n')
            } else {
              process.stdout.write(
                `\n${c.bold}${c.green}✦ Build complete!${c.reset}\n` +
                `${c.gray}Files created: ${c.cyan}${filesWritten}${c.reset}\n` +
                `${c.gray}Location:      ${c.cyan}${outDir}${c.reset}\n\n` +
                `${c.dim}Next steps:\n` +
                `  cd ${opts.dir ?? slug}\n` +
                `  cat README.md${c.reset}\n`
              )
            }
            break
        }
      }
    })
}
