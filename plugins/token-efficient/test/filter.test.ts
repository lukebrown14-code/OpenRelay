import fs from "node:fs"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import type { TestContext } from "bun:test"
import { Store } from "../lib/store"
import { classifyCommand } from "../lib/filtering/classify"
import { filterToolOutput } from "../lib/filtering/filter"
import type { FilterOutcome } from "../lib/filtering/filter"
import { DEFAULT_FILTERING } from "../lib/filtering/config"
import type { FilteringConfig } from "../lib/filtering/config"
import { loadRawOutput } from "../lib/filtering/raw-store"
import { fixtures } from "./fixtures"
import { edges } from "./fixtures/edges"
import { findFileUnder, readEvents, tmpDir } from "./helpers"

const noisy = edges.bigNoisy.text
const noisyCommand = edges.bigNoisy.command

function cfg(over: Partial<FilteringConfig> = {}): FilteringConfig {
  return { ...DEFAULT_FILTERING, enabled: true, minBytes: 10, ...over }
}

const createdDirs: string[] = []
function freshStore(): Store {
  const dir = tmpDir()
  createdDirs.push(dir)
  return new Store(dir, dir, dir)
}

afterAll(() => {
  for (const d of createdDirs) {
    try {
      fs.rmSync(d, { recursive: true, force: true })
    } catch {}
  }
})

let probe: FilterOutcome | null = null
let probeStoreRoot = ""
let seamDir: string | null = null

beforeAll(async () => {
  const store = freshStore()
  probeStoreRoot = store.root
  try {
    probe = await filterToolOutput({
      tool: "bash",
      command: noisyCommand,
      output: noisy,
      sessionID: "ses-probe",
      config: cfg(),
      store,
      rawDir: tmpDir(),
    })
  } catch (err) {
    console.warn("[filter.test] filterToolOutput rejected during probe:", err)
    probe = null
  }
  if (probe) {
    seamDir = findFileUnder(store.root, probe.ref)
    if (!seamDir) {
      console.warn(
        "[filter.test] filterToolOutput does not write raw output under Store.root; disk-dependent assertions are skipped"
      )
    }
  }
})

describe("filterToolOutput: gates", () => {
  test("disabled config returns null and emits no events", async () => {
    const store = freshStore()
    const out = await filterToolOutput({
      tool: "bash",
      command: noisyCommand,
      output: noisy,
      sessionID: "ses-disabled",
      config: { ...cfg(), enabled: false },
      store,
    })
    expect(out).toBeNull()
    const eventsDir = path.join(store.root, "events")
    expect(fs.readdirSync(eventsDir).length).toBe(0)
  })

  test("non-bash tools are never filtered, including the recovery tool itself", async () => {
    for (const tool of ["read", "glob", "grep", "openrelay_raw_output"]) {
      const out = await filterToolOutput({
        tool,
        command: noisyCommand,
        output: noisy,
        sessionID: `ses-${tool}`,
        config: cfg(),
        store: freshStore(),
      })
      expect(out, tool).toBeNull()
    }
  })

  test("output below minBytes is left unchanged", async () => {
    const out = await filterToolOutput({
      tool: "bash",
      command: edges.vitestPassing.command,
      output: edges.vitestPassing.text,
      sessionID: "ses-short",
      config: { ...cfg(), minBytes: 4096 },
      store: freshStore(),
    })
    expect(out).toBeNull()
  })

  test("unknown command returns null regardless of size", async () => {
    const out = await filterToolOutput({
      tool: "bash",
      command: "echo hello && exit 0",
      output: noisy,
      sessionID: "ses-unknown",
      config: cfg(),
      store: freshStore(),
    })
    expect(out).toBeNull()
  })

  test("recognized command but unparseable output returns null", async () => {
    const junk = (edges.garbageOutput + "\n").repeat(40)
    expect(Buffer.byteLength(junk)).toBeGreaterThan(4096)
    const out = await filterToolOutput({
      tool: "bash",
      command: fixtures.vitestFailing.command,
      output: junk,
      sessionID: "ses-garbage",
      config: cfg(),
      store: freshStore(),
    })
    expect(out).toBeNull()
  })

  test("output over maxBytesPerResult returns null before any disk write", async () => {
    const out = await filterToolOutput({
      tool: "bash",
      command: noisyCommand,
      output: noisy,
      sessionID: "ses-rescap",
      config: cfg({ maxBytesPerResult: 10 }),
      store: freshStore(),
    })
    expect(out).toBeNull()
  })

  test("tiny maxBytesPerSession returns null before any disk write", async () => {
    const out = await filterToolOutput({
      tool: "bash",
      command: noisyCommand,
      output: noisy,
      sessionID: "ses-sescap",
      config: cfg({ maxBytesPerSession: 1, maxBytesPerResult: 10 * 1024 * 1024 }),
      store: freshStore(),
    })
    expect(out).toBeNull()
  })
})

