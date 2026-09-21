import { describe, expect, test } from "bun:test"
import { KNOWN_REASONS, classifyCommand } from "../lib/filtering/classify"
import { parseOutput } from "../lib/filtering/parsers"
import type { Evidence } from "../lib/filtering/parsers"
import { fixtures } from "./fixtures"
import { edges } from "./fixtures/edges"
import type { Fixture } from "./fixtures"

function classOf(command: string) {
  const cls = classifyCommand(command)
  if (!cls) throw new Error(`expected classification for: ${command}`)
  return cls
}

function evidenceOf(fix: Fixture): Evidence {
  const cls = classOf(fix.command)
  const ev = parseOutput(cls.family, cls.reason, fix.text)
  if (!ev) throw new Error(`expected evidence for: ${fix.command}`)
  return ev
}

function uncertain(fix: Fixture, text: string): unknown {
  const cls = classOf(fix.command)
  return parseOutput(cls.family, cls.reason, text)
}

function joined(ev: Evidence): string {
  return [ev.summary, ...ev.failures, ...ev.errors, ...ev.fileRefs, ...ev.stackFrames, ...ev.context].join("\n")
}

function assertNoAnsi(ev: Evidence): void {
  expect(joined(ev).includes("\u001b")).toBe(false)
}

function linesOf(text: string): number {
  return text.split("\n").length
}

function assertOmissionSane(ev: Evidence, text: string): void {
  expect(Number.isInteger(ev.omittedLines)).toBe(true)
  expect(ev.omittedLines).toBeGreaterThanOrEqual(0)
  expect(ev.omittedLines).toBeLessThan(linesOf(text) + 1)
}

describe("parsers: vitest", () => {
  test("extracts summary, all failure names, exact errors, file refs, and source frames", () => {
    const ev = evidenceOf(fixtures.vitestFailing)
    expect(ev.summary).toMatch(/2 failed/)
    expect(ev.summary).toMatch(/3 passed/)
    expect(ev.failures.some((f: string) => f.includes("adds numbers"))).toBe(true)
    expect(ev.failures.some((f: string) => f.includes("subtracts numbers"))).toBe(true)
    expect(joined(ev)).toContain("AssertionError: expected 2 to be 3 // Object.is equality")
    expect(joined(ev)).toContain("AssertionError: expected 4 to be 3 // Object.is equality")
    expect(ev.fileRefs.some((f: string) => f.includes("src/utils/math.test.ts"))).toBe(true)
    expect(ev.stackFrames.some((f: string) => f.includes("src/utils/math.test.ts:8:26"))).toBe(true)
    expect(ev.stackFrames.some((f: string) => f.includes("src/utils/math.test.ts:14:26"))).toBe(true)
    expect(ev.stackFrames.some((f: string) => f.includes("node_modules"))).toBe(false)
    assertOmissionSane(ev, fixtures.vitestFailing.text)
  })

  test("every extracted file ref appears verbatim in the raw output", () => {
    const ev = evidenceOf(fixtures.vitestFailing)
    for (const ref of ev.fileRefs) {
      expect(fixtures.vitestFailing.text.includes(ref)).toBe(true)
    }
  })
})

describe("parsers: jest", () => {
  test("extracts both failures, counts, file refs, and drops node_modules frames", () => {
    const ev = evidenceOf(fixtures.jestFailing)
    expect(ev.summary).toMatch(/2 failed/)
    expect(ev.summary).toMatch(/4 passed/)
    expect(ev.failures.some((f: string) => f.includes("adds numbers"))).toBe(true)
    expect(ev.failures.some((f: string) => f.includes("subtracts numbers"))).toBe(true)
    expect(joined(ev)).toContain("expect(received).toBe(expected) // Object.is equality")
    expect(joined(ev)).toContain("Expected: 3")
    expect(joined(ev)).toContain("Received: 2")
    expect(joined(ev)).toContain("Expected: 1")
    expect(ev.fileRefs.some((f: string) => f.includes("src/utils/math.test.js"))).toBe(true)
    expect(ev.stackFrames.some((f: string) => f.includes("src/utils/math.test.js:7:26"))).toBe(true)
    expect(ev.stackFrames.some((f: string) => f.includes("node_modules"))).toBe(false)
  })
})

