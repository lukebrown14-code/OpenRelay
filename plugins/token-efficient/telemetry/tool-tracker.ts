import type { Store, TaskState } from "../lib/store"
import { nowISO } from "../lib/ids"
import type { SessionTracker } from "./session-tracker"

type Pending = {
  tool: string
  sessionID: string
  args: Record<string, unknown>
  started: number
}

const VERIFY_RE =
  /(^|[\s&|;(])(vitest|jest|mocha|pytest|py\.test|cargo test|go test|node --test|npm (run )?test|yarn test|pnpm (run )?test|bun test|tsc|typecheck|type-check|eslint|biome check|ruff check|pyright|mypy|golangci-lint)([\s"']|$)/i

const FAIL_RE = /\b(FAIL|FAILED|FAILURES|failing)|✕|✗|error TS\d+|AssertionError/i
const PASS_RE = /\b(passed|passing|all tests? passed)|✓/i

function filePathFrom(args: Record<string, unknown> | undefined): string | undefined {
  if (!args) return undefined
  const f = args.filePath ?? args.file ?? args.path
  return typeof f === "string" ? f : undefined
}

function commandFrom(args: Record<string, unknown> | undefined): string | undefined {
  if (!args) return undefined
  const c = args.command ?? args.cmd
  return typeof c === "string" ? c : undefined
}

function exitFrom(metadata: Record<string, unknown> | undefined): number | null {
  if (!metadata) return null
  for (const k of ["exit", "exitCode", "code", "status"]) {
    const v = metadata[k]
    if (typeof v === "number" && Number.isFinite(v)) return v
  }
  return null
}

function verdict(exit: number | null, output: string): "pass" | "fail" | "unknown" {
  if (exit !== null) return exit === 0 ? "pass" : "fail"
  if (FAIL_RE.test(output)) return "fail"
  if (PASS_RE.test(output)) return "pass"
  return "unknown"
}

export class ToolTracker {
  private pending = new Map<string, Pending>()

  constructor(
    private store: Store,
    private sessions: SessionTracker,
  ) {}

  before(callID: string, sessionID: string, tool: string, args: Record<string, unknown>): void {
    if (this.pending.size > 200) {
      const cutoff = Date.now() - 10 * 60 * 1000
      for (const [id, p] of this.pending) {
        if (p.started < cutoff) this.pending.delete(id)
      }
    }
    this.pending.set(callID, { tool, sessionID, args: args ?? {}, started: Date.now() })
  }

  after(
    callID: string,
    output: { title?: string; output?: string; metadata?: Record<string, unknown> },
  ): void {
    const p = this.pending.get(callID)
    this.pending.delete(callID)
    if (!p) return
    const durationMs = Date.now() - p.started
    const text = typeof output?.output === "string" ? output.output : ""
    const bytes = text.length
    const exit = exitFrom(output?.metadata)
    const errored = exit !== null ? exit !== 0 : Boolean((output?.metadata as { error?: unknown } | undefined)?.error)

    this.sessions.toolEvent(p.sessionID, (task: TaskState) => {
      const t = (task.tools[p.tool] ??= { calls: 0, errors: 0, ms: 0, bytes: 0 })
      t.calls += 1
      t.ms += durationMs
      t.bytes += bytes
      if (errored) t.errors += 1

      const file = filePathFrom(p.args)
      if (p.tool === "read" && file) {
        if (this.store.noteFile(task.filesRead, file)) {
          this.store.event("file.read", { file }, p.sessionID, task.taskID)
        }
      }
      if ((p.tool === "edit" || p.tool === "write" || p.tool === "patch") && file) {
        if (this.store.noteFile(task.filesEdited, file)) {
          this.store.event("file.edited", { file }, p.sessionID, task.taskID)
        }
      }

      if (p.tool === "bash") {
        const cmd = commandFrom(p.args) ?? ""
        if (VERIFY_RE.test(cmd)) {
          const v = verdict(exit, text)
          const record = { cmd: cmd.slice(0, 300), verdict: v, exitCode: exit, at: nowISO(), durationMs }
          task.verifications.push(record)
          this.store.capVerifications(task.verifications)
          if (task.filesEdited.length > 0) task.editTestCycles += 1
          this.store.event("verification", record, p.sessionID, task.taskID)
        }
      }

      this.store.event(
        "tool.call",
        { tool: p.tool, durationMs, bytes, exitCode: exit, error: errored },
        p.sessionID,
        task.taskID,
      )
    })
  }
}
