import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"
import { ContextEngine } from "../../token-efficient/lib/context"
import { resolveContextConfig } from "../../token-efficient/lib/context/config"

function safeAppend(file: string | undefined, value: unknown) {
  if (!file) return
  try { fs.appendFileSync(file, `${JSON.stringify(value)}\n`, { mode: 0o600 }) } catch {}
}

export default function (pi: ExtensionAPI) {
  if (process.env.OPENRELAY_PI_CONTEXT !== "on") return
  const decisionsFile = process.env.OPENRELAY_PI_CONTEXT_FILE
  const packetsDir = process.env.OPENRELAY_PI_PACKET_DIR
  const engine = new ContextEngine(resolveContextConfig({ enabled: true }), (type, data, sessionID) => {
    safeAppend(decisionsFile, { type, sessionID, ...data, ts: new Date().toISOString() })
  })
  const packets = new Map<string, { text: string; hash: string }>()

  pi.on("before_agent_start", (event, ctx) => {
    try {
      const sessionID = ctx.sessionManager.getSessionId()
      engine.prepare(sessionID, ctx.cwd, event.prompt)
      const packet = engine.packetFor(sessionID)
      if (!packet) { packets.delete(sessionID); return }
      const hash = createHash("sha256").update(packet).digest("hex")
      packets.set(sessionID, { text: packet, hash })
      if (packetsDir) {
        const file = path.join(packetsDir, `${sessionID}-${hash}.txt`)
        fs.mkdirSync(packetsDir, { recursive: true, mode: 0o700 })
        if (!fs.existsSync(file)) fs.writeFileSync(file, packet, { flag: "wx", mode: 0o600 })
      }
      const prior = event.systemPromptOptions.customInstructions ?? ""
      event.systemPromptOptions.customInstructions = `${prior}${prior ? "\n\n" : ""}${packet}`
    } catch {}
  })

  pi.on("before_provider_request", (event, ctx) => {
    try {
      const id = ctx.sessionManager.getSessionId()
      const packet = packets.get(id)
      if (!packet) return
      const delivered = JSON.stringify(event.payload).includes(packet.text)
      safeAppend(decisionsFile, { type: "context.packet_delivery", sessionID: id, hash: packet.hash, bytes: Buffer.byteLength(packet.text), delivered, ts: new Date().toISOString() })
    } catch {}
  })

  pi.on("agent_end", (_event, ctx) => {
    try { packets.delete(ctx.sessionManager.getSessionId()) } catch {}
  })
}
