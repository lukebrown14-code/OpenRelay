import { JSDOM } from "jsdom"
import { createStatusWidget } from "./src/statusWidget.js"
import { statusReport } from "./src/statusData.js"

const dom = new JSDOM("<!doctype html><html><body><div id='host'></div></body></html>")
globalThis.document = dom.window.document
globalThis.window = dom.window

function fail(msg) {
  console.error(`FAIL: ui-state-handling (${msg})`)
  process.exit(1)
}

const host = document.getElementById("host")

// Success path keeps working.
const ok = createStatusWidget(host, async () => statusReport)
let state = await ok.load()
if (state !== "ready") fail(`success load ended in state ${state}, expected ready`)
if (ok.blocks.data.hidden) fail("data block hidden after successful load")
if (!ok.blocks.data.textContent.includes("api: up")) fail("data block missing service rows")
if (!ok.blocks.loading.hidden) fail("loading block still visible after successful load")

// Failure path must surface the error.
let failing = 0
const bad = createStatusWidget(host, async () => {
  failing += 1
  throw new Error("status endpoint unreachable")
})
state = await bad.load()
if (state !== "failed") fail(`failed load ended in state ${state}, expected failed`)
if (bad.blocks.error.hidden) fail("error block hidden after failed load")
if (!bad.blocks.error.textContent.includes("status endpoint unreachable")) fail("error block missing the error message")
if (!bad.blocks.loading.hidden) fail("loading block still visible after failed load")

// Recovery: the next successful load clears the error.
const flaky = createStatusWidget(host, async () => {
  if (flakyCalls++ === 0) throw new Error("boom")
  return statusReport
})
let flakyCalls = 0
state = await flaky.load()
if (state !== "failed") fail(`flaky first load ended in state ${state}`)
state = await flaky.load()
if (state !== "ready") fail(`flaky retry ended in state ${state}, expected ready`)
if (!flaky.blocks.error.hidden) fail("error block not cleared by successful reload")

console.log("PASS: ui-state-handling")
