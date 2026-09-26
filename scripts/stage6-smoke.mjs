// Stage 6D bounded smoke: one real handoff delivery + session/model association.
// Zero plugin registration — drives lib/handoff/session.ts directly against a live
// `opencode serve` via the routes verified in 6A. Receiver: glm-5.3-flash (1 call).
//   bun scripts/stage6-smoke.mjs
import { spawnSync, spawn } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createHash, randomUUID } from "node:crypto"
import { fileURLToPath } from "node:url"
import { prepareHandoff, continueWithHandoff } from "../plugins/token-efficient/lib/handoff/session.ts"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const sha = (buf) => createHash("sha256").update(buf).digest("hex")
const events = []
const sink = (type, data) => {
  events.push({ ts: new Date().toISOString(), type, data })
  console.log(`  event: ${type} ${JSON.stringify(data).slice(0, 140)}`)
}

// ---- receiver model (cheap flash; explicit, visible target) ----
const MODEL = { providerID: "zai-coding-plan", modelID: "glm-5.3-flash" }

// ---- worktree: non-git project exercising the explicit local identity path ----
const worktree = fs.mkdtempSync(path.join(os.tmpdir(), "openrelay-s6-smoke-"))
const auth = "export const session = 'server-side sqlite'\n"
fs.mkdirSync(path.join(worktree, "src"), { recursive: true })
fs.mkdirSync(path.join(worktree, ".codebase", "modules"), { recursive: true })
fs.writeFileSync(path.join(worktree, "src", "auth.ts"), auth)
fs.writeFileSync(path.join(worktree, ".codebase", "memory.json"), JSON.stringify({
  schemaVersion: 1, projectID: "p-smoke", updatedAt: new Date().toISOString(),
  notes: { "n-auth": { schemaVersion: 1, noteID: "n-auth", scope: "module", refs: { paths: ["src/auth.ts"], symbols: [] }, authorKind: "user", lastValidatedAt: new Date().toISOString(), validity: "current", sourceDigests: { "src/auth.ts": sha(auth) } } },
}, null, 1))
fs.writeFileSync(path.join(worktree, ".codebase", "modules", "n-auth.md"), "Auth note: sessions live server-side in sqlite.")

// ---- live server on the worktree ----
const port = 4920 + Math.floor(Math.random() * 60)
console.log(`starting opencode serve on :${port} ...`)
const server = spawn("opencode", ["serve", "--hostname", "127.0.0.1", "--port", String(port)], {
  cwd: worktree,
  env: { ...process.env, OPENCODE_CONFIG_CONTENT: "", OPENRELAY_MEMORY: "", OPENRELAY_HANDOFF: "" },
  stdio: ["ignore", "pipe", "pipe"],
})
const serverLog = []
server.stdout.on("data", (d) => serverLog.push(d.toString()))
server.stderr.on("data", (d) => serverLog.push(d.toString()))
await new Promise((resolve, reject) => {
  const t0 = Date.now()
  const iv = setInterval(() => {
    const line = serverLog.join("").match(/opencode server listening on (http:\/\/\S+)/)
    if (line) { clearInterval(iv); resolve(line[1]) } else if (Date.now() - t0 > 15000) { clearInterval(iv); reject(new Error("serve timeout")) }
  }, 250)
})
const B = `http://127.0.0.1:${port}`
console.log(`server up at ${B}`)

// fetch-based adapter for the two verified routes (POST /session, POST /session/{id}/message)
const client = {
  session: {
    create: async ({ body }) => (await fetch(`${B}/session`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) })).json(),
    prompt: async ({ path: p, body }) => (await fetch(`${B}/session/${p.id}/message`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).json(),
  },
}

