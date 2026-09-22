# OpenRelay

Token-efficient orchestration layer for [OpenCode](https://opencode.ai) — a plugin plus a
benchmark harness that maximizes useful completed coding work per scarce premium-model token.

**Model strategy.** GLM Coding Plan (`zai-coding-plan/glm-5.3-flash`) is the workhorse;
ChatGPT subscription (OAuth, never API/PAYG) is the premium tier. Routing, filtering, and
telemetry are deterministic — no LLM router yet.

## Status

| Stage | Verdict |
|---|---|
| 0 — capability matrix | done — `docs/stage0-capability-matrix.md` |
| 1 — telemetry + harness | built; A/A calibration exit criterion still pending |
| 2 — tool-output filtering | INCONCLUSIVE — `docs/stage2/stage2-report.md` |
| 2b — act-complete filtering | **PASS** — `docs/stage2/stage2b-report.md` |
| 3 — output discipline | FAILS/INCONCLUSIVE — code removed; filtering re-validated — `docs/stage3/stage3-report.md` |

Tool-output filtering remains **off by default** pending an explicit enable decision (the
launcher's `OPENRELAY_FILTERING` defaults to `on`, but the shipped-config default is off).

## Layout

- `plugins/token-efficient/` — the OpenCode plugin (`index.ts` is the hook entry):
  tool-output filtering, the `openrelay_raw_output` recovery tool, and telemetry hooks.
  Loaded only via the launchers (`OPENCODE_CONFIG_CONTENT`); never symlink or register it
  manually — `checkConflicts` refuses to launch if any OpenRelay registration exists.
- `benchmarks/` — fixture corpus (5 tasks), `run.mjs` runner, `analyze.mjs` A/A + factorial
  analyzer.
- `scripts/` — launcher runtime source. The *installed* `opencode-relay*` binaries import a
  copy under `~/.local/share/openrelay/runtime/`, **not** `scripts/` — editing `scripts/`
  has no effect until the runtime is reinstalled.
- `docs/` — architecture plan (`token-efficient-architecture.md`) plus stage reports.

## Quick start

```sh
bun install                                            # deps
bunx tsc -p plugins/token-efficient/tsconfig.json      # typecheck plugin
bun test plugins/token-efficient                       # unit tests
cd benchmarks && node run.mjs --fixture all --runs 3 \
  --model zai-coding-plan/glm-5.3-flash --label <label> --filtering off|on
cd benchmarks && node analyze.mjs <labelA> [labelB]    # A/B + noise check
cd benchmarks && node analyze.mjs <base> <filt> <disc> <both>   # 2x2 factorial
```

## Launchers & channels

- `opencode-relay` (daily): bundled release from `~/.local/share/openrelay/releases/`,
  sha256-verified against `manifest.json`; `current`/`previous` symlinks enable rollback.
- `opencode-relay-dev`: runs repo source `plugins/token-efficient/index.ts` directly
  (`buildID = dev-<hash>`).
- Filtering defaults to **on** under the launchers (`OPENRELAY_FILTERING ?? "on"`) but
  **off** under raw plugin registration; `OPENRELAY_FILTERING=on|off` always wins.

## Telemetry

Launchers write to `~/.local/share/openrelay/data/<channel>` (daily / development /
benchmarks/<label>). Raw manual registration defaults to
`~/.local/share/opencode/token-efficient/`. `analyze.mjs` joins `run.json` by `sessionID`.

## Rules

- Never fork OpenCode; use supported extension points only (Stage 0 matrix).
- Plugin hooks must never throw into the host — every hook body is defensive.
- Never hard-code model IDs; enumerate at runtime.
- Every optimization needs benchmark evidence: PASS/FAIL/INCONCLUSIVE; INCONCLUSIVE =
  add no complexity.
- Verify PASS is the quality gate, never the optimization target.

## Trial log

See `docs/project-trials.md` for the running log of benchmark trials, their measured
results, and per-trial observations.
