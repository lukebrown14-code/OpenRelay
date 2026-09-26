// Stage 5 v4 offline experiment: syntax-guided navigation and evidence packets.
import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
import ts from "typescript"
import { rank } from "./coverage-v2.mjs"

const STOP = new Set("a an and are as at be by can do does for from has have in into is it its of on or our the their this to use using via was were while with without your you after before all each new now same still both that these those must should not no only run node verify js task fix update add keep preserve existing current legacy code file files src ui api web test tests find locate wrong code function behavior request source current".split(" "))
function terms(s) {
  return [...new Set(s.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z0-9]+/).filter(x => x.length >= 3 && !STOP.has(x)).map(x => {
    if (x.endsWith("ies")) return x.slice(0, -3) + "y"
    if (x.endsWith("ing") && x.length > 6) return x.slice(0, -3)
    if (x.endsWith("ed") && x.length > 5) return x.slice(0, -2)
    if (x.endsWith("s") && !x.endsWith("ss")) return x.slice(0, -1)
    return x
  }))]
}
const overlap = (q, text) => terms(text).filter(x => q.has(x)).length
const lineOf = (source, offset) => source.getLineAndCharacterOfPosition(offset).line + 1
const isCode = file => /\.[cm]?[jt]sx?$/.test(file)
const kind = file => file.endsWith(".tsx") ? ts.ScriptKind.TSX : file.endsWith(".jsx") ? ts.ScriptKind.JSX : file.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.JS

