import type { Command } from 'commander'
import { mkdir, writeFile, access } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { printBanner } from '../banner.js'

// Default config uses anthropic as example — user can change provider/model freely.
// Supported providers: anthropic, openai, gemini, openrouter, ollama, bedrock, azure, vertex
const EXAMPLE_CONFIG = {
  provider: 'anthropic',
  model: 'claude-sonnet-4-6',
  permissionMode: 'standard',
  maxTurns: 20,
}

const EXAMPLE_SKILL = `---
description: My custom skill — describe what it does here
---
You are a helpful assistant with expertise in the following area:

<!-- Add your custom system prompt here. -->
`

export function registerInit(program: Command): void {
  program
    .command('init')
    .description('Initialize Arix in ~/.arix/')
    .action(async () => {
      printBanner()
      const configDir = join(homedir(), '.arix')
      const dirs = [
        configDir,
        join(configDir, 'sessions'),
        join(configDir, 'skills'),
        join(configDir, 'plugins'),
      ]

      for (const dir of dirs) {
        await mkdir(dir, { recursive: true })
      }

      // Write config only if it doesn't exist
      const configPath = join(configDir, 'config.json')
      const configExists = await access(configPath).then(() => true).catch(() => false)
      if (!configExists) {
        await writeFile(configPath, JSON.stringify(EXAMPLE_CONFIG, null, 2) + '\n', 'utf-8')
        console.log(`  created  ${configPath}`)
      } else {
        console.log(`  exists   ${configPath}`)
      }

      // Write example skill if skills dir is empty
      const exampleSkillPath = join(configDir, 'skills', 'example.md')
      const skillExists = await access(exampleSkillPath).then(() => true).catch(() => false)
      if (!skillExists) {
        await writeFile(exampleSkillPath, EXAMPLE_SKILL, 'utf-8')
        console.log(`  created  ${exampleSkillPath}`)
      }

      console.log('\nArix initialized.')
      console.log(`Config dir: ${configDir}`)
      console.log('\nNext steps:')
      console.log('  Set API keys for the providers you want to use:')
      console.log('    export ARIX_ANTHROPIC_KEY=sk-ant-...')
      console.log('    export ARIX_OPENAI_KEY=sk-...')
      console.log('    export ARIX_GEMINI_KEY=AIza...')
      console.log('    export ARIX_OPENROUTER_KEY=sk-or-...')
      console.log('  Or use local models (no key needed):')
      console.log('    arix chat -p ollama -m qwen2.5-coder:7b')
      console.log('  Switch provider/model:')
      console.log('    arix config set provider openai')
      console.log('    arix config set model gpt-4o')
      console.log('  Start a session:    arix chat')
      console.log('  List all models:    arix models list')
    })
}
