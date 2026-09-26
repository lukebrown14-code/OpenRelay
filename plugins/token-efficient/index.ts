import type { Plugin } from "@opencode-ai/plugin"
import path from "node:path"
import { statSync } from "node:fs"
import { Store, type TaskState } from "./lib/store"
import { SessionTracker } from "./telemetry/session-tracker"
import { ToolTracker } from "./telemetry/tool-tracker"
import type { FilteringOptions } from "./lib/filtering/config"
import { resolveFilteringConfig } from "./lib/filtering/config"
import { filterToolOutput, sanitizeFilterMetadata } from "./lib/filtering/filter"
import { loadRawOutput, sweepExpired } from "./lib/filtering/raw-store"
import { openrelayRawOutputTool } from "./tools/raw-output"
import { canaryEnabled, logTransform, markResult } from "./lib/canary"
import { relayToast } from "./lib/announce"
import type { ContextOptions } from "./lib/context/config"
import { resolveContextConfig } from "./lib/context/config"
import { ContextEngine } from "./lib/context"
import { captureBenchmarkPacket } from "./lib/context/capture"
import type { ControllerOptions } from "./lib/controller/config"
import { resolveControllerConfig } from "./lib/controller/config"
import { resolveModels, type ModelRef, type ProviderSummary } from "./lib/controller/models"
import { route, type RouteTaskState } from "./lib/controller/route"
import { shouldEscalate } from "./lib/controller/escalate"
import { isHighRisk } from "./lib/controller/checkpoint"
import { tier } from "./lib/classify"
import type { MemoryOptions } from "./lib/memory/config"
import { resolveMemoryConfig } from "./lib/memory/config"
import type { HandoffOptions } from "./lib/handoff/config"
import { resolveHandoffConfig } from "./lib/handoff/config"
import { handoffContinueTool, handoffPrepareTool } from "./tools/handoff"
import { continueWithHandoff, memoryForSession, prepareHandoff, type HandoffClient } from "./lib/handoff/session"
import { fnv1a } from "./lib/ids"

export type TokenEfficientOptions = {
  telemetry?: {
    enabled?: boolean
    dir?: string
  }
  filtering?: FilteringOptions
  context?: ContextOptions
  controller?: ControllerOptions
  memory?: MemoryOptions
  handoff?: HandoffOptions
  runtime?: { channel?: string; buildID?: string }
}

function extractText(parts: unknown): string {
  if (!Array.isArray(parts)) return ""
  const out: string[] = []
  for (const p of parts) {
    if (p && typeof p === "object" && (p as { type?: unknown }).type === "text") {
      const text = (p as { text?: unknown }).text
      if (typeof text === "string") out.push(text)
    }
  }
  return out.join("\n")
}

function taskView(task: TaskState | undefined): RouteTaskState | undefined {
  if (!task) return undefined
  return { attempts: task.attempts, editTestCycles: task.editTestCycles, verifications: task.verifications }
}

function buildBlocker(task: TaskState): string {
  const failed = task.verifications
    .filter((v) => v.verdict === "fail")
    .map((v) => v.cmd)
    .slice(-3)
  const edited = task.filesEdited.slice(-10)
  const lines = [
    "[OpenRelay escalation] Workhorse model is stuck after repeated failed verifications.",
    failed.length ? `Recent failed verification commands: ${failed.join(" ; ")}` : "No failed verification commands recorded.",
    edited.length ? `Files edited so far: ${edited.join(", ")}` : "No file edits recorded.",
    "Diagnose the remaining failures and fix them, then verify with the project's test/lint/typecheck command before finishing.",
  ]
  return lines.join("\n")
}

