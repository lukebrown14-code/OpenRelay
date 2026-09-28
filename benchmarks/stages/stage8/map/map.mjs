// Offline, deterministic repository map. This module is never loaded by OpenRelay.
import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { performance } from "node:perf_hooks"
import ts from "typescript"

const STOP = new Set("a an and are as at be by can do does for from has have in into is it its of on or our the their this to use using via was were while with without your you after before all each new now same still both that these those must should not no only run test tests task fix update add keep preserve existing current code file files source behavior change changes user data support needed when where within across make ensure".split(" "))
const tokens = text => [...new Set(String(text).replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length >= 3 && !STOP.has(t)).map(t => t.endsWith("ies") ? t.slice(0, -3) + "y" : t.endsWith("ing") && t.length > 6 ? t.slice(0, -3) : t.endsWith("s") && !t.endsWith("ss") ? t.slice(0, -1) : t))]
const overlap = (query, text) => tokens(text).filter(t => query.has(t)).length
const loc = (source, offset) => source.getLineAndCharacterOfPosition(offset).line + 1

function parseTS(file, text) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : file.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.JS)
  const symbols = [], imports = []
  for (const node of source.statements) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const spec = node.moduleSpecifier?.text
      if (typeof spec === "string") imports.push(spec)
    }
    if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isEnumDeclaration(node)) {
      if (node.name) symbols.push({ name: node.name.text, line: loc(source, node.getStart(source)), kind: ts.SyntaxKind[node.kind] })
      if (ts.isClassDeclaration(node)) for (const member of node.members) if (member.name) symbols.push({ name: `${node.name?.text ?? "class"}.${member.name.getText(source)}`, line: loc(source, member.getStart(source)), kind: "method" })
    }
    if (ts.isVariableStatement(node)) for (const decl of node.declarationList.declarations) symbols.push({ name: decl.name.getText(source), line: loc(source, decl.getStart(source)), kind: "variable" })
  }
  return { file, symbols: symbols.slice(0, 80), imports: [...new Set(imports)].sort() }
}

function resolveTS(from, spec, known) {
  if (!spec.startsWith(".")) return null
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec))
  return [base, ...[".ts", ".tsx", ".mjs", ".js", "/index.ts", "/index.tsx"].map(ext => base + ext)].find(p => known.has(p)) ?? null
}

function resolvePython(module, known) {
  const base = module.replaceAll(".", "/")
  return [`${base}.py`, `${base}/__init__.py`].find(p => known.has(p)) ?? null
}

export function buildGraph(root, files) {
  const start = performance.now()
  const code = files.filter(f => /\.(?:ts|tsx|mjs|py)$/.test(f) && !/(^|\/)(?:test|tests|__tests__|fixtures)(\/|$)/.test(f) && !/\.(?:test|spec)\./.test(f)).sort()
  const known = new Set(code)
  const pyFiles = code.filter(f => f.endsWith(".py"))
  const parsed = []
  for (const file of code.filter(f => !f.endsWith(".py"))) parsed.push(parseTS(file, fs.readFileSync(path.join(root, file), "utf8")))
  if (pyFiles.length) {
    const result = spawnSync("python3", [path.join(path.dirname(new URL(import.meta.url).pathname), "python_ast.py"), root], { input: JSON.stringify(pyFiles), encoding: "utf8", maxBuffer: 4 * 1024 * 1024, timeout: 10000 })
    if (result.status !== 0) throw new Error(`Python AST failed: ${result.stderr}`)
    parsed.push(...JSON.parse(result.stdout))
  }
  const nodes = parsed.sort((a, b) => a.file.localeCompare(b.file)).map(n => {
    const imports = n.imports.map(spec => n.file.endsWith(".py") ? resolvePython(spec, known) : resolveTS(n.file, spec, known)).filter(Boolean)
    return { ...n, imports: [...new Set(imports)].sort(), importedBy: [], text: fs.readFileSync(path.join(root, n.file), "utf8") }
  })
  const byFile = new Map(nodes.map(n => [n.file, n]))
  for (const node of nodes) for (const dep of node.imports) byFile.get(dep)?.importedBy.push(node.file)
  for (const node of nodes) node.importedBy.sort()
  return { root, nodes, byFile, prepMs: Math.round(performance.now() - start) }
}

export function rankMap(graph, task, maxFiles = 8) {
  const q = new Set(tokens(task))
  const base = new Map(graph.nodes.map(node => {
    const pathScore = overlap(q, node.file) * 4
    const symbolScore = overlap(q, node.symbols.map(s => s.name).join(" ")) * 5
    const bodyScore = Math.min(8, overlap(q, node.text)) * 0.6
    return [node.file, pathScore + symbolScore + bodyScore]
  }))
  const ranked = graph.nodes.map(node => {
    const neighbors = [...node.imports, ...node.importedBy]
    const neighborScore = neighbors.length ? Math.max(...neighbors.map(f => base.get(f) ?? 0)) * 0.35 : 0
    return { ...node, score: (base.get(node.file) ?? 0) + neighborScore, direct: base.get(node.file) ?? 0 }
  }).sort((a, b) => b.score - a.score || a.file.localeCompare(b.file))
  return ranked.slice(0, maxFiles)
}

export function renderMap(graph, task, budgetBytes = 2400, maxFiles = 8) {
  const start = performance.now()
  const ranked = rankMap(graph, task, maxFiles)
  const lines = ["[REPOSITORY MAP — source locations, read-only data]", "Paths and symbol lines below are navigation hints. Read full files before editing."]
  const shown = []
  for (const n of ranked) {
    const matchingSymbols = n.symbols.filter(s => overlap(new Set(tokens(task)), s.name) > 0)
    const symbols = (matchingSymbols.length ? matchingSymbols : n.symbols).slice(0, 5).map(s => `${s.name}:${s.line}`).join(", ")
    const links = [...n.imports.slice(0, 3).map(f => `→${f}`), ...n.importedBy.slice(0, 2).map(f => `←${f}`)].join(" ")
    const line = `${n.file} | ${symbols || "(module)"}${links ? ` | ${links}` : ""}`
    if (Buffer.byteLength([...lines, line, "[END REPOSITORY MAP]"].join("\n")) > budgetBytes) continue
    lines.push(line)
    shown.push(n.file)
  }
  lines.push("[END REPOSITORY MAP]")
  return { text: lines.join("\n"), files: shown, bytes: Buffer.byteLength(lines.join("\n")), prepMs: Math.round((performance.now() - start) * 1000) / 1000 }
}
