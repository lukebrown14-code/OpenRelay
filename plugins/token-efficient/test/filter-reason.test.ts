import { describe, expect, test } from "bun:test"
import { KNOWN_REASONS, classifyCommand } from "../lib/filtering/classify"
import type { FilterFamily } from "../lib/filtering/classify"
import { parseOutput } from "../lib/filtering/parsers"
import { fixtures } from "./fixtures"
import type { Fixture } from "./fixtures"

type Entry = Fixture & { family: FilterFamily }

const catalog: Record<string, Entry> = {
  vitest: { ...fixtures.vitestFailing, family: "test" },
  jest: { ...fixtures.jestFailing, family: "test" },
  mocha: { ...fixtures.mochaFailing, family: "test" },
  pytest: { ...fixtures.pytestFailing, family: "test" },
  "node-test": { ...fixtures.nodeTestFailing, family: "test" },
  node: { ...fixtures.nodeTestFailing, family: "test" },
  "bun-test": { ...fixtures.bunTestFailing, family: "test" },
  bun: { ...fixtures.bunTestFailing, family: "test" },
  "npm-test": { ...fixtures.npmTest, family: "test" },
  "yarn-test": { ...fixtures.npmTest, family: "test" },
  "pnpm-test": { ...fixtures.npmTest, family: "test" },
  "test-script": { ...fixtures.npmTest, family: "test" },
  tsc: { ...fixtures.tscFailing, family: "typecheck" },
  typescript: { ...fixtures.tscFailing, family: "typecheck" },
  "npm-typecheck": { ...fixtures.npmTypecheck, family: "typecheck" },
  "typecheck-script": { ...fixtures.npmTypecheck, family: "typecheck" },
  pyright: { ...fixtures.pyrightFailing, family: "typecheck" },
  mypy: { ...fixtures.mypyFailing, family: "typecheck" },
  eslint: { ...fixtures.eslintFailing, family: "lint" },
  biome: { ...fixtures.biomeFailing, family: "lint" },
  ruff: { ...fixtures.ruffFailing, family: "lint" },
  "golangci-lint": { ...fixtures.golangciFailing, family: "lint" },
  golangci: { ...fixtures.golangciFailing, family: "lint" },
  "npm-build": { ...fixtures.npmBuild, family: "build" },
  "yarn-build": { ...fixtures.npmBuild, family: "build" },
  "pnpm-build": { ...fixtures.npmBuild, family: "build" },
  "bun-build": { ...fixtures.npmBuild, family: "build" },
  "build-script": { ...fixtures.npmBuild, family: "build" },
  "cargo-build": { ...fixtures.cargoBuild, family: "build" },
  cargo: { ...fixtures.cargoBuild, family: "build" },
  "go-build": { ...fixtures.goBuild, family: "build" },
  go: { ...fixtures.goBuild, family: "build" },
}

describe("filter reasons", () => {
  test("KNOWN_REASONS is non-empty, unique, and always versioned", () => {
    expect(KNOWN_REASONS.length).toBeGreaterThan(0)
    expect(new Set(KNOWN_REASONS).size).toBe(KNOWN_REASONS.length)
    for (const reason of KNOWN_REASONS) {
      expect(reason).toMatch(/^[a-z0-9][a-z0-9._-]*:v1$/)
    }
  })

  test("every known reason has an end-to-end fixture through classify + parseOutput", () => {
    for (const reason of KNOWN_REASONS) {
      const tool = reason.replace(/:v1$/, "")
      const entry = catalog[tool]
      if (!entry) {
        expect.unreachable(`no fixture for reason "${reason}" — add one to the catalog in test/filter-reason.test.ts`)
      }
      const cls = classifyCommand(entry.command)
      expect(cls, `classifyCommand("${entry.command}")`).not.toBeNull()
      expect(cls!.family).toBe(entry.family)
      expect(cls!.reason).toBe(reason)
      const ev = parseOutput(cls!.family, cls!.reason, entry.text)
      expect(ev, `parseOutput returned null for reason "${reason}"`).not.toBeNull()
    }
  })

  test("classifyCommand reasons always come from KNOWN_REASONS", () => {
    for (const entry of Object.values(catalog)) {
      const cls = classifyCommand(entry.command)
      if (cls) {
        expect(KNOWN_REASONS).toContain(cls.reason)
      }
    }
  })

  test("parseOutput rejects reasons that are not in KNOWN_REASONS", () => {
    expect(parseOutput("test", "not-a-real-reason:v1", fixtures.vitestFailing.text)).toBeNull()
  })

  test("parseOutput rejects unversioned reasons", () => {
    expect(parseOutput("test", "vitest", fixtures.vitestFailing.text)).toBeNull()
  })
})
