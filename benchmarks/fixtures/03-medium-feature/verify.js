import assert from "node:assert"
import { retry } from "./src/index.js"

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let failed = 0
async function check(name, fn) {
  try {
    await fn()
  } catch (e) {
    failed++
    console.error(`FAIL ${name}: ${e.message}`)
  }
}

await check("resolves immediately on success", async () => {
  const r = await retry(async () => "ok")
  assert.strictEqual(r, "ok")
})

await check("retries until success", async () => {
  let calls = 0
  const r = await retry(async () => {
    calls++
    if (calls < 3) throw new Error("flaky")
    return "third"
  }, { attempts: 5 })
  assert.strictEqual(calls, 3)
  assert.strictEqual(r, "third")
})

await check("rejects with last error after exhausting attempts", async () => {
  let calls = 0
  await assert.rejects(
    () => retry(async () => {
      calls++
      throw new Error(`boom ${calls}`)
    }, { attempts: 3 }),
    (e) => e.message === "boom 3" && calls === 3,
  )
})

await check("waits delayMs between attempts", async () => {
  let calls = 0
  const start = Date.now()
  await retry(async () => {
    calls++
    if (calls < 3) throw new Error("flaky")
  }, { attempts: 4, delayMs: 40 })
  const elapsed = Date.now() - start
  assert.ok(elapsed >= 70, `expected >= 70ms total delay, got ${elapsed}`)
})

await check("supports sync functions", async () => {
  let calls = 0
  const r = retry(() => {
    calls++
    if (calls < 2) throw new Error("sync flaky")
    return 42
  }, { attempts: 3 })
  assert.strictEqual(await r, 42)
})

await check("rejects on attempts < 1", async () => {
  await assert.rejects(() => retry(async () => 1, { attempts: 0 }))
})

await check("default attempts is 3", async () => {
  let calls = 0
  await assert.rejects(
    () => retry(async () => {
      calls++
      throw new Error("x")
    }),
    () => calls === 3,
  )
})

if (failed > 0) {
  console.error(`FAIL: medium-feature (${failed} checks failed)`)
  process.exit(1)
}
console.log("PASS: medium-feature")
