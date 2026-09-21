# Task: Fix formatBytes

One case in the `formatBytes` test suite is failing. The suite is intentionally
verbose: its output identifies exactly which input is broken and what the
expected result is.

Run `npm test` directly — do not pipe, grep, or truncate its output — to find
the failing case, then fix `formatBytes` in `src/format.js` so every case
passes.

Rules for `formatBytes`:
- units are B, KB, MB, GB, TB with 1 KB = 1024 B (binary prefixes)
- scaled values keep one decimal place with trailing ".0" stripped
  ("1.5 KB", "2 KB")
- non-finite or negative input throws RangeError

Do not modify `verify.js`, `test/`, or `package.json`.

`node verify.js` must print PASS.