describe("parsers: mocha", () => {
  test("extracts both failures, exact assertion errors, and source frames", () => {
    const ev = evidenceOf(fixtures.mochaFailing)
    expect(ev.summary).toMatch(/2 failing/)
    expect(ev.failures.some((f: string) => f.includes("fails when subtracting below zero"))).toBe(true)
    expect(ev.failures.some((f: string) => f.includes("handles floats"))).toBe(true)
    expect(joined(ev)).toContain("AssertionError: expected -5 to equal 0")
    expect(joined(ev)).toContain("AssertionError: expected 0.30000000000000004 to equal 0.3")
    expect(ev.fileRefs.some((f: string) => f.includes("test/subtract.test.js"))).toBe(true)
    expect(ev.stackFrames.some((f: string) => f.includes("test/subtract.test.js:8:20"))).toBe(true)
  })
})

describe("parsers: pytest", () => {
  test("extracts all three failures with short-summary refs and exact assert lines", () => {
    const ev = evidenceOf(fixtures.pytestFailing)
    expect(ev.summary).toMatch(/3 failed/)
    expect(ev.summary).toMatch(/3 passed/)
    expect(ev.failures.some((f: string) => f.includes("test_divide"))).toBe(true)
    expect(ev.failures.some((f: string) => f.includes("test_load"))).toBe(true)
    expect(ev.failures.some((f: string) => f.includes("test_tree"))).toBe(true)
    expect(joined(ev)).toContain("assert 5.0 == 4")
    expect(joined(ev)).toContain("ValueError: bad input")
    expect(ev.fileRefs.some((f: string) => f.includes("tests/test_math.py"))).toBe(true)
    expect(ev.fileRefs.some((f: string) => f.includes("tests/test_parse.py"))).toBe(true)
  })

  test("file refs preserve the module::test form", () => {
    const ev = evidenceOf(fixtures.pytestFailing)
    expect(joined(ev)).toContain("tests/test_math.py::test_divide")
  })
})

describe("parsers: node --test", () => {
  test("extracts failure, exact assertion text, and the test file frame", () => {
    const ev = evidenceOf(fixtures.nodeTestFailing)
    expect(ev.summary).toMatch(/fail 1/)
    expect(ev.failures.some((f: string) => f.includes("subtracts"))).toBe(true)
    expect(joined(ev)).toContain("Expected values to be strictly equal")
    expect(joined(ev)).toContain("2 !== 3")
    expect(ev.fileRefs.some((f: string) => f.includes("test/math.test.mjs"))).toBe(true)
    expect(ev.stackFrames.some((f: string) => f.includes("test/math.test.mjs:6:12"))).toBe(true)
  })
})

