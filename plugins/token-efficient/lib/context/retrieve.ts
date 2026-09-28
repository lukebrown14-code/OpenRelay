import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

export type GitEvidence = {
  branch?: string
  dirtyFiles: string[]
  dirty: boolean
}

export type Excerpt = {
  file: string
  startLine: number
  endLine: number
  content: string
  hash: string
  truncated: boolean
  source: "path" | "match" | "rank"
  matches?: number
}

export type Evidence = {
  git: GitEvidence | null
  excerpts: Excerpt[]
  searchedPatterns: string[]
  omitted: string[]
  prepMs: number
}

export type ProbeResult = {
  /** Existing, safe, source-like files explicitly named by the request (test/harness files excluded). */
  namedSources: string[]
  /** Ranked search candidates: every matched file minus named sources, harness and test files. */
  candidates: { file: string; count: number; pattern: string }[]
  patterns: string[]
  /** hit = some pattern matched; absent = all verified empty; error = rg failed (verdict fails open). */
  status: "hit" | "absent" | "error"
  prepMs: number
}

const RG_GLOBS = ["!.git", "!node_modules"]
const MAX_FILE_BYTES = 512 * 1024
const HARNESS_BASENAMES = new Set([
  "TASK.md",
  "ground-truth.json",
  "setup.mjs",
  "meta.json",
  "package.json",
  "package-lock.json",
  "bun.lock",
])
const TEST_FILE_RE = /(^|\/)(verify\.js|[^/]+\.(?:test|spec)\.[cm]?[tj]sx?)$/
const TEST_DIR_SEGMENTS = new Set(["test", "tests", "__tests__", "spec", "specs"])
const IGNORED_DIRS = new Set(["node_modules", "dist", "build", ".next", "coverage"])

function isSafeRelative(rel: string): boolean {
  if (!rel || path.isAbsolute(rel)) return false
  const parts = rel.split(/[\\/]/)
  if (parts.some((p) => p === "..")) return false
  if (parts.some((p) => IGNORED_DIRS.has(p))) return false
  // Search-discovered dotfiles are denied (`.env` must never ride the system prompt);
  // explicitly user-named paths bypass this but are realpath-confined at read time.
  if (parts.some((p) => p.startsWith("."))) return false
  return true
}

function isHarnessFile(rel: string): boolean {
  return HARNESS_BASENAMES.has(path.basename(rel))
}

function isTestFile(rel: string): boolean {
  const parts = rel.split(/[\\/]/)
  if (parts.length > 1 && parts.slice(0, -1).some((p) => TEST_DIR_SEGMENTS.has(p))) return true
  return TEST_FILE_RE.test(rel)
}

function sourceLike(rel: string): boolean {
  return isSafeRelative(rel) && !isHarnessFile(rel) && !isTestFile(rel)
}

type RgResult = { status: number; stdout: string }

function rg(cwd: string, args: string[]): RgResult {
  const r = spawnSync("rg", [...RG_GLOBS.flatMap((g) => ["--glob", g]), "--no-messages", "--hidden", "--sort", "path", ...args], {
    cwd,
    encoding: "utf8",
    timeout: 4000,
    maxBuffer: 2 * 1024 * 1024,
    stdio: ["ignore", "pipe", "ignore"],
  })
  return { status: r.status ?? 2, stdout: r.stdout ?? "" }
}

export function fnv1a(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, "0")
}

function normalizeText(s: string): string {
  return s.replace(/\r\n/g, "\n")
}

// Fixed-string counts per file in one spawn. Exit codes triaged: 0 = hit,
// 1 = verified absence, >=2 = rg failure (must fail open upstream).
function searchFixed(cwd: string, pattern: string, maxFiles: number): { status: number; files: { file: string; count: number }[] } {
  const r = rg(cwd, ["-c", "-F", "-e", pattern])
  if (r.status >= 2) return { status: r.status, files: [] }
  if (r.status === 1) return { status: 1, files: [] }
  const files: { file: string; count: number }[] = []
  for (const line of r.stdout.split("\n")) {
    const idx = line.lastIndexOf(":")
    if (idx <= 0) continue
    const file = line.slice(0, idx)
    const count = parseInt(line.slice(idx + 1), 10)
    if (isSafeRelative(file) && Number.isFinite(count)) files.push({ file, count })
  }
  files.sort((a, b) => (a.file < b.file ? -1 : 1))
  return { status: 0, files: files.slice(0, maxFiles) }
}

