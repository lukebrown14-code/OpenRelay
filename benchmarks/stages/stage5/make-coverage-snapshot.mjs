#!/usr/bin/env node
import { benchmarkRoot, repositoryRoot } from "../../lib/paths.mjs"
// One-time frozen source corpus for the Stage 5 retrieval comparison.
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = repositoryRoot
const archive = path.join(repo, "docs/stage5/coverage-source-snapshot.tar.gz")
const manifestFile = path.join(repo, "docs/stage5/coverage-source-snapshot.json")
if (fs.existsSync(archive) || fs.existsSync(manifestFile)) throw Error("snapshot already exists")
const out = spawnSync("rg", ["--files", "--sort", "path", "--glob", "!**/results/**", "--glob", "!**/node_modules/**", "--glob", "!**/dist/**"],
  { cwd: repo, encoding: "utf8", timeout: 4000, maxBuffer: 1024 * 1024 })
if (out.status !== 0) throw Error("source listing failed")
const excluded = new Set(["node_modules", "dist", "build", "coverage", "test", "tests", "__tests__", "legacy", "archive", "results", "solutions"])
const harness = new Set(["verify.js", "setup.mjs", "TASK.md", "ground-truth.json", "meta.json", "package.json", "package-lock.json", "bun.lock"])
const source = out.stdout.split("\n").filter(Boolean).filter(rel => {
  const parts = rel.split("/")
  if (parts.some(p => p.startsWith(".") || excluded.has(p))) return false
  if (harness.has(parts.at(-1)) || /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(rel)) return false
  if (!/\.(?:[cm]?[jt]sx?|py|rs|html|css)$/.test(rel)) return false
  const st = fs.lstatSync(path.join(repo, rel))
  return st.isFile() && st.size <= 256 * 1024
})
const stage = fs.mkdtempSync(path.join(os.tmpdir(), "openrelay-coverage-source-"))
try {
  const digest = createHash("sha256")
  const files = []
  for (const rel of source) {
    const bytes = fs.readFileSync(path.join(repo, rel))
    digest.update(rel); digest.update(bytes)
    const target = path.join(stage, rel)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, bytes)
    files.push({ path: rel, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length })
  }
  const tar = spawnSync("tar", ["-czf", archive, "-C", stage, "."], { encoding: "utf8" })
  if (tar.status !== 0) throw Error(tar.stderr || "tar failed")
  fs.writeFileSync(manifestFile, JSON.stringify({ createdAt: new Date().toISOString(), sourceDigest: digest.digest("hex"),
    archiveSha256: createHash("sha256").update(fs.readFileSync(archive)).digest("hex"), files }, null, 2) + "\n")
  console.log(JSON.stringify({ archive, manifestFile, count: files.length, bytes: files.reduce((n, f) => n + f.bytes, 0) }))
} finally { fs.rmSync(stage, { recursive: true, force: true }) }
