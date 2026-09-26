#!/usr/bin/env node
import { benchmarkRoot, repositoryRoot } from "../../lib/paths.mjs"
// One benchmark-only map workflow per invocation. No premium calls or release integration.
import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import os from "node:os"
import { spawn, spawnSync } from "node:child_process"
import { fileURLToPath, pathToFileURL } from "node:url"
import { defaultRoot, launchSpec } from "../../../scripts/relay-runtime.mjs"
import { buildGraph, renderMap } from "./map/map.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const root = repositoryRoot
const protocolFile = path.join(repositoryRoot, "docs/stage8/map-pilot-protocol.json")
const protocol = JSON.parse(fs.readFileSync(protocolFile, "utf8"))
const corpus = JSON.parse(fs.readFileSync(path.join(here, "tasks/tasks.json"), "utf8"))
const frozen = JSON.parse(fs.readFileSync(path.join(repositoryRoot, "docs/stage8/task-corpus-manifest.json"), "utf8"))
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex")
const save = (file, obj) => fs.writeFileSync(file, JSON.stringify(obj, null, 2) + "\n")
const id = process.argv[process.argv.indexOf("--id") + 1]
const live = process.argv.includes("--run")
if (!protocol.tasks.includes(id)) throw new Error("usage: node benchmarks/stages/stage8/run-stage8-map-pilot.mjs --id <protocol-task-id> [--run]")
const task = corpus.tasks.find(t => t.id === id)
const taskRoot = path.join(here, "tasks")
const manifestTask = frozen.tasks.find(t => t.id === id)
const promptFile = path.join(taskRoot, id, "TASK.md")
const verifierFile = path.join(taskRoot, task.verifier)
if (sha(fs.readFileSync(path.join(taskRoot, "tasks.json"))) !== frozen.taskListSha256 ||
    sha(fs.readFileSync(promptFile)) !== manifestTask.promptSha256 ||
    sha(fs.readFileSync(verifierFile)) !== manifestTask.verifierSha256) throw new Error("task corpus drift")
