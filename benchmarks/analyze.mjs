#!/usr/bin/env node
// A/A calibration and A/B comparison analyzer for token-efficient benchmarks.
//
// Usage:
//   node analyze.mjs <label>            aggregate one label
//   node analyze.mjs <labelA> <labelB>  compare two labels (flags within-noise deltas)
//
// Metrics are joined from run.json files (results/<label>/...) and the plugin
// telemetry event stream (~/.local/share/opencode/token-efficient/events/*.jsonl)
// keyed by sessionID.

import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { fileURLToPath, pathToFileURL } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RESULTS_DIR = path.join(__dirname, "results")
const TELEMETRY_DIR = path.join(os.homedir(), ".local/share/opencode/token-efficient", "events")

function loadRuns(label) {
  const dir = path.join(RESULTS_DIR, label)
  if (!fs.existsSync(dir)) throw new Error(`no results for label: ${label}`)
  const runs = []
  for (const fixture of fs.readdirSync(dir)) {
    const fdir = path.join(dir, fixture)
    if (!fs.statSync(fdir).isDirectory()) continue
    for (const run of fs.readdirSync(fdir).sort()) {
      const file = path.join(fdir, run, "run.json")
      if (fs.existsSync(file)) runs.push({ ...JSON.parse(fs.readFileSync(file, "utf8")), _fixture: fixture, _run: run })
    }
  }
  return runs
}

// Filtering metrics derive solely from `tool.filtered` / `tool.raw_recovered`
// telemetry events (Stage 2), never from task JSONs.
function loadTelemetry(dir = TELEMETRY_DIR, allowed = null) {
  const bySession = new Map()
  const filtering = { calls: 0, before: 0, after: 0, recoveries: 0, byReason: {} }
  if (!fs.existsSync(dir)) return { bySession, filtering }
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".jsonl")) continue
    const lines = fs.readFileSync(path.join(dir, file), "utf8").split("\n")
    for (const line of lines) {
      if (!line.trim()) continue
      let e
      try {
        e = JSON.parse(line)
      } catch {
        continue
      }
      if (!e.session) continue
      let m = bySession.get(e.session)
      if (!m) {
        m = {
          tokensIn: 0,
          tokensOut: 0,
          reasoning: 0,
          cacheRead: 0,
          cacheWrite: 0,
          cost: 0,
          llmCalls: 0,
          toolCalls: 0,
          toolCallsBy: {},
          filesRead: new Set(),
          filesEdited: new Set(),
          modelSwitches: 0,
          verifications: 0,
          verificationsFailed: 0,
          errors: 0,
          models: new Set(),
          filteredCalls: 0,
          filteredBytesBefore: 0,
          filteredBytesAfter: 0,
          recoveries: 0,
          filteredReasons: new Set(),
        }
        bySession.set(e.session, m)
      }
      const d = e.data ?? {}
      switch (e.type) {
        case "assistant.completed":
          m.tokensIn += d.tokens?.input ?? 0
          m.tokensOut += d.tokens?.output ?? 0
          m.reasoning += d.tokens?.reasoning ?? 0
          m.cacheRead += d.tokens?.cacheRead ?? 0
          m.cacheWrite += d.tokens?.cacheWrite ?? 0
          m.cost += d.cost ?? 0
          if (d.model) m.models.add(d.model)
          if (d.error) m.errors += 1
          break
        case "llm.call":
          m.llmCalls += 1
          break
        case "tool.call":
          m.toolCalls += 1
          m.toolCallsBy[d.tool] = (m.toolCallsBy[d.tool] ?? 0) + 1
          break
        case "file.read":
          m.filesRead.add(d.file)
          break
        case "file.edited":
          m.filesEdited.add(d.file)
          break
        case "model.switch":
          m.modelSwitches += 1
          break
        case "verification":
          m.verifications += 1
          if (d.verdict === "fail") m.verificationsFailed += 1
          break
        case "tool.filtered": {
          m.filteredCalls += 1
          m.filteredBytesBefore += d.bytesBefore ?? 0
          m.filteredBytesAfter += d.bytesAfter ?? 0
          if (d.reason) m.filteredReasons.add(d.reason)
          if (allowed && !allowed.has(e.session)) break
          filtering.calls += 1
          filtering.before += d.bytesBefore ?? 0
          filtering.after += d.bytesAfter ?? 0
          if (d.reason) {
            const r = filtering.byReason[d.reason] ?? (filtering.byReason[d.reason] = { calls: 0, before: 0, after: 0 })
            r.calls += 1
            r.before += d.bytesBefore ?? 0
            r.after += d.bytesAfter ?? 0
          }
          break
        }
        case "tool.raw_recovered":
          m.recoveries += 1
          if (!allowed || allowed.has(e.session)) filtering.recoveries += 1
          break
      }
    }
  }
  return { bySession, filtering }
}

