import { readFileSync } from "node:fs"
import path from "node:path"
import { newRecordID, nowISO } from "../ids"
import { sha256File } from "../memory/provenance"
import { resolveInside } from "../memory/paths"
import { validateHandoff } from "../memory/schemas"
import { ASSEMBLY_BUDGETS } from "../assemble/budgets"
import type { Direction, EvidenceRef, HandoffRecord, Labeled, VerificationRecord } from "../memory/types"

export type HandoffInput = {
  taskID: string
  workflowID: string
  direction: Direction
  sourceSession: string
  // Objective from an explicit user/task artifact (PLAN.md content or user text).
  objective: string
  // Strings are accepted as a convenience and labeled "unknown" (never guessed).
  constraints?: Array<string | Labeled>
  decisions?: Array<string | Labeled>
  acceptanceCriteria?: Array<string | Labeled>
  currentWork?: string
  nextSteps?: string[]
  unresolvedQuestions?: string[]
  // Repo-relative paths; digests and bounded recovery excerpts are computed here.
  relevantFiles?: string[]
  verifications?: VerificationRecord[]
  handoffID?: string
}

export type BuildResult =
  | { ok: true; handoff: HandoffRecord }
  | { ok: false; reason: "missing-mandatory"; errors: string[] }

function unlabeled(text: string): Labeled {
  return { text, provenance: "unknown" }
}

function toLabeled(items: Array<string | Labeled> | undefined): Labeled[] {
  return (items ?? []).map((i) => (typeof i === "string" ? unlabeled(i) : i))
}

// Deterministic handoff builder (stage6-plan §6/§8-6C): no model calls, no guessing
// omitted semantic fields. Explicit inputs only; telemetry-derived verifications are
// labeled tool-observed by the caller. Mandatory fields must be present or the build
// fails with a recorded reason so the caller falls back.
export function buildHandoff(worktree: string, input: HandoffInput): BuildResult {
  const relevantFiles: EvidenceRef[] = []
  const errors: string[] = []
  for (const rel of input.relevantFiles ?? []) {
    let full: string
    try {
      full = resolveInside(worktree, rel)
    } catch {
      errors.push(`relevantFile outside worktree: ${rel}`)
      continue
    }
    const digest = sha256File(full)
    if (digest === null) {
      errors.push(`relevantFile unreadable: ${rel}`)
      continue
    }
    // Bounded recovery excerpt: first bytes of the file, truncated flag set when
    // the file continues beyond the window.
    let excerpt = ""
    let truncated = false
    try {
      const raw = readFileSync(full)
      const window = raw.subarray(0, ASSEMBLY_BUDGETS.maxRecoveryExcerptBytes)
      excerpt = window.toString("utf8")
      truncated = raw.length > ASSEMBLY_BUDGETS.maxRecoveryExcerptBytes
    } catch {}
    relevantFiles.push({ path: rel, contentDigest: digest, captured: { capturedAt: nowISO() }, recovery: { excerpt, truncated } })
  }
  if (errors.length && (input.relevantFiles?.length ?? 0) > 0 && relevantFiles.length === 0) {
    return { ok: false, reason: "missing-mandatory", errors }
  }

  const handoff: HandoffRecord = {
    schemaVersion: 1,
    handoffID: input.handoffID ?? newRecordID("ho"),
    taskID: input.taskID,
    workflowID: input.workflowID,
    sourceSession: input.sourceSession,
    direction: input.direction,
    objective: input.objective,
    constraints: toLabeled(input.constraints),
    decisions: toLabeled(input.decisions),
    relevantFiles,
    currentWork: input.currentWork,
    nextSteps: input.nextSteps ?? [],
    acceptanceCriteria: toLabeled(input.acceptanceCriteria),
    unresolvedQuestions: input.unresolvedQuestions ?? [],
    verifications: input.verifications ?? [],
    evidenceRefs: [],
    createdAt: nowISO(),
  }
  const v = validateHandoff(handoff)
  if (!v.ok) return { ok: false, reason: "missing-mandatory", errors: v.errors }
  return { ok: true, handoff: v.value }
}

// Convenience: read the objective from the task's PLAN.md artifact when present.
export function objectiveFromPlan(worktree: string, objectiveRef: string | undefined): string | null {
  if (!objectiveRef) return null
  try {
    const full = resolveInside(worktree, objectiveRef)
    return readFileSync(full, "utf8")
  } catch {
    return null
  }
}
