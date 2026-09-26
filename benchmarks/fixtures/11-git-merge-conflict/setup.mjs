import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const workspace = process.cwd()
const bundle = fileURLToPath(new URL("./history.bundle", import.meta.url))
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "openrelay-git-fixture-"))
const run = args => {
  const result = spawnSync("git", args, { cwd: workspace, encoding: "utf8" })
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || "git setup failed").trim())
}

try {
  const clone = spawnSync("git", ["clone", "--quiet", bundle, temp], { encoding: "utf8" })
  if (clone.status !== 0) throw new Error((clone.stderr || clone.stdout || "bundle clone failed").trim())
  fs.rmSync(path.join(workspace, ".git"), { recursive: true, force: true })
  fs.cpSync(path.join(temp, ".git"), path.join(workspace, ".git"), { recursive: true })
  const refs = spawnSync("git", ["for-each-ref", "--format=%(refname:short)", "refs/remotes/origin"], { cwd: workspace, encoding: "utf8" })
  if (refs.status !== 0) throw new Error((refs.stderr || "could not enumerate fixture branches").trim())
  for (const ref of refs.stdout.split("\n").filter(name => name.startsWith("origin/") && name !== "origin/HEAD")) {
    const branch = ref.slice("origin/".length)
    if (branch === "main") continue
    run(["branch", branch, ref])
  }
  run(["checkout", "--quiet", "main"])
} finally {
  fs.rmSync(temp, { recursive: true, force: true })
}
