import { describe, expect, test } from "bun:test"
import fs from "node:fs"
import path from "node:path"
import { tmpDir } from "./helpers"
import { buildHandoff } from "../lib/handoff/builder"
import { selectNotes } from "../lib/memory/select"
import { assembleAuxContext } from "../lib/assemble/index"
import { ASSEMBLY_BUDGETS } from "../lib/assemble/budgets"
import type { MemoryIndex } from "../lib/memory/types"

function repo(): string {
  const root = tmpDir()
  fs.mkdirSync(path.join(root, "src"), { recursive: true })
  return root
}

function write(root: string, rel: string, content: string): void {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
  fs.writeFileSync(path.join(root, rel), content)
}

const baseInput = {
  taskID: "task-dev0001",
  workflowID: "wf-dev0001",
  direction: "workhorse->workhorse" as const,
  sourceSession: "ses_dev",
  objective: "Split the payment module in two",
}

describe("handoff builder", () => {
  test("builds digests and bounded recovery excerpts for relevant files", () => {
    const root = repo()
    write(root, "src/pay.ts", "export const pay = () => 1")
    const r = buildHandoff(root, {
      ...baseInput,
      relevantFiles: ["src/pay.ts"],
      constraints: [{ text: "keep API stable", provenance: "user-approved" }],
      acceptanceCriteria: [{ text: "tests pass", provenance: "tool-observed" }],
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.handoff.relevantFiles[0].path).toBe("src/pay.ts")
    expect(r.handoff.relevantFiles[0].contentDigest).toMatch(/^[0-9a-f]{64}$/)
    expect(r.handoff.relevantFiles[0].recovery?.excerpt).toContain("export const pay")
    expect(r.handoff.relevantFiles[0].recovery?.truncated).toBe(false)
  })

  test("unlabeled string inputs become unknown provenance", () => {
    const r = buildHandoff(tmpDir(), { ...baseInput, constraints: ["be fast"], acceptanceCriteria: [{ text: "done", provenance: "user-approved" }] })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.handoff.constraints[0].provenance).toBe("unknown")
  })

  test("missing mandatory fields fail with reasons", () => {
    const r = buildHandoff(tmpDir(), { ...baseInput, objective: "" })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe("missing-mandatory")
    expect(r.errors.join(" ")).toContain("objective")
  })

  test("out-of-worktree relevant files are reported", () => {
    const r = buildHandoff(tmpDir(), { ...baseInput, relevantFiles: ["../outside.ts"] })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errors.join(" ")).toContain("outside worktree")
  })
})

describe("note selection", () => {
  const note = (id: string, paths: string[], validity: MemoryIndex["notes"][string]["validity"] = "current") => ({
    schemaVersion: 1,
    noteID: id,
    scope: "module",
    refs: { paths, symbols: [] },
    authorKind: "user" as const,
    lastValidatedAt: new Date().toISOString(),
    validity,
  })

  test("abstains without explicit reference or exact path overlap", () => {
    const index: MemoryIndex = { schemaVersion: 1, projectID: "p", updatedAt: "now", notes: { n1: note("n1", ["src/a.ts"]) } }
    const r = selectNotes(index, { requestPaths: ["src/other.ts"] })
    expect(r.selected).toHaveLength(0)
    expect(r.abstained[0].reason).toBe("no-reference")
  })

  test("selects on exact path overlap and explicit task reference", () => {
    const index: MemoryIndex = {
      schemaVersion: 1,
      projectID: "p",
      updatedAt: "now",
      notes: { n1: note("n1", ["src/a.ts"]), n2: note("n2", ["src/b.ts"]) },
    }
    const byPath = selectNotes(index, { requestPaths: ["src/a.ts"] })
    expect(byPath.selected.map((n) => n.noteID)).toEqual(["n1"])
    const byRef = selectNotes(index, { taskRefs: ["n2"] })
    expect(byRef.selected.map((n) => n.noteID)).toEqual(["n2"])
  })

  test("caps selection and retracts conflicting overlaps", () => {
    const index: MemoryIndex = {
      schemaVersion: 1,
      projectID: "p",
      updatedAt: "now",
      notes: { a: note("a", ["src/x.ts"]), b: note("b", ["src/x.ts"]), c: note("c", ["src/y.ts"]), d: note("d", ["src/z.ts"]) },
    }
    const r = selectNotes(index, { requestPaths: ["src/x.ts", "src/y.ts", "src/z.ts"] })
    // a and b share src/x.ts -> conflict retracts both; c and d fit under the cap
    expect(r.selected.map((n) => n.noteID).sort()).toEqual(["c", "d"])
    expect(r.abstained.filter((x) => x.reason === "conflict").map((x) => x.noteID).sort()).toEqual(["a", "b"])
  })

  test("retired and stale-validity notes never match", () => {
    const index: MemoryIndex = {
      schemaVersion: 1,
      projectID: "p",
      updatedAt: "now",
      notes: { r1: note("r1", ["src/a.ts"], "retired"), s1: note("s1", ["src/a.ts"], "stale") },
    }
    const r = selectNotes(index, { requestPaths: ["src/a.ts"] })
    expect(r.selected).toHaveLength(0)
    expect(r.abstained.map((x) => x.reason).sort()).toEqual(["retired", "stale-validity"])
  })
})

