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
//   --dry-run   skip opencode, validate harness mechanics only

import { spawnSync, spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES_DIR = path.join(__dirname, "fixtures")
const RESULTS_DIR = path.join(__dirname, "results")

function parseArgs(argv) {
  const args = {}
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i]
    if (k.startsWith("--")) {
      if (k === "--dry-run") args.dryRun = true
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
const runs = parseInt(args.runs ?? "3", 10)
const timeoutSec = parseInt(args.timeout ?? "300", 10)
const agent = args.agent ?? "build"
const filtering = args.filtering ?? "off"
if (filtering !== "off" && filtering !== "on") fail(`--filtering must be "off" or "on", got: ${filtering}`)

const fixtures = args.fixture === "all"
  ? fs.readdirSync(FIXTURES_DIR).filter((d) => !d.startsWith("."))
  : [args.fixture]
for (const f of fixtures) {
  if (!fs.existsSync(path.join(FIXTURES_DIR, f))) fail(`unknown fixture: ${f}`)
}

function runOpencode(cwd, model, agentName, prompt, timeoutMs, filtering) {
  return new Promise((resolve) => {
    const child = spawn(
      "opencode",
      ["run", "-m", model, "--agent", agentName, "--auto", "--format", "json", prompt],
      // OpenCode consults PWD for project resolution and waits if inherited stdin
      // remains open, so both must describe a headless child process explicitly.
      // OPENRELAY_FILTERING opts the plugin's Stage 2 tool-output filter in or out.
      { cwd, env: { ...process.env, PWD: cwd, OPENRELAY_FILTERING: filtering }, stdio: ["ignore", "pipe", "pipe"] },
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
function prepareWorkspace(fixturePath, workspace) {
  const isRepo = fs.existsSync(path.join(fixturePath, ".git"))
  if (isRepo) {
    const r = spawnSync("git", ["clone", "--quiet", fixturePath, workspace])
    return { ok: r.status === 0, stderr: r.stderr?.toString() }
  }
  try {
    fs.cpSync(fixturePath, workspace, { recursive: true })
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

async function main() {
  const summary = []
  for (const fixture of fixtures) {
    const taskMd = fs.readFileSync(path.join(FIXTURES_DIR, fixture, "TASK.md"), "utf8")
    for (let i = 1; i <= runs; i++) {
      const runDir = path.join(RESULTS_DIR, args.label, fixture, `run-${String(i).padStart(2, "0")}`)
      fs.mkdirSync(runDir, { recursive: true })
      const workspace = path.join(runDir, "workspace")
      fs.rmSync(workspace, { recursive: true, force: true })

      const clone = prepareWorkspace(path.join(FIXTURES_DIR, fixture), workspace)
      if (!clone.ok) {
        fail(`workspace prep failed for ${fixture}: ${clone.stderr}`)
      }

      console.log(`[${args.label}] ${fixture} run ${i}/${runs} ...`)
      const startedAt = new Date().toISOString()
      const startMs = Date.now()

      let oc = { code: null, stdout: "", stderr: "", timedOut: false }
      if (args.dryRun) {
        oc.code = 0
      } else {
        oc = await runOpencode(workspace, args.model, agent, taskMd, timeoutSec * 1000, filtering)
      }
      const durationMs = Date.now() - startMs
      const endedAt = new Date().toISOString()

      if (oc.stdout) fs.writeFileSync(path.join(runDir, "opencode-output.jsonl"), oc.stdout)
      if (oc.stderr) fs.writeFileSync(path.join(runDir, "opencode-stderr.log"), oc.stderr)

      const sessionMatch = oc.stdout.match(/"sessionID":"([^"]+)"/)
      const sessionID = sessionMatch ? sessionMatch[1] : null

      const verify = spawnSync("node", ["verify.js"], { cwd: workspace, encoding: "utf8", timeout: 30000 })
      const verifyPass = verify.status === 0
      const verifyTail = ((verify.stdout ?? "") + (verify.stderr ?? "")).trim().split("\n").slice(-5).join(" | ").slice(0, 400)

      const diffStat = spawnSync("git", ["-C", workspace, "diff", "--stat"], { encoding: "utf8" }).stdout.trim()
      const changed = spawnSync("git", ["-C", workspace, "status", "--porcelain"], { encoding: "utf8" }).stdout.trim()

      const record = {
        fixture,
        label: args.label,
        run: i,
        model: args.model,
        agent,
        filtering,
        dryRun: Boolean(args.dryRun),
        startedAt,
        endedAt,
        durationMs,
        timedOut: oc.timedOut,
        opencodeExitCode: oc.code,
        sessionID,
        verifyPass,
        verifyTail,
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
  console.log(`\nsummary: ${passes}/${summary.length} verify PASS across ${fixtures.length} fixture(s)`)
}

main().catch((e) => fail(e.stack))
