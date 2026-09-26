import { describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { SessionTracker } from "../telemetry/session-tracker"
import { Store } from "../lib/store"
import { captureBenchmarkPacket } from "../lib/context/capture"
import plugin from "../index"

describe("telemetry coverage", () => {
  test("completion has a message ID, stable usage flag, and no duplicate event", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "relay-usage-"))
    try {
      const store = new Store(dir, dir, dir, { channel: "benchmark" })
      const tracker = new SessionTracker(store)
      tracker.llmCall("ses_one", "build", { providerID: "test", id: "workhorse" })
      const info = { id: "msg_one", sessionID: "ses_one", role: "assistant", agent: "build", providerID: "test", modelID: "workhorse",
        time: { created: 1, completed: 2 }, tokens: { input: 10, output: 2, cache: { read: 5, write: 0 } } }
      tracker.messageUpdated(info)
      tracker.messageUpdated(info)
      const events = fs.readdirSync(path.join(dir, "events")).flatMap(name => fs.readFileSync(path.join(dir, "events", name), "utf8").trim().split("\n").map(line => JSON.parse(line)))
      const completions = events.filter(e => e.type === "assistant.completed")
      expect(completions).toHaveLength(1)
      expect(completions[0].data.messageID).toBe("msg_one")
      expect(completions[0].data.usageAvailable).toBe(true)
      expect(completions[0].data.tokens.input).toBe(10)
      tracker.messageUpdated({ ...info, id: "msg_missing", tokens: undefined })
      const updated = fs.readdirSync(path.join(dir, "events")).flatMap(name => fs.readFileSync(path.join(dir, "events", name), "utf8").trim().split("\n").map(line => JSON.parse(line)))
      const missing = updated.find(e => e.type === "assistant.completed" && e.data.messageID === "msg_missing")
      expect(missing.data.usageAvailable).toBe(false)
      expect(missing.data.tokens).toBeNull()
    } finally { fs.rmSync(dir, { recursive: true, force: true }) }
  })

  test("captured packet matches the exact text and rejects invalid session IDs", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "relay-packet-"))
    try {
      const store = new Store(dir, dir, dir, { channel: "benchmark" })
      const text = "[CONTROLLER CONTEXT]\n// src/app.js:1"
      const capture = captureBenchmarkPacket(store, "ses_one", text)
      expect(capture?.bytes).toBe(Buffer.byteLength(text))
      expect(fs.readFileSync(capture!.file, "utf8")).toBe(text)
      expect(captureBenchmarkPacket(store, "../escape", text)).toBeUndefined()
    } finally { fs.rmSync(dir, { recursive: true, force: true }) }
  })

  test("system hook captures its injected packet only with benchmark opt-in", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "relay-hook-packet-"))
    const previous = process.env.OPENRELAY_CAPTURE_CONTEXT
    const previousContext = process.env.OPENRELAY_CONTEXT
    try {
      const workspace = path.join(dir, "workspace")
      fs.mkdirSync(workspace)
      fs.writeFileSync(path.join(workspace, "index.html"), '<div class="panel-header">Status</div>')
      fs.writeFileSync(path.join(workspace, "styles.css"), ".panel-header { color: red; }")
      const prompt = "Update the status shown in `.panel-header` to include a version badge."
      process.env.OPENRELAY_CONTEXT = "on"
      for (const enabled of [true, false]) {
        process.env.OPENRELAY_CAPTURE_CONTEXT = enabled ? "on" : "off"
        const telemetryDir = path.join(dir, enabled ? "on" : "off")
        const hooks = await plugin({ worktree: workspace, directory: workspace } as any, {
          telemetry: { enabled: true, dir: telemetryDir }, filtering: { enabled: false },
          context: { enabled: true }, runtime: { channel: "benchmark", buildID: "test" },
        })
        const sessionID = enabled ? "ses_capture_on" : "ses_capture_off"
        await hooks["chat.message"]!({ sessionID, agent: "build" } as any,
          { message: {} as any, parts: [{ type: "text", text: prompt } as any] })
        const output = { system: [] as string[] }
        await hooks["experimental.chat.system.transform"]!({ sessionID } as any, output)
        await hooks["experimental.chat.system.transform"]!({ sessionID } as any, output)
        expect(output.system).toHaveLength(2)
        const events = fs.readdirSync(path.join(telemetryDir, "events")).flatMap(name =>
          fs.readFileSync(path.join(telemetryDir, "events", name), "utf8").trim().split("\n").map(line => JSON.parse(line)))
        const captured = events.filter(e => e.type === "context.packet_captured")
        expect(captured).toHaveLength(enabled ? 1 : 0)
        if (enabled) expect(fs.readFileSync(captured[0].data.file, "utf8")).toBe(output.system[0])
      }
    } finally {
      if (previous === undefined) delete process.env.OPENRELAY_CAPTURE_CONTEXT
      else process.env.OPENRELAY_CAPTURE_CONTEXT = previous
      if (previousContext === undefined) delete process.env.OPENRELAY_CONTEXT
      else process.env.OPENRELAY_CONTEXT = previousContext
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
