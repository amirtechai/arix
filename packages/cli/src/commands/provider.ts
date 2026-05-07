import type { Command } from 'commander'
import { createInterface } from 'node:readline'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { ConfigManager } from '@arix-code/core'
import { ProviderFactory } from '@arix-code/providers'
import { printBanner } from '../banner.js'

const SUPPORTED_PROVIDERS = ['anthropic', 'openai', 'openrouter', 'ollama', 'gemini'] as const
type ProviderName = typeof SUPPORTED_PROVIDERS[number]

const PROVIDER_CONFIG: Record<ProviderName, { envVar?: string; configKey: string; baseUrlKey?: string }> = {
  anthropic:  { envVar: 'ANTHROPIC_API_KEY',  configKey: 'anthropic.apiKey' },
  openai:     { envVar: 'OPENAI_API_KEY',      configKey: 'openai.apiKey' },
  openrouter: { envVar: 'OPENROUTER_API_KEY',  configKey: 'openrouter.apiKey' },
  ollama:     {                                 configKey: 'ollama.baseUrl', baseUrlKey: 'ollama.baseUrl' },
  gemini:     { envVar: 'GEMINI_API_KEY',       configKey: 'gemini.apiKey' },
}

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(question, (answer) => { rl.close(); resolve(answer.trim()) })
  })
}

export function registerProvider(program: Command): void {
  const providerCmd = program
    .command('provider')
    .description('Manage AI providers')

  providerCmd
    .command('list')
    .description('List supported providers')
    .action(() => {
      console.log('\nSupported providers:\n')
      for (const p of SUPPORTED_PROVIDERS) {
        const cfg = PROVIDER_CONFIG[p]
        const auth = cfg.envVar ? `API key (${cfg.envVar})` : 'Base URL'
        console.log(`  ${p.padEnd(12)}  ${auth}`)
      }
      console.log()
    })

  providerCmd
    .command('add [name]')
    .description('Interactive setup wizard for a provider')
    .action(async (name: string | undefined) => {
      let providerName = name as ProviderName | undefined

      if (!providerName) {
        printBanner({ tagline: 'Provider setup wizard' })
        console.log('Supported providers:')
        SUPPORTED_PROVIDERS.forEach((p, i) => console.log(`  ${i + 1}. ${p}`))
        const choice = await prompt('\nSelect provider (name or number): ')
        const idx = parseInt(choice, 10) - 1
        providerName = (idx >= 0 ? SUPPORTED_PROVIDERS[idx] : choice as ProviderName)
      }

      if (!SUPPORTED_PROVIDERS.includes(providerName as ProviderName)) {
        console.error(`Unknown provider: ${providerName}`)
        process.exitCode = 1
        return
      }

      const _cfg = PROVIDER_CONFIG[providerName as ProviderName]
      const configDir = join(homedir(), '.arix')
      const configMgr = new ConfigManager(configDir)

      const pn = providerName as ProviderName
      if (pn === 'ollama') {
        const baseUrl = await prompt('Ollama base URL [http://localhost:11434]: ')
        await configMgr.setProviderConfig('ollama', { baseUrl: baseUrl || 'http://localhost:11434' })
      } else {
        const apiKey = await prompt(`${pn} API key: `)
        if (!apiKey) {
          console.error('API key is required.')
          process.exitCode = 1
          return
        }
        await configMgr.setProviderConfig(pn, { apiKey })
      }

      // Test connection
      process.stdout.write(`Testing ${pn} connection... `)
      try {
        const apiKey = await configMgr.resolveApiKeyAsync(pn)
        const provider = ProviderFactory.create(pn, {
          ...(apiKey !== undefined ? { apiKey } : {}),
        })
        await provider.listModels()
        console.log('OK')
      } catch {
        console.log('failed (config saved anyway, check your key)')
      }

      // Set as default
      const setDefault = await prompt(`Set ${pn} as default provider? [y/N]: `)
      if (setDefault.toLowerCase() === 'y') {
        await configMgr.set('provider', pn)
        console.log(`Default provider set to: ${pn}`)
      }

      console.log(`\nProvider ${providerName} configured. Run \`arix chat\` to start.`)
    })

  providerCmd
    .command('test [name]')
    .description('Test connection to a provider')
    .action(async (name: string | undefined) => {
      const configDir = join(homedir(), '.arix')
      const configMgr = new ConfigManager(configDir)
      const config = await configMgr.load()
      const providerName = name ?? config.provider ?? 'anthropic'

      process.stdout.write(`Testing ${providerName}... `)
      try {
        const apiKey = configMgr.resolveApiKey(providerName)
        const provider = ProviderFactory.create(providerName, {
          ...(apiKey !== undefined ? { apiKey } : {}),
        })
        const models = await provider.listModels()
        console.log(`OK (${models.length} model(s) available)`)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`FAILED: ${msg}`)
        process.exitCode = 1
      }
    })
}