function blocks(file, lines) {
  if (!isCode(file)) return []
  const full = lines.join("\n")
  const source = ts.createSourceFile(file, full, ts.ScriptTarget.Latest, true, kind(file))
  const result = []
  function visit(node) {
    const allowed = ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isArrowFunction(node) ||
      ts.isVariableStatement(node) || ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) || ts.isEnumDeclaration(node)
    if (allowed) {
      const name = node.name?.getText(source) ?? (ts.isVariableStatement(node)
        ? node.declarationList.declarations.map(d => d.name.getText(source)).join(" ")
        : ts.isArrowFunction(node) ? "arrow" : "")
      const from = lineOf(source, node.getStart(source))
      const to = lineOf(source, node.getEnd())
      const body = lines.slice(from - 1, to).join("\n")
      result.push({ name, from, to, body })
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return result
}

function bestBlock(d, q) {
  const options = blocks(d.file, d.lines).map(b => {
    const nameHits = overlap(q, b.name)
    const bodyHits = overlap(q, b.body)
    const density = bodyHits / Math.sqrt(Math.max(1, b.to - b.from + 1))
    return { ...b, score: nameHits * 5 + bodyHits * 1.5 + density }
  }).sort((a, b) => b.score - a.score || a.from - b.from)
  return options[0] ?? null
}

export function candidates(base, task) {
  const start = performance.now()
  const q = new Set(terms(task))
  const listed = rank(base, task, 64)
  const ranked = listed.candidates.map(d => {
    const best = bestBlock(d, q)
    const pathHits = overlap(q, d.file)
    const blockHits = best ? overlap(q, best.body) : 0
    const symbolHits = best ? overlap(q, best.name) : 0
    const score = d.score * .35 + pathHits * 2 + symbolHits * 5 + Math.min(blockHits, 6) * 2 + (best?.score ?? 0) * .5
    return { file: d.file, lines: d.lines, best, score, pathHits, blockHits, symbolHits,
      hash: createHash("sha256").update(d.lines.join("\n")).digest("hex").slice(0, 12) }
  }).sort((a, b) => b.score - a.score || a.file.localeCompare(b.file))
  const eligible = ranked.filter(x => x.symbolHits >= 1 || x.blockHits >= 2)
  return { ranked, eligible, listed: listed.listed, scanned: listed.scanned, bytesRead: listed.bytesRead,
    truncated: listed.truncated, prepMs: performance.now() - start }
}

function bestLines(entry, contentCap) {
  const b = entry.best
  if (!b) return []
  const lines = entry.lines
  const whole = Array.from({ length: b.to - b.from + 1 }, (_, i) => b.from + i)
  const render = nums => nums.map(n => `${n}| ${lines[n - 1]}`).join("\n")
  if (Buffer.byteLength(render(whole)) <= contentCap) return whole
  const q = new Set(entry.query)
  const scored = whole.map(n => ({ n, hits: overlap(q, lines[n - 1]) })).sort((a, b) => b.hits - a.hits || a.n - b.n)
  const center = scored[0]?.n ?? b.from
  let from = center, to = center
  if (Buffer.byteLength(render([center])) > contentCap) return []
  while (from > b.from || to < b.to) {
    const left = from > b.from ? from - 1 : null
    const right = to < b.to ? to + 1 : null
    const next = left !== null && (right === null || center - left <= right - center) ? [left, to] : [from, right]
    const nums = Array.from({ length: next[1] - next[0] + 1 }, (_, i) => next[0] + i)
    if (Buffer.byteLength(render(nums)) > contentCap) break
    ;[from, to] = next
  }
  return Array.from({ length: to - from + 1 }, (_, i) => from + i)
}

function renderEntry(entry, lineNumbers) {
  const meta = `// ${entry.file}:${lineNumbers[0]}-${lineNumbers.at(-1)} hash=${entry.hash} symbol=${entry.best?.name ?? "unknown"}`
  return [meta, ...lineNumbers.map(n => `${n}| ${entry.lines[n - 1]}`)].join("\n")
}

export function buildV4(base, task, mode, budget = mode === "navigation" ? 1024 : 4096) {
  const start = performance.now()
  if (!["navigation", "evidence"].includes(mode)) throw Error("invalid packet mode")
  const found = candidates(base, task)
  const entries = found.eligible.slice(0, mode === "navigation" ? 6 : 4).map(x => ({ ...x, query: terms(task) }))
  if (entries.length === 0) return { verdict: "abstain", reason: "insufficient-evidence", packet: null,
    bytes: 0, candidates: [], prepMs: performance.now() - start, listed: found.listed, scanned: found.scanned,
    bytesRead: found.bytesRead, truncated: found.truncated }
  const prefix = "[CONTROLLER CONTEXT — prepared evidence, read-only]\n"
  const suffix = "\n[END CONTROLLER CONTEXT]"
  let body = mode === "navigation" ? "[SOURCE MAP]\n" : "[SOURCE EXCERPTS]\n"
  const used = []
  for (const entry of entries) {
    const block = entry.best
    if (!block) continue
    let selected = []
    let piece
    if (mode === "navigation") {
      selected = Array.from({ length: block.to - block.from + 1 }, (_, i) => block.from + i)
      piece = `${entry.file}:${block.from}-${block.to} symbol=${block.name || "unknown"} hash=${entry.hash}`
    } else {
      selected = bestLines(entry, Math.min(2048, Math.max(256, budget - Buffer.byteLength(prefix + body + suffix) - 128)))
      if (!selected.length) continue
      piece = renderEntry(entry, selected)
    }
    if (Buffer.byteLength(prefix + body + piece + "\n" + suffix) > budget) continue
    body += piece + "\n"
    used.push({ file: entry.file, from: block.from, to: block.to, lineNumbers: selected,
      symbol: block.name, score: entry.score, reason: entry.symbolHits ? "symbol-match" : "implementation-terms" })
  }
  if (!used.length) return { verdict: "abstain", reason: "packet-budget", packet: null, bytes: 0, candidates: [],
    prepMs: performance.now() - start, listed: found.listed, scanned: found.scanned, bytesRead: found.bytesRead,
    truncated: found.truncated }
  const packet = prefix + body + suffix
  return { verdict: "build", reason: "qualified-evidence", packet, bytes: Buffer.byteLength(packet), candidates: used,
    prepMs: Math.round((performance.now() - start) * 1000) / 1000, listed: found.listed, scanned: found.scanned,
    bytesRead: found.bytesRead, truncated: found.truncated }
}
