import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { SkillManager } from '../skills/index.js'

describe('SkillManager', () => {
  it('lists built-in skills', () => {
    const sm = new SkillManager()
    const skills = sm.list()
    expect(skills.length).toBeGreaterThan(0)
    expect(skills.some((s) => s.name === 'coding')).toBe(true)
    expect(skills.some((s) => s.name === 'explain')).toBe(true)
  })

  it('gets a built-in skill by name', () => {
    const sm = new SkillManager()
    const skill = sm.get('coding')
    expect(skill).toBeDefined()
    expect(skill?.systemPrompt.length).toBeGreaterThan(0)
    expect(skill?.description.length).toBeGreaterThan(0)
  })

  it('returns undefined for unknown skill', () => {
    const sm = new SkillManager()
    expect(sm.get('nonexistent-skill-xyz')).toBeUndefined()
  })

  it('registers a custom skill', () => {
    const sm = new SkillManager()
    sm.register({ name: 'custom', description: 'My custom skill', systemPrompt: 'Be custom.' })
    const skill = sm.get('custom')
    expect(skill?.systemPrompt).toBe('Be custom.')
    expect(skill?.description).toBe('My custom skill')
  })

  it('registered skill appears in list()', () => {
    const sm = new SkillManager()
    sm.register({ name: 'extra', description: 'Extra', systemPrompt: 'Extra prompt.' })
    expect(sm.list().some((s) => s.name === 'extra')).toBe(true)
  })

  describe('loadFromDirectory', () => {
    let dir: string

    beforeEach(async () => {
      dir = await mkdtemp(join(tmpdir(), 'arix-skills-'))
    })

    afterEach(async () => {
      await rm(dir, { recursive: true, force: true })
    })

    it('loads a skill from a .md file with frontmatter', async () => {
      await writeFile(
        join(dir, 'myskill.md'),
        '---\ndescription: My custom skill\n---\nYou are a custom assistant.',
        'utf-8',
      )
      const sm = new SkillManager()
      await sm.loadFromDirectory(dir)
      const skill = sm.get('myskill')
      expect(skill?.description).toBe('My custom skill')
      expect(skill?.systemPrompt.trim()).toBe('You are a custom assistant.')
    })

    it('loads multiple skills from directory', async () => {
      await writeFile(join(dir, 'skill-a.md'), '---\ndescription: A\n---\nPrompt A.', 'utf-8')
      await writeFile(join(dir, 'skill-b.md'), '---\ndescription: B\n---\nPrompt B.', 'utf-8')
      const sm = new SkillManager()
      await sm.loadFromDirectory(dir)
      expect(sm.get('skill-a')?.systemPrompt.trim()).toBe('Prompt A.')
      expect(sm.get('skill-b')?.systemPrompt.trim()).toBe('Prompt B.')
    })

    it('skips non-.md files', async () => {
      await writeFile(join(dir, 'notes.txt'), 'not a skill', 'utf-8')
      const sm = new SkillManager()
      await sm.loadFromDirectory(dir)
      expect(sm.get('notes')).toBeUndefined()
    })

    it('ignores missing directory gracefully', async () => {
      const sm = new SkillManager()
      await expect(sm.loadFromDirectory('/nonexistent/path/xyz')).resolves.not.toThrow()
    })
  })
})
