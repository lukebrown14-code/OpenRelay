#!/usr/bin/env node
import { spawn } from "node:child_process"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { randomUUID, createHash } from "node:crypto"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, "../..")
const fixtures = path.join(repo, "benchmarks/fixtures")
const outputRoot = path.join(repo, "benchmarks/results/pi-stage-test")
const piBin = process.env.PI_BIN ?? "pi"
const model = "zai-coding-cn/glm-5.3"
const args = Object.fromEntries(process.argv.slice(2).reduce((out, arg, i, all) => {
  if (arg.startsWith("--")) out.push([arg.slice(2), all[i + 1]])
  return out
}, []))

function die(message) { console.error(`error: ${message}`); process.exit(2) }
if (!args.fixture || !["on", "off"].includes(args.filtering) || !["on", "off"].includes(args.context) || !args.label || !args.rep) {
  die("usage: node benchmarks/pi/run.mjs --fixture <name> --filtering on|off --context on|off --label <id> --rep <n> [--timeout 480]")
}
if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,80}$/.test(args.label) || !/^\d+$/.test(args.rep)) die("invalid label or repetition")
const fixtureDir = path.join(fixtures, args.fixture)
if (!fs.existsSync(path.join(fixtureDir, "TASK.md")) || !fs.existsSync(path.join(fixtureDir, "verify.js"))) die(`invalid fixture: ${args.fixture}`)
const timeoutMs = Number(args.timeout ?? 480) * 1000
if (!Number.isFinite(timeoutMs) || timeoutMs < 1000) die("invalid timeout")

const labelDir = path.join(outputRoot, args.label)
const runID = `${args.fixture}-f${args.filtering}-c${args.context}-r${args.rep}-${randomUUID()}`
const runDir = path.join(labelDir, runID)
const isolatedRoot = fs.mkdtempSync(path.join(os.tmpdir(), `openrelay-pi-${randomUUID()}-`))
const worktree = path.join(isolatedRoot, "worktree")
const sessionDir = path.join(runDir, "sessions")
const dataDir = path.join(runDir, "relay-data")
const shellTmp = path.join(worktree, ".pi-tmp")
fs.mkdirSync(runDir, { recursive: true, mode: 0o700 })
fs.mkdirSync(sessionDir, { recursive: true, mode: 0o700 })
fs.mkdirSync(worktree, { recursive: true, mode: 0o700 })
fs.mkdirSync(shellTmp, { recursive: true, mode: 0o700 })
const realWorktree = fs.realpathSync(worktree)
const verifier = path.join(runDir, "verify.js")
fs.copyFileSync(path.join(fixtureDir, "verify.js"), verifier)
const verifierHash = createHash("sha256").update(fs.readFileSync(verifier)).digest("hex")
fs.cpSync(fixtureDir, worktree, { recursive: true, filter: (source) => source !== shellTmp })
for (const name of ["verify.js", "ground-truth.json", "setup.mjs"]) fs.rmSync(path.join(worktree, name), { recursive: true, force: true })
const task = fs.readFileSync(path.join(fixtureDir, "TASK.md"), "utf8")
const taskHash = createHash("sha256").update(task).digest("hex")
const sessionID = randomUUID()
const sandboxProfile = path.join(runDir, "bash-sandbox.sb")
const allowedReads = ["/System", "/usr", "/bin", "/sbin", "/Library/Apple/System/Library", "/opt/homebrew", "/usr/local", realWorktree]
const profileText = [
  "(version 1)", "(deny default)", "(allow process*)", "(allow sysctl-read)", "(allow mach-lookup)",
  ...allowedReads.map((p) => `(allow file-read* (subpath ${JSON.stringify(p)}))`),
  `(allow file-write* (subpath ${JSON.stringify(realWorktree)}))`,
  "(allow file-read* (literal \"/dev/null\") (literal \"/dev/urandom\"))",
].join("\n") + "\n"
fs.writeFileSync(sandboxProfile, profileText, { mode: 0o600 })
const sandboxProbe = spawnSync("/usr/bin/sandbox-exec", ["-f", sandboxProfile, "--", "/bin/bash", "-c", "pwd"], { cwd: worktree, encoding: "utf8", timeout: 5000 })
if (sandboxProbe.error || sandboxProbe.status !== 0) {
  const blocked = { status: "STOPPED_BEFORE_MODEL", reason: "macOS sandbox unavailable or rejected by host", code: sandboxProbe.status, signal: sandboxProbe.signal, at: new Date().toISOString() }
  fs.writeFileSync(path.join(runDir, "preflight.json"), `${JSON.stringify(blocked, null, 2)}\n`, { mode: 0o600 })
  console.error(JSON.stringify({ ...blocked, runDir }))
  fs.rmSync(isolatedRoot, { recursive: true, force: true })
  process.exit(3)
}
const observerFile = path.join(runDir, "observer.jsonl")
const contextFile = path.join(runDir, "context.jsonl")
const packetDir = path.join(runDir, "packets")
const stdoutPath = path.join(runDir, "pi.stdout.jsonl")
const stderrPath = path.join(runDir, "pi.stderr.log")
const sourceHash = (name) => createHash("sha256").update(fs.readFileSync(path.join(repo, name))).digest("hex")
const startAt = Date.now()
const manifest = {
  schema: 1, runID, sessionID, fixture: args.fixture, label: args.label, repetition: Number(args.rep),
  model, filtering: args.filtering, context: args.context, piVersion: "0.87.1", timeoutMs,
  taskSha256: taskHash, verifierSha256: verifierHash,
  extensions: {
    filtering: sourceHash("plugins/pi/filtering/index.ts"),
    context: sourceHash("plugins/pi/context/index.ts"),
    observer: sourceHash("benchmarks/pi/observer.ts"),
    confinement: sourceHash("benchmarks/pi/confinement.ts"),
  },
  startedAt: new Date(startAt).toISOString(),
}
fs.writeFileSync(path.join(runDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 })

