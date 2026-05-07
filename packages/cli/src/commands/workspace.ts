import type { Command } from 'commander'
import { WorkspaceManager } from '@arix-code/core'

export function registerWorkspace(program: Command): void {
  const ws = program
    .command('workspace')
    .alias('ws')
    .description('Manage multi-repo workspaces (cross-repo refactor support)')

  ws.command('list')
    .alias('ls')
    .description('List configured workspaces')
    .action(async () => {
      const m = new WorkspaceManager()
      const names = await m.list()
      if (names.length === 0) {
        process.stdout.write('No workspaces configured.\nCreate one with: arix workspace create <name> <path1> <path2> ...\n')
        return
      }
      for (const n of names) {
        const w = await m.load(n)
        if (!w) continue
        process.stdout.write(`\n${n} (${w.repos.length} repo${w.repos.length === 1 ? '' : 's'})\n`)
        for (const r of w.repos) process.stdout.write(`  • ${r.alias.padEnd(20)} ${r.path}\n`)
      }
      process.stdout.write('\n')
    })

  ws.command('create <name> <paths...>')
    .description('Create a workspace from a list of repo paths')
    .action(async (name: string, paths: string[]) => {
      const m = new WorkspaceManager()
      const w = await m.create(name, paths)
      process.stdout.write(`Created workspace "${name}" with ${w.repos.length} repo(s).\n`)
    })

  ws.command('add <name> <path>')
    .description('Add a repo to an existing workspace')
    .option('--alias <alias>', 'Custom alias')
    .action(async (name: string, path: string, opts: { alias?: string }) => {
      const m = new WorkspaceManager()
      const w = await m.addRepo(name, path, opts.alias)
      process.stdout.write(`Added. Workspace "${name}" now has ${w.repos.length} repo(s).\n`)
    })

  ws.command('remove <name> <alias>')
    .alias('rm')
    .description('Remove a repo from a workspace by alias')
    .action(async (name: string, alias: string) => {
      const m = new WorkspaceManager()
      const w = await m.removeRepo(name, alias)
      process.stdout.write(`Removed "${alias}". Workspace "${name}" now has ${w.repos.length} repo(s).\n`)
    })
}
