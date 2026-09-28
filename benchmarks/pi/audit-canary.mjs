#!/usr/bin/env node
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const runDir = process.argv[2]
if (!runDir) { console.error("usage: node benchmarks/pi/audit-canary.mjs <run-directory>"); process.exit(2) }
const sessionDir = path.join(runDir, "sessions")
const sessionFile = fs.readdirSync(sessionDir).find((name) => name.endsWith(".jsonl"))
if (!sessionFile) throw new Error("session JSONL missing")
const entries = fs.readFileSync(path.join(sessionDir, sessionFile), "utf8").split("\n").filter(Boolean).map(JSON.parse)
const messages = entries.filter((entry) => entry.type === "message" && entry.message?.role === "assistant").map((entry) => entry.message)
const observer = fs.readFileSync(path.join(runDir, "observer.jsonl"), "utf8").split("\n").filter(Boolean).map(JSON.parse)
const events = observer.filter((entry) => entry.type === "assistant_message")
const fields = ["input", "output", "cacheRead", "cacheWrite", "totalTokens"]
const sum = (values) => Object.fromEntries(fields.map((field) => [field, values.reduce((total, entry) => total + Number(entry.usage?.[field] ?? 0), 0)]))
const sessionUsage = sum(messages)
const eventUsage = sum(events)
const usageReconciles = messages.length === events.length && fields.every((key) => sessionUsage[key] === eventUsage[key])
const tools = messages.flatMap((message) => Array.isArray(message.content) ? message.content : [])
const commands = tools.filter((item) => item?.type === "toolCall" && item.name === "bash")
  .map((item) => String(item.arguments?.command ?? ""))
const outsideCommands = commands.filter((cmd) => /(?:^|[\s'"`])\.\.(?:[/\\\s]|$)/.test(cmd))
const toolResults = entries.filter((entry) => entry.type === "message" && entry.message?.role === "toolResult")
const filteredEvidence = toolResults.filter((entry) => (entry.message.content ?? []).some((part) => part?.type === "text" && String(part.text).includes("[preview:")))
const filterEvents = []
try {
  for (const name of fs.readdirSync(path.join(runDir, "relay-data/events"))) {
    filterEvents.push(...fs.readFileSync(path.join(runDir, "relay-data/events", name), "utf8").split("\n").filter(Boolean).map(JSON.parse).filter((entry) => entry.type === "tool.filtered"))
  }
} catch {}
const audit = {
  status: outsideCommands.length ? "INVALID_SCOPE" : usageReconciles ? "MECHANICS_ONLY" : "INVALID_USAGE",
  invalidForTokenComparison: outsideCommands.length > 0 || !usageReconciles,
  sessionFile,
  assistantMessages: messages.length,
  assistantEvents: events.length,
  usageReconciles,
  usage: eventUsage,
  promptTokens: eventUsage.input + eventUsage.cacheRead + eventUsage.cacheWrite,
  tokensIncludingOutput: eventUsage.totalTokens,
  toolCalls: commands.length,
  workspaceEscapeCommands: outsideCommands,
  filteringEvents: filterEvents,
  filteredResultsReachedModel: filteredEvidence.length,
}
const out = path.join(runDir, "canary-audit.json")
fs.writeFileSync(out, `${JSON.stringify(audit, null, 2)}\n`, { mode: 0o600 })
console.log(JSON.stringify({ ...audit, auditFile: out }, null, 2))
if (audit.invalidForTokenComparison) process.exitCode = 1
