import type { Command } from 'commander'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { FeatureFlagManager } from '@arix/core'

function makeManager(): FeatureFlagManager {
  return new FeatureFlagManager(join(homedir(), '.arix', 'feature-flags.json'))
}

export function registerFeature(program: Command): void {
  const featureCmd = program
    .command('feature')
    .description('Manage Arix feature flags')

  featureCmd
    .command('enable <flag>')
    .description('Enable a feature flag')
    .action(async (flag: string) => {
      const mgr = makeManager()
      await mgr.load()
      mgr.enable(flag)
      await mgr.save()
      console.log(`Feature enabled: ${flag}`)
    })

  featureCmd
    .command('disable <flag>')
    .description('Disable a feature flag')
    .action(async (flag: string) => {
      const mgr = makeManager()
      await mgr.load()
      mgr.disable(flag)
      await mgr.save()
      console.log(`Feature disabled: ${flag}`)
    })

  featureCmd
    .command('list')
    .description('List all feature flags')
    .action(async () => {
      const mgr = makeManager()
      await mgr.load()
      const flags = mgr.list()
      if (flags.length === 0) {
        console.log('No feature flags configured.')
        return
      }
      console.log('\nFeature flags:\n')
      for (const { flag, enabled } of flags) {
        const mark = enabled ? '✓' : '✗'
        console.log(`  ${mark}  ${flag}`)
      }
      console.log()
    })
}
