import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fnv1a } from "../ids"

export type ProjectIdentity = {
  projectID: string
  worktreeID: string
  worktreeRealpath: string
  gitCommonDir: string | null
  gitCommit: string | null
}

function git(worktree: string, args: string[]): string | null {
  try {
    const r = spawnSync("git", ["-C", worktree, ...args], { encoding: "utf8", timeout: 5000 })
    if (r.status !== 0) return null
    const out = (r.stdout ?? "").trim()
    return out || null
  } catch {
    return null
  }
}

// Stable project identity: linked git worktrees share a common dir and therefore a
// projectID; their worktreeIDs (canonical worktree identity) still differ. Non-git
// repositories get an explicit local identity from the worktree realpath.
export function projectIdentity(worktree: string): ProjectIdentity {
  const realpath = fs.realpathSync(worktree)
  const common = git(realpath, ["rev-parse", "--git-common-dir"])
  const commonReal = common ? path.resolve(realpath, common) : null
  const identityBase = commonReal ?? realpath
  const commit = git(realpath, ["rev-parse", "HEAD"])
  return {
    projectID: `p-${fnv1a(identityBase)}`,
    worktreeID: `w-${fnv1a(realpath)}`,
    worktreeRealpath: realpath,
    gitCommonDir: commonReal,
    gitCommit: commit,
  }
}
