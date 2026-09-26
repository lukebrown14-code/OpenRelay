import fs from "node:fs"
import path from "node:path"
import { newRecordID, newWorkflowID, nowISO } from "../ids"
import { projectIdentity, type ProjectIdentity } from "./identity"
import { readInside, resolveInside, writeInside } from "./paths"
import {
  SCHEMA_VERSION,
  validateHandoff,
  validateMemoryIndex,
  validateTaskRecord,
} from "./schemas"
import type { HandoffRecord, MemoryIndex, MemoryNoteMeta, TaskRecord } from "./types"

export class ConflictError extends Error {}
export class LockError extends Error {}
export class ValidationError extends Error {}

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

const LOCK_STALE_MS = 60_000
const CODEBASE_DIR = ".codebase"
const TASKS_DIR = ".tasks"

type LockInfo = { pid: number; at: string }

// Project-local artifact store (.codebase/ + .tasks/ inside the worktree).
// All reads/writes are confined to the worktree root; existing files are never
// silently replaced; handoff snapshots are immutable; task records use a lock plus
// revision compare-and-swap so two concurrent writers cannot silently interleave.
export class ProjectStore {
  readonly root: string
  readonly identity: ProjectIdentity

  constructor(worktree: string) {
    this.root = fs.realpathSync(worktree)
    this.identity = projectIdentity(this.root)
  }

  // ---- paths ----

  // IDs become path segments; reject anything that is not a simple id so path
  // traversal can never slip through normalization (e.g. "../evil").
  private checkID(id: string, kind: string): string {
    if (!ID_RE.test(id)) throw new ValidationError(`invalid ${kind} id: ${id}`)
    return id
  }

  taskDir(taskID: string): string {
    this.checkID(taskID, "task")
    return path.join(TASKS_DIR, taskID)
  }

  taskStateRel(taskID: string): string {
    return path.join(this.taskDir(taskID), "state.json")
  }

  handoffRel(taskID: string, handoffID: string): string {
    this.checkID(handoffID, "handoff")
    return path.join(this.taskDir(taskID), "handoffs", `${handoffID}.json`)
  }

  // ---- initialization (opt-in; never overwrites) ----

  init(): { created: string[]; existing: string[] } {
    const created: string[] = []
    const existing: string[] = []
    const ensure = (rel: string, content?: string): void => {
      const full = resolveInside(this.root, rel)
      if (fs.existsSync(full)) {
        existing.push(rel)
        return
      }
      fs.mkdirSync(path.dirname(full), { recursive: true })
      if (content !== undefined) writeInside(this.root, rel, content)
      else fs.mkdirSync(full, { recursive: true })
      created.push(rel)
    }
    ensure(path.join(CODEBASE_DIR, "INDEX.md"), "# Project knowledge index\n\nDerived view; regenerate rather than hand-edit.\n")
    ensure(path.join(CODEBASE_DIR, "memory.json"), JSON.stringify(this.emptyIndex(), null, 1) + "\n")
    ensure(path.join(CODEBASE_DIR, "modules"))
    ensure(TASKS_DIR)
    return { created, existing }
  }

  private emptyIndex(): MemoryIndex {
    return { schemaVersion: SCHEMA_VERSION, projectID: this.identity.projectID, notes: {}, updatedAt: nowISO() }
  }

  // ---- task records ----

  createTask(input: { sessionID: string; objectiveRef?: string; telemetryTaskID?: string }): TaskRecord {
    const taskID = newRecordID("task")
    const record: TaskRecord = {
      schemaVersion: SCHEMA_VERSION,
      taskID,
      workflowID: newWorkflowID(),
      project: {
        projectID: this.identity.projectID,
        worktreeID: this.identity.worktreeID,
        worktreeRealpath: this.identity.worktreeRealpath,
      },
      originatingSession: input.sessionID,
      continuationSessions: [],
      objectiveRef: input.objectiveRef,
      revision: 1,
      lifecycle: "active",
      telemetryTasks: input.telemetryTaskID ? [input.telemetryTaskID] : [],
      handoffIDs: [],
      createdAt: nowISO(),
      updatedAt: nowISO(),
    }
    writeInside(this.root, this.taskStateRel(taskID), JSON.stringify(record, null, 1) + "\n")
    return record
  }

