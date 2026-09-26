#!/usr/bin/env node
// Experimental retrieval only. Frozen v3 and the first prototype are unchanged.
import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"

const STOP = new Set("a an and are as at be by can do does for from has have in into is it its of on or our the their this to use using via was were while with without your you after before all each new now same still both that these those must should not no only run node verify js task fix update add keep preserve existing current legacy code file files src ui api web test tests".split(" "))
const SKIP = new Set(["node_modules", "dist", "build", "coverage", "test", "tests", "__tests__", "legacy", "archive", "results", "solutions"])
const HARNESS = new Set(["TASK.md", "ground-truth.json", "meta.json", "verify.js", "setup.mjs", "package.json", "package-lock.json", "bun.lock"])

function tokens(s) {
  return s.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !STOP.has(w)).map(w => {
    if (w.endsWith("ies")) return w.slice(0, -3) + "y"
    if (w.endsWith("ery") && w.length > 6) return w.slice(0, -3) + "er"
    if (w.endsWith("age") && w.length > 6) return w.slice(0, -3)
    if (w.endsWith("ing") && w.length > 6) return w.slice(0, -3)
    if (w.endsWith("ed") && w.length > 5) return w.slice(0, -2)
    if (w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1)
    if (w.endsWith("e") && w.length > 4) return w.slice(0, -1)
    return w
  })
}
const counts = xs => { const m = new Map(); for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1); return m }
const safe = rel => {
  const parts = rel.split("/")
  return !parts.some(x => x.startsWith(".") || SKIP.has(x)) && !HARNESS.has(parts.at(-1)) &&
    !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(rel) && /\.(?:[cm]?[jt]sx?|py|rs|html|css)$/.test(rel)
}

function list(base, query) {
  const r = spawnSync("rg", ["--files", "--sort", "path"], { cwd: base, encoding: "utf8", timeout: 4000, maxBuffer: 1024 * 1024 })
  if (r.status !== 0 && r.status !== 1) throw Error(`rg listing failed: ${r.status}`)
  const paths = r.stdout.split("\n").filter(Boolean).filter(safe)
  if (paths.length > 5000) throw Error("file map exceeds 5000 paths")
  const q = new Set(query)
  paths.sort((a, b) => {
    const score = p => [...new Set(tokens(p))].filter(t => q.has(t)).length
    return score(b) - score(a) || a.localeCompare(b)
  })
  const files = []
  let bytes = 0
  for (const rel of paths) {
    if (files.length >= 500) break
    try {
      const abs = path.join(base, rel)
      const st = fs.lstatSync(abs)
      if (!st.isFile() || st.size > 256 * 1024 || bytes + st.size > 4 * 1024 * 1024) continue
      const buf = fs.readFileSync(abs)
      if (buf.includes(0)) continue
      bytes += buf.length
      files.push({ file: rel, text: buf.toString("utf8") })
    } catch { /* unreadable files are omitted */ }
  }
  return { files, listed: paths.length, scanned: files.length, bytesRead: bytes, truncated: paths.length > files.length }
}

function dependencies(file, text, known) {
  const found = new Set()
  for (const m of text.matchAll(/(?:from\s*|import\s*|require\s*\(|import\s*\()\s*["'](\.{1,2}\/[^"']+)["']/g)) {
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), m[1]))
    for (const p of [target, `${target}.ts`, `${target}.tsx`, `${target}.js`, `${target}.mjs`, `${target}.py`, path.posix.join(target, "index.ts"), path.posix.join(target, "index.js")]) if (known.has(p)) found.add(p)
  }
  return found
}

function fieldScore(query, field, avg, nDocs, df, weight) {
  const tf = counts(field)
  let score = 0
  for (const term of query) {
    const count = tf.get(term) ?? 0
    if (!count) continue
    const idf = Math.log(1 + (nDocs - (df.get(term) ?? 0) + .5) / ((df.get(term) ?? 0) + .5))
    score += weight * idf * (count * 2.2 / (count + 1.2 * (.25 + .75 * field.length / Math.max(avg, 1))))
  }
  return score
}

