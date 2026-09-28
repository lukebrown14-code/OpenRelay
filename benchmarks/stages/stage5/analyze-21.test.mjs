import { test } from "node:test"
import assert from "node:assert/strict"
import { exactBootstrap, verdict } from "./analyze-21.mjs"

const rows = (tokens, extra = {}) => tokens.map((n, i) => ({ id: String(i), valid: true, verifyPass: true,
  tokens: n, rounds: 10, retries: 0, totalDurationSec: 30, ...extra }))

test("exact paired bootstrap has 3125 draws and positive bound for stable savings", () => {
  const result = exactBootstrap([100, 100, 100, 100, 100], [60, 60, 60, 60, 60])
  assert.equal(result.samples, 3125)
  assert.equal(result.lowerPct, 40)
})

test("pass requires target, noise, quality, retries, and rounds", () => {
  const base = { a: rows([100, 100, 100, 100, 100]), b: rows([75, 75, 75, 75, 75]), aa: rows([100, 100]) }
  assert.equal(verdict(base).status, "PASS")
  assert.equal(verdict({ ...base, b: rows([76, 76, 76, 76, 76]) }).status, "INCONCLUSIVE")
  assert.equal(verdict({ ...base, aa: rows([130, 100]) }).status, "INCONCLUSIVE")
  assert.equal(verdict({ ...base, b: rows([75, 75, 75, 75, 75], { rounds: 12 }) }).status, "INCONCLUSIVE")
  assert.equal(verdict({ ...base, b: rows([75, 75, 75, 75, 75], { retries: 1 }) }).status, "INCONCLUSIVE")
  assert.equal(verdict({ ...base, b: rows([75, 75, 75, 75, 75], { verifyPass: false }) }).status, "FAIL")
  assert.equal(verdict({ ...base, a: rows([100, 100, 100, 100, 100], { verifyPass: false }) }).status, "INCONCLUSIVE")
  assert.equal(verdict({ ...base, b: rows([75, 75, 75, 75, 75], { valid: false }) }).status, "INCONCLUSIVE")
  assert.throws(() => verdict({ ...base, b: rows([75]) }), /five A\/B pairs/)
})

test("incomplete coding usage cannot pass", () => {
  const a = rows([100, 100, 100, 100, 100])
  const b = rows([60, 60, 60, 60, 60])
  b[2] = { ...b[2], valid: false, tokens: null }
  assert.deepEqual(verdict({ a, b, aa: rows([100, 100]) }), {
    status: "INCONCLUSIVE", reason: "invalid mechanics", invalid: ["2"]
  })
})
