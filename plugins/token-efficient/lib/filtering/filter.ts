import fs from "node:fs"
import type { Store } from "../store"
import { classifyCommand } from "./classify"
import type { FilteringConfig } from "./config"
import { parseOutput } from "./parsers"
import type { Evidence, FailureCard } from "./parsers"
import { rawStoreRoot, saveRawOutput } from "./raw-store"
import { previewSource, previewView } from "./preview"

export interface FilterOutcome {
  filtered: string
  reason: string
  bytesBefore: number
  bytesAfter: number
  omittedLines: number
  ref: string
}

export interface FilterToolOutputInput {
  tool: string
  command: string
  output: string
  sessionID: string
  config: FilteringConfig
  store: Store
  rawDir?: string
  metadata?: Record<string, unknown>
}

const EXIT_KEYS = ["exit", "exitCode", "code", "status"]

function exitFromMetadata(metadata: Record<string, unknown> | undefined): number | null {
  if (!metadata || typeof metadata !== "object") return null
  for (const k of EXIT_KEYS) {
    const v = metadata[k]
    if (typeof v === "number" && Number.isFinite(v)) return v
  }
  return null
}

function resolveFullLog(
  metadata: Record<string, unknown> | undefined,
  fallback: string,
  maxBytes: number,
): { text: string; outputPath?: string } {
  try {
    const p = metadata?.outputPath
    if (typeof p === "string" && p.trim()) {
      const st = fs.statSync(p)
      if (st.isFile() && st.size > 0 && st.size <= maxBytes) {
        return { text: fs.readFileSync(p, "utf8"), outputPath: p }
      }
      return { text: fallback, outputPath: p }
    }
  } catch {}
  return { text: fallback }
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`
}

function section(header: string, items: string[]): string {
  if (items.length === 0) return ""
  return `${header}\n${items.map((x) => `- ${x}`).join("\n")}\n`
}

function cardLines(c: FailureCard): string[] {
  const out = [`- ${c.name}`]
  if (c.actual !== undefined || c.expected !== undefined) {
    const parts: string[] = []
    if (c.actual !== undefined) parts.push(`got: ${c.actual}`)
    if (c.expected !== undefined) parts.push(`want: ${c.expected}`)
    if (c.operator !== undefined) parts.push(`(${c.operator})`)
    out.push(`  ${parts.join(" ")}`)
  }
  if (c.code !== undefined) out.push(`  code: ${c.code}`)
  if (c.message) {
    for (const ml of c.message.split("\n")) out.push(`  ${ml}`)
  }
  if (c.location) out.push(`  at ${c.location}`)
  return out
}

function pointers(ref: string, outputPath?: string, omitted?: number): string {
  const lines: string[] = []
  if (omitted !== undefined) lines.push(`[${omitted} lines omitted — full output: openrelay_raw_output ref=${ref}]`)
  else lines.push(`[full output: openrelay_raw_output ref=${ref}]`)
  if (outputPath) lines.push(`[harness log: ${outputPath}]`)
  return lines.join("\n")
}

function buildFailureView(
  command: string,
  ev: Evidence,
  ref: string,
  omittedLines: number,
  outputPath?: string,
): string {
  const parts: string[] = []
  parts.push(`command: ${truncate(command, 200)}`)
  if (ev.summary) parts.push(`result: ${ev.summary}`)
  if (ev.cards.length > 0) {
    parts.push(`failures (${ev.cards.length}):`)
    for (const c of ev.cards.slice(0, 5)) parts.push(...cardLines(c))
  } else {
    const body =
      section("failures:", ev.failures) +
      section("errors:", ev.errors.slice(0, 20)) +
      section("files:", ev.fileRefs) +
      section("stack:", ev.stackFrames.slice(0, 10)) +
      section("context:", ev.context.slice(0, 20))
    if (body) parts.push(body.trimEnd())
  }
  parts.push(pointers(ref, outputPath, omittedLines))
  return parts.filter((p) => p !== "").join("\n")
}

function buildPassView(command: string, summary: string, ref: string, outputPath?: string): string {
  const parts: string[] = []
  parts.push(`command: ${truncate(command, 200)}`)
  parts.push(`result: PASS (exit 0)${summary ? ` — ${truncate(summary, 200)}` : ""}`)
  parts.push(pointers(ref, outputPath))
  return parts.join("\n")
}

function lineCount(text: string): number {
  const n = text.split("\n").length
  return text.endsWith("\n") ? n - 1 : n
}

export function sanitizeFilterMetadata(metadata: unknown): Record<string, unknown> {
  try {
    if (!metadata || typeof metadata !== "object") return {}
    const m = { ...(metadata as Record<string, unknown>) }
    delete m.output
    return m
  } catch {
    return {}
  }
}

export function filterToolOutput(input: FilterToolOutputInput): Promise<FilterOutcome | null> | FilterOutcome | null {
  return (async (): Promise<FilterOutcome | null> => {
    try {
      const { config } = input
      if (!config || config.enabled !== true) return null
      if (input.tool !== "bash") return null
      if (typeof input.output !== "string" || typeof input.command !== "string") return null
      const sessionID = input.sessionID
      if (typeof sessionID !== "string" || sessionID === "") return null

      const bytesBefore = Buffer.byteLength(input.output)
      if (!Number.isFinite(bytesBefore) || bytesBefore < config.minBytes) return null

      const cls = classifyCommand(input.command)
      if (!cls) return null

      const exit = exitFromMetadata(input.metadata)
      if (config.previewSafe) {
        const source = previewSource(input.metadata, input.output, config.maxBytesPerResult)
        if (source === null) return null
        const view = previewView(source, input.command, exit)
        // Include the reference overhead when deciding whether this is actually shorter.
        if (!view || Buffer.byteLength(view) + 256 >= bytesBefore) return null
        const ref = saveRawOutput({ sessionID, content: source, dir: input.rawDir ?? rawStoreRoot(),
          maxBytesPerResult: config.maxBytesPerResult, maxBytesPerSession: config.maxBytesPerSession })
        if (!ref) return null
        const hostPointer = input.output.split("\n").find(l => l.includes("Full output saved to:"))
        const filtered = `${view}\n[full output: openrelay_raw_output ref=${ref}]${hostPointer ? `\n${hostPointer}` : ""}`
        if (Buffer.byteLength(filtered) >= bytesBefore) return null
        return finish(input, "node-test:v2", bytesBefore, filtered, Math.max(0, lineCount(source) - lineCount(view)), ref)
      }
      if (cls.compound && (cls.unknownParts ?? 0) > 0 && exit !== 0) return null

      const full = resolveFullLog(input.metadata, input.output, config.maxBytesPerResult)
      const ev = parseOutput(cls.family, cls.reason, full.text)
      const total = lineCount(full.text)

      if (exit === 0) {
        if (ev && (ev.cards.length > 0 || ev.failures.length > 0)) return null
        const ref = saveRawOutput({
          sessionID,
          content: full.text,
          dir: input.rawDir ?? rawStoreRoot(),
          maxBytesPerResult: config.maxBytesPerResult,
          maxBytesPerSession: config.maxBytesPerSession,
        })
        if (!ref) return null
        const filtered = buildPassView(input.command, ev?.summary ?? "", ref, full.outputPath)
        return finish(input, cls.reason, bytesBefore, filtered, total, ref)
      }

      if (!ev) return null
      const hasEvidence = ev.cards.length > 0 || ev.failures.length > 0 || ev.errors.length > 0
      if (!hasEvidence) return null

      const ref = saveRawOutput({
        sessionID,
        content: full.text,
        dir: input.rawDir ?? rawStoreRoot(),
        maxBytesPerResult: config.maxBytesPerResult,
        maxBytesPerSession: config.maxBytesPerSession,
      })
      if (!ref) return null
      const filtered = buildFailureView(input.command, ev, ref, ev.omittedLines, full.outputPath)
      return finish(input, cls.reason, bytesBefore, filtered, ev.omittedLines, ref)
    } catch {
      return null
    }
  })()
}

function finish(
  input: FilterToolOutputInput,
  reason: string,
  bytesBefore: number,
  filtered: string,
  omittedLines: number,
  ref: string,
): FilterOutcome | null {
  const bytesAfter = Buffer.byteLength(filtered)
  const ratio = bytesAfter / bytesBefore
  try {
    input.store.event(
      "tool.filtered",
      {
        tool: "bash",
        reason,
        bytesBefore,
        bytesAfter,
        ratio,
        omittedLines,
        ref,
      },
      input.sessionID,
    )
  } catch {
    return null
  }
  return { filtered, reason, bytesBefore, bytesAfter, omittedLines, ref }
}