const plugin: Plugin = async (input, options) => {
  const opts = (options ?? {}) as TokenEfficientOptions
  if (opts.telemetry?.enabled === false) return {}

  const store = new Store(input.worktree, input.directory, opts.telemetry?.dir, opts.runtime)
  const sessions = new SessionTracker(store)
  const tools = new ToolTracker(store, sessions)
  const filtering = resolveFilteringConfig(opts.filtering, process.env.OPENRELAY_FILTERING)
  const canary = canaryEnabled()
  const rawDir = path.join(store.root, "raw")
  try {
    sweepExpired({ dir: rawDir, ttlMs: filtering.ttlMs })
    store.event("plugin.loaded", { filtering: filtering.enabled, previewSafe: filtering.previewSafe, rawDir })
  } catch {}

  const rawOutputTool = openrelayRawOutputTool({
    load: ({ sessionID, ref }) => loadRawOutput({ sessionID, ref, dir: rawDir, ttlMs: filtering.ttlMs }),
    onRecovered: (info) => {
      try {
        store.event(
          "tool.raw_recovered",
          { ref: info.ref, mode: info.mode, bytesReturned: info.bytesReturned },
          info.sessionID,
        )
      } catch {}
      try {
        sessions.recordRecovered(info.sessionID)
      } catch {}
    },
  })

  const controller = resolveControllerConfig(opts.controller, process.env)
  const contextEngine = new ContextEngine(resolveContextConfig(opts.context, process.env.OPENRELAY_CONTEXT), (type, data, sessionID) => {
    try {
      const taskID = sessionID ? sessions.taskID(sessionID) : undefined
      store.event(type, data, sessionID, taskID)
    } catch {}
  })
  const memory = resolveMemoryConfig(opts.memory, process.env.OPENRELAY_MEMORY)
  const handoff = resolveHandoffConfig(opts.handoff, process.env.OPENRELAY_HANDOFF)
  const memoryEvent = (type: string, data: Record<string, unknown>, sessionID?: string) => {
    try {
      store.event(type, { ...data, workflowID: sessionID ? sessions.taskState(sessionID)?.workflowID : undefined }, sessionID, sessionID ? sessions.taskID(sessionID) : undefined)
    } catch {}
  }
  // Memory assembly is cached per (session, packet-signature, index mtime) so the
  // per-step system transform stays inside the local preparation budget.
  const memoryCache = new Map<string, { sig: string; text?: string; bytes: number }>()
  const memorySig = (sessionID: string, packet: string | undefined, indexMtimeMs: number): string =>
    fnv1a(`${sessionID}\0${packet ?? ""}\0${contextEngine.pathsFor(sessionID).join(",")}\0${indexMtimeMs}`)
  const memoryTextFor = (sessionID: string | undefined, packet: string | undefined): { text?: string; bytes: number } => {
    if (!sessionID) return { bytes: 0 }
    try {
      const indexPath = path.join(store.worktree, ".codebase", "memory.json")
      let indexMtimeMs = 0
      try {
        indexMtimeMs = statSync(indexPath).mtimeMs
      } catch {
        return { bytes: 0 }
      }
      const sig = memorySig(sessionID, packet, indexMtimeMs)
      const cached = memoryCache.get(sessionID)
      if (cached && cached.sig === sig) return { text: cached.text, bytes: cached.bytes }
      const r = memoryForSession(store.worktree, { sessionID, requestPaths: contextEngine.pathsFor(sessionID), v3Packet: packet }, (type, data) => memoryEvent(type, data, sessionID))
      if (memoryCache.size > 200) memoryCache.clear()
      memoryCache.set(sessionID, { sig, text: r.text, bytes: r.bytes })
      return { text: r.text, bytes: r.bytes }
    } catch {
      return { bytes: 0 }
    }
  }
  const captureContext = opts.runtime?.channel === "benchmark" && process.env.OPENRELAY_CAPTURE_CONTEXT === "on"
  const capturedPackets = new Set<string>()
  const escalatedSessions = new Set<string>()
  let models: { premium?: ModelRef; workhorse?: ModelRef } = {}
  let modelsPromise: Promise<typeof models> | undefined
  const loadModels = async (): Promise<typeof models> => {
    if (modelsPromise) return modelsPromise
    modelsPromise = (async () => {
      try {
        const result = await Promise.race([
          input.client.provider.list(),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
        ])
        if (result) {
          const data = result.data as { all?: ProviderSummary[] } | undefined
          models = resolveModels(data?.all ?? [], controller)
        }
      } catch {}
      return models
    })()
    return modelsPromise
  }

  const maybeEscalate = async (sessionID: string | undefined): Promise<void> => {
    if (!controller.escalateEnabled || !sessionID) return
    if (escalatedSessions.has(sessionID)) return
    const task = sessions.taskState(sessionID)
    if (!task) return
    const { escalate, failedVerifications, cycles, reason } = shouldEscalate(taskView(task), controller.maxCycles)
    if (!escalate) return
    const available = await loadModels()
    if (!available.premium) return
    escalatedSessions.add(sessionID)
    try {
      await input.client.session.promptAsync({
        path: { id: sessionID },
        body: { model: available.premium, parts: [{ type: "text", text: buildBlocker(task) }] },
      })
      store.event(
        "controller.escalated",
        { cycles, failedVerifications, reason, model: `${available.premium.providerID}/${available.premium.modelID}` },
        sessionID,
        task.taskID,
      )
    } catch {}
  }

  let announced = false
  let announceTimer: ReturnType<typeof setTimeout> | undefined
  const announceRelay = () => {
    if (announced) return
    announced = true
    announceTimer = setTimeout(() => {
      try {
        input.client.tui
          .showToast({
            query: { directory: input.directory ?? input.worktree },
            body: relayToast(opts.runtime, filtering),
          })
          .catch(() => {})
      } catch {}
    }, 1500)
  }

  const handoffClient = input.client as unknown as HandoffClient
  const resolveModelArg = (modelArg?: string): { providerID: string; modelID: string } | undefined => {
    if (modelArg && modelArg.includes("/")) {
      const [providerID, modelID] = modelArg.split("/", 2)
      if (providerID && modelID) return { providerID, modelID }
    }
    return undefined
  }
  const handoffTools = handoff.enabled
    ? {
        openrelay_handoff_prepare: handoffPrepareTool({
          worktree: store.worktree,
          prepare: (worktree, input) =>
            prepareHandoff(worktree, { ...input, telemetryTask: sessions.taskState(input.sessionID) }, (type, data) => memoryEvent(type, data, input.sessionID)),
        }),
        openrelay_handoff_continue: handoffContinueTool({
          worktree: store.worktree,
          client: handoffClient,
          continueWith: (client, worktree, input) =>
            continueWithHandoff(client, worktree, input, (type, data) => memoryEvent(type, data, input.sessionID)),
          resolveModel: resolveModelArg,
        }),
      }
    : {}

  return {
    dispose: async () => {
      try {
        clearTimeout(announceTimer)
      } catch {}
      try {
        sessions.flush()
      } catch {}
    },

    tool: { openrelay_raw_output: rawOutputTool, ...handoffTools },

    "chat.message": async (evt, output) => {
      try {
        sessions.userMessage(evt.sessionID, evt.agent, evt.model)
      } catch {}
      try {
        const text = extractText(output?.parts)
        contextEngine.prepare(evt.sessionID, store.worktree, text)
        const decision = route(text, taskView(sessions.taskState(evt.sessionID)), controller.route)
        if (!decision.target) return
        const available = await loadModels()
        const current = evt.model
        const currentTier = current ? tier(current.providerID, current.modelID) : "other"
        const ref =
          (decision.target === "premium" && currentTier === "premium") ||
          (decision.target === "workhorse" && currentTier === "workhorse")
            ? current
            : decision.target === "premium"
              ? available.premium
              : available.workhorse
        if (!ref) return
        output.message.model = { providerID: ref.providerID, modelID: ref.modelID }
        store.event(
          "controller.routed",
          {
            target: decision.target,
            reason: decision.reason,
            override: decision.override,
            uncertain: decision.uncertain,
            model: `${ref.providerID}/${ref.modelID}`,
          },
          evt.sessionID,
          sessions.taskID(evt.sessionID),
        )
      } catch {}
    },

    "chat.params": async (evt) => {
      try {
        sessions.setContext(evt.sessionID, evt.agent, { providerID: evt.model.providerID, modelID: evt.model.id })
        sessions.llmCall(evt.sessionID, evt.agent, evt.model, evt.provider?.info?.id)
      } catch {}
    },

    "tool.execute.before": async (evt, output) => {
      try {
        tools.before(evt.callID, evt.sessionID, evt.tool, output?.args)
      } catch {}
    },

    "permission.ask": async (evt) => {
      try {
        if (!controller.checkpointEnabled) return
        if (isHighRisk({ type: evt.type, pattern: evt.pattern, title: evt.title }, controller.checkpointPatterns)) {
          store.event("controller.checkpoint", { type: evt.type, pattern: evt.pattern, title: evt.title }, evt.sessionID)
        }
      } catch {}
    },

    "tool.execute.after": async (evt, output) => {
      try {
        if (canary && evt.tool === "bash") markResult(output)
      } catch {}
      try {
        if (filtering.enabled && evt.tool === "bash" && output && typeof output.output === "string") {
          const args = (evt.args ?? {}) as Record<string, unknown>
          const command = typeof args.command === "string" ? args.command : typeof args.cmd === "string" ? args.cmd : undefined
          if (command !== undefined) {
            const metadata =
              output.metadata && typeof output.metadata === "object"
                ? (output.metadata as Record<string, unknown>)
                : undefined
            const outcome = await filterToolOutput({
              tool: evt.tool,
              command,
              output: output.output,
              sessionID: evt.sessionID,
              config: filtering,
              store,
              rawDir,
              metadata,
            })
            if (outcome) {
              output.output = outcome.filtered
              output.metadata = sanitizeFilterMetadata(output.metadata)
              try {
                sessions.recordFiltered(evt.sessionID, outcome.bytesBefore, outcome.bytesAfter)
              } catch {}
            }
          }
        }
      } catch {}
      try {
        tools.after(evt.callID, output)
      } catch {}
    },

    event: async ({ event }) => {
      try {
        announceRelay()
      } catch {}
      try {
        const e = event as { type: string; properties?: Record<string, any> }
        switch (e.type) {
          case "message.updated":
            sessions.messageUpdated(e.properties?.info)
            break
          case "session.idle": {
            const sid = e.properties?.sessionID
            sessions.idle(sid)
            try {
              await maybeEscalate(sid)
            } catch {}
            break
          }
          case "session.error":
            sessions.sessionError(e.properties?.sessionID, e.properties?.error)
            break
        }
      } catch {}
    },

    ...(canary
      ? {
          "experimental.chat.messages.transform": async (_input: unknown, out: { messages: unknown }) => {
            try {
              logTransform(out?.messages)
            } catch {}
          },
        }
      : {}),

    ...(contextEngine.enabled || memory.enabled
      ? {
          "experimental.chat.system.transform": async (
            input: { sessionID?: string },
            out: { system: string[] },
          ) => {
            try {
              const packet = contextEngine.packetFor(input?.sessionID)
              if (packet && Array.isArray(out?.system)) {
                out.system.push(packet)
                if (captureContext && input.sessionID) {
                  const capture = captureBenchmarkPacket(store, input.sessionID, packet)
                  if (capture) {
                    const key = `${input.sessionID}:${capture.hash}`
                    if (!capturedPackets.has(key)) {
                      capturedPackets.add(key)
                      store.event("context.packet_captured", capture, input.sessionID, sessions.taskID(input.sessionID))
                    }
                  } else {
                    store.event("context.packet_capture_failed", {}, input.sessionID, sessions.taskID(input.sessionID))
                  }
                }
              }
              // Stage 6 memory: eligible project notes ride the system prompt once per
              // request signature — never duplicated into a delivered handoff message.
              if (memory.enabled && Array.isArray(out?.system)) {
                const m = memoryTextFor(input?.sessionID, packet)
                if (m.text) out.system.push(m.text)
              }
            } catch {}
          },
        }
      : {}),
  }
}

export default plugin
