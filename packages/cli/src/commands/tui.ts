import type { Command } from 'commander'
import { bootstrap } from '../bootstrap.js'

export function registerTui(program: Command): void {
  program
    .command('tui')
    .description('Launch the interactive Ink TUI')
    .option('-s, --skill <skill>', 'Use a specific skill for this session')
    .option('-r, --resume <id>', 'Resume a previous session by ID prefix')
    .action(async (opts: Record<string, unknown>) => {
      // Dynamic import keeps TUI deps out of the baseline CLI startup
      const { render } = await import('ink')
      const React = await import('react')
      const { App } = await import('@arix-code/tui')
      const { Launcher } = await import('@arix-code/tui')

      const cwd = process.cwd()
      const skillName = opts['skill'] as string | undefined
      const resumeId = opts['resume'] as string | undefined

      // If --resume given, go straight to App
      if (resumeId !== undefined) {
        const { sessionManager: sm } = await bootstrap(cwd)
        const matches = await sm.find(resumeId)
        if (matches.length === 0) {
          process.stderr.write(`No session found matching: ${resumeId}\n`)
          process.exitCode = 1
          return
        }
        if (matches.length > 1) {
          process.stderr.write(`Ambiguous session ID prefix "${resumeId}"\n`)
          process.exitCode = 1
          return
        }
        const session = matches[0]!
        const { loop, sessionManager, configManager } = await bootstrap(cwd, session, {
          ...(skillName !== undefined ? { skill: skillName } : {}),
        })
        const config = await configManager.load()
        render(
          React.createElement(App, {
            loop,
            model: config.model ?? 'claude-3-5-sonnet',
            session,
            sessionManager,
          }),
        )
        return
      }

      // Show launcher to pick or start new session
      const { sessionManager: sm } = await bootstrap(cwd)
      const sessions = await sm.list()

      await new Promise<void>((resolve) => {
        const { unmount } = render(
          React.createElement(Launcher, {
            sessions,
            onSelect: async (sessionId: string | undefined) => {
              unmount()

              let initialSession
              if (sessionId !== undefined) {
                initialSession = await sm.load(sessionId)
              }

              const { loop, sessionManager, configManager } = await bootstrap(cwd, initialSession, {
                ...(skillName !== undefined ? { skill: skillName } : {}),
              })
              const config = await configManager.load()

              render(
                React.createElement(App, {
                  loop,
                  model: config.model ?? 'claude-3-5-sonnet',
                  ...(initialSession !== undefined ? { session: initialSession, sessionManager } : {}),
                }),
              )
              resolve()
            },
          }),
        )
      })
    })
}
