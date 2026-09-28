#!/usr/bin/env node
import { benchmarkRoot, repositoryRoot } from "../../lib/paths.mjs"
// Read-only receiver pilot analysis. A/A controls are separate from the main baseline.
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const fixtures = ["22-plan-config-compat", "23-failed-pipeline-diag", "24-memory-search-followup", "25-control-explicit-edit", "26-control-named-module"]
const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length
const median = xs => { const s = [...xs].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2 }
const change = (a, b) => a > 0 && b !== null ? 100 * (b / a - 1) : null
const fmt = (n, digits = 1) => n === null ? "unavailable" : n.toFixed(digits)

export function loadRuns(root) {
  const out = []
  for (const label of ["stage6e", "stage6e-aa"]) {
    const dir = path.join(root, label)
    if (!fs.existsSync(dir)) continue
    for (const cell of fs.readdirSync(dir).sort()) {
      const cellDir = path.join(dir, cell)
      if (!fs.statSync(cellDir).isDirectory()) continue
      for (const rep of fs.readdirSync(cellDir).sort()) {
        if (rep.includes("crashed") || rep.includes("contaminated")) continue
        const file = path.join(cellDir, rep, "run.json")
        if (fs.existsSync(file)) out.push({ ...JSON.parse(fs.readFileSync(file, "utf8")), label })
      }
    }
  }
  return out
}

export function loadTelemetry(root) {
  const out = new Map()
  for (const label of ["stage6e", "stage6e-aa"]) {
    const dir = path.join(root, label, "events")
    if (!fs.existsSync(dir)) continue
    for (const file of fs.readdirSync(dir).sort()) {
      const p = path.join(dir, file)
      if (!fs.statSync(p).isFile()) continue
      for (const line of fs.readFileSync(p, "utf8").split("\n")) {
        if (!line.trim()) continue
        let e
        try { e = JSON.parse(line) } catch { continue }
        if (!e.session) continue
        const key = `${label}|${e.session}`
        if (!out.has(key)) out.set(key, { completions: new Map(), duplicate: false, calls: 0, packetBytes: 0, memoryNotes: 0 })
        const s = out.get(key)
        if (e.type === "llm.call" && e.data?.agent === "build") s.calls++
        if (e.type === "context.packet_built") s.packetBytes += e.data?.bytes ?? 0
        if (e.type === "memory.selected") s.memoryNotes += e.data?.notes?.length ?? 0
        if (e.type === "assistant.completed" && e.data?.agent === "build") {
          const id = e.data.messageID
          if (!id || s.completions.has(id)) s.duplicate = true
          else s.completions.set(id, e.data)
        }
      }
    }
  }
  return out
}

