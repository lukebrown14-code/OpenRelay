import { slugify } from "./src/slugify.js"
import assert from "node:assert"

const cases = [
  ["Hello World", "hello-world"],
  ["  Multiple   Spaces  ", "multiple-spaces"],
  ["Tabs\tand\nNewlines", "tabs-and-newlines"],
  ["Special!!! Characters??", "special-characters"],
  ["UPPER Case Input", "upper-case-input"],
  ["don't stop", "dont-stop"],
  ["---leading-trailing---", "leading-trailing"],
]

let failed = 0
for (const [input, expected] of cases) {
  const got = slugify(input)
  try {
    assert.strictEqual(got, expected, `slugify(${JSON.stringify(input)}) = ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`)
  } catch (e) {
    failed++
    console.error(String(e.message))
  }
}
if (failed > 0) {
  console.error(`FAIL: routine-bug (${failed}/${cases.length} cases failed)`)
  process.exit(1)
}
console.log("PASS: routine-bug")
