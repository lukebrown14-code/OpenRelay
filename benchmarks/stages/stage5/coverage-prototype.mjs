#!/usr/bin/env node
import { benchmarkRoot, repositoryRoot } from "../../lib/paths.mjs"
// Offline candidate-discovery experiment. Ground truth is read only after ranking.
// This file is deliberately outside the plugin; no live packet behavior changes.
import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath, pathToFileURL } from "node:url"

const root = benchmarkRoot
const fixtureRoot = path.join(benchmarkRoot, "fixtures")
const stop = new Set("a an and are as at be by can do does for from has have in into is it its of on or our the their this to use using via was were while with without your you after before all each new now same still both that these those must should not no only run node verify js task fix update add keep preserve existing current legacy code file files src ui api web test tests".split(" "))
const maxFilesScanned = 500
const maxPathsListed = 5000
const maxBytesRead = 4 * 1024 * 1024
const maxFileBytes = 256 * 1024

function words(text) {
  return [...new Set(text.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !stop.has(w)).map(w => w.endsWith("ies") ? w.slice(0, -3) + "y" : w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w))]
}

function safeFile(base, file) {
  const rel = path.relative(base, file)
  const parts = rel.split(path.sep)
  if (parts.some(p => p.startsWith(".") || ["node_modules", "dist", "build", "coverage", "test", "tests", "__tests__", "legacy", "archive"].includes(p))) return false
  if (["TASK.md", "ground-truth.json", "meta.json", "verify.js", "setup.mjs", "package.json", "package-lock.json", "bun.lock"].includes(path.basename(file))) return false
  if (/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file)) return false
  return /\.(?:[cm]?[jt]sx?|py|rs|html|css)$/.test(file)
}

function sourceFiles(base, query) {
  const files = []
  let bytes = 0
  const listing = spawnSync("rg", ["--files", "--sort", "path", "--glob", "!**/results/**", "--glob", "!**/node_modules/**", "--glob", "!**/dist/**"],
    { cwd: base, encoding: "utf8", timeout: 4000, maxBuffer: 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] })
  if (listing.status !== 0 && listing.status !== 1) throw Error(`rg file listing failed: ${listing.status}`)
  const paths = listing.stdout.split("\n").filter(Boolean).filter(rel => safeFile(base, path.join(base, rel)))
  if (paths.length > maxPathsListed) throw Error(`file map exceeds ${maxPathsListed} source paths`)
  const rankPath = rel => {
    const w = new Set(words(rel))
    return query.reduce((n, term) => n + Number(w.has(term)), 0)
  }
  paths.sort((a, b) => rankPath(b) - rankPath(a) || a.localeCompare(b))
  for (const rel of paths) {
    if (files.length >= maxFilesScanned) break
    const abs = path.join(base, rel)
    try {
      if (fs.lstatSync(abs).isSymbolicLink()) continue
      const size = fs.statSync(abs).size
      if (size > maxFileBytes || bytes + size > maxBytesRead) continue
      const content = fs.readFileSync(abs)
      if (content.includes(0)) continue
      bytes += size
      files.push({ file: rel.split(path.sep).join("/"), text: content.toString("utf8") })
    } catch { continue }
  }
  return { files, bytes, listed: paths.length, truncated: paths.length > files.length }
}

function importsOf(file, text, known) {
  const deps = new Set()
  for (const m of text.matchAll(/(?:from\s*|import\s*|require\s*\(|import\s*\()\s*["'](\.{1,2}\/[^"']+)["']/g)) {
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), m[1]))
    for (const candidate of [target, `${target}.js`, `${target}.ts`, `${target}.py`, path.posix.join(target, "index.js")]) {
      if (known.has(candidate)) deps.add(candidate)
    }
  }
  return deps
}

export function discover(base, task, limit = 4) {
  const query = words(task)
  const { files, bytes, listed, truncated } = sourceFiles(base, query)
  const known = new Set(files.map(x => x.file))
  const doc = files.map(({ file, text }) => ({ file, text, pathWords: new Set(words(file)), bodyWords: new Set(words(text)), deps: importsOf(file, text, known) }))
  const df = new Map(query.map(w => [w, doc.filter(x => x.pathWords.has(w) || x.bodyWords.has(w)).length]))
  const lexical = doc.map(x => {
    let score = 0
    for (const w of query) {
      const idf = Math.log(1 + (doc.length + 1) / ((df.get(w) ?? 0) + 1))
      if (x.pathWords.has(w)) score += 3 * idf
      if (x.bodyWords.has(w)) score += idf
    }
    return { ...x, score }
  }).sort((a, b) => b.score - a.score || a.file.localeCompare(b.file))
  // One hop from the three strongest lexical anchors. An import edge is concrete
  // repository evidence; its neighbor receives a bounded bonus, not a free slot.
  const seeds = lexical.filter(x => x.score > 0).slice(0, 3)
  const boosted = lexical.map(x => {
    let bonus = 0
    for (const seed of seeds) {
      if (seed.file !== x.file && (seed.deps.has(x.file) || x.deps.has(seed.file))) bonus = Math.max(bonus, Math.min(seed.score * .45, 3))
    }
    return { file: x.file, score: Math.round((x.score + bonus) * 1000) / 1000, lexical: Math.round(x.score * 1000) / 1000, neighborBonus: Math.round(bonus * 1000) / 1000 }
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score || a.file.localeCompare(b.file))
  return { candidates: boosted.slice(0, limit), scanned: files.length, listed, truncated, bytesRead: bytes, query }
}

export function evaluate(fixtures = fs.readdirSync(fixtureRoot).filter(x => /^(?:0[1-9]|1[0-9]|2[01])-/.test(x)).sort()) {
  return fixtures.map(name => {
    const base = path.join(fixtureRoot, name)
    const task = fs.readFileSync(path.join(base, "TASK.md"), "utf8")
    const result = discover(base, task)
    const ground = path.join(base, "ground-truth.json")
    const gt = fs.existsSync(ground) ? JSON.parse(fs.readFileSync(ground, "utf8")) : null
    const selected = result.candidates.map(x => x.file)
    return { fixture: name, ...result, required: gt?.required ?? null,
      requiredFound: gt?.required?.filter(x => selected.includes(x)) ?? null,
      fullRecall: gt ? gt.required.every(x => selected.includes(x)) : null }
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(evaluate(), null, 2))