function matchLines(cwd: string, rel: string, pattern: string): number[] {
  const r = rg(cwd, ["-n", "-F", "-e", pattern, "--", rel])
  if (r.status !== 0) return []
  return r.stdout
    .split("\n")
    .filter(Boolean)
    .map((l) => parseInt(l.split(":")[0], 10))
    .filter((n) => Number.isFinite(n))
}

function gatherGit(cwd: string): GitEvidence | null {
  try {
    const branch = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd,
      encoding: "utf8",
      timeout: 2000,
      stdio: ["ignore", "pipe", "ignore"],
    })
    if (branch.status !== 0) return null
    const evidence: GitEvidence = { branch: branch.stdout.trim(), dirtyFiles: [], dirty: false }
    try {
      const status = spawnSync("git", ["status", "--porcelain"], {
        cwd,
        encoding: "utf8",
        timeout: 3000,
        maxBuffer: 1024 * 1024,
        stdio: ["ignore", "pipe", "ignore"],
      })
      if (status.status === 0 && status.stdout.trim()) {
        evidence.dirty = true
        evidence.dirtyFiles = status.stdout
          .split("\n")
          .filter(Boolean)
          .map((l) => l.slice(3).trim())
          .slice(0, 8)
      }
    } catch {}
    return evidence
  } catch {
    return null
  }
}

type LoadedFile = { text: string; lines: string[]; real: string } | { error: "too-big" | "binary" | "escape" | "unreadable" }

function loadFile(cwd: string, rel: string): LoadedFile {
  try {
    const abs = path.join(cwd, rel)
    let real: string
    try {
      real = fs.realpathSync(abs)
    } catch {
      return { error: "unreadable" }
    }
    const realRoot = fs.realpathSync(cwd)
    if (!real.startsWith(realRoot + path.sep) && real !== realRoot) return { error: "escape" }
    const stat = fs.statSync(real)
    if (!stat.isFile()) return { error: "unreadable" }
    if (stat.size > MAX_FILE_BYTES) return { error: "too-big" }
    const buf = fs.readFileSync(real)
    if (buf.subarray(0, 8192).includes(0)) return { error: "binary" }
    const text = normalizeText(buf.toString("utf8"))
    return { text, lines: text.split("\n"), real }
  } catch {
    return { error: "unreadable" }
  }
}

function renderLines(lines: string[], from: number, to: number): string {
  return lines
    .slice(from, to)
    .map((l, i) => `${from + i + 1}| ${l}`)
    .join("\n")
}

type ExcerptOpts = {
  matches?: number
  requestText?: string
  echoes?: string[]
}

function readExcerpt(cwd: string, rel: string, budget: number, source: Excerpt["source"], opts: ExcerptOpts = {}): Excerpt | null {
  const loaded = loadFile(cwd, rel)
  if ("error" in loaded) {
    // An explicitly named file that is simply too large still gets a head window —
    // silently dropping the requested file is worse than truncating it.
    if (loaded.error === "too-big" && source === "path") {
      try {
        const raw = normalizeText(fs.readFileSync(path.join(cwd, rel)).toString("utf8"))
        if (opts.requestText && normalizeText(opts.requestText).trim() === raw.trim()) {
          opts.echoes?.push(rel)
          return null
        }
        if (raw.includes("\0")) return null
        const lines = raw.split("\n")
        const content = renderLines(lines, 0, Math.max(1, Math.floor(budget / 80)))
        return {
          file: rel,
          startLine: 1,
          endLine: Math.max(1, Math.floor(budget / 80)),
          content: `${content}\n… (large file, ${lines.length} lines — head only)`,
          hash: fnv1a(raw),
          truncated: true,
          source,
          matches: opts.matches,
        }
      } catch {
        return null
      }
    }
    return null
  }
  if (opts.requestText && normalizeText(opts.requestText).trim() === loaded.text.trim()) {
    opts.echoes?.push(rel)
    return null
  }

  const numbered = loaded.lines.map((l, i) => `${i + 1}| ${l}`)
  const fits = (from: number, to: number) => numbered.slice(from, to).join("\n").length
  let start = 0
  let end = numbered.length
  let truncated = false
  if (fits(start, end) > budget) {
    truncated = true
    let used = 0
    end = start
    for (let i = start; i < numbered.length; i++) {
      const lineLen = numbered[i].length + 1
      if (lineLen > budget) continue
      if (used + lineLen > budget) break
      end = i + 1
      used += lineLen
    }
    if (end <= start) return null
  }
  return {
    file: rel,
    startLine: start + 1,
    endLine: end,
    content: renderLines(loaded.lines, start, end),
    hash: fnv1a(loaded.text),
    truncated,
    source,
    matches: opts.matches,
  }
}

