import { describe, it, expect, beforeEach } from 'vitest'
import { Command } from 'commander'
import { registerConfig } from '../commands/config.js'
import { registerSession } from '../commands/session.js'
import { registerSkill } from '../commands/skill.js'
import { registerInit } from '../commands/init.js'
import { registerComplete } from '../commands/complete.js'

// ── Config command tests ──────────────────────────────────────────────────────

describe('config command', () => {
  let program: Command

  beforeEach(() => {
    program = new Command()
    program.exitOverride() // throw instead of process.exit
    registerConfig(program)
  })

  it('registers config subcommands', () => {
    const configCmd = program.commands.find((c) => c.name() === 'config')
    expect(configCmd).toBeDefined()
    const subNames = configCmd!.commands.map((c) => c.name())
    expect(subNames).toContain('get')
    expect(subNames).toContain('set')
    expect(subNames).toContain('list')
  })
})

// ── Session command tests ─────────────────────────────────────────────────────

describe('session command', () => {
  let program: Command

  beforeEach(() => {
    program = new Command()
    program.exitOverride()
    registerSession(program)
  })

  it('registers session subcommands', () => {
    const sessionCmd = program.commands.find((c) => c.name() === 'session')
    expect(sessionCmd).toBeDefined()
    const subNames = sessionCmd!.commands.map((c) => c.name())
    expect(subNames).toContain('list')
    expect(subNames).toContain('show')
    expect(subNames).toContain('delete')
    expect(subNames).toContain('export')
  })
})

// ── Skill command tests ───────────────────────────────────────────────────────

describe('skill command', () => {
  let program: Command

  beforeEach(() => {
    program = new Command()
    program.exitOverride()
    registerSkill(program)
  })

  it('registers skill subcommands', () => {
    const skillCmd = program.commands.find((c) => c.name() === 'skill')
    expect(skillCmd).toBeDefined()
    const subNames = skillCmd!.commands.map((c) => c.name())
    expect(subNames).toContain('list')
    expect(subNames).toContain('show')
    expect(subNames).toContain('use')
    expect(subNames).toContain('clear')
  })
})

// ── Init command tests ────────────────────────────────────────────────────────

describe('init command', () => {
  let program: Command

  beforeEach(() => {
    program = new Command()
    program.exitOverride()
    registerInit(program)
  })

  it('registers init command', () => {
    const cmd = program.commands.find((c) => c.name() === 'init')
    expect(cmd).toBeDefined()
  })
})

describe('complete command', () => {
  let program: Command

  beforeEach(() => {
    program = new Command()
    program.exitOverride()
    registerComplete(program)
  })

  it('registers complete command', () => {
    const cmd = program.commands.find((c) => c.name() === 'complete')
    expect(cmd).toBeDefined()
  })

  it('exposes prefix/suffix/lang/path options', () => {
    const cmd = program.commands.find((c) => c.name() === 'complete')!
    const flags = cmd.options.map((o) => o.long)
    expect(flags).toContain('--prefix')
    expect(flags).toContain('--suffix')
    expect(flags).toContain('--lang')
    expect(flags).toContain('--path')
    expect(flags).toContain('--max-tokens')
    expect(flags).toContain('--temperature')
  })
})

// ── SIGINT abort pattern tests ───────────────────────────────────────────────

describe('SIGINT abort via gen.return()', () => {
  it('terminates for-await-of loop when return() is called mid-stream', async () => {
    let lastYielded = 0

    async function* counting(): AsyncGenerator<number> {
      while (true) {
        await new Promise<void>((r) => setTimeout(r, 1))
        yield ++lastYielded
      }
    }

    const gen = counting()
    let aborted = false

    for await (const n of gen) {
      if (n >= 3 && !aborted) {
        aborted = true
        void gen.return(undefined)
      }
    }

    expect(aborted).toBe(true)
    expect(lastYielded).toBeGreaterThanOrEqual(3)
    expect(lastYielded).toBeLessThan(50)
  })
})

// ── first-run provider guard tests ───────────────────────────────────────────

describe('checkApiKeyConfigured', () => {
  it('throws with actionable message when API key missing for cloud provider', async () => {
    const { checkApiKeyConfigured } = await import('../bootstrap.js')
    expect(() => checkApiKeyConfigured('anthropic', undefined))
      .toThrow(/arix config set/)
  })

  it('includes provider name in error message', async () => {
    const { checkApiKeyConfigured } = await import('../bootstrap.js')
    expect(() => checkApiKeyConfigured('openai', undefined))
      .toThrow(/openai/)
  })

  it('does not throw for ollama (no key needed)', async () => {
    const { checkApiKeyConfigured } = await import('../bootstrap.js')
    expect(() => checkApiKeyConfigured('ollama', undefined)).not.toThrow()
  })

  it('does not throw when key is present', async () => {
    const { checkApiKeyConfigured } = await import('../bootstrap.js')
    expect(() => checkApiKeyConfigured('anthropic', 'sk-ant-test')).not.toThrow()
  })
})

// ── toolInputPreview tests ───────────────────────────────────────────────────

describe('toolInputPreview', () => {
  it('formats file path input', async () => {
    const { toolInputPreview } = await import('../commands/chat.js')
    expect(toolInputPreview('read_file', { path: '/foo/bar.ts' })).toBe('/foo/bar.ts')
  })

  it('formats command input', async () => {
    const { toolInputPreview } = await import('../commands/chat.js')
    expect(toolInputPreview('bash', { command: 'npm test' })).toBe('npm test')
  })

  it('truncates long values', async () => {
    const { toolInputPreview } = await import('../commands/chat.js')
    const result = toolInputPreview('search', { pattern: 'x'.repeat(100) })
    expect(result.length).toBeLessThanOrEqual(53) // 50 + '...'
  })

  it('returns empty string for no recognized keys', async () => {
    const { toolInputPreview } = await import('../commands/chat.js')
    expect(toolInputPreview('unknown_tool', {})).toBe('')
  })
})

// ── createRenderer spinner tests ─────────────────────────────────────────────

describe('createRenderer spinner', () => {
  it('tracks thinking state transitions', async () => {
    const { createRenderer } = await import('../commands/chat.js')
    const r = createRenderer()
    expect(r.state.thinking).toBe(false)
    expect(r.state.spinnerTimer).toBeNull()

    // tool_start should not trigger thinking
    r.onEvent({ type: 'tool_start', call: { id: '1', name: 'read_file', input: {} } }, r.state)
    expect(r.state.thinking).toBe(false)

    // text event stops spinner (thinking = false, timer cleared)
    r.onEvent({ type: 'text', chunk: 'hello' }, r.state)
    expect(r.state.thinking).toBe(false)
    expect(r.state.spinnerTimer).toBeNull()
  })
})
