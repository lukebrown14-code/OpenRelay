import { describe, expect, test } from "bun:test"
import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { tmpDir } from "./helpers"
import {
  DEFAULT_HASH_BUDGET,
  digestSourceState,
  noteStaleness,
  sha256File,
  sha256Text,
  validateEvidenceRef,
  validateEvidenceRefs,
} from "../lib/memory/provenance"

function git(cwd: string, ...args: string[]): void {
  const r = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" })
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`)
}

function initRepo(): string {
  const root = tmpDir()
  git(root, "init", "-q")
  git(root, "-c", "user.email=t@local", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "baseline")
  return root
}

describe("digests", () => {
  test("sha256File matches sha256Text of content", () => {
    const root = tmpDir()
    fs.writeFileSync(path.join(root, "f.txt"), "hello stage 6")
    expect(sha256File(path.join(root, "f.txt"))).toBe(sha256Text("hello stage 6"))
    expect(sha256File(path.join(root, "missing.txt"))).toBeNull()
  })
})

describe("digestSourceState", () => {
  test("captures commit, dirty and untracked files with a skipped budget", () => {
    const root = initRepo()
    fs.writeFileSync(path.join(root, "tracked.txt"), "v1\n")
    git(root, "add", ".")
    git(root, "-c", "user.email=t@local", "-c", "user.name=t", "commit", "-qm", "add tracked")

    const d = digestSourceState(root)
    expect(d.gitCommit).toMatch(/^[0-9a-f]{40}$/)

    fs.writeFileSync(path.join(root, "tracked.txt"), "v2\n")
    fs.writeFileSync(path.join(root, "new.txt"), "untracked\n")
    const d2 = digestSourceState(root)
    expect(Object.keys(d2.dirtyFiles ?? [])).toEqual(["tracked.txt"])
    expect(Object.keys(d2.untrackedFiles ?? [])).toEqual(["new.txt"])
    expect(d2.dirtyFiles?.["tracked.txt"]).toBe(sha256Text("v2\n"))

    // budget: 32 of 42 changed/untracked files hashed, remainder accounted
    for (let i = 0; i < 40; i++) fs.writeFileSync(path.join(root, `bulk-${String(i).padStart(2, "0")}.txt`), `x${i}`)
    const d3 = digestSourceState(root, { maxFiles: 32, maxBytes: 4 * 1024 * 1024 })
    expect(Object.keys(d3.dirtyFiles ?? {}).length + Object.keys(d3.untrackedFiles ?? {}).length).toBe(32)
    expect(d3.skipped).toBe(10)
  })
})

describe("evidence validation", () => {
  test("current/changed/missing statuses", () => {
    const root = initRepo()
    fs.writeFileSync(path.join(root, "src.txt"), "contents")
    const digest = sha256Text("contents")
    const base = { captured: { capturedAt: new Date().toISOString() } }
    const ref = { path: "src.txt", contentDigest: digest, ...base }
    expect(validateEvidenceRef(root, ref as never).status).toBe("current")
    fs.writeFileSync(path.join(root, "src.txt"), "changed")
    expect(validateEvidenceRef(root, ref as never).status).toBe("changed")
    fs.rmSync(path.join(root, "src.txt"))
    expect(validateEvidenceRef(root, ref as never).status).toBe("missing")
    expect(validateEvidenceRef(root, { ...ref, path: "../outside.txt" } as never).status).toBe("outside-root")
  })

  test("bounded sweep marks the remainder skipped-budget", () => {
    const root = tmpDir()
    const refs = Array.from({ length: DEFAULT_HASH_BUDGET.maxFiles + 5 }, (_, i) => ({
      path: `f${i}.txt`,
      contentDigest: sha256Text(`f${i}`),
      captured: { capturedAt: new Date().toISOString() },
    })) as never[]
    for (let i = 0; i < DEFAULT_HASH_BUDGET.maxFiles + 5; i++) fs.writeFileSync(path.join(root, `f${i}.txt`), `f${i}`)
    const { checks, hashed, skippedBudget } = validateEvidenceRefs(root, refs)
    expect(checks).toHaveLength(DEFAULT_HASH_BUDGET.maxFiles + 5)
    expect(hashed).toBe(DEFAULT_HASH_BUDGET.maxFiles)
    expect(skippedBudget).toBe(5)
    expect(checks.slice(0, hashed).every((c) => c.status === "current")).toBe(true)
    expect(checks.slice(hashed).every((c) => c.status === "skipped-budget")).toBe(true)
  })
})

describe("note staleness", () => {
  test("detects changed and missing digested sources", () => {
    const root = tmpDir()
    fs.writeFileSync(path.join(root, "a.ts"), "export const a = 1")
    const digests = { "a.ts": sha256Text("export const a = 1") }
    expect(noteStaleness(root, digests).stale).toBe(false)
    fs.writeFileSync(path.join(root, "a.ts"), "export const a = 2")
    const r = noteStaleness(root, digests)
    expect(r.stale).toBe(true)
    expect(r.changed).toEqual(["a.ts"])
    const r2 = noteStaleness(root, { "gone.ts": sha256Text("x") })
    expect(r2.stale).toBe(true)
    expect(r2.missing).toEqual(["gone.ts"])
    expect(noteStaleness(root, undefined).stale).toBe(false)
  })
})
