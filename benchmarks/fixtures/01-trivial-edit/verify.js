import { cardRadius, styleSummary } from "./src/theme.js"
import assert from "node:assert"

assert.strictEqual(cardRadius, 12, `expected cardRadius 12, got ${cardRadius}`)
assert.ok(styleSummary().includes("12px"), `summary should mention 12px, got: ${styleSummary()}`)
console.log("PASS: trivial-edit")
