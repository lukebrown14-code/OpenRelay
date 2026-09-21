import { describe, expect, test } from "bun:test"
import { retrieveRaw } from "../tools/raw-output"

const ten = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join("\n")

describe("retrieveRaw: range mode", () => {
  test("is 1-indexed and inclusive on both ends", () => {
    const r = retrieveRaw(ten, { mode: "range", startLine: 2, endLine: 4 })
    expect(r.text.split("\n")).toEqual(["line 2", "line 3", "line 4"])
    expect(r.returnedLines).toBe(3)
    expect(r.totalLines).toBe(10)
    expect(r.returnedBytes).toBe(Buffer.byteLength(r.text))
    expect(r.hasMore).toBe(true)
    expect(r.nextStartLine).toBe(5)
  })

  test("with no range returns the whole text", () => {
    const r = retrieveRaw(ten, { mode: "range" })
    expect(r.text).toBe(ten)
    expect(r.returnedLines).toBe(10)
    expect(r.totalLines).toBe(10)
    expect(r.returnedBytes).toBe(Buffer.byteLength(ten))
    expect(r.hasMore).toBe(false)
    expect(r.nextStartLine).toBeUndefined()
  })

  test("explicit full range has no next page", () => {
    const r = retrieveRaw(ten, { mode: "range", startLine: 1, endLine: 10 })
    expect(r.text).toBe(ten)
    expect(r.returnedLines).toBe(10)
    expect(r.hasMore).toBe(false)
    expect(r.nextStartLine).toBeUndefined()
  })

  test("start beyond the end yields an empty page", () => {
    const r = retrieveRaw(ten, { mode: "range", startLine: 11 })
    expect(r.text).toBe("")
    expect(r.returnedLines).toBe(0)
    expect(r.returnedBytes).toBe(0)
    expect(r.hasMore).toBe(false)
  })

  test("negative start clamps to line 1", () => {
    const r = retrieveRaw(ten, { mode: "range", startLine: -3, endLine: 2 })
    expect(r.text.split("\n")).toEqual(["line 1", "line 2"])
    expect(r.returnedLines).toBe(2)
  })

  test("end beyond the total clamps to the last line", () => {
    const r = retrieveRaw(ten, { mode: "range", startLine: 8, endLine: 100 })
    expect(r.text.split("\n")).toEqual(["line 8", "line 9", "line 10"])
    expect(r.returnedLines).toBe(3)
    expect(r.hasMore).toBe(false)
    expect(r.nextStartLine).toBeUndefined()
  })
})

describe("retrieveRaw: search mode", () => {
  const twenty = Array.from({ length: 20 }, (_, i) => `row ${i + 1} ${i % 5 === 0 ? "needle" : "filler"}`).join("\n")

  test("is case-insensitive and applies context windows around matches", () => {
    const r = retrieveRaw(twenty, { mode: "search", query: "NEEDLE", context: 1 })
    expect(r.returnedLines).toBe(11)
    expect(r.text).toContain("row 1 needle")
    expect(r.text).toContain("row 6 needle")
    expect(r.text).toContain("row 11 needle")
    expect(r.text).toContain("row 16 needle")
    expect(r.text).not.toContain("row 3")
    expect(r.text).not.toContain("row 4")
    expect(r.totalLines).toBe(20)
    expect(r.returnedBytes).toBe(Buffer.byteLength(r.text))
    expect(r.hasMore).toBe(false)
  })

  test("merges overlapping context windows into one contiguous block", () => {
    const lines = Array.from({ length: 12 }, (_, i) => `row ${i + 1}`)
    lines[4] = "match A row 5"
    lines[6] = "match B row 7"
    const r = retrieveRaw(lines.join("\n"), { mode: "search", query: "match", context: 2 })
    expect(r.returnedLines).toBe(7)
    expect(r.text.split("\n")).toEqual(lines.slice(2, 9))
  })

  test("context 0 returns only the matching lines", () => {
    const r = retrieveRaw(twenty, { mode: "search", query: "needle", context: 0 })
    expect(r.returnedLines).toBe(4)
    expect(r.text.split("\n")).toEqual(["row 1 needle", "row 6 needle", "row 11 needle", "row 16 needle"])
  })

  test("no match yields an empty page", () => {
    const r = retrieveRaw(twenty, { mode: "search", query: "zzz-not-present", context: 3 })
    expect(r.text).toBe("")
    expect(r.returnedLines).toBe(0)
    expect(r.returnedBytes).toBe(0)
    expect(r.hasMore).toBe(false)
  })
})

