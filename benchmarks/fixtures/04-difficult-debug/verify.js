import { createTokenBucket } from "./src/rate-limiter.js"
import assert from "node:assert"

// Fake clock: time is controlled manually so the test is deterministic.
let t = 0
const now = () => t

let failed = 0
function check(name, fn) {
  try {
    fn()
  } catch (e) {
    failed++
    console.error(`FAIL ${name}: ${e.message}`)
  }
}

check("starts full and drains on take", () => {
  const b = createTokenBucket({ capacity: 3, refillPerSecond: 2, now })
  assert.strictEqual(b.available(), 3)
  assert.strictEqual(b.tryTake(2), true)
  assert.strictEqual(b.available(), 1)
})

check("refill accumulates fractions across short intervals", () => {
  t = 0
  const b = createTokenBucket({ capacity: 3, refillPerSecond: 2, now })
  b.tryTake(3)
  t = 250
  assert.ok(Math.abs(b.available() - 0.5) < 1e-9, `at 250ms expected 0.5 tokens, got ${b.available()}`)
  t = 500
  assert.ok(Math.abs(b.available() - 1) < 1e-9, `at 500ms expected 1 token, got ${b.available()}`)
  assert.strictEqual(b.tryTake(1), true)
  t = 750
  assert.ok(Math.abs(b.available() - 0.5) < 1e-9, `at 750ms expected 0.5 tokens, got ${b.available()}`)
})

check("take fails while below the requested amount, succeeds at threshold", () => {
  t = 0
  const b = createTokenBucket({ capacity: 2, refillPerSecond: 1, now })
  b.tryTake(2)
  t = 500
  assert.strictEqual(b.tryTake(1), false, "should not allow a take at 0.5 tokens")
  t = 1000
  assert.strictEqual(b.tryTake(1), true, "should allow a take at 1.0 tokens")
})

check("refill never exceeds capacity", () => {
  t = 0
  const b = createTokenBucket({ capacity: 2, refillPerSecond: 5, now })
  b.tryTake(2)
  t = 10_000
  assert.strictEqual(b.available(), 2, "bucket should be full (capped at capacity)")
})

check("default clock works (real time, no crash)", () => {
  const b = createTokenBucket({ capacity: 1, refillPerSecond: 1 })
  assert.strictEqual(typeof b.tryTake(1), "boolean")
})

if (failed > 0) {
  console.error(`FAIL: difficult-debug (${failed} checks failed)`)
  process.exit(1)
}
console.log("PASS: difficult-debug")