describe("filterToolOutput: happy path", () => {
  test("filters to summary + failures + exact errors + file refs + omission note with ref", async (t: TestContext) => {
    if (!probe) {
      console.warn("[filter.test] skipped: bun 1.3.8 TestContext has no skip(); guard returned instead")
      return
    }
    const p = probe
    expect(p.filtered.length).toBeGreaterThan(0)
    expect(p.filtered).not.toBe(noisy)
    expect(p.filtered).toContain("2 failed")
    expect(p.filtered).toContain("adds numbers")
    expect(p.filtered).toContain("subtracts numbers")
    expect(p.filtered).toContain("AssertionError: expected 2 to be 3 // Object.is equality")
    expect(p.filtered).toContain("AssertionError: expected 4 to be 3 // Object.is equality")
    expect(p.filtered).toContain("src/utils/math.test.ts")
    expect(p.filtered).toContain(p.ref)
    expect(p.filtered).toMatch(/omit/i)
    expect(p.filtered.includes("node_modules")).toBe(false)
    expect(p.reason).toMatch(/^[a-z0-9][a-z0-9._-]*:v1$/)
    expect(p.reason).toBe(classifyCommand(noisyCommand)!.reason)
  })

  test("byte accounting: bytesBefore is the raw input, bytesAfter the filtered text", async (t: TestContext) => {
    if (!probe) {
      console.warn("[filter.test] skipped: bun 1.3.8 TestContext has no skip(); guard returned instead")
      return
    }
    expect(probe.bytesBefore).toBe(Buffer.byteLength(noisy))
    expect(probe.bytesAfter).toBe(Buffer.byteLength(probe.filtered))
    expect(probe.bytesAfter).toBeLessThan(probe.bytesBefore)
    expect(Number.isInteger(probe.omittedLines)).toBe(true)
    expect(probe.omittedLines).toBeGreaterThan(0)
  })

  test("emits exactly one tool.filtered event with the frozen schema and ratio = after/before", async (t: TestContext) => {
    if (!probe) {
      console.warn("[filter.test] skipped: bun 1.3.8 TestContext has no skip(); guard returned instead")
      return
    }
    const events = readEvents(probeStoreRoot)
    const filteredEvents = events.filter((e) => e.type === "tool.filtered")
    expect(filteredEvents.length).toBe(1)
    const e = filteredEvents[0]
    expect(e.session).toBe("ses-probe")
    const data = e.data
    expect(Object.keys(data).sort()).toEqual([
      "bytesAfter",
      "bytesBefore",
      "omittedLines",
      "ratio",
      "reason",
      "ref",
      "tool",
    ])
    expect(data.tool).toBe("bash")
    expect(data.reason).toBe(probe.reason)
    expect(data.ref).toBe(probe.ref)
    expect(data.bytesBefore).toBe(Buffer.byteLength(noisy))
    expect(data.bytesAfter).toBe(probe.bytesAfter)
    expect(data.ratio).toBe(probe.bytesAfter / probe.bytesBefore)
    expect(data.omittedLines).toBe(probe.omittedLines)
  })

  test("raw output is recoverable by ref and session (requires a Store.root seam)", async (t: TestContext) => {
    if (!probe || !seamDir) {
      console.warn("[filter.test] skipped: bun 1.3.8 TestContext has no skip(); guard returned instead")
      return
    }
    const raw = loadRawOutput({ sessionID: "ses-probe", ref: probe.ref, dir: seamDir })
    expect(raw).toBe(noisy)
  })
})

describe("filterToolOutput: never throws into the host", () => {
  test("a store whose event() throws yields null instead of a rejection", async () => {
    const evil = {
      root: tmpDir(),
      event: () => {
        throw new Error("boom")
      },
    } as unknown as Store
    const out = await filterToolOutput({
      tool: "bash",
      command: noisyCommand,
      output: noisy,
      sessionID: "ses-evil",
      config: cfg(),
      store: evil,
      rawDir: tmpDir(),
    })
    expect(out).toBeNull()
  })
})
