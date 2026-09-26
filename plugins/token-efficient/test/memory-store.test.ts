import { describe, expect, test } from "bun:test"
import fs from "node:fs"
import path from "node:path"
import { tmpDir } from "./helpers"
import { ConflictError, LockError, ProjectStore, ValidationError } from "../lib/memory/store"
import { PathError, readInside } from "../lib/memory/paths"

const SESSION_A = "ses_testAAAA"
const SESSION_B = "ses_testBBBB"

function handoffInput(over: Record<string, unknown> = {}): never {
  return {
    handoffID: "ho-test00001",
    sourceSession: SESSION_A,
    direction: "workhorse->workhorse",
    objective: "Continue the widget refactor",
    constraints: [{ text: "keep public API stable", provenance: "user-approved" }],
    acceptanceCriteria: [{ text: "verify.js passes", provenance: "tool-observed" }],
    nextSteps: ["wire second consumer"],
    ...over,
  } as never
}

describe("ProjectStore init", () => {
  test("creates the required structure and is idempotent", () => {
    const root = tmpDir()
    const s = new ProjectStore(root)
    const first = s.init()
    expect(first.created).toContain(path.join(".codebase", "memory.json"))
    expect(first.created).toContain(path.join(".codebase", "INDEX.md"))
    expect(first.created).toContain(".tasks")
    expect(fs.existsSync(path.join(root, ".codebase", "modules"))).toBe(true)

    const marker = path.join(root, ".codebase", "INDEX.md")
    fs.writeFileSync(marker, "CUSTOM MARKER\n")
    const second = s.init()
    expect(second.created).toHaveLength(0)
    expect(fs.readFileSync(marker, "utf8")).toContain("CUSTOM MARKER")
  })

  test("identity is stable and differs across worktrees", () => {
    const a = new ProjectStore(tmpDir())
    const b = new ProjectStore(tmpDir())
    expect(a.identity.projectID).toBe(new ProjectStore(a.root).identity.projectID)
    expect(a.identity.projectID).not.toBe(b.identity.projectID)
    expect(a.identity.worktreeID).not.toBe(b.identity.worktreeID)
  })
})

describe("task records and recovery", () => {
  test("create/resume/continue round-trips with revisions", () => {
    const s = new ProjectStore(tmpDir())
    s.init()
    const rec = s.createTask({ sessionID: SESSION_A, telemetryTaskID: "t-x" })
    expect(rec.revision).toBe(1)
    expect(rec.lifecycle).toBe("active")
    expect(rec.workflowID).toMatch(/^wf-/)
    expect(fs.existsSync(path.join(s.root, ".tasks", rec.taskID, "state.json"))).toBe(true)

    const loaded = s.loadTask(rec.taskID)
    expect(loaded?.workflowID).toBe(rec.workflowID)

    const cont = s.continueTask(rec.taskID, SESSION_B)
    expect(cont.revision).toBe(2)
    expect(cont.continuationSessions).toEqual([SESSION_B])
    // idempotent continuation
    expect(s.continueTask(rec.taskID, SESSION_B).revision).toBe(2)

    // cross-store recovery (restart): same session, same workflow
    const s2 = new ProjectStore(s.root)
    const found = s2.findTaskBySession(SESSION_B)
    expect(found?.taskID).toBe(rec.taskID)
    expect(found?.workflowID).toBe(rec.workflowID)
    expect(s2.findTaskBySession("ses_unknown")).toBeNull()
  })

  test("completed tasks refuse continuation", () => {
    const s = new ProjectStore(tmpDir())
    const rec = s.createTask({ sessionID: SESSION_A })
    s.setLifecycle(rec.taskID, "completed")
    expect(() => s.continueTask(rec.taskID, SESSION_B)).toThrow(ConflictError)
  })

  test("stale on-disk revision triggers a conflict, not silent overwrite", () => {
    const s = new ProjectStore(tmpDir())
    const rec = s.createTask({ sessionID: SESSION_A })
    const stale = { ...rec } // revision 1 while disk advances to 2
    s.continueTask(rec.taskID, SESSION_B)
    expect(() => s.saveTaskRecord(stale)).toThrow(ConflictError)
  })
})

