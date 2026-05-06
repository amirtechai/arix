import { describe, it, expect, beforeEach } from 'vitest'
import { ProjectMemory } from '../memory/project.js'

describe('ProjectMemory', () => {
  let mem: ProjectMemory

  beforeEach(() => {
    // Use a fresh instance without loading from disk (tests are stateless)
    mem = new ProjectMemory('/tmp/test-project-' + Math.random())
  })

  it('starts empty', () => {
    expect(mem.size).toBe(0)
    expect(mem.facts).toHaveLength(0)
  })

  it('sets and retrieves a fact', () => {
    mem.set('framework', 'Vitest')
    expect(mem.size).toBe(1)
    const fact = mem.facts[0]!
    expect(fact.key).toBe('framework')
    expect(fact.value).toBe('Vitest')
    expect(fact.confidence).toBe(1)
  })

  it('upserts existing key', () => {
    mem.set('lang', 'TypeScript')
    mem.set('lang', 'JavaScript')
    expect(mem.size).toBe(1)
    expect(mem.facts[0]!.value).toBe('JavaScript')
  })

  it('forget removes a fact', () => {
    mem.set('key1', 'val1')
    mem.set('key2', 'val2')
    const removed = mem.forget('key1')
    expect(removed).toBe(true)
    expect(mem.size).toBe(1)
    expect(mem.facts[0]!.key).toBe('key2')
  })

  it('forget returns false for unknown key', () => {
    expect(mem.forget('nope')).toBe(false)
  })

  it('clear removes all facts', () => {
    mem.set('a', '1')
    mem.set('b', '2')
    mem.clear()
    expect(mem.size).toBe(0)
  })

  it('toSystemPromptSection includes facts', () => {
    mem.set('testing', 'Vitest')
    mem.set('style', 'ESM-only')
    const section = mem.toSystemPromptSection()
    expect(section).toContain('testing')
    expect(section).toContain('Vitest')
    expect(section).toContain('style')
  })

  it('toSystemPromptSection returns empty for no facts', () => {
    expect(mem.toSystemPromptSection()).toBe('')
  })
})
