export interface Fixture {
  command: string
  text: string
}

export const vitestFailing: Fixture = {
  command: "npx vitest run",
  text: ` RUN  v2.1.8 /Users/luke/src/OpenRelay

 ❯ src/utils/math.test.ts (3 tests | 2 failed) 8ms
   × adds numbers 2ms
     → expected 2 to be 3
   × subtracts numbers 1ms
     → expected 4 to be 3
 ✓ src/utils/sum.test.ts (2 tests) 3ms

 Test Files  1 failed | 1 passed (2)
      Tests  2 failed | 3 passed (5)
   Start at 2026-09-19T15:30:00.000Z
   Duration  512ms (transform 48ms, setup 1ms, tests 28ms, environment 1ms)

 ⎯⎯ Failed Tests 2 ⎯⎯

 FAIL  src/utils/math.test.ts > adds numbers
AssertionError: expected 2 to be 3 // Object.is equality

- Expected
+ Received

- 3
+ 2

 ❯ src/utils/math.test.ts:8:26
 ❯ node_modules/@vitest/runner/dist/chunk-hooks.js:155:11

 FAIL  src/utils/math.test.ts > subtracts numbers
AssertionError: expected 4 to be 3 // Object.is equality

- Expected
+ Received

- 3
+ 4

 ❯ src/utils/math.test.ts:14:26
 ❯ node_modules/@vitest/runner/dist/chunk-hooks.js:155:11`,
}

export const jestFailing: Fixture = {
  command: "npx jest",
  text: ` PASS  src/utils/sum.test.js
 FAIL  src/utils/math.test.js
  ● math suite › adds numbers

    expect(received).toBe(expected) // Object.is equality

    Expected: 3
    Received: 2

      6 |   expect(add(1, 1)).toBe(3);
    > 7 |   expect(add(2, 1)).toBe(3);
        |                     ^
      8 | });

      at Object.<anonymous> (src/utils/math.test.js:7:26)
      at node_modules/jest-mock/build/index.js:39:26

  ● math suite › subtracts numbers

    expect(received).toBe(expected) // Object.is equality

    Expected: 1
    Received: 3

      at Object.<anonymous> (src/utils/math.test.js:12:26)
      at node_modules/jest-mock/build/index.js:39:26

Test Suites: 1 failed, 1 passed, 2 total
Tests:       2 failed, 4 passed, 6 total
Snapshots:   0 total
Time:        1.234 s
Ran all test suites.`,
}

export const mochaFailing: Fixture = {
  command: "npx mocha",
  text: `  math suite
    ✓ adds numbers

  subtracting numbers
    1) fails when subtracting below zero
    2) handles floats

  2 passing (14ms)
  2 failing

  1) subtracting numbers
       fails when subtracting below zero:
     AssertionError: expected -5 to equal 0
      at Context.<anonymous> (test/subtract.test.js:8:20)
      at processImmediate (node:internal/timers:478:5)

  2) subtracting numbers
       handles floats:
     AssertionError: expected 0.30000000000000004 to equal 0.3
      at Context.<anonymous> (test/subtract.test.js:13:20)
      at processImmediate (node:internal/timers:478:5)`,
}

export const pytestFailing: Fixture = {
  command: "python -m pytest -q",
  text: `============================= test session starts ==============================
platform darwin -- Python 3.12.6, pytest-8.3.3, pluggy-1.5.0
rootdir: /Users/luke/src/OpenRelay
configfile: pyproject.toml
plugins: anyio-4.4.0
collected 6 items

tests/test_math.py ..F                                                   [ 33%]
tests/test_parse.py .FF                                                  [100%]

================================== FAILURES ===================================
_______________________________ test_divide ___________________________________

    def test_divide():
>       assert divide(10, 2) == 4
E       assert 5.0 == 4

tests/test_math.py:12: AssertionError
_______________________________ test_load _____________________________________

    def test_load():
>       parse("bogus")
E       ValueError: bad input

tests/test_parse.py:9: ValueError
_______________________________ test_tree _____________________________________

    def test_tree():
>       assert tree(3).size == 6
E       assert 5 == 6

tests/test_parse.py:14: AssertionError
=========================== short summary info ================================
FAILED tests/test_math.py::test_divide - assert 5.0 == 4
FAILED tests/test_parse.py::test_load - ValueError: bad input
FAILED tests/test_parse.py::test_tree - assert 5 == 6
========================= 3 failed, 3 passed in 0.05s =========================`,
}

export const nodeTestFailing: Fixture = {
  command: "node --test",
  text: `▶ math
  ✔ adds (0.6ms)
  ✗ subtracts (0.9ms)
    AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:

    2 !== 3

        at TestContext.<anonymous> (/Users/luke/src/OpenRelay/test/math.test.mjs:6:12)
        at node:internal/test_runner/test:250:5
▶ math

ℹ tests 2
ℹ suites 1
ℹ pass 1
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 12.4`,
}

export const bunTestFailing: Fixture = {
  command: "bun test",
  text: `test/math.test.ts:
✓ adds [0.05ms]
✓ multiplies [0.02ms]
✗ subtracts [0.12ms]

  error: expect(received).toBe(expected)

  Expected: 3
  Received: 2

      4 |   expect(subtract(5, 2)).toBe(3);
        |                         ^

      at /Users/luke/src/OpenRelay/test/math.test.ts:4:25

 3 pass
 1 fail
 4 expect() calls
Ran 3 tests across 1 file. [3.51ms]`,
}

