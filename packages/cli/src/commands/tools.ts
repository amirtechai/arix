import type { Command } from 'commander'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { MarketplaceClient } from '@arix-code/core'

export function registerTools(program: Command): void {
  const toolsCmd = program
    .command('tools')
    .description('Manage Arix tools')

  toolsCmd
    .command('search [query]')
    .description('Search the Arix tool registry')
    .action(async (query: string | undefined) => {
      const client = new MarketplaceClient()
      try {
        const results = await client.search(query ?? '', 'tool')
        if (results.length === 0) {
          console.log('No tools found.')
          return
        }
        console.log('\nAvailable tools:\n')
        for (const entry of results) {
          const tags = entry.tags?.join(', ') ?? ''
          console.log(`  ${entry.name.padEnd(20)}  v${entry.version}  ${entry.description}`)
          if (tags) console.log(`  ${''.padEnd(20)}  tags: ${tags}`)
        }
        console.log(`\nInstall with: arix tools install <name>\n`)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`Registry unavailable: ${msg}`)
        process.exitCode = 1
      }
    })

  toolsCmd
    .command('install <name>')
    .description('Install a tool from the registry')
    .action(async (name: string) => {
      const client = new MarketplaceClient()
      const toolsDir = join(homedir(), '.arix', 'tools')
      try {
        await client.install(name, toolsDir, 'tool')
        console.log(`Installed tool: ${name}  →  ${toolsDir}/${name}.js`)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`Install failed: ${msg}`)
        process.exitCode = 1
      }
    })

  toolsCmd
    .command('list')
    .description('List installed tools')
    .action(async () => {
      const { readdir } = await import('node:fs/promises')
      const { existsSync } = await import('node:fs')
      const toolsDir = join(homedir(), '.arix', 'tools')
      if (!existsSync(toolsDir)) {
        console.log('No tools installed. Use `arix tools install <name>` to install.')
        return
      }
      const entries = await readdir(toolsDir)
      const tools = entries.filter((e) => e.endsWith('.js'))
      if (tools.length === 0) {
        console.log('No tools installed.')
        return
      }
      console.log('\nInstalled tools:\n')
      for (const t of tools) {
        console.log(`  ${t.replace('.js', '')}`)
      }
      console.log()
    })
}
