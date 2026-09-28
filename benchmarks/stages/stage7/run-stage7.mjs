#!/usr/bin/env node
import { benchmarkRoot, repositoryRoot } from "../../lib/paths.mjs"
// Stage 7 workflow runner. One isolated policy/workflow per invocation.
// Model calls are made only with --run and a frozen manifest.
import fs from "node:fs"
import path from "node:path"
import { spawn, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { fileURLToPath } from "node:url"
import { defaultRoot, launchSpec } from "../../../scripts/relay-runtime.mjs"
import { nextAttempt, withinBudget } from "./policy.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = repositoryRoot
const args = Object.fromEntries(process.argv.slice(2).filter(x => x.startsWith("--") && x !== "--run").map((x, i, all) => [x.slice(2), process.argv[process.argv.indexOf(x) + 1]]))
const live = process.argv.includes("--run")
const manifestFile = path.join(repo, "docs/stage7/pilot-manifest.json")
const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"))
const fail = message => { throw new Error(message) }
const sha = data => createHash("sha256").update(data).digest("hex")
const json = file => JSON.parse(fs.readFileSync(file, "utf8"))
const save = (file, value) => {
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n")
  fs.renameSync(tmp, file)
}

function treeHash(root) {
  const parts = []
  function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      const full = path.join(dir, ent.name)
      if (ent.isDirectory()) walk(full)
      else if (ent.isFile()) parts.push(`${path.relative(root, full)}\n${sha(fs.readFileSync(full))}\n`)
    }
  }
  walk(root)
  return sha(parts.join(""))
}

