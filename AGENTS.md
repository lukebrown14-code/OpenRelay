# OpenRelay

Experiment lab and orchestration layer for improving AI coding harness token use and speed
while preserving verified quality (plan: `docs/token-efficient-architecture.md`).
Goal: maximize useful completed coding work per scarce premium-model token.
GLM Coding Plan = workhorse; ChatGPT subscription (OAuth, never API/PAYG) = premium tier.

## Layout

- `plugins/token-efficient/` — the OpenCode plugin (`index.ts` is the hook entry).
  Loaded only via the launchers (`OPENCODE_CONFIG_CONTENT`); never symlink or register it
  manually — `checkConflicts` refuses to launch if any OpenRelay registration exists.
- `benchmarks/` — fixture corpus, `run.mjs` runner, `analyze.mjs` A/A + factorial analyzer.
- `benchmarks/stages/stageN/` — stage-specific experimental runners, analyzers, tests, and prototypes;
  shared fixtures, solutions, libraries, and results remain directly under `benchmarks/`.
- `scripts/` — launcher runtime source. The *installed* `opencode-relay*` binaries import a
  copy under `~/.local/share/openrelay/runtime/`, **not** `scripts/` — editing `scripts/`
  has no effect until the runtime is reinstalled.
- `docs/` — plans + stage reports. `stage0-capability-matrix.md` was lost in the 2026-09-22
  repo wipe; a surviving copy lives at `~/.config/opencode/stage0-capability-matrix.md`
  (authoritative for which OpenCode hooks exist).
- `docs/README.md` — current experiment and report index; `docs/project-trials.md` is a wipe
  placeholder and is not authoritative.

## Commands

```sh
bun install                                             # deps (both bun.lock and package-lock.json are tracked)
bunx tsc -p plugins/token-efficient/tsconfig.json       # typecheck plugin
cd plugins/token-efficient && bun test ./test           # unit tests (bun:test, no global test script)
cd benchmarks && node run.mjs --fixture all --runs 3 --model <provider/model> --label <label>
cd benchmarks && node analyze.mjs <labelA> [labelB]     # A/B + noise check
cd benchmarks && node analyze.mjs <base> <filt> <disc> <both>  # stage-3 2x2 factorial
bun scripts/relay.mjs [daily] [--relay-status]          # dev-channel CLI (daily via opencode-relay)
```

## Launchers & channels

- `opencode-relay` (daily): bundled release from `~/.local/share/openrelay/releases/`,
  sha256-verified against `manifest.json`; `current`/`previous` symlinks enable rollback.
  Forces `previewSafe` on and discipline off. Stage 5 v3 context now defaults on in the
  daily channel; set `OPENRELAY_CONTEXT=off` to disable it for a launch. The dev channel
  and raw plugin registration still default context off.
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
- ChatGPT premium tier authenticated through OpenAI OAuth; keep `OPENAI_API_KEY` unset.
- Stage 4 (Task Controller v1) **partial PASS** — deterministic GLM-first routing preserved
  quality with zero premium calls in the 15-run arm; escalation was not exercised and stays
  opt-in/unvalidated. Plan/report: `docs/stage4/stage4-plan.md` / `stage4-report.md`.
- Stage 5 (Context Engine v1) **INCONCLUSIVE** — deterministic retrieval + packet via
  `experimental.chat.system.transform` (`OPENRELAY_CONTEXT`, default off); corpus extended
  with fixtures 06–13 (UI + Git, `ground-truth.json` eval, `setup.mjs` scenarios);
  retrieval eval passes zero-token against all ground truth. Wave 1b (workhorse, n=1/cell,
  26/26 verify PASS): overall input+cacheRead savings **7.6%** (target ≥25%). UI category
  PASS signal (−40%, rounds −44%); Git category FAIL (+12% tokens/+21% latency) because
  Git evidence duplicates the model's own git commands; trivial/legacy neutral. Stop rule
  fired (<10%) → Wave 2 not run. v2 task-adaptive selector (git-intent requests skip the
  packet, `context.packet_skipped`) validated in a 4-fixture re-smoke: UI/debug wins hold
  (−50% tokens/−55% rounds on 06), and fixture 10 regressed +23% **with no packet**, so
  git n=1 numbers are variance-dominated. **v3 probe-gated selection shipped** (see
  `docs/stage5/v3-addendum.md`): fixed-string rg + exit triage (fail open), hardened
  extractor (git-intent prose false-positives, multi-dot paths, dot-stripped CSS
  locators), deterministic candidates (`--sort path`), `.env`/symlink/binary/oversize
  guards, request-echo drop, slim git section (packets −55% bytes), and a probe verdict
  between search and read: full-corpus matrix = build {06,07,08,09}, skip everything
  else (every token-losing fixture now skips). Gates restated category-scoped (enabled
  class ≥25%, disabled ≤+5%); aggregate reported not gated (corpus ceiling ~12%).
  Replay simulator investigated → no-build (cannot express behavioral variance).
  Corpus extension 14–21 is implemented; see `docs/stage5/corpus-extension.md` and
  `next-steps.md`. Only 19 and 21 have extension model pilots. Plan/report: `docs/stage5/stage5-plan.md` / `stage5-report.md`.
