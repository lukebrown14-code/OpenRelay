import type { MemoryIndex, MemoryNoteMeta } from "../memory/types"

export type SelectionContext = {
  // Verified source paths already identified by v3 (request-named paths and probe
  // candidates). Only exact path overlap counts; generic keywords never match.
  requestPaths?: string[]
  // Note IDs explicitly referenced by the task (e.g. recorded on the task record).
  taskRefs?: string[]
}

export type AbstainReason =
  | "retired"
  | "stale-digest"
  | "stale-validity"
  | "no-reference"
  | "conflict"
  | "cap"
  | "considered-cap"
  | "suspicious-content"
  | "covered-by-packet"

export type SelectionResult = {
  selected: MemoryNoteMeta[]
  abstained: Array<{ noteID: string; reason: AbstainReason; detail?: string }>
  considered: number
}

// Conservative note selection (stage6-plan §7): select only by explicit note/task
// reference or exact overlap with verified source paths. Weak matches, conflicts,
// stale and retired notes abstain. Deterministic ordering throughout.
export function selectNotes(index: MemoryIndex, ctx: SelectionContext, maxNotes = 2): SelectionResult {
  const requestPaths = new Set(ctx.requestPaths ?? [])
  const taskRefs = new Set(ctx.taskRefs ?? [])
  const abstained: SelectionResult["abstained"] = []

  const all = Object.values(index.notes)
  const considered = all.slice(0, 100) // maxNotesConsidered budget; stable metadata order
  for (const note of all.slice(100)) abstained.push({ noteID: note.noteID, reason: "considered-cap" })

  const eligible: MemoryNoteMeta[] = []
  for (const note of considered) {
    if (note.validity === "retired") {
      abstained.push({ noteID: note.noteID, reason: "retired" })
      continue
    }
    if (note.validity === "stale") {
      abstained.push({ noteID: note.noteID, reason: "stale-validity" })
      continue
    }
    const explicitlyReferenced = taskRefs.has(note.noteID)
    const overlaps = note.refs.paths.some((p) => requestPaths.has(p))
    if (!explicitlyReferenced && !overlaps) {
      abstained.push({ noteID: note.noteID, reason: "no-reference" })
      continue
    }
    eligible.push(note)
  }

  // Stable order: explicit references first, then by noteID — deterministic tie-break.
  eligible.sort((a, b) => {
    const ar = taskRefs.has(a.noteID) ? 0 : 1
    const br = taskRefs.has(b.noteID) ? 0 : 1
    if (ar !== br) return ar - br
    return a.noteID < b.noteID ? -1 : a.noteID > b.noteID ? 1 : 0
  })

  const selected: MemoryNoteMeta[] = []
  const selectedPaths = new Set<string>()
  for (const note of eligible) {
    if (selected.length >= maxNotes) {
      abstained.push({ noteID: note.noteID, reason: "cap" })
      continue
    }
    // Conflicting notes: overlapping path sets are treated as conflicting; both
    // abstain rather than picking a winner without semantic evidence.
    const overlap = note.refs.paths.filter((p) => selectedPaths.has(p))
    if (overlap.length > 0) {
      abstained.push({ noteID: note.noteID, reason: "conflict", detail: `paths already covered by a selected note: ${overlap.join(", ")}` })
      // A previously selected note that shares paths is also suspect; retract it so
      // conflicting material never reaches the packet.
      const clash = selected.find((s) => s.refs.paths.some((p) => selectedPaths.has(p) && note.refs.paths.includes(p)))
      if (clash) {
        selected.splice(selected.indexOf(clash), 1)
        abstained.push({ noteID: clash.noteID, reason: "conflict", detail: `overlaps ${note.noteID}` })
      }
      continue
    }
    selected.push(note)
    for (const p of note.refs.paths) selectedPaths.add(p)
  }
  return { selected, abstained, considered: considered.length }
}
