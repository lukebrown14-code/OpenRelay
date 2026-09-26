import { execFileSync } from "node:child_process"

function fail(msg) {
  console.error(`FAIL: git-merge-conflict (${msg})`)
  process.exit(1)
}

const g = (...args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()

const branch = g("rev-parse", "--abbrev-ref", "HEAD")
if (branch !== "main") fail(`expected to finish on main, HEAD is on ${branch}`)

const dirty = g("status", "--porcelain")
if (dirty) fail(`working tree is not clean:\n${dirty}`)

let secondParent
try {
  secondParent = g("rev-parse", "HEAD^2")
} catch {
  fail("HEAD is not a merge commit")
}

const featureTip = g("rev-parse", "feature/search-suggestions")
if (featureTip !== secondParent) fail("HEAD^2 is not the tip of feature/search-suggestions")

const cfg = g("show", "main:settings.js")
if (!/timeoutMs:\s*250/.test(cfg)) fail("settings.js did not keep main's timeoutMs 250")
if (!/suggestions:\s*true/.test(cfg)) fail("settings.js did not take suggestions: true from the feature branch")
if (/^[<=>|]{6}/m.test(cfg)) fail("settings.js still contains conflict markers")

const test = execFileSync("node", ["settings.test.js"], { encoding: "utf8" })
if (!test.includes("PASS")) fail("settings.test.js did not pass")

console.log("PASS: git-merge-conflict")