  loadTask(taskID: string): TaskRecord | null {
    const raw = readInside(this.root, this.taskStateRel(taskID))
    if (raw === null) return null
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      throw new ValidationError(`malformed task record: ${taskID}`)
    }
    const v = validateTaskRecord(parsed)
    if (!v.ok) throw new ValidationError(`invalid task record ${taskID}: ${v.errors.join("; ")}`)
    return v.value
  }

  findTaskBySession(sessionID: string): TaskRecord | null {
    let entries: string[] = []
    try {
      entries = fs.readdirSync(resolveInside(this.root, TASKS_DIR))
    } catch {
      return null
    }
    for (const id of entries) {
      if (!id.startsWith("task-")) continue
      let rec: TaskRecord | null = null
      try {
        rec = this.loadTask(id)
      } catch {
        continue
      }
      if (!rec) continue
      if (rec.originatingSession === sessionID || rec.continuationSessions.includes(sessionID)) return rec
    }
    return null
  }

  saveTaskRecord(record: TaskRecord): TaskRecord {
    const current = this.loadTask(record.taskID)
    if (current === null) throw new ConflictError(`task record missing: ${record.taskID}`)
    if (current.revision !== record.revision) {
      throw new ConflictError(`revision conflict on ${record.taskID}: on-disk ${current.revision} != staged ${record.revision}`)
    }
    const next: TaskRecord = { ...record, revision: record.revision + 1, updatedAt: nowISO() }
    writeInside(this.root, this.taskStateRel(record.taskID), JSON.stringify(next, null, 1) + "\n")
    return next
  }

  withTaskLock<T>(taskID: string, fn: () => T): T {
    const lockRel = path.join(this.taskDir(taskID), ".lock")
    const full = resolveInside(this.root, lockRel)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    const info: LockInfo = { pid: process.pid, at: nowISO() }
    let ours = false
    try {
      const fd = fs.openSync(full, "wx", 0o600)
      fs.writeSync(fd, JSON.stringify(info))
      fs.closeSync(fd)
      ours = true
    } catch {
      const existing = this.readLock(full)
      if (existing && existing.pid === process.pid) {
        ours = true // reentrant within this process
      } else if (existing && Date.parse(existing.at) < Date.now() - LOCK_STALE_MS) {
        try {
          fs.rmSync(full)
        } catch {}
        const fd = fs.openSync(full, "wx", 0o600)
        fs.writeSync(fd, JSON.stringify(info))
        fs.closeSync(fd)
        ours = true
      } else {
        throw new LockError(`task ${taskID} is locked${existing ? ` (pid ${existing.pid})` : ""}`)
      }
    }
    if (!ours) throw new LockError(`task ${taskID} could not be locked`)
    try {
      return fn()
    } finally {
      try {
        fs.rmSync(full)
      } catch {}
    }
  }

  private readLock(full: string): LockInfo | null {
    try {
      const parsed = JSON.parse(fs.readFileSync(full, "utf8"))
      if (typeof parsed?.pid === "number" && typeof parsed?.at === "string") return parsed
    } catch {}
    return null
  }

  continueTask(taskID: string, sessionID: string): TaskRecord {
    return this.withTaskLock(taskID, () => {
      const rec = this.loadTask(taskID)
      if (rec === null) throw new ValidationError(`task record missing: ${taskID}`)
      if (rec.lifecycle === "completed" || rec.lifecycle === "abandoned") {
        throw new ConflictError(`task ${taskID} is ${rec.lifecycle}; refusing continuation`)
      }
      if (rec.originatingSession === sessionID || rec.continuationSessions.includes(sessionID)) return rec
      const next: TaskRecord = { ...rec, continuationSessions: [...rec.continuationSessions, sessionID] }
      return this.saveTaskRecord(next)
    })
  }

  setLifecycle(taskID: string, lifecycle: TaskRecord["lifecycle"]): TaskRecord {
    return this.withTaskLock(taskID, () => {
      const rec = this.loadTask(taskID)
      if (rec === null) throw new ValidationError(`task record missing: ${taskID}`)
      return this.saveTaskRecord({ ...rec, lifecycle })
    })
  }

  linkTelemetryTask(taskID: string, telemetryTaskID: string): TaskRecord {
    return this.withTaskLock(taskID, () => {
      const rec = this.loadTask(taskID)
      if (rec === null) throw new ValidationError(`task record missing: ${taskID}`)
      if (rec.telemetryTasks.includes(telemetryTaskID)) return rec
      return this.saveTaskRecord({ ...rec, telemetryTasks: [...rec.telemetryTasks, telemetryTaskID] })
    })
  }

  // ---- handoffs (immutable snapshots + derived view) ----

  writeHandoff(taskID: string, handoff: Omit<HandoffRecord, "schemaVersion" | "taskID" | "workflowID" | "createdAt"> & { createdAt?: string }): HandoffRecord {
    const full: HandoffRecord = {
      ...handoff,
      schemaVersion: SCHEMA_VERSION,
      taskID,
      workflowID: this.loadTask(taskID)?.workflowID ?? "unknown",
      createdAt: handoff.createdAt ?? nowISO(),
    }
    const v = validateHandoff(full)
    if (!v.ok) throw new ValidationError(`invalid handoff: ${v.errors.join("; ")}`)
    writeInside(this.root, this.handoffRel(taskID, v.value.handoffID), JSON.stringify(v.value, null, 1) + "\n", "exclusive")
    this.withTaskLock(taskID, () => {
      const rec = this.loadTask(taskID)
      if (rec === null) return
      if (rec.handoffIDs.includes(v.value.handoffID)) return
      this.saveTaskRecord({ ...rec, handoffIDs: [...rec.handoffIDs, v.value.handoffID] })
    })
    return v.value
  }

  readHandoff(taskID: string, handoffID: string): HandoffRecord | null {
    const raw = readInside(this.root, this.handoffRel(taskID, handoffID))
    if (raw === null) return null
    const v = validateHandoff(JSON.parse(raw))
    if (!v.ok) throw new ValidationError(`invalid handoff ${handoffID}: ${v.errors.join("; ")}`)
    return v.value
  }

  // Deterministic Markdown view of a handoff snapshot (canonical data stays in JSON).
  renderHandoff(h: HandoffRecord): string {
    const lines: string[] = []
    lines.push(`# Handoff ${h.handoffID}`)
    lines.push("")
    lines.push(`- Task: ${h.taskID} (workflow ${h.workflowID})`)
    lines.push(`- Direction: ${h.direction}`)
    lines.push(`- Source session: ${h.sourceSession}`)
    lines.push(`- Created: ${h.createdAt}`)
    lines.push("")
    lines.push(`## Objective`)
    lines.push("")
    lines.push(h.objective)
    lines.push("")
    const section = (title: string, items: Array<{ text: string; provenance: string }>): void => {
      if (!items.length) return
      lines.push(`## ${title}`)
      lines.push("")
      for (const item of items) lines.push(`- [${item.provenance}] ${item.text}`)
      lines.push("")
    }
    section("Constraints", h.constraints)
    section("Accepted decisions", h.decisions)
    section("Acceptance criteria", h.acceptanceCriteria)
    if (h.relevantFiles.length) {
      lines.push(`## Relevant files`)
      lines.push("")
      for (const f of h.relevantFiles) lines.push(`- ${f.path} (sha256 ${f.contentDigest.slice(0, 12)}…)`)
      lines.push("")
    }
    if (h.currentWork) {
      lines.push(`## Current work`)
      lines.push("")
      lines.push(h.currentWork)
      lines.push("")
    }
    if (h.nextSteps.length) {
      lines.push(`## Next steps`)
      lines.push("")
      for (const s of h.nextSteps) lines.push(`- ${s}`)
      lines.push("")
    }
    if (h.unresolvedQuestions.length) {
      lines.push(`## Unresolved questions`)
      lines.push("")
      for (const s of h.unresolvedQuestions) lines.push(`- ${s}`)
      lines.push("")
    }
    if (h.verifications.length) {
      lines.push(`## Verification records`)
      lines.push("")
      for (const v of h.verifications) lines.push(`- \`${v.command}\` in ${v.cwd} → exit ${v.exitStatus} at ${v.executedAt}`)
      lines.push("")
    }
    return lines.join("\n")
  }

  writeHandoffView(taskID: string, handoffID: string): string {
    const h = this.readHandoff(taskID, handoffID)
    if (h === null) throw new ValidationError(`handoff missing: ${handoffID}`)
    const view = this.renderHandoff(h)
    writeInside(this.root, path.join(this.taskDir(taskID), "HANDOFF.md"), view)
    return view
  }

  // ---- project memory index (.codebase/memory.json) ----

  loadMemoryIndex(): MemoryIndex {
    const raw = readInside(this.root, path.join(CODEBASE_DIR, "memory.json"))
    if (raw === null) return this.emptyIndex()
    const v = validateMemoryIndex(JSON.parse(raw))
    if (!v.ok) throw new ValidationError(`invalid memory index: ${v.errors.join("; ")}`)
    return v.value
  }

  upsertNote(meta: MemoryNoteMeta): MemoryIndex {
    return this.withMemoryLock(() => {
      const index = this.loadMemoryIndex()
      const notes = { ...index.notes, [meta.noteID]: meta }
      const next: MemoryIndex = { ...index, notes, updatedAt: nowISO() }
      writeInside(this.root, path.join(CODEBASE_DIR, "memory.json"), JSON.stringify(next, null, 1) + "\n")
      return next
    })
  }

  private withMemoryLock<T>(fn: () => T): T {
    const full = resolveInside(this.root, path.join(CODEBASE_DIR, "memory.json"))
    fs.mkdirSync(path.dirname(full), { recursive: true })
    // Reuse the task-lock protocol keyed on the index file.
    const lockRel = path.join(CODEBASE_DIR, "memory.json.lock")
    const lockFull = resolveInside(this.root, lockRel)
    let ours = false
    try {
      const fd = fs.openSync(lockFull, "wx", 0o600)
      fs.writeSync(fd, JSON.stringify({ pid: process.pid, at: nowISO() }))
      fs.closeSync(fd)
      ours = true
    } catch {
      const existing = this.readLock(lockFull)
      if (existing && existing.pid === process.pid) ours = true
      else if (existing && Date.parse(existing.at) < Date.now() - LOCK_STALE_MS) {
        try {
          fs.rmSync(lockFull)
        } catch {}
        const fd = fs.openSync(lockFull, "wx", 0o600)
        fs.writeSync(fd, JSON.stringify({ pid: process.pid, at: nowISO() }))
        fs.closeSync(fd)
        ours = true
      }
    }
    if (!ours) throw new LockError("memory index is locked")
    try {
      return fn()
    } finally {
      try {
        fs.rmSync(lockFull)
      } catch {}
    }
  }
}
