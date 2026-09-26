#!/usr/bin/env node
import { benchmarkRoot, repositoryRoot } from "../../../lib/paths.mjs"
// Deterministic, zero-model addressability comparison on frozen source trees.
import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { fileURLToPath } from "node:url"
import { buildGraph, rankMap, renderMap } from "./map.mjs"

const root = repositoryRoot
const labelsFile = path.join(repositoryRoot, "benchmarks/stages/stage8/map/tasks-24.json")
const labels = JSON.parse(fs.readFileSync(labelsFile, "utf8"))
const source = JSON.parse(fs.readFileSync(path.join(repositoryRoot, "docs/stage8/source-manifest.json"), "utf8"))
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex")
const graphs = new Map(source.repositories.map(repo => [repo.name, buildGraph(path.join(repositoryRoot, "benchmarks/results/stage8-snapshots", repo.name), repo.files.map(f => f.path))]))
const rows = []
for (const task of labels.tasks) {
  const graph = graphs.get(task.repository)
  if (!graph) throw new Error(`unknown repository: ${task.repository}`)
  for (const ref of task.required) {
    const node = graph.byFile.get(ref.file)
    if (!node || !node.symbols.some(s => s.name === ref.symbol)) throw new Error(`bad label: ${task.id} ${ref.file}#${ref.symbol}`)
  }
  const mapped = renderMap(graph, task.prompt)
  const lexical = rankMap(graph, task.prompt, graph.nodes.length).sort((a, b) => b.direct - a.direct || a.file.localeCompare(b.file)).slice(0, 8).map(n => n.file)
  rows.push({ id: task.id, split: task.split, repository: task.repository, required: task.required,
    mapFiles: mapped.files, lexicalFiles: lexical,
    mapRequired: task.required.filter(r => mapped.files.includes(r.file)).map(r => r.file),
    lexicalRequired: task.required.filter(r => lexical.includes(r.file)).map(r => r.file),
    mapSymbols: task.required.filter(r => mapped.text.includes(`${r.symbol}:`) && mapped.files.includes(r.file)).map(r => `${r.file}#${r.symbol}`),
    mapBytes: mapped.bytes, mapPrepMs: mapped.prepMs })
}
const summary = Object.fromEntries(["dev", "holdout", "all"].map(split => {
  const cases = split === "all" ? rows : rows.filter(r => r.split === split)
  const refs = cases.reduce((n, r) => n + r.required.length, 0)
  return [split, { cases: cases.length, requiredRefs: refs,
    mapFileRecall: cases.reduce((n, r) => n + r.mapRequired.length, 0) / refs,
    lexicalFileRecall: cases.reduce((n, r) => n + r.lexicalRequired.length, 0) / refs,
    mapSymbolRecall: cases.reduce((n, r) => n + r.mapSymbols.length, 0) / refs,
    fullFileCoverage: cases.filter(r => r.mapRequired.length === r.required.length).length,
    maxBytes: Math.max(...cases.map(r => r.mapBytes)),
    maxRenderMs: Math.max(...cases.map(r => r.mapPrepMs)) }]
}))
const result = { schemaVersion: 1, labelsSha256: sha(fs.readFileSync(labelsFile)),
  sourceTrees: Object.fromEntries(source.repositories.map(r => [r.name, r.treeSha256])),
  graph: Object.fromEntries([...graphs].map(([name, graph]) => [name, { files: graph.nodes.length, prepMs: graph.prepMs }])),
  summary, rows }
console.log(JSON.stringify(result, null, 2))
