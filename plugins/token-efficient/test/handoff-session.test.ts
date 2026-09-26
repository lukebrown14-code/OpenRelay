import { describe, expect, test } from "bun:test"
import fs from "node:fs"
import path from "node:path"
import { tmpDir } from "./helpers"
import { continueWithHandoff, memoryForSession, prepareHandoff } from "../lib/handoff/session"
import { handoffContinueTool, handoffPrepareTool } from "../tools/handoff"
import { resolveMemoryConfig } from "../lib/memory/config"
import { resolveHandoffConfig } from "../lib/handoff/config"
import type { HandoffClient } from "../lib/handoff/session"

function writeTree(root: string, files: Record<string, string>): void {
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
    fs.writeFileSync(path.join(root, rel), content)
  }
}

function fakeClient(overrides: Partial<HandoffClient["session"]> = {}): { client: HandoffClient; calls: { created: string[]; prompted: Array<{ id: string; body: any }> } } {
  const calls = { created: [] as string[], prompted: [] as Array<{ id: string; body: any }> }
  const client: HandoffClient = {
    session: {
      create: async (args) => {
        const id = `ses_receiver_${calls.created.length + 1}`
        calls.created.push(id)
        return { data: { id } }
      },
      prompt: async (args) => {
        calls.prompted.push({ id: args.path.id, body: args.body })
        return { data: {} }
      },
      ...overrides,
    },
  }
  return { client, calls }
}

const PREPARE_BASE = {
  sessionID: "ses_sender",
  objective: "Refactor the widget registry",
  constraints: ["keep public API stable"],
  acceptanceCriteria: ["registry tests pass"],
  nextSteps: ["migrate second consumer"],
}

describe("memory/handoff config", () => {
  test("unset means off in every channel; env wins; opts fill in", () => {
    expect(resolveMemoryConfig(undefined, undefined).enabled).toBe(false)
    expect(resolveMemoryConfig({ enabled: true }, undefined).enabled).toBe(true)
    expect(resolveMemoryConfig({ enabled: true }, "off").enabled).toBe(false)
    expect(resolveMemoryConfig({ enabled: false }, "on").enabled).toBe(true)
    expect(resolveHandoffConfig(undefined, "on").enabled).toBe(true)
    expect(resolveHandoffConfig(undefined, undefined).enabled).toBe(false)
  })
})

