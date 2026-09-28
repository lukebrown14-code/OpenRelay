#!/usr/bin/env node
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../results/pi-stage-test")
const label = process.argv[2]
if (!label) { console.error("usage: node benchmarks/pi/analyze.mjs <label>"); process.exit(2) }
const dir = path.join(root, label)
if (!fs.existsSync(dir)) { console.error(`missing label directory: ${dir}`); process.exit(2) }
const runs = []
for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const file = path.join(dir, entry.name, "run.json")
  try { runs.push(JSON.parse(fs.readFileSync(file, "utf8"))) } catch {}
}
function aggregate(predicate) {
  const list = runs.filter(predicate)
  const prompt = list.map((r) => r.promptTokens)
  const total = list.map((r) => r.usage?.totalTokens)
  const times = list.map((r) => r.elapsedMs)
  return {
    n: list.length,
    verifyPass: list.filter((r) => r.verifyPass).length,
    usageCoverage: list.map((r) => r.usageCoverage),
    promptTokens: prompt,
    meanPromptTokens: prompt.length ? prompt.reduce((a, b) => a + b, 0) / prompt.length : null,
    totalTokens: total,
    meanTotalTokens: total.length ? total.reduce((a, b) => a + b, 0) / total.length : null,
    completeMs: times,
    medianCompleteMs: times.length ? [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)] : null,
    filteredResults: list.reduce((a, r) => a + r.filteringResultCount, 0),
    contextDecisions: list.flatMap((r) => r.context ?? []).map((e) => ({ type: e.type, delivered: e.delivered, hash: e.hash, reason: e.reason, bytes: e.bytes })),
  }
}
const verdict = (fixture, settings) => aggregate((r) => r.fixture === fixture && r.filtering === settings.filtering && r.context === settings.context)
const conditions = ["05-noisy-test-log", "01-trivial-edit", "02-routine-bug", "06-ui-status-indicator", "09-ui-shared-style", "21-dependency-upgrade", "10-git-missing-changes"]
const output = {
  label,
  completedRuns: runs.length,
  sessions: runs.map((r) => ({ fixture: r.fixture, filtering: r.filtering, context: r.context, repetition: r.repetition, verifyPass: r.verifyPass, promptTokens: r.promptTokens, totalTokens: r.usage?.totalTokens, elapsedMs: r.elapsedMs, usageCoverage: r.usageCoverage })),
  byCell: Object.fromEntries(conditions.map((f) => [f, { off: verdict(f, { filtering: "off", context: "off" }), filtering: verdict(f, { filtering: "on", context: "off" }), context: verdict(f, { filtering: "off", context: "on" }), filteringPlusContext: verdict(f, { filtering: "on", context: "on" }) }])),
}
console.log(JSON.stringify(output, null, 2))
