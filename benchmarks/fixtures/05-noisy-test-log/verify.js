import { formatBytes } from "./src/format.js"
import assert from "node:assert"

const cases = [
  [0, "0 B"],
  [512, "512 B"],
  [1023, "1023 B"],
  [1024, "1 KB"],
  [1536, "1.5 KB"],
  [2048, "2 KB"],
  [1048576, "1 MB"],
  [1610612736, "1.5 GB"],
  [1099511627776, "1 TB"],
]

let failed = 0
for (const [bytes, expected] of cases) {
  const got = formatBytes(bytes)
  try {
    assert.strictEqual(got, expected, `formatBytes(${bytes}) = ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`)
  } catch (e) {
    failed++
    console.error(String(e.message))
  }
}
if (failed > 0) {
  console.error(`FAIL: noisy-test-log (${failed}/${cases.length} cases failed)`)
  process.exit(1)
}
console.log("PASS: noisy-test-log")
