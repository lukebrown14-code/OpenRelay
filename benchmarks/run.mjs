#!/usr/bin/env node
// Benchmark runner for the token-efficient architecture.
//
// Usage:
//   node run.mjs --fixture <name|all> --runs <N> --model <provider/model> --label <label> [options]
//
// Options:
//   --fixture   fixture name (e.g. 02-routine-bug) or "all"
//   --runs      number of runs per fixture (default 3)
//   --model     provider/model passed to `opencode run -m` (required)
//   --label     results directory name (required)
//   --agent     agent to use (default: build)
//   --timeout   per-run timeout in seconds (default 300)
//   --filtering tool-output filtering mode passed to the plugin via OPENRELAY_FILTERING (off|on, default off)
//   --route     controller routing mode passed via OPENRELAY_ROUTE (off|auto|premium|glm, default off)
//   --escalate  controller escalation mode passed via OPENRELAY_ESCALATE (on|off, default off)
//   --context   Stage 5 context engine passed via OPENRELAY_CONTEXT (off|on, default off)
//   --append    continue run numbering after the highest existing run-NN for each fixture
//               (lets interleaved A/B pairs share one label per arm instead of overwriting)
//   --capture-context  save the exact injected packet for synthetic benchmark runs
//   --dry-run   skip opencode, validate harness mechanics only

import { spawnSync, spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { defaultRoot, launchSpec } from "../scripts/relay-runtime.mjs"
import { packetCaptureRecord, sessionContextEvents, verificationTiming } from "./lib/measurement.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES_DIR = path.join(__dirname, "fixtures")
const RESULTS_DIR = path.join(__dirname, "results")

function parseArgs(argv) {
  const args = {}
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i]
    if (k.startsWith("--")) {
      if (k === "--dry-run") args.dryRun = true
      else if (k === "--append") args.append = true
      else if (k === "--capture-context") args.captureContext = true
      else args[k.slice(2)] = argv[++i]
    }
  }
  return args
}

function fail(msg) {
  console.error(`error: ${msg}`)
  process.exit(1)
}

const args = parseArgs(process.argv)
if (!args.fixture || !args.model || !args.label) {
  fail("required: --fixture <name|all> --model <provider/model> --label <label>")
}
if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(args.label)) fail("label must be a simple directory name")
const telemetryDir = path.join(defaultRoot(), "data", "benchmarks", args.label)
const repo = path.resolve(__dirname, "..")
const runs = parseInt(args.runs ?? "3", 10)
const timeoutSec = parseInt(args.timeout ?? "300", 10)
const agent = args.agent ?? "build"
const filtering = args.filtering ?? "off"
if (filtering !== "off" && filtering !== "on") fail(`--filtering must be "off" or "on", got: ${filtering}`)
const route = args.route ?? "off"
if (route !== "off" && route !== "auto" && route !== "premium" && route !== "glm") fail(`--route must be "off", "auto", "premium", or "glm", got: ${route}`)
const escalate = args.escalate ?? "off"
if (escalate !== "on" && escalate !== "off") fail(`--escalate must be "on" or "off", got: ${escalate}`)
const context = args.context ?? "off"
if (context !== "on" && context !== "off") fail(`--context must be "on" or "off", got: ${context}`)

const fixtures = args.fixture === "all"
  ? fs.readdirSync(FIXTURES_DIR).filter((d) => !d.startsWith("."))
  : [args.fixture]
for (const f of fixtures) {
  if (!fs.existsSync(path.join(FIXTURES_DIR, f))) fail(`unknown fixture: ${f}`)
}

function runOpencode(cwd, model, agentName, prompt, timeoutMs, filtering, route, escalate, context, captureContext) {
  const spec = launchSpec({ channel: "benchmark", repo, dataDir: telemetryDir, cwd,
    env: { ...process.env, OPENRELAY_FILTERING: filtering, OPENRELAY_ROUTE: route, OPENRELAY_ESCALATE: escalate,
      OPENRELAY_CONTEXT: context, OPENRELAY_CAPTURE_CONTEXT: captureContext ? "on" : "off" } })
  return new Promise((resolve) => {
    const child = spawn(
      "opencode",
      ["run", "-m", model, "--agent", agentName, "--auto", "--format", "json", prompt],
      // OpenCode consults PWD for project resolution and waits if inherited stdin
      // remains open, so both must describe a headless child process explicitly.
      // OPENRELAY_FILTERING opts the plugin's Stage 2 tool-output filter in or out.
      { cwd, env: spec.env, stdio: ["ignore", "pipe", "pipe"] },
    )
    let stdout = ""
    let stderr = ""
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill("SIGTERM")
      setTimeout(() => child.kill("SIGKILL"), 5000)
    }, timeoutMs)
    child.stdout.on("data", (d) => (stdout += d))
    child.stderr.on("data", (d) => (stderr += d))
    child.on("close", (code) => {
      clearTimeout(timer)
      resolve({ code, stdout, stderr, timedOut })
    })
  })
}

