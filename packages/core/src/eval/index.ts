/**
 * Eval framework (M1) — declarative evaluation harness for agent quality
 * and provider conformance.
 *
 * An eval is a list of cases; each case has an input, a way to grade the
 * output, and (optionally) a setup/teardown.
 *
 * Runs in-process, accumulates pass/fail/score, and emits a summary.
 */

export interface EvalCase<TInput = unknown, TOutput = unknown> {
  id: string
  input: TInput
  /** Grader returns a score in [0,1]. 1 = full pass. */
  grade: (output: TOutput, input: TInput) => Promise<number> | number
  /** Optional reason field set when grade < 1 */
  description?: string
}

export interface EvalSuite<TInput = unknown, TOutput = unknown> {
  name: string
  /** Run a case end-to-end; returns the model/agent output to grade. */
  run: (input: TInput) => Promise<TOutput>
  cases: EvalCase<TInput, TOutput>[]
  /** Skip cases where this returns true (e.g. provider not configured) */
  skipIf?: () => boolean | Promise<boolean>
}

export interface EvalCaseResult {
  id: string
  score: number
  passed: boolean
  durationMs: number
  error?: string
}

export interface EvalReport {
  suite: string
  cases: EvalCaseResult[]
  passed: number
  failed: number
  total: number
  averageScore: number
  durationMs: number
  skipped: boolean
}

/** Run a single suite. Failures produce a 0 score, never throw. */
export async function runSuite<I, O>(suite: EvalSuite<I, O>): Promise<EvalReport> {
  const start = Date.now()
  const skipped = suite.skipIf ? Boolean(await suite.skipIf()) : false
  if (skipped) {
    return {
      suite: suite.name,
      cases: [],
      passed: 0,
      failed: 0,
      total: suite.cases.length,
      averageScore: 0,
      durationMs: 0,
      skipped: true,
    }
  }

  const results: EvalCaseResult[] = []
  for (const c of suite.cases) {
    const t0 = Date.now()
    try {
      const out = await suite.run(c.input)
      const score = await c.grade(out, c.input)
      results.push({
        id: c.id,
        score,
        passed: score >= 1,
        durationMs: Date.now() - t0,
      })
    } catch (err) {
      results.push({
        id: c.id,
        score: 0,
        passed: false,
        durationMs: Date.now() - t0,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
  const passed = results.filter((r) => r.passed).length
  const total = results.length
  const avg = total === 0 ? 0 : results.reduce((s, r) => s + r.score, 0) / total
  return {
    suite: suite.name,
    cases: results,
    passed,
    failed: total - passed,
    total,
    averageScore: avg,
    durationMs: Date.now() - start,
    skipped: false,
  }
}

/** Run multiple suites; print a one-line summary per suite. */
export async function runEvals(suites: EvalSuite[]): Promise<EvalReport[]> {
  const reports: EvalReport[] = []
  for (const s of suites) reports.push(await runSuite(s))
  return reports
}

export function formatReport(r: EvalReport): string {
  if (r.skipped) return `[skipped] ${r.suite}`
  const pct = r.total === 0 ? 0 : Math.round((r.passed / r.total) * 100)
  return `${r.suite.padEnd(40)} ${r.passed}/${r.total} (${pct}%)  avg=${r.averageScore.toFixed(2)}  ${r.durationMs}ms`
}
