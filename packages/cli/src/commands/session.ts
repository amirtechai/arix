import type { Command } from 'commander'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { SessionManager } from '@arix/core'

export function registerSession(program: Command): void {
  const sessionCmd = program
    .command('session')
    .description('Manage chat sessions')

  sessionCmd
    .command('list')
    .description('List recent sessions')
    .action(async () => {
      const mgr = new SessionManager(join(homedir(), '.arix', 'sessions'))
      const sessions = await mgr.list()
      if (sessions.length === 0) {
        console.log('No sessions found.')
        return
      }
      for (const s of sessions) {
        const date = new Date(s.updatedAt).toLocaleString()
        console.log(`${s.id.slice(0, 8)}  ${s.title.padEnd(50)}  ${date}  (${s.messageCount} msgs)`)
      }
    })

  sessionCmd
    .command('show <id>')
    .description('Show a session by ID prefix')
    .action(async (id: string) => {
      const mgr = new SessionManager(join(homedir(), '.arix', 'sessions'))
      const matches = await mgr.find(id)
      if (matches.length === 0) {
        console.error(`No session matching: ${id}`)
        process.exit(1)
      }
      const session = matches[0]!
      console.log(JSON.stringify(session, null, 2))
    })

  sessionCmd
    .command('delete <id>')
    .description('Delete a session by ID prefix')
    .action(async (id: string) => {
      const mgr = new SessionManager(join(homedir(), '.arix', 'sessions'))
      const matches = await mgr.find(id)
      if (matches.length === 0) {
        console.error(`No session matching: ${id}`)
        process.exit(1)
      }
      const session = matches[0]!
      await mgr.delete(session.id)
      console.log(`Deleted session ${session.id.slice(0, 8)}`)
    })

  sessionCmd
    .command('export <id> <output>')
    .description('Export a session to a JSON file')
    .action(async (id: string, output: string) => {
      const mgr = new SessionManager(join(homedir(), '.arix', 'sessions'))
      const matches = await mgr.find(id)
      if (matches.length === 0) {
        console.error(`No session matching: ${id}`)
        process.exit(1)
      }
      const session = matches[0]!
      await mgr.export(session.id, output)
      console.log(`Exported to ${output}`)
    })
}
