import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ConfigManager } from '../config/index.js'

let configDir: string

beforeEach(async () => {
  configDir = await mkdtemp(join(tmpdir(), 'arix-config-'))
})

afterEach(async () => {
  await rm(configDir, { recursive: true, force: true })
})

describe('ConfigManager', () => {
  it('returns defaults when no config file exists', async () => {
    const cfg = new ConfigManager(configDir)
    const config = await cfg.load()
    expect(config.provider).toBe('anthropic')
    expect(config.permissionMode).toBe('standard')
    expect(config.maxTurns).toBe(20)
  })

  it('saves and loads config', async () => {
    const cfg = new ConfigManager(configDir)
    await cfg.save({ provider: 'openrouter', model: 'gpt-4o', permissionMode: 'auto', maxTurns: 10 })
    const loaded = await cfg.load()
    expect(loaded.provider).toBe('openrouter')
    expect(loaded.model).toBe('gpt-4o')
    expect(loaded.permissionMode).toBe('auto')
    expect(loaded.maxTurns).toBe(10)
  })

  it('merges partial updates', async () => {
    const cfg = new ConfigManager(configDir)
    await cfg.save({ model: 'claude-3-5-sonnet' })
    await cfg.set('permissionMode', 'safe')
    const loaded = await cfg.load()
    expect(loaded.model).toBe('claude-3-5-sonnet')
    expect(loaded.permissionMode).toBe('safe')
  })

  it('get() returns a specific key', async () => {
    const cfg = new ConfigManager(configDir)
    await cfg.save({ provider: 'ollama' })
    expect(await cfg.get('provider')).toBe('ollama')
  })

  it('get() returns default for missing key', async () => {
    const cfg = new ConfigManager(configDir)
    expect(await cfg.get('maxTurns')).toBe(20)
  })

  it('resolves provider-specific API key env var', async () => {
    process.env['ARIX_ANTHROPIC_KEY'] = 'test-key-123'
    const cfg = new ConfigManager(configDir)
    const key = cfg.resolveApiKey('anthropic')
    expect(key).toBe('test-key-123')
    delete process.env['ARIX_ANTHROPIC_KEY']
  })

  it('returns undefined for unknown provider in resolveApiKey', () => {
    const cfg = new ConfigManager(configDir)
    expect(cfg.resolveApiKey('unknown-provider')).toBeUndefined()
  })

  it('setProviderConfig saves and getProviderConfig retrieves', async () => {
    const cfg = new ConfigManager(configDir)
    await cfg.setProviderConfig('openai', { apiKey: 'sk-test-123' })
    const saved = await cfg.getProviderConfig('openai')
    expect(saved).toEqual({ apiKey: 'sk-test-123' })
  })

  it('setProviderConfig merges multiple providers without overwriting', async () => {
    const cfg = new ConfigManager(configDir)
    await cfg.setProviderConfig('openai', { apiKey: 'sk-openai' })
    await cfg.setProviderConfig('gemini', { apiKey: 'sk-gemini' })
    expect(await cfg.getProviderConfig('openai')).toEqual({ apiKey: 'sk-openai' })
    expect(await cfg.getProviderConfig('gemini')).toEqual({ apiKey: 'sk-gemini' })
  })

  it('getProviderConfig returns undefined for unknown provider', async () => {
    const cfg = new ConfigManager(configDir)
    expect(await cfg.getProviderConfig('does-not-exist')).toBeUndefined()
  })

  it('resolveApiKeyAsync prefers env var over saved config', async () => {
    process.env['ARIX_ANTHROPIC_KEY'] = 'env-key'
    const cfg = new ConfigManager(configDir)
    await cfg.setProviderConfig('anthropic', { apiKey: 'saved-key' })
    const key = await cfg.resolveApiKeyAsync('anthropic')
    expect(key).toBe('env-key')
    delete process.env['ARIX_ANTHROPIC_KEY']
  })

  it('resolveApiKeyAsync falls back to saved config when env var absent', async () => {
    delete process.env['ARIX_ANTHROPIC_KEY']
    const cfg = new ConfigManager(configDir)
    await cfg.setProviderConfig('anthropic', { apiKey: 'saved-key' })
    const key = await cfg.resolveApiKeyAsync('anthropic')
    expect(key).toBe('saved-key')
  })

  it('resolveApiKeyAsync returns undefined when neither env nor saved config', async () => {
    delete process.env['ARIX_ANTHROPIC_KEY']
    const cfg = new ConfigManager(configDir)
    const key = await cfg.resolveApiKeyAsync('anthropic')
    expect(key).toBeUndefined()
  })

  it('ollama setProviderConfig stores baseUrl', async () => {
    const cfg = new ConfigManager(configDir)
    await cfg.setProviderConfig('ollama', { baseUrl: 'http://localhost:11434' })
    const saved = await cfg.getProviderConfig('ollama')
    expect(saved?.['baseUrl']).toBe('http://localhost:11434')
  })
})
