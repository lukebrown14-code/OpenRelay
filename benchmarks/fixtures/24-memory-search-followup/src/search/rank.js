// Current scoring: plain term-frequency count (BM25 was removed in commit 4a19).
export function score(tokens, docTokens) {
  let s = 0
  for (const t of docTokens) if (tokens.includes(t)) s += 1
  return s
}
