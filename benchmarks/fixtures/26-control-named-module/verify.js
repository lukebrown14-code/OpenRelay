import { lookup } from "./src/emoji.js"
const check = (c, m) => { if (!c) { console.log("FAIL: " + m); process.exit(1) } }
check(lookup(":grin:") === "grinning", "missing :grin: alias")
check(lookup(":)") === "slightly_smiling_face", "existing alias broken")
check(lookup(":wink:") === "winking_face", "existing alias broken")
console.log("PASS: control-named-module")