- Stage 5 v3 focused baseline **executed and audited 2026-09-23**:
  `docs/stage5/v3-baseline-results.md` / `v3-audit-results.md`. All 36 runs verify PASS;
  180 coding completions reconcile across telemetry and saved OpenCode output; zero
  observed retries/premium calls, selector matches 17/17. Correct baseline-relative
  UI-class savings **15.2%** (previous 16.4% used a symmetric denominator) →
  INCONCLUSIVE; 06 saves 31.2% across
  three pairs; 21 pilot saves 44.3%; 19 saves 14.0% but session duration rises 70.7%.
  Even post-hoc 06–08 savings are only 23.6%. Extra off observations on 06/09 are
  −0.9%/+27.7%, not noise bounds. Every run has an unmetered title call; independent
  harness-verifier duration and exact packet text were not archived. The audit
  recommends closing measurement gaps before a bounded fresh repeat of 21; no new
  model calls were made. Jev stays gated. On 2026-09-24 the user approved a limited
  daily rollout despite the unmet 25% gate; latency remains mixed and must be monitored.
  Details and rollback switch: `docs/stage5/v3-daily-rollout.md`. Audit: `node benchmarks/stages/stage5/audit-stage5.mjs`;
  tests: `node --test benchmarks/analyze.test.mjs`. Harness `--append` supports
  interleaved labels.
- Stage 5 measurement update (2026-09-23): `docs/stage5/measurement-coverage.md`.
  New benchmark records capture independent-verifier/total duration and optional
  exact packet text (`--capture-context`, benchmark channel only). Completion events
  include message IDs and a usage-availability flag; the analyzer separates coding,
  small-agent, and all-call tokens. Title completions remain unobservable on the
  installed supported extension surface, so all-call cost is partial. Historical
  36-run audit output is unchanged; no new model runs or selector changes.
- Fixture-21 confirmation (2026-09-23) **INCONCLUSIVE**:
  `docs/stage5/fixture21-confirmation.md`. Five fresh interleaved A/B pairs plus
  two off controls, 12/12 independent verify PASS, zero retries/premium;
  recorded coding input+cacheRead −22.6% versus preregistered ≥25% gate
  (paired-bootstrap lower +18.2%, AA max drift 3.7%). Complete task duration
  +6.3% B vs A. Title usage remains unavailable; no all-call saving claim.
  At the time of the benchmark, context stayed off by default; daily v3 rollout is now
  documented separately. Jev remains gated. An
  initial sandbox-denied run was retained as invalid; the separately
  preregistered r2 series completed.
- Packet-coverage work (2026-09-24): `docs/stage5/coverage-prototype.md`.
  Offline bounded file-map/import-neighbor prototype recovers 11/11 required
  files within four candidates on the six extension fixtures v3 skips, but
  those repos have only four to six eligible files and decoys rank highly.
  Prototype is benchmark-only; no plugin/selector change or model calls.
  Validate on larger held-out tasks before an opt-in live retrieval arm.
- Larger-repository coverage holdout (2026-09-24) **FAILS advance gate**:
  `docs/stage5/coverage-heldout-results.md`. Frozen prototype on ten
  symptom-led OpenRelay tasks found required files in top four 7/10 (target
  ≥8) and top two 5/10 (target ≥7); one fourth-rank hit got only four excerpt
  bytes under the packet budget. Median preparation 18.9 ms passed. No live
  arm, model calls, or plugin change. Use this set as development data and
  evaluate any ranking revision on a new holdout.
