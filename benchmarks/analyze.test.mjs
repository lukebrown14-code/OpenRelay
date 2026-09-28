import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { baselineChangePct, savingsPct, summarizeStage5, loadTelemetry, metricsFor, stage5Gate, comparePerFixture } from "./analyze.mjs"
import { reconcileTokens, intervalUnionMs } from "./stages/stage5/audit-stage5.mjs"

const row = (tokens, extra = {}) => ({ tokensInPlusCache: tokens, verifyPass: 1,
  modelRounds: 4, retriesFailed: 0, durationSec: 10, contextPackets: 0, ...extra })

test("savings use A as denominator, with explicit zero/missing handling", () => {
  assert.equal(savingsPct(100, 75), 25)
  assert.equal(savingsPct(100, 100), 0)
  assert.equal(savingsPct(100, 125), -25)
  assert.equal(baselineChangePct(100, 125), 25)
  assert.equal(savingsPct(100, 0), 100)
  for (const a of [0, null, undefined, NaN]) assert.equal(savingsPct(a, 10), null)
  assert.equal(savingsPct(100, null), null)
})

test("class savings weight tokens, keep failed runs, and exclude pilots", () => {
  const a = new Map([["06-ui", [row(100), row(100)]], ["09-ui", [row(300), row(300)]], ["21-pilot", [row(1000)]]])
  const b = new Map([["06-ui", [row(50), row(50)]], ["09-ui", [row(250), row(250, { verifyPass: 0 })]], ["21-pilot", [row(0)]]])
  const result = summarizeStage5(a, b, ["06-ui", "09-ui"])
  assert.equal(result.metrics.tokensInPlusCache.sumA, 800)
  assert.equal(result.metrics.tokensInPlusCache.sumB, 600)
  assert.equal(result.metrics.tokensInPlusCache.savingsPct, 25)
  assert.equal(result.metrics.verifyPass.meanB, 0.75)
  assert.equal(result.metrics.retriesFailed.difference, 0)
  assert.equal(result.metrics.retriesFailed.changePct, null)
})

test("printed fixture and Stage 5 percentages use the baseline denominator", () => {
  const a = new Map([["06-ui", [row(100)]]])
  const b = new Map([["06-ui", [row(75)]]])
  const output = []
  const original = console.log
  try {
    console.log = (...args) => output.push(args.join(" "))
    comparePerFixture("A", a, "B", b)
    stage5Gate("A", "B", a, b)
  } finally { console.log = original }
  assert.ok(output.includes("tokensInPlusCache\t100\t75\t-25.0%"))
  assert.ok(output.some(line => line.startsWith("input+cacheRead savings: 25.0%")))
})

test("missing metrics and mismatched repetitions cannot produce a savings gate", () => {
  const a = new Map([["06", [row(100), row(100)]]])
  const missing = summarizeStage5(a, new Map([["06", [row(75), row(null)]]]), ["06"])
  assert.equal(missing.metrics.tokensInPlusCache.savingsPct, null)
  assert.equal(missing.metrics.tokensInPlusCache.meanB, null)
  assert.ok(missing.issues.some(i => i.includes("incomplete")))
  const unmatched = summarizeStage5(a, new Map([["06", [row(75)]]]), ["06"])
  assert.equal(unmatched.matched, false)
  assert.equal(unmatched.metrics.tokensInPlusCache.savingsPct, null)
})

test("a telemetry join without valid completed tokens is unavailable, not zero", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stage5-analysis-"))
  try {
    const records = [
      { type: "llm.call", session: "empty", data: {} },
      { type: "llm.call", session: "missing", data: { small: false } },
      { type: "assistant.completed", session: "missing", data: { tokens: { input: 50, output: 1 } } },
      { type: "llm.call", session: "valid", data: { small: false } },
      { type: "assistant.completed", session: "valid", data: { tokens: { input: 50, output: 1, cacheRead: 25 } } },
    ]
    fs.writeFileSync(path.join(dir, "events.jsonl"), records.map(JSON.stringify).join("\n"))
    const { bySession } = loadTelemetry(dir)
    for (const sessionID of ["absent", "empty", "missing"]) assert.equal(metricsFor({ sessionID }, bySession).tokensInPlusCache, null)
    assert.equal(metricsFor({ sessionID: "valid" }, bySession).tokensInPlusCache, 75)
    assert.equal(metricsFor({ sessionID: "valid" }, bySession).allCallsInPlusCache, 75)
    assert.equal(metricsFor({ sessionID: "absent" }, bySession).usageCoverage, "unavailable")
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test("message IDs deduplicate completions while missing title usage blocks all-call totals", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stage5-agents-"))
  try {
    const records = [
      { type: "llm.call", session: "partial", data: { agent: "title", small: true } },
      { type: "llm.call", session: "partial", data: { agent: "build", small: false } },
      { type: "assistant.completed", session: "partial", data: { messageID: "m1", agent: "build", tokens: { input: 80, output: 3, cacheRead: 20 } } },
      { type: "assistant.completed", session: "partial", data: { messageID: "m1", agent: "build", tokens: { input: 80, output: 3, cacheRead: 20 } } },
      { type: "llm.call", session: "complete", data: { agent: "title", small: true } },
      { type: "llm.call", session: "complete", data: { agent: "build", small: false } },
      { type: "assistant.completed", session: "complete", data: { messageID: "m2", agent: "title", tokens: { input: 4, output: 1, cacheRead: 6 } } },
      { type: "assistant.completed", session: "complete", data: { messageID: "m3", agent: "build", tokens: { input: 80, output: 3, cacheRead: 20 } } },
    ]
    fs.writeFileSync(path.join(dir, "events.jsonl"), records.map(JSON.stringify).join("\n"))
    const { bySession } = loadTelemetry(dir)
    const partial = metricsFor({ sessionID: "partial" }, bySession)
    assert.equal(partial.tokensInPlusCache, 100)
    assert.equal(partial.usageCoverage, "partial")
    assert.equal(partial.allCallsInPlusCache, null)
    assert.equal(partial.titleTokensInPlusCache, null)
    const complete = metricsFor({ sessionID: "complete", totalDurationMs: 1000, verifyDurationMs: 100 }, bySession)
    assert.equal(complete.tokensInPlusCache, 100)
    assert.equal(complete.titleTokensInPlusCache, 10)
    assert.equal(complete.smallTokensInPlusCache, 10)
    assert.equal(complete.allCallsInPlusCache, 110)
    assert.equal(complete.usageCoverage, "complete")
    assert.equal(complete.totalDurationSec, 1)
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test("reconciliation detects duplicates, missing usage, and differing step coverage", () => {
  const completion = { ts: "t1", data: { tokens: { input: 10, output: 2, reasoning: 3, cacheRead: 20, cacheWrite: 0 } } }
  const step = { part: { id: "p1", tokens: { input: 10, output: 2, reasoning: 3, cache: { read: 20, write: 0 } } } }
  assert.equal(reconcileTokens([completion], [step]).matched, true)
  assert.equal(reconcileTokens([completion, completion], [step, step]).matched, false)
  assert.equal(reconcileTokens([completion], []).matched, false)
  assert.equal(reconcileTokens([{ data: { tokens: { input: 10 } } }], [step]).matched, false)
  const other = structuredClone(step)
  other.part.tokens.input++
  assert.equal(reconcileTokens([completion], [other]).matched, false)
})

test("elapsed tool time merges overlaps instead of double-counting parallel tools", () => {
  assert.equal(intervalUnionMs([[10, 20], [15, 25], [30, 40]]), 25)
})
