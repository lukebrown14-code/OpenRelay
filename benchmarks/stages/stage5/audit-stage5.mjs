#!/usr/bin/env node
import { benchmarkRoot, repositoryRoot } from "../../lib/paths.mjs"
// Read-only audit of the frozen 36-run v3 baseline. JSON goes to stdout; no model calls.
import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { fileURLToPath, pathToFileURL } from "node:url"
import { loadRuns, loadRunTelemetry, metricsFor, summarizeStage5, baselineChangePct } from "../../analyze.mjs"

const root = benchmarkRoot
const labels = ["stage5-v3-a", "stage5-v3-b", "stage5-v3-aa"]
const tokenKeys = ["input", "output", "reasoning", "cacheRead", "cacheWrite"]
const sha256 = text => crypto.createHash("sha256").update(text).digest("hex")
const sum = values => values.reduce((a, b) => a + b, 0)
const duplicateCount = values => values.length - new Set(values).size

function jsonl(file) {
  const text = fs.readFileSync(file, "utf8")
  return { sha256: sha256(text), events: text.split("\n").filter(line => line.trim()).map(line => JSON.parse(line)) }
}

function stepTokens(step) {
  const t = step.part?.tokens
  return { input: t?.input, output: t?.output, reasoning: t?.reasoning,
    cacheRead: t?.cache?.read, cacheWrite: t?.cache?.write }
}

// Completions have no message IDs in this telemetry version. Match the full token
// vectors with multiplicity, and check repeated raw events/step IDs independently.
export function reconcileTokens(completions, steps) {
  const a = completions.map(e => e.data?.tokens)
  const b = steps.map(stepTokens)
  const valid = rows => rows.length > 0 && rows.every(t => tokenKeys.every(k => Number.isFinite(t?.[k]) && t[k] >= 0))
  const signature = t => JSON.stringify(tokenKeys.map(k => t[k]))
  const totals = rows => valid(rows) ? Object.fromEntries(tokenKeys.map(k => [k, sum(rows.map(t => t[k]))])) : null
  const duplicates = {
    telemetryEvents: duplicateCount(completions.map(e => JSON.stringify(e))),
    outputSteps: duplicateCount(steps.map(e => e.part?.id ?? JSON.stringify(e))),
  }
  const equal = valid(a) && valid(b) && JSON.stringify(a.map(signature).sort()) === JSON.stringify(b.map(signature).sort())
  return { matched: equal && !duplicates.telemetryEvents && !duplicates.outputSteps,
    duplicates, completionCount: a.length, stepCount: b.length, telemetry: totals(a), output: totals(b) }
}

// Union, not sum: tools in the same round can overlap.
export function intervalUnionMs(intervals) {
  const sorted = intervals.filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b >= a).sort((a, b) => a[0] - b[0])
  let total = 0, end = -Infinity
  for (const [a, b] of sorted) {
    total += Math.max(0, b - Math.max(a, end))
    end = Math.max(end, b)
  }
  return total
}

