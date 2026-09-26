import { describe, expect, test } from "bun:test"
import {
  DEFAULT_CHECKPOINT_PATTERNS,
  resolveControllerConfig,
} from "../lib/controller/config"
import { modelKeyOf, resolveModels } from "../lib/controller/models"
import { detectOverride, route } from "../lib/controller/route"
import { shouldEscalate } from "../lib/controller/escalate"
import { isHighRisk } from "../lib/controller/checkpoint"
import type { ProviderSummary } from "../lib/controller/models"

describe("resolveControllerConfig", () => {
  test("defaults when no opts and empty env", () => {
    const cfg = resolveControllerConfig(null, {})
    expect(cfg.route).toBe("off")
    expect(cfg.escalateEnabled).toBe(false)
    expect(cfg.maxCycles).toBe(3)
    expect(cfg.checkpointEnabled).toBe(false)
    expect(cfg.checkpointPatterns).toEqual([...DEFAULT_CHECKPOINT_PATTERNS])
    expect(cfg.premiumModel).toBeUndefined()
    expect(cfg.workhorseModel).toBeUndefined()
  })

  test("env OPENRELAY_ROUTE selects auto, premium, glm", () => {
    expect(resolveControllerConfig(null, { OPENRELAY_ROUTE: "auto" }).route).toBe("auto")
    expect(resolveControllerConfig(null, { OPENRELAY_ROUTE: "premium" }).route).toBe("premium")
    expect(resolveControllerConfig(null, { OPENRELAY_ROUTE: "glm" }).route).toBe("glm")
  })

  test("invalid env route falls back to opts.route then off", () => {
    expect(resolveControllerConfig({ route: "premium" }, { OPENRELAY_ROUTE: "bogus" }).route).toBe("premium")
    expect(resolveControllerConfig({ route: "bogus" as never }, { OPENRELAY_ROUTE: "bogus" }).route).toBe("off")
    expect(resolveControllerConfig(null, { OPENRELAY_ROUTE: "bogus" }).route).toBe("off")
  })

  test("env OPENRELAY_ESCALATE on/off", () => {
    expect(resolveControllerConfig(null, { OPENRELAY_ESCALATE: "on" }).escalateEnabled).toBe(true)
    expect(resolveControllerConfig(null, { OPENRELAY_ESCALATE: "off" }).escalateEnabled).toBe(false)
  })

  test("opts.escalation.maxCycles respected and guarded", () => {
    expect(resolveControllerConfig({ escalation: { maxCycles: 5 } }, {}).maxCycles).toBe(5)
    expect(resolveControllerConfig({ escalation: { maxCycles: 0 } }, {}).maxCycles).toBe(3)
    expect(resolveControllerConfig({ escalation: { maxCycles: -1 } }, {}).maxCycles).toBe(3)
  })

  test("opts.checkpoint.enabled and custom patterns", () => {
    expect(resolveControllerConfig({ checkpoint: { enabled: true } }, {}).checkpointEnabled).toBe(true)
    const custom = ["migration", "sudo"]
    expect(resolveControllerConfig({ checkpoint: { patterns: custom } }, {}).checkpointPatterns).toEqual(custom)
    expect(resolveControllerConfig({ checkpoint: { patterns: [] } }, {}).checkpointPatterns).toEqual([
      ...DEFAULT_CHECKPOINT_PATTERNS,
    ])
  })
})

const openai: ProviderSummary = { id: "openai", models: { m: { id: "gpt-4o" } } }
const glm: ProviderSummary = { id: "zhipu", models: { m: { id: "glm-4-flash" } } }
const openrouter: ProviderSummary = { id: "openrouter", models: { m: { id: "llama-3" } } }

describe("resolveModels", () => {
  test("resolves premium and workhorse from enumerated providers", () => {
    const res = resolveModels([openai, glm, openrouter], {})
    expect(res.premium).toEqual({ providerID: "openai", modelID: "gpt-4o" })
    expect(res.workhorse).toEqual({ providerID: "zhipu", modelID: "glm-4-flash" })
  })

  test("undefined when no matching provider present", () => {
    expect(resolveModels([openrouter], {}).premium).toBeUndefined()
    expect(resolveModels([openai], {}).workhorse).toBeUndefined()
    expect(resolveModels([], {})).toEqual({ premium: undefined, workhorse: undefined })
  })

  test("premiumModel override wins; malformed override ignored", () => {
    const res = resolveModels([openai, glm], { premiumModel: "openai/gpt-foo" })
    expect(res.premium).toEqual({ providerID: "openai", modelID: "gpt-foo" })

    const fallback = resolveModels([openai, glm], { premiumModel: "no-slash" })
    expect(fallback.premium).toEqual({ providerID: "openai", modelID: "gpt-4o" })
  })

  test("modelKeyOf joins provider and model", () => {
    expect(modelKeyOf({ providerID: "a", modelID: "b" })).toBe("a/b")
  })
})

