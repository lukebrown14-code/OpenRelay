import test from "node:test"
import assert from "node:assert/strict"
import { summarize } from "./analyze-stage7.mjs"

const row = (phase, policy, premium, duration, status = "pass") => ({ phase, fixture: "27-duration-format", policy, completedAt: "now", status,
  usageComplete: premium !== null, tokens: { premium, total: premium ?? 0 }, totalDurationMs: duration,
  attempts: [{ tier: policy === "P" ? "premium" : "workhorse" }] })

test("mechanics and A/A do not contaminate policy comparisons", () => {
  const s = summarize([row("mechanics", "P", 500, 1000), row("aa", "P", 700, 1000),
    row("main", "P", 100, 2000), row("main", "E1", 50, 2500)])
  assert.equal(s.comparisons.find(c => c.policy === "P").premium, 100)
  assert.equal(s.paired[0].premiumChangePct, -50)
  assert.equal(s.paired[0].timeChangePct, 25)
  assert.equal(s.totals.workflows, 4)
})

test("missing usage leaves economic change unavailable", () => {
  const s = summarize([row("main", "P", 100, 2000), row("main", "E1", null, 2500)])
  assert.equal(s.paired[0].premiumChangePct, null)
})
