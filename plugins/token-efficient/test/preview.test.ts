import fs from "node:fs"
import path from "node:path"
import { afterAll, expect, test } from "bun:test"
import plugin from "../index"
import { previewSource, previewView } from "../lib/filtering/preview"
import { retrieveRaw } from "../tools/raw-output"
import { saveRawOutput, loadRawOutput, sweepExpired } from "../lib/filtering/raw-store"
import { tmpDir } from "./helpers"

const dir = tmpDir()
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))
export function tap(failure = false) {
  return ["TAP version 13", ...Array.from({ length: 300 }, (_, i) => `# Subtest: passing ${i}\nok ${i + 1} - passing ${i}\n  ---\n  duration_ms: 0.3\n  type: 'test'\n  ...`),
    ...(failure ? ["not ok 301 - broken", "  ---", "  expected:", "    deep: valuable", "  actual:", "    deep: incorrect", "  stack: |-", "    one", "    two", "  ..."] : []),
    "warning: user-defined warning", "artifact: /tmp/report.json", `# tests ${failure ? 301 : 300}`, "# pass 300", `# fail ${failure ? 1 : 0}`, "# cancelled 0", "# skipped 0", "# todo 0"].join("\n")
}

test("preview preserves complete failure blocks, warnings and artifacts", () => {
  const out = previewView(tap(true), "npm test", 1)!
  expect(out).toContain("  expected:\n    deep: valuable\n  actual:\n    deep: incorrect")
  expect(out).toContain("    one\n    two")
  expect(out).toContain("warning: user-defined warning")
  expect(out).toContain("artifact: /tmp/report.json")
  expect(out.length).toBeLessThan(tap(true).length / 5)
})
test("success requires a consistent complete report; unknown commands and compounds bypass", () => {
  expect(previewView(tap(), "npm test", 0)).not.toBeNull()
  for (const cmd of ["node verify.js && npm test", "npm test; true", "npm test || true", "echo npm test", "npm test | tail"]) {
    expect(previewView(tap(), cmd, 0)).toBeNull()
  }
  expect(previewView(tap().replace("# tests 300", "# tests 301"), "npm test", 0)).toBeNull()
  expect(previewView(tap(true), "npm test", 0)).toBeNull()
})
test("unreadable, symlinked, oversized or absent truncated source bypasses", () => {
  expect(previewSource({ truncated: true }, tap(), 100000)).toBeNull()
  expect(previewSource({ outputPath: path.join(dir, "absent") }, tap(), 100000)).toBeNull()
  const file = path.join(dir, "full.log"), link = path.join(dir, "link")
  fs.writeFileSync(file, tap(true)); fs.symlinkSync(file, link)
  expect(previewSource({ outputPath: file }, "tail", 100000)).toBe(tap(true))
  expect(previewSource({ outputPath: file }, "tail", 10)).toBeNull()
  expect(previewSource({ outputPath: link }, "tail", 100000)).toBeNull()
})
test("search cursor advances and oversized Unicode lines reconstruct exactly", () => {
  const text = Array.from({ length: 500 }, (_, i) => `needle ${i}`).join("\n")
  const a = retrieveRaw(text, { mode: "search", query: "needle", context: 0 })
  const b = retrieveRaw(text, { mode: "search", query: "needle", startLine: a.nextStartLine, context: 0 })
  expect(b.sourceLines[0]).toBe(201)
  expect(a.matchCount).toBe(500)
  const huge = "🎉".repeat(16000)
  let whole = "", startLine = 1, startOffset = 0, count = 0
  for (;;) {
    const page = retrieveRaw(huge, { mode: "range", startLine, startOffset })
    expect(page.text.length).toBeGreaterThan(0)
    expect(page.text).not.toContain("\uFFFD")
    whole += page.text
    if (!page.hasMore) break
    startLine = page.nextStartLine!; startOffset = page.nextStartOffset ?? 0
    if (++count > 10) throw new Error("Pagination did not advance")
  }
  expect(whole).toBe(huge)
})
test("custom TTL and cleanup are confined to their channel", () => {
  const daily = path.join(dir, "daily"), dev = path.join(dir, "dev")
  const a = saveRawOutput({ sessionID: "same", content: "daily", dir: daily })!
  const b = saveRawOutput({ sessionID: "same", content: "dev", dir: dev })!
  fs.utimesSync(path.join(dev, "same", b), new Date(0), new Date(0))
  expect(loadRawOutput({ sessionID: "same", ref: b, dir: dev, ttlMs: 1 })).toBeNull()
  sweepExpired({ dir: dev, ttlMs: 1 })
  expect(loadRawOutput({ sessionID: "same", ref: a, dir: daily })).toBe("daily")
  expect(fs.existsSync(path.join(dev, "same"))).toBe(false)
})
test("concurrent hook instances write and recover only their own root", async () => {
  const roots = [path.join(dir, "hook-daily"), path.join(dir, "hook-dev")]
  await Promise.all(roots.map(async (root, i) => {
    const hooks: any = await plugin({ worktree: dir, directory: dir } as any, {
      telemetry: { dir: root }, filtering: { enabled: true, previewSafe: true }, runtime: { channel: String(i), buildID: "test" },
    })
    const output = { output: tap(true), metadata: { exit: 1 } }
    await hooks["tool.execute.after"]({ tool: "bash", sessionID: "session", callID: "call", args: { command: "npm test" } }, output)
    const ref = /ref=([a-f0-9]+)/.exec(output.output)![1]
    expect(loadRawOutput({ sessionID: "session", ref, dir: path.join(root, "raw") })).toBe(tap(true))
    expect(loadRawOutput({ sessionID: "session", ref, dir: path.join(roots[1 - i], "raw") })).toBeNull()
    const events = fs.readFileSync(path.join(root, "events", fs.readdirSync(path.join(root, "events"))[0]), "utf8")
    expect(events).toContain(`"channel":"${i}"`)
    await hooks.dispose()
  }))
})