const source = JSON.parse(fs.readFileSync(path.join(repositoryRoot, "docs/stage8/source-manifest.json"), "utf8"))
for (const repo of source.repositories) if (frozen.sourceTrees[repo.name] !== repo.treeSha256) throw new Error("source manifest drift")
const mapFiles = ["map/map.mjs", "map/python_ast.py", "map/inject.mjs"].map(f => path.join(here, f))
const mapCodeHash = sha(mapFiles.map(f => `${path.basename(f)}\0${sha(fs.readFileSync(f))}\n`).join(""))
if (mapCodeHash !== protocol.mapCodeSha256) throw new Error("map code drift")
const resultsRoot = path.join(benchmarkRoot, "results", protocol.label)
const resultDir = path.join(resultsRoot, id)
const workspace = path.join(benchmarkRoot, "results/stage8-workspaces", protocol.label, id)
if (fs.existsSync(resultDir) || fs.existsSync(workspace)) throw new Error(`task already prepared or run: ${id}`)
const previous = protocol.tasks.filter(t => fs.existsSync(path.join(resultsRoot, t, "run.json")))
if (previous.some(t => !JSON.parse(fs.readFileSync(path.join(resultsRoot, t, "run.json"), "utf8")).completedAt)) throw new Error("previous run incomplete")
const recorded = previous.reduce((n, t) => n + (JSON.parse(fs.readFileSync(path.join(resultsRoot, t, "run.json"), "utf8")).tokens?.total ?? 0), 0)
if (previous.length >= protocol.limits.runs || recorded + protocol.limits.reservePerTaskTokens > protocol.limits.recordedCodingInputPlusCacheReadTokens) throw new Error("protocol budget stop")
const next = protocol.tasks[previous.length]
if (id !== next) throw new Error(`frozen task order requires ${next}`)
for (const taskID of previous) {
  const prior = JSON.parse(fs.readFileSync(path.join(resultsRoot, taskID, "run.json"), "utf8"))
  const baseline = protocol.baselines[taskID]
  if (prior.status !== "pass" || !prior.usageComplete || prior.mapProofCount < 1) throw new Error(`pilot quality stop after ${taskID}`)
  if (prior.totalDurationMs > baseline.totalDurationMs * protocol.stopRules.maxLatencyRatio ||
      prior.tokens.total >= baseline.tokens * protocol.stopRules.maxTokenRatio) throw new Error(`pilot futility stop after ${taskID}`)
}
if (process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY must be unset")
if (!live) { console.log(JSON.stringify({ id, ready: true, model: protocol.model, recorded, next })); process.exit(0) }

const snapshot = path.join(benchmarkRoot, "results/stage8-snapshots", task.repository)
fs.mkdirSync(path.dirname(workspace), { recursive: true })
fs.cpSync(snapshot, workspace, { recursive: true, errorOnExist: true })
fs.copyFileSync(promptFile, path.join(workspace, "TASK.md"))
for (const args of [["init", "-q"], ["add", "-A"], ["-c", "user.email=stage8@local", "-c", "user.name=Stage 8", "commit", "-qm", "frozen baseline"]]) {
  if (spawnSync("git", args, { cwd: workspace }).status !== 0) throw new Error(`workspace git ${args[0]} failed`)
}
fs.mkdirSync(resultDir, { recursive: true })
const mapStart = Date.now()
const sourceRepo = source.repositories.find(r => r.name === task.repository)
const graph = buildGraph(workspace, sourceRepo.files.map(f => f.path))
const mapped = renderMap(graph, fs.readFileSync(promptFile, "utf8"), protocol.map.budgetBytes, protocol.map.maxFiles)
const mapPrepMs = Date.now() - mapStart
if (mapped.bytes > protocol.map.budgetBytes || mapped.files.length < 1) throw new Error("map budget or empty map")
const mapFile = path.join(resultDir, "map.txt")
const mapProof = path.join(resultDir, "map-proof.jsonl")
fs.writeFileSync(mapFile, mapped.text)
// checkConflicts intentionally rejects any inline plugin path containing
// "openrelay"; copy this independent benchmark injector to a neutral temp path.
const injectorSource = path.join(here, "map/inject.mjs")
const injectorBytes = fs.readFileSync(injectorSource)
const injectorCopy = path.join(os.tmpdir(), `stage8-map-inject-${sha(injectorBytes).slice(0, 12)}.mjs`)
if (!fs.existsSync(injectorCopy)) fs.writeFileSync(injectorCopy, injectorBytes)
if (sha(fs.readFileSync(injectorCopy)) !== sha(injectorBytes)) throw new Error("benchmark injector copy changed")
const telemetryDir = path.join(defaultRoot(), "data/benchmarks", protocol.label)
const inline = { agent: { "stage8-build": { mode: "primary", maxSteps: 24, description: "Bounded Stage 8 map pilot" } },
  plugin: [pathToFileURL(injectorCopy).href] }
const env = { ...process.env, OPENCODE_CONFIG_CONTENT: JSON.stringify(inline), OPENRELAY_TUI: "off", OPENRELAY_FILTERING: "on",
  OPENRELAY_CONTEXT: "on", OPENRELAY_MEMORY: "off", OPENRELAY_HANDOFF: "off", OPENRELAY_ROUTE: "off", OPENRELAY_ESCALATE: "off",
  OPENRELAY_STAGE8_MAP_FILE: mapFile, OPENRELAY_STAGE8_MAP_PROOF: mapProof,
  ...(task.repository === "delta" ? { PATH: `/Users/luke/src/Delta/.venv/bin:${process.env.PATH}`, PYTHONPATH: workspace, PYTHONDONTWRITEBYTECODE: "1" } : {}) }
const launched = launchSpec({ channel: "benchmark", repo: root, dataDir: telemetryDir, cwd: workspace, env })
const startedAt = new Date().toISOString()
const record = { schemaVersion: 1, label: protocol.label, id, fixture: id, repository: task.repository, model: protocol.model,
  buildID: launched.buildID, corpusManifestSha256: sha(fs.readFileSync(path.join(repositoryRoot, "docs/stage8/task-corpus-manifest.json"))),
  protocolSha256: sha(fs.readFileSync(protocolFile)),
  workspace, telemetryDir, startedAt, completedAt: null, status: "running", sessionID: null,
  map: { sha256: sha(mapped.text), bytes: mapped.bytes, files: mapped.files, prepMs: mapPrepMs, graphPrepMs: graph.prepMs },
  verifyPass: false, usageComplete: false, tokens: { total: 0, premium: 0, workhorse: 0 } }
save(path.join(resultDir, "run.json"), record)

function runOpencode() {
  return new Promise(resolve => {
    const child = spawn("opencode", ["run", "-m", protocol.model, "--agent", "stage8-build", "--auto", "--format", "json", fs.readFileSync(promptFile, "utf8").trim()],
      { cwd: workspace, env: launched.env, stdio: ["ignore", "pipe", "pipe"], detached: true })
    let stdout = "", stderr = "", timedOut = false
    const killGroup = signal => { try { process.kill(-child.pid, signal) } catch { try { child.kill(signal) } catch {} } }
    const timer = setTimeout(() => { timedOut = true; killGroup("SIGTERM"); setTimeout(() => killGroup("SIGKILL"), 5000).unref() }, protocol.limits.timeoutMsPerTask)
    child.stdout.on("data", chunk => { stdout += chunk })
    child.stderr.on("data", chunk => { stderr += chunk })
    child.on("error", error => { stderr += String(error) })
    child.on("close", code => { clearTimeout(timer); resolve({ code, stdout, stderr, timedOut }) })
  })
}

function sessionEvents(sessionID) {
  const events = []
  const dir = path.join(telemetryDir, "events")
  if (!sessionID || !fs.existsSync(dir)) return events
  for (const name of fs.readdirSync(dir).sort()) {
    for (const line of fs.readFileSync(path.join(dir, name), "utf8").split("\n")) {
      if (!line.trim()) continue
      try { const event = JSON.parse(line); if (event.session === sessionID) events.push(event) } catch {}
    }
  }
  return events
}

const start = Date.now()
const oc = await runOpencode()
fs.writeFileSync(path.join(resultDir, "opencode-output.jsonl"), oc.stdout)
fs.writeFileSync(path.join(resultDir, "opencode-stderr.log"), oc.stderr)
record.sessionID = oc.stdout.match(/"sessionID":"([^"]+)"/)?.[1] ?? null
record.opencodeExitCode = oc.code
record.timedOut = oc.timedOut
record.modelDurationMs = Date.now() - start
const verifyStart = Date.now()
const verifierCommand = task.language === "typescript" ? "bun" : "/Users/luke/src/Delta/.venv/bin/python"
const v = spawnSync(verifierCommand, [verifierFile], { cwd: workspace, encoding: "utf8", timeout: 120000,
  env: { ...process.env, STAGE8_WORKSPACE: workspace, ...(task.repository === "delta" ? { PYTHONPATH: workspace, PYTHONDONTWRITEBYTECODE: "1" } : {}) } })
