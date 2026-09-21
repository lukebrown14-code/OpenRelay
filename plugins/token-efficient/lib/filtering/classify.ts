export type FilterFamily = "test" | "typecheck" | "lint" | "build"

export interface CommandClass {
  reason: string
  family: FilterFamily
  compound?: boolean
  unknownParts?: number
}

const FAMILY_PRIORITY: Record<FilterFamily, number> = { test: 0, typecheck: 1, lint: 2, build: 3 }

export const KNOWN_REASONS: readonly string[] = [
  "vitest:v1",
  "jest:v1",
  "mocha:v1",
  "pytest:v1",
  "node-test:v1",
  "bun-test:v1",
  "npm-test:v1",
  "tsc:v1",
  "typecheck-script:v1",
  "pyright:v1",
  "mypy:v1",
  "eslint:v1",
  "biome:v1",
  "ruff:v1",
  "golangci-lint:v1",
  "npm-build:v1",
  "cargo-build:v1",
  "go-build:v1",
]

const ENV_PREFIX = /^\s*[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|[^\s]*)\s+/
const CD_PREFIX = /^\s*cd\s+(?:"[^"]*"|'[^']*'|[^&;|]+?)\s*&&\s+/

function stripPrefixes(command: string): string {
  let s = command.trim()
  for (;;) {
    const before = s
    let m = ENV_PREFIX.exec(s)
    while (m) {
      s = s.slice(m[0].length)
      m = ENV_PREFIX.exec(s)
    }
    m = CD_PREFIX.exec(s)
    if (m) s = s.slice(m[0].length)
    if (s === before) break
  }
  return s.trim()
}

function unsafe(s: string): boolean {
  if (/[;&|<>`]|\$\(/.test(s)) return true
  if (/\b(?:rm|mkfs|dd|shutdown|reboot|curl|wget)\b/i.test(s)) return true
  return false
}

function splitTopLevel(s: string): string[] | null {
  const parts: string[] = []
  let cur = ""
  let quote: string | null = null
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (quote) {
      cur += ch
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      cur += ch
      continue
    }
    if (ch === ";" || (ch === "&" && s[i + 1] === "&") || (ch === "|" && s[i + 1] === "|")) {
      parts.push(cur)
      cur = ""
      if (ch !== ";") i++
      continue
    }
    if (ch === "&" || ch === "|") return null
    cur += ch
  }
  parts.push(cur)
  return parts
}

function classifySingle(rest: string): CommandClass | null {
  const c = rest.toLowerCase()

  if (/\bvitest\b/.test(c)) return { reason: "vitest:v1", family: "test" }
  if (/\bjest\b/.test(c)) return { reason: "jest:v1", family: "test" }
  if (/\bmocha\b/.test(c)) return { reason: "mocha:v1", family: "test" }
  if (/\bpy\.?test\b/.test(c)) return { reason: "pytest:v1", family: "test" }
  if (/^node\s+--test\b/.test(c)) return { reason: "node-test:v1", family: "test" }
  if (/^bun\s+(?:run\s+)?test\b/.test(c)) return { reason: "bun-test:v1", family: "test" }
  if (/^(?:npm|yarn|pnpm)\s+(?:run\s+)?test\b/.test(c)) return { reason: "npm-test:v1", family: "test" }

  if (/\btsc\b/.test(c)) return { reason: "tsc:v1", family: "typecheck" }
  if (/^(?:npm|yarn|pnpm|bun)\s+run\s+typecheck\b/.test(c)) return { reason: "typecheck-script:v1", family: "typecheck" }
  if (/\bpyright\b/.test(c)) return { reason: "pyright:v1", family: "typecheck" }
  if (/\bmypy\b/.test(c)) return { reason: "mypy:v1", family: "typecheck" }

  if (/\beslint\b/.test(c)) return { reason: "eslint:v1", family: "lint" }
  if (/\bbiome\b/.test(c)) return { reason: "biome:v1", family: "lint" }
  if (/\bruff\b/.test(c)) return { reason: "ruff:v1", family: "lint" }
  if ((/\bgolangci-lint\b/.test(c))) return { reason: "golangci-lint:v1", family: "lint" }

  if (/^(?:npm|yarn|pnpm|bun)\s+(?:run\s+)?build\b/.test(c)) return { reason: "npm-build:v1", family: "build" }
  if (/\bcargo\s+build\b/.test(c)) return { reason: "cargo-build:v1", family: "build" }
  if (/\bgo\s+build\b/.test(c)) return { reason: "go-build:v1", family: "build" }

  return null
}

export function classifyCommand(command: string): CommandClass | null {
  if (typeof command !== "string" || command.trim() === "") return null
  const rest = stripPrefixes(command)
  if (rest === "") return null
  const parts = splitTopLevel(rest)
  if (!parts || parts.length === 0) return null
  if (parts.length === 1) {
    const t = parts[0].trim()
    if (t === "" || unsafe(t)) return null
    const c = classifySingle(t)
    return c ? { ...c, compound: false, unknownParts: 0 } : null
  }
  let best: CommandClass | null = null
  let unknown = 0
  for (const p of parts) {
    const t = stripPrefixes(p)
    if (t === "" || unsafe(t)) return null
    const c = classifySingle(t)
    if (c) {
      if (!best || FAMILY_PRIORITY[c.family] < FAMILY_PRIORITY[best.family]) best = c
    } else if (!/^cd\s/.test(t)) {
      unknown++
    }
  }
  if (!best) return null
  return { ...best, compound: true, unknownParts: unknown }
}