const extensionFiles = [
  path.join(repo, "benchmarks/pi/observer.ts"),
  path.join(repo, "plugins/pi/filtering/index.ts"),
  path.join(repo, "plugins/pi/context/index.ts"),
  path.join(repo, "benchmarks/pi/confinement.ts"),
]
const command = ["--no-extensions", "--provider", "zai-coding-cn", "--model", "glm-5.3", "--session-id", sessionID,
  "--session-dir", sessionDir, "--mode", "json", "--no-context-files", "--no-skills",
  "--no-prompt-templates", "--no-themes", ...extensionFiles.flatMap((f) => ["--extension", f]), "-p", "--", task]
const env = {
  ...process.env,
  TMPDIR: shellTmp,
  OPENRELAY_PI_FILTERING: args.filtering,
  OPENRELAY_PI_CONTEXT: args.context,
  OPENRELAY_PI_DATA_DIR: dataDir,
  OPENRELAY_PI_OBSERVER_FILE: observerFile,
  OPENRELAY_PI_CONTEXT_FILE: contextFile,
  OPENRELAY_PI_PACKET_DIR: packetDir,
  OPENRELAY_PI_SANDBOX_PROFILE: sandboxProfile,
}
const outFd = fs.openSync(stdoutPath, "w", 0o600)
const errFd = fs.openSync(stderrPath, "w", 0o600)
let timedOut = false
let spawned
const child = spawn(piBin, command, { cwd: worktree, env, stdio: ["ignore", outFd, errFd], detached: true })
spawned = child.pid
const timer = setTimeout(() => {
  timedOut = true
  try { process.kill(-spawned, "SIGTERM") } catch {}
  setTimeout(() => { try { process.kill(-spawned, "SIGKILL") } catch {} }, 5000).unref()
}, timeoutMs)
let tokenCapExceeded = false
const capPoll = setInterval(() => {
  try {
    if (!fs.existsSync(observerFile)) return
    const seen = new Set()
    let recorded = 0
    for (const line of fs.readFileSync(observerFile, "utf8").split("\n")) {
      let event
      try { event = JSON.parse(line) } catch { continue }
      if (event.type !== "assistant_message" || !event.usage) continue
      const identity = event.sequence ?? `${event.ts}:${seen.size}`
      if (seen.has(identity)) continue
      seen.add(identity)
      const u = event.usage
      recorded += Number(u.input ?? 0) + Number(u.cacheRead ?? 0) + Number(u.cacheWrite ?? 0) + Number(u.output ?? 0)
    }
    if (recorded >= 300_000) {
      tokenCapExceeded = true
      try { process.kill(-spawned, "SIGTERM") } catch {}
      setTimeout(() => { try { process.kill(-spawned, "SIGKILL") } catch {} }, 5000).unref()
      clearInterval(capPoll)
    }
  } catch {}
}, 500)
const exit = await new Promise((resolve) => child.on("close", (code, signal) => resolve({ code, signal })))
clearTimeout(timer)
clearInterval(capPoll)
fs.closeSync(outFd)
fs.closeSync(errFd)

