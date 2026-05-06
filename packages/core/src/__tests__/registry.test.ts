import { describe, it, expect } from 'vitest'
import { ModelRegistry } from '../registry/index.js'
import type { ModelRoleConfig } from '../types.js'

describe('ModelRegistry', () => {
  const config: ModelRoleConfig = {
    coding: 'anthropic/claude-sonnet-4-6',
    reasoning: 'openrouter/openai/o3',
    cheap: 'openrouter/google/gemma-3-4b-it',
    fast: 'openrouter/meta-llama/llama-3.1-8b-instruct',
    local: 'ollama/qwen2.5-coder:7b',
    'long-context': 'openrouter/anthropic/claude-opus-4-6',
  }

  it('returns model ID for a role', () => {
    const reg = new ModelRegistry(config)
    expect(reg.getModel('coding')).toBe('anthropic/claude-sonnet-4-6')
  })

  it('returns default when role not in config', () => {
    const reg = new ModelRegistry({})
    expect(reg.getModel('coding')).toBe('anthropic/claude-sonnet-4-6')
  })

  it('supports runtime override', () => {
    const reg = new ModelRegistry(config)
    reg.setModel('coding', 'openrouter/deepseek/deepseek-r2')
    expect(reg.getModel('coding')).toBe('openrouter/deepseek/deepseek-r2')
  })

  it('parseModelId splits openrouter prefix', () => {
    const reg = new ModelRegistry({})
    expect(reg.parseModelId('openrouter/anthropic/claude-sonnet')).toEqual({
      provider: 'openrouter',
      model: 'anthropic/claude-sonnet',
    })
  })

  it('parseModelId splits anthropic prefix', () => {
    const reg = new ModelRegistry({})
    expect(reg.parseModelId('anthropic/claude-sonnet-4-6')).toEqual({
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
    })
  })

  it('parseModelId splits ollama prefix', () => {
    const reg = new ModelRegistry({})
    expect(reg.parseModelId('ollama/qwen2.5-coder:7b')).toEqual({
      provider: 'ollama',
      model: 'qwen2.5-coder:7b',
    })
  })
})