describe("aux context assembly", () => {
  test("renders handoff with provenance and stays under budgets", () => {
    const r = assembleAuxContext(tmpDir(), {
      handoff: {
        schemaVersion: 1,
        handoffID: "ho-1",
        taskID: "task-1",
        workflowID: "wf-1",
        sourceSession: "ses",
        direction: "premium->workhorse",
        objective: "Add retries",
        constraints: [{ text: "no new deps", provenance: "user-approved" }],
        decisions: [],
        relevantFiles: [],
        nextSteps: [],
        acceptanceCriteria: [{ text: "all verify passes", provenance: "tool-observed" }],
        unresolvedQuestions: [],
        verifications: [{ command: "node test.js", cwd: ".", exitStatus: 1, executedAt: "t", sourceStateDigest: { capturedAt: "t" } }],
        evidenceRefs: [],
        createdAt: "now",
      },
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.text).toContain("Objective: Add retries")
    expect(r.text).toContain("[user-approved] no new deps")
    expect(r.text).toContain("exit 1 (current failure)")
    expect(r.bytes).toBeLessThanOrEqual(ASSEMBLY_BUDGETS.totalAuxBytes)
    expect(r.prepMs).toBeLessThan(ASSEMBLY_BUDGETS.prepAbandonMs)
  })

  test("oversized mandatory handoff falls back without truncation", () => {
    const big = "x".repeat(ASSEMBLY_BUDGETS.handoffBytes + 1)
    const r = assembleAuxContext(tmpDir(), {
      handoff: {
        schemaVersion: 1,
        handoffID: "ho-2",
        taskID: "task-2",
        workflowID: "wf-2",
        sourceSession: "ses",
        direction: "workhorse->premium",
        objective: big,
        constraints: [],
        decisions: [],
        relevantFiles: [],
        nextSteps: [],
        acceptanceCriteria: [{ text: "tiny criteria that must not be truncated", provenance: "user-approved" }],
        unresolvedQuestions: [],
        verifications: [],
        evidenceRefs: [],
        createdAt: "now",
      },
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe("mandatory-exceeds-budget")
  })

  test("suppresses notes covered by the v3 packet and reports omissions", () => {
    const root = repo()
    write(root, ".codebase/modules/n1.md", "The retry helper lives in src/retry.ts.")
    const index: MemoryIndex = {
      schemaVersion: 1,
      projectID: "p",
      updatedAt: "now",
      notes: {
        n1: { schemaVersion: 1, noteID: "n1", scope: "module", refs: { paths: ["src/retry.ts"], symbols: [] }, authorKind: "user", lastValidatedAt: "t", validity: "current" },
      },
    }
    const v3Packet = "// src/retry.ts:1-10 hash=abc source=probe\nsome excerpt bytes"
    const r = assembleAuxContext(root, { memoryIndex: index, selectionContext: { requestPaths: ["src/retry.ts"] }, v3Packet })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe("nothing-to-assemble")
    expect(r.omissions.some((o) => o.item === "note:n1" && o.reason === "covered-by-packet")).toBe(true)
  })

  test("assembles handoff plus memory under the combined cap", () => {
    const root = repo()
    write(root, ".codebase/modules/n1.md", "Auth note: sessions live server-side.")
    const index: MemoryIndex = {
      schemaVersion: 1,
      projectID: "p",
      updatedAt: "now",
      notes: {
        n1: { schemaVersion: 1, noteID: "n1", scope: "module", refs: { paths: ["src/auth.ts"], symbols: [] }, authorKind: "user", lastValidatedAt: "t", validity: "current" },
      },
    }
    const handoff = buildHandoff(root, {
      ...baseInput,
      relevantFiles: [],
      constraints: [{ text: "keep API stable", provenance: "user-approved" }],
      acceptanceCriteria: [{ text: "verify passes", provenance: "tool-observed" }],
    })
    expect(handoff.ok).toBe(true)
    if (!handoff.ok) return
    const r = assembleAuxContext(root, { memoryIndex: index, handoff: handoff.handoff, selectionContext: { requestPaths: ["src/auth.ts"] } })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.text).toContain("Project memory (n1)")
    expect(r.text).toContain("Objective: Split the payment module in two")
    expect(r.selection?.selected.map((n) => n.noteID)).toEqual(["n1"])
  })
})
