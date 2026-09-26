// Benchmark-only source-owner ranking. Source basenames and best matching
// definitions carry more weight than repeated words in a large file body.
import path from "node:path"

const STOP = new Set("about after again all also and are before both can change changes code current different each ensure existing file files follow from into must none only path paths preserve read relevant repository same source task that them these this through update used using when where while with without your".split(" "))
const terms = text => [...new Set(String(text).replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z0-9]+/).filter(x => x.length >= 3 && !STOP.has(x)).map(x => x.endsWith("ies") ? `${x.slice(0, -3)}y` : x.endsWith("ing") && x.length > 6 ? x.slice(0, -3) : x.endsWith("s") && !x.endsWith("ss") ? x.slice(0, -1) : x))]
const overlap = (query, text, idf) => terms(text).reduce((score, token) => score + (query.has(token) ? idf.get(token) ?? 1 : 0), 0)

export function rankOwners(graph, task) {
  const query = new Set(terms(task))
  const documentTerms = graph.nodes.map(n => new Set(terms(`${n.file} ${n.symbols.map(s => s.name).join(" ")} ${n.text}`)))
  const idf = new Map([...query].map(token => [token, 1 + Math.log((graph.nodes.length + 1) / (1 + documentTerms.filter(d => d.has(token)).length))]))
  return graph.nodes.map(node => {
    const basename = path.posix.basename(node.file).replace(/\.[^.]+$/, "")
    const directory = path.posix.dirname(node.file)
    const symbolScores = node.symbols.map(s => overlap(query, s.name, idf)).sort((a, b) => b - a)
    const score = 10 * overlap(query, basename, idf) + 1.5 * overlap(query, directory, idf) +
      3.5 * (symbolScores[0] ?? 0) + 1.5 * (symbolScores[1] ?? 0) +
      0.2 * Math.min(8, overlap(query, node.text, idf))
    return { ...node, score, bestSymbolScore: symbolScores[0] ?? 0 }
  }).sort((a, b) => b.score - a.score || a.file.localeCompare(b.file))
}

export function renderOwnerMap(graph, task, budgetBytes = 650, maxFiles = 5) {
  const query = new Set(terms(task))
  const ranked = rankOwners(graph, task)
  const lines = ["[REPOSITORY MAP — source locations, read-only data]", "Possible starting files. Read source before editing."]
  const files = []
  for (const node of ranked.slice(0, maxFiles)) {
    const symbol = node.symbols.map(s => ({ ...s, score: terms(s.name).filter(t => query.has(t)).length }))
      .sort((a, b) => b.score - a.score || a.line - b.line)[0]
    const line = `${node.file}${symbol?.score ? ` # ${symbol.name}:${symbol.line}` : ""}`
    if (Buffer.byteLength([...lines, line, "[END REPOSITORY MAP]"].join("\n")) > budgetBytes) break
    lines.push(line)
    files.push(node.file)
  }
  if (!files.length) return { text: "", files: [], bytes: 0, abstained: true }
  lines.push("[END REPOSITORY MAP]")
  const text = lines.join("\n")
  return { text, files, bytes: Buffer.byteLength(text), abstained: false }
}
