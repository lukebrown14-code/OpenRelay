# OpenRelay

Token-efficient orchestration layer for OpenCode (plan: `docs/token-efficient-architecture.md`).
Goal: maximize useful completed coding work per scarce premium-model token.
GLM Coding Plan = workhorse, ChatGPT subscription (OAuth, never API/PAYG) = premium tier.

## Layout

- `plugins/token-efficient/` — the OpenCode plugin (Task Controller, Context Engine, memory, handoffs, telemetry). Symlinked live from `~/.config/opencode/plugins/token-efficient`.
- `benchmarks/` — fixture corpus (4 classes), `run.mjs` runner, `analyze.mjs` A/A analyzer. Also symlinked into `~/.config/opencode/benchmarks`.
- `docs/` — architecture plan + Stage 0 capability matrix (`stage0-capability-matrix.md` is authoritative for what OpenCode 1.18.x hooks can/cannot do).

## Commands

```sh
bunx tsc -p plugins/token-efficient/tsconfig.json   # typecheck plugin
cd benchmarks && node run.mjs --fixture all --runs 3 --model zai-coding-plan/glm-5.3-flash --label <label>
cd benchmarks && node analyze.mjs <labelA> [labelB] # aggregates + noise comparison
```

Telemetry data lives in `~/.local/share/opencode/token-efficient/` (not in repo).

## Rules

- Never fork OpenCode; use supported extension points only (see Stage 0 matrix).
- Plugin code must never throw into the host — every hook body is defensive.
- Never hard-code model IDs; enumerate at runtime.
- Config/plugin changes require an OpenCode restart to take effect.
- Every optimization needs benchmark evidence: PASS/FAIL/INCONCLUSIVE; INCONCLUSIVE = do not add complexity.
- Benchmark joins telemetry by sessionID; verify pass is a quality gate, not the optimization target.

## Status

- Stage 0 done (capability matrix; premium path = raw via ChatGPT OAuth/Codex backend).
- Stage 1 built: telemetry plugin + benchmark harness. Exit criteria pending: actual A/A calibration runs; confirm GLM cache-token reporting across repeated runs.
- Stage 2 done: verdict INCONCLUSIVE (turn overhead ate byte savings; `docs/stage2/stage2-report.md`).
- Stage 2b done: verdict **PASS** — failure-card filtering + PASS-collapse + metadata.output
  sanitation + full-log parsing: −72% input+cacheRead and 0 recovery calls on the noisy
  fixture, 100% quality (`docs/stage2/stage2b-report.md`). Filtering still **off by default**;
  enabling is a pending decision.
- ChatGPT (premium tier) not yet authenticated (`opencode auth login` → ChatGPT OAuth).
- Next stages: 3 (output discipline), 4 (Task Controller v1).
