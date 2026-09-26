// Benchmark-only compact file locators; never loaded by OpenRelay.
import { rankMap } from "./map.mjs"

const words = value => new Set(String(value).replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z0-9]+/).filter(x => x.length > 2))
const match = (query, value) => [...words(value)].filter(x => query.has(x)).length

export function renderLocatorMap(graph, task, budgetBytes = 650, maxFiles = 4) {
  const query = words(task)
  const ranked = rankMap(graph, task, maxFiles)
  const lines = ["[REPOSITORY MAP — source locations, read-only data]", "Possible starting files. Read source before editing."]
  const files = []
  for (const node of ranked) {
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
