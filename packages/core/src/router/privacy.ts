/**
 * Privacy-aware routing (R5) — when a turn's payload contains likely PII
 * or secrets, automatically route it to a local-only model (Ollama) instead
 * of a hosted provider.
 *
 * Detection is conservative — false positives are preferred over leaks.
 */

const SECRET_RE = /\b(?:AKIA[0-9A-Z]{16}|gh[opsu]_[A-Za-z0-9]{36,}|sk-(?:ant-)?[A-Za-z0-9_-]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35}|-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----)/

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/
const PHONE_RE = /\b(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/
const SSN_RE   = /\b\d{3}-\d{2}-\d{4}\b/
const CC_RE    = /\b(?:\d[ -]*?){13,19}\b/

export type PrivacyClass = 'public' | 'pii' | 'secret'

export interface PrivacyDecision {
  class: PrivacyClass
  reason?: string
  /** Suggested provider — null when the original choice is fine */
  suggestProvider?: string
  suggestModel?: string
}

export interface PrivacyPolicy {
  /** Provider/model to fall back to when class !== 'public' */
  localProvider: string
  localModel: string
  /** Skip detection entirely */
  disabled?: boolean
}

const DEFAULT_POLICY: PrivacyPolicy = {
  localProvider: 'ollama',
  localModel: 'llama3.2:3b',
}

export function classifyPayload(text: string): { class: PrivacyClass; reason?: string } {
  if (SECRET_RE.test(text)) return { class: 'secret', reason: 'detected likely API key or private key' }
  if (CC_RE.test(text) || SSN_RE.test(text)) return { class: 'pii', reason: 'detected likely card number or SSN' }
  if (EMAIL_RE.test(text) && PHONE_RE.test(text)) return { class: 'pii', reason: 'detected email + phone in same payload' }
  return { class: 'public' }
}

export function privacyRoute(
  text: string,
  preferred: { provider: string; model: string },
  policy: PrivacyPolicy = DEFAULT_POLICY,
): PrivacyDecision {
  if (policy.disabled) return { class: 'public' }
  const { class: cls, reason } = classifyPayload(text)
  if (cls === 'public') return { class: 'public' }
  if (preferred.provider === policy.localProvider) {
    return { class: cls, ...(reason ? { reason } : {}) }
  }
  return {
    class: cls,
    ...(reason ? { reason } : {}),
    suggestProvider: policy.localProvider,
    suggestModel: policy.localModel,
  }
}