export function rank(base, task, limit = 4) {
  const query = [...new Set(tokens(task))]
  const listing = list(base, query)
  const known = new Set(listing.files.map(x => x.file))
  const docs = listing.files.map(({ file, text }) => {
    const lines = text.replace(/\r\n/g, "\n").split("\n")
    const declarations = lines.filter(x => /\b(?:export|function|class|interface|const|def|fn|pub|module)\b/.test(x)).join("\n")
    return { file, lines, pathTerms: tokens(file), declarationTerms: tokens(declarations), bodyTerms: tokens(text), deps: dependencies(file, text, known) }
  })
  const n = docs.length
  const avg = key => docs.reduce((s, d) => s + d[key].length, 0) / Math.max(n, 1)
  const avgs = { pathTerms: avg("pathTerms"), declarationTerms: avg("declarationTerms"), bodyTerms: avg("bodyTerms") }
  const df = new Map(query.map(term => [term, docs.filter(d => d.pathTerms.includes(term) || d.declarationTerms.includes(term) || d.bodyTerms.includes(term)).length]))
  const lexical = docs.map(d => ({ ...d, lexical:
    fieldScore(query, d.pathTerms, avgs.pathTerms, n, df, 4) +
    fieldScore(query, d.declarationTerms, avgs.declarationTerms, n, df, 2) +
    fieldScore(query, d.bodyTerms, avgs.bodyTerms, n, df, 1) }))
    .sort((a, b) => b.lexical - a.lexical || a.file.localeCompare(b.file))
  const seeds = lexical.filter(d => d.lexical > 0).slice(0, 4)
  const ranked = lexical.map(d => {
    let bonus = 0
    for (const seed of seeds) if (seed.file !== d.file && (seed.deps.has(d.file) || d.deps.has(seed.file))) bonus = Math.max(bonus, Math.min(seed.lexical * .25, 2))
    return { ...d, score: d.lexical + bonus, neighborBonus: bonus }
  }).filter(d => d.score > 0).sort((a, b) => b.score - a.score || a.file.localeCompare(b.file))
  return { candidates: ranked.slice(0, limit), ...Object.fromEntries(["listed", "scanned", "bytesRead", "truncated"].map(k => [k, listing[k]])) }
}

function lineOrder(doc, query) {
  const q = new Set(query)
  const weights = doc.lines.map((line, i) => {
    const overlap = [...new Set(tokens(line))].filter(x => q.has(x)).length
    return { i, score: overlap * 10 + (/\b(?:export|function|class|interface|def|fn|pub)\b/.test(line) ? 2 : 0) }
  })
  const anchors = weights.filter(x => x.score > 0).sort((a, b) => b.score - a.score || a.i - b.i).slice(0, 12)
  const ordered = []
  const seen = new Set()
  for (const { i } of anchors) for (const j of [i, i - 1, i + 1, i - 2, i + 2]) if (j >= 0 && j < doc.lines.length && !seen.has(j)) { seen.add(j); ordered.push(j) }
  for (let i = 0; i < doc.lines.length; i++) if (!seen.has(i)) ordered.push(i)
  return ordered
}

export function packet(base, task, limit = 4) {
  const start = performance.now()
  const found = rank(base, task, limit)
  const query = [...new Set(tokens(task))]
  const entries = found.candidates.map(d => ({ file: d.file, lines: d.lines, order: lineOrder(d, query), selected: new Set(), contentBytes: 0, score: d.score }))
  const render = () => ["[CONTROLLER CONTEXT — prepared evidence, read-only]", "[SOURCE EXCERPTS]",
    ...entries.filter(e => e.selected.size).flatMap(e => [`// ${e.file}`,
      [...e.selected].sort((a, b) => a - b).map(i => `${i + 1}| ${e.lines[i]}`).join("\n")]), "[END CONTROLLER CONTEXT]"].join("\n")
  const add = (e, cap) => {
    for (const i of e.order) {
      if (e.selected.has(i)) continue
      const line = `${i + 1}| ${e.lines[i]}`
      const cost = Buffer.byteLength(line) + 1
      if (e.contentBytes + cost > cap) continue
      e.selected.add(i)
      if (Buffer.byteLength(render()) > 8192) { e.selected.delete(i); continue }
      e.contentBytes += cost
    }
  }
  for (const e of entries) add(e, 1024)
  for (const e of entries) add(e, 3072)
  const text = render()
  return { text, bytes: Buffer.byteLength(text), candidates: entries.map(e => ({ file: e.file, contentBytes: e.contentBytes,
    lineNumbers: [...e.selected].sort((a, b) => a - b).map(i => i + 1), score: e.score })),
    scanned: found.scanned, listed: found.listed, bytesRead: found.bytesRead, truncated: found.truncated,
    prepMs: Math.round((performance.now() - start) * 1000) / 1000 }
}
