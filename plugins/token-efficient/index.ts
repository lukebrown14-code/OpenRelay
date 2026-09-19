import type { Plugin } from "@opencode-ai/plugin"
import { Store } from "./lib/store"
import { SessionTracker } from "./telemetry/session-tracker"
import { ToolTracker } from "./telemetry/tool-tracker"

export type TokenEfficientOptions = {
  telemetry?: {
    enabled?: boolean
    dir?: string
  }
}

const plugin: Plugin = async (input, options) => {
  const opts = (options ?? {}) as TokenEfficientOptions
  if (opts.telemetry?.enabled === false) return {}

  const store = new Store(input.worktree, input.directory, opts.telemetry?.dir)
  const sessions = new SessionTracker(store)
  const tools = new ToolTracker(store, sessions)

  return {
    dispose: async () => {
      try {
        sessions.flush()
      } catch {}
    },

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
  }
}

export default plugin
