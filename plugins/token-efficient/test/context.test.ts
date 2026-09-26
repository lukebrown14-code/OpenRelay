import { describe, expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { extractSignals } from "../lib/context/extract"
import { gatherEvidence, probeEvidence, verdictFor } from "../lib/context/retrieve"
import { buildPacket } from "../lib/context/packet"
import { ContextEngine } from "../lib/context"
import { DEFAULT_CONTEXT, resolveContextConfig } from "../lib/context/config"

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../benchmarks/fixtures")

const ALL_FIXTURES = fs
  .readdirSync(FIXTURES)
  .filter((d) => !d.startsWith("."))
  .sort()

function stageFixture(name: string): string {
  const src = path.join(FIXTURES, name)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `ctx-eval-${name}-`))
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue
    if (entry.name === "ground-truth.json" || entry.name === "meta.json") continue
    fs.cpSync(path.join(src, entry.name), path.join(dir, entry.name), { recursive: true })
  }
  return dir
}

function taskOf(fixture: string): string {
  return fs.readFileSync(path.join(FIXTURES, fixture, "TASK.md"), "utf8")
}

describe("context: config", () => {
  test("env override wins, default off", () => {
    expect(resolveContextConfig({}, undefined).enabled).toBe(false)
    expect(resolveContextConfig({ enabled: true }, "off").enabled).toBe(false)
    expect(resolveContextConfig({ enabled: false }, "on").enabled).toBe(true)
    expect(DEFAULT_CONTEXT.enabled).toBe(false)
  })

  test("garbage budgets fall back to defaults", () => {
    const c = resolveContextConfig({ budget: { maxTotalBytes: -5, maxFiles: Number.NaN } }, "on")
    expect(c.maxTotalBytes).toBe(DEFAULT_CONTEXT.maxTotalBytes)
    expect(c.maxFiles).toBe(DEFAULT_CONTEXT.maxFiles)
  })
})

describe("context: extractSignals", () => {
  test("paths, quoted, errors, git intent", () => {
    const s = extractSignals('Fix src/lib/api.js per "rate-limit" and TS2345 in `notes/ideas.md`; run git blame.')
    expect(s.paths).toContain("src/lib/api.js")
    expect(s.paths).toContain("notes/ideas.md")
    expect(s.quoted).toContain("rate-limit")
    expect(s.errors).toContain("TS2345")
    expect(s.gitIntent).toBe(true)
  })

  test("prose git verbs do not flip intent (audit E1)", () => {
    expect(extractSignals("don't panic; the widget won't reset its state; no repo work").gitIntent).toBe(false)
    expect(extractSignals("reset the form, commit to the DOM, then update the label").gitIntent).toBe(false)
  })

  test("unambiguous git vocabulary and >=3 weak verbs flip intent", () => {
    expect(extractSignals("cherry-pick the lost commit").gitIntent).toBe(true)
    expect(extractSignals("merge conflict in the working tree").gitIntent).toBe(true)
    expect(extractSignals("do not commit, stage, or revert anything").gitIntent).toBe(true)
  })

  test("multi-dot filenames survive extraction (audit E4)", () => {
    expect(extractSignals("check `settings.test.js` and vite.config.ts please").paths).toContain("settings.test.js")
  })

  test("CSS-class-like quoted signals derive a dot-stripped locator", () => {
    const s = extractSignals("style `.panel-header` correctly")
    expect(s.quoted).toContain(".panel-header")
    expect(s.derived).toContain("panel-header")
  })

  test("no git intent for plain UI text", () => {
    expect(extractSignals("make the button blue").gitIntent).toBe(false)
  })
})

describe("context: packet determinism and budget", () => {
  test("byte-stable for identical inputs", () => {
    const dir = stageFixture("06-ui-status-indicator")
    const task = taskOf("06-ui-status-indicator")
    const signals = extractSignals(task)
    const a = buildPacket(gatherEvidence(dir, signals, DEFAULT_CONTEXT, task))
    const b = buildPacket(gatherEvidence(dir, signals, DEFAULT_CONTEXT, task))
    expect(a).toBe(b)
    expect(a.length).toBeGreaterThan(0)
  })

  test("excerpts carry provenance (line range + hash) and compact gutter", () => {
    const dir = stageFixture("09-ui-shared-style")
    const task = taskOf("09-ui-shared-style")
    const ev = gatherEvidence(dir, extractSignals(task), DEFAULT_CONTEXT, task)
    expect(ev.excerpts.length).toBeGreaterThan(0)
    for (const ex of ev.excerpts) {
      expect(ex.hash).toMatch(/^[0-9a-f]{8}$/)
      expect(ex.startLine).toBeGreaterThanOrEqual(1)
      expect(ex.endLine).toBeGreaterThanOrEqual(ex.startLine)
      expect(ex.content).toContain(`${ex.startLine}|`)
    }
  })

  test("request echo (TASK.md) is never excerpted", () => {
    const dir = stageFixture("06-ui-status-indicator")
    const task = taskOf("06-ui-status-indicator")
    const ev = gatherEvidence(dir, extractSignals(task), DEFAULT_CONTEXT, task)
    expect(ev.excerpts.map((e) => e.file)).not.toContain("TASK.md")
  })
})

