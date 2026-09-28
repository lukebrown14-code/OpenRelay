import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

const root = process.env.STAGE8_WORKSPACE
assert(root, "STAGE8_WORKSPACE required")
const load = rel => import(pathToFileURL(path.join(root, rel)).href)
const { selectNotes } = await load("plugins/token-efficient/lib/memory/select.ts")
const { assembleAuxContext } = await load("plugins/token-efficient/lib/assemble/index.ts")
const note = id => ({ schemaVersion: 1, noteID: id, scope: "project", refs: { paths: [`src/${id}.ts`], symbols: [] },
  authorKind: "user", lastValidatedAt: "2026-09-24T00:00:00Z", validity: "current" })
const filler = Array.from({ length: 100 }, (_, i) => note(`filler-${String(i).padStart(3, "0")}`))
const target = note("target")
const index = notes => ({ schemaVersion: 1, projectID: "p-stage8", updatedAt: "2026-09-24T00:00:00Z",
  notes: Object.fromEntries(notes.map(n => [n.noteID, n])) })
const context = { taskRefs: ["target"] }
const a = selectNotes(index([...filler, target]), context)
const b = selectNotes(index([target, ...filler]), context)
assert.deepEqual(a.selected.map(n => n.noteID), ["target"], "explicit note outside first 100 must be considered")
assert.deepEqual(b.selected.map(n => n.noteID), a.selected.map(n => n.noteID), "insertion order must not affect selection")
const dir = path.join(root, ".codebase/modules")
fs.mkdirSync(dir, { recursive: true })
fs.writeFileSync(path.join(dir, "target.md"), "UNIQUE_TARGET_NOTE")
const assembled = assembleAuxContext(root, { memoryIndex: index([...filler, target]), selectionContext: context })
assert.equal(assembled.ok, true)
assert.match(assembled.text, /UNIQUE_TARGET_NOTE/)
assert.deepEqual(assembled.selection.selected.map(n => n.noteID), ["target"])
console.log("PASS: bounded memory selection")
