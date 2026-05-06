/**
 * Task classifier — keyword-based prompt analysis, zero LLM overhead.
 * Returns: coding | planning | review | simple
 */

export type TaskType = 'coding' | 'planning' | 'review' | 'simple'

export interface ClassifyResult {
  type: TaskType
  confidence: number  // 0–1
  reason: string
}

const PLANNING_PATTERNS = [
  /\b(architect|architecture|design|plan|roadmap|strategy|diagram|structure|scaffold|blueprint|spec|rfc|adr)\b/i,
  /\b(how (should|would) (we|i|you) (build|design|structure|approach|implement))\b/i,
  /\b(what (is|would be) the best (way|approach|pattern|architecture))\b/i,
  /\b(system design|data model|er diagram|entity relation|module|breakdown|decompose)\b/i,
]

const CODING_PATTERNS = [
  /\b(implement|write|create|add|build|code|function|class|method|component|module|feature)\b/i,
  /\b(fix|debug|bug|error|exception|crash|broken|failing|issue|problem)\b/i,
  /\b(refactor|rewrite|rename|move|extract|migrate|upgrade|update)\b/i,
  /\b(test|spec|unit test|integration test|e2e|jest|vitest|xcode|xctest)\b/i,
  /\b(typescript|javascript|python|swift|dart|rust|go|java|kotlin|sql)\b/i,
]

const REVIEW_PATTERNS = [
  /\b(review|analyze|analyse|audit|check|inspect|evaluate|assess)\b/i,
  /\b(explain|what does|how does|what is|describe|summarize|walk me through)\b/i,
  /\b(is this (correct|good|right|ok|fine)|looks? (good|correct|right)|any (issues?|problems?|bugs?))\b/i,
  /\b(security|vulnerability|performance|optimiz|improve|suggestion)\b/i,
]

export function classifyTask(prompt: string): ClassifyResult {
  const words = prompt.trim().split(/\s+/).length
  if (words <= 5) {
    return { type: 'simple', confidence: 0.7, reason: 'Short prompt' }
  }

  let planScore = 0
  let codeScore = 0
  let reviewScore = 0

  for (const p of PLANNING_PATTERNS) {
    if (p.test(prompt)) planScore++
  }
  for (const p of CODING_PATTERNS) {
    if (p.test(prompt)) codeScore++
  }
  for (const p of REVIEW_PATTERNS) {
    if (p.test(prompt)) reviewScore++
  }

  const total = planScore + codeScore + reviewScore
  if (total === 0) {
    return { type: 'simple', confidence: 0.5, reason: 'No strong signals' }
  }

  if (planScore >= codeScore && planScore >= reviewScore) {
    return { type: 'planning', confidence: Math.min(planScore / 2, 1), reason: 'Architecture/design keywords' }
  }
  if (codeScore >= reviewScore) {
    return { type: 'coding', confidence: Math.min(codeScore / 3, 1), reason: 'Implementation keywords' }
  }
  return { type: 'review', confidence: Math.min(reviewScore / 2, 1), reason: 'Analysis/review keywords' }
}

/** Map task type to ModelCatalogue tier for auto-routing */
export function taskTier(type: TaskType): 'simple' | 'medium' | 'complex' {
  switch (type) {
    case 'planning':  return 'complex'
    case 'coding':    return 'medium'
    case 'review':    return 'medium'
    case 'simple':    return 'simple'
  }
}