function metricsFor(run, telemetry) {
  const t = run.sessionID ? telemetry.get(run.sessionID) : null
  return {
    verifyPass: run.verifyPass ? 1 : 0,
    durationSec: Math.round(run.durationMs / 100) / 10,
    tokensIn: t?.tokensIn ?? null,
    tokensInPlusCache: t ? t.tokensIn + t.cacheRead : null,
    tokensTotal: t ? t.tokensIn + t.cacheRead + t.tokensOut : null,
    tokensOut: t?.tokensOut ?? null,
    cacheRead: t?.cacheRead ?? null,
    cost: t ? Math.round(t.cost * 1e6) / 1e6 : null,
    llmCalls: t?.llmCalls ?? null,
    toolCalls: t?.toolCalls ?? null,
    filesRead: t ? t.filesRead.size : null,
    filesEdited: t ? t.filesEdited.size : null,
    modelSwitches: t?.modelSwitches ?? null,
    verifications: t?.verifications ?? null,
    errors: t?.errors ?? null,
    filteredCalls: t?.filteredCalls ?? null,
    filteredBytesBefore: t?.filteredBytesBefore ?? null,
    filteredBytesAfter: t?.filteredBytesAfter ?? null,
    filteredSavedBytes: t ? t.filteredBytesBefore - t.filteredBytesAfter : null,
    filteredRatio:
      t && t.filteredBytesBefore > 0 ? Math.round((t.filteredBytesAfter / t.filteredBytesBefore) * 1e4) / 1e4 : null,
    recoveries: t?.recoveries ?? null,
    hasTelemetry: Boolean(t),
  }
}

function stats(values) {
  const xs = values.filter((v) => v !== null && v !== undefined)
  if (xs.length === 0) return null
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length
  const variance = xs.length > 1 ? xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1) : 0
  const sd = Math.sqrt(variance)
  return { n: xs.length, mean, sd, cov: mean !== 0 ? sd / Math.abs(mean) : null }
}

function fmt(v) {
  if (v === null || v === undefined) return "-"
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(2)
  return String(v)
}

function aggregate(rows) {
  const agg = {}
  const keys = Object.keys(rows[0] ?? { verifyPass: 1 })
  for (const k of keys) {
    if (k === "hasTelemetry") continue
    const s = stats(rows.map((r) => r[k]))
    if (s) agg[k] = s
  }
  return agg
}

function report(label, rows, runs) {
  const keys = Object.keys(rows[0] ?? { verifyPass: 1 })
  console.log(`\n=== ${label} (${runs.length} runs) ===`)
  console.log(keys.join("\t"))
  for (const r of rows) console.log(keys.map((k) => fmt(r[k])).join("\t"))
  const agg = aggregate(rows)
  console.log("\nmetric\tmean\tsd\tCoV\tn")
  for (const [k, s] of Object.entries(agg)) {
    console.log(`${k}\t${fmt(Math.round(s.mean * 100) / 100)}\t${fmt(Math.round(s.sd * 100) / 100)}\t${s.cov === null ? "-" : fmt(Math.round(s.cov * 100) + "%")}\t${s.n}`)
  }
  const passRate = agg.verifyPass ? agg.verifyPass.mean : 0
  console.log(`\nverify pass rate: ${Math.round(passRate * 100)}%`)
  const missing = rows.filter((row) => !row.hasTelemetry).length
  if (missing > 0) console.log(`warning: ${missing} run(s) have no telemetry join (missing session or plugin inactive)`)
  return agg
}

