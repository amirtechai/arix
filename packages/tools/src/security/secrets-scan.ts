/**
 * secrets_scan (N6) — scan files or a string for likely API keys, tokens,
 * private keys, and high-entropy strings. Pure-JS, no external deps.
 */

import { readFile } from 'node:fs/promises'
import type { Tool, ToolResult } from '@arix-code/core'

interface Pattern {
  id: string
  description: string
  regex: RegExp
  /** Mask the captured group when reporting */
  redact: boolean
}

const PATTERNS: Pattern[] = [
  { id: 'aws-access-key',  description: 'AWS Access Key ID',                                regex: /\bAKIA[0-9A-Z]{16}\b/g,                            redact: true },
  { id: 'aws-secret-key',  description: 'AWS Secret Access Key (heuristic)',               regex: /\b(?:aws.?secret|secret.?access.?key).{0,5}[:=]\s*['"]?([A-Za-z0-9/+=]{40})['"]?/gi, redact: true },
  { id: 'gcp-key',         description: 'GCP service account private key',                regex: /-----BEGIN PRIVATE KEY-----/g,                       redact: false },
  { id: 'rsa-private',     description: 'RSA private key',                                regex: /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/g, redact: false },
  { id: 'github-token',    description: 'GitHub personal access token',                  regex: /\bgh[opsu]_[A-Za-z0-9]{36,}\b/g,                     redact: true },
  { id: 'slack-token',     description: 'Slack bot/user token',                          regex: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g,                  redact: true },
  { id: 'stripe-key',      description: 'Stripe live key',                                regex: /\b(?:sk|rk|pk)_live_[A-Za-z0-9]{24,}\b/g,            redact: true },
  { id: 'jwt',             description: 'JSON Web Token',                                regex: /\beyJ[A-Za-z0-9_=-]{10,}\.eyJ[A-Za-z0-9_=-]{10,}\.[A-Za-z0-9_.+/=-]{10,}\b/g, redact: true },
  { id: 'openai-key',      description: 'OpenAI API key',                                regex: /\bsk-[A-Za-z0-9]{20,}\b/g,                           redact: true },
  { id: 'anthropic-key',   description: 'Anthropic API key',                              regex: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g,                     redact: true },
  { id: 'google-api-key',  description: 'Google API key',                                 regex: /\bAIza[0-9A-Za-z_-]{35}\b/g,                         redact: true },
  { id: 'generic-secret',  description: 'Variable named *secret/*token/*password with a value', regex: /\b(?:secret|token|password|apikey|api_key)\s*[:=]\s*['"]([A-Za-z0-9_\-./+=]{20,})['"]/gi, redact: true },
]

export interface SecretFinding {
  patternId: string
  description: string
  /** 1-based line within the source */
  line: number
  /** Masked match (full match for context) */
  preview: string
}

export function scanString(text: string): SecretFinding[] {
  const findings: SecretFinding[] = []
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    for (const p of PATTERNS) {
      p.regex.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = p.regex.exec(line)) !== null) {
        const match = m[0]
        const masked = p.redact && match.length > 8 ? match.slice(0, 4) + '…' + match.slice(-4) : match
        findings.push({
          patternId: p.id,
          description: p.description,
          line: i + 1,
          preview: masked,
        })
        if (m.index === p.regex.lastIndex) p.regex.lastIndex++
      }
    }
  }
  return findings
}

/** Replace all detected secrets in text with `<redacted:patternId>`. */
export function redact(text: string): string {
  let result = text
  for (const p of PATTERNS) {
    p.regex.lastIndex = 0
    result = result.replace(p.regex, `<redacted:${p.id}>`)
  }
  return result
}

export class SecretsScanTool implements Tool {
  readonly name = 'secrets_scan'
  readonly description = 'Scan a file or string for likely API keys, tokens, and private keys. Returns findings (line + masked preview).'
  readonly requiresConfirmation = false
  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      file:    { type: 'string', description: 'File path to scan' },
      content: { type: 'string', description: 'Inline content (alternative to file)' },
    },
  }

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const file = input['file'] as string | undefined
    const content = input['content'] as string | undefined
    let text: string
    if (file) {
      try { text = await readFile(file, 'utf-8') }
      catch (err) { return { toolCallId: '', success: false, output: '', error: (err as Error).message } }
    } else if (content !== undefined) {
      text = content
    } else {
      return { toolCallId: '', success: false, output: '', error: 'Provide `file` or `content`' }
    }
    const findings = scanString(text)
    if (findings.length === 0) return { toolCallId: '', success: true, output: '(no secrets found)' }
    const lines = findings.map((f) => `${f.line}:${f.patternId}  ${f.description}  →  ${f.preview}`)
    return { toolCallId: '', success: true, output: `${findings.length} finding(s):\n${lines.join('\n')}` }
  }
}
