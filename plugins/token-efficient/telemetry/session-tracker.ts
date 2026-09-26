import type { Store, TaskState } from "../lib/store"
import { newTaskID, newWorkflowID, nowISO } from "../lib/ids"
import { modelKey, tier } from "../lib/classify"

type AssistantInfo = {
  id?: string
  sessionID?: string
  role?: string
  modelID?: string
  providerID?: string
  agent?: string
  mode?: string
  cost?: number
  tokens?: { input?: number; output?: number; reasoning?: number; cache?: { read?: number; write?: number } }
  time?: { created?: number; completed?: number }
  error?: { type?: string; message?: string } | unknown
}

type Tracked = {
  task: TaskState
  lastModel: string
  processed: Set<string>
}

export class SessionTracker {
  private sessions = new Map<string, Tracked>()

  constructor(private store: Store) {}

  private ensure(sessionID: string): Tracked {
    let t = this.sessions.get(sessionID)
    if (t) return t
    // Recovery: a session that already has a persisted task record (e.g. a
    // continuation after restart) resumes it instead of minting a duplicate.
    const restored = this.store.loadTaskForSession(sessionID)
    if (restored) {
      t = { task: restored, lastModel: "", processed: new Set(restored.processedMessages ?? []) }
      this.sessions.set(sessionID, t)
      this.store.event("task.restored", { workflowID: restored.workflowID }, sessionID, restored.taskID)
      return t
    }
    const task: TaskState = {
      taskID: newTaskID(),
      workflowID: newWorkflowID(),
      sessionID,
      slug: this.store.slug,
      worktree: this.store.worktree,
      directory: this.store.directory,
      createdAt: nowISO(),
      lastActivityAt: nowISO(),
      attempts: 0,
      models: [],
      modelSwitches: 0,
      llmCalls: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
      byModel: {},
      tools: {},
      filesRead: [],
      filesEdited: [],
      filtering: { calls: 0, bytesBefore: 0, bytesAfter: 0, recoveries: 0 },
      verifications: [],
      editTestCycles: 0,
      errors: [],
      outcome: { status: "running", idles: 0, lastErrorAt: null },
      processedMessages: [],
    }
    t = { task, lastModel: "", processed: new Set() }
    this.sessions.set(sessionID, t)
    this.store.bindSession(sessionID, task.taskID)
    this.store.event("task.created", { worktree: this.store.worktree, workflowID: task.workflowID }, sessionID, task.taskID)
    return t
  }

  setContext(sessionID: string, agent?: string, model?: { providerID: string; modelID: string }): void {
    const t = this.ensure(sessionID)
    if (agent) t.task.agent = agent
    if (model && !t.task.requestedModel) t.task.requestedModel = model
  }

  userMessage(sessionID: string, agent?: string, model?: { providerID: string; modelID: string }): void {
    const t = this.ensure(sessionID)
    t.task.attempts += 1
    t.task.lastActivityAt = nowISO()
    this.setContext(sessionID, agent, model)
    this.store.event(
      "user.message",
      { attempt: t.task.attempts, agent, model: model ? modelKey(model.providerID, model.modelID) : undefined },
      sessionID,
      t.task.taskID,
    )
    this.store.saveTask(t.task)
  }

  llmCall(
    sessionID: string,
    agent?: string,
    model?: { providerID?: string; id?: string },
    providerID?: string,
  ): void {
    const t = this.ensure(sessionID)
    t.task.llmCalls += 1
    t.task.lastActivityAt = nowISO()
    const pid = providerID ?? model?.providerID
    const mid = model?.id
    const key = modelKey(pid, mid)
    this.store.event(
      "llm.call",
      { agent, model: key, tier: tier(pid, mid), small: agent === "title" || agent === "summary" || agent === "compaction" },
      sessionID,
      t.task.taskID,
    )
  }

