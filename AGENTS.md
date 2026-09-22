# OpenRelay

Token-efficient orchestration layer for OpenCode (plan: `docs/token-efficient-architecture.md`).
Goal: maximize useful completed coding work per scarce premium-model token.
GLM Coding Plan = workhorse; ChatGPT subscription (OAuth, never API/PAYG) = premium tier.

## Layout

- `plugins/token-efficient/` — the OpenCode plugin (`index.ts` is the hook entry).
  Loaded only via the launchers (`OPENCODE_CONFIG_CONTENT`); never symlink or register it
  manually — `checkConflicts` refuses to launch if any OpenRelay registration exists.
- `benchmarks/` — fixture corpus, `run.mjs` runner, `analyze.mjs` A/A + factorial analyzer.
- `scripts/` — launcher runtime source. The *installed* `opencode-relay*` binaries import a
  copy under `~/.local/share/openrelay/runtime/`, **not** `scripts/` — editing `scripts/`
  has no effect until the runtime is reinstalled.
- `docs/` — plans + stage reports. `stage0-capability-matrix.md` was lost in the 2026-09-22
  repo wipe; a surviving copy lives at `~/.config/opencode/stage0-capability-matrix.md`
  (authoritative for which OpenCode hooks exist).

## Commands

```sh
bun install                                             # deps (both bun.lock and package-lock.json are tracked)
bunx tsc -p plugins/token-efficient/tsconfig.json       # typecheck plugin
bun test plugins/token-efficient                        # unit tests (bun:test, no global test script)
cd benchmarks && node run.mjs --fixture all --runs 3 --model <provider/model> --label <label>
cd benchmarks && node analyze.mjs <labelA> [labelB]     # A/B + noise check
cd benchmarks && node analyze.mjs <base> <filt> <disc> <both>  # stage-3 2x2 factorial
bun scripts/relay.mjs [daily] [--relay-status]          # dev-channel CLI (daily via opencode-relay)
```

## Launchers & channels

- `opencode-relay` (daily): bundled release from `~/.local/share/openrelay/releases/`,
  sha256-verified against `manifest.json`; `current`/`previous` symlinks enable rollback.
  Forces `previewSafe` on and discipline off.
- `opencode-relay-dev`: runs repo source `plugins/token-efficient/index.ts` directly
  (`buildID` = `dev-<hash>`); allows `previewSafe` off (legacy broad filtering).
- Filtering defaults to **on** under the launchers (`OPENRELAY_FILTERING ?? "on"`) but
  **off** under raw plugin registration; `OPENRELAY_FILTERING=on|off` always wins.
- `--relay-status` prints the resolved spec (entry, dataDir, filtering) without launching.

## Telemetry locations

- Launchers write to `~/.local/share/openrelay/data/<channel>/` (daily / development / benchmarks/<label>).
- Manual plugin registration (no launcher) defaults to `~/.local/share/opencode/token-efficient/`.
- `analyze.mjs` joins `run.json` by `sessionID`; benchmark `run.json` records `telemetryDir`
  so analysis resolves the correct events dir automatically.

## Rules

- Never fork OpenCode; use supported extension points only (Stage 0 matrix).
- Plugin hooks must never throw into the host — every hook body is defensive try/catch.
- Never hard-code model IDs in the plugin; enumerate at runtime from events.
- Config/plugin changes require an OpenCode restart to take effect.
- Every optimization needs benchmark evidence: PASS/FAIL/INCONCLUSIVE; INCONCLUSIVE = add no complexity.
- Verify PASS is the quality gate, never the optimization target; benchmark joins telemetry by sessionID.

## Status

- Stage 0 done; Stage 1 (telemetry + harness) built.
- Stage 2 INCONCLUSIVE (turn overhead ate savings). Stage 2b **PASS**: failure-card filtering
  + PASS-collapse + metadata sanitation (−72% input+cacheRead, 0 recoveries on noisy fixture).
- Stage 3 discipline FAILS/INCONCLUSIVE — code removed; filtering re-validated (−49% tokensTotal).
- ChatGPT (premium tier) not yet authenticated (`opencode auth login` → ChatGPT OAuth).
- Next: Stage 4 (Task Controller v1).
- `README.md` and `docs/project-trials.md` are "LOST in 2026-09-22 wipe" placeholders — do not trust them.
