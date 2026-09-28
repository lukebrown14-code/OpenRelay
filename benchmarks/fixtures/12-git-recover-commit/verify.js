import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"

function fail(msg) {
  console.error(`FAIL: git-recover-commit (${msg})`)
  process.exit(1)
}

const g = (...args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()

if (!existsSync("docs/runbook.md")) fail("docs/runbook.md is still missing")

const reflog = (() => {
  try {
    return g("reflog", "--format=%H %gs")
  } catch {
    return ""
  }
})()
const line = reflog.split("\n").find((l) => l.includes("commit: Add incident runbook"))
if (!line) fail("could not locate the original runbook commit via reflog (was it recreated rather than recovered?)")
const originalSha = line.split(" ")[0]

const original = g("show", `${originalSha}:docs/runbook.md`)
const current = readFileSync("docs/runbook.md", "utf8")
if (current.replace(/\n+$/, "") !== original.replace(/\n+$/, "")) {
  fail("docs/runbook.md does not match the original committed content")
}

const subjects = g("log", "main", "--format=%s").split("\n")
if (!subjects.includes("Add incident runbook")) fail("main history does not contain the original commit message")

// Accept the original commit merged into main, or a faithful cherry-pick of it
// (same patch-id, proving the change was recovered rather than rewritten).
let originalAncestor = false
try {
  execFileSync("git", ["merge-base", "--is-ancestor", originalSha, "main"])
  originalAncestor = true
} catch {}

if (!originalAncestor) {
  const patchIdOf = (sha) => {
    const show = execFileSync("git", ["show", sha], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
    try {
      return execFileSync("git", ["patch-id", "--stable"], { input: show, encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).split(" ")[0]
    } catch {
      return ""
    }
  }
  const originalPatch = patchIdOf(originalSha)
  if (!originalPatch) fail("could not compute the original commit's patch-id")
  const recovered = g("log", "main", "--format=%H %s")
    .split("\n")
    .filter((l) => l.endsWith("Add incident runbook") && !l.startsWith(originalSha))
  const faithful = recovered.some((l) => patchIdOf(l.split(" ")[0]) === originalPatch)
  if (!faithful) {
    fail("main does not contain the original commit nor a faithful (same patch) recovery of it")
  }
}

console.log("PASS: git-recover-commit")
