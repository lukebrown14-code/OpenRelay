import fs from "node:fs"
import path from "node:path"
import { Type } from "@earendil-works/pi-ai"
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"
import { Store } from "../../token-efficient/lib/store"
import { resolveFilteringConfig } from "../../token-efficient/lib/filtering/config"
import { filterToolOutput } from "../../token-efficient/lib/filtering/filter"
import { loadRawOutput } from "../../token-efficient/lib/filtering/raw-store"
import { retrieveRaw } from "../../token-efficient/lib/filtering/retrieve"

function resultText(content: unknown): string {
  if (!Array.isArray(content)) return ""
  return content.map((part) => part && typeof part === "object" && (part as { type?: unknown }).type === "text"
    ? String((part as { text?: unknown }).text ?? "") : "").join("\n")
}

function outputPath(details: unknown, text: string): string | undefined {
  try {
    const d = details && typeof details === "object" ? details as Record<string, unknown> : {}
    const trunc = d.truncation && typeof d.truncation === "object" ? d.truncation as Record<string, unknown> : {}
    const direct = typeof d.fullOutputPath === "string" ? d.fullOutputPath
      : typeof trunc.fullOutputPath === "string" ? trunc.fullOutputPath : undefined
    if (direct) return direct
    // Pi includes the temporary log path in its textual truncation pointer. Never
    // infer a successful exit code from that pointer; it is only a source candidate.
    const m = text.match(/Full output(?::| saved to:)\s+([^\s\]"']+)/i)
    return m?.[1]
  } catch { return undefined }
}

export default function (pi: ExtensionAPI) {
  if (process.env.OPENRELAY_PI_FILTERING !== "on") return
  const sessionDirs = new Map<string, string>()
  const dataRoot = process.env.OPENRELAY_PI_DATA_DIR ?? path.join(process.cwd(), ".openrelay-pi-data")
  const store = new Store(process.cwd(), process.cwd(), dataRoot, { channel: "pi-benchmark", buildID: "pi-filtering-v1" })
  const config = resolveFilteringConfig({ enabled: true, previewSafe: true })

  pi.registerTool({
    name: "openrelay_raw_output",
    label: "OpenRelay raw output",
    description: "Retrieve output omitted by OpenRelay filtering. Use the ref from the omission note. Search or request a line range; output is paginated.",
    parameters: Type.Object({
      ref: Type.String({ description: "Opaque reference from an OpenRelay omission note" }),
      mode: Type.Union([Type.Literal("range"), Type.Literal("search")]),
      startLine: Type.Optional(Type.Number()),
      startOffset: Type.Optional(Type.Number()),
      endLine: Type.Optional(Type.Number()),
      query: Type.Optional(Type.String()),
      context: Type.Optional(Type.Number()),
    }),
    async execute(_id, args, _signal, _update, ctx) {
      try {
        const dir = sessionDirs.get(ctx.sessionManager.getSessionId())
        const raw = dir ? loadRawOutput({ sessionID: ctx.sessionManager.getSessionId(), ref: args.ref, dir }) : null
        if (raw === null) return { content: [{ type: "text", text: "No raw output found for this reference in the current Pi session." }], details: undefined }
        const r = retrieveRaw(raw, args)
        return {
          content: [{ type: "text", text: `${r.text}\n\n[totalLines=${r.totalLines} returnedLines=${r.returnedLines} hasMore=${r.hasMore} nextStartLine=${r.nextStartLine ?? ""} nextStartOffset=${r.nextStartOffset ?? 0}]` }],
          details: { ref: args.ref, mode: args.mode, returnedBytes: r.returnedBytes, hasMore: r.hasMore },
        }
      } catch {
        return { content: [{ type: "text", text: "Failed to retrieve raw output." }], details: undefined }
      }
    },
  })

  pi.on("session_start", (_event, ctx) => {
    try {
      const id = ctx.sessionManager.getSessionId()
      const dir = path.join(dataRoot, "raw")
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
      sessionDirs.set(id, dir)
    } catch {}
  })

  pi.on("tool_result", async (event, ctx) => {
    try {
      if (event.toolName !== "bash") return
      const command = typeof event.input.command === "string" ? event.input.command : ""
      const text = resultText(event.content)
      const p = outputPath(event.details, text)
      // Pi throws on non-zero exit and may not expose exit status in details.
      // Only infer the explicit status phrase; otherwise previewSafe fails open.
      const codeMatch = text.match(/Command exited with code (\d+)/i)
      const exitCode = event.isError ? (codeMatch ? Number(codeMatch[1]) : null) : 0
      const id = ctx.sessionManager.getSessionId()
      const dir = sessionDirs.get(id)
      if (!dir || !text || !command) return
      const outcome = await filterToolOutput({
        tool: "bash", command, output: text, sessionID: id,
        config, store, rawDir: dir,
        metadata: { outputPath: p, truncated: Boolean(p), exitCode },
      })
      if (!outcome) return
      return { content: [{ type: "text", text: outcome.filtered }], details: { openrelayFiltered: true, reason: outcome.reason, bytesBefore: outcome.bytesBefore, bytesAfter: outcome.bytesAfter }, isError: event.isError }
    } catch {
      // A filter error must leave Pi's original tool result untouched.
      return
    }
  })
}
