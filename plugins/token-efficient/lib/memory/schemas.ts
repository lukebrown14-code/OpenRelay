import type { EvidenceRef, HandoffRecord, MemoryNoteMeta, SourceStateDigest, TaskRecord, VerificationRecord } from "./types"

export const SCHEMA_VERSION = 1

export const PROVENANCE_LABELS = ["user-approved", "tool-observed", "model-proposed", "unknown"] as const
export type ProvenanceLabel = (typeof PROVENANCE_LABELS)[number]

export const LIFECYCLES = ["active", "interrupted", "completed", "abandoned"] as const
export type Lifecycle = (typeof LIFECYCLES)[number]

export const DIRECTIONS = ["premium->workhorse", "workhorse->premium", "workhorse->workhorse"] as const
export type Direction = (typeof DIRECTIONS)[number]

export const VALIDITIES = ["current", "stale", "retired"] as const
export type Validity = (typeof VALIDITIES)[number]

export type Validated<T> = { ok: true; value: T } | { ok: false; errors: string[] }

const HEX64 = /^[0-9a-f]{64}$/
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

function isStr(v: unknown): v is string {
  return typeof v === "string"
}
function isNonEmpty(v: unknown): v is string {
  return typeof v === "string" && v.length > 0
}
function isStrArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every(isNonEmpty)
}
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}
function label(v: unknown): v is ProvenanceLabel {
  return isStr(v) && (PROVENANCE_LABELS as readonly string[]).includes(v)
}

// Repo-relative path: no leading slash, no "..", no empty segments.
export function isRepoRelative(v: unknown): v is string {
  if (!isNonEmpty(v)) return false
  if (v.startsWith("/")) return false
  const segs = v.split("/")
  if (segs.some((s) => s.length === 0 || s === "." || s === "..")) return false
  return true
}

function isDigest(v: unknown): v is string {
  return isStr(v) && HEX64.test(v)
}

function validateSourceStateDigest(v: unknown): string[] {
  if (!isPlainObject(v)) return ["sourceStateDigest must be an object"]
  const errs: string[] = []
  if (v.gitCommit !== undefined && v.gitCommit !== null && !isNonEmpty(v.gitCommit)) errs.push("gitCommit must be a string")
  for (const key of ["dirtyFiles", "untrackedFiles"] as const) {
    const m = v[key]
    if (m === undefined || m === null) continue
    if (!isPlainObject(m)) errs.push(`${key} must be an object`)
    else for (const [p, d] of Object.entries(m)) if (!isRepoRelative(p) || !isDigest(d)) errs.push(`${key}: bad entry ${p}`)
  }
  return errs
}

export function validateEvidenceRef(v: unknown): Validated<EvidenceRef> {
  const errors: string[] = []
  if (!isPlainObject(v)) return { ok: false, errors: ["evidence ref must be an object"] }
  if (!isRepoRelative(v.path)) errors.push("path must be repo-relative")
  if (!isDigest(v.contentDigest)) errors.push("contentDigest must be a sha256 hex digest")
  if (!isPlainObject(v.captured)) errors.push("captured source state is required")
  else errors.push(...validateSourceStateDigest(v.captured).map((e) => `captured.${e}`))
  if (v.lineRange !== undefined) {
    const lr = v.lineRange
    if (!Array.isArray(lr) || lr.length !== 2 || !lr.every((n) => typeof n === "number" && Number.isInteger(n) && n > 0))
      errors.push("lineRange must be [start, end]")
  }
  if (v.recovery !== undefined) {
    const r = v.recovery
    if (!isPlainObject(r) || !isStr(r.excerpt) || typeof r.truncated !== "boolean") errors.push("recovery must be {excerpt, truncated}")
  }
  if (errors.length) return { ok: false, errors }
  return { ok: true, value: v as unknown as EvidenceRef }
}

export function validateVerificationRecord(v: unknown): Validated<VerificationRecord> {
  const errors: string[] = []
  if (!isPlainObject(v)) return { ok: false, errors: ["verification must be an object"] }
  if (!isNonEmpty(v.command)) errors.push("command is required")
  if (!isNonEmpty(v.cwd)) errors.push("cwd is required")
  if (typeof v.exitStatus !== "number" && v.exitStatus !== "unknown") errors.push("exitStatus must be a number or 'unknown'")
  if (!isNonEmpty(v.executedAt)) errors.push("executedAt is required")
  const s = validateSourceStateDigest(v.sourceStateDigest)
  if (s.length) errors.push(...s.map((e) => `sourceStateDigest.${e}`))
  if (errors.length) return { ok: false, errors }
  return { ok: true, value: v as unknown as VerificationRecord }
}

type LabeledList = Array<{ text: string; provenance: ProvenanceLabel }>