// Workspace prep: clone if the fixture is a git repo; otherwise copy the tree and
// create a pinned baseline commit so post-run `git diff` measurements still work.
// Harness-only artifacts (setup.mjs, ground-truth.json) are stripped before the
// baseline commit so they never leak into the workspace or its history.
function prepareWorkspace(fixturePath, workspace) {
  const ARTIFACTS = ["setup.mjs", "ground-truth.json", "history.bundle"]
  for (const artifact of ARTIFACTS) {
    try {
      fs.rmSync(path.join(workspace, artifact), { force: true })
    } catch {}
  }
  const isRepo = fs.existsSync(path.join(fixturePath, ".git"))
  if (isRepo) {
    const r = spawnSync("git", ["clone", "--quiet", fixturePath, workspace])
    if (r.status !== 0) return { ok: false, stderr: r.stderr?.toString() }
    for (const artifact of ARTIFACTS) {
      const tracked = spawnSync("git", ["-C", workspace, "ls-files", "--error-unmatch", artifact], { stdio: "ignore" })
      if (tracked.status === 0) {
        const rm = spawnSync("git", ["-C", workspace, "rm", "-q", "-f", artifact])
        const ci = spawnSync("git", ["-C", workspace, "-c", "user.email=bench@local", "-c", "user.name=bench", "commit", "-qm", `chore: remove ${artifact}`])
        if (rm.status !== 0 || ci.status !== 0) return { ok: false, stderr: `artifact strip failed for ${artifact}` }
      } else {
        fs.rmSync(path.join(workspace, artifact), { force: true })
      }
    }
    return { ok: true }
  }
  try {
    fs.cpSync(fixturePath, workspace, { recursive: true })
    for (const artifact of ARTIFACTS) {
      fs.rmSync(path.join(workspace, artifact), { force: true })
    }
    const cmds = [
      ["init", "-q"],
      ["add", "-A"],
      ["-c", "user.email=bench@local", "-c", "user.name=bench", "commit", "-qm", "baseline"],
    ]
    for (const c of cmds) {
      const r = spawnSync("git", ["-C", workspace, ...c])
      if (r.status !== 0) return { ok: false, stderr: r.stderr?.toString() }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, stderr: e.message }
  }
}

// Fixture-level setup hook: runs the fixture's setup.mjs (scenario seeding for git
// fixtures) against the prepared workspace, and strips harness-only artifacts
// (setup.mjs, ground-truth.json) so the model can never read the scenario recipe or
// the retrieval-eval answer key. Returns {ok, stderr}.
function runSetupHook(fixturePath, workspace) {
  for (const artifact of ["setup.mjs", "ground-truth.json", "history.bundle"]) {
    try {
      fs.rmSync(path.join(workspace, artifact), { force: true })
    } catch {}
  }
  const setup = path.join(fixturePath, "setup.mjs")
  if (!fs.existsSync(setup)) return { ok: true }
  const r = spawnSync(process.execPath, [setup], { cwd: workspace, encoding: "utf8", timeout: 60000 })
  if (r.status !== 0) return { ok: false, stderr: (r.stderr ?? r.stdout ?? "setup failed").toString() }
  return { ok: true }
}

function fixtureMeta(fixture) {
  try {
    return JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, fixture, "meta.json"), "utf8"))
  } catch {
    return {}
  }
}

// With --append, continue after the highest existing run-NN so interleaved
// invocations accumulate under one label instead of overwriting run-01.
function firstRunIndex(label, fixture) {
  if (!args.append) return 1
  const dir = path.join(RESULTS_DIR, label, fixture)
  let max = 0
  try {
    for (const name of fs.readdirSync(dir)) {
      const m = name.match(/^run-(\d+)$/)
      if (m && Number(m[1]) > max) max = Number(m[1])
    }
  } catch {}
  return max + 1
}

