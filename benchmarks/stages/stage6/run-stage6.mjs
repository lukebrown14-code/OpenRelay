#!/usr/bin/env node
import { benchmarkRoot, repositoryRoot } from "../../lib/paths.mjs"
// Stage 6E pilot runner (docs/stage6/pilot-protocol.md). One run per invocation.
//   node run-stage6.mjs --fixture <name> --arm A|B|C|D --rep <n> --model <m> --label <label> [--timeout 420]
//
// Arms (protocol §fixed-configuration):
//   A: native continuation — frozen sender transcript imported via `opencode import`,
//      then `opencode run -s <id>` with the final user message. Memory off.
//   B: fresh session; prompt = frozen handoff render + final user message. Memory off.
//   C: identical to A with OPENRELAY_MEMORY=on (project notes seeded into the workspace).
//   D: identical to B with OPENRELAY_MEMORY=on.
// All arms: filtering on, route off, escalate off, v3 context on.
import { spawnSync, spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { defaultRoot, launchSpec } from "../../../scripts/relay-runtime.mjs"

const __dirname = benchmarkRoot
const FIXTURES_DIR = path.join(benchmarkRoot, "fixtures")
const RESULTS_DIR = path.join(benchmarkRoot, "results")

function fail(msg) {
  console.error(`error: ${msg}`)
  process.exit(1)
}

const args = {}
for (let i = 2; i < process.argv.length; i++) {
  const k = process.argv[i]
  if (k === "--dry-run") args.dryRun = true
  else args[k.slice(2)] = process.argv[++i]
}
const { fixture, arm, label } = args
if (!fixture || !arm || !label || !args.model) fail("required: --fixture <name> --arm A|B|C|D --model <m> --label <label>")
if (!["A", "B", "C", "D"].includes(arm)) fail('--arm must be A|B|C|D')
if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(label)) fail("label must be a simple directory name")
const rep = String(parseInt(args.rep ?? "1", 10)).padStart(2, "0")
const timeoutSec = parseInt(args.timeout ?? "420", 10)
const fixturePath = path.join(FIXTURES_DIR, fixture)
if (!fs.existsSync(fixturePath)) fail(`unknown fixture: ${fixture}`)
const finalMessage = fs.readFileSync(path.join(fixturePath, "TASK_RECEIVER.md"), "utf8").trim()
const handoffRender = fs.existsSync(path.join(fixturePath, "sender", "handoff-render.txt"))
  ? fs.readFileSync(path.join(fixturePath, "sender", "handoff-render.txt"), "utf8").trim()
  : ""

const telemetryDir = path.join(defaultRoot(), "data", "benchmarks", label)
const runDir = path.join(RESULTS_DIR, label, `${fixture}-${arm}`, `run-${rep}`)
fs.mkdirSync(runDir, { recursive: true })
const workspace = path.join(runDir, "workspace")
fs.rmSync(workspace, { recursive: true, force: true })

// workspace prep: copy tree, strip harness-only artifacts, baseline commit
fs.cpSync(fixturePath, workspace, { recursive: true })
for (const s of ["sender", "ground-truth.json", "TASK_RECEIVER.md", "setup.mjs"]) {
  fs.rmSync(path.join(workspace, s), { recursive: true, force: true })
}
for (const c of [["init", "-q"], ["add", "-A"], ["-c", "user.email=bench@local", "-c", "user.name=bench", "commit", "-qm", "baseline"]]) {
  const r = spawnSync("git", ["-C", workspace, ...c], { stdio: "ignore" })
  if (r.status !== 0) fail(`baseline commit failed for ${fixture}`)
}
// arms C/D seed project memory into the workspace
if (arm === "C" || arm === "D") {
  const memSrc = path.join(fixturePath, "sender", "memory.json")
  if (fs.existsSync(memSrc)) {
    fs.mkdirSync(path.join(workspace, ".codebase", "modules"), { recursive: true })
    fs.copyFileSync(memSrc, path.join(workspace, ".codebase", "memory.json"))
    const modules = path.join(fixturePath, "sender", "modules")
    if (fs.existsSync(modules)) for (const f of fs.readdirSync(modules)) fs.copyFileSync(path.join(modules, f), path.join(workspace, ".codebase", "modules", f))
  }
}

