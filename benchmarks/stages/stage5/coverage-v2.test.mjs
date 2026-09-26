import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { packet, rank } from "./coverage-v2.mjs"

function scratch(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coverage-v2-test-"))
  try { fn(dir) } finally { fs.rmSync(dir, { recursive: true, force: true }) }
}

test("four large candidates receive source lines within a complete UTF-8 packet budget", () => scratch(dir => {
  for (let i = 0; i < 4; i++) fs.writeFileSync(path.join(dir, `target${i}.js`),
    Array.from({ length: 100 }, (_, n) => `export function target${i}_${n}() { return "λ" }`).join("\n"))
  const p = packet(dir, "Find target functions")
  assert.equal(p.candidates.length, 4)
  assert.ok(p.candidates.every(c => c.contentBytes >= 900))
  assert.ok(Buffer.byteLength(p.text) <= 8192)
  assert.equal(p.bytes, Buffer.byteLength(p.text))
}))

test("late implementation lines are selected before unrelated file heads", () => scratch(dir => {
  fs.writeFileSync(path.join(dir, "diagnostic.js"), "// old filler\n".repeat(200) + "export function diagnosticRecovery() { return 'fixed' }\n")
  const p = packet(dir, "Find diagnostic recovery behavior")
  assert.match(p.text, /diagnosticRecovery/)
}))

test("dotfiles, tests, symlinks, binary and oversized files are excluded", () => scratch(dir => {
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "coverage-v2-outside-"))
  try {
    fs.writeFileSync(path.join(dir, ".env"), "target SECRET=bad")
    fs.writeFileSync(path.join(dir, "target.test.js"), "target SECRET=bad")
    fs.writeFileSync(path.join(dir, "binary.js"), Buffer.from([0, 1, 2]))
    fs.writeFileSync(path.join(dir, "huge.js"), "target\n".repeat(50000))
    fs.writeFileSync(path.join(outside, "escape.js"), "target SECRET=bad")
    fs.symlinkSync(path.join(outside, "escape.js"), path.join(dir, "linked.js"))
    fs.writeFileSync(path.join(dir, "target.js"), "export const target = true")
    assert.deepEqual(rank(dir, "target").candidates.map(c => c.file), ["target.js"])
    assert.doesNotMatch(packet(dir, "target").text, /SECRET=bad/)
  } finally { fs.rmSync(outside, { recursive: true, force: true }) }
}))

test("stable ranking and packet text for identical inputs", () => scratch(dir => {
  fs.writeFileSync(path.join(dir, "a.js"), "export const alpha = 1\n")
  fs.writeFileSync(path.join(dir, "b.js"), "import {alpha} from './a.js'\nexport const beta = alpha\n")
  const a = packet(dir, "Find beta alpha")
  const b = packet(dir, "Find beta alpha")
  assert.equal(a.text, b.text)
  assert.deepEqual(a.candidates.map(x => x.file), b.candidates.map(x => x.file))
}))
