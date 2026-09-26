#!/usr/bin/env node
import { benchmarkRoot, repositoryRoot } from "../../lib/paths.mjs"
// Read-only discovery audit of saved Stage 5 and Stage 7 model traces.
import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const results = path.join(benchmarkRoot, "results")
const root = repositoryRoot
const v3Audit = JSON.parse(fs.readFileSync(path.join(repositoryRoot, "docs/stage5/v3-audit-data.json"), "utf8"))
const auditedRuns = new Map(v3Audit.rows.map(row => [`${row.label}:${row.sessionID}`, row]))
const stage8Tasks = new Map(JSON.parse(fs.readFileSync(path.join(here, "tasks/tasks.json"), "utf8")).tasks.map(t => [t.id, t]))
const sha256 = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")
const cohorts = [
  { label: "stage5-v3-a", arm: "native", pattern: "*/*/run.json" },
  { label: "stage5-v3-b", arm: "v3", pattern: "*/*/run.json" },
  { label: "stage5-21-confirm-r2-a", arm: "native", pattern: "*/*/run.json" },
  { label: "stage5-21-confirm-r2-b", arm: "v3", pattern: "*/*/run.json" },
]

function runFiles(label) {
  const dir = path.join(results, label)
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).flatMap(f => {
    const p = path.join(dir, f)
    if (!fs.statSync(p).isDirectory()) return []
    return fs.readdirSync(p).flatMap(n => {
      const file = path.join(p, n, "run.json")
      return fs.existsSync(file) ? [file] : []
    })
  }).sort()
}

function classify(part, workspace) {
  const tool = part.tool
  const input = part.state?.input ?? {}
  const rawPath = input.filePath ?? input.path
  const rel = typeof rawPath === "string" ? path.relative(workspace, rawPath).split(path.sep).join("/") : null
  if (["edit", "write", "apply_patch", "multiedit"].includes(tool)) return { kind: "edit", rel }
  if (tool === "glob" || tool === "grep") return { kind: "navigate", rel }
  if (tool === "read") {
    if (typeof rawPath !== "string") return { kind: "other", rel }
    try { if (fs.statSync(rawPath).isDirectory()) return { kind: "navigate", rel } } catch {}
    if (rel === "verify.js" || rel === "TASK.md" || rel === "package.json") return { kind: "support", rel }
    return { kind: "source-read", rel }
  }
  if (tool === "bash") {
    const cmd = String(input.command ?? input.cmd ?? "").trim()
    if (/^(?:ls\b|find\b|rg\b|grep\b|git\s+ls-files\b)/.test(cmd)) return { kind: "navigate", command: cmd.slice(0, 120) }
    if (/\b(?:verify|test|pytest|tsc|lint)\b/.test(cmd)) return { kind: "verify", command: cmd.slice(0, 120) }
    return { kind: "other", command: cmd.slice(0, 120) }
  }
  return { kind: "other", rel }
}

function trace(run, files) {
  const workspace = run.workspace ?? path.join(run.dir, "workspace")
  const rounds = []
  const byMessage = new Map()
  let malformed = 0
  for (const file of files) {
    if (!fs.existsSync(file)) { malformed++; continue }
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      if (!line.trim()) continue
      let e
      try { e = JSON.parse(line) } catch { malformed++; continue }
      if (e.type !== "tool_use") continue
      const part = e.part ?? {}
      const id = part.messageID
      if (!id) { malformed++; continue }
      if (!byMessage.has(id)) { byMessage.set(id, []); rounds.push({ messageID: id, tools: byMessage.get(id) }) }
      byMessage.get(id).push(classify(part, workspace))
    }
  }
  const firstEdit = rounds.findIndex(r => r.tools.some(t => t.kind === "edit"))
  const before = firstEdit < 0 ? rounds : rounds.slice(0, firstEdit)
  const navigationRounds = before.map((r, i) => ({ round: i + 1, ...r })).filter(r => r.tools.length > 0 && r.tools.every(t => t.kind === "navigate"))
  const navigationTools = before.flatMap(r => r.tools).filter(t => t.kind === "navigate")
  const sourceReads = before.flatMap(r => r.tools).filter(t => t.kind === "source-read" && t.rel && !t.rel.startsWith("../")).map(t => t.rel)
  const counts = new Map()
  for (const rel of sourceReads) counts.set(rel, (counts.get(rel) ?? 0) + 1)
  return { rounds: rounds.length, firstEditRound: firstEdit < 0 ? null : firstEdit + 1,
    navigationOnlyRounds: navigationRounds.map(r => r.round), navigationTools: navigationTools.length,
    sourceReads: sourceReads.length, repeatedSourceReads: [...counts.values()].reduce((n, x) => n + Math.max(0, x - 1), 0),
    filesRead: [...counts.keys()].sort(), malformed }
}

function requiredFiles(fixture) {
  if (stage8Tasks.has(fixture)) return stage8Tasks.get(fixture).requiredFiles
  const file = path.join(benchmarkRoot, "fixtures", fixture, "ground-truth.json")
  if (!fs.existsSync(file)) return []
  return JSON.parse(fs.readFileSync(file, "utf8")).required ?? []
}

