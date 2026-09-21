import fs from "node:fs"
import os from "node:os"
import path from "node:path"

export function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "openrelay-test-"))
}

export function walk(root: string): { files: string[]; dirs: string[] } {
  const files: string[] = []
  const dirs: string[] = []
  const visit = (p: string): void => {
    let entries: fs.Dirent[] = []
    try {
      entries = fs.readdirSync(p, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const full = path.join(p, e.name)
      if (e.isDirectory()) {
        dirs.push(full)
        visit(full)
      } else {
        files.push(full)
      }
    }
  }
  visit(root)
  return { files, dirs }
}

export function findFileUnder(root: string, needle: string): string | null {
  const { files } = walk(root)
  return files.find((f) => path.basename(f).includes(needle)) ?? null
}

export type EventLine = {
  ts: string
  v: number
  type: string
  slug: string
  session: string | null
  task: string | null
  data: Record<string, any>
}

export function readEvents(root: string): EventLine[] {
  const dir = path.join(root, "events")
  const out: EventLine[] = []
  let files: string[] = []
  try {
    files = fs.readdirSync(dir).map((f) => path.join(dir, f))
  } catch {
    return out
  }
  for (const f of files) {
    try {
      for (const line of fs.readFileSync(f, "utf8").split("\n")) {
        if (line.trim()) out.push(JSON.parse(line) as EventLine)
      }
    } catch {}
  }
  return out
}

export function must<T>(v: T | null | undefined, msg = "expected non-null value"): T {
  if (v === null || v === undefined) throw new Error(msg)
  return v
}