function compare(labelA, aggA, labelB, aggB) {
  console.log(`\n=== A/A-NOISE CHECK: ${labelA} vs ${labelB} ===`)
  console.log("metric\tdelta%\twithin noise?")
  for (const k of Object.keys(aggA)) {
    const a = aggA[k]
    const b = aggB[k]
    if (!a || !b || a.mean === 0 || b.mean === 0) continue
    const delta = ((a.mean - b.mean) / ((a.mean + b.mean) / 2)) * 100
    const noise = Math.max(a.cov ?? 0, b.cov ?? 0) * 100
    const within = Math.abs(delta) <= Math.max(noise, 5)
    console.log(`${k}\t${delta.toFixed(1)}%\t${within ? "YES" : "NO"} (noise ~${noise.toFixed(1)}%)`)
  }
}

const KEY_METRICS = ["verifyPass", "llmCalls", "tokensIn", "tokensInPlusCache", "tokensTotal", "tokensOut", "durationSec", "filteredRatio", "filteredSavedBytes", "recoveries"]
const NOISY_FIXTURE = "05-noisy-test-log"

function groupByFixture(runs, rows) {
  const groups = new Map()
  for (let i = 0; i < runs.length; i++) {
    const f = runs[i]._fixture
    if (!groups.has(f)) groups.set(f, [])
    groups.get(f).push(rows[i])
  }
  return groups
}

function meanOf(rows, key) {
  const s = stats(rows.map((r) => r[key]))
  return s ? s.mean : null
}

function comparePerFixture(labelA, groupsA, labelB, groupsB) {
  console.log(`\n=== PER-FIXTURE COMPARISON: ${labelA} vs ${labelB} ===`)
  for (const f of [...new Set([...groupsA.keys(), ...groupsB.keys()])]) {
    const a = groupsA.get(f) ?? []
    const b = groupsB.get(f) ?? []
    console.log(`\n--- ${f} (A n=${a.length}, B n=${b.length}) ---`)
    console.log("metric\tmeanA\tmeanB\tdelta%")
    for (const k of KEY_METRICS) {
      const ma = meanOf(a, k)
      const mb = meanOf(b, k)
      let delta = null
      if (ma !== null && mb !== null && ma + mb !== 0) delta = ((ma - mb) / ((ma + mb) / 2)) * 100
      console.log(`${k}\t${fmt(ma === null ? null : Math.round(ma * 100) / 100)}\t${fmt(mb === null ? null : Math.round(mb * 100) / 100)}\t${delta === null ? "-" : delta.toFixed(1) + "%"}`)
    }
  }
}

function stage2Gate(labelA, labelB, groupsA, groupsB, filtering) {
  console.log(`\n=== STAGE 2 GATE NUMBERS (${labelA} vs ${labelB}; human judgment, no auto verdict) ===`)
  const reduction = filtering.before > 0 ? ((filtering.before - filtering.after) / filtering.before) * 100 : null
  console.log(
    `targeted byte reduction (all tool.filtered events): ${reduction === null ? "n/a (no filtered events)" : reduction.toFixed(1) + "%"} (${filtering.before} -> ${filtering.after} bytes over ${filtering.calls} call(s))`,
  )
  console.log(`recovery calls (tool.raw_recovered): ${filtering.recoveries}`)
  const a = groupsA.get(NOISY_FIXTURE) ?? []
  const b = groupsB.get(NOISY_FIXTURE) ?? []
  for (const key of ["llmCalls", "tokensIn", "tokensInPlusCache"]) {
    const ta = meanOf(a, key)
    const tb = meanOf(b, key)
    const delta = ta !== null && tb !== null && ta !== 0 ? ((tb - ta) / ta) * 100 : null
    console.log(
      `noisy fixture (${NOISY_FIXTURE}) mean ${key}: A=${fmt(ta === null ? null : Math.round(ta))} B=${fmt(tb === null ? null : Math.round(tb))} delta=${delta === null ? "n/a" : delta.toFixed(1) + "%"}`,
    )
  }
  const passRate = (rows) => (rows.length ? rows.filter((r) => r.verifyPass).length / rows.length : null)
  console.log(
    `verify pass rate: ${labelA} ${passRate(a) === null ? "n/a" : Math.round(passRate(a) * 100) + "%"} vs ${labelB} ${passRate(b) === null ? "n/a" : Math.round(passRate(b) * 100) + "%"} (noisy fixture)`,
  )
}