  messageUpdated(info: AssistantInfo | undefined): void {
    if (!info || !info.id || !info.sessionID) return
    if (info.role !== "assistant") return
    const sessionID = info.sessionID
    const t = this.sessions.get(sessionID)
    if (!t) return
    const done = info.time?.completed !== undefined
    const failed = info.error !== undefined && info.error !== null
    if (!done && !failed) return
    if (t.processed.has(info.id)) return
    t.processed.add(info.id)
    if (t.processed.size > 500) t.processed = new Set(Array.from(t.processed).slice(-250))
    const key = modelKey(info.providerID, info.modelID)
    if (t.task.models.length === 0 || t.task.models[t.task.models.length - 1] !== key) {
      if (t.task.models.length > 0) {
        t.task.modelSwitches += 1
        this.store.event("model.switch", { from: t.task.models[t.task.models.length - 1], to: key }, sessionID, t.task.taskID)
      }
      t.task.models.push(key)
    }

    const tk = info.tokens ?? {}
    const usageAvailable = [tk.input, tk.output, tk.cache?.read].every((value) =>
      typeof value === "number" && Number.isFinite(value) && value >= 0,
    )
    const input = tk.input ?? 0
    const output = tk.output ?? 0
    const reasoning = tk.reasoning ?? 0
    const cacheRead = tk.cache?.read ?? 0
    const cacheWrite = tk.cache?.write ?? 0
    const cost = info.cost ?? 0
    t.task.tokens.input += input
    t.task.tokens.output += output
    t.task.tokens.reasoning += reasoning
    t.task.tokens.cacheRead += cacheRead
    t.task.tokens.cacheWrite += cacheWrite
    t.task.tokens.cost += cost

    const tr = tier(info.providerID, info.modelID)
    const bm = (t.task.byModel[key] ??= { calls: 0, input: 0, output: 0, cost: 0, tier: tr })
    bm.calls += 1
    bm.input += input
    bm.output += output
    bm.cost += cost

    let latencyMs: number | null = null
    if (info.time?.created && info.time?.completed) latencyMs = info.time.completed - info.time.created

    if (failed) {
      const err = info.error as { type?: string; message?: string } | undefined
      const message = err?.message ?? err?.type ?? "unknown error"
      t.task.errors.push({ at: nowISO(), message: String(message).slice(0, 300) })
      this.store.capErrors(t.task.errors)
      t.task.outcome.status = "error"
      t.task.outcome.lastErrorAt = nowISO()
      this.store.event("message.error", { model: key, message: String(message).slice(0, 300) }, sessionID, t.task.taskID)
    }

    this.store.event(
      "assistant.completed",
      {
        messageID: info.id,
        model: key,
        tier: tr,
        agent: info.agent ?? info.mode,
        usageAvailable,
        tokens: usageAvailable ? { input, output, reasoning, cacheRead, cacheWrite } : null,
        cost,
        latencyMs,
        error: failed,
      },
      sessionID,
      t.task.taskID,
    )
    t.task.lastActivityAt = nowISO()
    t.task.processedMessages = Array.from(t.processed).slice(-500)
    this.store.saveTask(t.task)
  }

  idle(sessionID: string | undefined): void {
    if (!sessionID) return
    const t = this.sessions.get(sessionID)
    if (!t) return
    t.task.outcome.idles += 1
    if (t.task.outcome.status !== "error") t.task.outcome.status = "idle"
    t.task.lastActivityAt = nowISO()
    const durationMs = Date.parse(t.task.lastActivityAt) - Date.parse(t.task.createdAt)
    this.store.event("task.idle", { idles: t.task.outcome.idles, durationMs }, sessionID, t.task.taskID)
    this.store.saveTask(t.task)
  }

  sessionError(sessionID: string | undefined, error: unknown): void {
    if (!sessionID) return
    const t = this.sessions.get(sessionID)
    if (!t) return
    const message =
      typeof error === "object" && error !== null && "message" in error
        ? String((error as { message?: unknown }).message).slice(0, 300)
        : "session error"
    t.task.errors.push({ at: nowISO(), message })
    this.store.capErrors(t.task.errors)
    t.task.outcome.status = "error"
    t.task.outcome.lastErrorAt = nowISO()
    this.store.event("session.error", { message }, sessionID, t.task.taskID)
    this.store.saveTask(t.task)
  }

  toolEvent(sessionID: string, mutate: (task: TaskState) => void): void {
    const t = this.sessions.get(sessionID)
    if (!t) return
    mutate(t.task)
    t.task.lastActivityAt = nowISO()
    this.store.saveTask(t.task)
  }

  recordFiltered(sessionID: string, bytesBefore: number, bytesAfter: number): void {
    const t = this.sessions.get(sessionID)
    if (!t) return
    const f = (t.task.filtering ??= { calls: 0, bytesBefore: 0, bytesAfter: 0, recoveries: 0 })
    f.calls += 1
    f.bytesBefore += bytesBefore
    f.bytesAfter += bytesAfter
    t.task.lastActivityAt = nowISO()
    this.store.saveTask(t.task)
  }

  recordRecovered(sessionID: string): void {
    const t = this.sessions.get(sessionID)
    if (!t) return
    const f = (t.task.filtering ??= { calls: 0, bytesBefore: 0, bytesAfter: 0, recoveries: 0 })
    f.recoveries += 1
    t.task.lastActivityAt = nowISO()
    this.store.saveTask(t.task)
  }

  taskID(sessionID: string): string | undefined {
    return this.sessions.get(sessionID)?.task.taskID
  }

  taskState(sessionID: string): TaskState | undefined {
    return this.sessions.get(sessionID)?.task
  }

  flush(): void {
    for (const t of this.sessions.values()) this.store.saveTask(t.task)
  }
}
