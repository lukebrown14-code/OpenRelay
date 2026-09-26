#!/usr/bin/env node
import { benchmarkRoot, repositoryRoot } from "../../lib/paths.mjs"
// Sequentially execute the next frozen pilot wave; stop on any anomaly.
import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const manifest = JSON.parse(fs.readFileSync(path.join(repositoryRoot, "docs/stage7/pilot-manifest.json"), "utf8"))
const wave = process.argv[2]
if (!["main-1", "main-2", "aa"].includes(wave)) throw new Error("usage: node run-stage7-batch.mjs main-1|main-2|aa")
for (const spec of manifest.schedule) {
  if (wave === "aa" ? spec.phase !== "aa" : spec.phase !== "main" || spec.rep !== Number(wave.slice(-1))) continue
  const resultFile = path.join(benchmarkRoot, "results", manifest.label, spec.id, "run.json")
  if (fs.existsSync(resultFile)) {
    const existing = JSON.parse(fs.readFileSync(resultFile, "utf8"))
    if (existing.status !== "pass" || !existing.usageComplete) throw new Error(`existing result needs review: ${spec.id}`)
    console.log(`already complete: ${spec.id}`)
    continue
  }
  console.log(`starting ${spec.id}`)
  const r = spawnSync(process.execPath, [path.join(here, "run-stage7.mjs"), "--id", spec.id, "--run"], { stdio: "inherit", timeout: 620000 })
  if (r.status !== 0 || r.error) throw new Error(`runner stopped at ${spec.id}: ${r.error?.message ?? r.status}`)
  const result = JSON.parse(fs.readFileSync(resultFile, "utf8"))
  if (result.status !== "pass" || !result.usageComplete) throw new Error(`pilot paused at ${spec.id}: ${result.status}`)
}
