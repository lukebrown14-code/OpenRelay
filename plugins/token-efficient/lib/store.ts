import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fnv1a, slugFor } from "./ids"

export type TaskState = {
  taskID: string
  sessionID: string
  slug: string
  worktree: string
  directory: string
  agent?: string
  requestedModel?: { providerID: string; modelID: string }
  createdAt: string
  lastActivityAt: string
  attempts: number
  models: string[]
  modelSwitches: number
  llmCalls: number
  tokens: { input: number; output: number; reasoning: number; cacheRead: number; cacheWrite: number; cost: number }
  byModel: Record<string, { calls: number; input: number; output: number; cost: number; tier: string }>
  tools: Record<string, { calls: number; errors: number; ms: number; bytes: number }>
  filesRead: string[]
  filesEdited: string[]
  verifications: Array<{ cmd: string; verdict: string; exitCode: number | null; at: string; durationMs: number | null }>
  editTestCycles: number
  errors: Array<{ at: string; message: string }>
  outcome: { status: "running" | "idle" | "error"; idles: number; lastErrorAt: string | null }
}

const MAX_LIST = 200
const MAX_VERIFICATIONS = 100
const MAX_ERRORS = 50

export class Store {
  readonly root: string
  readonly slug: string
  readonly worktree: string
  readonly directory: string

  constructor(worktree: string, directory: string, overrideDir?: string) {
    this.worktree = worktree
    this.directory = directory
    this.slug = slugFor(worktree)
    this.root =
      overrideDir && overrideDir.trim()
        ? path.isAbsolute(overrideDir)
          ? overrideDir
          : path.join(os.homedir(), overrideDir)
        : path.join(os.homedir(), ".local", "share", "opencode", "token-efficient")
    try {
      fs.mkdirSync(path.join(this.root, "events"), { recursive: true })
      fs.mkdirSync(path.join(this.root, "tasks", this.slug), { recursive: true })
    } catch {}
  }

  event(type: string, data: Record<string, unknown>, sessionID?: string, taskID?: string): void {
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      v: 1,
      type,
      slug: this.slug,
      session: sessionID,
      task: taskID,
      data,
    })
    try {
      fs.appendFileSync(path.join(this.root, "events", `${this.slug}.jsonl`), line + "\n")
    } catch {}
  }

  taskPath(taskID: string): string {
    return path.join(this.root, "tasks", this.slug, `${taskID}.json`)
  }

  saveTask(state: TaskState): void {
    const file = this.taskPath(state.taskID)
    const tmp = `${file}.${process.pid}.tmp`
    try {
      fs.writeFileSync(tmp, JSON.stringify(state, null, 1))
      fs.renameSync(tmp, file)
    } catch {
      try {
        fs.rmSync(tmp, { force: true })
      } catch {}
    }
  }

  sessionMapPath(): string {
    return path.join(this.root, "state.json")
  }

  bindSession(sessionID: string, taskID: string): void {
    try {
      const file = this.sessionMapPath()
      let map: Record<string, unknown> = {}
      try {
        map = JSON.parse(fs.readFileSync(file, "utf8"))
      } catch {}
      const sessions = (map.sessions as Record<string, unknown>) ?? {}
      sessions[sessionID] = { task: taskID, slug: this.slug, worktree: this.worktree, boundAt: new Date().toISOString() }
      const ids = Object.keys(sessions)
      if (ids.length > 5000) {
        for (const id of ids.slice(0, ids.length - 5000)) delete sessions[id]
      }
      map.sessions = sessions
      const tmp = `${file}.${process.pid}.tmp`
      fs.writeFileSync(tmp, JSON.stringify(map))
      fs.renameSync(tmp, file)
    } catch {}
  }

  noteFile(list: string[], file: string | undefined): boolean {
    if (!file || list.length >= MAX_LIST) return false
    if (list.includes(file)) return false
    list.push(file)
    return true
  }

  capVerifications(list: TaskState["verifications"]): void {
    while (list.length > MAX_VERIFICATIONS) list.shift()
  }

  capErrors(list: TaskState["errors"]): void {
    while (list.length > MAX_ERRORS) list.shift()
  }

  hashNote(s: string): string {
    return fnv1a(s)
  }
}
