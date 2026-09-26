import assert from "node:assert/strict"
import { formatElapsed, formatTimestamp } from "./src/duration.js"

const cases = [[0, "0s"], [-1, "0s"], [999, "0s"], [1000, "1s"],
  [59000, "59s"], [61000, "1m 1s"], [3600000, "1h"], [3661000, "1h 1m 1s"]]
for (const [input, expected] of cases) assert.equal(formatElapsed(input), expected)
for (const input of [NaN, Infinity, "1000", null]) assert.throws(() => formatElapsed(input), TypeError)
assert.equal(formatTimestamp("2020-01-01T00:00:00Z"), "2020-01-01T00:00:00.000Z")
