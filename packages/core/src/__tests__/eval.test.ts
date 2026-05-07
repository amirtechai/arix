import { describe, it, expect } from 'vitest'
import { runSuite, type EvalSuite } from '../eval/index.js'
import { exact, contains, rubric, jsonMatches } from '../eval/graders.js'
import { buildTrace, diffTraces } from '../eval/golden.js'
import { skillRegressionSuite } from '../eval/builtin.js'

describe('eval graders', () => {
  it('exact', () => {
    expect(exact('hi')('hi')).toBe(1)
    expect(exact('hi')('bye')).toBe(0)
  })
  it('contains regex and string', () => {
    expect(contains('foo')('xfoox')).toBe(1)
    expect(contains(/[A-Z]+/)('abc')).toBe(0)
    expect(contains(/[A-Z]+/)('aBc')).toBe(1)
  })
  it('rubric scales by required hit ratio, ignores bonus for full pass', () => {
    const g = rubric({ required: ['a', 'b'], bonus: ['c'] })
    expect(g('a')).toBeCloseTo(0.7 * 0.5)
    expect(g('a b')).toBe(1)
    expect(g('a b c')).toBe(1)
  })
  it('jsonMatches', () => {
    const g = jsonMatches({ status: 'ok', code: /\d+/ })
    expect(g('{"status":"ok","code":"42"}')).toBe(1)
    expect(g('{"status":"ok"}')).toBe(0.5)
    expect(g('not json')).toBe(0)
  })
})

describe('runSuite', () => {
  it('runs all cases and reports pass/fail', async () => {
    const suite: EvalSuite<string, string> = {
      name: 'tiny',
      run: async (i) => i.toUpperCase(),
      cases: [
        { id: 'pass', input: 'hi', grade: exact('HI') },
        { id: 'fail', input: 'hi', grade: exact('xx') },
      ],
    }
    const r = await runSuite(suite)
    expect(r.total).toBe(2)
    expect(r.passed).toBe(1)
    expect(r.failed).toBe(1)
    expect(r.skipped).toBe(false)
  })

  it('skipIf returns skipped report', async () => {
    const r = await runSuite({ name: 's', run: async () => '', cases: [], skipIf: () => true })
    expect(r.skipped).toBe(true)
  })
})

describe('golden trace diff', () => {
  it('detects type differences', () => {
    const a = buildTrace('a', [{ turn: 0, type: 'text', text: 'x' }])
    const b = buildTrace('a', [{ turn: 0, type: 'error', error: 'oops' }])
    const d = diffTraces(a, b)
    expect(d.match).toBe(false)
    expect(d.differences[0]?.field).toBe('type')
  })
  it('matches identical traces', () => {
    const a = buildTrace('a', [{ turn: 0, type: 'tool_call', tool: 'read_file', input: { path: '/x' } }])
    const b = buildTrace('a', [{ turn: 0, type: 'tool_call', tool: 'read_file', input: { path: '/x' } }])
    expect(diffTraces(a, b).match).toBe(true)
  })
})

describe('skillRegressionSuite', () => {
  it('passes for all bundled skills', async () => {
    const suite = await skillRegressionSuite()
    const r = await runSuite(suite)
    expect(r.failed).toBe(0)
    expect(r.passed).toBeGreaterThan(0)
  })
})