record.verifyDurationMs = Date.now() - verifyStart
record.verifyPass = v.status === 0
record.verifyExitCode = v.status
fs.writeFileSync(path.join(resultDir, "verify.log"), `${v.stdout ?? ""}${v.stderr ?? ""}`)
const events = sessionEvents(record.sessionID)
fs.writeFileSync(path.join(resultDir, "telemetry.jsonl"), events.map(e => JSON.stringify(e)).join("\n") + (events.length ? "\n" : ""))
record.telemetrySha256 = sha(fs.readFileSync(path.join(resultDir, "telemetry.jsonl")))
const calls = events.filter(e => e.type === "llm.call" && e.data?.agent === "stage8-build")
const completions = events.filter(e => e.type === "assistant.completed" && e.data?.agent === "stage8-build")
const ids = new Set(completions.map(e => e.data?.messageID))
record.usageComplete = calls.length > 0 && calls.length === completions.length && ids.size === completions.length &&
  completions.every(e => e.data?.usageAvailable && Number.isFinite(e.data?.tokens?.input) && Number.isFinite(e.data?.tokens?.cacheRead))
record.tokens.total = completions.reduce((n, e) => n + (e.data?.tokens?.input ?? 0) + (e.data?.tokens?.cacheRead ?? 0), 0)
record.tokens.premium = completions.filter(e => e.data?.tier === "premium").reduce((n, e) => n + e.data.tokens.input + e.data.tokens.cacheRead, 0)
record.tokens.workhorse = record.tokens.total - record.tokens.premium
record.codingCalls = calls.length
record.codingCompletions = completions.length
record.premiumCalls = events.filter(e => e.type === "llm.call" && e.data?.tier === "premium").length
const proof = fs.existsSync(mapProof) ? fs.readFileSync(mapProof, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse) : []
record.mapProofCount = proof.filter(p => p.sessionID === record.sessionID && p.sha256 === record.map.sha256).length
record.changedFiles = spawnSync("git", ["-C", workspace, "status", "--porcelain"], { encoding: "utf8" }).stdout.trim().split("\n").filter(Boolean)
record.status = oc.timedOut ? "timeout" : oc.code !== 0 ? "opencode-error" : !record.sessionID ? "missing-session" :
  !record.usageComplete ? "usage-incomplete" : record.premiumCalls > 0 ? "premium-used" : record.mapProofCount < 1 ? "map-missing" : record.verifyPass ? "pass" : "verify-fail"
record.completedAt = new Date().toISOString()
record.totalDurationMs = Date.now() - start + mapPrepMs
save(path.join(resultDir, "run.json"), record)
console.log(JSON.stringify({ id, status: record.status, verifyPass: record.verifyPass, sessionID: record.sessionID,
  tokens: record.tokens, codingCalls: record.codingCalls, durationMs: record.totalDurationMs }))