function writeAnalysis(labelA, labelB, groupsA, groupsB, aggA, aggB, filtering) {
  const perFixture = {}
  const fixtures = new Set(groupsA.keys())
  if (groupsB) for (const f of groupsB.keys()) fixtures.add(f)
  for (const f of fixtures) {
    const entry = { A: aggregate(groupsA.get(f) ?? []) }
    if (labelB) entry.B = aggregate(groupsB.get(f) ?? [])
    perFixture[f] = entry
  }
  const targetedByteReductionPct =
    filtering.before > 0 ? Math.round(((filtering.before - filtering.after) / filtering.before) * 1e4) / 100 : null
  const payload = {
    generatedAt: new Date().toISOString(),
    labelA,
    labelB: labelB ?? null,
    perFixture,
    overall: labelB ? { A: aggA, B: aggB } : { A: aggA },
    filtering: {
      targetedByteReductionPct,
      recoveryCalls: filtering.recoveries,
      byReason: filtering.byReason,
    },
  }
  fs.writeFileSync(
    path.join(RESULTS_DIR, `analysis-${labelA}${labelB ? `-vs-${labelB}` : ""}.json`),
    JSON.stringify(payload, null, 2),
  )
}

// Stage 3: 2x2 factorial analysis — `node analyze.mjs <base> <filt> <disc> <both>`.
// Arms: base = filtering off + discipline off; filt = filtering on; disc = discipline on;
// both = both on. Main effects and interaction per metric; per-lever gate summary.
export function factorialAnalysis([base, filt, disc, both]) {
  const FACT_METRICS = ["verifyPass", "tokensOut", "tokensIn", "tokensInPlusCache", "tokensTotal", "llmCalls", "durationSec"]
  const arms = {}
  for (const label of [base, filt, disc, both]) {
    const runs = loadRuns(label)
    if (!runs.length) fail(`no runs found for label ${label}`)
    const { bySession: telemetry } = loadRunTelemetry(runs)
    arms[label] = { runs, rows: runs.map((r) => metricsFor(r, telemetry)) }
  }
  const meanOf = (rows, key) => {
    const vals = rows.map((r) => r[key]).filter((v) => typeof v === "number")
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
  }
  console.log(`\n=== 2x2 FACTORIAL: ${base} / ${filt} / ${disc} / ${both} ===`)
  console.log("metric\tbase\tfilt\tdisc\tboth\tdiscipline%\tfiltering%\tinteraction%")
  const effects = {}
  for (const k of FACT_METRICS) {
    const m = {
      base: meanOf(arms[base].rows, k),
      filt: meanOf(arms[filt].rows, k),
      disc: meanOf(arms[disc].rows, k),
      both: meanOf(arms[both].rows, k),
    }
    const pct = (a, b) => (a !== null && b !== null && b !== 0 ? ((a - b) / b) * 100 : null)
    const discEffect = pct(m.disc, m.base) !== null || pct(m.both, m.filt) !== null
      ? ((m.disc ?? 0) - (m.base ?? 0) + ((m.both ?? 0) - (m.filt ?? 0))) / 2
      : null
    const filtEffect = pct(m.filt, m.base) !== null || pct(m.both, m.disc) !== null
      ? ((m.filt ?? 0) - (m.base ?? 0) + ((m.both ?? 0) - (m.disc ?? 0))) / 2
      : null
    const interaction =
      m.base !== null && m.filt !== null && m.disc !== null && m.both !== null
        ? m.both - m.filt - m.disc + m.base
        : null
    effects[k] = { ...m, discEffect, filtEffect, interaction }
    const r2 = (v) => (v === null ? "-" : (Math.round(v * 100) / 100).toString())
    const ref = m.base !== null && m.base !== 0 ? m.base : m.filt
    const fmtPct = (v) => (v === null || !ref ? "-" : ((v / ref) * 100).toFixed(1) + "%")
    console.log(
      [k, r2(m.base), r2(m.filt), r2(m.disc), r2(m.both), fmtPct(discEffect), fmtPct(filtEffect), r2(interaction)].join("\t"),
    )
  }
  const e = effects
  const toOut = e.tokensOut
  const discPct = toOut.base ? ((toOut.discEffect ?? 0) / toOut.base) * 100 : null
  const calls = e.llmCalls
  console.log(`\n=== STAGE 3 GATE SUMMARY (per-lever; human judgment, no auto verdict) ===`)
  console.log(`discipline hypothesis gate: tokensOut main effect ${discPct === null ? "n/a" : discPct.toFixed(1) + "%"} (gate: >=25% reduction)`)
  console.log(`economic metric: tokensTotal base=${Math.round(e.tokensTotal.base ?? 0)} disc=${Math.round(e.tokensTotal.disc ?? 0)} both=${Math.round(e.tokensTotal.both ?? 0)} (report; must not regress for a discipline PASS)`)
  console.log(`llmCalls: base=${e.llmCalls.base} disc=${e.llmCalls.disc} both=${e.llmCalls.both} (no systematic increase)`)
  console.log(`interaction (tokensTotal): ${e.tokensTotal.interaction === null ? "n/a" : Math.round(e.tokensTotal.interaction)} (negative = levers compound)`)
  const payload = {
    generatedAt: new Date().toISOString(),
    design: "2x2",
    arms: { base, filt, disc, both },
    effects,
    perFixture: {},
  }
  for (const label of [base, filt, disc, both]) {
    const groups = groupByFixture(arms[label].runs, arms[label].rows)
    payload.perFixture[label] = {}
    for (const [fixture, rows] of groups) {
      payload.perFixture[label][fixture] = Object.fromEntries(
        FACT_METRICS.map((k) => [k, meanOf(rows, k)]),
      )
    }
  }
  fs.writeFileSync(path.join(RESULTS_DIR, `analysis-${base}-factorial.json`), JSON.stringify(payload, null, 2))
  console.log(`\nwrote results/analysis-${base}-factorial.json`)
}

