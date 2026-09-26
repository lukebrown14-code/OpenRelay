#!/usr/bin/env node
import { benchmarkRoot, repositoryRoot } from "../../lib/paths.mjs"
// Preregistered fixture-21 confirmation analysis. Run after all 12 calls.
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { createHash } from "node:crypto"
import { loadRuns, loadRunTelemetry, metricsFor } from "../../analyze.mjs"

const fixture = "21-dependency-upgrade"
const labels = { A: "stage5-21-confirm-r2-a", B: "stage5-21-confirm-r2-b", AA: "stage5-21-confirm-r2-aa" }
const expected = { A: 5, B: 5, AA: 2 }
const sum = xs => xs.reduce((a, b) => a + b, 0)
const savings = (a, b) => 100 * (1 - b / a)
const mean = xs => sum(xs) / xs.length

export function exactBootstrap(a, b) {
  if (a.length !== 5 || b.length !== 5 || [...a, ...b].some(x => !Number.isFinite(x) || x <= 0)) throw Error("five positive token pairs required")
  const draws = []
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++)
    for (let k = 0; k < 5; k++) for (let l = 0; l < 5; l++)
      for (let m = 0; m < 5; m++) {
        const ids = [i, j, k, l, m]
        draws.push(savings(sum(ids.map(n => a[n])), sum(ids.map(n => b[n]))))
      }
  draws.sort((x, y) => x - y)
  return { samples: draws.length, lowerPct: draws[Math.ceil(.025 * draws.length) - 1], upperPct: draws[Math.ceil(.975 * draws.length) - 1] }
}

export function verdict({ a, b, aa }) {
  if ([a, b, aa].some(xs => !Array.isArray(xs)) || a.length !== 5 || b.length !== 5 || aa.length !== 2) throw Error("expected five A/B pairs and two AA controls")
  const all = [...a, ...b, ...aa]
  if (all.some(x => !x.valid)) return { status: "INCONCLUSIVE", reason: "invalid mechanics", invalid: all.filter(x => !x.valid).map(x => x.id) }
  if (a.some(x => !x.verifyPass) || aa.some(x => !x.verifyPass)) return { status: "INCONCLUSIVE", reason: "off-arm verification failure" }
  if (b.some(x => !x.verifyPass)) return { status: "FAIL", reason: "B verification failure" }
  const at = a.map(x => x.tokens), bt = b.map(x => x.tokens)
  const tokenSavingsPct = savings(sum(at), sum(bt))
  const bootstrap = exactBootstrap(at, bt)
  const aaDriftPct = aa.map(x => 100 * (x.tokens / mean(at) - 1))
  const maxAbsAADriftPct = Math.max(...aaDriftPct.map(Math.abs))
  const roundsChangePct = 100 * (mean(b.map(x => x.rounds)) / mean(a.map(x => x.rounds)) - 1)
  const retriesChangePerTask = mean(b.map(x => x.retries)) - mean(a.map(x => x.retries))
  const durationChangePct = 100 * (mean(b.map(x => x.totalDurationSec)) / mean(a.map(x => x.totalDurationSec)) - 1)
  const gates = { savings25: tokenSavingsPct >= 25, bootstrapPositive: bootstrap.lowerPct > 0,
    beyondAADrift: tokenSavingsPct > maxAbsAADriftPct, retries: retriesChangePerTask <= .25,
    rounds: roundsChangePct <= 10 }
  return { status: Object.values(gates).every(Boolean) ? "PASS" : "INCONCLUSIVE", gates,
    tokenSavingsPct, bootstrap, aaDriftPct, maxAbsAADriftPct, roundsChangePct,
    retriesChangePerTask, durationChangePct, latencyFlag: durationChangePct > 15,
    totals: { aTokens: sum(at), bTokens: sum(bt) },
    pairs: a.map((x, i) => ({ pair: i + 1, aTokens: x.tokens, bTokens: b[i].tokens,
      savingPct: savings(x.tokens, b[i].tokens), aDurationSec: x.totalDurationSec, bDurationSec: b[i].totalDurationSec })) }
}

