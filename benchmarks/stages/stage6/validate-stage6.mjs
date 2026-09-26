#!/usr/bin/env node
import { benchmarkRoot, repositoryRoot } from "../../lib/paths.mjs"
// Stage 6 fixture validation (mirrors validate-stage5.mjs): pristine workspace must
// FAIL its verify.js; the reference solution must PASS. Zero model calls.
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { fileURLToPath } from "node:url"

const __dirname = benchmarkRoot
const FIXTURES_DIR = path.join(benchmarkRoot, "fixtures")
const SOLUTIONS_DIR = path.join(benchmarkRoot, "solutions")
const STRIP = ["ground-truth.json", "TASK_RECEIVER.md", "sender"]

function prepare(fixturePath, workspace) {
  fs.cpSync(fixturePath, workspace, { recursive: true })
  for (const s of STRIP) fs.rmSync(path.join(workspace, s), { recursive: true, force: true })
}

function runVerify(workspace) {
  const r = spawnSync("node", ["verify.js"], { cwd: workspace, encoding: "utf8", timeout: 30000 })
  return { pass: r.status === 0, tail: ((r.stdout ?? "") + (r.stderr ?? "")).trim().split("\n").slice(-2).join(" | ").slice(0, 200) }
}

let failures = 0
for (const name of fs.readdirSync(FIXTURES_DIR).filter((d) => /^\d\d-/.test(d) && Number(d.slice(0, 2)) >= 22)) {
  const fixturePath = path.join(FIXTURES_DIR, name)
  const solutionPath = path.join(SOLUTIONS_DIR, name)
  if (!fs.existsSync(solutionPath)) {
    console.log(`SKIP ${name}: no reference solution`)
    continue
  }
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "stage6-validate-"))
  try {
    prepare(fixturePath, ws)
    const pristine = runVerify(ws)
    if (pristine.pass) {
      console.log(`FAIL ${name}: pristine workspace unexpectedly passes`)
      failures += 1
      continue
    }
    // apply solution, re-verify
    const walk = (dir, rel = "") => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name.startsWith(".")) continue
        const full = path.join(dir, e.name)
        const rrel = rel ? `${rel}/${e.name}` : e.name
        if (e.isDirectory()) walk(full, rrel)
        else fs.copyFileSync(full, path.join(ws, rrel))
      }
    }
    walk(solutionPath)
    const solved = runVerify(ws)
    if (!solved.pass) {
      console.log(`FAIL ${name}: reference solution does not pass (${solved.tail})`)
      failures += 1
    } else {
      console.log(`PASS ${name}: pristine fails, reference solution passes`)
    }
  } finally {
    fs.rmSync(ws, { recursive: true, force: true })
  }
}
process.exit(failures ? 1 : 0)