- Coverage v2 offline (2026-09-24) **FAILS advance gate**:
  `docs/stage5/coverage-v2-results.md`. Frozen 102-file snapshot, ten
  development tasks and ten fresh holdout tasks. Revised ranker reaches
  10/10 top-four recall on development; holdout meets file recall (8/10
  top-four, 7/10 top-two), packet size (≤8 KiB), and median preparation
  (26.3 ms), but labeled implementation spans appear in only 7/10 packets
  (target ≥8). No experimental plugin arm or model calls. Reuse this holdout
  only as development data; create another fresh set before integration.
- Stage 6 (memory + handoffs) **6A/6B done 2026-09-24** (`docs/stage6/stage6-plan.md`,
  `docs/stage6/capability-check.md`): transfer mechanism = fresh session + SDK prompt
  (per-request model/agent) over verified 1.18.32 routes; native continuation baseline
  frozen (server rebuilds provider context from SQLite; auto-compaction at
  `limit.input − reserved`); `permission.ask` hook dispatch NOT found in binary — verify
  before depending on it. 6B: `lib/memory/` (schemas v1, ProjectStore with per-task
  lock + revision CAS, immutable handoff snapshots via `wx`, sha256 provenance with
  32-file/4 MiB budget, path/symlink confinement) + telemetry task-identity recovery
  (`task.restored`, persisted `workflowID`/`processedMessages`; no double-count after
  restart). 247/247 bun tests, tsc clean, zero model calls. 6C done: deterministic
  handoff builder (`lib/handoff/builder.ts`, ≤512 B recovery excerpts, unknown
  provenance for un-labeled inputs), conservative note selection (`lib/memory/select.ts`,
  exact-path/reference match only, conflict retracts both), combined renderer
  (`lib/assemble/`, frozen budgets: 2/6/12 KiB, dedup vs v3 packet, omission ledger,
  mandatory-never-truncated fallbacks). Frozen 12+8 holdout
  (`test/fixtures/stage6-holdout/`, manifest `5a4a6c8f…`): first scoring run 8/20
  (caught an empty-required-list silent-loss bug + missing excerpt rendering), repeat
  after fixes 20/20, all §9 gates pass, prep p95 ≤25 ms. 259/259 tests, tsc clean.
  6D done: `OPENRELAY_MEMORY`/`OPENRELAY_HANDOFF` switches in `relay-runtime.mjs`
  (off in every channel, env wins, `--relay-status` reports them), explicit
  `openrelay_handoff_prepare`/`openrelay_handoff_continue` tools (fresh session +
  one delivery via verified routes; falls back to native continuation with recorded
  `handoff.fallback`), memory rides the system transform (per-signature cache,
  `memory.selected/skipped/invalidated` events). Bounded smoke PASS vs live server:
  one real glm-5.3-flash delivery, session/model association + receiver linkage
  verified (`docs/stage6/smoke-result.json`, driver `scripts/stage6-smoke.mjs`).
  270/270 plugin tests + 3/3 runtime tests, tsc clean. 6E done 2026-09-24
  (`docs/stage6/pilot-results.md`): 29-run 4-arm pilot, quality 29/29 PASS;
  handoff INCONCLUSIVE (corrected main-arm comparison: −15.4% on diagnosis,
  +22.6% on plan task, +6.0% across three tasks); memory did not demonstrate
  benefit in its sole selected-note run. Both features stay OFF; no 6F/6G.
  First pilot attempt invalidated by a harness bug (opencode import upserts by session
  id → shared-session contamination) + a spawnSync encoding crash; extension to ~44
  sessions/~3.2M tokens was user-approved mid-flight. Stage 6 closed with features off
  (closing report: `docs/stage6/stage6-report.md`; revisit conditions documented there).
- Stage 7 first pilot repetition executed 2026-09-24. Four mechanics workflows
  verified GLM, ChatGPT OAuth premium, and E1/E2 same-session transitions; 12/12
  scored workflows passed verification. E1/E2 used zero premium in scored tasks
  because all solved before escalation, but their median complete times were
  74.1/75.0s versus premium-first 35.7s. The preregistered no-slowdown futility
  stop fired after wave 1; no second repetition, A/A, or release. Total consumed:
  16 workflows, 1,585,522 recorded coding input+cacheRead, 438,519 premium.
  Experimental runner/policy/fixtures are under `benchmarks/`; report is
  `docs/stage7/pilot-results.md`. Daily routing/escalation remain unchanged.
- `README.md` and `docs/project-trials.md` are "LOST in 2026-09-22 wipe" placeholders — do not trust them.
