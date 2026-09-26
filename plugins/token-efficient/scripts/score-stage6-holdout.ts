// Stage 6 offline holdout scorer (stage6-plan §9). Zero model calls.
//   bun plugins/token-efficient/scripts/score-stage6-holdout.ts [--json]
// Verifies frozen tree hashes, runs assembly per case, checks preregistered
// expectations, and reports the §9 gates. Any code change requires an honest
// re-run labeled as a repeat in offline-results.md — the holdout is never retuned.
import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
import { performance } from "node:perf_hooks"
import { fileURLToPath } from "node:url"
import { ProjectStore, ValidationError } from "../lib/memory/store"
import { buildHandoff } from "../lib/handoff/builder"
import { validateMemoryIndex } from "../lib/memory/schemas"
import { assembleAuxContext } from "../lib/assemble/index"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, "..", "test", "fixtures", "stage6-holdout")
const sha = (buf: Buffer | string): string => createHash("sha256").update(buf).digest("hex")

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"))
const expectHash = sha(JSON.stringify({ frozenAt: manifest.frozenAt, hashAlgo: manifest.hashAlgo, cases: manifest.cases }))
if (expectHash !== manifest.manifestHash) {
  console.error("FATAL: manifest hash mismatch — holdout drift")
  process.exit(2)
}

type CaseResult = {
  id: string
  class: string
  category: string
  outcome: string
  pass: boolean
  failures: string[]
  bytes: number | null
  omissions: string[]
  memorySelected: string[]
  coldMs: number
  warmMs: number
}

function runCase(def: { id: string; class: string; category: string; treeHash: string; expect: any }): CaseResult {
  const failures: string[] = []
  const caseDir = path.join(ROOT, "cases", def.id)
  const worktree = path.join(caseDir, "worktree")
  const input = JSON.parse(fs.readFileSync(path.join(caseDir, "input.json"), "utf8"))

  // frozen-tree integrity
  const hash = createHash("sha256")
  const rels: string[] = []
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) walk(full)
      else rels.push(path.relative(worktree, full))
    }
  }
  walk(worktree)
  for (const rel of rels.sort()) {
    hash.update(rel + "\n")
    hash.update(sha(fs.readFileSync(path.join(worktree, rel))) + "\n")
  }
  if (hash.digest("hex") !== def.treeHash) failures.push("tree-hash drift")

  const once = (): { outcome: string; detail?: string; text: string; omissions: string[]; memorySelected: string[]; bytes: number | null } => {
    // resume + handoff load
    let handoff: any = null
    if (input.resumeSession) {
      const store = new ProjectStore(worktree)
      const rec = store.findTaskBySession(input.resumeSession)
      if (!rec) return { outcome: "fallback", detail: "task-not-found", text: "", omissions: [], memorySelected: [], bytes: null }
      if (input.expectWorkflowID && rec.workflowID !== input.expectWorkflowID) {
        failures.push(`workflowID ${rec.workflowID} != ${input.expectWorkflowID}`)
      }
      handoff = store.readHandoff(input.readHandoff.taskID, input.readHandoff.handoffID)
      if (!handoff) return { outcome: "fallback", detail: "handoff-not-found", text: "", omissions: [], memorySelected: [], bytes: null }
      if (input.augmentHandoff?.relevantFiles) {
        const rebuilt = buildHandoff(worktree, {
          taskID: handoff.taskID,
          workflowID: handoff.workflowID,
          direction: handoff.direction,
          sourceSession: handoff.sourceSession,
          objective: handoff.objective,
          constraints: handoff.constraints,
          decisions: handoff.decisions,
          acceptanceCriteria: handoff.acceptanceCriteria,
          currentWork: handoff.currentWork,
          nextSteps: handoff.nextSteps,
          unresolvedQuestions: handoff.unresolvedQuestions,
          verifications: handoff.verifications,
          relevantFiles: input.augmentHandoff.relevantFiles,
          handoffID: handoff.handoffID,
        })
        if (!rebuilt.ok) return { outcome: "fallback", detail: rebuilt.reason, text: "", omissions: [], memorySelected: [], bytes: null }
        handoff = rebuilt.handoff
      }
    }
    if (input.handoffInput) {
      const built = buildHandoff(worktree, input.handoffInput)
      if (!built.ok) return { outcome: "fallback", detail: built.reason, text: "", omissions: [], memorySelected: [], bytes: null }
      handoff = built.handoff
    }

    // memory index (malformed artifacts -> recorded fallback, never a throw)
    let memoryIndex: any = undefined
    if (fs.existsSync(path.join(worktree, ".codebase", "memory.json")) || input.corruptIndex) {
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(worktree, ".codebase", "memory.json"), "utf8"))
        const v = validateMemoryIndex(raw)
        if (!v.ok) return { outcome: "fallback", detail: "malformed-artifacts", text: "", omissions: [], memorySelected: [], bytes: null }
        memoryIndex = v.value
      } catch {
        return { outcome: "fallback", detail: "malformed-artifacts", text: "", omissions: [], memorySelected: [], bytes: null }
      }
    }

    const r = assembleAuxContext(worktree, {
      memoryIndex,
      handoff,
      selectionContext: { requestPaths: input.requestPaths, taskRefs: input.taskRefs },
      v3Packet: input.v3Packet,
    })
    if (!r.ok) {
      return { outcome: "fallback", detail: r.reason, text: "", omissions: r.omissions.map((o) => o.reason), memorySelected: [], bytes: null }
    }
    return {
      outcome: "assembled",
      text: r.text,
      omissions: r.omissions.map((o) => `${o.item}:${o.reason}`),
      memorySelected: r.selection?.selected.map((n) => n.noteID) ?? [],
      bytes: r.bytes,
    }
  }

  // cold + warm passes (preparation budget measured on both)
  const t0 = performance.now()
  const res = once()
  const coldMs = Math.round((performance.now() - t0) * 100) / 100
  const t1 = performance.now()
  once()
  const warmMs = Math.round((performance.now() - t1) * 100) / 100

  const e = def.expect
  if (e.outcome === "assembled") {
    if (res.outcome !== "assembled") failures.push(`expected assembled, got fallback (${res.detail ?? "?"})`)
    else {
      for (const s of e.mustContain) if (!res.text.includes(s)) failures.push(`missing fact: ${JSON.stringify(s.slice(0, 60))}`)
      if (e.memorySelected !== null && JSON.stringify([...res.memorySelected].sort()) !== JSON.stringify([...e.memorySelected].sort()))
        failures.push(`memorySelected ${JSON.stringify(res.memorySelected)} != ${JSON.stringify(e.memorySelected)}`)
      if (res.bytes !== null && res.bytes > 12 * 1024) failures.push(`bytes ${res.bytes} > 12288`)
    }
  } else {
    if (res.outcome !== "fallback") failures.push(`expected fallback, got ${res.outcome}`)
    else if (e.fallbackReason && res.detail !== e.fallbackReason) failures.push(`fallback reason ${res.detail} != ${e.fallbackReason}`)
  }
  for (const s of e.mustNotContain) {
    if (res.text.includes(s)) failures.push(`forbidden fact leaked: ${JSON.stringify(s.slice(0, 60))}`)
  }
  for (const reason of e.omissionReasons ?? []) {
    if (!res.omissions.some((o) => o.includes(reason))) failures.push(`expected omission reason ${reason}`)
  }
  if (res.text && res.bytes !== null && res.bytes > 12 * 1024) failures.push(`bytes ${res.bytes} > cap`)
  if (coldMs > 250 || warmMs > 250) failures.push(`prep over abandon budget (cold ${coldMs}ms warm ${warmMs}ms)`)

  const usable = res.outcome === "assembled" && failures.length === 0
  return {
    id: def.id,
    class: def.class,
    category: def.category,
    outcome: res.outcome === "assembled" ? "assembled" : `fallback:${res.detail}`,
    pass: failures.length === 0,
    failures,
    bytes: res.bytes,
    omissions: res.omissions,
    memorySelected: res.memorySelected,
    coldMs,
    warmMs,
    ...(usable ? {} : {}),
  }
}

