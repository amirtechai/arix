import type { Command } from 'commander'
import { bootstrap } from '../bootstrap.js'

const MIN_INTERVAL_MS = 1_000
const MAX_INTERVAL_MS = 24 * 60 * 60 * 1_000 // 24h

/** Parse "30s", "5m", "2h" → milliseconds */
function parseInterval(raw: string): number | null {
  const m = raw.match(/^(\d+(?:\.\d+)?)(ms|s|m|h)$/)
  if (!m) return null
  const n = parseFloat(m[1]!)
  switch (m[2]) {
    case 'ms': return n
    case 's':  return n * 1_000
    case 'm':  return n * 60_000
    case 'h':  return n * 3_600_000
    default:   return null
  }
}

function formatInterval(ms: number): string {
  if (ms < 1_000) return `${ms}ms`
  if (ms < 60_000) return `${ms / 1_000}s`
  if (ms < 3_600_000) return `${ms / 60_000}m`
  return `${ms / 3_600_000}h`
}

export function registerLoop(program: Command): void {
  program
    .command('loop <interval> <prompt...>')
    .description('Run a prompt repeatedly at a fixed interval (e.g. arix loop 30s "check build status")')
    .option('-n, --count <n>', 'Stop after N iterations (default: unlimited)')
    .option('--stop-on-error', 'Stop the loop if the agent returns an error')
    .action(async (intervalArg: string, promptParts: string[], opts: Record<string, unknown>) => {
      const intervalMs = parseInterval(intervalArg)
      if (!intervalMs || intervalMs < MIN_INTERVAL_MS || intervalMs > MAX_INTERVAL_MS) {
        process.stderr.write(
          `Invalid interval: "${intervalArg}". Use format like 10s, 5m, 2h (min: 1s, max: 24h)\n`,
        )
        process.exitCode = 1
        return
      }

      const prompt = promptParts.join(' ')
      const maxCount = opts['count'] !== undefined ? parseInt(String(opts['count']), 10) : Infinity
      const stopOnError = Boolean(opts['stopOnError'] ?? false)

      console.log(`Loop started — interval: ${formatInterval(intervalMs)}, prompt: "${prompt}"`)
      console.log('Press Ctrl+C to stop.\n')

      let iteration = 0
      let running = true

      process.on('SIGINT', () => {
        running = false
        console.log('\nLoop stopped by user.')
        process.exit(0)
      })

      while (running && iteration < maxCount) {
        iteration++
        const timestamp = new Date().toISOString()
        console.log(`\n─── Iteration ${iteration} (${timestamp}) ───`)

        const { loop } = await bootstrap(process.cwd())
        let hasError = false

        for await (const ev of loop.run(prompt)) {
          if (ev.type === 'text') process.stdout.write(ev.chunk)
          if (ev.type === 'error') {
            process.stderr.write(`\n[error] ${ev.error}\n`)
            hasError = true
          }
          if (ev.type === 'done') process.stdout.write('\n')
        }

        if (hasError && stopOnError) {
          console.error('Loop stopped due to error (--stop-on-error).')
          process.exitCode = 1
          break
        }

        if (running && iteration < maxCount) {
          await new Promise<void>((resolve) => setTimeout(resolve, intervalMs))
        }
      }

      if (iteration >= maxCount && maxCount !== Infinity) {
        console.log(`\nLoop finished after ${iteration} iteration(s).`)
      }
    })
}
