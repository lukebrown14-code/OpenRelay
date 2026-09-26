import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"

const sha256 = data => createHash("sha256").update(data).digest("hex")

export function verificationTiming(verify, runStartMs, verifyStartMs, verifyEndMs) {
  return {
    verifyDurationMs: verifyEndMs - verifyStartMs,
    totalDurationMs: verifyEndMs - runStartMs,
    verifyExitCode: Number.isInteger(verify.status) ? verify.status : null,
    verifySignal: verify.signal ?? null,
    verifyTimedOut: verify.error?.code === "ETIMEDOUT",
    verifyError: verify.error?.code ?? null,
  }
}

export function sessionContextEvents(telemetryDir, sessionID) {
  if (!sessionID) return []
  const dir = path.join(telemetryDir, "events")
  if (!fs.existsSync(dir)) return []
  const events = []
  for (const name of fs.readdirSync(dir).filter(name => name.endsWith(".jsonl")).sort()) {
    for (const line of fs.readFileSync(path.join(dir, name), "utf8").split("\n")) {
      if (!line.trim()) continue
      try {
        const event = JSON.parse(line)
        if (event.session === sessionID && event.type.startsWith("context.")) events.push(event)
      } catch {
        events.push({ type: "context.telemetry_parse_error" })
      }
    }
  }
  return events
}

export function packetCaptureRecord({ context, enabled, sessionID, events, telemetryDir, runDir }) {
  if (!enabled) return { status: "disabled" }
  if (context === "off") return { status: "context-off" }
  if (!sessionID) return { status: "unavailable", reason: "missing-session" }
  if (events.some(e => e.type === "context.telemetry_parse_error")) {
    return { status: "unavailable", reason: "malformed-telemetry" }
  }
  const decisions = events.filter(e => e.type === "context.decision")
  const captures = events.filter(e => e.type === "context.packet_captured")
  if (decisions.length !== 1) return { status: "unavailable", reason: "missing-or-multiple-decisions" }
  const decision = decisions[0].data ?? {}
  if (decision.verdict === "skip" && captures.length === 0) return { status: "skipped", reason: decision.reason ?? null }
  if (decision.verdict !== "build" || captures.length !== 1) return { status: "unavailable", reason: "missing-or-multiple-captures" }
  const capture = captures[0].data ?? {}
  if (typeof capture.file !== "string" || !/^[a-f0-9]{64}$/.test(capture.hash) || !Number.isSafeInteger(capture.bytes)) {
    return { status: "unavailable", reason: "invalid-capture-metadata" }
  }
  try {
    const root = fs.realpathSync(telemetryDir)
    const source = fs.realpathSync(capture.file)
    if (!source.startsWith(root + path.sep)) return { status: "unavailable", reason: "capture-outside-telemetry" }
    const packet = fs.readFileSync(source)
    if (packet.length > 32768 || packet.length !== capture.bytes || sha256(packet) !== capture.hash) {
      return { status: "unavailable", reason: "capture-hash-or-size-mismatch" }
    }
    const artifact = "context-packet.txt"
    fs.writeFileSync(path.join(runDir, artifact), packet, { mode: 0o600 })
    return { status: "captured", artifact, sha256: capture.hash, bytes: packet.length }
  } catch {
    return { status: "unavailable", reason: "capture-read-failed" }
  }
}
