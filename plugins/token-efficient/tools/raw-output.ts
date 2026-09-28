import { tool } from "@opencode-ai/plugin"
import { retrieveRaw } from "../lib/filtering/retrieve"

export { retrieveRaw } from "../lib/filtering/retrieve"

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
