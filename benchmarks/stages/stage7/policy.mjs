export const POLICIES = Object.freeze(["G", "P", "E1", "E2"])

export function modelForAttempt(policy, completedFailedAttempts) {
  if (!POLICIES.includes(policy)) throw new Error(`unknown policy: ${policy}`)
  if (!Number.isInteger(completedFailedAttempts) || completedFailedAttempts < 0) throw new Error("invalid attempt count")
  if (policy === "P") return "premium"
  if (policy === "G") return "workhorse"
  return completedFailedAttempts >= (policy === "E1" ? 1 : 2) ? "premium" : "workhorse"
}

export function nextAttempt(policy, outcomes) {
  if (!Array.isArray(outcomes) || outcomes.length >= 3) return null
  if (outcomes.some(x => x !== "fail")) return outcomes.length ? null : modelForAttempt(policy, 0)
  return modelForAttempt(policy, outcomes.length)
}

export function withinBudget(ledger, limits = { workflows: 32, tokens: 3_000_000, premiumTokens: 1_000_000 }) {
  if (ledger.workflows >= limits.workflows) return "workflow-ceiling"
  if (ledger.tokens >= limits.tokens) return "token-ceiling"
  if (ledger.premiumTokens >= limits.premiumTokens) return "premium-ceiling"
  if (ledger.usageMissing) return "missing-usage"
  return null
}