export function auditStage5() {
  const runs = labels.flatMap(loadRuns).sort((a, b) => a.label.localeCompare(b.label) || a.fixture.localeCompare(b.fixture) || a.run - b.run)
  const { bySession } = loadRunTelemetry(runs)
  const roots = new Map()
  for (const dir of [...new Set(runs.map(r => r.telemetryDir))]) {
    const files = fs.readdirSync(path.join(dir, "events")).filter(f => f.endsWith(".jsonl")).sort()
    roots.set(dir, files.map(f => ({ file: f, ...jsonl(path.join(dir, "events", f)) })))
  }
  const errors = []
  const rows = runs.map(run => {
    const dir = path.join(benchmarkRoot, "results", run.label, run._fixture, run._run)
    const files = roots.get(run.telemetryDir)
    const events = files.flatMap(f => f.events).filter(e => e.session === run.sessionID)
    const output = jsonl(path.join(dir, "opencode-output.jsonl"))
    const ownOutput = output.events.filter(e => e.sessionID === run.sessionID)
    const completions = events.filter(e => e.type === "assistant.completed")
    const steps = ownOutput.filter(e => e.type === "step_finish")
    const calls = events.filter(e => e.type === "llm.call")
    const reconciliation = reconcileTokens(completions, steps)
    const tools = ownOutput.filter(e => e.type === "tool_use")
    const verifications = tools.filter(e => /\b(?:node|bun)\s+verify\.js\b/.test(e.part?.state?.input?.command ?? ""))
    const issues = []
    if (!run.sessionID || !events.length) issues.push("missing session telemetry")
    if (!reconciliation.matched) issues.push("token reconciliation unavailable or ambiguous")
    if (output.events.length !== ownOutput.length) issues.push("output contains events for another/missing session")
    const expectedContext = run.label === "stage5-v3-b" ? "on" : "off"
    for (const [key, value] of Object.entries({ context: expectedContext, filtering: "on", route: "off", escalate: "off", agent: "build", model: "zai-coding-plan/glm-5.3", dryRun: false })) {
      if (run[key] !== value) issues.push(`unexpected ${key}: ${run[key]}`)
    }
    const builds = [...new Set(events.map(e => e.runtime?.buildID))].sort()
    if (builds.length !== 1 || builds[0] !== "dev-e70596dac97b") issues.push("build differs from frozen baseline")
    const buildCalls = calls.filter(e => !e.data.small)
    if (buildCalls.length !== steps.length) issues.push("coding call/step coverage mismatch")
    const unmeteredSmallCalls = calls.filter(e => e.data.small).length - completions.filter(e => ["title", "summary", "compaction"].includes(e.data.agent)).length
    const packets = events.filter(e => e.type === "context.packet_built")
    const decisions = events.filter(e => e.type === "context.decision").map(e => e.data)
    const n = parseInt(run.fixture, 10)
    const expectedBuild = (n >= 6 && n <= 9) || n === 19 || n === 21
    const expectedReason = expectedBuild ? "new-candidates" : n === 10 ? "git-intent" : "explicit-single-target"
    const selectorMatched = expectedContext === "off" ? !packets.length && !decisions.length
      : decisions.length === 1 && decisions[0].verdict === (expectedBuild ? "build" : "skip")
        && decisions[0].reason === expectedReason && packets.length === Number(expectedBuild)
    if (!selectorMatched) issues.push("unexpected selector decision")
    if (run.timedOut || run.opencodeExitCode !== 0 || typeof run.verifyPass !== "boolean") issues.push("incomplete execution/verification record")
    if (!Number.isFinite(run.durationMs) || run.durationMs < 0) issues.push("missing duration")
    const failedVerifyTools = verifications.filter(e => e.part.state.status === "error" || (Number.isFinite(e.part.state.metadata?.exit) && e.part.state.metadata.exit !== 0)).length
    const unknownVerifyTools = verifications.filter(e => e.part.state.status !== "error" && !Number.isFinite(e.part.state.metadata?.exit)).length
    if (!verifications.length || unknownVerifyTools) issues.push("verification tool coverage incomplete")
    const metrics = metricsFor(run, bySession)
    // Frozen audit schema v1: newer coverage/timing metrics belong to future runs.
    for (const key of ["smallTokensInPlusCache", "titleTokensInPlusCache", "allCallsInPlusCache",
      "usageCoverage", "smallUsageCoverage", "verifyDurationSec", "totalDurationSec"]) delete metrics[key]
    const oldTelemetry = bySession.get(run.sessionID)
    metrics.cost = oldTelemetry ? Math.round(oldTelemetry.cost * 1e6) / 1e6 : null
    metrics.durationSec = Number.isFinite(run.durationMs) ? run.durationMs / 1000 : null
    // Raw tool exits independently check the retry counter (which emitted no events here).
    if (metrics.retriesFailed !== failedVerifyTools) issues.push("failed verification count differs from raw tools")
    if (!reconciliation.matched) {
      for (const key of ["tokensIn", "tokensInPlusCache", "tokensOut", "tokensTotal", "cacheRead"]) metrics[key] = null
    }
    const start = Date.parse(run.startedAt), end = Date.parse(run.endedAt)
    const intervals = tools.map(e => [Math.max(start, e.part.state.time?.start), Math.min(end, e.part.state.time?.end)])
    const toolWallMs = intervalUnionMs(intervals)
    const packetFiles = [...new Set(packets.flatMap(e => e.data.files))]
    const gtPath = path.join(benchmarkRoot, "fixtures", run.fixture, "ground-truth.json")
    const required = fs.existsSync(gtPath) ? JSON.parse(fs.readFileSync(gtPath, "utf8")).required : []
    const verifySha256 = sha256(fs.readFileSync(path.join(dir, "workspace", "verify.js")))
    const verifyMatchesFixture = verifySha256 === sha256(fs.readFileSync(path.join(benchmarkRoot, "fixtures", run.fixture, "verify.js")))
    if (!verifyMatchesFixture) issues.push("saved verification script differs from current fixture")
    return {
      label: run.label, fixture: run.fixture, run: run.run, sessionID: run.sessionID,
      source: path.relative(path.dirname(root), dir), telemetryDir: run.telemetryDir,
      runSha256: sha256(fs.readFileSync(path.join(dir, "run.json"))), outputSha256: output.sha256,
      telemetrySources: files.filter(f => f.events.some(e => e.session === run.sessionID)).map(f => ({ file: f.file, sha256: f.sha256 })),
      builds, settings: { model: run.model, filtering: run.filtering, route: run.route, escalate: run.escalate, context: run.context, agent: run.agent },
      metrics, reconciliation, issues, unmeteredSmallCalls,
      smallAgents: calls.filter(e => e.data.small).map(e => e.data.agent),
      recordedPremiumCalls: calls.filter(e => e.data.tier === "premium").length,
      verificationTools: verifications.length, failedVerifyTools, unknownVerifyTools, verifySha256, verifyMatchesFixture,
      selectorMatched, decisions, packets: packets.map(e => e.data),
      requiredFiles: required, retrievedRequired: required.filter(f => packetFiles.includes(f)),
      toolWallMs, outsideToolMs: run.durationMs - toolWallMs,
    }
  })
  if (duplicateCount(rows.map(r => r.sessionID))) errors.push("duplicate run session IDs")
  const expected = { "02": 1, "04": 1, "06": 3, "07": 3, "08": 3, "09": 3, "10": 1, "19": 1, "21": 1 }
  for (const label of labels) {
    const manifest = label.endsWith("-aa") ? { "06": 1, "09": 1 } : expected
    for (const [fixture, count] of Object.entries(manifest)) {
      const selected = rows.filter(r => r.label === label && r.fixture.startsWith(fixture + "-"))
      if (JSON.stringify(selected.map(r => r.run).sort()) !== JSON.stringify(Array.from({ length: count }, (_, i) => i + 1))) errors.push(`${label}/${fixture}: unexpected run set`)
    }
    if (rows.filter(r => r.label === label).length !== sum(Object.values(manifest))) errors.push(`${label}: unexpected run count`)
  }
  for (const row of rows) for (const issue of row.issues) errors.push(`${row.label}/${row.fixture}/${row.run}: ${issue}`)
  const group = label => {
    const groups = new Map()
    for (const r of rows.filter(r => r.label === label)) groups.set(r.fixture, [...(groups.get(r.fixture) ?? []), r.metrics])
    return groups
  }
  const a = group(labels[0]), b = group(labels[1])
  const fixtures = [...new Set([...a.keys(), ...b.keys()])].sort()
  const comparisons = Object.fromEntries(fixtures.map(f => [f, summarizeStage5(a, b, [f])]))
  const ui = fixtures.filter(f => /^0[6-9]-/.test(f))
  const aa = rows.filter(r => r.label === labels[2]).map(r => {
    const values = a.get(r.fixture).map(m => m.tokensInPlusCache)
    const baselineMean = values.every(Number.isFinite) ? sum(values) / values.length : null
    return { fixture: r.fixture, baselineN: values.length, baselineValues: values,
      baselineMean, extraRun: r.metrics.tokensInPlusCache,
      changePct: baselineChangePct(baselineMean, r.metrics.tokensInPlusCache),
      note: "One extra off run versus three-run off mean; descriptive observation, not a noise bound." }
  })
  return {
    schemaVersion: 1, labels, errors,
    limitations: [
      "One title llm.call per run has no assistant.completed/step_finish token record; totals cover recorded coding completions, not all requested inference.",
      "durationMs covers the OpenCode subprocess including packet prep and in-session verification; excludes the independent post-run harness verification.",
      "Telemetry stores packet file lists/bytes/decisions, not original packet text; missing exact content cannot be recovered from these artifacts.",
      "Completion telemetry lacks message IDs; duplicate checks use exact events and output step IDs plus full token-vector multiset reconciliation.",
    ],
    summary: { runs: rows.length, verified: rows.filter(r => r.metrics.verifyPass === 1).length,
      reconciled: rows.filter(r => r.reconciliation.matched).length,
      unmeteredSmallCalls: sum(rows.map(r => r.unmeteredSmallCalls)),
      codingCompletions: sum(rows.map(r => r.reconciliation.completionCount)),
      failedVerifyTools: sum(rows.map(r => r.failedVerifyTools)),
      recordedPremiumCalls: sum(rows.map(r => r.recordedPremiumCalls)),
      bSelectorMatches: rows.filter(r => r.label === labels[1] && r.selectorMatched).length },
    rows, comparisons, ui: summarizeStage5(a, b, ui), observedAggregate: summarizeStage5(a, b, fixtures), aa,
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const audit = auditStage5()
    console.log(JSON.stringify(audit, null, 2))
    if (audit.errors.length) process.exitCode = 1
  } catch (error) {
    console.error(`Audit unavailable: ${error.message}`)
    process.exitCode = 1
  }
}
