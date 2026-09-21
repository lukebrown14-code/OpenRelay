// Deterministic noisy node:test suite for formatBytes.
// Seeded PRNG, no timestamps or PIDs: output is byte-identical across runs.
import { test } from "node:test"
import assert from "node:assert/strict"
import { formatBytes } from "../src/format.js"

const SEED = 0x5eed1234
const TOTAL_CASES = 3600
const BOUNDARY_AT = 777

let state = SEED >>> 0
function rand() {
  state = (Math.imul(state, 1664525) + 1013904223) >>> 0
  return state / 4294967296
}

// Independent reference implementation of the formatBytes spec (TASK.md).
const UNITS = ["B", "KB", "MB", "GB", "TB"]
function reference(bytes) {
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit += 1
  }
  const text = value.toFixed(1)
  return `${text.endsWith(".0") ? text.slice(0, -2) : text} ${UNITS[unit]}`
}

function pickBytes() {
  const r = rand()
  let bytes
  if (r < 0.6) bytes = Math.floor(rand() * 8192)
  else if (r < 0.85) bytes = 8192 + Math.floor(rand() * (2 ** 23 - 8192))
  else if (r < 0.97) bytes = 2 ** 23 + Math.floor(rand() * (2 ** 31 - 2 ** 23))
  else bytes = 2 ** 31 + Math.floor(rand() * (2 ** 43 - 2 ** 31))
  // Exact multiples of 1024 are reserved for the dedicated boundary case.
  if (bytes % 1024 === 0) bytes += 1
  return bytes
}

for (let i = 1; i <= TOTAL_CASES; i++) {
  const id = `#${String(i).padStart(4, "0")}`
  if (i === BOUNDARY_AT) {
    test(`case ${id} formatBytes(1024) => "1 KB"`, () => {
      assert.equal(formatBytes(1024), "1 KB")
    })
    continue
  }
  const bytes = pickBytes()
  const want = reference(bytes)
  test(`case ${id} formatBytes(${bytes}) => "${want}"`, () => {
    assert.equal(formatBytes(bytes), want)
  })
}
