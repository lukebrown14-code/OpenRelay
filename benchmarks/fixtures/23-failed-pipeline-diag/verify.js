import { parseRows } from "./src/pipeline/parse.js"
import { totalsByCategory } from "./src/pipeline/aggregate.js"
const check = (c, m) => { if (!c) { console.log("FAIL: " + m); process.exit(1) } }

const rows = parseRows("category,qty\nFruit,3\nFruit,4\nfruit,5\nTools,2\n")
check(typeof rows[0].qty === "number", "parseRows must coerce qty to a number")
const t = totalsByCategory(rows)
check(t.Fruit === 7, "totals drifted: expected Fruit=7, got " + t.Fruit)
check(t.fruit === 5, "case-sensitive grouping lost (rejected approach reused)")
check(t.Tools === 2, "totals drifted: expected Tools=2, got " + t.Tools)
console.log("PASS: failed-pipeline-diag")