function finishRow(row, dir, files, runFile) {
  const required = requiredFiles(row.fixture)
  const read = new Set(row.filesRead)
  const audited = auditedRuns.get(`${row.label}:${row.sessionID}`)
  const outputSha256 = files.map(file => ({ file: path.basename(file), sha256: sha256(file) }))
  return { ...row,
    requiredFiles: required,
    requiredReadBeforeEdit: required.filter(file => read.has(file)),
    packetRequiredFiles: audited?.retrievedRequired ?? null,
    runSha256: sha256(runFile), outputSha256,
    auditHashMatch: audited ? audited.runSha256 === sha256(runFile) && audited.outputSha256 === outputSha256[0]?.sha256 : null,
  }
}

const rows = []
for (const cohort of cohorts) for (const file of runFiles(cohort.label)) {
  const data = JSON.parse(fs.readFileSync(file, "utf8"))
  const dir = path.dirname(file)
  const files = [path.join(dir, "opencode-output.jsonl")]
  rows.push(finishRow({ label: cohort.label, arm: cohort.arm, fixture: data.fixture, run: data.run ?? data.rep ?? path.basename(dir),
    sessionID: data.sessionID, verifyPass: data.verifyPass, ...trace({ dir }, files) }, dir, files, file))
}
const stage7 = path.join(results, "stage7-pilot-20260924")
if (fs.existsSync(stage7)) for (const name of fs.readdirSync(stage7).sort()) {
  const dir = path.join(stage7, name)
  const file = path.join(dir, "run.json")
  if (!fs.existsSync(file)) continue
  const data = JSON.parse(fs.readFileSync(file, "utf8"))
  if (data.phase !== "main" || data.policy !== "G") continue
  const files = data.attempts.map((_, i) => path.join(dir, `turn-${i + 1}.jsonl`))
  rows.push(finishRow({ label: data.label, arm: "v3", fixture: data.fixture, run: data.rep, sessionID: data.sessionID,
    verifyPass: data.status === "pass", ...trace({ dir }, files) }, dir, files, file))
}
if (process.argv.includes("--include-stage8")) {
  for (const stage8Label of ["stage8-discovery-v1", "stage8-discovery-v2"]) {
  const stage8 = path.join(results, stage8Label)
  if (fs.existsSync(stage8)) for (const name of fs.readdirSync(stage8).sort()) {
    if (!stage8Tasks.has(name)) continue
    const dir = path.join(stage8, name)
    const file = path.join(dir, "run.json")
    if (!fs.existsSync(file)) continue
    const data = JSON.parse(fs.readFileSync(file, "utf8"))
    const files = [path.join(dir, "opencode-output.jsonl")]
    rows.push(finishRow({ label: data.label, arm: "v3", fixture: data.fixture, run: 1, sessionID: data.sessionID,
      verifyPass: data.status === "pass", usageComplete: data.usageComplete, tokens: data.tokens?.total,
      totalDurationMs: data.totalDurationMs, ...trace({ dir, workspace: data.workspace }, files) }, dir, files, file))
  }
  }
}
if (process.argv.includes("--include-map")) {
  const pilot = path.join(results, "stage8-map-pilot-v1")
  if (fs.existsSync(pilot)) for (const name of fs.readdirSync(pilot).sort()) {
    if (!stage8Tasks.has(name)) continue
    const dir = path.join(pilot, name)
    const file = path.join(dir, "run.json")
    if (!fs.existsSync(file)) continue
    const data = JSON.parse(fs.readFileSync(file, "utf8"))
    const files = [path.join(dir, "opencode-output.jsonl")]
    rows.push(finishRow({ label: data.label, arm: "map", fixture: data.fixture, run: 1, sessionID: data.sessionID,
      verifyPass: data.status === "pass", usageComplete: data.usageComplete, tokens: data.tokens?.total,
      totalDurationMs: data.totalDurationMs, mapBytes: data.map?.bytes, mapPrepMs: data.map?.prepMs,
      mapProofCount: data.mapProofCount, ...trace({ dir, workspace: data.workspace }, files) }, dir, files, file))
  }
}

const v3 = rows.filter(r => r.arm === "v3")
const qualifying = v3.filter(r => r.verifyPass && r.navigationOnlyRounds.length >= 2)
const summary = { runs: rows.length, v3Runs: v3.length, qualifyingRuns: qualifying.length,
  qualifyingDistinctFixtures: [...new Set(qualifying.map(r => r.fixture))].sort(),
  malformedRuns: rows.filter(r => r.malformed > 0).length,
  verifiedRuns: rows.filter(r => r.verifyPass).length,
  auditHashChecks: rows.filter(r => r.auditHashMatch !== null).length,
  auditHashMismatches: rows.filter(r => r.auditHashMatch === false).length,
  nativeQualifyingFixtures: [...new Set(rows.filter(r => r.arm === "native" && r.navigationOnlyRounds.length >= 2).map(r => r.fixture))].sort(),
  v3RequiredFileOpportunities: v3.filter(r => r.requiredFiles.length > 0).length,
  v3RequiredFileReadBeforeEdit: v3.filter(r => r.requiredFiles.length > 0 && r.requiredFiles.every(f => r.requiredReadBeforeEdit.includes(f))).length }
console.log(JSON.stringify({ schemaVersion: 2, method: "Navigation-only round = every tool is glob/grep, directory read, or a listing/search command, before the first edit. Source and verifier reads disqualify a round. This counts observed behavior only.", summary, rows }, null, 2))
