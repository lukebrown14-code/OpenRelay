export type CheckpointInput = {
  type: string
  pattern?: string | string[]
  title: string
}

/**
 * Keyword-driven high-risk detector for the minimal human-checkpoint gate.
 * Off by default (see config). v1 only *flags*; enforcement is a later stage.
 */
export function isHighRisk(input: CheckpointInput, patterns: string[]): boolean {
  const haystack = [input.type, input.title]
  if (typeof input.pattern === "string") haystack.push(input.pattern)
  else if (Array.isArray(input.pattern)) haystack.push(...input.pattern)
  const hay = haystack.filter(Boolean).join(" ").toLowerCase()
  return patterns.some((p) => p.length > 0 && hay.includes(p.toLowerCase()))
}
