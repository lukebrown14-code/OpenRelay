import { slugify } from "./src/slugify.js"
const check = (c, m) => { if (!c) { console.log("FAIL: " + m); process.exit(1) } }
check(slugify("Hello World") === "Hello-World", "expected hyphen separator")
check(slugify("  a  b ") === "a-b", "trim/collapse broken")
console.log("PASS: control-explicit-edit")
