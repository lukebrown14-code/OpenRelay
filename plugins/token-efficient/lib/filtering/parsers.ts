import { KNOWN_REASONS } from "./classify"
import type { FilterFamily } from "./classify"

export interface FailureCard {
  name: string
  expected?: string
  actual?: string
  operator?: string
  code?: string
  message?: string
  location?: string
}

export interface Evidence {
  summary: string
  failures: string[]
  errors: string[]
  fileRefs: string[]
  stackFrames: string[]
  context: string[]
  omittedLines: number
  cards: FailureCard[]
}

const REASON_RE = /^[a-z0-9-]+:v\d+$/
const ANSI_RE = /\u001b\[[0-9;]*[A-Za-z]|\u001b[@-_]/g
const NOISE_RE = /node_modules|node:internal/
const EXT = "tsx|ts|mts|cts|jsx|js|mjs|cjs|json|py|pyi|rs|go|rb|java|kt|php|c|h|cc|cpp|hpp|cs|swift|scala"
const PATH_RE = new RegExp(`(?:\\.{1,2}/|/|[A-Za-z]:[\\\\/])?(?:[\\w@.-]+[\\\\/])*[\\w@.-]+\\.(?:${EXT})(?::\\d+(?::\\d+)?)?`, "g")
const FRAME_RE = new RegExp(`(?:\\.{1,2}/|/)?(?:[\\w@.-]+[\\\\/])*[\\w@.-]+\\.(?:tsx|ts|mts|cts|jsx|js|mjs|cjs|py|rs|go):\\d+:\\d+`, "g")
const CODEFRAME_RE = /^[>|│]?\s*\d+\s*[|│]/
const CODEFRAME2_RE = /^[|│]/

interface Scan {
  summary: string[]
  failures: string[]
  errors: string[]
  refs: Set<string>
  frames: Set<string>
  context: string[]
  represented: Set<number>
  recognized: boolean
  cards: FailureCard[]
}

function newScan(): Scan {
  return { summary: [], failures: [], errors: [], refs: new Set(), frames: new Set(), context: [], represented: new Set(), recognized: false, cards: [] }
}

function add(list: string[], value: string): void {
  if (!list.includes(value)) list.push(value)
}

function normalize(text: string): string {
  return text.replace(ANSI_RE, "").replace(/\r\n?/g, "\n")
}

function harvest(s: Scan, i: number, line: string): void {
  let hit = false
  for (const m of line.matchAll(PATH_RE)) {
    if (NOISE_RE.test(m[0])) continue
    s.refs.add(m[0])
    hit = true
  }
  for (const m of line.matchAll(FRAME_RE)) {
    if (NOISE_RE.test(m[0])) continue
    s.frames.add(m[0])
    hit = true
  }
  if (hit) s.represented.add(i)
}

function stripTiming(name: string): string {
  return name.replace(/\s+\[[\d.]+ms\]$/, "").replace(/\s+\([\d.]+ms\)$/, "").replace(/\s+[\d.]+ms$/, "")
}

function continuation(s: Scan, lines: string[], i: number): void {
  let taken = 0
  for (let j = i + 1; j < lines.length && j <= i + 8 && taken < 4; j++) {
    const t = lines[j].trim()
    if (!t) continue
    if (/^(?:at\s|node:internal)/.test(t) || NOISE_RE.test(t)) break
    if (CODEFRAME_RE.test(t) || CODEFRAME2_RE.test(t)) add(s.context, t)
    else add(s.errors, t)
    s.represented.add(j)
    taken++
  }
}

function capture(s: Scan, i: number, t: string): void {
  add(s.errors, t)
  s.represented.add(i)
  s.recognized = true
}

function tapIndent(line: string): number {
  return line.length - line.trimStart().length
}

function unquote(v: string): string {
  const t = v.trim()
  if (t.length >= 2 && ((t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"')))) return t.slice(1, -1)
  return t
}

function tapYamlCard(name: string, lines: string[], start: number): { card: FailureCard; consumed: number } {
  const card: FailureCard = { name: stripTiming(name) }
  let j = start + 1
  if (j >= lines.length || lines[j].trim() !== "---") return { card, consumed: 0 }
  const base = tapIndent(lines[j])
  j++
  let block: "error" | "stack" | null = null
  const message: string[] = []
  const frames: string[] = []
  for (; j < lines.length; j++) {
    const raw = lines[j]
    const t = raw.trim()
    if (t === "..." || t === "---") {
      j++
      break
    }
    if (t === "") {
      if (block === "error") message.push("")
      continue
    }
    const indent = tapIndent(raw)
    if (indent > base) {
      if (block === "error") message.push(t)
      else if (block === "stack") frames.push(t)
      continue
    }
    block = null
    const kv = /^([A-Za-z_][\w]*):\s*(.*)$/.exec(raw.slice(base))
    if (!kv) continue
    const key = kv[1]
    const val = unquote(kv[2] ?? "")
    if (!val && key !== "error" && key !== "stack") continue
    if (key === "error" || key === "stack") {
      block = key
      if (val && val !== "|-" && val !== "|" && val !== "|+") message.push(val)
    } else if (key === "expected") card.expected = val
    else if (key === "actual") card.actual = val
    else if (key === "operator") card.operator = val
    else if (key === "code") card.code = val
    else if ((key === "location" || key === "at") && !card.location) card.location = val
  }
  while (message.length > 0 && message[message.length - 1] === "") message.pop()
  if (message.length > 0) card.message = message.join("\n")
  if (!card.location) card.location = frames.find((f) => !NOISE_RE.test(f)) ?? frames[0]
  return { card, consumed: j - 1 - start }
}

function parseTest(lines: string[]): Scan | null {
  const s = newScan()
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim()
    if (!t) continue

    if (/^(?:test files|tests?):\s+\S/i.test(t) || /^(?:test files|tests?)\s{2,}\S/i.test(t) || /^test suites:\s+\S/i.test(t)) {
      add(s.summary, t)
      s.represented.add(i)
      s.recognized = true
    } else if (/^\d+\s+(?:passing|failing|pending)\b/.test(t)) {
      add(s.summary, t)
      s.represented.add(i)
      s.recognized = true
    } else if (/^ℹ\s+(?:tests?|pass|fail)\s+\d+/.test(t)) {
      add(s.summary, t)
      s.represented.add(i)
      s.recognized = true
    } else if (/^#\s+(?:tests?|pass|fail|suites?|cancelled|skipped|todo)\s+\d+/i.test(t)) {
      add(s.summary, t)
      s.represented.add(i)
      s.recognized = true
    } else if (/^TAP version \d+$/i.test(t)) {
      s.recognized = true
    } else if (/^\d+\s+(?:pass|fail)\b/.test(t)) {
      add(s.summary, t)
      s.represented.add(i)
      s.recognized = true
    } else if (/^=+.*=+$/.test(t)) {
      s.recognized = true
      const inner = t.replace(/^=+/, "").replace(/=+$/, "").trim()
      if (inner && /\d+\s+(?:failed|passed|error)/.test(inner)) {
        add(s.summary, inner)
        s.represented.add(i)
      }
    } else if (/^collected \d+ items/.test(t)) {
      s.recognized = true
    }

    let name: string | null = null
    const notOk = /^not ok \d+\s*-\s*(.+)$/.exec(t)
    if (notOk) {
      s.recognized = true
      const { card, consumed } = tapYamlCard(notOk[1], lines, i)
      s.cards.push(card)
      add(s.failures, card.name)
      s.represented.add(i)
      if (card.message) {
        for (const ml of card.message.split("\n")) add(s.errors, ml)
      }
      if (card.actual && card.expected) add(s.errors, `${card.actual} !== ${card.expected}`)
      if (consumed > 0) {
        for (let k = i + 1; k <= i + consumed; k++) {
          s.represented.add(k)
          harvest(s, k, lines[k])
        }
        if (card.location && !NOISE_RE.test(card.location)) harvest(s, i, card.location)
        i += consumed
        continue
      }
    }
    let m = /^[×✗✘✖]\s+(.+)$/.exec(t)
    if (m) name = stripTiming(m[1])
    if (!name) {
      m = /●\s*(.+)$/.exec(t)
      if (m) name = m[1]
    }
    if (!name) {
      m = /^FAIL\s+(.+)$/i.exec(t)
      if (m) name = m[1]
    }
    if (!name) {
      m = /^_{5,}\s*(\S+)\s*_{5,}$/.exec(t)
      if (m) name = m[1]
    }
    if (!name) {
      m = /^FAILED\s+(\S+)/.exec(t)
      if (m) {
        name = m[1]
        capture(s, i, t)
      }
    }
    if (!name) {
      m = /^\d+\)\s+(.+)$/.exec(t)
      if (m) {
        name = m[1]
        const next = (lines[i + 1] ?? "").trim()
        const d = /^\s{4,}(.+):\s*$/.exec((lines[i + 1] ?? ""))
        if (d && next) {
          add(s.failures, d[1].trim())
          s.represented.add(i + 1)
        }
      }
    }
    if (name) {
      add(s.failures, stripTiming(name.trim()))
      s.represented.add(i)
    }

    m = /^E\s{2,}(.+)$/.exec(t)
    if (m) {
      add(s.errors, m[1].trim())
      s.represented.add(i)
    }
    if (/^[A-Za-z_$][\w$]*(?:Error|Exception)\b/.test(t)) {
      capture(s, i, t)
      continuation(s, lines, i)
    } else if (/expect\(received\)|^error:|^(?:Expected|Received):/.test(t)) {
      capture(s, i, t)
      if (/expect\(received\)|^error:/.test(t)) continuation(s, lines, i)
    }

    if (/^>\s/.test(t) && !CODEFRAME_RE.test(t)) {
      add(s.context, t)
      s.represented.add(i)
    } else if (CODEFRAME_RE.test(t) || CODEFRAME2_RE.test(t)) {
      add(s.context, t)
      s.represented.add(i)
    }

    harvest(s, i, lines[i])
  }
  return s.recognized && s.summary.length > 0 ? s : null
}

function parseTypecheck(lines: string[]): Scan | null {
  const s = newScan()
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim()
    if (!t) continue
    if (/^\S+\.(?:tsx?|jsx?|mts|cts)\(\d+,\d+\):\s+(?:error|warning)\s+(?:TS|JS)\d+:/.test(t)) {
      capture(s, i, t)
    } else if (/^\S+:\d+:\d+\s+-\s+(?:error|warning)\b/.test(t)) {
      capture(s, i, t)
    } else if (/^\S+:\d+:\s+(?:error|note):\s+/.test(t)) {
      capture(s, i, t)
    } else if (/^(?:Found \d+ errors?|No problems? found|\d+ errors?, \d+ warnings?)/i.test(t)) {
      add(s.summary, t)
      s.represented.add(i)
      s.recognized = true
    }
    harvest(s, i, lines[i])
  }
  return s.recognized ? s : null
}

function parseLint(lines: string[]): Scan | null {
  const s = newScan()
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim()
    if (!t) continue
    if (/^\d+:\d+\s+(?:error|warning)\s+\S/.test(t)) {
      capture(s, i, t)
    } else if (/^\S+:\d+:\d+:\s+\S/.test(t)) {
      capture(s, i, t)
    } else if (/^\S+:\d+:\d+\s+lint\/\S+/.test(t)) {
      capture(s, i, t)
    } else if (/^✖\s*(.+)$/.test(t)) {
      if (/\d+\s+problems?/.test(t)) {
        add(s.summary, t)
        s.represented.add(i)
        s.recognized = true
      } else {
        capture(s, i, t)
      }
    } else if (/^(?:Found \d+ errors?\.?|\d+ issues?:)\s*$/.test(t)) {
      add(s.summary, t)
      s.represented.add(i)
      s.recognized = true
    }
    harvest(s, i, lines[i])
  }
  return s.recognized ? s : null
}

