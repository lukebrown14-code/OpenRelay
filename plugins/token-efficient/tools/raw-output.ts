import { tool } from "@opencode-ai/plugin"

const MAX_LINES = 200
const MAX_BYTES = 16 * 1024

export function retrieveRaw(
  text: string,
  opts: { mode: "range" | "search"; startLine?: number; endLine?: number; query?: string; context?: number },
): { text: string; totalLines: number; returnedLines: number; returnedBytes: number; hasMore: boolean; nextStartLine?: number } {
  const lines = String(text ?? "").split("\n")
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop()
  const total = lines.length

  function take(selected: string[]): { out: string[]; cut: boolean } {
    const out: string[] = []
    let bytes = 0
    for (const line of selected) {
      if (out.length >= MAX_LINES) return { out, cut: true }
      const cost = Buffer.byteLength(line) + (out.length > 0 ? 1 : 0)
      if (bytes + cost > MAX_BYTES) return { out, cut: true }
      out.push(line)
      bytes += cost
    }
    return { out, cut: false }
  }

  function finish(out: string[], cut: boolean, lastReturnedLine: number) {
    const joined = out.join("\n")
    const hasMore = out.length > 0 && (cut || lastReturnedLine < total)
    return {
      text: joined,
      totalLines: total,
      returnedLines: out.length,
      returnedBytes: Buffer.byteLength(joined),
      hasMore,
      nextStartLine: hasMore ? lastReturnedLine + 1 : undefined,
    }
  }

  if (opts.mode === "search") {
    const q = String(opts.query ?? "").toLowerCase()
    const ctx = typeof opts.context === "number" && Number.isFinite(opts.context) ? Math.max(0, Math.trunc(opts.context)) : 2
    const picked: number[] = []
    if (q) {
      const wanted: number[] = []
      for (let i = 0; i < total; i++) {
        if (lines[i].toLowerCase().includes(q)) wanted.push(i)
      }
      const set = new Set<number>()
      for (const m of wanted) {
        for (let j = Math.max(0, m - ctx); j <= Math.min(total - 1, m + ctx); j++) set.add(j)
      }
      picked.push(...[...set].sort((a, b) => a - b))
    }
    const { out, cut } = take(picked.map((k) => lines[k]))
    const joined = out.join("\n")
    return {
      text: joined,
      totalLines: total,
      returnedLines: out.length,
      returnedBytes: Buffer.byteLength(joined),
      hasMore: cut,
      nextStartLine: cut && out.length > 0 ? picked[out.length - 1] + 1 : undefined,
    }
  }

  const start = Math.max(1, typeof opts.startLine === "number" && Number.isFinite(opts.startLine) ? Math.trunc(opts.startLine) : 1)
  const endVal = typeof opts.endLine === "number" && Number.isFinite(opts.endLine) ? Math.trunc(opts.endLine) : total
  const end = Math.min(total, endVal)
  const selected = start <= end ? lines.slice(start - 1, end) : []
  const { out, cut } = take(selected)
  return finish(out, cut, start + out.length - 1)
}

export const openrelayRawOutputTool = (deps: {
  load: (args: { sessionID: string; ref: string }) => string | null
  onRecovered?: (info: { ref: string; mode: string; bytesReturned: number; sessionID: string }) => void
}) =>
  tool({
    description:
      "Retrieve raw output omitted by output filtering (test/typecheck/lint/build logs). " +
      "Use the ref from an omission note like `[N lines omitted — full raw output: openrelay_raw_output ref=<ref>]`. " +
      'mode="range": pass startLine/endLine (1-indexed, inclusive) or continue from nextStartLine. ' +
      'mode="search": pass query (case-insensitive) and optional context lines. ' +
      "Returns at most 200 lines or 16 KiB per call with pagination metadata.",
    args: {
      ref: tool.schema.string().describe("Raw-output reference from an omission note (openrelay_raw_output ref=...)"),
      mode: tool.schema.enum(["range", "search"]).describe('"range" for line ranges, "search" for text search'),
      startLine: tool.schema.number().int().optional().describe("First line to return (1-indexed, range mode)"),
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
          endLine: args.endLine,
          query: args.query,
          context: args.context,
        })
        try {
          deps.onRecovered?.({ ref, mode, bytesReturned: r.returnedBytes, sessionID: ctx.sessionID })
        } catch {}
        const meta = `totalLines=${r.totalLines} returnedLines=${r.returnedLines} ${
          r.hasMore ? `nextStartLine=${r.nextStartLine}` : "hasMore=false"
        }`
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
          },
        }
      } catch {
        return "Failed to retrieve raw output."
      }
    },
  })
