function tokenize(text) {
  return String(text).toLowerCase().match(/[a-z0-9]+/g) ?? []
}

export function buildIndex(docs) {
  // Tokens are lowercased at INDEX time — the query side must lowercase too.
  const byToken = new Map()
  const entries = []
  for (const [id, text] of Object.entries(docs)) {
    const tokens = tokenize(text)
    entries.push({ id, tokens })
    for (const tok of new Set(tokens)) {
      if (!byToken.has(tok)) byToken.set(tok, new Set())
      byToken.get(tok).add(id)
    }
  }
  return { byToken, entries }
}

export function search(index, query) {
  const tokens = tokenize(query)
  if (tokens.length === 0) return []
  let hits = null
  for (const tok of tokens) {
    const set = index.byToken.get(tok) ?? new Set()
    hits = hits === null ? new Set(set) : new Set([...hits].filter((id) => set.has(id)))
    if (hits.size === 0) return []
  }
  return [...hits].sort()
}
