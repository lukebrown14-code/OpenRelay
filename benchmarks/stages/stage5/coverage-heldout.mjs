#!/usr/bin/env node
import { benchmarkRoot, repositoryRoot } from "../../lib/paths.mjs"
// Run once against the preregistered OpenRelay location tasks. No model calls.
import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { discover } from "./coverage-prototype.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = repositoryRoot
const tasks = JSON.parse(fs.readFileSync(path.join(here, "coverage-heldout-tasks.json"), "utf8"))
const hash = file => createHash("sha256").update(fs.readFileSync(file)).digest("hex")
const prototypeHash = hash(path.join(here, "coverage-prototype.mjs"))
if (prototypeHash !== "b89188c9523107fcf5b2f710059df9beb424ba45822883fb8a4d94c35e0b6252") throw Error("frozen prototype changed")

const listed = spawnSync("rg", ["--files", "--sort", "path", "--glob", "!**/results/**", "--glob", "!**/node_modules/**", "--glob", "!**/dist/**"],
  { cwd: repo, encoding: "utf8", timeout: 4000, maxBuffer: 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] })
if (listed.status !== 0) throw Error("corpus listing failed")
const corpusHash = createHash("sha256")
const sourcePaths = listed.stdout.split("\n").filter(p => /\.(?:[cm]?[jt]sx?|py|rs|html|css)$/.test(p) && !/(?:^|\/)(?:test|tests|__tests__|results|node_modules|dist|legacy|archive)\//.test(p))
for (const rel of sourcePaths) {
  corpusHash.update(rel)
  corpusHash.update(fs.readFileSync(path.join(repo, rel)))
}

function numberedBytes(text) {
  return text.replace(/\r\n/g, "\n").split("\n").map((line, i) => `${i + 1}| ${line}`)
}
function budgetOrder(candidates) {
  let left = 8192
  const included = []
  const excerptBytes = {}
  for (const c of candidates) {
    if (left <= 0) break
    const lines = numberedBytes(fs.readFileSync(path.join(repo, c.file), "utf8"))
    const budget = Math.min(3072, left)
    let used = 0
    for (const line of lines) {
      const size = Buffer.byteLength(line) + 1
      if (size > budget) continue
      if (used + size > budget) break
      used += size
    }
    if (used > 0) { included.push(c.file); excerptBytes[c.file] = used; left -= used }
  }
  return { included, excerptBytes, totalExcerptBytes: 8192 - left }
}

const rows = []
for (const task of tasks) {
  const start = performance.now()
  const result = discover(repo, task.task, 4)
  const prepMs = Math.round((performance.now() - start) * 1000) / 1000
  const candidateFiles = result.candidates.map(c => c.file)
  const budget = budgetOrder(result.candidates)
  rows.push({ id: task.id, required: task.required, requiredRanks: task.required.map(f => candidateFiles.indexOf(f) + 1),
    topTwoRecall: task.required.every(f => candidateFiles.slice(0, 2).includes(f)),
    topFourRecall: task.required.every(f => candidateFiles.includes(f)),
    budgetRecall: task.required.every(f => budget.included.includes(f)),
    candidates: result.candidates, candidateFiles,
    candidateSourceBytes: result.candidates.map(c => fs.statSync(path.join(repo, c.file)).size),
    ...budget, scanned: result.scanned, listed: result.listed, truncated: result.truncated,
    bytesRead: result.bytesRead, prepMs })
}
const times = rows.map(r => r.prepMs).sort((a, b) => a - b)
const medianPrepMs = (times[4] + times[5]) / 2
const gates = { topFourAndBudget: rows.filter(r => r.topFourRecall && r.budgetRecall).length >= 8,
  topTwo: rows.filter(r => r.topTwoRecall).length >= 7,
  noFileMapError: rows.length === tasks.length,
  medianPrepMs: medianPrepMs < 250 }
console.log(JSON.stringify({ prototypeHash, taskSpecHash: hash(path.join(here, "coverage-heldout-tasks.json")),
  corpusManifestHash: corpusHash.digest("hex"), corpusSourcePaths: sourcePaths.length,
  summary: { taskCount: rows.length, topTwo: rows.filter(r => r.topTwoRecall).length,
    topFour: rows.filter(r => r.topFourRecall).length, budget: rows.filter(r => r.budgetRecall).length,
    medianPrepMs, gates, advance: Object.values(gates).every(Boolean) }, rows }, null, 2))
