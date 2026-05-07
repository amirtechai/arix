import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync, watch } from 'node:fs'
import { join, resolve } from 'node:path'
import type { FSWatcher } from 'node:fs'
import type { PermissionMode } from '../types.js'

export type NamedProfile = 'budget' | 'power' | 'local'

export interface ArixConfig {
  provider: string
  model?: string
  permissionMode: PermissionMode
  maxTurns: number
  systemPrompt?: string
  sessionDir?: string
  skill?: string
  plugins?: string[]
  /** Per-task model overrides: { coding: 'claude-opus-4-6', simple: 'gpt-4o-mini' } */
  modelProfiles?: Partial<Record<'coding' | 'planning' | 'review' | 'simple', string>>
  /** Named profile preset: budget | power | local */
  profile?: NamedProfile
  /** Provider-specific settings (apiKey, baseUrl, etc.) keyed by provider name */
  providerConfig?: Record<string, Record<string, string>>
}

const DEFAULTS: ArixConfig = {
  provider: 'anthropic',
  permissionMode: 'standard',
  maxTurns: 20,
}

const API_KEY_ENV: Record<string, string> = {
  anthropic: 'ARIX_ANTHROPIC_KEY',
  openai: 'ARIX_OPENAI_KEY',
  openrouter: 'ARIX_OPENROUTER_KEY',
  ollama: '',
}

export class ConfigManager {
  private readonly configPath: string
  private cache: ArixConfig | null = null
  private watcher: FSWatcher | null = null

  constructor(configDir: string) {
    this.configPath = join(resolve(configDir), 'config.json')
  }

  private startWatcher(): void {
    if (this.watcher || !existsSync(this.configPath)) return
    // fs.watch can fail with EPERM on Windows runners and EACCES on some
    // sandboxed Linux setups. Watching is a best-effort optimisation — the
    // cache reload-on-error path still works, so swallow.
    try {
      this.watcher = watch(this.configPath, () => {
        this.cache = null
      })
      this.watcher.on('error', () => {
        try { this.watcher?.close() } catch { /* ignore */ }
        this.watcher = null
      })
      this.watcher.unref()
    } catch {
      this.watcher = null
    }
  }

  async load(): Promise<ArixConfig> {
    if (this.cache) return this.cache
    if (!existsSync(this.configPath)) return { ...DEFAULTS }
    const content = await readFile(this.configPath, 'utf-8')
    this.cache = { ...DEFAULTS, ...(JSON.parse(content) as Partial<ArixConfig>) }
    this.startWatcher()
    return this.cache
  }

  async save(partial: Partial<ArixConfig>): Promise<void> {
    await mkdir(resolve(this.configPath, '..'), { recursive: true })
    const current = await this.load()
    const updated = { ...current, ...partial }
    await writeFile(this.configPath, JSON.stringify(updated, null, 2), 'utf-8')
    this.cache = updated  // update cache immediately after write
    this.startWatcher()
  }

  async set<K extends keyof ArixConfig>(key: K, value: ArixConfig[K]): Promise<void> {
    await this.save({ [key]: value } as Partial<ArixConfig>)
  }

  async get<K extends keyof ArixConfig>(key: K): Promise<ArixConfig[K]> {
    const config = await this.load()
    return config[key]
  }

  async setProviderConfig(provider: string, cfg: Record<string, string>): Promise<void> {
    const current = (await this.get('providerConfig')) ?? {}
    await this.set('providerConfig', { ...current, [provider]: cfg })
  }

  async getProviderConfig(provider: string): Promise<Record<string, string> | undefined> {
    const all = (await this.get('providerConfig')) ?? {}
    return all[provider]
  }

  /** Sync: reads from env vars only. For saved keys use resolveApiKeyAsync. */
  resolveApiKey(provider: string): string | undefined {
    const envVar = API_KEY_ENV[provider]
    if (!envVar) return undefined
    return process.env[envVar]
  }

  async resolveApiKeyAsync(provider: string): Promise<string | undefined> {
    const fromEnv = this.resolveApiKey(provider)
    if (fromEnv) return fromEnv
    const saved = await this.getProviderConfig(provider)
    return saved?.['apiKey']
  }
}