function resultTotals(resultsRoot) {
  const totals = { workflows: 0, tokens: 0, premiumTokens: 0, usageMissing: false, incomplete: false }
  for (const dir of fs.readdirSync(resultsRoot, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue
    const file = path.join(resultsRoot, dir.name, "run.json")
    if (!fs.existsSync(file)) continue
    const r = json(file)
    if (r.startedAt) totals.workflows++
    totals.tokens += r.tokens?.total ?? 0
    totals.premiumTokens += r.tokens?.premium ?? 0
    if (r.startedAt && r.usageComplete === false) totals.usageMissing = true
    if (r.startedAt && (r.status === "running" || !r.completedAt)) totals.incomplete = true
  }
  return totals
}

function sessionUsage(eventsDir, sessionID) {
  const calls = []
  const completions = new Map()
  let duplicate = false
  if (!sessionID || !fs.existsSync(eventsDir)) return { complete: false, total: 0, premium: 0, workhorse: 0, rounds: 0 }
  for (const name of fs.readdirSync(eventsDir)) {
    for (const line of fs.readFileSync(path.join(eventsDir, name), "utf8").split("\n")) {
      if (!line.trim()) continue
      let e
      try { e = JSON.parse(line) } catch { continue }
      if (e.session !== sessionID) continue
      if (e.type === "llm.call" && e.data?.agent === "stage7-build") calls.push(e)
      if (e.type !== "assistant.completed" || e.data?.agent !== "stage7-build") continue
      const id = e.data?.messageID
      if (!id || completions.has(id)) duplicate = true
      else completions.set(id, e.data)
    }
  }
  const values = [...completions.values()]
  const complete = !duplicate && values.length > 0 && values.length === calls.length && values.every(v => v.usageAvailable && Number.isFinite(v.tokens?.input) && Number.isFinite(v.tokens?.cacheRead))
  const totals = { complete, total: 0, premium: 0, workhorse: 0, rounds: values.length }
  if (!complete) return totals
  for (const v of values) {
    const count = v.tokens.input + v.tokens.cacheRead
    totals.total += count
    if (v.tier === "premium") totals.premium += count
    else if (v.tier === "workhorse") totals.workhorse += count
    else totals.complete = false
  }
  return totals
}

function runOpencode({ workspace, env, model, sessionID, prompt, timeoutMs }) {
  return new Promise(resolve => {
    const argv = ["run", ...(sessionID ? ["-s", sessionID] : []), "-m", model, "--agent", "stage7-build", "--auto", "--format", "json", prompt]
    const child = spawn("opencode", argv, { cwd: workspace, env, stdio: ["ignore", "pipe", "pipe"] })
    let stdout = "", stderr = "", timedOut = false
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGTERM"); setTimeout(() => child.kill("SIGKILL"), 5000).unref() }, timeoutMs)
    child.stdout.on("data", chunk => { stdout += chunk })
    child.stderr.on("data", chunk => { stderr += chunk })
    child.on("error", error => { stderr += String(error) })
    child.on("close", code => { clearTimeout(timer); resolve({ code, stdout, stderr, timedOut }) })
  })
}

const workflowID = args.id
if (!workflowID || !/^[a-z0-9-]+$/.test(workflowID)) fail("required: --id <manifest-workflow-id>")
const spec = manifest.schedule.find(x => x.id === workflowID)
if (!spec) fail("workflow ID not in frozen manifest")
const fixture = path.join(benchmarkRoot, "fixtures", spec.fixture)
if (treeHash(fixture) !== manifest.fixtures[spec.fixture]) fail(`fixture drift: ${spec.fixture}`)
if (!live) {
  console.log(JSON.stringify({ id: workflowID, fixture: spec.fixture, policy: spec.policy, fixtureHash: manifest.fixtures[spec.fixture], ready: true }))
  process.exit(0)
}

const workhorse = manifest.models.workhorse
const premium = manifest.models.premium
if (!workhorse || !premium || process.env.OPENAI_API_KEY) fail("frozen models required; OPENAI_API_KEY must be unset")
const resultsRoot = path.join(benchmarkRoot, "results", manifest.label)
fs.mkdirSync(resultsRoot, { recursive: true })
if (fs.existsSync(path.join(resultsRoot, "stop.json"))) fail("pilot is closed; see stop.json")
const runDir = path.join(resultsRoot, workflowID)
if (fs.existsSync(runDir)) fail(`workflow already exists: ${runDir}`)
const spent = resultTotals(resultsRoot)
if (spent.incomplete) fail("a previous workflow is incomplete; inspect it before launching another")
const stop = withinBudget(spent, manifest.limits)
if (stop) fail(`pilot budget stop: ${stop}`)
if (spent.tokens + 350_000 > manifest.limits.tokens || spent.premiumTokens + 150_000 > manifest.limits.premiumTokens) {
  fail("pilot reserve would exceed a token ceiling")
}
fs.mkdirSync(runDir)
const workspace = path.join(runDir, "workspace")
fs.cpSync(fixture, workspace, { recursive: true })
for (const name of ["verify.js", "TASK.md"]) fs.rmSync(path.join(workspace, name), { force: true })
for (const cmd of [["init", "-q"], ["add", "-A"], ["-c", "user.email=bench@local", "-c", "user.name=bench", "commit", "-qm", "baseline"]]) {
  if (spawnSync("git", ["-C", workspace, ...cmd]).status !== 0) fail("workspace git baseline failed")
}
const prompt = fs.readFileSync(path.join(fixture, "TASK.md"), "utf8").trim()
const telemetryDir = path.join(defaultRoot(), "data", "benchmarks", manifest.label)
const inline = { agent: { "stage7-build": { mode: "primary", maxSteps: 8, description: "Bounded Stage 7 coding attempt" } } }
const launched = launchSpec({ channel: "benchmark", repo, dataDir: telemetryDir, cwd: workspace,
  env: { ...process.env, OPENCODE_CONFIG_CONTENT: JSON.stringify(inline), OPENRELAY_TUI: "off", OPENRELAY_FILTERING: "on", OPENRELAY_CONTEXT: "on", OPENRELAY_MEMORY: "off", OPENRELAY_HANDOFF: "off", OPENRELAY_ROUTE: "off", OPENRELAY_ESCALATE: "off" } })
const record = { ...spec, label: manifest.label, models: manifest.models, buildID: launched.buildID,
  fixtureHash: manifest.fixtures[spec.fixture], startedAt: new Date().toISOString(), attempts: [],
  tokens: { total: 0, premium: 0, workhorse: 0 }, usageComplete: null, status: "running" }
save(path.join(runDir, "run.json"), record)
const startMs = Date.now()
let sessionID = null
const outcomes = []
for (let attempt = 0; attempt < 3; attempt++) {
  if (Date.now() - startMs >= 600000) { record.status = "timeout"; break }
  const tier = nextAttempt(spec.policy, outcomes)
  if (!tier) break
  const currentBudget = resultTotals(resultsRoot)
  // The current workflow is counted as started; only hard token ceilings block a continuation.
  if (currentBudget.tokens >= manifest.limits.tokens || currentBudget.premiumTokens >= manifest.limits.premiumTokens) {
    record.status = "budget-stop"; break
  }
  const model = tier === "premium" ? premium : workhorse
  const turnPrompt = attempt === 0 ? prompt : `Continue the same task. Independent verification failed.\n${record.attempts.at(-1).verifyTail}\nFix the remaining issue and run an appropriate check.`
  const remainingMs = Math.max(1000, 600000 - (Date.now() - startMs))
  const t0 = Date.now()
  const oc = await runOpencode({ workspace, env: launched.env, model, sessionID, prompt: turnPrompt, timeoutMs: remainingMs })
  fs.writeFileSync(path.join(runDir, `turn-${attempt + 1}.jsonl`), oc.stdout)
  fs.writeFileSync(path.join(runDir, `turn-${attempt + 1}.stderr.log`), oc.stderr)
  const found = oc.stdout.match(/"sessionID":"([^"]+)"/)
  const observedSession = found?.[1] ?? null
  if (sessionID && observedSession !== sessionID) { record.status = "session-mismatch"; break }
  sessionID ??= observedSession
  if (!sessionID || oc.code !== 0 || oc.timedOut) { record.status = oc.timedOut ? "timeout" : "opencode-error"; break }
  const verifyDir = path.join(runDir, `verify-${attempt + 1}`)
  fs.cpSync(workspace, verifyDir, { recursive: true, filter: source => path.basename(source) !== ".git" })
  fs.copyFileSync(path.join(fixture, "verify.js"), path.join(verifyDir, "verify.js"))
  const v0 = Date.now()
  const verify = spawnSync("node", ["verify.js"], { cwd: verifyDir, encoding: "utf8", timeout: 30000 })
  const verifyMs = Date.now() - v0
  const pass = verify.status === 0
  const controlledFail = spec.phase === "mechanics" && spec.policy.startsWith("E") && attempt < (spec.policy === "E1" ? 1 : 2)
  const outcome = pass && !controlledFail ? "pass" : verify.error ? "unknown" : "fail"
  outcomes.push(outcome)
  const usage = sessionUsage(path.join(telemetryDir, "events"), sessionID)
  record.sessionID = sessionID
  record.usageComplete = usage.complete
  record.tokens = { total: usage.total, premium: usage.premium, workhorse: usage.workhorse }
  record.attempts.push({ attempt: attempt + 1, tier, model, sessionID, outcome,
    syntheticMechanicsFailure: controlledFail, actualVerifyPass: pass,
    verifyMs, turnMs: Date.now() - t0 - verifyMs, roundsCumulative: usage.rounds,
    verifyTail: ((verify.stdout ?? "") + (verify.stderr ?? "")).trim().split("\n").slice(-5).join(" | ").slice(0, 400) })
  record.status = outcome === "pass" ? "pass" : outcome === "unknown" ? "verification-unknown" : "running"
  save(path.join(runDir, "run.json"), record)
  if (outcome !== "fail" || !usage.complete) break
}
if (record.status === "running") record.status = "failed-after-three-attempts"
record.completedAt = new Date().toISOString()
record.totalDurationMs = Date.now() - startMs
save(path.join(runDir, "run.json"), record)
console.log(JSON.stringify({ id: workflowID, status: record.status, sessionID, attempts: record.attempts.length, tokens: record.tokens, durationMs: record.totalDurationMs }))
