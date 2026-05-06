/**
 * arix find — Semantic code search (no LLM, instant results)
 *
 * Usage:
 *   arix find "authentication logic"
 *   arix find "database connection" --path src/
 *   arix find "payment flow" --type ts
 */

import type { Command } from 'commander'
import { SemanticSearchTool } from '@arix/tools'

const isTTY = process.stdout.isTTY
const c = {
  reset:   isTTY ? '\x1b[0m'  : '',
  bold:    isTTY ? '\x1b[1m'  : '',
  cyan:    isTTY ? '\x1b[36m' : '',
  green:   isTTY ? '\x1b[32m' : '',
  yellow:  isTTY ? '\x1b[33m' : '',
  gray:    isTTY ? '\x1b[90m' : '',
  blue:    isTTY ? '\x1b[34m' : '',
  dim:     isTTY ? '\x1b[2m'  : '',
}

export function registerFind(program: Command): void {
  program
    .command('find <query>')
    .description('Semantic code search — find relevant code by concept (no LLM required)')
    .option('--path <dir>', 'Directory to search in (default: cwd)')
    .option('--type <ext>', 'File type filter, e.g. ts, py, dart')
    .option('--max <n>', 'Max results to return (default: 30)', '30')
    .option('--defs', 'Show only definitions (functions, classes, types) — skip usages')
    .action(async (
      query: string,
      opts: { path?: string; type?: string; max?: string; defs?: boolean },
    ) => {
      const cwd = process.cwd()
      const searchPath = opts.path ?? cwd
      const filePattern = opts.type ? `*.${opts.type}` : undefined
      const maxResults = parseInt(opts.max ?? '30', 10)
      const definitionsOnly = opts.defs === true

      process.stdout.write(
        `${c.bold}${c.cyan}Searching${c.reset} ${c.gray}»${c.reset} "${query}"` +
        (filePattern ? ` ${c.dim}[${filePattern}]${c.reset}` : '') +
        '\n\n'
      )

      const tool = new SemanticSearchTool(cwd)
      const result = await tool.execute({
        query,
        path: searchPath,
        ...(filePattern ? { filePattern } : {}),
        maxResults,
        definitionsOnly,
      })

      if (!result.success) {
        process.stderr.write(`Error: ${result.error ?? 'search failed'}\n`)
        process.exitCode = 1
        return
      }

      // Colorize output
      const colorized = result.output
        .split('\n')
        .map((line) => {
          if (line.startsWith('Found ')) return `${c.bold}${line}${c.reset}`
          if (line.startsWith('──')) return `\n${c.cyan}${line}${c.reset}`
          if (line.includes('[def]')) return line.replace('[def]', `${c.green}[def]${c.reset}`)
          if (line.includes('[doc]')) return line.replace('[doc]', `${c.gray}[doc]${c.reset}`)
          if (line.includes('[use]')) return line.replace('[use]', `${c.yellow}[use]${c.reset}`)
          if (line.startsWith('         ')) return `${c.dim}${line}${c.reset}`
          return line
        })
        .join('\n')

      process.stdout.write(colorized + '\n')
    })
}
