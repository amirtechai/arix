/**
 * Confidence calibration (R7) — parses structured self-confidence markers
 * the assistant emits inline. The agent surfaces low-confidence claims to
 * the user instead of presenting all output equally.
 *
 * Two formats are accepted:
 *   1. Inline tag:    "[conf:0.4] this might be wrong"
 *   2. Trailing JSON: {"claim":"...", "confidence":0.6}
 *
 * Surface anything below `threshold` (default 0.7) as a caveat.
 */

export interface ConfidenceClaim {
  claim: string
  confidence: number
  /** Character offset within the input where the claim starts */
  start: number
  end: number
}

const INLINE_RE = /\[conf:(0(?:\.\d+)?|1(?:\.0+)?)\]\s*([^\n[]+)/g
const TRAILING_JSON_RE = /\{"claim":"((?:[^"\\]|\\.)*)","confidence":(0(?:\.\d+)?|1(?:\.0+)?)\}/g

export function parseConfidenceClaims(text: string): ConfidenceClaim[] {
  const claims: ConfidenceClaim[] = []
  INLINE_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = INLINE_RE.exec(text)) !== null) {
    claims.push({
      claim: m[2]!.trim(),
      confidence: parseFloat(m[1]!),
      start: m.index,
      end: m.index + m[0].length,
    })
  }
  TRAILING_JSON_RE.lastIndex = 0
  while ((m = TRAILING_JSON_RE.exec(text)) !== null) {
    claims.push({
      claim: JSON.parse(`"${m[1]!}"`) as string,
      confidence: parseFloat(m[2]!),
      start: m.index,
      end: m.index + m[0].length,
    })
  }
  return claims
}

export function lowConfidence(claims: ConfidenceClaim[], threshold = 0.7): ConfidenceClaim[] {
  return claims.filter((c) => c.confidence < threshold)
}

/**
 * Strip confidence markers from text so it reads naturally to the user
 * after the agent UI has already extracted them for display.
 */
export function stripConfidenceMarkers(text: string): string {
  return text
    .replace(INLINE_RE, (_match, _conf, claim) => claim as string)
    .replace(TRAILING_JSON_RE, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Aggregate score: mean confidence weighted by claim length. */
export function meanConfidence(claims: ConfidenceClaim[]): number | null {
  if (claims.length === 0) return null
  let totalLen = 0
  let weighted = 0
  for (const c of claims) {
    const len = Math.max(1, c.claim.length)
    totalLen += len
    weighted += c.confidence * len
  }
  return totalLen === 0 ? null : weighted / totalLen
}
