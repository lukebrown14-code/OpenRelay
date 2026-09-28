export const MAX_RAW_LINES = 200
export const MAX_RAW_BYTES = 14 * 1024

export function retrieveRaw(
  text: string,
  opts: { mode: "range" | "search"; startLine?: number; startOffset?: number; endLine?: number; query?: string; context?: number },
) {
  const lines = String(text ?? "").split("\n")
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop()
  const total = lines.length

  const start = Math.max(1, Number.isFinite(opts.startLine) ? Math.trunc(opts.startLine!) : 1)
  let picked: number[] = []
  let matchCount: number | undefined
  if (opts.mode === "search") {
    const q = String(opts.query ?? "").toLowerCase()
    const ctx = typeof opts.context === "number" && Number.isFinite(opts.context) ? Math.max(0, Math.trunc(opts.context)) : 2
    if (q) {
      const wanted: number[] = []
      for (let i = 0; i < total; i++) if (lines[i].toLowerCase().includes(q)) wanted.push(i)
      matchCount = wanted.length
      const set = new Set<number>()
      for (const m of wanted) for (let j = Math.max(0, m - ctx); j <= Math.min(total - 1, m + ctx); j++) set.add(j)
      picked = [...set].filter((i) => i >= start - 1).sort((a, b) => a - b)
    }
  } else {
    const end = Math.min(total, Number.isFinite(opts.endLine) ? Math.trunc(opts.endLine!) : total)
    for (let i = start - 1; i < end; i++) picked.push(i)
  }

  const out: string[] = [], sourceLines: number[] = []
  let bytes = 0, nextStartLine: number | undefined, nextStartOffset: number | undefined
  for (const index of picked) {
    const offset = index === start - 1 && Number.isFinite(opts.startOffset) ? Math.max(0, Math.trunc(opts.startOffset!)) : 0
    const line = lines[index].slice(offset)
    const cost = Buffer.byteLength(line) + (out.length ? 1 : 0)
    if (out.length >= MAX_RAW_LINES || (bytes + cost > MAX_RAW_BYTES && out.length > 0)) { nextStartLine = index + 1; break }
    if (cost > MAX_RAW_BYTES) {
      let fragment = "", used = 0
      for (const ch of line) {
        const n = Buffer.byteLength(ch)
        if (used + n > MAX_RAW_BYTES) break
        fragment += ch; used += n
      }
      out.push(fragment); sourceLines.push(index + 1)
      nextStartLine = index + 1; nextStartOffset = offset + fragment.length
      break
    }
    out.push(line); sourceLines.push(index + 1); bytes += cost
  }
  const last = sourceLines[sourceLines.length - 1]
  if (!nextStartLine && opts.mode === "range" && last && last < total) nextStartLine = last + 1
  const joined = out.join("\n")
  return { text: joined, totalLines: total, returnedLines: out.length, returnedBytes: Buffer.byteLength(joined),
    sourceLines, matchCount, hasMore: nextStartLine !== undefined, nextStartLine, nextStartOffset }
}
