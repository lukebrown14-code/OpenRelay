import assert from "node:assert/strict"
import path from "node:path"
import { pathToFileURL } from "node:url"

const root = process.env.STAGE8_WORKSPACE
assert(root, "STAGE8_WORKSPACE required")
const load = rel => import(pathToFileURL(path.join(root, rel)).href)
const { buildPacket } = await load("plugins/token-efficient/lib/context/packet.ts")
const { assembleAuxContext } = await load("plugins/token-efficient/lib/assemble/index.ts")

const target = "src/features/status.ts"
const handoff = {
  schemaVersion: 1, handoffID: "ho-stage8", taskID: "t-stage8", workflowID: "w-stage8",
  sourceSession: "s-stage8", direction: "continue", objective: "Repair status",
  constraints: [], decisions: [], acceptanceCriteria: [], currentWork: "",
  nextSteps: [], unresolvedQuestions: [], verifications: [], evidenceRefs: [],
  relevantFiles: [{ path: target, contentDigest: "a".repeat(64), captured: { capturedAt: "2026-09-24T00:00:00Z" },
    recovery: { excerpt: "UNIQUE_RECOVERY_CONTENT", truncated: false } }], createdAt: "2026-09-24T00:00:00Z",
}
const packet = (file, content) => buildPacket({ git: null, excerpts: [{ file, startLine: 1, endLine: 1,
  content, hash: "abc", truncated: false, source: "match" }], searchedPatterns: [], omitted: [], prepMs: 0 })
const render = v3Packet => {
  const result = assembleAuxContext(root, { handoff, v3Packet })
  assert.equal(result.ok, true)
  return result
}

const unrelated = render(packet("archive/status.ts", "unrelated source"))
assert.match(unrelated.text, /UNIQUE_RECOVERY_CONTENT/, "same basename in another directory must not suppress recovery")
const mentioned = render(packet("src/other.ts", `The path ${target} appears in a comment`))
assert.match(mentioned.text, /UNIQUE_RECOVERY_CONTENT/, "arbitrary packet prose must not suppress recovery")
const exact = render(packet(target, "actual source"))
assert.doesNotMatch(exact.text, /UNIQUE_RECOVERY_CONTENT/, "exact packet excerpt should suppress recovery")
assert(exact.omissions.some(item => item.item === `excerpt:${target}` && item.reason === "covered-by-packet"))
console.log("PASS: packet path identity")
