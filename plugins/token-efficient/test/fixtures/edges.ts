import { fixtures, vitestFailing } from "./index"
import type { Fixture } from "./index"

export const vitestPassing: Fixture = {
  command: "npx vitest run",
  text: ` RUN  v2.1.8 /Users/luke/src/OpenRelay

 ✓ src/utils/math.test.ts (5 tests) 6ms
 ✓ src/utils/sum.test.ts (2 tests) 3ms

 Test Files  2 passed (2)
      Tests  7 passed (7)
   Start at 2026-09-19T15:30:00.000Z
   Duration  480ms`,
}

export const vitestAnsi: Fixture = {
  command: vitestFailing.command,
  text: vitestFailing.text
    .replaceAll(" RUN ", " \x1b[1mRUN\x1b[22m ")
    .replaceAll("× adds numbers", "\x1b[31m×\x1b[39m adds numbers")
    .replaceAll("× subtracts numbers", "\x1b[31m×\x1b[39m subtracts numbers")
    .replaceAll("✓ src/utils/sum.test.ts", "\x1b[32m✓\x1b[39m src/utils/sum.test.ts")
    .replaceAll("FAIL  src/utils/math.test.ts", "\x1b[31mFAIL\x1b[39m  src/utils/math.test.ts")
    .replaceAll("AssertionError:", "\x1b[31mAssertionError:\x1b[39m")
    .replaceAll("2 failed | 3 passed", "\x1b[1m2 failed | 3 passed\x1b[22m"),
}

export const vitestCrlf: Fixture = {
  command: vitestFailing.command,
  text: vitestFailing.text.replace(/\n/g, "\r\n"),
}

export const emptyOutput = ""

export const garbageOutput = `j8#*$@! jumbled bytes
\x00\x01\x02 \x1f ~~ %% @@ 0xDEADBEEF ?? <binary blob elided>
~v9!q zzzzz kkkkk ppppp --- === ### no recognizable structure here`

export const truncatedBanner = " RUN  v2.1.8 /Users/luk"

export const nodeModulesOnly: Fixture = {
  command: "npx vitest run",
  text: ` Test Files  1 failed (1)
      Tests  1 failed | 1 passed (2)

 FAIL  src/utils/math.test.ts > adds numbers
AssertionError: expected 2 to be 3 // Object.is equality
 ❯ node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
 ❯ node_modules/vitest/dist/suite.js:42:7`,
}

const noise: string[] = []
for (let i = 0; i < 60; i++) {
  noise.push(`stdout: loading fixture data chunk ${i} ok (sha=abc123def456, bytes=4096, ms=${i % 9})`)
}

export const bigNoisy: Fixture = {
  command: vitestFailing.command,
  text: noise.join("\n") + "\n" + vitestFailing.text,
}

export const nodeTestTapFailing: Fixture = {
  command: "npm test",
  text: `> pkg@1.0.0 test
> node --test

TAP version 13
# Subtest: case #0001 formatBytes(7) => "7 B"
ok 1 - case #0001 formatBytes(7) => "7 B"

# Subtest: case #0777 formatBytes(1024) => "1 KB"
not ok 777 - case \\#0777 formatBytes(1024) => "1 KB"
  ---
  duration_ms: 0.644666
  type: 'test'
  location: 'test/format.test.mjs:45:5'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:

    '1024 B' !== '1 KB'
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: '1 KB'
  actual: '1024 B'
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (test/format.test.mjs:46:14)
    Test.run (node:internal/test_runner/test:1047:25)
  ...
# tests 3600
# suites 0
# pass 3599
# fail 1
# cancelled 0
# skipped 0
# todo 0`,
}

export const nodeTestTapPassing: Fixture = {
  command: "node --test",
  text: `TAP version 13
# Subtest: case #0001 formatBytes(7) => "7 B"
ok 1 - case #0001 formatBytes(7) => "7 B"
# tests 2
# suites 0
# pass 2
# fail 0
# cancelled 0
# skipped 0
# todo 0`,
}

export const edges = {
  vitestPassing,
  nodeTestTapFailing,
  nodeTestTapPassing,
  vitestAnsi,
  vitestCrlf,
  emptyOutput,
  garbageOutput,
  truncatedBanner,
  nodeModulesOnly,
  bigNoisy,
}

export { fixtures }
export type { Fixture }
