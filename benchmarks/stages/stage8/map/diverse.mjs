// Benchmark-only task map. Diversifies source directories to avoid four
// near-identical UI screens crowding out the state owner behind them.
import path from "node:path"
import { rankMap } from "./map.mjs"

const words = value => new Set(String(value).replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z0-9]+/).filter(x => x.length > 2))
const match = (query, value) => [...words(value)].filter(x => query.has(x)).length

export function selectDiverseFiles(graph, task, maxFiles = 4) {
  const ranked = rankMap(graph, task, graph.nodes.length)
  const chosen = []
  while (chosen.length < maxFiles && chosen.length < ranked.length) {
    const next = ranked.filter(n => !chosen.includes(n)).map(node => {
      const sameDir = chosen.filter(c => path.posix.dirname(c.file) === path.posix.dirname(node.file)).length
      const linked = chosen.some(c => c.imports.includes(node.file) || node.imports.includes(c.file))
      return { node, marginal: node.score - sameDir * 7 + (linked ? 2 : 0) }
    }).sort((a, b) => b.marginal - a.marginal || a.node.file.localeCompare(b.node.file))[0]
    chosen.push(next.node)
  }
  return chosen
}

export function renderDiverseMap(graph, task, budgetBytes = 650, maxFiles = 4) {
  const query = words(task)
  const lines = ["[REPOSITORY MAP — source locations, read-only data]", "Possible starting files. Read source before editing."]
  const files = []
  for (const node of selectDiverseFiles(graph, task, maxFiles)) {
    const symbol = node.symbols.map(s => ({ ...s, match: match(query, s.name) }))
      .sort((a, b) => b.match - a.match || a.line - b.line)[0]
    const line = `${node.file}${symbol?.match ? ` # ${symbol.name}:${symbol.line}` : ""}`
    if (Buffer.byteLength([...lines, line, "[END REPOSITORY MAP]"].join("\n")) > budgetBytes) break
    lines.push(line)
    files.push(node.file)
  }
  if (!files.length) return { text: "", files: [], bytes: 0, abstained: true }
  lines.push("[END REPOSITORY MAP]")
  const text = lines.join("\n")
  return { text, files, bytes: Buffer.byteLength(text), abstained: false }
}
