#!/usr/bin/env node
import { benchmarkRoot, repositoryRoot } from "../../lib/paths.mjs"
// Resume only after the separately labeled r2 first pair passed mechanics.
import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { sourceHash } from "../../../scripts/relay-runtime.mjs"
import { analyzeDisk } from "./analyze-21.mjs"

const dir = benchmarkRoot
const repo = repositoryRoot
const fixtureRoot = path.join(benchmarkRoot, "fixtures/21-dependency-upgrade")
const fixtureHash = () => {
  const h = createHash("sha256")
  const visit = base => {
    for (const name of fs.readdirSync(base).sort()) {
      const p = path.join(base, name)
      if (fs.lstatSync(p).isDirectory()) visit(p)
      else { h.update(path.relative(fixtureRoot, p)); h.update(fs.readFileSync(p)) }
    }
  }
  visit(fixtureRoot)
  return h.digest("hex")
}
const frozen = () => {
  if (`dev-${sourceHash(repo).slice(0, 12)}` !== "dev-b0daed6452e3") throw Error("plugin build changed")
  if (fixtureHash() !== "03170bb8b03bde495ecd0e1e0e6ed2a2c401af85b744ad3b758fdc49a90d6a32") throw Error("fixture changed")
}
const schedule = ["AA", "B", "A", "A", "B", "B", "A", "A", "B", "AA"]
const labels = { A: "stage5-21-confirm-r2-a", B: "stage5-21-confirm-r2-b", AA: "stage5-21-confirm-r2-aa" }

frozen()
const first = analyzeDisk({ firstPair: true })
if (!first.valid) throw Error("first pair failed mechanics")
for (const [index, arm] of schedule.entries()) {
  frozen()
  const args = ["run.mjs", "--fixture", "21-dependency-upgrade", "--runs", "1", "--model", "zai-coding-plan/glm-5.3",
    "--label", labels[arm], "--agent", "build", "--filtering", "on", "--route", "off", "--escalate", "off",
    "--context", arm === "B" ? "on" : "off", "--append", "--capture-context"]
  console.log(`confirmation remaining ${index + 1}/${schedule.length}: ${arm}`, { flush: true })
  const call = spawnSync(process.execPath, args, { cwd: dir, stdio: "inherit" })
  if (call.status !== 0) throw Error(`runner failed at ${arm} ${index + 1}`)
  const progress = analyzeDisk({ progress: true })
  if (!progress.valid) throw Error(`mechanics or verification failed at ${arm} ${index + 1}: ${JSON.stringify(progress.rows)}`)
  const latest = progress.rows[arm].at(-1)
  console.log(`checked ${arm}: ${latest.tokens} coding input+cacheRead, ${latest.rounds} rounds, ${latest.totalDurationSec}s task duration`)
}
console.log("all confirmation calls completed; run node benchmarks/stages/stage5/analyze-21.mjs")
