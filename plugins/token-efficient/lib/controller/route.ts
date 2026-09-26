import type { RouteMode } from "./config"

export type RouteTarget = "workhorse" | "premium"

export type RouteTaskState = {
  attempts: number
  editTestCycles: number
  verifications: Array<{ verdict: string }>
}

export type RouteDecision = {
  /** null = leave the session's default model untouched. */
  target: RouteTarget | null
  override?: string
  reason: string
  uncertain: boolean
}

/** Leading slash-keyword a user can type to force routing. `/auto` clears the override. */
export const OVERRIDE_RE = /^\/(auto|glm|chatgpt|plan|review|deep)\b/

const PREMIUM_MARKERS =
  /\b(architecture|architectural|refactor(?:ing)?|security|auth(?:entication|orization)?|design|migrat(?:e|ion)|schema|permission|credential|secret|production|deploy(?:ment)?|scalab\w+|concurren\w+|race condition|deadlock|system (?:design|architecture))\b/i

const TRIVIAL_MARKERS =
  /\b(rename|typo|spell(?:ing)?|format(?:ting)?|indent(?:ation)?|comment|whitespace|bump (?:the )?version|update (?:the )?dependenc|one-line|single line)\b/i

export function detectOverride(text: string): string | undefined {
  const m = OVERRIDE_RE.exec(text.trim())
  return m ? m[1] : undefined
}

/**
 * Deterministic routing decision. No LLM. Explicit override wins, then forced mode,
 * then complexity markers. `uncertain` is emitted for mixed signals as a telemetry
 * signal only (Jev routing is a later, opt-in experiment); it never changes the target.
 */
export function route(text: string, _task: RouteTaskState | undefined, mode: RouteMode): RouteDecision {
  const t = text.trim()
  const override = detectOverride(t)
  if (override) {
    const premium = override === "chatgpt" || override === "plan" || override === "review" || override === "deep"
    return {
      target: premium ? "premium" : "workhorse",
      override,
      reason: `override:/${override}`,
      uncertain: false,
    }
  }
  if (mode === "premium") return { target: "premium", reason: "forced:premium", uncertain: false }
  if (mode === "glm") return { target: "workhorse", reason: "forced:glm", uncertain: false }
  if (mode === "off") return { target: null, reason: "routing:off", uncertain: false }

  if (PREMIUM_MARKERS.test(t)) {
    const uncertain = TRIVIAL_MARKERS.test(t)
    return { target: "premium", reason: uncertain ? "classifier:uncertain" : "classifier:complex", uncertain }
  }
  return { target: "workhorse", reason: "classifier:default", uncertain: false }
}