describe("retrieveRaw: caps", () => {
  const fiveHundred = Array.from({ length: 500 }, (_, i) => `row ${i + 1}`).join("\n")

  test("caps at 200 lines per call with pagination metadata", () => {
    const p1 = retrieveRaw(fiveHundred, { mode: "range" })
    expect(p1.returnedLines).toBe(200)
    expect(p1.hasMore).toBe(true)
    expect(p1.nextStartLine).toBe(201)
    expect(p1.text.split("\n")).toEqual(Array.from({ length: 200 }, (_, i) => `row ${i + 1}`))

    const p2 = retrieveRaw(fiveHundred, { mode: "range", startLine: p1.nextStartLine })
    expect(p2.returnedLines).toBe(200)
    expect(p2.nextStartLine).toBe(401)

    const p3 = retrieveRaw(fiveHundred, { mode: "range", startLine: 401 })
    expect(p3.returnedLines).toBe(100)
    expect(p3.hasMore).toBe(false)
  })

  test("caps at 16 KiB without splitting lines", () => {
    const line = "x".repeat(99)
    const lines = Array.from({ length: 210 }, (_, i) => `${line}-${i}`)
    const text = lines.join("\n")
    expect(Buffer.byteLength(text)).toBeGreaterThan(16 * 1024)
    const r = retrieveRaw(text, { mode: "range" })
    expect(r.returnedBytes).toBeLessThanOrEqual(16 * 1024)
    expect(r.returnedLines).toBeLessThan(210)
    expect(r.returnedLines).toBeGreaterThan(0)
    const outLines = r.text.split("\n")
    expect(outLines.length).toBe(r.returnedLines)
    const originals = new Set(lines)
    for (const l of outLines) {
      expect(originals.has(l), "returned line must be a complete original line").toBe(true)
    }
    expect(r.hasMore).toBe(true)
    expect(r.nextStartLine).toBe(r.returnedLines + 1)
  })

  test("does not split multibyte characters at the byte cap and counts bytes via Buffer.byteLength", () => {
    const lines = Array.from({ length: 250 }, (_, i) => `"${"🎉".repeat(20)} idx=${i}"`)
    const text = lines.join("\n")
    expect(Buffer.byteLength(text)).toBeGreaterThan(16 * 1024)
    const r = retrieveRaw(text, { mode: "range" })
    expect(r.returnedBytes).toBeLessThanOrEqual(16 * 1024)
    expect(r.returnedBytes).toBe(Buffer.byteLength(r.text))
    expect(Buffer.from(r.text, "utf8").toString("utf8")).toBe(r.text)
    expect(r.text.includes("\uFFFD")).toBe(false)
    const originals = new Set(lines)
    for (const l of r.text.split("\n")) {
      expect(originals.has(l)).toBe(true)
    }
  })
})

describe("retrieveRaw: degenerate input", () => {
  test("empty text yields an empty page", () => {
    const r = retrieveRaw("", { mode: "range" })
    expect(r.text).toBe("")
    expect(r.returnedLines).toBe(0)
    expect(r.returnedBytes).toBe(0)
    expect(r.hasMore).toBe(false)
    expect([0, 1]).toContain(r.totalLines)
  })

  test("a trailing newline does not create an extra line", () => {
    const r = retrieveRaw("a\nb\nc\n", { mode: "range" })
    expect(r.totalLines).toBe(3)
    expect(r.returnedLines).toBe(3)
    expect(r.text.split("\n")).toEqual(["a", "b", "c"])
  })
})
