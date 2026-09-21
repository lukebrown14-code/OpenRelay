import { randomBytes } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fnv1a } from "../ids"
import { DEFAULT_FILTERING } from "./config"

const REF_RE = /^[a-f0-9]{1,64}$/
const TOTAL_FILE = ".total"

export function rawStoreRoot(): string {
  return path.join(os.homedir(), ".local", "share", "opencode", "token-efficient", "raw")
}

function sessionDirName(sessionID: string): string {
  const clean = String(sessionID)
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .slice(0, 120)
  if (!clean || /^[.]+$/.test(clean)) return `s-${fnv1a(String(sessionID))}`
  return clean
}

function sessionDir(root: string, sessionID: string): string {
  return path.join(root, sessionDirName(sessionID))
}

function readTotal(file: string): number {
  try {
    const n = Number.parseInt(fs.readFileSync(file, "utf8").trim(), 10)
    return Number.isFinite(n) && n >= 0 ? n : 0
  } catch {
    return 0
  }
}

function listDir(dir: string): string[] {
  try {
    return fs.readdirSync(dir)
  } catch {
    return []
  }
}

function cap(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback
}

export function saveRawOutput(args: {
  sessionID: string
  content: string
  dir?: string
  maxBytesPerResult?: number
  maxBytesPerSession?: number
}): string | null {
  try {
    if (typeof args?.sessionID !== "string" || args.sessionID === "") return null
    if (typeof args?.content !== "string") return null
    const root = args.dir && args.dir.trim() ? args.dir : rawStoreRoot()
    const maxResult = cap(args.maxBytesPerResult, DEFAULT_FILTERING.maxBytesPerResult)
    const maxSession = cap(args.maxBytesPerSession, DEFAULT_FILTERING.maxBytesPerSession)
    const bytes = Buffer.byteLength(args.content)
    if (bytes > maxResult) return null
    const sdir = sessionDir(root, args.sessionID)
    const totalPath = path.join(sdir, TOTAL_FILE)
    const total = readTotal(totalPath)
    if (total + bytes > maxSession) return null
    fs.mkdirSync(sdir, { recursive: true, mode: 0o700 })
    const ref = randomBytes(16).toString("hex")
    fs.writeFileSync(path.join(sdir, ref), args.content, { mode: 0o600 })
    fs.writeFileSync(totalPath, String(total + bytes), { mode: 0o600 })
    return ref
  } catch {
    return null
  }
}

export function loadRawOutput(args: { sessionID: string; ref: string; dir?: string }): string | null {
  try {
    if (typeof args?.sessionID !== "string" || args.sessionID === "") return null
    if (typeof args?.ref !== "string" || !REF_RE.test(args.ref)) return null
    const root = args.dir && args.dir.trim() ? args.dir : rawStoreRoot()
    const file = path.join(sessionDir(root, args.sessionID), args.ref)
    const st = fs.statSync(file)
    if (!st.isFile()) return null
    if (Date.now() - st.mtimeMs > DEFAULT_FILTERING.ttlMs) return null
    return fs.readFileSync(file, "utf8")
  } catch {
    return null
  }
}

export function sweepExpired(args: { dir?: string; ttlMs: number }): void {
  try {
    const ttl = cap(args?.ttlMs, DEFAULT_FILTERING.ttlMs)
    const root = args?.dir && args.dir.trim() ? args.dir : rawStoreRoot()
    const cutoff = Date.now() - ttl
    for (const sess of listDir(root)) {
      const sdir = path.join(root, sess)
      for (const name of listDir(sdir)) {
        if (name === TOTAL_FILE) continue
        const file = path.join(sdir, name)
        try {
          const st = fs.statSync(file)
          if (st.isFile() && st.mtimeMs < cutoff) fs.rmSync(file, { force: true })
        } catch {}
      }
      try {
        fs.rmdirSync(sdir)
      } catch {}
    }
  } catch {}
}
