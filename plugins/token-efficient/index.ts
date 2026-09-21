import type { Plugin } from "@opencode-ai/plugin"
import { Store } from "./lib/store"
import { SessionTracker } from "./telemetry/session-tracker"
import { ToolTracker } from "./telemetry/tool-tracker"
import type { FilteringOptions } from "./lib/filtering/config"
import { resolveFilteringConfig } from "./lib/filtering/config"
import { filterToolOutput, sanitizeFilterMetadata } from "./lib/filtering/filter"
import { loadRawOutput, sweepExpired } from "./lib/filtering/raw-store"
import { openrelayRawOutputTool } from "./tools/raw-output"
import { canaryEnabled, logTransform, markResult } from "./lib/canary"

export type TokenEfficientOptions = {
  telemetry?: {
    enabled?: boolean
    dir?: string
  }
  filtering?: FilteringOptions
}

const plugin: Plugin = async (input, options) => {
  const opts = (options ?? {}) as TokenEfficientOptions
  if (opts.telemetry?.enabled === false) return {}

  const store = new Store(input.worktree, input.directory, opts.telemetry?.dir)
  const sessions = new SessionTracker(store)
  const tools = new ToolTracker(store, sessions)
  const filtering = resolveFilteringConfig(opts.filtering, process.env.OPENRELAY_FILTERING)
  const canary = canaryEnabled()
  try {
    sweepExpired({ ttlMs: filtering.ttlMs })
  } catch {}

  const rawOutputTool = openrelayRawOutputTool({
    load: ({ sessionID, ref }) => loadRawOutput({ sessionID, ref }),
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

  return {
    dispose: async () => {
      try {
        sessions.flush()
      } catch {}
    },

    tool: { openrelay_raw_output: rawOutputTool },

    "chat.message": async (evt) => {
      try {
        sessions.userMessage(evt.sessionID, evt.agent, evt.model)
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
        const e = event as { type: string; properties?: Record<string, any> }
        switch (e.type) {
          case "message.updated":
            sessions.messageUpdated(e.properties?.info)
            break
          case "session.idle":
            sessions.idle(e.properties?.sessionID)
            break
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
  }
}

export default plugin
