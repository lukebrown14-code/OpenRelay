import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createHash } from "node:crypto"
import { packetCaptureRecord, sessionContextEvents, verificationTiming } from "./lib/measurement.mjs"

test("verification timing includes independent verifier and records failure/timeout", () => {
  assert.deepEqual(verificationTiming({ status: 0, signal: null }, 100, 250, 280), {
    verifyDurationMs: 30, totalDurationMs: 180, verifyExitCode: 0,
    verifySignal: null, verifyTimedOut: false, verifyError: null,
  })
  assert.deepEqual(verificationTiming({ status: null, signal: "SIGTERM", error: { code: "ETIMEDOUT" } }, 100, 250, 1250), {
    verifyDurationMs: 1000, totalDurationMs: 1150, verifyExitCode: null,
    verifySignal: "SIGTERM", verifyTimedOut: true, verifyError: "ETIMEDOUT",
  })
  assert.equal(verificationTiming({ status: 1 }, 0, 5, 9).verifyExitCode, 1)
})

test("packet artifact is verified and copied only for a single build capture", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stage5-capture-"))
  try {
    const telemetryDir = path.join(dir, "telemetry")
    const runDir = path.join(dir, "run")
    fs.mkdirSync(telemetryDir)
    fs.mkdirSync(runDir)
    const source = path.join(telemetryDir, "packet.txt")
    const packet = "[CONTROLLER CONTEXT]\n// src/app.js:1\nconst x = 1"
    fs.writeFileSync(source, packet)
    const hash = createHash("sha256").update(packet).digest("hex")
    const events = [
      { type: "context.decision", data: { verdict: "build", reason: "new-candidates" } },
      { type: "context.packet_captured", data: { file: source, hash, bytes: Buffer.byteLength(packet) } },
    ]
    const options = { context: "on", enabled: true, sessionID: "ses_1", events, telemetryDir, runDir }
    assert.deepEqual(packetCaptureRecord(options), { status: "captured", artifact: "context-packet.txt", sha256: hash, bytes: Buffer.byteLength(packet) })
    assert.equal(fs.readFileSync(path.join(runDir, "context-packet.txt"), "utf8"), packet)
    assert.deepEqual(packetCaptureRecord({ ...options, enabled: false }), { status: "disabled" })
    assert.deepEqual(packetCaptureRecord({ ...options, context: "off" }), { status: "context-off" })
    assert.deepEqual(packetCaptureRecord({ ...options, events: [{ type: "context.decision", data: { verdict: "skip", reason: "git-intent" } }] }),
      { status: "skipped", reason: "git-intent" })
    assert.equal(packetCaptureRecord({ ...options, events: [...events, events[1]] }).status, "unavailable")
    fs.writeFileSync(source, packet + "tampered")
    assert.equal(packetCaptureRecord(options).status, "unavailable")
    fs.writeFileSync(source, packet)
    const outside = path.join(dir, "outside.txt")
    fs.writeFileSync(outside, packet)
    assert.equal(packetCaptureRecord({ ...options, events: [events[0], { type: "context.packet_captured", data: { file: outside, hash, bytes: Buffer.byteLength(packet) } }] }).status, "unavailable")
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test("session event lookup isolates the requested session", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stage5-events-"))
  try {
    fs.mkdirSync(path.join(dir, "events"))
    fs.writeFileSync(path.join(dir, "events", "one.jsonl"), [
      { session: "a", type: "context.decision", data: { verdict: "skip" } },
      { session: "b", type: "context.decision", data: { verdict: "build" } },
      { session: "a", type: "tool.call", data: {} },
    ].map(JSON.stringify).join("\n"))
    assert.equal(sessionContextEvents(dir, "a").length, 1)
    assert.equal(sessionContextEvents(dir, "a")[0].data.verdict, "skip")
    fs.appendFileSync(path.join(dir, "events", "one.jsonl"), "\n{broken-json")
    const withError = sessionContextEvents(dir, "a")
    assert.equal(packetCaptureRecord({ context: "on", enabled: true, sessionID: "a", events: withError,
      telemetryDir: dir, runDir: dir }).status, "unavailable")
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})