function validateLabeled(v: unknown, name: string, required: boolean): Validated<LabeledList | null> {
  // A required list must be present AND non-empty — an empty list would silently
  // drop mandatory material (plan §9: zero silent losses).
  if (v === undefined || (Array.isArray(v) && v.length === 0)) {
    if (required) return { ok: false, errors: [`${name} is required`] }
    return { ok: true, value: null }
  }
  if (!Array.isArray(v)) return { ok: false, errors: [`${name} must be an array`] }
  const out: LabeledList = []
  const errors: string[] = []
  v.forEach((item, i) => {
    if (!isPlainObject(item) || !isNonEmpty(item.text)) errors.push(`${name}[${i}].text is required`)
    else if (!label(item.provenance)) errors.push(`${name}[${i}].provenance must be one of ${PROVENANCE_LABELS.join("|")}`)
    else out.push({ text: item.text, provenance: item.provenance })
  })
  if (errors.length) return { ok: false, errors }
  return { ok: true, value: out }
}

// Handoff mandatory fields per stage6-plan §5/§6: objective, constraints, acceptance
// criteria. Missing mandatory material must be rejected here so the caller records a
// fallback instead of silently dropping facts.
export function validateHandoff(v: unknown): Validated<HandoffRecord> {
  const errors: string[] = []
  if (!isPlainObject(v)) return { ok: false, errors: ["handoff must be an object"] }
  if (v.schemaVersion !== SCHEMA_VERSION) errors.push(`schemaVersion must be ${SCHEMA_VERSION}`)
  for (const key of ["handoffID", "taskID", "workflowID", "sourceSession", "objective", "createdAt"]) {
    if (!isNonEmpty(v[key])) errors.push(`${key} is required`)
  }
  if (!isStr(v.handoffID) || !ID_RE.test(v.handoffID)) errors.push("handoffID must be a simple id")
  if (!isStr(v.direction) || !(DIRECTIONS as readonly string[]).includes(v.direction)) errors.push(`direction must be one of ${DIRECTIONS.join("|")}`)
  const constraints = validateLabeled(v.constraints, "constraints", true)
  if (!constraints.ok) errors.push(...constraints.errors)
  const acceptance = validateLabeled(v.acceptanceCriteria, "acceptanceCriteria", true)
  if (!acceptance.ok) errors.push(...acceptance.errors)
  const decisions = validateLabeled(v.decisions, "decisions", false)
  if (!decisions.ok) errors.push(...decisions.errors)
  if (v.relevantFiles !== undefined) {
    if (!Array.isArray(v.relevantFiles)) errors.push("relevantFiles must be an array")
    else v.relevantFiles.forEach((r, i) => {
      const rv = validateEvidenceRef(r)
      if (!rv.ok) errors.push(...rv.errors.map((e) => `relevantFiles[${i}]: ${e}`))
    })
  }
  if (v.verifications !== undefined) {
    if (!Array.isArray(v.verifications)) errors.push("verifications must be an array")
    else v.verifications.forEach((r, i) => {
      const rv = validateVerificationRecord(r)
      if (!rv.ok) errors.push(...rv.errors.map((e) => `verifications[${i}]: ${e}`))
    })
  }
  for (const key of ["nextSteps", "unresolvedQuestions"]) {
    if (v[key] !== undefined && !isStrArray(v[key])) errors.push(`${key} must be a string array`)
  }
  if (errors.length) return { ok: false, errors }
  // All fields were validated above; rebuild from `v` with concrete types.
  const out: HandoffRecord = {
    schemaVersion: SCHEMA_VERSION,
    handoffID: v.handoffID as string,
    taskID: v.taskID as string,
    workflowID: v.workflowID as string,
    sourceSession: v.sourceSession as string,
    direction: v.direction as HandoffRecord["direction"],
    objective: v.objective as string,
    constraints: (constraints as { ok: true; value: LabeledList | null }).value ?? [],
    decisions: (decisions as { ok: true; value: LabeledList | null }).value ?? [],
    relevantFiles: (v.relevantFiles ?? []) as EvidenceRef[],
    currentWork: isStr(v.currentWork) ? (v.currentWork as string) : undefined,
    nextSteps: (v.nextSteps ?? []) as string[],
    acceptanceCriteria: (acceptance as { ok: true; value: LabeledList | null }).value ?? [],
    unresolvedQuestions: (v.unresolvedQuestions ?? []) as string[],
    verifications: (v.verifications ?? []) as VerificationRecord[],
    evidenceRefs: (v.evidenceRefs ?? []) as EvidenceRef[],
    createdAt: v.createdAt as string,
  }
  return { ok: true, value: out }
}