try {
  const senderSession = `ses_smoke_sender_${randomUUID().slice(0, 8)}`
  // 1. prepare
  console.log("prepareHandoff ...")
  const prep = prepareHandoff(worktree, {
    sessionID: senderSession,
    objective: "Move session storage from sqlite to redis without changing the public API",
    constraints: ["no new dependencies"],
    acceptanceCriteria: ["smoke verifier exits 0"],
    nextSteps: ["add redis adapter"],
    relevantFiles: ["src/auth.ts"],
  }, sink)
  if (!prep.ok) throw new Error(`prepare failed: ${prep.reason} ${prep.detail ?? ""}`)
  console.log(`  prepared ${prep.handoffID} (task ${prep.taskID}, workflow ${prep.workflowID}, ${prep.bytes}B)`)

  // 2. deliver (one real model call)
  console.log(`continueWithHandoff (receiver ${MODEL.providerID}/${MODEL.modelID}) ...`)
  const t0 = Date.now()
  const cont = await continueWithHandoff(client, worktree, {
    sessionID: senderSession,
    model: MODEL,
    agent: "build",
    memoryText: "Project memory: Auth note — sessions live server-side in sqlite.",
  }, sink)
  if (!cont.ok) throw new Error(`continue failed: ${cont.reason} ${cont.detail ?? ""}`)
  const ms = Date.now() - t0
  console.log(`  delivered to ${cont.receiverSessionID} in ${(ms / 1000).toFixed(1)}s (${cont.bytes}B)`)
  const results = { prep, cont, ms }

  // 3. verify session/model association on the server
  const receiver = results.cont.receiverSessionID
  const sess = await (await fetch(`${B}/session/${receiver}`)).json()
  const s = sess.data ?? sess
  console.log(`  receiver session: title=${JSON.stringify(s.title)} model=${JSON.stringify(s.model)}`)
  const msgs = await (await fetch(`${B}/session/${receiver}/message`)).json()
  const list = Array.isArray(msgs) ? msgs : msgs.data ?? []
  console.log(`  receiver messages: ${list.length}`)
  for (const m of list) {
    const info = m.data ?? m
    console.log(`    - role=${info.role} model=${info.modelID ?? "-"} provider=${info.providerID ?? "-"}`)
    if (info.role === "assistant") {
      const parts = info.parts ?? []
      const text = parts.filter((p) => p.type === "text").map((p) => p.text).join(" ")
      console.log(`      reply: ${text.slice(0, 220).replace(/\n/g, " ")}`)
    }
  }
  const userMsg = list.map((m) => m.data ?? m).find((m) => m.role === "user")
  const modelOk = (s.model && (s.model.modelID ?? s.model.id) === MODEL.modelID) || (userMsg?.model?.modelID ?? userMsg?.modelID) === MODEL.modelID
  console.log(`model association: ${modelOk ? "OK" : "MISMATCH"}`)

  // 4. task record linkage + telemetry
  const rec = JSON.parse(fs.readFileSync(path.join(worktree, ".tasks", results.prep.taskID, "state.json"), "utf8"))
  console.log(`task record: continuationSessions=${JSON.stringify(rec.continuationSessions)} workflowID=${rec.workflowID}`)
  const linked = rec.continuationSessions.includes(receiver)
  console.log(`receiver linked on task record: ${linked ? "OK" : "MISSING"}`)

  const consumed = events.find((e) => e.type === "handoff.consumed")
  console.log(`telemetry handoff.consumed: ${consumed ? JSON.stringify(consumed.data).slice(0, 160) : "MISSING"}`)
  const prepared = events.find((e) => e.type === "handoff.prepared")
  console.log(`telemetry handoff.prepared: ${prepared ? "OK" : "MISSING"}`)

  const pass = linked && modelOk && Boolean(consumed) && Boolean(prepared)
  const log = { startedAt: new Date().toISOString(), worktree, receiver, model: MODEL, events, pass }
  fs.mkdirSync(path.join(__dirname, "..", "docs", "stage6"), { recursive: true })
  fs.writeFileSync(path.join(__dirname, "..", "docs", "stage6", "smoke-result.json"), JSON.stringify(log, null, 1))
  console.log(`\nSMOKE ${pass ? "PASS" : "FAIL"} (log: docs/stage6/smoke-result.json)`)
  process.exitCode = pass ? 0 : 1
} catch (e) {
  console.error(`SMOKE ERROR: ${e.message}`)
  fs.writeFileSync(path.join(__dirname, "..", "docs", "stage6", "smoke-result.json"), JSON.stringify({ events, error: String(e) }, null, 1))
  process.exitCode = 1
} finally {
  server.kill("SIGTERM")
}
