import type { Command } from 'commander'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { ConfigManager, type ArixConfig } from '@arix/core'

const TASK_TYPES = ['coding', 'planning', 'review', 'simple'] as const

export function registerConfig(program: Command): void {
  const configCmd = program
    .command('config')
    .description('Manage Arix configuration')

  configCmd
    .command('get <key>')
    .description('Get a config value')
    .action(async (key: string) => {
      const mgr = new ConfigManager(join(homedir(), '.arix'))
      const value = await mgr.get(key as keyof ArixConfig)
      if (value === undefined) {
        console.log('(not set)')
      } else {
        console.log(String(value))
      }
    })

  configCmd
    .command('set <key> <value>')
    .description('Set a config value')
    .action(async (key: string, value: string) => {
      const mgr = new ConfigManager(join(homedir(), '.arix'))
      // Coerce numeric values
      const coerced: unknown = isNaN(Number(value)) ? value : Number(value)
      await mgr.set(key as keyof ArixConfig, coerced as ArixConfig[keyof ArixConfig])
      console.log(`Set ${key} = ${value}`)
    })

  configCmd
    .command('list')
    .description('List all config values')
    .action(async () => {
      const mgr = new ConfigManager(join(homedir(), '.arix'))
      const config = await mgr.load()
      for (const [k, v] of Object.entries(config)) {
        if (k === 'modelProfiles' && typeof v === 'object' && v !== null) {
          for (const [task, model] of Object.entries(v)) {
            console.log(`modelProfiles.${task}: ${String(model)}`)
          }
        } else {
          console.log(`${k}: ${String(v)}`)
        }
      }
    })

  // arix config model coding=claude-opus-4-6 planning=claude-opus-4-6 simple=gpt-4o-mini
  configCmd
    .command('model [assignments...]')
    .description('Set per-task model profiles (e.g. coding=claude-opus-4-6 simple=gpt-4o-mini)')
    .action(async (assignments: string[]) => {
      const mgr = new ConfigManager(join(homedir(), '.arix'))

      if (assignments.length === 0) {
        // Show current profiles
        const config = await mgr.load()
        const profiles = config.modelProfiles ?? {}
        if (Object.keys(profiles).length === 0) {
          console.log('No per-task model profiles set.')
          console.log('Usage: arix config model coding=claude-opus-4-6 simple=gpt-4o-mini')
        } else {
          console.log('Per-task model profiles:')
          for (const type of TASK_TYPES) {
            const m = profiles[type]
            if (m) console.log(`  ${type.padEnd(10)} → ${m}`)
          }
        }
        return
      }

      const updates: Record<string, string> = {}
      for (const assignment of assignments) {
        const [taskRaw, modelId] = assignment.split('=')
        const task = taskRaw?.trim()
        if (!task || !modelId?.trim()) {
          console.error(`Invalid format: "${assignment}" — expected task=model-id`)
          process.exitCode = 1
          return
        }
        if (!TASK_TYPES.includes(task as (typeof TASK_TYPES)[number])) {
          console.error(`Unknown task type: "${task}" — must be one of: ${TASK_TYPES.join(', ')}`)
          process.exitCode = 1
          return
        }
        updates[task] = modelId.trim()
      }

      const config = await mgr.load()
      const merged = { ...(config.modelProfiles ?? {}), ...updates }
      await mgr.save({ modelProfiles: merged })
      console.log('Updated per-task model profiles:')
      for (const type of TASK_TYPES) {
        const m = merged[type]
        if (m) console.log(`  ${type.padEnd(10)} → ${m}`)
      }
    })
}
