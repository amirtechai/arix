import type { Command } from 'commander'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * `arix serve` — start Arix services.
 *
 * By default starts the web dashboard at http://localhost:7432 (Z16).
 * Use `--grpc` to additionally start the gRPC server, or `--grpc-only` to
 * skip the dashboard for headless integration scenarios.
 */
export function registerServe(program: Command): void {
  program
    .command('serve')
    .description('Start the Arix web dashboard (and optionally the gRPC server)')
    .option('-p, --port <port>', 'Dashboard port', '7432')
    .option('--grpc', 'Also start gRPC server')
    .option('--grpc-only', 'Start only the gRPC server (no dashboard)')
    .option('--grpc-port <port>', 'gRPC port', '50051')
    .option('--no-open', 'Do not open browser automatically')
    .action(async (opts: Record<string, unknown>) => {
      const port = parseInt(String(opts['port'] ?? '7432'), 10)
      const grpcPort = parseInt(String(opts['grpcPort'] ?? '50051'), 10)
      const grpcOnly = Boolean(opts['grpcOnly'])
      const startGrpc = grpcOnly || Boolean(opts['grpc'])
      const shouldOpen = opts['open'] !== false

      let stopDashboard: (() => Promise<void>) | undefined

      if (!grpcOnly) {
        try {
          const storageDir = join(homedir(), '.arix', 'sessions')
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore — workspace package types resolved after build
          const { startDashboard } = await import('@arix-code/dashboard')
          const server = await startDashboard({ port, storageDir })
          stopDashboard = server.close
          console.log(`Dashboard running at ${server.url}`)
          if (shouldOpen) {
            try {
              const { default: open } = await import('open')
              await open(server.url)
            } catch { /* browser open is best-effort */ }
          }
        } catch (err: unknown) {
          console.error('Failed to start dashboard:', err instanceof Error ? err.message : String(err))
          process.exitCode = 1
          return
        }
      }

      if (startGrpc) {
        try {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore — workspace package types resolved after build
          const { startServer } = await import('@arix-code/server')
          const boundPort = await startServer(grpcPort)
          console.log(`gRPC server running on port ${boundPort}`)
        } catch (err: unknown) {
          console.error('Failed to start gRPC server:', err instanceof Error ? err.message : String(err))
        }
      }

      console.log('Press Ctrl+C to stop.')

      const shutdown = async (): Promise<void> => {
        if (stopDashboard) await stopDashboard().catch(() => {})
        process.exit(0)
      }
      process.on('SIGINT', () => { void shutdown() })
      process.on('SIGTERM', () => { void shutdown() })
      await new Promise(() => { /* keep alive until signal */ })
    })
}