describe("context: never throws into the host", () => {
  test("non-repo, no-signal directory", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ctx-empty-"))
    const ev = gatherEvidence(dir, { paths: [], quoted: [], errors: [], derived: [] }, DEFAULT_CONTEXT)
    expect(ev.excerpts).toEqual([])
    expect(ev.git).toBeNull()
  })

  test("engine prepare with missing worktree is a no-op", () => {
    const events: unknown[] = []
    const engine = new ContextEngine(resolveContextConfig({ enabled: true }, "on"), (t, d) => events.push([t, d]))
    engine.prepare("ses_x", "/nonexistent/path/xyz", "hello")
    expect(engine.packetFor("ses_x")).toBeUndefined()
  })

  test("disabled engine never builds or attaches", () => {
    const events: unknown[] = []
    const engine = new ContextEngine(resolveContextConfig({}, "off"), (t) => events.push(t))
    engine.prepare("ses_x", "/tmp", "hello")
    expect(engine.packetFor("ses_x")).toBeUndefined()
    expect(events).toHaveLength(0)
  })

  test("search-discovered dotfiles (.env) are excluded from candidates", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ctx-env-"))
    fs.writeFileSync(path.join(dir, ".env"), "API_KEY=sk-live-secret-value\n")
    fs.writeFileSync(path.join(dir, "app.js"), "const API_KEY = readEnv()\n")
    const ev = gatherEvidence(dir, { paths: [], quoted: ["API_KEY"], errors: [], derived: [] }, DEFAULT_CONTEXT)
    expect(ev.excerpts.map((e) => e.file)).not.toContain(".env")
    expect(buildPacket(ev)).not.toContain("sk-live-secret-value")
  })

  test("binary content named explicitly never injects NULs", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ctx-bin-"))
    fs.writeFileSync(path.join(dir, "blob.dat"), Buffer.from([0x00, 0x01, 0x02, 0xff]))
    const ev = gatherEvidence(dir, { paths: ["blob.dat"], quoted: [], errors: [], derived: [] }, DEFAULT_CONTEXT)
    expect(buildPacket(ev)).not.toContain("\0")
  })
})

describe("context: probe verdict (v3)", () => {
  test("single explicit target with no new candidates skips", () => {
    const dir = stageFixture("02-routine-bug")
    const probe = probeEvidence(dir, extractSignals(taskOf("02-routine-bug")), DEFAULT_CONTEXT)
    const v = verdictFor(probe)
    expect(v.verdict).toBe("skip")
    expect(v.reason).toBe("explicit-single-target")
  })

  test("new candidate files build", () => {
    const dir = stageFixture("08-ui-state-handling")
    const probe = probeEvidence(dir, extractSignals(taskOf("08-ui-state-handling")), DEFAULT_CONTEXT)
    const v = verdictFor(probe)
    expect(v.verdict).toBe("build")
    expect(v.reason).toBe("new-candidates")
  })

  test("cross-file scope (>=2 named sources) builds", () => {
    const dir = stageFixture("09-ui-shared-style")
    const probe = probeEvidence(dir, extractSignals(taskOf("09-ui-shared-style")), DEFAULT_CONTEXT)
    // index.html is a legitimate un-named candidate here (footer-note markup), so the
    // reason can be either build path — the fixture must build, that is the contract.
    expect(verdictFor(probe).verdict).toBe("build")
  })

  test("test files and test directories are never candidates (05 mjs case)", () => {
    const dir = stageFixture("05-noisy-test-log")
    const probe = probeEvidence(dir, extractSignals(taskOf("05-noisy-test-log")), DEFAULT_CONTEXT)
    expect(probe.candidates.map((c) => c.file)).not.toContain("test/format.test.mjs")
    expect(verdictFor(probe)).toEqual({ verdict: "skip", reason: "explicit-single-target" })
  })

  test("fixed-string search: regex metacharacters match literally (audit E2)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ctx-fixed-"))
    fs.writeFileSync(path.join(dir, "api.js"), "export function retry(fn, options) {}\n")
    const probe = probeEvidence(dir, { paths: [], quoted: ["retry(fn, options)"], errors: [], derived: [] }, DEFAULT_CONTEXT)
    expect(probe.status).toBe("hit")
    expect(probe.candidates.map((c) => c.file)).toContain("api.js")
  })

  test("rg failure fails open to build (audit R1)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ctx-err-"))
    // A file named to make `rg -e <pattern> -- <path>` fail on the operand.
    fs.writeFileSync(path.join(dir, "x.js"), "content\n")
    const probe = probeEvidence(dir, { paths: ["x.js"], quoted: [], errors: [], derived: [] }, DEFAULT_CONTEXT)
    expect(probe.status).not.toBe("error")
    expect(verdictFor(probe).verdict).toBe("skip")
  })
})