function anchorExcerpt(cwd: string, rel: string, anchorLines: number[], budget: number, source: Excerpt["source"], opts: ExcerptOpts = {}): Excerpt | null {
  const loaded = loadFile(cwd, rel)
  if ("error" in loaded) return null
  if (opts.requestText && normalizeText(opts.requestText).trim() === loaded.text.trim()) {
    opts.echoes?.push(rel)
    return null
  }

  const numbered = loaded.lines.map((l, i) => `${i + 1}| ${l}`)
  const centers = [...new Set(anchorLines.map((n) => Math.min(Math.max(n - 1, 0), loaded.lines.length - 1)))]
  const chosen = new Set<number>()
  let used = 0
  for (const c of centers) {
    for (let d = 0; d <= 4; d++) {
      for (const i of d === 0 ? [c] : [c - d, c + d]) {
        if (i < 0 || i >= numbered.length || chosen.has(i)) continue
        const w = numbered[i].length + 1
        if (w > budget || used + w > budget) continue
        chosen.add(i)
        used += w
      }
    }
  }
  if (chosen.size === 0) return null
  const idx = [...chosen].sort((a, b) => a - b)
  const blocks: string[] = []
  let runStart = idx[0]
  let prev = idx[0]
  for (const i of idx.slice(1)) {
    if (i === prev + 1) {
      prev = i
      continue
    }
    blocks.push(numbered.slice(runStart, prev + 1).join("\n"))
    runStart = i
    prev = i
  }
  blocks.push(numbered.slice(runStart, prev + 1).join("\n"))
  const first = idx[0] + 1
  const last = idx[idx.length - 1] + 1
  return {
    file: rel,
    startLine: first,
    endLine: last,
    content: blocks.join("\n    …\n"),
    hash: fnv1a(loaded.text),
    truncated: chosen.size < numbered.length && idx.length < centers.length * 9,
    source,
    matches: opts.matches,
  }
}

