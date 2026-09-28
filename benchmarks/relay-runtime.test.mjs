import test from "node:test"
import assert from "node:assert/strict"
import { launchSpec } from "../scripts/relay-runtime.mjs"

const base = { channel: "benchmark", repo: process.cwd(), dataDir: "/tmp/openrelay-test-spec", cwd: process.cwd(), check: false }

test("stage 6 switches default off in every channel and pass through as plugin options", () => {
  for (const channel of ["benchmark", "development", "daily"]) {
    const spec = launchSpec({ ...base, channel, env: {} })
    assert.equal(spec.memory, "off")
    assert.equal(spec.handoff, "off")
    const inline = JSON.parse(spec.env.OPENCODE_CONFIG_CONTENT)
    const entry = inline.plugin[0]
    assert.equal(entry[1].memory.enabled, false)
    assert.equal(entry[1].handoff.enabled, false)
    assert.equal(spec.env.OPENRELAY_MEMORY, "off")
    assert.equal(spec.env.OPENRELAY_HANDOFF, "off")
  }
})

test("OPENRELAY_MEMORY / OPENRELAY_HANDOFF enable independently", () => {
  const spec = launchSpec({ ...base, env: { OPENRELAY_MEMORY: "on" } })
  const inline = JSON.parse(spec.env.OPENCODE_CONFIG_CONTENT)
  assert.equal(spec.memory, "on")
  assert.equal(spec.handoff, "off")
  assert.equal(inline.plugin[0][1].memory.enabled, true)
  assert.equal(inline.plugin[0][1].handoff.enabled, false)

  const spec2 = launchSpec({ ...base, env: { OPENRELAY_HANDOFF: "on" } })
  const inline2 = JSON.parse(spec2.env.OPENCODE_CONFIG_CONTENT)
  assert.equal(spec2.memory, "off")
  assert.equal(spec2.handoff, "on")
  assert.equal(inline2.plugin[0][1].memory.enabled, false)
  assert.equal(inline2.plugin[0][1].handoff.enabled, true)
})

test("invalid switch values are rejected", () => {
  assert.throws(() => launchSpec({ ...base, env: { OPENRELAY_MEMORY: "maybe" } }), /OPENRELAY_MEMORY must be on or off/)
  assert.throws(() => launchSpec({ ...base, env: { OPENRELAY_HANDOFF: "auto" } }), /OPENRELAY_HANDOFF must be on or off/)
})