describe("locking and concurrency", () => {
  test("a held lock blocks another store and stale locks are stealable", () => {
    const root = tmpDir()
    const s1 = new ProjectStore(root)
    const s2 = new ProjectStore(root)
    const rec = s1.createTask({ sessionID: SESSION_A })

    const lockPath = path.join(root, ".tasks", rec.taskID, ".lock")
    fs.mkdirSync(path.dirname(lockPath), { recursive: true })
    fs.writeFileSync(lockPath, JSON.stringify({ pid: 999999, at: new Date().toISOString() }))
    expect(() => s2.continueTask(rec.taskID, SESSION_B)).toThrow(LockError)

    const staleAt = new Date(Date.now() - 120_000).toISOString()
    fs.writeFileSync(lockPath, JSON.stringify({ pid: 999999, at: staleAt }))
    expect(s2.continueTask(rec.taskID, SESSION_B).continuationSessions).toEqual([SESSION_B])
    expect(fs.existsSync(lockPath)).toBe(false)
  })

  test("same-process reentrancy is allowed", () => {
    const s = new ProjectStore(tmpDir())
    const rec = s.createTask({ sessionID: SESSION_A })
    const nested = s.withTaskLock(rec.taskID, () => s.withTaskLock(rec.taskID, () => "inner"))
    expect(nested).toBe("inner")
  })
})

describe("handoff snapshots", () => {
  test("immutable write, registration, and deterministic view", () => {
    const s = new ProjectStore(tmpDir())
    const rec = s.createTask({ sessionID: SESSION_A })
    const h = s.writeHandoff(rec.taskID, handoffInput())
    expect(h.workflowID).toBe(rec.workflowID)
    const file = path.join(s.root, ".tasks", rec.taskID, "handoffs", "ho-test00001.json")
    expect(JSON.parse(fs.readFileSync(file, "utf8")).objective).toContain("widget")

    // snapshot is immutable
    expect(() => s.writeHandoff(rec.taskID, handoffInput())).toThrow()
    // registered on the task record
    expect(s.loadTask(rec.taskID)?.handoffIDs).toContain("ho-test00001")
    // deterministic render + derived view
    const view = s.renderHandoff(h)
    expect(view).toBe(s.renderHandoff(s.readHandoff(rec.taskID, "ho-test00001")!))
    expect(view).toContain("[user-approved] keep public API stable")
    s.writeHandoffView(rec.taskID, "ho-test00001")
    expect(fs.readFileSync(path.join(s.root, ".tasks", rec.taskID, "HANDOFF.md"), "utf8")).toBe(view)
  })

  test("missing mandatory fields are rejected with reasons", () => {
    const s = new ProjectStore(tmpDir())
    const rec = s.createTask({ sessionID: SESSION_A })
    // no acceptanceCriteria
    expect(() => s.writeHandoff(rec.taskID, handoffInput({ acceptanceCriteria: undefined }))).toThrow(ValidationError)
    // bad provenance label
    expect(() =>
      s.writeHandoff(rec.taskID, handoffInput({ constraints: [{ text: "x", provenance: "vibes" }] })),
    ).toThrow(ValidationError)
    // missing objective
    expect(() => s.writeHandoff(rec.taskID, handoffInput({ objective: "" }))).toThrow(ValidationError)
  })

  test("malformed records surface validation errors instead of corrupt reads", () => {
    const s = new ProjectStore(tmpDir())
    const rec = s.createTask({ sessionID: SESSION_A })
    const file = path.join(s.root, ".tasks", rec.taskID, "state.json")
    fs.writeFileSync(file, "{not json")
    expect(() => s.loadTask(rec.taskID)).toThrow(ValidationError)
    // findTaskBySession skips malformed records rather than throwing
    expect(s.findTaskBySession(SESSION_A)).toBeNull()
  })
})

describe("path confinement", () => {
  test("traversal and absolute paths are rejected", () => {
    const s = new ProjectStore(tmpDir())
    expect(() => s.loadTask("../evil")).toThrow()
    expect(() => s.readHandoff("task-x", "../../evil")).toThrow()
  })

  test("symlink escape is rejected on read", () => {
    const root = tmpDir()
    const outside = tmpDir()
    fs.writeFileSync(path.join(outside, "secret.txt"), "nope")
    fs.symlinkSync(path.join(outside, "secret.txt"), path.join(root, "link.txt"))
    const s = new ProjectStore(root)
    let rejected = false
    try {
      readInside(root, "link.txt")
    } catch (e) {
      rejected = e instanceof PathError
    }
    expect(rejected).toBe(true)
    // and through the store's confined read path
    expect(() => s.readHandoff("../link.txt", "whatever")).toThrow()
  })
})