export function analyze(runs, telemetry) {
  const rows = runs.map(run => {
    const s = telemetry.get(`${run.label}|${run.sessionID}`)
    const completions = [...(s?.completions.values() ?? [])]
    const usageComplete = Boolean(s && !s.duplicate && completions.length && s.calls === completions.length && completions.every(c => c.usageAvailable !== false && Number.isFinite(c.tokens?.input) && Number.isFinite(c.tokens?.cacheRead)))
    return { fixture: run.fixture, arm: run.arm, rep: run.rep, label: run.label,
      pass: run.verifyPass && run.opencodeExitCode === 0,
      tokens: usageComplete ? completions.reduce((n, c) => n + c.tokens.input + c.tokens.cacheRead, 0) : null,
      seconds: Number.isFinite(run.durationMs) ? run.durationMs / 1000 : null,
      packetBytes: s?.packetBytes ?? 0, memoryNotes: s?.memoryNotes ?? 0, usageComplete }
  })
  const cell = (fixture, arm, label = "stage6e") => rows.filter(r => r.fixture === fixture && r.arm === arm && r.label === label)
  const stats = rs => ({ n: rs.length, pass: rs.filter(r => r.pass).length,
    tokens: rs.length && rs.every(r => r.usageComplete) ? mean(rs.map(r => r.tokens)) : null,
    medianSec: rs.length && rs.every(r => r.seconds !== null) ? median(rs.map(r => r.seconds)) : null,
    packetBytes: rs.reduce((n, r) => n + r.packetBytes, 0), memoryNotes: rs.reduce((n, r) => n + r.memoryNotes, 0) })
  const comparisons = []
  for (const fixture of fixtures) for (const [base, treatment] of [["A", "B"], ["A", "C"], ["B", "D"], ["A", "D"]]) {
    const a = stats(cell(fixture, base)), b = stats(cell(fixture, treatment))
    if (a.n && b.n) comparisons.push({ fixture, comparison: `${treatment}/${base}`, a, b,
      tokenChange: change(a.tokens, b.tokens), timeChange: change(a.medianSec, b.medianSec) })
  }
  const handoffs = fixtures.slice(0, 3).map(f => comparisons.find(c => c.fixture === f && c.comparison === "B/A"))
  const complete = handoffs.every(c => c && c.a.tokens !== null && c.b.tokens !== null)
  const handoffChange = complete ? change(handoffs.reduce((n, c) => n + c.a.tokens, 0), handoffs.reduce((n, c) => n + c.b.tokens, 0)) : null
  const extraPerTask = complete ? mean(handoffs.map(c => c.b.tokens - c.a.tokens)) : null
  return { rows, cell, stats, comparisons, handoffChange, extraPerTask }
}

function report(a) {
  console.log("Stage 6E: recorded build input+cacheRead; receiver CLI time excludes verifier execution")
  console.log("fixture\tarm\tlabel\tn\tpass\tmeanTokens\tmedianSec\tpacketBytes\tmemoryNotes")
  for (const fixture of fixtures) for (const arm of ["A", "B", "C", "D"]) for (const label of ["stage6e", "stage6e-aa"]) {
    const s = a.stats(a.cell(fixture, arm, label))
    if (s.n) console.log(`${fixture}\t${arm}\t${label}\t${s.n}\t${s.pass}/${s.n}\t${fmt(s.tokens, 0)}\t${fmt(s.medianSec)}\t${s.packetBytes}\t${s.memoryNotes}`)
  }
  console.log("\ncomparison\tfixture\tnBase/nTreatment\ttokenChange%\tmedianTimeChange%")
  for (const c of a.comparisons) console.log(`${c.comparison}\t${c.fixture}\t${c.a.n}/${c.b.n}\t${fmt(c.tokenChange)}\t${fmt(c.timeChange)}`)
  console.log("\nA/A controls, excluded from A means")
  for (const fixture of fixtures.slice(0, 2)) {
    const aMain = a.stats(a.cell(fixture, "A")), aa = a.stats(a.cell(fixture, "A", "stage6e-aa"))
    console.log(`${fixture}: main A=${fmt(aMain.tokens, 0)} (${aMain.n}), A/A=${fmt(aa.tokens, 0)} (${aa.n}), change=${fmt(change(aMain.tokens, aa.tokens))}%`)
  }
  console.log(`\nThree main fixtures, equal fixture weight: handoff ${fmt(a.handoffChange)}%; ${fmt(a.extraPerTask, 0)} extra tokens/task`)
  console.log(`Runs: ${a.rows.length}; verifier PASS: ${a.rows.filter(r => r.pass).length}; complete coding usage: ${a.rows.filter(r => r.usageComplete).length}`)
  console.log("No bootstrap interval: sparse and unequal cells are screening observations, not paired confirmation.")
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const results = process.env.STAGE6_RESULTS_ROOT ?? path.join(benchmarkRoot, "results")
  const telemetry = process.env.STAGE6_TELEMETRY_ROOT ?? path.join(process.env.HOME, ".local/share/openrelay/data/benchmarks")
  const a = analyze(loadRuns(results), loadTelemetry(telemetry))
  report(a)
  if (!a.rows.length || a.rows.some(r => !r.usageComplete)) process.exitCode = 1
}
