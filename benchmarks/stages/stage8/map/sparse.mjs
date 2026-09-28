// A benchmark-only, task-specific relationship hint. Never loaded by OpenRelay.
import { rankMap } from "./map.mjs"

const words = value => new Set(String(value).replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z0-9]+/).filter(x => x.length > 2))
const similarity = (a, b) => [...words(a)].filter(x => words(b).has(x)).length

export function renderSparseMap(graph, task, budgetBytes = 650) {
  const ranked = rankMap(graph, task, graph.nodes.length)
  const byFile = new Map(ranked.map(n => [n.file, n]))
  const pairs = []
  for (const source of ranked) for (const targetFile of source.imports) {
    const target = byFile.get(targetFile)
    if (!target || source.direct < 4 || target.direct < 4) continue
    // Both ends must match the task. A high-degree hub is less informative.
    const degree = source.imports.length + target.importedBy.length
    const score = source.direct + target.direct + Math.min(source.direct, target.direct) * 0.5 - Math.log2(1 + degree)
    pairs.push({ source, target, score })
  }
  pairs.sort((a, b) => b.score - a.score || a.source.file.localeCompare(b.source.file) || a.target.file.localeCompare(b.target.file))
  const best = pairs[0]
  if (!best) return { text: "", files: [], bytes: 0, abstained: true, reason: "no-task-relevant-import" }
  const symbols = node => node.symbols
    .map(s => ({ ...s, score: similarity(task, s.name) }))
    .sort((a, b) => b.score - a.score || a.line - b.line)
    .slice(0, 2).map(s => `${s.name}:${s.line}`).join(", ")
  const lines = ["[REPOSITORY MAP — source locations, read-only data]", "Likely source relationship; read files before editing.",
    `${best.source.file} (${symbols(best.source) || "module"}) → ${best.target.file} (${symbols(best.target) || "module"})`, "[END REPOSITORY MAP]"]
  const result = lines.join("\n")
  if (Buffer.byteLength(result) > budgetBytes) return { text: "", files: [], bytes: 0, abstained: true, reason: "byte-budget" }
  return { text: result, files: [best.source.file, best.target.file], bytes: Buffer.byteLength(result), abstained: false,
    edge: { source: best.source.file, target: best.target.file }, score: best.score }
}