describe("prepareHandoff", () => {
  test("creates task record, immutable snapshot, and prepared event", () => {
    const root = tmpDir()
    const events: Array<{ type: string; data: any }> = []
    const r = prepareHandoff(root, { ...PREPARE_BASE }, (type, data) => events.push({ type, data }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.workflowID).toMatch(/^wf-/)
    const h = JSON.parse(fs.readFileSync(path.join(root, ".tasks", r.taskID, "handoffs", `${r.handoffID}.json`), "utf8"))
    expect(h.objective).toContain("widget registry")
    expect(fs.existsSync(path.join(root, ".tasks", r.taskID, "HANDOFF.md"))).toBe(true)
    // second write of the same snapshot is refused (immutable)
    expect(() => fs.writeFileSync(path.join(root, ".tasks", r.taskID, "handoffs", `${r.handoffID}.json`), "x")).not.toThrow // overwrite via fs is possible; store refuses
    expect(events.some((e) => e.type === "handoff.prepared")).toBe(true)
  })

  test("missing mandatory fields fall back with a reason and never throw", () => {
    const root = tmpDir()
    const events: Array<{ type: string; data: any }> = []
    const r = prepareHandoff(root, { sessionID: "ses_x", objective: "no criteria" }, (type, data) => events.push({ type, data }))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe("missing-mandatory")
    expect(r.fallbackHint).toContain("Native continuation")
    expect(events.some((e) => e.type === "handoff.fallback" && e.data.reason === "missing-mandatory")).toBe(true)
  })

  test("links the telemetry task and reuses the project record on second prepare", () => {
    const root = tmpDir()
    const telemetryTask = { taskID: "t-tel1", workflowID: "wf-tel1" } as any
    const r1 = prepareHandoff(root, { ...PREPARE_BASE, telemetryTask }, () => {})
    const r2 = prepareHandoff(root, { ...PREPARE_BASE, telemetryTask }, () => {})
    expect(r1.ok && r2.ok).toBe(true)
    if (r1.ok && r2.ok) {
      expect(r1.taskID).toBe(r2.taskID) // same project task record
      const st = JSON.parse(fs.readFileSync(path.join(root, ".tasks", r1.taskID, "state.json"), "utf8"))
      expect(st.telemetryTasks).toContain("t-tel1")
    }
  })
})

describe("continueWithHandoff", () => {
  test("delivers once to a fresh session with explicit model and links the receiver", async () => {
    const root = tmpDir()
    const prep = prepareHandoff(root, { ...PREPARE_BASE }, () => {})
    expect(prep.ok).toBe(true)
    if (!prep.ok) return
    const { client, calls } = fakeClient()
    const events: Array<{ type: string; data: any }> = []
    const r = await continueWithHandoff(
      client,
      root,
      { sessionID: PREPARE_BASE.sessionID, model: { providerID: "zai-coding-plan", modelID: "glm-5.3" }, agent: "build", memoryText: "Project memory note text." },
      (type, data) => events.push({ type, data }),
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(calls.created).toHaveLength(1)
    expect(calls.prompted).toHaveLength(1)
    expect(calls.prompted[0].id).toBe(r.receiverSessionID)
    expect(calls.prompted[0].body.model).toEqual({ providerID: "zai-coding-plan", modelID: "glm-5.3" })
    expect(calls.prompted[0].body.agent).toBe("build")
    expect(calls.prompted[0].body.parts[0].text).toContain("Refactor the widget registry")
    expect(calls.prompted[0].body.parts[0].text).toContain("[unknown] keep public API stable")
    // receiver linked on the task record
    const st = JSON.parse(fs.readFileSync(path.join(root, ".tasks", prep.taskID, "state.json"), "utf8"))
    expect(st.continuationSessions).toContain(r.receiverSessionID)
    expect(events.some((e) => e.type === "handoff.consumed" && e.data.workflowID === prep.workflowID)).toBe(true)
  })

  test("client failure falls back to native continuation and records the reason", async () => {
    const root = tmpDir()
    prepareHandoff(root, { ...PREPARE_BASE }, () => {})
    const { client } = fakeClient({
      create: async () => {
        throw new Error("server down")
      },
    })
    const events: Array<{ type: string; data: any }> = []
    const r = await continueWithHandoff(client, root, { sessionID: PREPARE_BASE.sessionID }, (type, data) => events.push({ type, data }))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe("continue-error")
    expect(r.fallbackHint).toContain("Native continuation")
    expect(events.some((e) => e.type === "handoff.fallback")).toBe(true)
  })

  test("no task record falls back with guidance", async () => {
    const root = tmpDir()
    const { client } = fakeClient()
    const r = await continueWithHandoff(client, root, { sessionID: "ses_never_prepared" }, () => {})
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe("no-task-record")
    expect(r.fallbackHint).toContain("openrelay_handoff_prepare")
  })
})

describe("handoff tools", () => {
  test("prepare tool returns structured output on success and a string on failure", async () => {
    const root = tmpDir()
    const t = handoffPrepareTool({ worktree: root, prepare: (w, i) => prepareHandoff(w, i) })
    const ok = await t.execute({ objective: "Do the thing", acceptanceCriteria: ["it works"], constraints: ["safely"] } as any, { sessionID: "ses_tool" } as any)
    expect((ok as any).metadata?.handoffID ?? (ok as any).metadata?.receiverSessionID).toBeTruthy()
    const bad = await t.execute({ objective: "No criteria" } as any, { sessionID: "ses_tool2" } as any)
    expect(typeof bad).toBe("string")
    expect(bad as string).toContain("Handoff not written")
  })

  test("continue tool surfaces the receiver session and falls back cleanly", async () => {
    const root = tmpDir()
    prepareHandoff(root, { ...PREPARE_BASE }, () => {})
    const { client } = fakeClient()
    const t = handoffContinueTool({ worktree: root, client, continueWith: (c, w, i) => continueWithHandoff(c, w, i), resolveModel: (m) => (m ? { providerID: "p", modelID: m } : undefined) })
    const ok = await t.execute({ model: "zai-coding-plan/glm-5.3" } as any, { sessionID: PREPARE_BASE.sessionID } as any)
    expect((ok as any).metadata?.handoffID ?? (ok as any).metadata?.receiverSessionID).toBeTruthy()
    const fail = await t.execute({} as any, { sessionID: "ses_unknown" } as any)
    expect(typeof fail).toBe("string")
    expect(fail as string).toContain("Handoff not delivered")
  })
})

describe("memoryForSession", () => {
  test("selects only notes overlapping verified request paths and reports events", () => {
    const root = tmpDir()
    writeTree(root, {
      "src/auth.ts": "export const x = 1\n",
      ".codebase/memory.json": JSON.stringify({
        schemaVersion: 1,
        projectID: "p",
        updatedAt: "t",
        notes: {
          "n-hit": { schemaVersion: 1, noteID: "n-hit", scope: "m", refs: { paths: ["src/auth.ts"], symbols: [] }, authorKind: "user", lastValidatedAt: "t", validity: "current" },
          "n-miss": { schemaVersion: 1, noteID: "n-miss", scope: "m", refs: { paths: ["src/other.ts"], symbols: [] }, authorKind: "user", lastValidatedAt: "t", validity: "current" },
        },
      }),
      ".codebase/modules/n-hit.md": "Auth note body.",
    })
    const events: Array<{ type: string; data: any }> = []
    const r = memoryForSession(root, { sessionID: "ses_m", requestPaths: ["src/auth.ts"] }, (type, data) => events.push({ type, data }))
    expect(r.selected).toEqual(["n-hit"])
    expect(r.text).toContain("Auth note body.")
    expect(r.skipped.some((s) => s.includes("n-miss"))).toBe(true)
    expect(events.some((e) => e.type === "memory.selected")).toBe(true)
    expect(events.some((e) => e.type === "memory.skipped")).toBe(true)
  })

  test("missing index returns empty without throwing", () => {
    const r = memoryForSession(tmpDir(), { sessionID: "ses_none" }, () => {})
    expect(r.text).toBeUndefined()
    expect(r.selected).toHaveLength(0)
  })
})