describe("parsers: node --test TAP (piped)", () => {
  test("failing TAP output keeps summary, failure name, assertion text, and frame", () => {
    const ev = evidenceOf(edges.nodeTestTapFailing)
    expect(ev.summary).toMatch(/# tests 3600/)
    expect(ev.summary).toMatch(/# pass 3599/)
    expect(ev.summary).toMatch(/# fail 1/)
    expect(ev.failures.some((f: string) => f.includes("formatBytes(1024)"))).toBe(true)
    expect(joined(ev)).toContain("Expected values to be strictly equal")
    expect(joined(ev)).toContain("'1024 B' !== '1 KB'")
    expect(ev.fileRefs.some((f: string) => f.includes("test/format.test.mjs:45:5"))).toBe(true)
    expect(ev.omittedLines).toBeGreaterThan(0)
  })

  test("failing TAP output yields a structured failure card", () => {
    const ev = evidenceOf(edges.nodeTestTapFailing)
    expect(ev.cards).toHaveLength(1)
    const c = ev.cards[0]
    expect(c.name).toContain("formatBytes(1024)")
    expect(c.expected).toBe("1 KB")
    expect(c.actual).toBe("1024 B")
    expect(c.operator).toBe("strictEqual")
    expect(c.code).toBe("ERR_ASSERTION")
    expect(c.location).toContain("test/format.test.mjs:45:5")
    expect(c.message).toContain("Expected values to be strictly equal")
  })

  test("passing TAP output yields evidence with zero failures", () => {
    const ev = evidenceOf(edges.nodeTestTapPassing)
    expect(ev.summary).toMatch(/# pass 2/)
    expect(ev.failures).toHaveLength(0)
    expect(ev.errors).toHaveLength(0)
  })
})

describe("parsers: bun test", () => {
  test("extracts failure, expectation error, and the test file frame", () => {
    const ev = evidenceOf(fixtures.bunTestFailing)
    expect(ev.summary).toMatch(/1 fail/)
    expect(ev.summary).toMatch(/3 pass/)
    expect(ev.failures.some((f: string) => f.includes("subtracts"))).toBe(true)
    expect(joined(ev)).toContain("expect(received).toBe(expected)")
    expect(joined(ev)).toContain("Received: 2")
    expect(ev.fileRefs.some((f: string) => f.includes("test/math.test.ts"))).toBe(true)
    expect(ev.stackFrames.some((f: string) => f.includes("test/math.test.ts:4:25"))).toBe(true)
  })
})

describe("parsers: tsc", () => {
  test("preserves every diagnostic line verbatim", () => {
    const ev = evidenceOf(fixtures.tscFailing)
    expect(ev.errors).toContain("src/index.ts(12,7): error TS2322: Type 'string' is not assignable to type 'number'.")
    expect(ev.errors).toContain(
      "src/app/user.ts(48,3): error TS2345: Argument of type '{ id: number; }' is not assignable to parameter of type 'User'."
    )
    expect(ev.errors).toContain(
      "src/app/user.ts(52,10): error TS2551: Property 'nmae' does not exist on type 'User'. Did you mean 'name'?"
    )
    expect(ev.fileRefs.some((f: string) => f.includes("src/index.ts"))).toBe(true)
    expect(ev.fileRefs.some((f: string) => f.includes("src/app/user.ts"))).toBe(true)
    expect(ev.summary).toContain("Found 3 errors")
    assertOmissionSane(ev, fixtures.tscFailing.text)
  })
})

describe("parsers: npm test script", () => {
  test("extracts the failing test through the npm banner", () => {
    const ev = evidenceOf(fixtures.npmTest)
    expect(ev.summary).toMatch(/1 failed/)
    expect(ev.failures.some((f: string) => f.includes("adds numbers"))).toBe(true)
    expect(joined(ev)).toContain("AssertionError: expected 2 to be 3 // Object.is equality")
    expect(ev.fileRefs.some((f: string) => f.includes("src/utils/math.test.ts"))).toBe(true)
    expect(ev.stackFrames.some((f: string) => f.includes("node_modules"))).toBe(false)
  })
})

describe("parsers: typecheck scripts and python/rust/go typecheckers", () => {
  test("npm run typecheck keeps the tsc diagnostic lines", () => {
    const ev = evidenceOf(fixtures.npmTypecheck)
    expect(ev.errors).toContain("src/index.ts(12,7): error TS2322: Type 'string' is not assignable to type 'number'.")
    expect(ev.summary).toContain("Found 2 errors")
  })

  test("pyright keeps diagnostic lines and summary counts", () => {
    const ev = evidenceOf(fixtures.pyrightFailing)
    expect(joined(ev)).toContain("Type 'string' is not assignable to type 'number'.")
    expect(ev.fileRefs.some((f: string) => f.includes("src/index.ts"))).toBe(true)
    expect(ev.fileRefs.some((f: string) => f.includes("src/util/async.ts"))).toBe(true)
    expect(ev.summary).toContain("2 errors")
  })

  test("mypy keeps diagnostic lines and file refs", () => {
    const ev = evidenceOf(fixtures.mypyFailing)
    expect(joined(ev)).toContain('Incompatible return value type (got "str", expected "int")')
    expect(ev.fileRefs.some((f: string) => f.includes("src/app.py"))).toBe(true)
    expect(ev.summary).toContain("Found 2 errors")
  })
})

describe("parsers: lint", () => {
  test("eslint stylish output keeps rule ids, messages, and file refs", () => {
    const ev = evidenceOf(fixtures.eslintFailing)
    expect(ev.summary).toContain("3 problems")
    expect(joined(ev)).toContain("'foo' is assigned a value but never used")
    expect(joined(ev)).toContain("@typescript-eslint/no-unused-vars")
    expect(joined(ev)).toContain("Missing semicolon")
    expect(ev.fileRefs.some((f: string) => f.includes("src/index.ts"))).toBe(true)
    expect(ev.fileRefs.some((f: string) => f.includes("src/app/user.ts"))).toBe(true)
  })

  test("biome, ruff, and golangci-lint produce evidence", () => {
    for (const fix of [fixtures.biomeFailing, fixtures.ruffFailing, fixtures.golangciFailing]) {
      const ev = evidenceOf(fix)
      expect(ev.errors.length + ev.failures.length, fix.command).toBeGreaterThan(0)
      expect(ev.fileRefs.length, fix.command).toBeGreaterThan(0)
    }
  })
})

describe("parsers: build", () => {
  test("cargo build keeps exact rustc error lines and spans", () => {
    const ev = evidenceOf(fixtures.cargoBuild)
    expect(joined(ev)).toContain("error[E0308]: mismatched types")
    expect(joined(ev)).toContain("expected `u32`, found `&str`")
    expect(joined(ev)).toContain("error[E0369]: cannot add `&str` to `&str`")
    expect(ev.fileRefs.some((f: string) => f.includes("src/main.rs"))).toBe(true)
  })

  test("go build keeps compiler errors and file refs", () => {
    const ev = evidenceOf(fixtures.goBuild)
    expect(joined(ev)).toContain("undefined: x")
    expect(ev.fileRefs.some((f: string) => f.includes("./app/main.go"))).toBe(true)
  })

  test("npm run build keeps the bundler error and drops node_modules frames", () => {
    const ev = evidenceOf(fixtures.npmBuild)
    expect(joined(ev)).toContain('Rollup failed to resolve import "missing-dep" from "src/main.ts".')
    expect(ev.stackFrames.some((f: string) => f.includes("node_modules"))).toBe(false)
  })
})

describe("parsers: edges", () => {
  test("passing run yields evidence with zero failures (not null)", () => {
    const ev = evidenceOf(edges.vitestPassing)
    expect(ev.failures).toEqual([])
    expect(ev.errors).toEqual([])
    expect(ev.summary).toMatch(/passed/)
  })

  test("ANSI variant strips escapes and extracts identical evidence", () => {
    const clean = evidenceOf(fixtures.vitestFailing)
    const ansi = evidenceOf(edges.vitestAnsi)
    assertNoAnsi(ansi)
    expect(ansi.failures).toEqual(clean.failures)
    expect(ansi.errors).toEqual(clean.errors)
    expect(ansi.fileRefs).toEqual(clean.fileRefs)
    expect(ansi.stackFrames).toEqual(clean.stackFrames)
  })

  test("CRLF variant extracts the same evidence as LF", () => {
    const clean = evidenceOf(fixtures.vitestFailing)
    const crlf = evidenceOf(edges.vitestCrlf)
    expect(crlf).not.toBeNull()
    expect(crlf.failures).toEqual(clean.failures)
    expect(crlf.errors).toEqual(clean.errors)
    expect(crlf.fileRefs).toEqual(clean.fileRefs)
    expect(crlf.stackFrames).toEqual(clean.stackFrames)
  })

  test("output with only node_modules frames keeps errors but no node_modules frames", () => {
    const ev = evidenceOf(edges.nodeModulesOnly)
    expect(ev.failures.length).toBeGreaterThan(0)
    expect(joined(ev)).toContain("AssertionError: expected 2 to be 3 // Object.is equality")
    expect(ev.stackFrames.some((f: string) => f.includes("node_modules"))).toBe(false)
  })

  test("empty output is uncertain", () => {
    expect(uncertain(fixtures.vitestFailing, edges.emptyOutput)).toBeNull()
  })

  test("garbage output is uncertain", () => {
    expect(uncertain(fixtures.vitestFailing, edges.garbageOutput)).toBeNull()
  })

  test("truncated banner without a summary is uncertain", () => {
    expect(uncertain(fixtures.vitestFailing, edges.truncatedBanner)).toBeNull()
  })

  test("noisy output omits most lines but keeps the actionable evidence", () => {
    const ev = evidenceOf(edges.bigNoisy)
    assertOmissionSane(ev, edges.bigNoisy.text)
    expect(ev.omittedLines).toBeGreaterThan(60)
    expect(ev.summary).toMatch(/2 failed/)
    expect(ev.failures.length).toBeGreaterThanOrEqual(2)
    expect(joined(ev)).toContain("AssertionError: expected 2 to be 3 // Object.is equality")
  })
})

describe("parsers: reason discipline", () => {
  test("every reason in KNOWN_REASONS is accepted by parseOutput", () => {
    for (const reason of KNOWN_REASONS) {
      const cls = classOf(fixtures.vitestFailing.command)
      const accepted = parseOutput(cls.family, cls.reason, fixtures.vitestFailing.text)
      expect(accepted).not.toBeNull()
    }
  })

  test("parseOutput rejects an unknown reason for known-format output", () => {
    expect(parseOutput("test", "totally-unknown-reason:v1", fixtures.vitestFailing.text)).toBeNull()
  })

  test("parseOutput rejects an unversioned reason", () => {
    expect(parseOutput("test", "vitest", fixtures.vitestFailing.text)).toBeNull()
  })
})
