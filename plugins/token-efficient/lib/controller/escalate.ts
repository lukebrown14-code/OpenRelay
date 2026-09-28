import type { RouteTaskState } from "./route"

export type EscalateDecision = {
  escalate: boolean
  failedVerifications: number
  cycles: number
  reason?: string
}

/**
 * Escalate when the task has accumulated >= maxCycles failed verification runs
 * (deterministic §5.3 signal; proxies "unsuccessful edit/test cycles" from
 * telemetry already recorded in Stage 1). No fuzzy "model seems confused" logic.
 */
export function shouldEscalate(task: RouteTaskState | undefined, maxCycles: number): EscalateDecision {
  if (!task) return { escalate: false, failedVerifications: 0, cycles: 0 }
  const failed = task.verifications.filter((v) => v.verdict === "fail").length
  const cycles = task.editTestCycles
  if (failed >= maxCycles) {
    return { escalate: true, failedVerifications: failed, cycles, reason: `failed verifications ${failed} >= ${maxCycles}` }
  }
  return { escalate: false, failedVerifications: failed, cycles }
}