function main() {
  const labels = process.argv.slice(2)
  if (labels.length === 4) {
    factorialAnalysis(labels)
    return
  }
  const [labelA, labelB] = labels
  if (!labelA) {
    console.error("usage: node analyze.mjs <label> [labelB]")
    process.exit(1)
  }
  const runsA = loadRuns(labelA)
  const runsB = labelB ? loadRuns(labelB) : []
  const allowed = new Set([...runsA, ...runsB].map((r) => r.sessionID).filter(Boolean))
  const { bySession: telemetry, filtering } = loadRunTelemetry([...runsA, ...runsB])
  const rowsA = runsA.map((r) => metricsFor(r, telemetry))
  const aggA = report(labelA, rowsA, runsA)
  const groupsA = groupByFixture(runsA, rowsA)

  let aggB = null
  let groupsB = null
  if (labelB) {
    const rowsB = runsB.map((r) => metricsFor(r, telemetry))
    aggB = report(labelB, rowsB, runsB)
    groupsB = groupByFixture(runsB, rowsB)
    compare(labelA, aggA, labelB, aggB)
    comparePerFixture(labelA, groupsA, labelB, groupsB)
    stage2Gate(labelA, labelB, groupsA, groupsB, filtering)
  }

  writeAnalysis(labelA, labelB, groupsA, groupsB, aggA, aggB, filtering)
}

export function loadRunTelemetry(runs) {
  const roots = new Map()
  for (const run of runs) {
    const dir = run.telemetryDir ? path.join(run.telemetryDir, "events") : TELEMETRY_DIR
    if (!roots.has(dir)) roots.set(dir, new Set())
    if (run.sessionID) roots.get(dir).add(run.sessionID)
  }
  const bySession = new Map()
  const filtering = { calls: 0, before: 0, after: 0, recoveries: 0, byReason: {} }
  for (const [dir, allowed] of roots) {
    const result = loadTelemetry(dir, allowed)
    for (const [id, row] of result.bySession) if (allowed.has(id)) {
      if (bySession.has(id)) throw new Error(`Session ${id} appears in multiple telemetry roots`)
      bySession.set(id, row)
    }
    for (const k of ["calls", "before", "after", "recoveries"]) filtering[k] += result.filtering[k]
    for (const [key, value] of Object.entries(result.filtering.byReason)) {
      const prev = filtering.byReason[key] ?? { calls: 0, before: 0, after: 0 }
      for (const metric of Object.keys(value)) prev[metric] = (prev[metric] ?? 0) + value[metric]
      filtering.byReason[key] = prev
    }
  }
  return { bySession, filtering }
}

// Run only when executed directly, so tests can import the functions above.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()

export { loadRuns, loadTelemetry, metricsFor, comparePerFixture, stage2Gate, writeAnalysis }

