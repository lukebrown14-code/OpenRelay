# Stage 2 — Deterministic Tool-Output Filtering

## Summary

Add conservative filtering for recognized test, TypeScript, lint, and build commands. Preserve exact raw output in bounded local storage and expose a session-scoped recovery tool. Filtering remains off by default until an A/B benchmark demonstrates meaningful token savings without quality regression.

## Implementation Changes

- Add `filtering` plugin configuration:
  - `enabled: false` by default.
  - `minBytes: 4096`.
  - Raw retention: 24 hours, 10 MiB per result, 50 MiB per session.
  - If raw output exceeds retention capacity, leave it unfiltered.
- In `tool.execute.after`, filter only `bash` results whose command is recognized:
  - Tests: Vitest, Jest, Mocha, pytest, Node/Bun tests, package test scripts.
  - Type checking: `tsc`, typecheck scripts, Pyright, mypy.
  - Lint: ESLint, Biome, Ruff, golangci-lint.
  - Builds: common npm/Bun/pnpm/yarn build scripts and compiler builds.
  - Unknown commands remain unchanged.
- Retain the command, exit code, totals, failure names, exact errors, file references, relevant stack frames, surrounding context, omission summary, and an opaque raw-output reference.
- If classification or evidence extraction is uncertain, return the raw result unchanged.
- Store exact pre-filter output locally with restrictive permissions. Strip ANSI/control noise only from the filtered representation.
- Add an `openrelay_raw_output` custom tool:
  - References must belong to the current session.
  - Support bounded line-range retrieval or text search with context.
  - Return at most 200 lines or 16 KiB per call, with pagination metadata.
  - Exclude recovery-tool output from filtering.
- Extend telemetry with:
  - `tool.filtered`: versioned filter reason (for example `vitest:v1`, `tsc:v1`, or `eslint:v1`), before/after bytes, ratio, omitted lines, and raw reference.
  - `tool.raw_recovered`: retrieval mode and returned bytes, never raw content.
  - Per-task totals for filtered calls, bytes before/after, compression ratio, and recovery calls.
  - Treat the filter reason/version as a stable telemetry dimension; increment only the affected parser version when its extraction behavior changes.
- Extend the benchmark runner with `--filtering off|on`.
- Preserve the Stage 1 runner fix that closes child stdin and aligns `PWD` with the disposable workspace.

## Tests and Benchmark Gate

- Add realistic unit fixtures for test, compiler, lint, and build output.
- Cover ANSI output, CRLF, multiple failures, stacks, file references, successful runs, short output, malformed output, and retention limits.
- Assert that critical errors and summaries survive filtering. Short, unknown, or unsafe output must remain unchanged.
- Assert that every filtered result emits the expected versioned filter reason and that parser changes cannot silently reuse an older version.
- Test raw recovery authorization, range/search behavior, caps, expiry, missing references, and recursive-filter exclusion.
- Add one noisy end-to-end coding fixture whose test command emits a large log with a small actionable failure.
- Run three GLM runs per fixture:
  - A: filtering off.
  - B: filtering on.
  - Include the four Stage 1 fixtures and the noisy Stage 2 fixture.
- Extend analysis with filtering metrics and per-fixture comparisons.

### PASS criteria

- 100% verification success in both groups.
- 100% telemetry joins.
- At least 70% tool-output byte reduction on targeted noisy results.
- At least 20% input-token reduction on the noisy fixture, outside measured variance.
- No retry, error, or latency regression outside the Stage 1 noise floor.
- Successful raw-recovery tests.

FAIL on any task-success regression or lost critical evidence. Mark the experiment INCONCLUSIVE if savings remain inside noise; keep filtering disabled and remove unvalidated complexity.

## Assumptions

- Recovery uses the dedicated scoped tool rather than raw file paths.
- Raw logs use bounded session storage and never enter telemetry.
- Stage 2 does not filter read/search/LSP results, arbitrary shell output, or use model-based summarization.
- Plugin/config changes require restarting persistent OpenCode sessions.
- After a PASS, enable filtering by default, document Stage 2 as complete, and retain raw/off mode for regression comparisons.

(End of file - total 67 lines)
