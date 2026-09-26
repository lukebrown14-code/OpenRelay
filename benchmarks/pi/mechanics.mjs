import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { Store } from "../../plugins/token-efficient/lib/store.ts"
import { resolveFilteringConfig } from "../../plugins/token-efficient/lib/filtering/config.ts"
import { filterToolOutput } from "../../plugins/token-efficient/lib/filtering/filter.ts"
import { loadRawOutput } from "../../plugins/token-efficient/lib/filtering/raw-store.ts"
import { retrieveRaw } from "../../plugins/token-efficient/lib/filtering/retrieve.ts"
import { ContextEngine } from "../../plugins/token-efficient/lib/context/index.ts"
import { resolveContextConfig } from "../../plugins/token-efficient/lib/context/config.ts"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const fixture = path.join(root, "benchmarks/fixtures/05-noisy-test-log")
const raw = spawnSync("npm", ["test"], { cwd: fixture, encoding: "utf8", maxBuffer: 40 * 1024 * 1024, timeout: 30_000 })
if (raw.error || raw.status === null) throw raw.error ?? new Error("noisy fixture test did not exit")
const original = `${raw.stdout ?? ""}${raw.stderr ?? ""}`
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "openrelay-pi-mechanics-"))
try {
  const store = new Store(fixture, fixture, path.join(temp, "telemetry"))
  const sessionID = "pi-mechanics-session"
  const cfg = resolveFilteringConfig({ enabled: true, previewSafe: true })
  const filtered = await filterToolOutput({ tool: "bash", command: "npm test", output: original, sessionID, config: cfg, store, rawDir: path.join(temp, "raw"), metadata: { exitCode: raw.status } })
  if (!filtered) throw new Error("previewSafe filter abstained on the complete noisy TAP log")
  if (!filtered.filtered.includes("not ok ")) throw new Error("filtered noisy TAP output lost failing assertion")
  if (Buffer.byteLength(filtered.filtered) >= Buffer.byteLength(original)) throw new Error("filtered TAP output did not shrink")
  const reloaded = loadRawOutput({ sessionID, ref: filtered.ref, dir: path.join(temp, "raw") })
  if (reloaded !== original) throw new Error("raw recovery did not return the complete original output")
  if (!retrieveRaw(reloaded, { mode: "search", query: "not ok", context: 1 }).text.includes("not ok ")) throw new Error("raw search omitted the failure")
  if (loadRawOutput({ sessionID: "foreign-session", ref: filtered.ref, dir: path.join(temp, "raw") }) !== null) throw new Error("raw output crossed a Pi session boundary")

  const want = new Map([["06-ui-status-indicator", "build"], ["09-ui-shared-style", "build"], ["21-dependency-upgrade", "build"], ["10-git-missing-changes", "skip"]])
  const decisions = []
  for (const [name, verdict] of want) {
    const cwd = path.join(root, "benchmarks/fixtures", name)
    const prompt = fs.readFileSync(path.join(cwd, "TASK.md"), "utf8")
    const events = []
    const engine = new ContextEngine(resolveContextConfig({ enabled: true }), (type, data) => events.push({ type, ...data }))
    engine.prepare(name, cwd, prompt)
    const decision = events.find((e) => e.type === "context.decision")
    const packet = engine.packetFor(name)
    if (decision?.verdict !== verdict) throw new Error(`${name}: expected ${verdict}, got ${decision?.verdict ?? "no decision"}`)
    if (verdict === "build" && (!packet || Buffer.byteLength(packet) > 8192)) throw new Error(`${name}: missing packet or packet exceeds frozen budget`)
    if (verdict === "skip" && packet) throw new Error(`${name}: skip decision emitted a packet`)
    decisions.push({ fixture: name, verdict, bytes: packet ? Buffer.byteLength(packet) : 0 })
  }
  console.log(JSON.stringify({ filtering: { exitCode: raw.status, inputBytes: Buffer.byteLength(original), outputBytes: Buffer.byteLength(filtered.filtered), failurePreserved: true, exactRecovery: true, sessionIsolation: true }, context: decisions }))
} finally { fs.rmSync(temp, { recursive: true, force: true }) }
