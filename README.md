# OpenRelay

OpenRelay is an experiment lab for making AI coding harnesses use fewer tokens and finish verified work faster. The repository contains both the OpenCode runtime and a reproducible benchmark system for comparing harness changes against independent task verifiers.

Possible future names include **HarnessBench**, **RelayLab**, **TokenLab**, and **Efficient Harness**. OpenRelay remains the name of the project and runtime today.

## What the evidence says so far

| Experiment | Finding | Current status |
|---|---|---|
| Stage 1 measurement harness | Runner, telemetry, and analyzer are built; A/A calibration is still needed to establish the noise floor. | Benchmark infrastructure. |
| Stage 2 filtering | The initial filtering trial was inconclusive; Stage 2b passed on the noisy fixture with 72% fewer input plus cache-read tokens and no recovery calls observed. | Filtering remains in the plugin. |
| Stage 3 output discipline | Failed or inconclusive; the discipline code was removed and filtering was revalidated separately. | No discipline feature. |
| Stage 4 task controller | Deterministic GLM-first routing preserved quality with zero premium calls in the 15-run arm; escalation was not exercised. | Partial pass; automatic escalation remains unvalidated. |
| Stage 5 context retrieval | The audited UI-class comparison saved 15.2% of recorded coding input plus cache-read tokens; the preregistered 25% gate was not met. Fixture 21 saved 22.6% across five pairs, while complete task time rose 6.3%. | A limited daily rollout is enabled; results remain inconclusive and latency should be monitored. |
| Stage 6 memory and handoffs | All 29 retained pilot runs passed verification, but handoff results varied by task and selected memory did not show a benefit. | Both features remain off. |
| Stage 7 premium escalation | All scored tasks passed before escalation was needed. Escalation arms were slower than premium-first, so the futility stop fired. | No routing change; automatic escalation remains unvalidated. |
| Stage 8 repository maps | The offline map found 47/48 required files, matching lexical ranking. In the one live comparison it used 39.3% more recorded tokens and took 26.8% longer. | Not integrated; the pilot stopped. |

These results are bounded observations, not general performance guarantees. Independent verification is the quality gate; token use and complete task time are measured separately. Some historical measurements omit title-call usage, and several live comparisons have small samples. Read the linked reports before drawing broader conclusions.

## Repository layout

- `plugins/token-efficient/` — OpenCode plugin, telemetry, filtering, context selection, and opt-in memory/handoff components.
- `scripts/` — launcher runtime source. Installed `opencode-relay*` binaries use a copy under `~/.local/share/openrelay/runtime/`; source edits take effect after reinstalling that runtime.
- `benchmarks/run.mjs` and `benchmarks/analyze.mjs` — shared task runner and cross-label analyzer.
- `benchmarks/fixtures/` and `benchmarks/solutions/` — numbered task corpus and reference implementations; solutions are kept outside fixture workspaces.
- `benchmarks/stages/` — stage-specific experimental runners, analyzers, prototypes, and tests.
- `benchmarks/results/` — recorded benchmark outputs and ignored generated snapshots.
- `docs/` — stage plans, protocols, findings, and decisions. Start at [the experiment index](docs/README.md).

## Getting started

```sh
bun install
bunx tsc -p plugins/token-efficient/tsconfig.json
cd plugins/token-efficient && bun test ./test
node benchmarks/stages/stage5/validate-stage5.mjs
node benchmarks/stages/stage6/validate-stage6.mjs
```

Run and analyze a benchmark from the repository root:

```sh
node benchmarks/run.mjs --fixture all --runs 3 \
  --model <provider/model> --label <label>
node benchmarks/analyze.mjs <labelA> [labelB]
```

Stage-specific tools and the benchmark index are documented in [benchmarks/README.md](benchmarks/README.md). Model runs require an authenticated OpenCode provider and consume model usage; validators and unit tests do not.

## Current runtime behavior

- The daily `opencode-relay` channel uses the hash-verified bundled release. Stage 5 v3 context and filtering default on; `OPENRELAY_CONTEXT=off` disables context for a launch.
- The development launcher runs repository plugin source. Context defaults off there; filtering defaults on. Environment switches override these defaults.
- Stage 6 memory and handoff features remain off in all channels. Stage 7 automatic escalation and Stage 8 maps are not part of the daily runtime.
- Launchers load the plugin through `OPENCODE_CONFIG_CONTENT`. Do not register or symlink the plugin manually; conflict detection prevents duplicate OpenRelay registrations.
- Plugin hooks must fail safely and never throw into OpenCode. Every optimization needs independent quality verification and a token and complete-time comparison. An inconclusive result does not justify added runtime complexity.
