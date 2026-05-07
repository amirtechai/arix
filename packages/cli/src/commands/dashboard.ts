import type { Command } from 'commander'
import { homedir } from 'node:os'
import { join } from 'node:path'

export function registerDashboard(program: Command): void {
  program
    .command('dashboard')
    .description('Open web dashboard for session visualization')
    .option('-p, --port <number>', 'Port to listen on', '7432')
    .option('--no-open', 'Do not open browser automatically')
    .action(async (options: { port: string; open: boolean }) => {
      const port = parseInt(options.port, 10)
      const storageDir = join(homedir(), '.arix', 'sessions')

      console.log(`Starting Arix dashboard on port ${port}…`)

      try {
        // Dynamic import to avoid heavy startup deps
        const { startDashboard } = await import('@arix-code/dashboard')
        const server = await startDashboard({ port, storageDir })

        console.log(`Dashboard running at ${server.url}`)

        if (options.open) {
          const { default: open } = await import('open')
          await open(server.url)
        }

        // Keep alive until Ctrl+C
        process.on('SIGINT', async () => {
          await server.close()
          process.exit(0)
        })
        process.on('SIGTERM', async () => {
          await server.close()
          process.exit(0)
        })

        // Block indefinitely
        await new Promise<never>(() => {})
      } catch (err) {
        console.error('Failed to start dashboard:', err instanceof Error ? err.message : err)
        process.exit(1)
      }
    })
}