function parseBuild(lines: string[]): Scan | null {
  const s = newScan()
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim()
    if (!t) continue
    if (/^error(?:\[E\d+\])?:\s*/.test(t)) {
      capture(s, i, t)
    } else if (/^\S+?\.(?:go|rs):\d+:\d+:\s+\S/.test(t)) {
      capture(s, i, t)
    } else if (/failed to (?:resolve|compile)|error during build|compilation failed|could not compile/i.test(t)) {
      capture(s, i, t)
    } else if (/^✗\s+/.test(t)) {
      capture(s, i, t)
    } else if (/^[|│]/.test(t) || CODEFRAME_RE.test(t) || /^[_^~]+[|│]/.test(t)) {
      if (/\S/.test(t.slice(1))) {
        add(s.context, t)
        s.represented.add(i)
      }
    } else if (/^=\s+(?:note|help):/i.test(t)) {
      add(s.context, t)
      s.represented.add(i)
    } else if (/^#\s+\S/.test(t)) {
      add(s.context, t)
      s.represented.add(i)
    } else if (/^(?:Finished|Done in|✓ built in|Build complete|built in)\b/i.test(t)) {
      add(s.summary, t)
      s.represented.add(i)
      s.recognized = true
    }
    harvest(s, i, lines[i])
  }
  if (!s.recognized) return null
  if (s.summary.length === 0) {
    add(s.summary, s.errors.length > 0 ? `build failed: ${s.errors.length} error(s)` : "build completed")
  }
  return s
}

export function parseOutput(family: FilterFamily, reason: string, text: string): Evidence | null {
  if (typeof reason !== "string" || !REASON_RE.test(reason)) return null
  if (!KNOWN_REASONS.includes(reason)) return null
  if (typeof text !== "string" || text.trim() === "") return null
  const clean = normalize(text)
  if (clean.trim() === "") return null
  const lines = clean.split("\n")
  const total = lines.length - (clean.endsWith("\n") ? 1 : 0)
  const scan =
    family === "test"
      ? parseTest(lines)
      : family === "typecheck"
        ? parseTypecheck(lines)
        : family === "lint"
          ? parseLint(lines)
          : parseBuild(lines)
  if (!scan) return null
  return {
    summary: scan.summary.join(" | "),
    failures: scan.failures,
    errors: scan.errors,
    fileRefs: [...scan.refs],
    stackFrames: [...scan.frames],
    context: scan.context,
    omittedLines: Math.max(0, total - scan.represented.size),
    cards: scan.cards,
  }
}
