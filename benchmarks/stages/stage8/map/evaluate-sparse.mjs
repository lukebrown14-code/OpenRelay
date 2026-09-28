#!/usr/bin/env node
import { benchmarkRoot, repositoryRoot } from "../../../lib/paths.mjs"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { buildGraph } from "./map.mjs"
import { renderSparseMap } from "./sparse.mjs"
import { renderLocatorMap } from "./locator.mjs"
import { renderDiverseMap } from "./diverse.mjs"
import { renderOwnerMap } from "./role-map.mjs"

const render = process.argv.includes("--owner") ? renderOwnerMap : process.argv.includes("--diverse") ? renderDiverseMap : process.argv.includes("--locator5") ? (graph, task) => renderLocatorMap(graph, task, 650, 5) : process.argv.includes("--locator") ? renderLocatorMap : renderSparseMap

const root = repositoryRoot
const labels = JSON.parse(fs.readFileSync(path.join(repositoryRoot, "benchmarks/stages/stage8/map/tasks-24.json")))
const source = JSON.parse(fs.readFileSync(path.join(repositoryRoot, "docs/stage8/source-manifest.json")))
const graphs = new Map(source.repositories.map(repo => [repo.name, buildGraph(path.join(repositoryRoot, "benchmarks/results/stage8-snapshots", repo.name), repo.files.map(f => f.path))]))
const rows = labels.tasks.map(task => {
  const mapped = render(graphs.get(task.repository), task.prompt)
  return { id: task.id, split: task.split, bytes: mapped.bytes, abstained: mapped.abstained,
    edge: mapped.edge ?? null, files: mapped.files,
    requiredFound: task.required.filter(r => mapped.files.includes(r.file)).map(r => r.file),
    fullCoverage: task.required.every(r => mapped.files.includes(r.file)) }
})
const summaries = Object.fromEntries(["dev", "holdout", "all"].map(split => {
  const group = split === "all" ? rows : rows.filter(r => r.split === split)
  return [split, { cases: group.length, fullCoverage: group.filter(r => r.fullCoverage).length,
    abstentions: group.filter(r => r.abstained).length,
    requiredFileRecall: group.reduce((n, r) => n + r.requiredFound.length, 0) / (2 * group.length),
    maxBytes: Math.max(...group.map(r => r.bytes)) }]
}))
const corpus = JSON.parse(fs.readFileSync(path.join(repositoryRoot, "benchmarks/stages/stage8/tasks/tasks.json")))
const live = corpus.tasks.filter(t => ["delta-config-writeback", "or-packet-path-identity", "delta-market-dependencies"].includes(t.id)).map(t => {
  const prompt = fs.readFileSync(path.join(repositoryRoot, "benchmarks/stages/stage8/tasks", t.id, "TASK.md"), "utf8")
  const mapped = render(graphs.get(t.repository), prompt)
  return { id: t.id, bytes: mapped.bytes, abstained: mapped.abstained, edge: mapped.edge ?? null, text: mapped.text }
})
console.log(JSON.stringify({ schemaVersion: 1, summaries, live, rows }, null, 2))
