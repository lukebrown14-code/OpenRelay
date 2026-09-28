#!/usr/bin/env node
import { benchmarkRoot, repositoryRoot } from "../../lib/paths.mjs"
// Freeze only allowlisted source files. Never traverse links or copy runtime data.
import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const root = repositoryRoot
const outputRoot = path.join(repositoryRoot, "benchmarks/results/stage8-snapshots")
const manifestPath = path.join(repositoryRoot, "docs/stage8/source-manifest.json")
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex")
const git = (repo, args) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim()
const specs = [
  { name: "openrelay", repo: root, included: ["plugins/token-efficient/**/*.{ts,tsx}", "plugins/token-efficient/tsconfig.json", "scripts/**/*.mjs", "benchmarks/*.mjs", "benchmarks/lib/**/*.mjs", "benchmarks/stages/**/*.mjs", "benchmarks/stages/**/*.ts", "docs/token-efficient-architecture.md", "AGENTS.md", "package.json"],
    excluded: ["plugins/token-efficient/test/fixtures/", "benchmarks/fixtures/", "benchmarks/results/", ".env*", "node_modules/", "all non-allowlisted files"] },
  { name: "delta", repo: "/Users/luke/src/Delta", included: ["delta/**/*.py", "tests/*.py", "PROJECT_SPEC.md", "AGENTS.md", "README.md", "pyproject.toml"],
    excluded: ["config.toml (modified)", "tests/fixtures/", "tests/__snapshots__/", "docs/", ".venv/", "**/__pycache__/", "runtime data and credentials", "all non-allowlisted files"] },
]

function walk(dir, prefix = "") {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const rel = path.posix.join(prefix, entry.name)
    if (entry.isSymbolicLink()) return []
    if (entry.isDirectory()) return walk(path.join(dir, entry.name), rel)
    return entry.isFile() ? [rel] : []
  })
}

function paths(spec) {
  if (spec.name === "delta") return ["PROJECT_SPEC.md", "AGENTS.md", "README.md", "pyproject.toml",
    ...walk(path.join(spec.repo, "tests"), "tests").filter(f => f.split("/").length === 2 && f.endsWith(".py")),
    ...walk(path.join(spec.repo, "delta"), "delta").filter(f => f.endsWith(".py") && !f.includes("/__pycache__/"))].sort()
  return ["AGENTS.md", "docs/token-efficient-architecture.md", "package.json", "plugins/token-efficient/tsconfig.json",
    ...walk(path.join(spec.repo, "plugins/token-efficient"), "plugins/token-efficient").filter(f => /\.(?:ts|tsx)$/.test(f) && !f.includes("/test/fixtures/")),
    ...walk(path.join(spec.repo, "scripts"), "scripts").filter(f => f.endsWith(".mjs")),
    ...walk(path.join(spec.repo, "benchmarks"), "benchmarks").filter(f => f.endsWith(".mjs") && (f.split("/").length === 2 || f.startsWith("benchmarks/lib/") || f.startsWith("benchmarks/stages/"))),
    ...walk(path.join(spec.repo, "benchmarks/stages"), "benchmarks/stages").filter(f => f.endsWith(".ts"))].sort()
}

const verify = process.argv.includes("--verify")
const manifest = verify ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : { schemaVersion: 1, snapshotRoot: path.relative(root, outputRoot), repositories: [] }
if (verify) {
  for (const recorded of manifest.repositories) {
    const files = []
    for (const file of recorded.files) {
      const target = path.join(outputRoot, recorded.name, file.path)
      if (!fs.existsSync(target)) throw new Error(`Snapshot missing: ${target}`)
      const bytes = fs.readFileSync(target)
      if (bytes.length !== file.bytes || sha(bytes) !== file.sha256) throw new Error(`Snapshot differs: ${target}`)
      files.push(file)
    }
    const treeSha256 = sha(files.map(f => `${f.path}\0${f.sha256}\n`).join(""))
    if (treeSha256 !== recorded.treeSha256) throw new Error(`Tree differs: ${recorded.name}`)
  }
  console.log(JSON.stringify(manifest.repositories.map(({ name, fileCount, totalBytes, treeSha256 }) => ({ name, fileCount, totalBytes, treeSha256 }))))
  process.exit(0)
}
for (const spec of specs) {
  if (!fs.existsSync(spec.repo)) throw new Error(`Missing repository: ${spec.repo}`)
  const files = []
  for (const rel of paths(spec)) {
    const source = path.join(spec.repo, rel)
    if (!fs.lstatSync(source).isFile()) throw new Error(`Non-file: ${source}`)
    const bytes = fs.readFileSync(source)
    if (bytes.includes(0)) throw new Error(`Binary file: ${source}`)
    const target = path.join(outputRoot, spec.name, rel)
    fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes)
    if (!fs.existsSync(target) || sha(fs.readFileSync(target)) !== sha(bytes)) throw new Error(`Snapshot differs: ${rel}`)
    files.push({ path: rel, bytes: bytes.length, sha256: sha(bytes) })
  }
  const treeSha256 = sha(files.map(f => `${f.path}\0${f.sha256}\n`).join(""))
  manifest.repositories.push({ name: spec.name, root: spec.repo, head: git(spec.repo, ["rev-parse", "HEAD"]),
    dirtyPaths: git(spec.repo, ["status", "--short"]).split("\n").filter(Boolean).map(s => s.slice(3)).sort(),
    includeRules: spec.included, excludeRules: spec.excluded,
    fileCount: files.length, totalBytes: files.reduce((sum, file) => sum + file.bytes, 0), treeSha256, files })
}
fs.mkdirSync(path.dirname(manifestPath), { recursive: true }); fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n")
console.log(JSON.stringify(manifest.repositories.map(({ name, fileCount, totalBytes, treeSha256 }) => ({ name, fileCount, totalBytes, treeSha256 }))))
