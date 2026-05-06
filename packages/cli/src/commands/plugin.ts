/**
 * arix plugin — manage disk-based plugins loaded from ~/.arix/plugins/
 *
 * Usage:
 *   arix plugin list              # show all loaded plugins
 *   arix plugin tools             # list every tool exposed by plugins
 *   arix plugin reload            # hot-reload all plugins
 */

import type { Command } from 'commander'
import { PluginLoader } from '@arix/core'
import { homedir } from 'node:os'
import { join } from 'node:path'

export function registerPlugin(program: Command): void {
  const cmd = program
    .command('plugin')
    .description('Manage disk-based plugins from ~/.arix/plugins/')

  cmd
    .command('list')
    .description('Show all loaded plugins')
    .action(async () => {
      const loader = new PluginLoader(join(homedir(), '.arix', 'plugins'))
      await loader.loadAll()
      const plugins = loader.allPlugins()

      if (plugins.length === 0) {
        console.log('No plugins loaded. Place plugin files in ~/.arix/plugins/')
        return
      }

      console.log(`\nLoaded plugins (${plugins.length}):\n`)
      for (const p of plugins) {
        const toolCount = p.tools.length
        console.log(`  ${p.manifest.name} v${p.manifest.version}`)
        console.log(`    ${p.manifest.description}`)
        console.log(`    Tools: ${toolCount} | Path: ${p.path}`)
        console.log()
      }
    })

  cmd
    .command('tools')
    .description('List all tools exposed by plugins')
    .action(async () => {
      const loader = new PluginLoader(join(homedir(), '.arix', 'plugins'))
      await loader.loadAll()
      const tools = loader.allTools()

      if (tools.length === 0) {
        console.log('No plugin tools found.')
        return
      }

      console.log(`\nPlugin tools (${tools.length}):\n`)
      for (const t of tools) {
        const confirm = t.requiresConfirmation ? ' ⚠️ requires confirmation' : ''
        console.log(`  ${t.name}${confirm}`)
        console.log(`    ${t.description}`)
      }
    })

  cmd
    .command('reload')
    .description('Hot-reload all plugins (useful during development)')
    .action(async () => {
      const loader = new PluginLoader(join(homedir(), '.arix', 'plugins'))
      await loader.loadAll()
      console.log(`Reloaded ${loader.allPlugins().length} plugin(s).`)
    })
}
