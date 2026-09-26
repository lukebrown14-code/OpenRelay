import fs from "node:fs"
import path from "node:path"

export class PathError extends Error {}

function nearestRealpath(p: string): string {
  let cur = p
  for (;;) {
    try {
      return fs.realpathSync(cur)
    } catch {}
    const parent = path.dirname(cur)
    if (parent === cur) return p
    cur = parent
  }
}

// Resolve `rel` inside `root`, rejecting traversal and symlink escape.
// `rel` must be repo-relative; the final segment may not exist yet (writes).
export function resolveInside(root: string, rel: string): string {
  if (typeof rel !== "string" || rel.length === 0) throw new PathError("empty path")
  if (path.isAbsolute(rel)) throw new PathError(`absolute path rejected: ${rel}`)
  const rootReal = fs.realpathSync(root)
  const full = path.resolve(rootReal, rel)
  const relCheck = path.relative(rootReal, full)
  if (relCheck.startsWith("..") || path.isAbsolute(relCheck)) throw new PathError(`path escapes root: ${rel}`)
  const existing = nearestRealpath(full)
  const relExisting = path.relative(rootReal, existing)
  if (relExisting.startsWith("..") && relExisting !== "") throw new PathError(`symlink escape rejected: ${rel}`)
  return full
}

// Read a file that must exist inside root; returns null when absent.
export function readInside(root: string, rel: string): string | null {
  const full = resolveInside(root, rel)
  try {
    return fs.readFileSync(full, "utf8")
  } catch {
    return null
  }
}

// Atomic write (tmp + rename) confined to root.
export function writeInside(root: string, rel: string, data: string, mode: "overwrite" | "exclusive" = "overwrite"): void {
  const full = resolveInside(root, rel)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  if (mode === "exclusive") {
    // wx via openSync: immutable snapshot semantics; throws EEXIST when present.
    const fd = fs.openSync(full, "wx", 0o600)
    try {
      fs.writeSync(fd, data)
    } finally {
      fs.closeSync(fd)
    }
    return
  }
  const tmp = `${full}.${process.pid}.tmp`
  try {
    fs.writeFileSync(tmp, data)
    fs.renameSync(tmp, full)
  } catch (e) {
    try {
      fs.rmSync(tmp, { force: true })
    } catch {}
    throw e
  }
}

export function existsInside(root: string, rel: string): boolean {
  try {
    resolveInside(root, rel)
    return true
  } catch {
    return false
  }
}
