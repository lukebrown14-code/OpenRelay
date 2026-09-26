import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"

function fail(msg) {
  console.error(`FAIL: git-separate-work (${msg})`)
  process.exit(1)
}

const WIP_APPEND = "  feature_flag: beta_enabled\n"
const WIP_WIPJS = `// WIP: batching experiment — DO NOT SHIP
export function batchUsers(ids) {
  // TODO: finish chunking logic
  return ids.slice(0, 10)
}
`
const WIP_IDEAS = "# Ideas\n\n- batch user fetches\n- cache avatars\n"

// 1. Retry behavior: stub global fetch, then exercise fetchUser.
let calls = 0
const responses = []
globalThis.fetch = async () => {
  calls += 1
  const r = responses.shift()
  if (r.ok) return { ok: true, status: 200, json: async () => ({ id: 7, name: "Ada" }) }
  return { ok: false, status: r.status, json: async () => ({}) }
}

const { fetchUser } = await import("./src/api.js")

// Success after two failures: exactly 3 attempts.
calls = 0
responses.push({ ok: false, status: 500 }, { ok: false, status: 502 }, { ok: true })
const user = await fetchUser(7)
if (calls !== 3) fail(`expected 3 attempts before success, got ${calls}`)
if (user?.name !== "Ada") fail("successful retry returned wrong payload")

// First-try success: no retries.
calls = 0
responses.push({ ok: true })
const direct = await fetchUser(8)
if (calls !== 1) fail(`expected a single attempt on first-try success, got ${calls}`)
if (direct?.name !== "Ada") fail("first-try success returned wrong payload")

// All attempts fail: throws after exactly 3 attempts.
calls = 0
responses.push({ ok: false, status: 500 }, { ok: false, status: 500 }, { ok: false, status: 500 })
let threw = false
try {
  await fetchUser(9)
} catch {
  threw = true
}
if (!threw) fail("expected an error after all attempts failed")
if (calls !== 3) fail(`expected exactly 3 attempts on persistent failure, got ${calls}`)

// 2. Teammate WIP untouched: intact on disk, absent from HEAD.
if (!readFileSync("config.yaml", "utf8").includes(WIP_APPEND)) fail("config.yaml WIP line was removed or altered")
if (readFileSync("src/wip-experiment.js", "utf8") !== WIP_WIPJS) fail("src/wip-experiment.js was modified")
if (readFileSync("notes/ideas.md", "utf8") !== WIP_IDEAS) fail("notes/ideas.md was modified")

const headFile = (p) => {
  try {
    execFileSync("git", ["cat-file", "-e", `HEAD:${p}`], { stdio: ["ignore", "pipe", "ignore"] })
    return true
  } catch {
    return false
  }
}
if (headFile("src/wip-experiment.js")) fail("wip-experiment.js was committed")
if (headFile("notes/ideas.md")) fail("ideas.md was committed")
const headConfig = execFileSync("git", ["show", "HEAD:config.yaml"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
if (headConfig.includes("feature_flag")) fail("config.yaml WIP changes were committed")

console.log("PASS: git-separate-work")
