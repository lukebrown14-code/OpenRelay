import { execFileSync } from "node:child_process"

function fail(msg) {
  console.error(`FAIL: git-missing-changes (${msg})`)
  process.exit(1)
}

const g = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim()

const branch = g("rev-parse", "--abbrev-ref", "HEAD")
if (branch !== "main") fail(`expected to finish on main, HEAD is on ${branch}`)

let cfg
try {
  cfg = g("show", "main:config.js")
} catch {
  fail("main has no config.js")
}
if (!/RATE_LIMIT:\s*500/.test(cfg)) {
  fail(`main config.js RATE_LIMIT is not 500:\n${cfg.split("\n").filter((l) => l.includes("RATE_LIMIT")).join("\n")}`)
}

const line = g("log", "--all", "--format=%H %s", "--max-count=200").split("\n").find((l) => l.includes("raise rate limit"))
if (!line) fail("could not find the original rate-limit commit in history")
const commitSha = line.split(" ")[0]
try {
  execFileSync("git", ["merge-base", "--is-ancestor", commitSha, "main"])
} catch {
  fail(`original commit ${commitSha.slice(0, 8)} is not an ancestor of main (file edited directly instead of bringing the change over?)`)
}

const out = execFileSync("node", ["src/app.js"], { encoding: "utf8" })
if (!out.includes("500 requests/min")) fail(`src/app.js reports "${out.trim()}", expected the 500 limit`)

console.log("PASS: git-missing-changes")
