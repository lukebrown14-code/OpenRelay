import { tool } from "@opencode-ai/plugin"

const MAX_LINES = 200
const MAX_BYTES = 14 * 1024 // reserve room for the response metadata

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
      for (let i = 0; i < total; i++) {
        if (lines[i].toLowerCase().includes(q)) wanted.push(i)
      }
      matchCount = wanted.length
      const set = new Set<number>()
      for (const m of wanted) {
        for (let j = Math.max(0, m - ctx); j <= Math.min(total - 1, m + ctx); j++) set.add(j)
      }
      picked = [...set].filter(i => i >= start - 1).sort((a, b) => a - b)
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
    if (out.length >= MAX_LINES || (bytes + cost > MAX_BYTES && out.length > 0)) {
      nextStartLine = index + 1
      break
    }
    if (cost > MAX_BYTES) {
      let fragment = "", used = 0
      for (const ch of line) {
        const n = Buffer.byteLength(ch)
        if (used + n > MAX_BYTES) break
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

export const openrelayRawOutputTool = (deps: {
  load: (args: { sessionID: string; ref: string }) => string | null
  onRecovered?: (info: { ref: string; mode: string; bytesReturned: number; sessionID: string }) => void
}) =>
  tool({
    description:
      "Retrieve raw output omitted by output filtering (test/typecheck/lint/build logs). " +
      "Use the ref from an omission note like `[N lines omitted — full raw output: openrelay_raw_output ref=<ref>]`. " +
      'mode="range": pass startLine/endLine (1-indexed, inclusive). Continue with nextStartLine and nextStartOffset when provided. ' +
      'mode="search": pass query (case-insensitive) and optional context lines. ' +
      "Returns at most 200 lines or 16 KiB per call with pagination metadata.",
    args: {
      ref: tool.schema.string().describe("Raw-output reference from an omission note (openrelay_raw_output ref=...)"),
      mode: tool.schema.enum(["range", "search"]).describe('"range" for line ranges, "search" for text search'),
      startLine: tool.schema.number().int().optional().describe("First line to return (1-indexed, both modes)"),
      startOffset: tool.schema.number().int().optional().describe("Copy nextStartOffset to continue an oversized line; UTF-16 offset"),
      endLine: tool.schema.number().int().optional().describe("Last line to return (inclusive, range mode)"),
      query: tool.schema.string().optional().describe("Case-insensitive text to search for (search mode)"),
      context: tool.schema.number().int().optional().describe("Lines of context around search matches (default 2)"),
    },
    execute: async (args, ctx) => {
      try {
        const ref = String(args.ref ?? "")
        const notFound = "No raw output found for this reference in the current session (expired, or wrong session)."
        if (!ref) return notFound
        const raw = deps.load({ sessionID: ctx.sessionID, ref })
        if (raw === null) return notFound
        const mode = args.mode === "search" ? "search" : "range"
        const r = retrieveRaw(raw, {
          mode,
          startLine: args.startLine,
          startOffset: args.startOffset,
          endLine: args.endLine,
          query: args.query,
          context: args.context,
        })
        try {
          deps.onRecovered?.({ ref, mode, bytesReturned: r.returnedBytes, sessionID: ctx.sessionID })
        } catch {}
        const meta = `totalLines=${r.totalLines} returnedLines=${r.returnedLines} ${
          r.hasMore ? `nextStartLine=${r.nextStartLine} nextStartOffset=${r.nextStartOffset ?? 0}` : "hasMore=false"
        } sourceLines=${r.sourceLines.join(",")}${r.matchCount !== undefined ? ` matches=${r.matchCount}` : ""}`
        return {
          title: `raw output ${ref}`,
          output: `${r.text}\n\n[${meta}]`,
          metadata: {
            ref,
            mode,
            totalLines: r.totalLines,
            returnedLines: r.returnedLines,
            returnedBytes: r.returnedBytes,
            hasMore: r.hasMore,
            nextStartLine: r.nextStartLine,
            nextStartOffset: r.nextStartOffset,
            sourceLines: r.sourceLines,
            matchCount: r.matchCount,
          },
        }
      } catch {
        return "Failed to retrieve raw output."
      }
    },
  })