async function main() {
  const summary = []
  for (const fixture of fixtures) {
    const taskMd = fs.readFileSync(path.join(FIXTURES_DIR, fixture, "TASK.md"), "utf8")
    const meta = fixtureMeta(fixture)
    const verifyTimeoutMs = typeof meta.verifyTimeoutMs === "number" && meta.verifyTimeoutMs > 0 ? meta.verifyTimeoutMs : 30000
    const startRun = firstRunIndex(args.label, fixture)
    for (let i = startRun; i < startRun + runs; i++) {
      const runDir = path.join(RESULTS_DIR, args.label, fixture, `run-${String(i).padStart(2, "0")}`)
      fs.mkdirSync(runDir, { recursive: true })
      const workspace = path.join(runDir, "workspace")
      fs.rmSync(workspace, { recursive: true, force: true })

      const fixturePath = path.join(FIXTURES_DIR, fixture)
      const clone = prepareWorkspace(fixturePath, workspace)
      if (!clone.ok) {
        fail(`workspace prep failed for ${fixture}: ${clone.stderr}`)
      }
      const setup = runSetupHook(fixturePath, workspace)
      if (!setup.ok) {
        fail(`fixture setup failed for ${fixture}: ${setup.stderr}`)
      }

      console.log(`[${args.label}] ${fixture} run ${i}/${runs} ...`)
      const startedAt = new Date().toISOString()
      const startMs = Date.now()

      let oc = { code: null, stdout: "", stderr: "", timedOut: false }
      if (args.dryRun) {
        oc.code = 0
      } else {
        oc = await runOpencode(workspace, args.model, agent, taskMd, timeoutSec * 1000, filtering, route, escalate, context, Boolean(args.captureContext))
      }
      const durationMs = Date.now() - startMs
      const endedAt = new Date().toISOString()

      if (oc.stdout) fs.writeFileSync(path.join(runDir, "opencode-output.jsonl"), oc.stdout)
      if (oc.stderr) fs.writeFileSync(path.join(runDir, "opencode-stderr.log"), oc.stderr)

      const sessionMatch = oc.stdout.match(/"sessionID":"([^"]+)"/)
      const sessionID = sessionMatch ? sessionMatch[1] : null

      const verifyStartMs = Date.now()
      const verifyStartedAt = new Date(verifyStartMs).toISOString()
      const verify = spawnSync("node", ["verify.js"], { cwd: workspace, encoding: "utf8", timeout: verifyTimeoutMs })
      const verifyEndMs = Date.now()
      const verifyEndedAt = new Date(verifyEndMs).toISOString()
      const verifyPass = verify.status === 0
      const timing = verificationTiming(verify, startMs, verifyStartMs, verifyEndMs)
      const verifyTail = ((verify.stdout ?? "") + (verify.stderr ?? "")).trim().split("\n").slice(-5).join(" | ").slice(0, 400)
      const contextEvents = args.captureContext && !args.dryRun ? sessionContextEvents(telemetryDir, sessionID) : []
      const packetCapture = packetCaptureRecord({ context, enabled: Boolean(args.captureContext) && !args.dryRun,
        sessionID, events: contextEvents, telemetryDir, runDir })

      const diffStat = spawnSync("git", ["-C", workspace, "diff", "--stat"], { encoding: "utf8" }).stdout.trim()
      const changed = spawnSync("git", ["-C", workspace, "status", "--porcelain"], { encoding: "utf8" }).stdout.trim()

      const record = {
        telemetryDir,
        runtime: { channel: "benchmark", previewSafe: process.env.OPENRELAY_PREVIEW_SAFE !== "off" },
        fixture,
        label: args.label,
        run: i,
        model: args.model,
        agent,
        filtering,
        route,
        escalate,
        context,
        fixtureMeta: meta,
        dryRun: Boolean(args.dryRun),
        startedAt,
        endedAt,
        durationMs,
        verifyStartedAt,
        verifyEndedAt,
        ...timing,
        timedOut: oc.timedOut,
        opencodeExitCode: oc.code,
        sessionID,
        verifyPass,
        verifyTail,
        packetCapture,
        diffStat,
        changedFiles: changed ? changed.split("\n").length : 0,
      }
      fs.writeFileSync(path.join(runDir, "run.json"), JSON.stringify(record, null, 2))
      summary.push(record)
      console.log(
        `  ${oc.timedOut ? "TIMEOUT" : oc.code === 0 ? "done" : `exit ${oc.code}`} | verify: ${verifyPass ? "PASS" : "FAIL"} | ${Math.round(durationMs / 1000)}s | session ${sessionID ?? "n/a"}`,
      )
    }
  }

  const passes = summary.filter((r) => r.verifyPass).length
  console.log(`\nsummary: ${passes}/${summary.length} verify PASS across ${fixtures.length} fixture(s) (context=${context})`)
}

main().catch((e) => fail(e.stack))
