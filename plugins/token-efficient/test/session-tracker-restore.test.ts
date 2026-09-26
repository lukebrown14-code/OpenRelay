import { describe, expect, test } from "bun:test"
import { tmpDir } from "./helpers"
import { readEvents } from "./helpers"
import { SessionTracker } from "../telemetry/session-tracker"
import { Store } from "../lib/store"

function assistantInfo(id: string, sessionID: string, tokens: number, completed = true) {
  return {
    id,
    sessionID,
    role: "assistant",
    modelID: "glm-5.3",
    providerID: "zai-coding-plan",
    tokens: { input: tokens, output: 10, reasoning: 0, cache: { read: 0, write: 0 } },
    time: completed ? { created: 1, completed: 2 } : {},
  }
}

describe("session tracker task identity recovery", () => {
  test("a continuing session restores its task record instead of minting a new one", () => {
    const root = tmpDir()
    const store1 = new Store("/repo/a", "/repo/a/work", root)
    const t1 = new SessionTracker(store1)
    t1.userMessage("ses_r1")
    t1.llmCall("ses_r1", "build", { providerID: "zai-coding-plan", id: "glm-5.3" }, "zai-coding-plan")
    t1.messageUpdated(assistantInfo("m1", "ses_r1", 100))
    const before = t1.taskState("ses_r1")!
    expect(before.taskID).toMatch(/^t-/)
    expect(before.workflowID).toMatch(/^wf-/)
    expect(before.llmCalls).toBe(1)
    expect(before.tokens.input).toBe(100)
    expect(before.processedMessages).toEqual(["m1"])

    // "restart": fresh tracker over the same persisted root
    const store2 = new Store("/repo/a", "/repo/a/work", root)
    const t2 = new SessionTracker(store2)
    t2.userMessage("ses_r1")
    t2.llmCall("ses_r1", "build", { providerID: "zai-coding-plan", id: "glm-5.3" }, "zai-coding-plan")
    t2.messageUpdated(assistantInfo("m1", "ses_r1", 100)) // redelivery across restart
    t2.messageUpdated(assistantInfo("m2", "ses_r1", 50))

    const after = t2.taskState("ses_r1")!
    expect(after.taskID).toBe(before.taskID) // same task record, not a duplicate
    expect(after.workflowID).toBe(before.workflowID)
    expect(after.llmCalls).toBe(2) // continued, not reset
    expect(after.tokens.input).toBe(150) // m1 usage NOT double-counted

    const events = readEvents(root)
    expect(events.some((e) => e.type === "task.restored" && e.task === before.taskID)).toBe(true)
    expect(events.filter((e) => e.type === "task.created" && e.session === "ses_r1")).toHaveLength(1)
  })

  test("legacy task records without new fields restore cleanly", () => {
    const root = tmpDir()
    const store1 = new Store("/repo/a", "/repo/a/work", root)
    const t1 = new SessionTracker(store1)
    t1.userMessage("ses_legacy")
    const state = t1.taskState("ses_legacy")!
    // simulate a pre-Stage-6 record: strip the new optional fields from disk
    const file = store1.taskPath(state.taskID)
    const fs = require("node:fs")
    const raw = JSON.parse(fs.readFileSync(file, "utf8"))
    delete raw.workflowID
    delete raw.processedMessages
    fs.writeFileSync(file, JSON.stringify(raw))

    const t2 = new SessionTracker(new Store("/repo/a", "/repo/a/work", root))
    t2.userMessage("ses_legacy")
    const restored = t2.taskState("ses_legacy")!
    expect(restored.taskID).toBe(state.taskID)
    expect(restored.workflowID).toBeUndefined()
  })

  test("sessions from other worktrees are not restored into this store", () => {
    const root = tmpDir()
    const s1 = new Store("/repo/a", "/repo/a/work", root)
    new SessionTracker(s1).userMessage("ses_other_wt")
    const s2 = new Store("/repo/b", "/repo/b/work", root)
    const t2 = new SessionTracker(s2)
    t2.userMessage("ses_other_wt")
    // different slug → no restore; a fresh task is minted for this worktree
    expect(t2.taskState("ses_other_wt")!.slug).toBe(s2.slug)
  })
})
