/**
 * arix complete — fast, single-shot code completion for editor integrations
 *
 * Reads the prefix (code before cursor) from stdin or --prefix, optionally a
 * suffix (code after cursor), and prints ONLY the suggested completion text.
 * No agent loop, no tools, no system prompt bloat — kept tight for sub-second
 * latency from VS Code's InlineCompletionItemProvider.
 *
 *   echo "function add(a, b) {" | arix complete --lang javascript
 *   arix complete --prefix "$(cat file.ts)" --suffix "" --max-tokens 64
 */
import type { Command } from 'commander'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { ConfigManager, ModelCatalogue } from '@arix-code/core'
import { ProviderFactory } from '@arix-code/providers'
import type { Message } from '@arix-code/core'

const SYSTEM_PROMPT = `You are a code completion engine. Output ONLY the code that should be inserted at the cursor — no prose, no markdown fences, no explanations, no leading/trailing whitespace beyond what is syntactically required. If nothing useful can be predicted, output nothing.`

function buildUserMessage(prefix: string, suffix: string, lang: string, path: string): string {
  const langTag = lang ? lang : ''
  const pathLine = path ? `// File: ${path}\n` : ''
  if (suffix.trim().length === 0) {
    return `Complete the following ${langTag} code at <CURSOR>. Return only the inserted text.\n\n${pathLine}\`\`\`${langTag}\n${prefix}<CURSOR>\n\`\`\``
  }
  return `Fill the <CURSOR> in the following ${langTag} code. Return only the inserted text.\n\n${pathLine}\`\`\`${langTag}\n${prefix}<CURSOR>${suffix}\n\`\`\``
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return ''
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk as Buffer)
  }
  return Buffer.concat(chunks).toString('utf-8')
}

function stripFences(text: string): string {
  const trimmed = text.trim()
  const fenceMatch = /^```[\w-]*\n([\s\S]*?)\n```$/.exec(trimmed)
  if (fenceMatch) return fenceMatch[1] ?? ''
  return text
}

export function registerComplete(program: Command): void {
  program
    .command('complete')
    .description('Single-shot code completion (for editor integrations)')
    .option('-p, --provider <provider>', 'Provider override')
    .option('-m, --model <model>', 'Model override (default: cheap/fast tier)')
    .option('--prefix <text>', 'Code before cursor (otherwise read from stdin)')
    .option('--suffix <text>', 'Code after cursor', '')
    .option('--lang <lang>', 'Language id (typescript, python, …)', '')
    .option('--path <path>', 'Relative file path for context', '')
    .option('--max-tokens <n>', 'Max output tokens', '96')
    .option('--temperature <n>', 'Sampling temperature', '0.2')
    .action(async (opts: Record<string, unknown>) => {
      const prefix = (opts['prefix'] as string | undefined) ?? await readStdin()
      if (!prefix.trim()) {
        process.exit(0)
      }
      const suffix = (opts['suffix'] as string) || ''
      const lang = (opts['lang'] as string) || ''
      const path = (opts['path'] as string) || ''
      const maxTokens = Number.parseInt((opts['maxTokens'] as string) || '96', 10)
      const temperature = Number.parseFloat((opts['temperature'] as string) || '0.2')

      const configManager = new ConfigManager(join(homedir(), '.arix'))
      const config = await configManager.load()
      const providerName = (opts['provider'] as string | undefined) ?? config.provider ?? 'anthropic'

      let modelId = (opts['model'] as string | undefined)
      if (!modelId) {
        // Prefer fast/cheap model — completions need low latency
        const fast = ModelCatalogue.recommend({ tier: 'simple', providers: [providerName], requireTools: false })
          ?? ModelCatalogue.recommend({ tier: 'medium', providers: [providerName], requireTools: false })
        modelId = fast?.id ?? config.model ?? 'claude-haiku-4-5-20251001'
      }

      const apiKey = configManager.resolveApiKey(providerName)
      const provider = ProviderFactory.create(providerName, apiKey ? { apiKey } : {})

      const messages: Message[] = [
        { role: 'user', content: buildUserMessage(prefix, suffix, lang, path) },
      ]

      try {
        const stream = await provider.chat({
          model: modelId,
          messages,
          maxTokens,
          temperature,
          systemPrompt: SYSTEM_PROMPT,
        })

        let output = ''
        for await (const chunk of stream) {
          if (chunk.error) {
            process.stderr.write(chunk.error)
            process.exitCode = 1
            return
          }
          if (chunk.text) output += chunk.text
          if (chunk.done) break
        }
        process.stdout.write(stripFences(output))
      } catch (err: unknown) {
        process.stderr.write(err instanceof Error ? err.message : String(err))
        process.exitCode = 1
      }
    })
}
