import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterAll, describe, expect, test } from "bun:test"
import { Store } from "../lib/store"
import { classifyCommand } from "../lib/filtering/classify"
import { filterToolOutput, sanitizeFilterMetadata } from "../lib/filtering/filter"
import { DEFAULT_FILTERING } from "../lib/filtering/config"
import type { FilteringConfig } from "../lib/filtering/config"
import { loadRawOutput } from "../lib/filtering/raw-store"
import { edges } from "./fixtures/edges"
import { tmpDir } from "./helpers"

function cfg(over: Partial<FilteringConfig> = {}): FilteringConfig {
  return { ...DEFAULT_FILTERING, enabled: true, minBytes: 10, ...over }
}

const dirs: string[] = []
function freshStore(): Store {
  const d = tmpDir()
  dirs.push(d)
  return new Store(d, d, d)
}

function tmpFile(name: string, content: string): string {
  const d = tmpDir()
  dirs.push(d)
  const p = path.join(d, name)
  fs.writeFileSync(p, content)
  return p
}

const tapFailure: string = edges.nodeTestTapFailing.text
const tapPassing: string = edges.nodeTestTapPassing.text

function padded(text: string, padLines: number): string {
  const head = Array.from({ length: padLines }, (_, i) => `ok ${i + 1} - filler case #${i}`).join("\n")
  return `${head}\n${text}`
}

afterAll(() => {
  for (const d of dirs) {
    try {
      fs.rmSync(d, { recursive: true, force: true })
    } catch {}
  }
})

describe("2b: full-log access via metadata.outputPath", () => {
  test("failure beyond the tail is extracted from the full log", async () => {
    const store = freshStore()
    const rawDir = tmpDir()
    dirs.push(rawDir)
    const fullLog = padded(tapFailure, 4600)
    const tail = fullLog.split("\n").slice(-40).join("\n")
    const logPath = tmpFile("full.log", fullLog)
    const out = await filterToolOutput({
      tool: "bash",
      command: "npm test",
      output: `...output truncated...\nFull output saved to: ${logPath}\n\n${tail}`,
      sessionID: "ses-2b-full",
      config: cfg(),
      store,
      rawDir,
      metadata: { exit: 1, truncated: true, outputPath: logPath },
    })
    expect(out).not.toBeNull()
    expect(out!.filtered).toContain("formatBytes(1024)")
    expect(out!.filtered).toContain("want: 1 KB")
    expect(out!.filtered).toContain("got: 1024 B")
    expect(out!.filtered).toContain(`[harness log: ${logPath}]`)
    const raw = loadRawOutput({ sessionID: "ses-2b-full", ref: out!.ref, dir: rawDir })
    expect(raw).not.toBeNull()
    expect(raw!.includes("formatBytes(1024)")).toBe(true)
  })

  test("unreachable outputPath falls back to the inline output", async () => {
    const store = freshStore()
    const rawDir = tmpDir()
    dirs.push(rawDir)
    const out = await filterToolOutput({
      tool: "bash",
      command: "npm test",
      output: tapFailure,
      sessionID: "ses-2b-fallback",
      config: cfg(),
      store,
      rawDir,
      metadata: { exit: 1, outputPath: "/nonexistent/path/full.log" },
    })
    expect(out).not.toBeNull()
    expect(out!.filtered).toContain("formatBytes(1024)")
  })
})

describe("2b: bail rule", () => {
  test("recognized failing command with summary but zero evidence returns null", async () => {
    const store = freshStore()
    const text = `${tapPassing.replace("# fail 0", "# fail 1").replace("# pass 2", "# pass 1")}\nmore noise\n`
    const out = await filterToolOutput({
      tool: "bash",
      command: "npm test",
      output: text,
      sessionID: "ses-2b-bail",
      config: cfg(),
      store,
      rawDir: tmpDir(),
      metadata: { exit: 1 },
    })
    expect(out).toBeNull()
  })
})

describe("2b: PASS-collapse", () => {
  test("recognized exit-0 command collapses to a verdict", async () => {
    const store = freshStore()
    const rawDir = tmpDir()
    dirs.push(rawDir)
    const out = await filterToolOutput({
      tool: "bash",
      command: "npm test",
      output: tapPassing,
      sessionID: "ses-2b-pass",
      config: cfg(),
      store,
      rawDir,
      metadata: { exit: 0 },
    })
    expect(out).not.toBeNull()
    expect(out!.filtered).toContain("PASS (exit 0)")
    expect(out!.filtered).toContain("# pass 2")
    expect(out!.filtered).toContain("openrelay_raw_output ref=")
    expect(Buffer.byteLength(out!.filtered)).toBeLessThan(300)
  })

  test("exit-0 output containing detected failures is left unchanged (contradiction)", async () => {
    const store = freshStore()
    const out = await filterToolOutput({
      tool: "bash",
      command: "npm test",
      output: tapFailure,
      sessionID: "ses-2b-contradiction",
      config: cfg(),
      store,
      rawDir: tmpDir(),
      metadata: { exit: 0 },
    })
    expect(out).toBeNull()
  })
})

describe("2b: compound commands", () => {
  test("compound with unknown part fails closed on non-zero exit", async () => {
    const cls = classifyCommand("node verify.js && npm test")
    expect(cls).not.toBeNull()
    expect(cls!.reason).toBe("npm-test:v1")
    expect(cls!.compound).toBe(true)
    expect(cls!.unknownParts).toBe(1)
    const store = freshStore()
    const out = await filterToolOutput({
      tool: "bash",
      command: "node verify.js && npm test",
      output: tapFailure,
      sessionID: "ses-2b-compound-fail",
      config: cfg(),
      store,
      rawDir: tmpDir(),
      metadata: { exit: 1 },
    })
    expect(out).toBeNull()
  })

  test("compound with unknown part collapses on exit 0", async () => {
    const store = freshStore()
    const rawDir = tmpDir()
    dirs.push(rawDir)
    const out = await filterToolOutput({
      tool: "bash",
      command: "node verify.js && npm test",
      output: tapPassing,
      sessionID: "ses-2b-compound-pass",
      config: cfg(),
      store,
      rawDir,
      metadata: { exit: 0 },
    })
    expect(out).not.toBeNull()
    expect(out!.filtered).toContain("PASS (exit 0)")
  })

  test("fully classified compound filters on failure", async () => {
    const cls = classifyCommand("npm test && npx tsc --noEmit")
    expect(cls).not.toBeNull()
    expect(cls!.reason).toBe("npm-test:v1")
    expect(cls!.compound).toBe(true)
    expect(cls!.unknownParts).toBe(0)
    const store = freshStore()
    const out = await filterToolOutput({
      tool: "bash",
      command: "npm test && npx tsc --noEmit",
      output: tapFailure,
      sessionID: "ses-2b-compound-full",
      config: cfg(),
      store,
      rawDir: tmpDir(),
      metadata: { exit: 1 },
    })
    expect(out).not.toBeNull()
    expect(out!.filtered).toContain("formatBytes(1024)")
  })
})

describe("2b: metadata sanitization", () => {
  test("drops the raw output leak, keeps small keys", () => {
    const sanitized = sanitizeFilterMetadata({
      output: "x".repeat(30005),
      exit: 1,
      truncated: true,
      outputPath: "/tmp/log",
    })
    expect(sanitized).toEqual({ exit: 1, truncated: true, outputPath: "/tmp/log" })
  })

  test("handles non-objects", () => {
    expect(sanitizeFilterMetadata(undefined)).toEqual({})
    expect(sanitizeFilterMetadata("str")).toEqual({})
  })
})
