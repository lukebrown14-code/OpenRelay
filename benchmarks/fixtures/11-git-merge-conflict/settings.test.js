import { settings } from "./settings.js"
import assert from "node:assert"

assert.ok(settings.search.timeoutMs >= 250, `search timeout must be at least 250, got ${settings.search.timeoutMs}`)
assert.strictEqual(settings.search.suggestions, true, "search suggestions flag missing")

console.log("PASS: settings.test.js")