export const npmTest: Fixture = {
  command: "npm test",
  text: `> app@0.1.0 test
> vitest run

 RUN  v2.1.8 /Users/luke/src/OpenRelay

 ❯ src/utils/math.test.ts (1 test | 1 failed) 5ms
   × adds numbers
     → expected 2 to be 3

 Test Files  1 failed (1)
      Tests  1 failed | 2 passed (3)
   Duration  402ms

 FAIL  src/utils/math.test.ts > adds numbers
AssertionError: expected 2 to be 3 // Object.is equality
 ❯ src/utils/math.test.ts:8:26
 ❯ node_modules/@vitest/runner/dist/chunk-hooks.js:155:11`,
}

export const tscFailing: Fixture = {
  command: "npx tsc --noEmit",
  text: `src/index.ts(12,7): error TS2322: Type 'string' is not assignable to type 'number'.
src/app/user.ts(48,3): error TS2345: Argument of type '{ id: number; }' is not assignable to parameter of type 'User'.
src/app/user.ts(52,10): error TS2551: Property 'nmae' does not exist on type 'User'. Did you mean 'name'?

Found 3 errors in 2 files.

Errors  Files
     2  src/app/user.ts:48
     1  src/index.ts:12`,
}

export const npmTypecheck: Fixture = {
  command: "npm run typecheck",
  text: `> app@0.1.0 typecheck
> tsc --noEmit

src/index.ts(12,7): error TS2322: Type 'string' is not assignable to type 'number'.
src/app/user.ts(48,3): error TS2345: Argument of type '{ id: number; }' is not assignable to parameter of type 'User'.

Found 2 errors in 2 files.`,
}

export const pyrightFailing: Fixture = {
  command: "npx pyright src",
  text: `src/index.ts:12:7 - error TS2322: Type 'string' is not assignable to type 'number'.
  src/index.ts:12:7 - note: The expected type comes from property 'count' which is declared here.
src/util/async.ts:31:5 - error TS2322: Type 'undefined' is not assignable to type 'Promise<number>'.
2 errors, 0 warnings, 0 informations`,
}

export const mypyFailing: Fixture = {
  command: "mypy src",
  text: `src/app.py:12: error: Incompatible return value type (got "str", expected "int")  [return-value]
src/util.py:48: error: Argument 1 to "load" has incompatible type "str"; expected "int"  [arg-type]
Found 2 errors in 2 files (checked 5 source files)`,
}

export const eslintFailing: Fixture = {
  command: "yarn eslint .",
  text: `/Users/luke/src/OpenRelay/src/index.ts
  12:7  error    'foo' is assigned a value but never used  @typescript-eslint/no-unused-vars
  20:1  error    Missing semicolon                         semi

/Users/luke/src/OpenRelay/src/app/user.ts
  3:10  warning  'Bar' is defined but never used           no-unused-vars

✖ 3 problems (2 errors, 1 warning)`,
}

export const biomeFailing: Fixture = {
  command: "bunx biome check .",
  text: `src/index.ts:1:5 lint/suspicious/noExplicitAny ━━━━━━━━━━━━━━━━━━━━━━

  ✖ Unexpected any. Specify a different type.

  > 1 │ const x: any = {};
      │     ^^^

  ℹ Unsafe fix: Replace \`any\` with \`unknown\`

Checked 5 files in 10ms. No fixes applied.
Found 1 error.`,
}

export const ruffFailing: Fixture = {
  command: "ruff check .",
  text: `src/app.py:10:5: F841 Local variable \`x\` is assigned to but never used
src/util.py:2:1: E402 Module level import not at top of file
Found 2 errors.
[*] 1 fixable with the \`--fix\` option.`,
}

export const golangciFailing: Fixture = {
  command: "golangci-lint run",
  text: `app/main.go:12:2: x declared and not used (typecheck)
app/util.go:31:2: unused-parameter: parameter 'ctx' seems to be unused, consider removing or renaming it as _ (revive)
2 issues:
* (typecheck): 1
* (revive): 1`,
}

export const cargoBuild: Fixture = {
  command: "cargo build",
  text: `   Compiling openrelay v0.1.0 (/Users/luke/src/OpenRelay)
error[E0308]: mismatched types
 --> src/main.rs:12:20
  |
12 |     let n: u32 = "x";
   |                  ^^^ expected \`u32\`, found \`&str\`

error[E0369]: cannot add \`&str\` to \`&str\`
 --> src/main.rs:15:17
  |
15 |     let s = "a" + "b";
   |             ~~~ ^ ~~~ \`&str\`
   |
   = note: an operation on \`&str\` is not supported here

For more information about this error, try \`rustc --explain E0308\`.
error: could not compile \`openrelay\` (bin "openrelay") due to 2 previous errors`,
}

export const goBuild: Fixture = {
  command: "go build ./...",
  text: `# openrelay/app
./app/main.go:12:2: undefined: x
./app/main.go:13:9: cannot use "s" (untyped string constant) as int value in assignment`,
}

export const npmBuild: Fixture = {
  command: "npm run build",
  text: `> app@0.1.0 build
> vite build

vite v5.4.10 building for production...
transforming (42) src/main.ts
✗ [vite]: Rollup failed to resolve import "missing-dep" from "src/main.ts".
error during build:
[vite]: Rollup failed to resolve import "missing-dep" from "src/main.ts".
    at getRollupError (file:///Users/luke/src/OpenRelay/node_modules/rollup/dist/parseAst.js:75:41)`,
}

export const fixtures = {
  vitestFailing,
  jestFailing,
  mochaFailing,
  pytestFailing,
  nodeTestFailing,
  bunTestFailing,
  npmTest,
  tscFailing,
  npmTypecheck,
  pyrightFailing,
  mypyFailing,
  eslintFailing,
  biomeFailing,
  ruffFailing,
  golangciFailing,
  cargoBuild,
  goBuild,
  npmBuild,
}