export function validateTaskRecord(v: unknown): Validated<TaskRecord> {
  const errors: string[] = []
  if (!isPlainObject(v)) return { ok: false, errors: ["task record must be an object"] }
  if (v.schemaVersion !== SCHEMA_VERSION) errors.push(`schemaVersion must be ${SCHEMA_VERSION}`)
  for (const key of ["taskID", "workflowID", "originatingSession", "createdAt", "updatedAt"]) {
    if (!isNonEmpty(v[key])) errors.push(`${key} is required`)
  }
  if (!isPlainObject(v.project)) errors.push("project identity is required")
  else {
    for (const key of ["projectID", "worktreeID", "worktreeRealpath"]) if (!isNonEmpty(v.project[key])) errors.push(`project.${key} is required`)
  }
  if (!isStr(v.lifecycle) || !(LIFECYCLES as readonly string[]).includes(v.lifecycle)) errors.push(`lifecycle must be one of ${LIFECYCLES.join("|")}`)
  if (typeof v.revision !== "number" || !Number.isInteger(v.revision) || v.revision < 1) errors.push("revision must be a positive integer")
  if (v.continuationSessions !== undefined && !isStrArray(v.continuationSessions)) errors.push("continuationSessions must be a string array")
  if (v.telemetryTasks !== undefined && !isStrArray(v.telemetryTasks)) errors.push("telemetryTasks must be a string array")
  if (v.handoffIDs !== undefined && !isStrArray(v.handoffIDs)) errors.push("handoffIDs must be a string array")
  if (errors.length) return { ok: false, errors }
  const out: TaskRecord = {
    schemaVersion: SCHEMA_VERSION,
    taskID: v.taskID as string,
    workflowID: v.workflowID as string,
    project: v.project as TaskRecord["project"],
    originatingSession: v.originatingSession as string,
    continuationSessions: (v.continuationSessions ?? []) as string[],
    objectiveRef: isStr(v.objectiveRef) ? (v.objectiveRef as string) : undefined,
    revision: v.revision as number,
    lifecycle: v.lifecycle as TaskRecord["lifecycle"],
    telemetryTasks: (v.telemetryTasks ?? []) as string[],
    handoffIDs: (v.handoffIDs ?? []) as string[],
    createdAt: v.createdAt as string,
    updatedAt: v.updatedAt as string,
  }
  return { ok: true, value: out }
}

export function validateMemoryNote(v: unknown): Validated<MemoryNoteMeta> {
  const errors: string[] = []
  if (!isPlainObject(v)) return { ok: false, errors: ["memory note must be an object"] }
  if (v.schemaVersion !== SCHEMA_VERSION) errors.push(`schemaVersion must be ${SCHEMA_VERSION}`)
  if (!isStr(v.noteID) || !ID_RE.test(v.noteID)) errors.push("noteID must be a simple id")
  if (!isNonEmpty(v.scope)) errors.push("scope is required")
  if (!isPlainObject(v.refs)) errors.push("refs is required")
  else {
    if (v.refs.paths !== undefined && !Array.isArray(v.refs.paths)) errors.push("refs.paths must be an array")
    else if (Array.isArray(v.refs.paths)) v.refs.paths.forEach((p, i) => { if (!isRepoRelative(p)) errors.push(`refs.paths[${i}] must be repo-relative`) })
    if (v.refs.symbols !== undefined && !isStrArray(v.refs.symbols)) errors.push("refs.symbols must be a string array")
  }
  if (!isStr(v.authorKind) || !["user", "model", "derived"].includes(v.authorKind)) errors.push("authorKind must be user|model|derived")
  if (!isStr(v.validity) || !(VALIDITIES as readonly string[]).includes(v.validity)) errors.push(`validity must be one of ${VALIDITIES.join("|")}`)
  if (!isNonEmpty(v.lastValidatedAt)) errors.push("lastValidatedAt is required")
  if (v.sourceDigests !== undefined) {
    const s = validateSourceStateDigest({ dirtyFiles: v.sourceDigests })
    if (s.length) errors.push(...s.map((e) => e.replace("dirtyFiles", "sourceDigests")))
  }
  if (errors.length) return { ok: false, errors }
  return { ok: true, value: v as unknown as MemoryNoteMeta }
}

export function validateMemoryIndex(v: unknown): Validated<{ schemaVersion: number; projectID: string; notes: Record<string, MemoryNoteMeta>; updatedAt: string }> {
  const errors: string[] = []
  if (!isPlainObject(v)) return { ok: false, errors: ["memory index must be an object"] }
  if (v.schemaVersion !== SCHEMA_VERSION) errors.push(`schemaVersion must be ${SCHEMA_VERSION}`)
  if (!isNonEmpty(v.projectID)) errors.push("projectID is required")
  if (!isNonEmpty(v.updatedAt)) errors.push("updatedAt is required")
  if (!isPlainObject(v.notes)) errors.push("notes must be an object")
  const notes: Record<string, MemoryNoteMeta> = {}
  if (isPlainObject(v.notes)) {
    for (const [id, meta] of Object.entries(v.notes)) {
      const nv = validateMemoryNote(meta)
      if (!nv.ok) errors.push(...nv.errors.map((e) => `notes[${id}]: ${e}`))
      else notes[id] = nv.value
    }
  }
  if (errors.length) return { ok: false, errors }
  return { ok: true, value: { schemaVersion: SCHEMA_VERSION, projectID: v.projectID as string, notes, updatedAt: v.updatedAt as string } }
}
