import { tool } from "@opencode-ai/plugin"
import { continueWithHandoff, prepareHandoff, type HandoffClient } from "../lib/handoff/session"

const PREPARE_DESCRIPTION =
  "Explicitly prepare a structured handoff snapshot for this task (stage 6, opt-in). " +
  "Use when the user asks to hand off work, save task state, or continue in another session. " +
  "Writes an immutable snapshot under .tasks/ and links it to the task record; no session is created. " +
  "Objective and acceptance criteria are mandatory; anything not supplied is recorded as unknown rather than guessed."

const CONTINUE_DESCRIPTION =
  "Explicitly continue a prepared task in a fresh session (stage 6, opt-in). " +
  "Creates a new receiver session, delivers the objective + handoff + eligible project memory once, links the receiver, and leaves the source session untouched. " +
  "Requires a prepared handoff (openrelay_handoff_prepare). Falls back to native continuation if anything is missing or stale."

export const handoffPrepareTool = (deps: {
  worktree: string
  prepare: typeof prepareHandoff
}) =>
  tool({
    description: PREPARE_DESCRIPTION,
    args: {
      objective: tool.schema.string().describe("Task objective, taken from the user's request or accepted plan"),
      constraints: tool.schema.array(tool.schema.string()).optional().describe("Mandatory constraints (provenance recorded as user-approved when from the user, else unknown)"),
      acceptanceCriteria: tool.schema.array(tool.schema.string()).optional().describe("Acceptance criteria that must hold before the task is done"),
      decisions: tool.schema.array(tool.schema.string()).optional().describe("Accepted decisions worth carrying forward"),
      currentWork: tool.schema.string().optional().describe("What is currently in progress"),
      nextSteps: tool.schema.array(tool.schema.string()).optional().describe("Concrete next steps"),
      unresolvedQuestions: tool.schema.array(tool.schema.string()).optional().describe("Open questions"),
      relevantFiles: tool.schema.array(tool.schema.string()).optional().describe("Repo-relative paths that matter (digests are computed automatically)"),
    },
    execute: async (args, ctx) => {
      try {
        const r = deps.prepare(deps.worktree, {
          sessionID: ctx.sessionID,
          direction: "workhorse->workhorse",
          objective: String(args.objective ?? ""),
          constraints: args.constraints,
          acceptanceCriteria: args.acceptanceCriteria,
          decisions: args.decisions,
          currentWork: args.currentWork,
          nextSteps: args.nextSteps,
          unresolvedQuestions: args.unresolvedQuestions,
          relevantFiles: args.relevantFiles,
        })
        if (!r.ok) {
          return `Handoff not written: ${r.reason}${r.detail ? ` (${r.detail})` : ""}. ${r.fallbackHint ?? ""}`
        }
        return {
          title: `handoff ${r.handoffID} prepared`,
          output: `Handoff ${r.handoffID} written for task ${r.taskID} (workflow ${r.workflowID}), ${r.bytes} bytes rendered. Continue later with openrelay_handoff_continue.`,
          metadata: { handoffID: r.handoffID, taskID: r.taskID, workflowID: r.workflowID, bytes: r.bytes },
        }
      } catch {
        return "Failed to prepare handoff."
      }
    },
  })

export const handoffContinueTool = (deps: {
  worktree: string
  client: HandoffClient
  continueWith: typeof continueWithHandoff
  resolveModel?: (modelArg?: string) => { providerID: string; modelID: string } | undefined
}) =>
  tool({
    description: CONTINUE_DESCRIPTION,
    args: {
      handoffID: tool.schema.string().optional().describe("Specific handoff to deliver; defaults to the latest prepared one"),
      model: tool.schema.string().optional().describe('Receiver model as "provider/model" (visible target); defaults to the resolved workhorse'),
      agent: tool.schema.string().optional().describe("Receiver agent (default: build)"),
    },
    execute: async (args, ctx) => {
      try {
        const model = deps.resolveModel?.(args.model ? String(args.model) : undefined)
        const r = await deps.continueWith(deps.client, deps.worktree, {
          sessionID: ctx.sessionID,
          handoffID: args.handoffID ? String(args.handoffID) : undefined,
          model,
          agent: args.agent ? String(args.agent) : undefined,
        })
        if (!r.ok) {
          return `Handoff not delivered: ${r.reason}${r.detail ? ` (${r.detail})` : ""}. ${r.fallbackHint}`
        }
        return {
          title: `handoff ${r.handoffID} delivered`,
          output: `Handoff ${r.handoffID} delivered to fresh session ${r.receiverSessionID}${r.model ? ` (model ${r.model.providerID}/${r.model.modelID})` : ""}. Source session retained; the receiver is linked in the task record.`,
          metadata: { handoffID: r.handoffID, receiverSessionID: r.receiverSessionID, model: r.model, bytes: r.bytes },
        }
      } catch {
        return "Failed to continue with handoff; native continuation remains available."
      }
    },
  })
