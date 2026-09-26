import fs from "node:fs"
import path from "node:path"
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"

function inside(root: string, candidate: string) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`)
}

function confined(raw: unknown, root: string): boolean {
  if (typeof raw !== "string" || raw.length === 0) return true
  try {
    // Pi expands these prefixes after tool_call, so reject them instead of
    // validating the unexpanded string as if it were workspace relative.
    if (raw === "~" || raw.startsWith("~/") || raw.startsWith("~\\")) return false
    const target = path.resolve(root, raw)
    if (!inside(root, target)) return false
    let probe = target
    while (!fs.existsSync(probe)) {
      const parent = path.dirname(probe)
      if (parent === probe) return false
      probe = parent
    }
    return inside(root, fs.realpathSync(probe))
  } catch { return false }
}

function quote(value: string) { return `'${value.replace(/'/g, `'"'"'`)}'` }

export default function (pi: ExtensionAPI) {
  const profile = process.env.OPENRELAY_PI_SANDBOX_PROFILE
  pi.on("tool_call", (event, ctx) => {
    try {
      const root = fs.realpathSync(ctx.cwd)
      if (event.toolName === "bash") {
        if (!profile || typeof event.input.command !== "string") return { block: true, reason: "Pi benchmark sandbox is not configured." }
        event.input.command = `/usr/bin/sandbox-exec -f ${quote(profile)} -- /bin/bash -c ${quote(event.input.command)}`
        return
      }
      if (["read", "write", "edit", "ls", "grep", "find"].includes(event.toolName)) {
        const target = (event.input as Record<string, unknown>).path
        if (!confined(target, root)) return { block: true, reason: "This benchmark tool is limited to the fixture workspace." }
      }
    } catch {
      return { block: true, reason: "Unable to verify the benchmark workspace boundary." }
    }
  })
}
