/**
 * Built-in eval suites: skill prompt regression (M3) and provider
 * conformance (M5). Designed to run cheaply in CI.
 */

import type { EvalSuite } from './index.js'
import { rubric } from './graders.js'
import { SkillManager } from '../skills/index.js'
import type { Provider } from '../provider/index.js'

/**
 * Skill prompt regression — verifies bundled skills include the disciplined
 * keywords we expect. Catches accidental edits that strip the rules.
 *
 * No model call; pure string assertions on the loaded prompts.
 */
export async function skillRegressionSuite(bundledDir?: string): Promise<EvalSuite<{ skill: string }, string>> {
  const sm = new SkillManager()
  if (bundledDir) await sm.loadFromDirectory(bundledDir)
  else await sm.loadBundled()

  return {
    name: 'skill-regression',
    run: async (input) => {
      const s = sm.get(input.skill)
      return s?.systemPrompt ?? ''
    },
    cases: [
      { id: 'tdd has RED-GREEN-REFACTOR', input: { skill: 'tdd' },
        grade: rubric({ required: ['RED', 'GREEN', 'REFACTOR'], bonus: ['failing test', 'minimum'] }) },
      { id: 'code-reviewer enumerates checklist', input: { skill: 'code-reviewer' },
        grade: rubric({ required: ['Security', 'Performance', /[Cc]orrectness/], bonus: ['BLOCKER', 'NIT'] }) },
      { id: 'debugger systematic', input: { skill: 'debugger' },
        grade: rubric({ required: ['Reproduce', 'root', 'cause'], bonus: ['bisect', 'regression test'] }) },
      { id: 'security-auditor lists OWASP', input: { skill: 'security-auditor' },
        grade: rubric({ required: ['OWASP', /[Ii]njection/, /[Aa]uth/], bonus: ['SSRF', 'CRITICAL'] }) },
      { id: 'pr-author conventional commits', input: { skill: 'pr-author' },
        grade: rubric({ required: ['Conventional Commits', 'feat', 'fix'], bonus: ['BREAKING'] }) },
    ],
  }
}

/**
 * Provider conformance — sanity check that a provider responds to a basic
 * prompt and emits at least one text chunk + a usage record. Skipped when
 * the relevant API key env var is missing.
 *
 * Exists to catch silent regressions when bumping provider SDK versions.
 */
export function providerConformanceSuite(opts: {
  providerName: string
  envVar: string
  factory: () => Provider
  model: string
}): EvalSuite<string, { text: string; sawUsage: boolean }> {
  return {
    name: `provider-conformance:${opts.providerName}`,
    skipIf: () => !process.env[opts.envVar],
    run: async (prompt: string) => {
      const provider = opts.factory()
      const stream = await provider.chat({
        model: opts.model,
        messages: [{ role: 'user', content: prompt, timestamp: Date.now() }],
        maxTokens: 64,
        temperature: 0,
      })
      let text = ''
      let sawUsage = false
      for await (const chunk of stream) {
        if (chunk.text) text += chunk.text
        if (chunk.usage) sawUsage = true
      }
      return { text, sawUsage }
    },
    cases: [
      {
        id: 'responds to ping',
        input: 'Reply with the single word: pong.',
        grade: (out) => (out.text.toLowerCase().includes('pong') ? 1 : 0.3),
      },
      {
        id: 'reports token usage',
        input: 'Say hi.',
        grade: (out) => (out.sawUsage ? 1 : 0),
      },
    ],
  }
}
