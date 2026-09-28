import { readFileSync } from "node:fs"
import path from "node:path"
import { performance } from "node:perf_hooks"
import { ASSEMBLY_BUDGETS } from "./budgets"
import { readInside } from "../memory/paths"
import { noteStaleness, validateEvidenceRefs } from "../memory/provenance"
import { selectNotes, type AbstainReason, type SelectionContext, type SelectionResult } from "../memory/select"
import type { HandoffRecord, Labeled, MemoryIndex } from "../memory/types"

export type Omission = { item: string; reason: string }

export type AssembleResult =
  | {
      ok: true
      text: string
      bytes: number
      handoffBytes: number
      memoryBytes: number
      omissions: Omission[]
      selection: SelectionResult | null
      prepMs: number
    }
  | {
      ok: false
      reason: "mandatory-exceeds-budget" | "malformed-artifacts" | "nothing-to-assemble"
      detail?: string
      omissions: Omission[]
      prepMs: number
    }

const NOTE_INJECTION_RE = /ignore\s+(all\s+)?(previous|prior|above)\s+instructions|disregard\s+(all\s+)?(previous|prior|above)|system\s*prompt\s*:|you\s+are\s+now\s+/i

function bytes(s: string): number {
  return Buffer.byteLength(s, "utf8")
}

function labeledList(lines: string[], title: string, items: Labeled[]): void {
  if (!items.length) return
  lines.push(`${title}:`)
  for (const item of items) lines.push(`- [${item.provenance}] ${item.text}`)
}

function extractPacketPaths(v3Packet: string | undefined): Set<string> {
  const paths = new Set<string>()
  if (!v3Packet) return paths
  // v3 packet meta lines look like `// path:12-40 hash=… source=…`.
  for (const m of v3Packet.matchAll(/\/\/\s+([^\s:]+:[^\s]+)/g)) paths.add(m[1])
  for (const m of v3Packet.matchAll(/\/\/\s+([^\s:]+)\s*[:/]/g)) paths.add(m[1])
  return paths
}

function packetCoversPath(v3Packet: string | undefined, relPath: string): boolean {
  if (!v3Packet) return false
  if (v3Packet.includes(relPath)) return true
  const base = path.basename(relPath)
  return base.length > 3 && v3Packet.includes(base)
}

