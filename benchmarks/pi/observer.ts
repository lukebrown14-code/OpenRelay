import fs from "node:fs"
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"

const file = process.env.OPENRELAY_PI_OBSERVER_FILE
function write(value: unknown) {
  if (!file) return
  try { fs.appendFileSync(file, `${JSON.stringify(value)}\n`, { mode: 0o600 }) } catch {}
}

export default function (pi: ExtensionAPI) {
  let messageSequence = 0
  pi.on("session_start", (_event, ctx) => {
    try { write({ type: "session_start", sessionID: ctx.sessionManager.getSessionId(), cwd: ctx.cwd, ts: new Date().toISOString() }) } catch {}
  })
  pi.on("model_select", (event, ctx) => {
    write({ type: "model_select", sessionID: ctx.sessionManager.getSessionId(), provider: event.model.provider, model: event.model.id, ts: new Date().toISOString() })
  })
  pi.on("message_end", (event, ctx) => {
    try {
      const m = event.message as any
      if (m?.role !== "assistant") return
      write({ type: "assistant_message", sessionID: ctx.sessionManager.getSessionId(), sequence: ++messageSequence, stopReason: m.stopReason, usage: m.usage, ts: new Date().toISOString() })
    } catch {}
  })
  pi.on("tool_result", (event, ctx) => {
    try {
      const text = Array.isArray(event.content) ? event.content.map((part: any) => part?.type === "text" ? String(part.text ?? "") : "").join("\n") : ""
      write({ type: "tool_result", sessionID: ctx.sessionManager.getSessionId(), toolName: event.toolName, isError: event.isError, usage: event.usage, outputBytes: Buffer.byteLength(text), filtered: (event.details as any)?.openrelayFiltered === true, ts: new Date().toISOString() })
    } catch {}
  })
}
