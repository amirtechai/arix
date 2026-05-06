/**
 * arix memory — manage persistent project knowledge
 *
 * Usage:
 *   arix memory show          # show facts for current project
 *   arix memory forget <key>  # remove a specific fact
 *   arix memory clear         # wipe all project memory
 */

import type { Command } from 'commander'
import { ProjectMemory } from '@arix/core'

export function registerMemory(program: Command): void {
  const cmd = program
    .command('memory')
    .description('Manage persistent project knowledge learned across sessions')

  cmd
    .command('show')
    .description('Show what Arix remembers about this project')
    .action(async () => {
      const mem = new ProjectMemory(process.cwd())
      await mem.load()

      if (mem.size === 0) {
        console.log('No project memory yet. Facts are learned automatically during chat sessions.')
        return
      }

      console.log(`\nProject Memory (${mem.size} facts):\n`)
      for (const fact of mem.facts) {
        const conf = '●'.repeat(Math.min(fact.confidence, 5)) + '○'.repeat(Math.max(0, 5 - fact.confidence))
        console.log(`  [${conf}] ${fact.key}`)
        console.log(`         ${fact.value}`)
        console.log()
      }
    })

  cmd
    .command('forget <key>')
    .description('Remove a specific remembered fact')
    .action(async (key: string) => {
      const mem = new ProjectMemory(process.cwd())
      await mem.load()
      const removed = mem.forget(key)
      if (removed) {
        await mem.save(process.cwd())
        console.log(`Forgotten: ${key}`)
      } else {
        console.log(`No fact found with key: ${key}`)
      }
    })

  cmd
    .command('clear')
    .description('Clear all project memory for this directory')
    .action(async () => {
      const mem = new ProjectMemory(process.cwd())
      await mem.load()
      mem.clear()
      await mem.save(process.cwd())
      console.log('Project memory cleared.')
    })
}