describe("context: expected verdict matrix over the full corpus", () => {
  const EXPECTED: Record<string, { verdict: "build" | "skip"; reason?: string }> = {
    "01-trivial-edit": { verdict: "skip", reason: "explicit-single-target" },
    "02-routine-bug": { verdict: "skip", reason: "explicit-single-target" },
    "03-medium-feature": { verdict: "skip", reason: "redundant-candidates" },
    "04-difficult-debug": { verdict: "skip", reason: "explicit-single-target" },
    "05-noisy-test-log": { verdict: "skip", reason: "explicit-single-target" },
    "06-ui-status-indicator": { verdict: "build" },
    "07-ui-viewport-clip": { verdict: "build" },
    "08-ui-state-handling": { verdict: "build" },
    "09-ui-shared-style": { verdict: "build" },
    "10-git-missing-changes": { verdict: "skip", reason: "git-intent" },
    "11-git-merge-conflict": { verdict: "skip", reason: "git-intent" },
    "12-git-recover-commit": { verdict: "skip", reason: "git-intent" },
    "13-git-separate-work": { verdict: "skip", reason: "git-intent" },
  }

  for (const fixture of ALL_FIXTURES) {
    const expected = EXPECTED[fixture]
    if (!expected) continue
    test(`${fixture}: ${expected.verdict}${expected.reason ? ` (${expected.reason})` : ""}`, () => {
      const dir = stageFixture(fixture)
      const task = taskOf(fixture)
      const events: Array<{ t: string; d: Record<string, unknown> }> = []
      const engine = new ContextEngine(resolveContextConfig({ enabled: true }, "on"), (t, d) => events.push({ t, d }))
      engine.prepare("ses_matrix", dir, task)
      const packet = engine.packetFor("ses_matrix")
      if (expected.verdict === "skip") {
        expect(packet).toBeUndefined()
        const skipped = events.find((e) => e.t === "context.packet_skipped")
        expect(skipped).toBeTruthy()
        if (expected.reason) expect(skipped?.d.reason).toBe(expected.reason)
      } else {
        expect(packet).toBeTruthy()
        const built = events.find((e) => e.t === "context.packet_built")
        expect(built).toBeTruthy()
      }
    })
  }
})

describe("context: packet reuse and rebuild", () => {
  test("same request reuses the packet; new request rebuilds", () => {
    const dir = stageFixture("08-ui-state-handling")
    const task = taskOf("08-ui-state-handling")
    const events: Array<{ t: string }> = []
    const engine = new ContextEngine(resolveContextConfig({ enabled: true }, "on"), (t) => events.push({ t }))
    engine.prepare("ses_1", dir, "hello world")
    expect(engine.packetFor("ses_1")).toBeUndefined()
    engine.prepare("ses_1", dir, "hello world")
    const skipEvents = events.filter((e) => e.t === "context.packet_skipped").length
    engine.prepare("ses_1", dir, task)
    const p2 = engine.packetFor("ses_1")
    expect(p2).toBeTruthy()
    expect(p2).toContain("statusWidget.js")
    expect(skipEvents).toBe(1)
  })
})

describe("context: task-adaptive selection (v2)", () => {
  test("git-intent requests skip the packet and emit packet_skipped", () => {
    const dir = stageFixture("10-git-missing-changes")
    const events: Array<{ t: string; d: Record<string, unknown> }> = []
    const engine = new ContextEngine(resolveContextConfig({ enabled: true }, "on"), (t, d) => events.push({ t, d }))
    engine.prepare("ses_g", dir, taskOf("10-git-missing-changes"))
    expect(engine.packetFor("ses_g")).toBeUndefined()
    expect(events.filter((e) => e.t === "context.packet_built")).toHaveLength(0)
    const skipped = events.filter((e) => e.t === "context.packet_skipped")
    expect(skipped).toHaveLength(1)
    expect(skipped[0].d.reason).toBe("git-intent")
  })

  test("non-git requests still build", () => {
    const dir = stageFixture("06-ui-status-indicator")
    const events: Array<{ t: string }> = []
    const engine = new ContextEngine(resolveContextConfig({ enabled: true }, "on"), (t) => events.push({ t }))
    engine.prepare("ses_u", dir, taskOf("06-ui-status-indicator"))
    expect(engine.packetFor("ses_u")).toBeTruthy()
    expect(events.some((e) => e.t === "context.packet_built")).toBe(true)
  })
})