describe("route / detectOverride", () => {
  test("detectOverride recognizes slash keywords", () => {
    expect(detectOverride("/glm fix")).toBe("glm")
    expect(detectOverride("/chatgpt do this")).toBe("chatgpt")
    expect(detectOverride("/plan the thing")).toBe("plan")
    expect(detectOverride("/review the diff")).toBe("review")
    expect(detectOverride("/deep investigate")).toBe("deep")
    expect(detectOverride("/auto go")).toBe("auto")
    expect(detectOverride("just a plain message")).toBeUndefined()
  })

  test("explicit premium overrides", () => {
    for (const kw of ["chatgpt", "plan", "review", "deep"]) {
      const d = route(`/${kw} do it`, undefined, "auto")
      expect(d.target).toBe("premium")
      expect(d.override).toBe(kw)
      expect(d.reason).toBe(`override:/${kw}`)
    }
  })

  test("explicit workhorse overrides", () => {
    for (const kw of ["glm", "auto"]) {
      const d = route(`/${kw} do it`, undefined, "premium")
      expect(d.target).toBe("workhorse")
      expect(d.override).toBe(kw)
    }
  })

  test("forced modes", () => {
    expect(route("plain text", undefined, "premium").target).toBe("premium")
    expect(route("plain text", undefined, "glm").target).toBe("workhorse")
    const off = route("plain text", undefined, "off")
    expect(off.target).toBeNull()
    expect(off.reason).toBe("routing:off")
  })

  test("auto mode classifies by markers", () => {
    expect(route("refactor the auth layer", undefined, "auto").target).toBe("premium")
    expect(route("fix the typo in the readme", undefined, "auto").target).toBe("workhorse")
  })

  test("uncertain flag for mixed signals", () => {
    const d = route("refactor the auth layer and fix a typo", undefined, "auto")
    expect(d.uncertain).toBe(true)
    expect(d.target).toBe("premium")
  })
})

describe("shouldEscalate", () => {
  test("no escalation for undefined task or too few failures", () => {
    expect(shouldEscalate(undefined, 3).escalate).toBe(false)
    expect(
      shouldEscalate(
        { attempts: 1, editTestCycles: 1, verifications: [{ verdict: "fail" }, { verdict: "pass" }] },
        3,
      ).escalate,
    ).toBe(false)
  })

  test("escalates at maxCycles failures, ignoring passes", () => {
    const task = {
      attempts: 3,
      editTestCycles: 3,
      verifications: [
        { verdict: "fail" },
        { verdict: "pass" },
        { verdict: "fail" },
        { verdict: "fail" },
      ],
    }
    const d = shouldEscalate(task, 3)
    expect(d.escalate).toBe(true)
    expect(d.failedVerifications).toBe(3)
    expect(d.cycles).toBe(3)
    expect(d.reason).toBe("failed verifications 3 >= 3")
  })
})

describe("isHighRisk", () => {
  test("matches against type/title/pattern", () => {
    expect(isHighRisk({ type: "bash", title: "run migration", pattern: "..." }, ["migration"])).toBe(true)
  })

  test("does not match harmless input", () => {
    expect(isHighRisk({ type: "edit", title: "add a comment", pattern: "// todo" }, ["migration"])).toBe(false)
  })

  test("pattern can be a string or an array of strings", () => {
    expect(isHighRisk({ type: "bash", title: "deploy", pattern: "npm run build" }, ["deploy"])).toBe(true)
    expect(
      isHighRisk({ type: "bash", title: "seed", pattern: ["drop table users", "SELECT 1"] }, ["drop table"]),
    ).toBe(true)
  })

  test("matching is case-insensitive", () => {
    expect(isHighRisk({ type: "Bash", title: "Run MIGRATION", pattern: "" }, ["migration"])).toBe(true)
  })
})
