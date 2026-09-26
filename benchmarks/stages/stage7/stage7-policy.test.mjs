import test from "node:test"
import assert from "node:assert/strict"
import { modelForAttempt, nextAttempt, withinBudget } from "./policy.mjs"

test("four policies select the same-session model from completed failed attempts", () => {
  assert.deepEqual([0, 1, 2].map(n => modelForAttempt("G", n)), ["workhorse", "workhorse", "workhorse"])
  assert.deepEqual([0, 1, 2].map(n => modelForAttempt("P", n)), ["premium", "premium", "premium"])
  assert.deepEqual([0, 1, 2].map(n => modelForAttempt("E1", n)), ["workhorse", "premium", "premium"])
  assert.deepEqual([0, 1, 2].map(n => modelForAttempt("E2", n)), ["workhorse", "workhorse", "premium"])
})

test("success and unknown verification stop; three failures exhaust the workflow", () => {
  assert.equal(nextAttempt("E1", []), "workhorse")
  assert.equal(nextAttempt("E1", ["fail"]), "premium")
  assert.equal(nextAttempt("E1", ["fail", "pass"]), null)
  assert.equal(nextAttempt("E1", ["unknown"]), null)
  assert.equal(nextAttempt("E1", ["fail", "fail", "fail"]), null)
})

test("budget admission stops at each ceiling and on missing usage", () => {
  const state = { workflows: 0, tokens: 0, premiumTokens: 0, usageMissing: false }
  assert.equal(withinBudget(state), null)
  assert.equal(withinBudget({ ...state, workflows: 32 }), "workflow-ceiling")
  assert.equal(withinBudget({ ...state, tokens: 3_000_000 }), "token-ceiling")
  assert.equal(withinBudget({ ...state, premiumTokens: 1_000_000 }), "premium-ceiling")
  assert.equal(withinBudget({ ...state, usageMissing: true }), "missing-usage")
})