// Restore the verifier from the frozen harness copy, then run it independently.
fs.copyFileSync(verifier, path.join(worktree, "verify.js"))
const verifyStart = Date.now()
const verifyOut = fs.openSync(path.join(runDir, "verify.stdout.log"), "w", 0o600)
const verifyErr = fs.openSync(path.join(runDir, "verify.stderr.log"), "w", 0o600)
const verify = spawn("node", ["verify.js"], { cwd: worktree, stdio: ["ignore", verifyOut, verifyErr] })
const verifyExit = await new Promise((resolve) => verify.on("close", resolve))
fs.closeSync(verifyOut)
fs.closeSync(verifyErr)
const verifyMs = Date.now() - verifyStart

let entries = []
for (const name of fs.readdirSync(sessionDir).filter((name) => name.endsWith(".jsonl"))) {
  try { entries.push(...fs.readFileSync(path.join(sessionDir, name), "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line))) } catch {}
}
const messageEntries = entries.filter((entry) => entry.type === "message" && entry.message?.role === "assistant")
const messages = messageEntries.map((entry) => entry.message)
const observer = fs.existsSync(observerFile) ? fs.readFileSync(observerFile, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line)) : []
const assistantEvents = observer.filter((e) => e.type === "assistant_message")
const requiredUsage = ["input", "output", "cacheRead", "cacheWrite", "totalTokens"]
const usageAvailable = (u) => Boolean(u && requiredUsage.every((k) => Number.isFinite(u[k])))
const usageMessages = messages.filter((m) => usageAvailable(m.usage))
const sums = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, totalTokens: 0, costTotal: 0 }
for (const m of usageMessages) {
  for (const k of ["input", "cacheRead", "cacheWrite", "output", "totalTokens"]) sums[k] += Number(m.usage[k] ?? 0)
  sums.costTotal += Number(m.usage.cost?.total ?? 0)
}
const eventUsageCount = assistantEvents.filter((e) => e.usage).length
const providerUsageCoverage = messages.length ? usageMessages.length / messages.length : 0
const eventsMatchSession = messages.length === assistantEvents.length && messages.every((m, i) => {
  const eventUsage = assistantEvents[i]?.usage
  return usageAvailable(m.usage) && usageAvailable(eventUsage) && requiredUsage.every((k) => Number(m.usage[k]) === Number(eventUsage[k]))
})
const tokenCoverage = Math.min(providerUsageCoverage, assistantEvents.length ? eventUsageCount / assistantEvents.length : 0, eventsMatchSession ? 1 : 0)
const contextEvents = fs.existsSync(contextFile) ? fs.readFileSync(contextFile, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line)) : []
const calls = observer.filter((e) => e.type === "tool_result")
const filterEvents = []
try {
  for (const name of fs.readdirSync(path.join(dataDir, "events"))) {
    const file = path.join(dataDir, "events", name)
    filterEvents.push(...fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line)).filter((e) => e.type === "tool.filtered"))
  }
} catch {}
const result = {
  ...manifest,
  endedAt: new Date().toISOString(),
  elapsedMs: Date.now() - startAt,
  verificationMs: verifyMs,
  piExitCode: exit.code,
  piSignal: exit.signal,
  timedOut,
  tokenCapExceeded,
  verifyExitCode: verifyExit,
  verifyPass: verifyExit === 0,
  assistantMessageCount: messages.length,
  assistantUsageCount: usageMessages.length,
  assistantEventCount: assistantEvents.length,
  eventUsageCount,
  usageCoverage: tokenCoverage,
  usage: sums,
  promptTokens: sums.input + sums.cacheRead + sums.cacheWrite,
  toolResultCount: calls.length,
  toolErrorCount: calls.filter((e) => e.isError).length,
  filteringResultCount: filterEvents.length,
  filteringEvents: filterEvents,
  usageReconcilesSession: eventsMatchSession,
  context: contextEvents,
}
fs.writeFileSync(path.join(runDir, "run.json"), `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 })
console.log(JSON.stringify({ runID, runDir, verifyPass: result.verifyPass, piExitCode: result.piExitCode, timedOut, usageCoverage: result.usageCoverage, promptTokens: result.promptTokens, totalTokens: sums.totalTokens, elapsedMs: result.elapsedMs, filteringResults: result.filteringResultCount, context: contextEvents.map((e) => e.type) }))
fs.cpSync(worktree, path.join(runDir, "workspace-final"), { recursive: true })
fs.rmSync(isolatedRoot, { recursive: true, force: true })
if (timedOut || tokenCapExceeded || exit.code !== 0 || verifyExit !== 0 || tokenCoverage < 1) process.exitCode = 1
