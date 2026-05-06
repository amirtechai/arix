import type { Command } from 'commander'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { ConfigManager, MarketplaceClient, SkillManager } from '@arix/core'

async function makeSkillManager(): Promise<SkillManager> {
  const sm = new SkillManager()
  const skillsDir = join(homedir(), '.arix', 'skills')
  await sm.loadFromDirectory(skillsDir)
  return sm
}

export function registerSkill(program: Command): void {
  const skillCmd = program
    .command('skill')
    .description('Manage Arix skills')

  skillCmd
    .command('list')
    .description('List all available skills')
    .action(async () => {
      const sm = await makeSkillManager()
      const skills = sm.list()
      console.log('\nAvailable skills:\n')
      for (const skill of skills) {
        const marker = skill.name.padEnd(12)
        console.log(`  ${marker}  ${skill.description}`)
      }
      console.log()
    })

  skillCmd
    .command('show <name>')
    .description('Show the system prompt for a skill')
    .action(async (name: string) => {
      const sm = await makeSkillManager()
      const skill = sm.get(name)
      if (!skill) {
        console.error(`Skill not found: ${name}`)
        process.exitCode = 1
        return
      }
      console.log(`\n── ${skill.name} ─────────────────────────`)
      console.log(`Description: ${skill.description}\n`)
      console.log(skill.systemPrompt.trim())
      console.log()
    })

  skillCmd
    .command('use <name>')
    .description('Set the active skill (saved to config)')
    .action(async (name: string) => {
      const sm = await makeSkillManager()
      const skill = sm.get(name)
      if (!skill) {
        console.error(`Skill not found: ${name}`)
        process.exitCode = 1
        return
      }
      const configMgr = new ConfigManager(join(homedir(), '.arix'))
      await configMgr.set('skill', name)
      console.log(`Active skill set to: ${name}`)
    })

  skillCmd
    .command('clear')
    .description('Clear the active skill')
    .action(async () => {
      const configMgr = new ConfigManager(join(homedir(), '.arix'))
      await configMgr.set('skill', undefined as any)
      console.log('Active skill cleared.')
    })

  skillCmd
    .command('search [query]')
    .description('Search the Arix skill registry')
    .action(async (query: string | undefined) => {
      const client = new MarketplaceClient()
      try {
        const results = await client.search(query ?? '', 'skill')
        if (results.length === 0) {
          console.log('No skills found.')
          return
        }
        console.log('\nAvailable skills:\n')
        for (const entry of results) {
          console.log(`  ${entry.name.padEnd(20)}  v${entry.version}  ${entry.description}`)
        }
        console.log(`\nInstall with: arix skill install <name>\n`)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`Registry unavailable: ${msg}`)
        process.exitCode = 1
      }
    })

  skillCmd
    .command('install <name>')
    .description('Install a skill from the registry')
    .action(async (name: string) => {
      const client = new MarketplaceClient()
      const skillsDir = join(homedir(), '.arix', 'skills')
      try {
        await client.install(name, skillsDir, 'skill')
        console.log(`Installed skill: ${name}  →  ${skillsDir}/${name}.md`)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`Install failed: ${msg}`)
        process.exitCode = 1
      }
    })
}
