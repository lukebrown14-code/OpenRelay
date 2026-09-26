#!/usr/bin/env node
import { benchmarkRoot, repositoryRoot } from "../../lib/paths.mjs"
// Freeze task prompts and independent verifiers without launching a model.
import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { fileURLToPath } from "node:url"

const root = repositoryRoot
const taskRoot = path.join(repositoryRoot, "benchmarks/stages/stage8/tasks")
const source = JSON.parse(fs.readFileSync(path.join(repositoryRoot, "docs/stage8/source-manifest.json"), "utf8"))
const tasks = JSON.parse(fs.readFileSync(path.join(taskRoot, "tasks.json"), "utf8"))
const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")
const output = {
  schemaVersion: 1,
  sourceTrees: Object.fromEntries(source.repositories.map(r => [r.name, r.treeSha256])),
  taskListSha256: hash(path.join(taskRoot, "tasks.json")),
  tasks: tasks.tasks.map(t => ({ id: t.id, repository: t.repository,
    promptSha256: hash(path.join(taskRoot, t.id, "TASK.md")),
    verifierSha256: hash(path.join(taskRoot, t.verifier)) })),
}
const file = path.join(repositoryRoot, "docs/stage8/task-corpus-manifest.json")
const encoded = JSON.stringify(output, null, 2) + "\n"
if (process.argv.includes("--verify")) {
  if (fs.readFileSync(file, "utf8") !== encoded) throw new Error("Stage 8 task corpus drift")
} else fs.writeFileSync(file, encoded)
console.log(JSON.stringify({ tasks: output.tasks.length, sourceTrees: output.sourceTrees }))
