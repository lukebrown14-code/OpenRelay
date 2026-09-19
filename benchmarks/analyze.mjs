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
import { fileURLToPath } from "node:url"

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

function loadTelemetry() {
  const bySession = new Map()
  if (!fs.existsSync(TELEMETRY_DIR)) return bySession
  for (const file of fs.readdirSync(TELEMETRY_DIR)) {
    if (!file.endsWith(".jsonl")) continue
    const lines = fs.readFileSync(path.join(TELEMETRY_DIR, file), "utf8").split("\n")
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
      }
    }
  }
  return bySession
}

function metricsFor(run, telemetry) {
  const t = run.sessionID ? telemetry.get(run.sessionID) : null
  return {
    verifyPass: run.verifyPass ? 1 : 0,
    durationSec: Math.round(run.durationMs / 100) / 10,
    tokensIn: t?.tokensIn ?? null,
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

function report(label, rows, runs) {
  const keys = Object.keys(rows[0] ?? { verifyPass: 1 })
  console.log(`\n=== ${label} (${runs.length} runs) ===`)
  console.log(keys.join("\t"))
  for (const r of rows) console.log(keys.map((k) => fmt(r[k])).join("\t"))
  const agg = {}
  for (const k of keys) {
    if (k === "hasTelemetry") continue
    const s = stats(rows.map((r) => r[k]))
    if (s) agg[k] = s
  }
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

function main() {
  const [labelA, labelB] = process.argv.slice(2)
  if (!labelA) {
    console.error("usage: node analyze.mjs <label> [labelB]")
    process.exit(1)
  }
  const telemetry = loadTelemetry()
  const runsA = loadRuns(labelA)
  const rowsA = runsA.map((r) => metricsFor(r, telemetry))
  const aggA = report(labelA, rowsA, runsA)

  if (labelB) {
    const runsB = loadRuns(labelB)
    const rowsB = runsB.map((r) => metricsFor(r, telemetry))
    const aggB = report(labelB, rowsB, runsB)
    compare(labelA, aggA, labelB, aggB)
  }

  fs.writeFileSync(
    path.join(RESULTS_DIR, `analysis-${labelA}${labelB ? `-vs-${labelB}` : ""}.json`),
    JSON.stringify({ generatedAt: new Date().toISOString(), labelA, labelB: labelB ?? null }, null, 2),
  )
}

main()
