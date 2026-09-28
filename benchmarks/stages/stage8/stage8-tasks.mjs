#!/usr/bin/env node
import { benchmarkRoot, repositoryRoot } from "../../lib/paths.mjs"
// Prepare/verify isolated Stage 8 coding tasks from the frozen source snapshots.
// This script never launches a model.
import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const root = repositoryRoot
const taskRoot = path.join(here, "tasks")
const manifest = JSON.parse(fs.readFileSync(path.join(repositoryRoot, "docs/stage8/source-manifest.json"), "utf8"))
const tasks = JSON.parse(fs.readFileSync(path.join(taskRoot, "tasks.json"), "utf8")).tasks
const [action, id] = process.argv.slice(2)
if (!["--prepare", "--verify", "--baseline"].includes(action) || !id) throw new Error("usage: node benchmarks/stages/stage8/stage8-tasks.mjs <--prepare|--verify|--baseline> <task-id>")
const task = tasks.find(t => t.id === id)
if (!task) throw new Error(`unknown task: ${id}`)
const snapshot = path.join(benchmarkRoot, "results/stage8-snapshots", task.repository)
const workspace = path.join(benchmarkRoot, "results/stage8-workspaces", id)
const record = manifest.repositories.find(r => r.name === task.repository)
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex")
for (const file of record.files) {
  const full = path.join(snapshot, file.path)
  if (!fs.existsSync(full) || hash(fs.readFileSync(full)) !== file.sha256) throw new Error(`snapshot mismatch: ${file.path}`)
}

function command(bin, args, cwd, env = process.env) {
  return spawnSync(bin, args, { cwd, env, stdio: "inherit" })
}

function prepare() {
  if (fs.existsSync(workspace)) throw new Error(`workspace exists: ${workspace}`)
  fs.mkdirSync(path.dirname(workspace), { recursive: true })
  fs.cpSync(snapshot, workspace, { recursive: true, errorOnExist: true })
  fs.copyFileSync(path.join(taskRoot, id, "TASK.md"), path.join(workspace, "TASK.md"))
  for (const args of [["init", "-q"], ["add", "-A"], ["-c", "user.email=stage8@local", "-c", "user.name=Stage 8", "commit", "-qm", "frozen baseline"]]) {
    const result = command("git", args, workspace)
    if (result.status !== 0) throw new Error(`git ${args[0]} failed`)
  }
  console.log(workspace)
}

function verify() {
  if (!fs.existsSync(workspace)) throw new Error(`workspace missing: ${workspace}`)
  const env = { ...process.env, STAGE8_WORKSPACE: workspace }
  let result
  if (task.language === "typescript") result = command("bun", [path.join(taskRoot, task.verifier)], workspace, env)
  else {
    env.PYTHONPATH = workspace
    env.PYTHONDONTWRITEBYTECODE = "1"
    result = command("/Users/luke/src/Delta/.venv/bin/python", [path.join(taskRoot, task.verifier)], workspace, env)
  }
  if (result.error) throw result.error
  return result.status ?? 1
}

if (action === "--prepare") prepare()
else if (action === "--verify") process.exitCode = verify()
else {
  prepare()
  const status = verify()
  if (status === 0) throw new Error("baseline unexpectedly passes new contract")
  console.log(`EXPECTED_BASELINE_FAIL ${id} exit=${status}`)
}