// Combined auxiliary-context renderer (stage6-plan §7): handoff first (mandatory
// facts), then memory notes; complete UTF-8 byte accounting including headers and
// provenance labels; duplicates against the v3 packet are suppressed and reported;
// mandatory material over budget falls back explicitly instead of truncating.
export function assembleAuxContext(
  worktree: string,
  input: {
    memoryIndex?: MemoryIndex
    handoff?: HandoffRecord
    selectionContext?: SelectionContext
    v3Packet?: string
    budgets?: typeof ASSEMBLY_BUDGETS
  },
): AssembleResult {
  const started = performance.now()
  const budgets = input.budgets ?? ASSEMBLY_BUDGETS
  const omissions: Omission[] = []
  const prepMs = () => Math.round((performance.now() - started) * 100) / 100

  const fail = (reason: Extract<AssembleResult, { ok: false }>["reason"], detail?: string): AssembleResult =>
    ({ ok: false, reason, detail, omissions, prepMs: prepMs() }) as AssembleResult

  if (!input.handoff && !input.memoryIndex) return fail("nothing-to-assemble")

  // ---- handoff section (mandatory; never truncated) ----
  let handoffText = ""
  let handoffBytes = 0
  if (input.handoff) {
    const h = input.handoff
    const lines: string[] = [`## Task handoff (${h.handoffID}, ${h.direction})`, `Objective: ${h.objective}`]
    labeledList(lines, "Constraints", h.constraints)
    labeledList(lines, "Acceptance criteria", h.acceptanceCriteria)
    labeledList(lines, "Accepted decisions", h.decisions)
    for (const v of h.verifications) lines.push(`Verified: \`${v.command}\` -> exit ${v.exitStatus}${v.exitStatus !== 0 ? ` (current failure)` : ""}`)
    if (h.relevantFiles.length) {
      lines.push("Relevant files:")
      for (const f of h.relevantFiles) {
        lines.push(`- ${f.path} (sha256 ${f.contentDigest.slice(0, 12)})`)
        // Bounded recovery excerpt — the receiver-scope copy of the evidence —
        // suppressed when the v3 packet already carries this path (dedup).
        if (f.recovery?.excerpt && !packetCoversPath(input.v3Packet, f.path)) {
          lines.push("  ```")
          for (const l of f.recovery.excerpt.replace(/\n$/, "").split("\n")) lines.push(`  ${l}`)
          lines.push("  ```" + (f.recovery.truncated ? " (truncated)" : ""))
        } else if (f.recovery?.excerpt) {
          omissions.push({ item: `excerpt:${f.path}`, reason: "covered-by-packet" })
        }
      }
    }
    if (h.currentWork) lines.push(`Current work: ${h.currentWork}`)
    if (h.nextSteps.length) {
      lines.push("Next steps:")
      for (const s of h.nextSteps) lines.push(`- ${s}`)
    }
    if (h.unresolvedQuestions.length) {
      lines.push("Unresolved questions:")
      for (const s of h.unresolvedQuestions) lines.push(`- ${s}`)
    }
    handoffText = lines.join("\n")
    handoffBytes = bytes(handoffText)
    if (handoffBytes > budgets.handoffBytes) {
      return fail("mandatory-exceeds-budget", `handoff renders to ${handoffBytes} bytes > ${budgets.handoffBytes} cap; refusing to truncate`)
    }
  }

  // ---- memory section (optional; abstain on staleness, conflicts, injection) ----
  let selection: SelectionResult | null = null
  const noteSections: string[] = []
  const renderedNotes = new Set<string>()
  let memoryBytes = 0
  if (input.memoryIndex) {
    selection = selectNotes(input.memoryIndex, input.selectionContext ?? {}, budgets.maxSelectedNotes)
    const remainingTotal = budgets.totalAuxBytes - handoffBytes
    for (const note of selection.selected) {
      if (note.validity === "current" && note.sourceDigests) {
        const stale = noteStaleness(worktree, note.sourceDigests, budgets.hashBudget)
        if (stale.stale) {
          omissions.push({ item: `note:${note.noteID}`, reason: `stale-digest (${[...stale.changed, ...stale.missing].join(", ")})` })
          continue
        }
      }
      const rel = path.join(".codebase", "modules", `${note.noteID}.md`)
      let content: string | null
      try {
        content = readInside(worktree, rel)
      } catch {
        omissions.push({ item: `note:${note.noteID}`, reason: "unreadable" })
        continue
      }
      if (content === null) {
        omissions.push({ item: `note:${note.noteID}`, reason: "missing-content" })
        continue
      }
      if (NOTE_INJECTION_RE.test(content)) {
        omissions.push({ item: `note:${note.noteID}`, reason: "suspicious-content" })
        continue
      }
      if (packetCoversPath(input.v3Packet, note.refs.paths[0] ?? "")) {
        omissions.push({ item: `note:${note.noteID}`, reason: "covered-by-packet" })
        continue
      }
      const header = `## Project memory (${note.noteID})`
      const body = content.length > 4096 ? content.slice(0, 4096) : content
      const section = `${header}\n${body}`
      const sectionBytes = bytes(section)
      if (memoryBytes + sectionBytes > budgets.memoryBytes || sectionBytes > remainingTotal) {
        omissions.push({ item: `note:${note.noteID}`, reason: "memory-budget" })
        continue
      }
      noteSections.push(section)
      renderedNotes.add(note.noteID)
      memoryBytes += sectionBytes
    }
    for (const a of selection.abstained) omissions.push({ item: `note:${a.noteID}`, reason: a.reason })
    // The reported selection must reflect what was actually rendered, not what the
    // selector proposed — dropped notes (stale, covered, oversized) appear as omissions.
    selection = { ...selection, selected: selection.selected.filter((n) => renderedNotes.has(n.noteID)) }
  }

  const total = handoffBytes + memoryBytes
  if (total > budgets.totalAuxBytes) {
    return fail("mandatory-exceeds-budget", `combined ${total} bytes > ${budgets.totalAuxBytes} cap`)
  }
  if (!input.handoff && noteSections.length === 0) {
    return { ok: false, reason: "nothing-to-assemble", detail: "no handoff and no usable notes", omissions, prepMs: prepMs() }
  }

  const parts: string[] = []
  if (handoffText) parts.push(handoffText)
  if (noteSections.length) parts.push(...noteSections)
  const text = parts.join("\n\n")
  return {
    ok: true,
    text,
    bytes: bytes(text),
    handoffBytes,
    memoryBytes,
    omissions,
    selection,
    prepMs: prepMs(),
  }
}

// Freshness sweep for a handoff's evidence references; returns per-ref checks the
// caller can record. Bounded by the hash budget.
export function checkHandoffEvidence(worktree: string, handoff: HandoffRecord) {
  return validateEvidenceRefs(worktree, [...handoff.relevantFiles, ...handoff.evidenceRefs], ASSEMBLY_BUDGETS.hashBudget)
}

export type { AbstainReason }
