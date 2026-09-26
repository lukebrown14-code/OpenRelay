#!/usr/bin/env node
import { spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const outputRoot = path.join(root, "benchmarks/results/pi-stage-test")
const label = `canary-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`
const labelDir = path.join(outputRoot, label)
fs.mkdirSync(labelDir, { recursive: true, mode: 0o700 })
const plan = [
  { fixture: "05-noisy-test-log", filtering: "on", context: "off", rep: "1" },
  { fixture: "06-ui-status-indicator", filtering: "off", context: "on", rep: "1" },
]
fs.writeFileSync(path.join(labelDir, "schedule.json"), `${JSON.stringify({ label, model: "zai-coding-cn/glm-5.3", piVersion: "0.87.1", plan, startedAt: new Date().toISOString() }, null, 2)}\n`, { mode: 0o600 })
let totalTokens = 0
const maxTokens = 3_000_000
for (const item of plan) {
  if (totalTokens >= maxTokens) throw new Error("aggregate recorded-token ceiling reached")
  const proc = spawn(process.execPath, [path.join(root, "benchmarks/pi/run.mjs"), "--fixture", item.fixture, "--filtering", item.filtering, "--context", item.context, "--label", label, "--rep", item.rep], { cwd: root, stdio: ["ignore", "inherit", "inherit"], env: process.env })
  const code = await new Promise((resolve) => proc.on("close", resolve))
  const entries = fs.readdirSync(labelDir).filter((name) => name.startsWith(`${item.fixture}-f${item.filtering}-c${item.context}-r${item.rep}-`))
  const latest = entries.map((name) => path.join(labelDir, name, "run.json")).filter(fs.existsSync).sort().at(-1)
  if (!latest) throw new Error(`run record missing for ${item.fixture}`)
  const result = JSON.parse(fs.readFileSync(latest, "utf8"))
  totalTokens += result.promptTokens + Number(result.usage?.output ?? 0)
  const delivered = (result.context ?? []).filter((e) => e.type === "context.packet_delivery")
  if (code !== 0 || result.tokenCapExceeded || result.timedOut || !result.verifyPass || result.usageCoverage !== 1) {
    console.error(JSON.stringify({ status: "STOPPED", fixture: item.fixture, code, resultPath: latest, totalTokens }))
    process.exit(1)
  }
  if (item.filtering === "on" && result.filteringResultCount < 1) {
    console.error(JSON.stringify({ status: "STOPPED", reason: "filtering hook did not fire", fixture: item.fixture, resultPath: latest, totalTokens }))
    process.exit(1)
  }
  if (item.context === "on" && (!delivered.length || delivered.some((e) => e.delivered !== true))) {
    console.error(JSON.stringify({ status: "STOPPED", reason: "context packet delivery unproven", fixture: item.fixture, resultPath: latest, totalTokens, delivered }))
    process.exit(1)
  }
}
console.log(JSON.stringify({ status: "CANARIES_PASS", label, labelDir, totalTokens }))
