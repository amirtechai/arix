import type { Command } from 'commander'
import { WikiIndex } from '@arix-code/wiki'
import type { AgentEvent } from '@arix-code/core'
import { bootstrap } from '../bootstrap.js'
import { resolve } from 'node:path'

export function registerWiki(program: Command): void {
  const wiki = program
    .command('wiki')
    .description('Build and query a local knowledge index of your codebase')

  // ── wiki build ────────────────────────────────────────────────────────────
  wiki
    .command('build [dir]')
    .description('Index the codebase for semantic search (default: current directory)')
    .option('--db <path>', 'Path to wiki database file (default: ~/.arix/wiki.db)')
    .option('--quiet', 'Suppress per-file progress output')
    .action(async (dir: string | undefined, opts: { db?: string; quiet?: boolean }) => {
      const rootDir = resolve(dir ?? process.cwd())
      const index = new WikiIndex(opts.db)

      console.log(`Building wiki index for: ${rootDir}`)
      console.log('This may take a moment for large codebases...\n')

      let lastLog = 0
      const stats = await index.build(rootDir, (file) => {
        if (!opts.quiet) {
          const now = Date.now()
          // throttle output to once per 100ms
          if (now - lastLog > 100) {
            process.stdout.write(`\r  indexing: ${file.slice(-60).padEnd(60)}`)
            lastLog = now
          }
        }
      })

      index.close()

      if (!opts.quiet) process.stdout.write('\r' + ' '.repeat(70) + '\r')

      console.log(`\nDone!`)
      console.log(`  Files indexed : ${stats.files}`)
      console.log(`  Chunks created: ${stats.chunks}`)
      console.log(`  Skipped       : ${stats.skipped}`)
      console.log(`  Time          : ${(stats.durationMs / 1000).toFixed(1)}s`)
    })

  // ── wiki ask ──────────────────────────────────────────────────────────────
  wiki
    .command('ask <question...>')
    .description('Ask a question about the codebase using the wiki index + AI')
    .option('--db <path>', 'Path to wiki database file')
    .option('--top-k <n>', 'Number of chunks to retrieve (default: 8)', '8')
    .option('--no-ai', 'Show raw retrieved chunks without AI synthesis')
    .action(async (questionParts: string[], opts: { db?: string; topK: string; ai: boolean }) => {
      const question = questionParts.join(' ')
      const index = new WikiIndex(opts.db)
      const topK = parseInt(opts.topK, 10)

      const stats = index.getStats()
      if (!stats) {
        console.error('No wiki index found. Run `arix wiki build` first.')
        process.exit(1)
      }

      if (stats.chunks === 0) {
        console.error('Wiki index is empty. Run `arix wiki build` to populate it.')
        index.close()
        process.exit(1)
      }

      const chunks = index.query(question, topK)
      index.close()

      if (chunks.length === 0) {
        console.log('No relevant code found for:', question)
        process.exit(0)
      }

      if (!opts.ai) {
        // Raw mode: just print chunks
        for (const chunk of chunks) {
          console.log(`\n── ${chunk.filePath}:${chunk.startLine}-${chunk.endLine} (score: ${chunk.score.toFixed(3)}) ──`)
          console.log(chunk.content)
        }
        return
      }

      // AI synthesis mode
      const context = chunks
        .map((c) => `### ${c.filePath} (lines ${c.startLine}-${c.endLine})\n\`\`\`\n${c.content}\n\`\`\``)
        .join('\n\n')

      const prompt = `You are a helpful code assistant. Using the following code context from the codebase, answer the user's question concisely and accurately.

## Code Context
${context}

## Question
${question}

Provide a clear, direct answer. Reference specific file paths and line numbers where relevant.`

      const { loop } = await bootstrap(process.cwd())
      process.stdout.write('\n')

      try {
        for await (const event of loop.run(prompt) as AsyncIterable<AgentEvent>) {
          if (event.type === 'text') process.stdout.write(event.chunk)
          if (event.type === 'error') {
            console.error('\nError:', event.error)
            process.exit(1)
          }
        }
        process.stdout.write('\n')
      } catch (err) {
        console.error('\nFailed to query AI:', err instanceof Error ? err.message : String(err))
        process.exit(1)
      }
    })

  // ── wiki status ───────────────────────────────────────────────────────────
  wiki
    .command('status')
    .description('Show wiki index statistics')
    .option('--db <path>', 'Path to wiki database file')
    .action((opts: { db?: string }) => {
      const index = new WikiIndex(opts.db)
      const stats = index.getStats()
      index.close()

      if (!stats) {
        console.log('No wiki index found. Run `arix wiki build` to create one.')
        return
      }

      console.log('Wiki Index Status')
      console.log('─────────────────')
      console.log(`Root    : ${stats.root}`)
      console.log(`Built   : ${stats.builtAt}`)
      console.log(`Files   : ${stats.files}`)
      console.log(`Chunks  : ${stats.chunks}`)
    })
}