const results: CaseResult[] = []
for (const def of manifest.cases) {
  try {
    results.push(runCase(def))
  } catch (err) {
    results.push({
      id: def.id, class: def.class, category: def.category, outcome: "exception", pass: false,
      failures: [`unexpected throw: ${err instanceof Error ? err.message : String(err)}`],
      bytes: null, omissions: [], memorySelected: [], coldMs: 0, warmMs: 0,
    })
  }
}

const positives = results.filter((r) => r.class === "positive")
const negatives = results.filter((r) => r.class === "negative")
const useful = positives.filter((r) => r.outcome === "assembled" && r.pass).length
const gates = {
  "zero-silent-losses": positives.every((r) => r.outcome !== "assembled" || r.failures.every((f) => !f.startsWith("missing fact"))),
  "useful-evidence": { count: useful, target: ">=10/12", pass: useful >= 10 },
  "zero-leakage": results.every((r) => r.failures.every((f) => !f.startsWith("forbidden fact leaked"))),
  "negatives-abstain": { count: negatives.filter((r) => r.pass).length, target: "8/8", pass: negatives.every((r) => r.pass) },
  "bounds-hold": results.every((r) => r.bytes === null || r.bytes <= 12 * 1024),
  "no-exceptions": results.every((r) => r.outcome !== "exception"),
  "prep-budget": { p95Cold: p95(results.map((r) => r.coldMs)), p95Warm: p95(results.map((r) => r.warmMs)), target: "<=100ms, abandon 250ms", pass: results.every((r) => r.coldMs <= 250 && r.warmMs <= 250) },
}
function p95(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)] ?? 0
}

console.log("case\tclass\toutcome\tpass\tbytes\tcoldMs\twarmMs\tmemory")
for (const r of results) {
  console.log(`${r.id}\t${r.class}\t${r.outcome}\t${r.pass ? "PASS" : "FAIL"}\t${r.bytes ?? "-"}\t${r.coldMs}\t${r.warmMs}\t[${r.memorySelected.join(",")}]`)
  for (const f of r.failures) console.log(`   ! ${f}`)
}
console.log("\nGATES:")
for (const [k, v] of Object.entries(gates)) console.log(`${k}: ${JSON.stringify(v)}`)
const allPass = results.every((r) => r.pass)
console.log(`\nOVERALL: ${allPass ? "PASS" : "FAIL"} (${results.filter((r) => r.pass).length}/${results.length} cases)`)
if (process.argv.includes("--json")) console.log(JSON.stringify({ results, gates }, null, 1))
process.exit(allPass ? 0 : 1)
