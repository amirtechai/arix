import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseSpec, hashSpec, SpecManager } from '../spec/index.js'

describe('spec parser', () => {
  it('extracts tasks with acceptance criteria', () => {
    const md = `# My feature

## Add login form

Description of the form.

- [ ] Email field
- [ ] Password field
- [ ] Submit button

## Wire backend

POST /login.

- [ ] Validates credentials
`
    const tasks = parseSpec(md)
    expect(tasks).toHaveLength(2)
    expect(tasks[0]!.title).toBe('Add login form')
    expect(tasks[0]!.acceptance).toEqual(['Email field', 'Password field', 'Submit button'])
    expect(tasks[1]!.title).toBe('Wire backend')
    expect(tasks[0]!.description).toContain('Description of the form')
  })

  it('hashSpec is stable for identical content', () => {
    expect(hashSpec('a')).toBe(hashSpec('a'))
    expect(hashSpec('a')).not.toBe(hashSpec('b'))
  })
})

describe('SpecManager', () => {
  it('expands then detects no drift', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'spec-'))
    try {
      const specPath = join(dir, 's.md')
      writeFileSync(specPath, `## Do thing\n- [ ] criterion\n`)
      const sm = new SpecManager(join(dir, 'state'))
      const plan = await sm.expand(specPath)
      expect(plan.tasks).toHaveLength(1)

      const diff = await sm.diff(specPath)
      expect(diff.changed).toBe(false)

      writeFileSync(specPath, `## Do thing\n- [ ] criterion\n- [ ] new criterion\n`)
      const diff2 = await sm.diff(specPath)
      expect(diff2.changed).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
