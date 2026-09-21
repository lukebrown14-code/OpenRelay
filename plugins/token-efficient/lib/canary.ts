import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const TITLE_CANARY = "CANARY-TITLE-q7x41"
const META_CANARY = "CANARY-META-z9k28"

export function canaryEnabled(): boolean {
  try {
    return process.env.OPENRELAY_CANARY === "on"
  } catch {
    return false
  }
}

export function canaryLogPath(): string {
  return path.join(os.homedir(), ".local", "share", "opencode", "token-efficient", "canary.jsonl")
}

export function markResult(output: { title?: string; metadata?: unknown } | undefined): void {
  try {
    if (!output) return
    output.title = `${output.title ?? ""} ${TITLE_CANARY}`.trim()
    output.metadata = { ...((output.metadata as Record<string, unknown>) ?? {}), openrelayCanary: META_CANARY }
  } catch {}
}

type TransformProbe = {
  ts: string
  messageCount: number
  parts: Array<Record<string, unknown>>
  canarySeen: { title: boolean; meta: boolean }
  anyMetaKeys: string[]
}

export function logTransform(messages: unknown): void {
  try {
    const probe: TransformProbe = {
      ts: new Date().toISOString(),
      messageCount: 0,
      parts: [],
      canarySeen: { title: false, meta: false },
      anyMetaKeys: [],
    }
    const list = (messages as { info?: unknown; parts?: unknown }[]) ?? []
    probe.messageCount = list.length
    for (const m of list) {
      const parts = (m?.parts as Record<string, unknown>[]) ?? []
      for (const p of parts) {
        let json = ""
        try {
          json = JSON.stringify(p)
        } catch {}
        if (!json) continue
        const isTool = /"type"\s*:\s*"tool"/.test(json)
        if (!isTool) continue
        const entry: Record<string, unknown> = {
          jsonLen: json.length,
          hasTitleCanary: json.includes(TITLE_CANARY),
          hasMetaCanary: json.includes(META_CANARY),
          mentionsOutputPath: json.includes("outputPath"),
          mentionsMetadataKey: json.includes('"metadata"'),
        }
        if (entry.hasTitleCanary) probe.canarySeen.title = true
        if (entry.hasMetaCanary) probe.canarySeen.meta = true
        try {
          const keys = Object.keys(p ?? {})
          entry.partKeys = keys
          const state = p.state as Record<string, unknown> | undefined
          if (state) {
            entry.stateKeys = Object.keys(state)
            if (typeof state.output === "string") entry.outputLen = state.output.length
            if (state.metadata && typeof state.metadata === "object") {
              entry.metaKeys = Object.keys(state.metadata as Record<string, unknown>)
              const mo = (state.metadata as Record<string, unknown>).output
              if (typeof mo === "string") entry.metaOutputLen = mo.length
            }
          }
        } catch {}
        if (probe.parts.length < 12) probe.parts.push(entry)
      }
    }
    fs.appendFileSync(canaryLogPath(), JSON.stringify(probe) + "\n")
  } catch {}
}