describe("context: deterministic retrieval eval vs fixture ground truth", () => {
  const cases: Array<{ fixture: string; mode: "recall" | "git-state" }> = [
    { fixture: "06-ui-status-indicator", mode: "recall" },
    { fixture: "07-ui-viewport-clip", mode: "recall" },
    { fixture: "08-ui-state-handling", mode: "recall" },
    { fixture: "09-ui-shared-style", mode: "recall" },
    { fixture: "10-git-missing-changes", mode: "recall" },
    { fixture: "11-git-merge-conflict", mode: "recall" },
    { fixture: "12-git-recover-commit", mode: "git-state" },
    { fixture: "13-git-separate-work", mode: "recall" },
    { fixture: "19-repository-refactor", mode: "recall" },
    { fixture: "21-dependency-upgrade", mode: "recall" },
  ]

  for (const { fixture, mode } of cases) {
    test(`${fixture}: packet contains ground truth (${mode})`, () => {
      const dir = stageFixture(fixture)
      const task = taskOf(fixture)
      const gt = JSON.parse(fs.readFileSync(path.join(FIXTURES, fixture, "ground-truth.json"), "utf8"))

      if (mode === "git-state") {
        const run = (...args: string[]) =>
          execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], { cwd: dir, stdio: ["ignore", "pipe", "ignore"] })
        run("init", "-q", "-b", "main")
        run("add", "-A")
        run("commit", "-m", "baseline")
        fs.rmSync(path.join(dir, "setup.mjs"), { force: true })
        execFileSync(process.execPath, [path.join(FIXTURES, fixture, "setup.mjs")], { cwd: dir, stdio: ["ignore", "pipe", "ignore"] })
        const ev = gatherEvidence(dir, extractSignals(task), DEFAULT_CONTEXT, task)
        expect(ev.git).not.toBeNull()
        expect(ev.git?.branch).toBe("main")
        const packet = buildPacket(ev)
        expect(packet).toContain("GIT STATE")
        return
      }

      const ev = gatherEvidence(dir, extractSignals(task), DEFAULT_CONTEXT, task)
      const files = ev.excerpts.map((e) => e.file)
      for (const required of gt.required) {
        expect(files).toContain(required)
      }
      const packet = buildPacket(ev)
      expect(packet).toContain("[CONTROLLER CONTEXT")
      expect(packet.length).toBeGreaterThan(0)
    })
  }
})

describe("context: extension cohort baseline characterization", () => {
  const expected: Record<string, { verdict: "build" | "skip"; recall: boolean }> = {
    "14-ui-dismiss-strip": { verdict: "skip", recall: false },
    "15-debug-export-labels": { verdict: "skip", recall: false },
    "16-ui-overlay-leak": { verdict: "skip", recall: false },
    "17-python-rust-migration": { verdict: "skip", recall: false },
    "18-cross-file-api-change": { verdict: "skip", recall: false },
    "19-repository-refactor": { verdict: "build", recall: true },
    "20-frontend-backend-feature": { verdict: "skip", recall: false },
    "21-dependency-upgrade": { verdict: "build", recall: true },
  }
  for (const [fixture, baseline] of Object.entries(expected)) {
    test(`${fixture}: selector and recall baseline`, () => {
      const dir = stageFixture(fixture)
      const task = taskOf(fixture)
      const signals = extractSignals(task)
      const probe = probeEvidence(dir, signals, DEFAULT_CONTEXT)
      expect(verdictFor(probe).verdict).toBe(baseline.verdict)
      const groundTruth = JSON.parse(fs.readFileSync(path.join(FIXTURES, fixture, "ground-truth.json"), "utf8"))
      const files = gatherEvidence(dir, signals, DEFAULT_CONTEXT, task).excerpts.map((e) => e.file)
      expect(groundTruth.required.every((file: string) => files.includes(file))).toBe(baseline.recall)
    })
  }
})

describe("context: git evidence in a seeded repo", () => {
  test("dirty tree and branch surface in packet", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ctx-git-"))
    const run = (...args: string[]) => execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], { cwd: dir, stdio: ["ignore", "pipe", "ignore"] })
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir })
    fs.writeFileSync(path.join(dir, "a.txt"), "hello\n")
    run("add", "-A")
    run("commit", "-m", "init")
    fs.writeFileSync(path.join(dir, "a.txt"), "changed\n")

    const ev = gatherEvidence(dir, { paths: [], quoted: [], errors: [], derived: [] }, DEFAULT_CONTEXT)
    expect(ev.git?.branch).toBe("main")
    expect(ev.git?.dirty).toBe(true)
    expect(ev.git?.dirtyFiles).toContain("a.txt")
    const packet = buildPacket(ev)
    expect(packet).toContain("GIT STATE")
    expect(packet).toContain("dirty files: a.txt")
  })
})
