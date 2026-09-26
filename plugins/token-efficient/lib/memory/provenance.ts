import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { nowISO } from "../ids"
import { resolveInside } from "./paths"
import type { EvidenceRef, SourceStateDigest } from "./types"

export const DEFAULT_HASH_BUDGET = { maxFiles: 32, maxBytes: 4 * 1024 * 1024 }

export type HashBudget = { maxFiles: number; maxBytes: number }

export function sha256Text(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex")
}

export function sha256File(fullPath: string): string | null {
  try {
    const buf = fs.readFileSync(fullPath)
    return createHash("sha256").update(buf).digest("hex")
  } catch {
    return null
  }
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

// Like git(), but preserves leading whitespace per line — required for
// `status --porcelain`, whose status codes are space-padded (" M path").
function gitRaw(worktree: string, args: string[]): string | null {
  try {
    const r = spawnSync("git", ["-C", worktree, ...args], { encoding: "utf8", timeout: 5000 })
    if (r.status !== 0) return null
    const out = (r.stdout ?? "").replace(/\r?\n$/, "")
    return out || null
  } catch {
    return null
  }
}
// Source-state digest: git commit plus bounded digests of dirty/untracked files.
// A commit hash alone cannot establish freshness (plan §5).
export function digestSourceState(worktree: string, budget: HashBudget = DEFAULT_HASH_BUDGET): SourceStateDigest {
  const digest: SourceStateDigest = { capturedAt: nowISO() }
  digest.gitCommit = git(worktree, ["rev-parse", "HEAD"])
  const porcelain = gitRaw(worktree, ["status", "--porcelain"])
  digest.dirtyFiles = {}
  digest.untrackedFiles = {}
  if (!porcelain) return digest
  let hashed = 0
  let bytes = 0
  let skipped = 0
  for (const line of porcelain.split("\n")) {
    if (!line.trim()) continue
    const status = line.slice(0, 2)
    const rel = line.slice(3).trim().replace(/^"|"$/g, "")
    if (!rel) continue
    if (hashed >= budget.maxFiles || bytes >= budget.maxBytes) {
      skipped += 1
      continue
    }
    let full: string
    try {
      full = resolveInside(worktree, rel)
    } catch {
      continue
    }
    const d = sha256File(full)
    if (d === null) {
      skipped += 1
      continue
    }
    const stat = (() => {
      try {
        return fs.statSync(full)
      } catch {
        return null
      }
    })()
    bytes += stat?.size ?? 0
    hashed += 1
    if (status.includes("?")) digest.untrackedFiles![rel] = d
    else digest.dirtyFiles![rel] = d
  }
  if (skipped > 0) digest.skipped = skipped
  return digest
}

export type EvidenceStatus = "current" | "changed" | "missing" | "outside-root" | "skipped-budget"

export type EvidenceCheck = {
  ref: EvidenceRef
  status: EvidenceStatus
  actualDigest?: string
}

// Freshness validation for a single evidence reference against current source.
export function validateEvidenceRef(worktree: string, ref: EvidenceRef): EvidenceCheck {
  let full: string
  try {
    full = resolveInside(worktree, ref.path)
  } catch {
    return { ref, status: "outside-root" }
  }
  const actual = sha256File(full)
  if (actual === null) return { ref, status: "missing" }
  return { ref, status: actual === ref.contentDigest ? "current" : "changed", actualDigest: actual }
}

// Bounded validation sweep over many refs; stops hashing at the budget and marks the
// remainder skipped-budget rather than silently trusting them.
export function validateEvidenceRefs(worktree: string, refs: EvidenceRef[], budget: HashBudget = DEFAULT_HASH_BUDGET): { checks: EvidenceCheck[]; hashed: number; skippedBudget: number } {
  const checks: EvidenceCheck[] = []
  let hashed = 0
  let skippedBudget = 0
  for (const ref of refs) {
    if (hashed >= budget.maxFiles) {
      checks.push({ ref, status: "skipped-budget" })
      skippedBudget += 1
      continue
    }
    const check = validateEvidenceRef(worktree, ref)
    if (check.status !== "skipped-budget" && check.status !== "outside-root") hashed += 1
    checks.push(check)
  }
  return { checks, hashed, skippedBudget }
}

// A note's source digests are stale when any digested path's content changed.
export function noteStaleness(worktree: string, sourceDigests: Record<string, string> | undefined, budget: HashBudget = DEFAULT_HASH_BUDGET): { stale: boolean; changed: string[]; missing: string[] } {
  const changed: string[] = []
  const missing: string[] = []
  if (!sourceDigests) return { stale: false, changed, missing }
  const entries = Object.entries(sourceDigests)
  for (const [rel, digest] of entries.slice(0, budget.maxFiles)) {
    let full: string
    try {
      full = resolveInside(worktree, rel)
    } catch {
      missing.push(rel)
      continue
    }
    const actual = sha256File(full)
    if (actual === null) missing.push(rel)
    else if (actual !== digest) changed.push(rel)
  }
  return { stale: changed.length > 0 || missing.length > 0, changed, missing }
}