function row(run, telemetry) {
  const m = metricsFor(run, telemetry)
  const id = `${run.label}/${run._run}`
  const issues = []
  if (run.fixture !== fixture || run.model !== "zai-coding-plan/glm-5.3" || run.agent !== "build" || run.filtering !== "on" || run.route !== "off" || run.escalate !== "off" || run.dryRun) issues.push("settings")
  if (run.timedOut || run.opencodeExitCode !== 0 || !run.sessionID) issues.push("process")
  if (!m.hasTelemetry || m.tokensInPlusCache === null || m.usageCoverage === "unavailable") issues.push("coding telemetry")
  if (![run.durationMs, run.verifyDurationMs, run.totalDurationMs].every(x => Number.isFinite(x) && x >= 0) || !Number.isInteger(run.verifyExitCode) || run.verifyTimedOut) issues.push("timing/verify process")
  const isB = run.label === labels.B
  if (run.context !== (isB ? "on" : "off")) issues.push("context setting")
  if (isB) {
    const capture = run.packetCapture
    if (capture?.status !== "captured" || !/^[a-f0-9]{64}$/.test(capture.sha256 ?? "")) issues.push("packet capture")
    else {
      const file = path.join(benchmarkRoot, "results", run.label, fixture, run._run, capture.artifact)
      try {
        const bytes = fs.readFileSync(file)
        if (bytes.length !== capture.bytes || createHash("sha256").update(bytes).digest("hex") !== capture.sha256 || !bytes.includes("src/profileAdapter.js")) issues.push("packet content/hash")
      } catch { issues.push("packet artifact") }
    }
    if (m.contextPackets < 1) issues.push("context telemetry")
  } else if (run.packetCapture?.status !== "context-off") issues.push("off-arm capture")
  if (m.premiumCalls !== 0 || m.escalations !== 0) issues.push("premium/escalation")
  return { id, sessionID: run.sessionID, valid: issues.length === 0, issues, verifyPass: run.verifyPass,
    tokens: m.tokensInPlusCache, rounds: m.modelRounds, retries: m.retriesFailed,
    totalDurationSec: m.totalDurationSec, sessionDurationSec: m.durationSec,
    verifyDurationSec: m.verifyDurationSec, usageCoverage: m.usageCoverage,
    titleTokens: m.titleTokensInPlusCache, packetCapture: run.packetCapture,
    contextPrepMs: m.contextPrepMs, contextPackets: m.contextPackets }
}

export function analyzeDisk({ firstPair = false, progress = false } = {}) {
  const runs = Object.fromEntries(Object.entries(labels).map(([arm, label]) => {
    let xs = []
    try { xs = loadRuns(label).sort((x, y) => x.run - y.run) }
    catch (error) { if (!progress && !(firstPair && arm === "AA")) throw error }
    return [arm, xs]
  }))
  const required = firstPair ? { A: 1, B: 1, AA: 0 } : expected
  for (const arm of Object.keys(required)) {
    if (progress ? runs[arm].length > required[arm] : runs[arm].length !== required[arm]) throw Error(`${arm}: expected ${progress ? "at most " : ""}${required[arm]} runs, found ${runs[arm].length}`)
    if (runs[arm].some((x, i) => x.run !== i + 1)) throw Error(`${arm}: noncontiguous run numbers`)
  }
  const all = Object.values(runs).flat()
  if (new Set(all.map(x => x.sessionID)).size !== all.length) throw Error("duplicate session IDs")
  const telemetry = loadRunTelemetry(all).bySession
  const rows = Object.fromEntries(Object.entries(runs).map(([arm, xs]) => [arm, xs.map(x => row(x, telemetry))]))
  if (firstPair || progress) return { valid: Object.values(rows).flat().every(x => x.valid && x.verifyPass), rows }
  return { labels, rows, verdict: verdict({ a: rows.A, b: rows.B, aa: rows.AA }),
    coverage: { coding: [...rows.A, ...rows.B, ...rows.AA].every(x => x.tokens !== null),
      allCall: "unavailable: installed host omits title-call usage" } }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = analyzeDisk({ firstPair: process.argv.includes("--first-pair"), progress: process.argv.includes("--progress") })
    console.log(JSON.stringify(result, null, 2))
    if (result.valid === false || result.verdict?.reason === "invalid mechanics") process.exitCode = 1
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
