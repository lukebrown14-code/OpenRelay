import path from "node:path"

export function nowISO(): string {
  return new Date().toISOString()
}

export function fnv1a(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, "0")
}

export function slugFor(worktree: string): string {
  const base = path.basename(worktree) || "root"
  const clean =
    base
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "proj"
  return `${clean}-${fnv1a(path.resolve(worktree)).slice(0, 6)}`
}

function stampRand(prefix: string): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, "0")
  const stamp = `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`
  const rand = Math.floor(Math.random() * 36 ** 5)
    .toString(36)
    .padStart(5, "0")
  return `${prefix}-${stamp}-${rand}`
}

export function newTaskID(): string {
  return stampRand("t")
}

export function newWorkflowID(): string {
  return stampRand("wf")
}

export function newRecordID(prefix: string): string {
  return stampRand(prefix)
}
