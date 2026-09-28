#!/usr/bin/env node
import { benchmarkRoot, repositoryRoot } from "../../lib/paths.mjs"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { discover } from "./coverage-prototype.mjs"
import { packet } from "./coverage-v2.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = repositoryRoot
const dev = process.argv.includes("--development")
const spec = path.join(here, dev ? "coverage-heldout-tasks.json" : "coverage-v2-holdout.json")
const archive = path.join(repo, "docs/stage5/coverage-source-snapshot.tar.gz")
const hash = p => createHash("sha256").update(fs.readFileSync(p)).digest("hex")
if (!dev) {
  if (hash(path.join(here, "coverage-v2.mjs")) !== "62760b10778f1cb767539ee4512ad3c0c914249f65499a036e61c501d1f8c7cf") throw Error("ranker changed after preregistration")
  if (hash(spec) !== "40b8873df8a5989619cebc3fbdb8e9852b4a42d226ba3f9d175aa9f0628479e3") throw Error("task labels changed after preregistration")
  if (hash(archive) !== "f6456eac3bb5ae4c0ab30bc838ce2f0dceafbcd7d39e3155e9b1b55e9cca6b99") throw Error("source snapshot changed")
}
const tasks = JSON.parse(fs.readFileSync(spec, "utf8"))
const stage = fs.mkdtempSync(path.join(os.tmpdir(), "openrelay-coverage-eval-"))
try {
  const extract = spawnSync("tar", ["-xzf", archive, "-C", stage], { encoding: "utf8" })
  if (extract.status !== 0) throw Error(extract.stderr || "snapshot extraction failed")
  const rows = []
  for (const item of tasks) {
    const labels = dev ? item.required.map(file => ({ file })) : item.required
    for (const label of labels) {
      const source = fs.readFileSync(path.join(stage, label.file), "utf8")
      if (label.span && !source.includes(label.span)) throw Error(`${item.id}: label absent from snapshot: ${label.span}`)
    }
    const baseStart = performance.now()
    const old = discover(stage, item.task, 4)
    const baselineMs = performance.now() - baseStart
    const fresh = packet(stage, item.task, 4)
    const oldFiles = old.candidates.map(x => x.file)
    const newFiles = fresh.candidates.map(x => x.file)
    rows.push({ id: item.id, required: labels, baseline: {
      ranks: labels.map(x => oldFiles.indexOf(x.file) + 1), files: oldFiles,
      prepMs: Math.round(baselineMs * 1000) / 1000 },
    revision: { ranks: labels.map(x => newFiles.indexOf(x.file) + 1),
      topFour: labels.every(x => newFiles.includes(x.file)), topTwo: labels.every(x => newFiles.slice(0, 2).includes(x.file)),
      spanCoverage: dev ? null : labels.every(x => fresh.text.includes(x.span)),
      files: newFiles, candidates: fresh.candidates, bytes: fresh.bytes, prepMs: fresh.prepMs,
      scanned: fresh.scanned, listed: fresh.listed, bytesRead: fresh.bytesRead, truncated: fresh.truncated } })
  }
  const times = rows.map(x => x.revision.prepMs).sort((a, b) => a - b)
  const medianMs = (times[4] + times[5]) / 2
  const summary = { tasks: rows.length, baselineTopFour: rows.filter(x => x.baseline.ranks.every(r => r > 0)).length,
    topFour: rows.filter(x => x.revision.topFour).length, topTwo: rows.filter(x => x.revision.topTwo).length,
    spans: dev ? null : rows.filter(x => x.revision.spanCoverage).length,
    maxBytes: Math.max(...rows.map(x => x.revision.bytes)), medianMs }
  const gates = dev ? null : { topFour: summary.topFour >= 8, topTwo: summary.topTwo >= 7,
    spans: summary.spans >= 8, bytes: summary.maxBytes <= 8192,
    errors: rows.length === tasks.length, latency: summary.medianMs < 250 }
  console.log(JSON.stringify({ mode: dev ? "development" : "holdout", sourceArchiveHash: hash(archive),
    baselineHash: hash(path.join(here, "coverage-prototype.mjs")), revisionHash: hash(path.join(here, "coverage-v2.mjs")),
    taskHash: hash(spec), summary, gates, advance: gates && Object.values(gates).every(Boolean), rows }, null, 2))
} finally { fs.rmSync(stage, { recursive: true, force: true }) }
