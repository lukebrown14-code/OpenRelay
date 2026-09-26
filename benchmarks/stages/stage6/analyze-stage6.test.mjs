import test from "node:test"
import assert from "node:assert/strict"
import { analyze } from "./analyze-stage6.mjs"

const run = (label, arm, sessionID, durationMs = 1000) => ({
  label, fixture: "22-plan-config-compat", arm, sessionID, durationMs,
  verifyPass: true, opencodeExitCode: 0,
})
const telemetry = (entries) => new Map(entries.map(([label, id, tokens, opts = {}]) => [`${label}|${id}`, {
  calls: opts.calls ?? 1, duplicate: opts.duplicate ?? false,
  completions: new Map([["m1", { usageAvailable: true, tokens: { input: tokens, cacheRead: opts.cacheRead ?? 0 } }]]),
  packetBytes: opts.packetBytes ?? 0, memoryNotes: opts.memoryNotes ?? 0,
}]))

test("A/A controls stay separate from main A, and one-run B stays visibly unpaired", () => {
  const runs = [run("stage6e", "A", "a1"), run("stage6e", "A", "a2", 3000),
    run("stage6e-aa", "A", "aa", 5000), run("stage6e", "B", "b", 4000)]
  const t = telemetry([["stage6e", "a1", 100], ["stage6e", "a2", 100],
    ["stage6e-aa", "aa", 1000], ["stage6e", "b", 120, { packetBytes: 20 }]])
  const a = analyze(runs, t)
  const c = a.comparisons.find(x => x.comparison === "B/A")
  assert.equal(c.a.tokens, 100)
  assert.equal(c.b.tokens, 120)
  assert.ok(Math.abs(c.tokenChange - 20) < 1e-9)
  assert.equal(c.a.medianSec, 2)
  assert.equal(c.timeChange, 100)
  assert.deepEqual([c.a.n, c.b.n], [2, 1])
  assert.equal(a.stats(a.cell("22-plan-config-compat", "A", "stage6e-aa")).tokens, 1000)
  assert.equal(c.b.packetBytes, 20)
})

test("missing or duplicate coding usage invalidates a cell instead of becoming zero", () => {
  const runs = [run("stage6e", "A", "a"), run("stage6e", "B", "b")]
  for (const opts of [{ calls: 2 }, { duplicate: true }]) {
    const t = telemetry([["stage6e", "a", 100], ["stage6e", "b", 80, opts]])
    const a = analyze(runs, t)
    const c = a.comparisons.find(x => x.comparison === "B/A")
    assert.equal(c.b.tokens, null)
    assert.equal(c.tokenChange, null)
    assert.equal(a.rows.find(r => r.arm === "B").usageComplete, false)
  }
})