export function probeEvidence(
  cwd: string,
  signals: { paths: string[]; quoted: string[]; errors: string[]; derived?: string[] },
  config: { rgMaxFilesPerPattern: number },
): ProbeResult {
  const started = Date.now()
  const namedSources: string[] = []
  for (const p of signals.paths) {
    const rel = p.replace(/^\.\//, "")
    if (!sourceLike(rel)) continue
    try {
      if (!fs.existsSync(path.join(cwd, rel))) continue
    } catch {
      continue
    }
    namedSources.push(rel)
  }

  const patterns: string[] = []
  for (const p of [...signals.quoted, ...signals.errors, ...(signals.derived ?? [])]) {
    if (p.length >= 3 && !patterns.includes(p)) patterns.push(p)
  }

  const byFile = new Map<string, { count: number; pattern: string }>()
  let sawHit = false
  let sawError = false
  for (const pattern of patterns) {
    const { status, files } = searchFixed(cwd, pattern, config.rgMaxFilesPerPattern)
    if (status >= 2) sawError = true
    if (status === 0) sawHit = true
    for (const f of files) {
      if (isHarnessFile(f.file) || isTestFile(f.file)) continue
      const prev = byFile.get(f.file)
      if (!prev) byFile.set(f.file, { count: f.count, pattern })
      else if (f.count > prev.count) byFile.set(f.file, { count: f.count, pattern })
    }
  }

  const candidates = [...byFile.entries()]
    .map(([file, v]) => ({ file, count: v.count, pattern: v.pattern }))
    .sort((a, b) => b.count - a.count || (a.file < b.file ? -1 : 1))

  return {
    namedSources,
    candidates,
    patterns,
    status: sawError ? "error" : sawHit ? "hit" : "absent",
    prepMs: Date.now() - started,
  }
}

export function verdictFor(probe: ProbeResult): { verdict: "build" | "skip"; reason: string } {
  if (probe.status === "error") return { verdict: "build", reason: "probe-error-fail-open" }
  const named = new Set(probe.namedSources)
  const fresh = probe.candidates.filter((c) => !named.has(c.file))
  if (fresh.length > 0) return { verdict: "build", reason: "new-candidates" }
  if (probe.namedSources.length >= 2) return { verdict: "build", reason: "cross-file-scope" }
  if (probe.namedSources.length === 0) return { verdict: "skip", reason: "redundant-candidates" }
  return { verdict: "skip", reason: "explicit-single-target" }
}

export function buildEvidence(
  cwd: string,
  probe: ProbeResult,
  signals: { paths: string[]; quoted: string[]; errors: string[]; derived?: string[] },
  config: { maxTotalBytes: number; maxFileExcerptBytes: number; maxFiles: number },
  requestText?: string,
): Evidence {
  const started = Date.now()
  const git = gatherGit(cwd)
  const excerpts: Excerpt[] = []
  const echoes: string[] = []
  let budgetLeft = config.maxTotalBytes

  const take = (ex: Excerpt | null) => {
    if (ex && excerpts.length < config.maxFiles && budgetLeft > 0) {
      excerpts.push(ex)
      budgetLeft -= ex.content.length
      return true
    }
    return false
  }

  // Explicit paths first (highest confidence), then probe candidates by rank.
  for (const rel of probe.namedSources) {
    if (excerpts.length >= config.maxFiles || budgetLeft <= 0) break
    take(readExcerpt(cwd, rel, Math.min(config.maxFileExcerptBytes, budgetLeft), "path", { requestText, echoes }))
  }
  for (const c of probe.candidates) {
    if (excerpts.length >= config.maxFiles || budgetLeft <= 0) break
    if (excerpts.some((e) => e.file === c.file)) continue
    const anchors = matchLines(cwd, c.file, c.pattern)
    const ex =
      anchors.length > 0
        ? anchorExcerpt(cwd, c.file, anchors, Math.min(config.maxFileExcerptBytes, budgetLeft), "match", {
            matches: c.count,
            requestText,
            echoes,
          })
        : readExcerpt(cwd, c.file, Math.min(config.maxFileExcerptBytes, budgetLeft), "rank", {
            matches: c.count,
            requestText,
            echoes,
          })
    take(ex)
  }

  const covered = new Set(excerpts.map((e) => e.file))
  const omitted = probe.candidates.map((c) => c.file).filter((f) => !covered.has(f)).slice(0, 10)
  for (const e of echoes) if (!omitted.includes(e) && omitted.length < 16) omitted.push(`${e} (request echo, omitted)`)
  return {
    git,
    excerpts,
    searchedPatterns: probe.patterns,
    omitted,
    prepMs: Date.now() - started,
  }
}

// Backwards-compatible composition: probe then build.
export function gatherEvidence(
  cwd: string,
  signals: { paths: string[]; quoted: string[]; errors: string[]; derived?: string[] },
  config: { maxTotalBytes: number; maxFileExcerptBytes: number; maxFiles: number; rgMaxFilesPerPattern: number; gitDiffBytes?: number },
  requestText?: string,
): Evidence {
  const probe = probeEvidence(cwd, signals, config)
  return buildEvidence(cwd, probe, signals, config, requestText)
}
