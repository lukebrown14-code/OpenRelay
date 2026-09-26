import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { discover, evaluate } from "./coverage-prototype.mjs"

test("symptom-led extension tasks recover required files within four candidates", () => {
  const rows = evaluate().filter(x => /^(1[4-8]|20)-/.test(x.fixture))
  assert.equal(rows.length, 6)
  for (const row of rows) assert.equal(row.fullRecall, true, row.fixture)
})

test("ranking is deterministic and an import neighbor can surface without a query term", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coverage-graph-"))
  try {
    fs.mkdirSync(path.join(dir, "src"))
    fs.writeFileSync(path.join(dir, "src", "receipt.js"), "export const receipt = 1\n")
    fs.writeFileSync(path.join(dir, "src", "checkout.js"), "import {receipt} from './receipt.js'\nexport const checkout = receipt\n")
    for (let i = 0; i < 30; i++) fs.writeFileSync(path.join(dir, "src", `misc${i}.js`), "export const unrelated = 1\n")
    const a = discover(dir, "Change checkout formatting", 6)
    const b = discover(dir, "Change checkout formatting", 6)
    assert.deepEqual(a, b)
    assert.deepEqual(a.candidates.slice(0, 2).map(x => x.file).sort(), ["src/checkout.js", "src/receipt.js"])
    assert.equal(a.candidates.find(x => x.file === "src/receipt.js")?.lexical, 0)
    assert.ok(a.candidates.find(x => x.file === "src/receipt.js")?.neighborBonus > 0)
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test("file map excludes dotfiles, symlinks, binaries, harness and oversized files", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coverage-guard-"))
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "coverage-outside-"))
  try {
    fs.writeFileSync(path.join(dir, ".env"), "receipt SECRET=foo\n")
    fs.writeFileSync(path.join(dir, "TASK.md"), "receipt fake task\n")
    fs.writeFileSync(path.join(dir, "verify.js"), "receipt fake verifier\n")
    fs.writeFileSync(path.join(dir, "blob.js"), Buffer.from([0, 1, 2]))
    fs.writeFileSync(path.join(dir, "huge.js"), "receipt\n".repeat(40000))
    fs.writeFileSync(path.join(outside, "outside.js"), "receipt secret\n")
    fs.symlinkSync(path.join(outside, "outside.js"), path.join(dir, "link.js"))
    fs.writeFileSync(path.join(dir, "receipt.js"), "export const receipt = true\n")
    const found = discover(dir, "receipt").candidates.map(x => x.file)
    assert.deepEqual(found, ["receipt.js"])
  } finally { fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(outside, { recursive: true, force: true }) }
})