let oc = { code: null, stdout: "", stderr: "", timedOut: false, sessionID: null }
if (args.dryRun) {
  oc.code = 0
} else {
  const memoryEnv = arm === "C" || arm === "D" ? "on" : "off"
  const spec = launchSpec({
    channel: "benchmark", repo: path.resolve(__dirname, ".."), dataDir: telemetryDir, cwd: workspace,
    env: { ...process.env, OPENRELAY_FILTERING: "on", OPENRELAY_ROUTE: "off", OPENRELAY_ESCALATE: "off", OPENRELAY_CONTEXT: "on", OPENRELAY_MEMORY: memoryEnv, OPENRELAY_HANDOFF: "off" },
  })
  const runOpts = { cwd: workspace, env: spec.env, stdio: ["ignore", "pipe", "pipe"], timeout: timeoutSec * 1000, killSignal: "SIGTERM", encoding: "utf8" }
  const startedAt = new Date().toISOString()
  const t0 = Date.now()

  if (arm === "A" || arm === "C") {
    // native continuation: import frozen transcript, continue that session.
    // IMPORTANT: rewrite every ID per run — `opencode import` upserts by session
    // id, so a shared id would merge runs into one ever-growing session (the
    // contamination bug found on the first pilot attempt).
    const { randomUUID } = await import("node:crypto")
    const suffix = randomUUID().replace(/-/g, "").slice(0, 24)
    const sid = `ses_${suffix}`
    const transcript = JSON.parse(fs.readFileSync(path.join(fixturePath, "sender", "transcript.json"), "utf8"))
    transcript.info.directory = workspace
    transcript.info.path = workspace.replace(/^\//, "")
    transcript.info.id = sid
    transcript.info.slug = `sender-${fixture.slice(0, 2)}${arm}${rep}${suffix.slice(0, 6)}`
    for (const m of transcript.messages) {
      const newId = `msg_${suffix}_${m.info.role}_${Math.floor(Math.random() * 1e6)}`
      m.info.id = newId
      m.info.sessionID = sid
      for (const p of m.parts) {
        p.id = `prt_${suffix}_${Math.floor(Math.random() * 1e6)}`
        p.sessionID = sid
        p.messageID = newId
      }
      if (m.info.parentID) m.info.parentID = `msg_${suffix}_user_0`
    }
    // link assistant parentIDs to their actual user predecessor where present
    let prevUser = null
    for (const m of transcript.messages) {
      if (m.info.role === "user") prevUser = m.info.id
      else if (m.info.parentID) m.info.parentID = prevUser ?? `msg_${suffix}_user_0`
    }
    const importFile = path.join(runDir, "sender-transcript.json")
    fs.writeFileSync(importFile, JSON.stringify(transcript, null, 1))
    const imp = spawnSync("opencode", ["import", importFile], { ...runOpts, timeout: 30000 })
    const imported = (imp.stdout ?? "").match(/Imported session: (\S+)/)
    if (!imported) fail(`transcript import failed: ${(imp.stderr ?? imp.stdout ?? "").slice(0, 300)}`)
    oc.sessionID = imported[1]
    const r = spawnSync("opencode", ["run", "-s", oc.sessionID, "-m", args.model, "--agent", "build", "--auto", "--format", "json", finalMessage], runOpts)
    oc = { ...oc, code: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "", timedOut: r.error?.message?.includes("TIMEOUT") ?? false }
  } else {
    const prompt = `${handoffRender}\n\n---\n\n${finalMessage}`
    const r = spawnSync("opencode", ["run", "-m", args.model, "--agent", "build", "--auto", "--format", "json", prompt], runOpts)
    oc = { ...oc, code: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "", timedOut: r.error?.message?.includes("TIMEOUT") ?? false }
  }
  var durationMs = Date.now() - t0
  var endedAt = new Date().toISOString()
}

if (oc.stdout) fs.writeFileSync(path.join(runDir, "opencode-output.jsonl"), oc.stdout)
if (oc.stderr) fs.writeFileSync(path.join(runDir, "opencode-stderr.log"), oc.stderr)
if (!oc.sessionID) {
  const m = oc.stdout.match(/"sessionID":"([^"]+)"/)
  oc.sessionID = m ? m[1] : null
}
const verify = spawnSync("node", ["verify.js"], { cwd: workspace, encoding: "utf8", timeout: 30000 })
const record = {
  telemetryDir,
  runtime: { channel: "benchmark", previewSafe: true },
  stage: "6e-pilot",
  fixture, arm, rep,
  model: args.model,
  agent: "build",
  filtering: "on", route: "off", escalate: "off", context: "on",
  memory: arm === "C" || arm === "D" ? "on" : "off",
  handoffBytes: arm === "B" || arm === "D" ? Buffer.byteLength(handoffRender, "utf8") : 0,
  dryRun: Boolean(args.dryRun),
  startedAt: oc.code === null ? new Date().toISOString() : undefined,
  durationMs: typeof durationMs === "number" ? durationMs : 0,
  timedOut: oc.timedOut,
  opencodeExitCode: oc.code,
  sessionID: oc.sessionID,
  verifyPass: verify.status === 0,
  verifyTail: ((verify.stdout ?? "") + (verify.stderr ?? "")).trim().split("\n").slice(-3).join(" | ").slice(0, 300),
}
fs.writeFileSync(path.join(runDir, "run.json"), JSON.stringify(record, null, 1) + "\n")
console.log(`[${label}] ${fixture} arm ${arm} rep ${rep}: ${record.verifyPass ? "verify PASS" : "verify FAIL"} | ${Math.round(record.durationMs / 1000)}s | session ${record.sessionID ?? "n/a"}`)
if (!record.verifyPass) console.log(`  ${record.verifyTail}`)
