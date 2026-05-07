/**
 * Reusable graders for eval cases. All return a score in [0,1].
 */

export function exact(expected: string) {
  return (out: string) => (out.trim() === expected.trim() ? 1 : 0)
}

export function contains(needle: string | RegExp) {
  return (out: string) => {
    if (typeof needle === 'string') return out.includes(needle) ? 1 : 0
    return needle.test(out) ? 1 : 0
  }
}

export function containsAll(needles: (string | RegExp)[]) {
  return (out: string) => {
    let hits = 0
    for (const n of needles) {
      if (typeof n === 'string' ? out.includes(n) : n.test(out)) hits++
    }
    return needles.length === 0 ? 1 : hits / needles.length
  }
}

/**
 * All required terms must be present for a full pass. Missing required terms
 * scale the score down proportionally. Bonus terms exist for diagnostic
 * ranking but never penalise a fully-required output.
 */
export function rubric(opts: { required: (string | RegExp)[]; bonus?: (string | RegExp)[] }) {
  return (out: string) => {
    let req = 0
    for (const n of opts.required) {
      if (typeof n === 'string' ? out.includes(n) : n.test(out)) req++
    }
    const reqScore = opts.required.length === 0 ? 1 : req / opts.required.length
    if (reqScore < 1) return reqScore * 0.7
    return 1
  }
}

/** JSON shape match — every key must exist; values may be regex patterns. */
export function jsonMatches(template: Record<string, unknown>) {
  return (out: string) => {
    let parsed: Record<string, unknown>
    try { parsed = JSON.parse(out) as Record<string, unknown> } catch { return 0 }
    let hits = 0
    const keys = Object.keys(template)
    for (const k of keys) {
      const expected = template[k]
      const actual = parsed[k]
      if (expected instanceof RegExp) {
        if (typeof actual === 'string' && expected.test(actual)) hits++
      } else if (actual === expected) {
        hits++
      }
    }
    return keys.length === 0 ? 1 : hits / keys.length
  }
}
