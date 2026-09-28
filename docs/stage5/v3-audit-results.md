# Stage 5 v3 audit — corrected measurements and trace findings

**Date:** 2026-09-23. **Scope:** the existing 36-run focused baseline only; no new
model calls. **Verdict: INCONCLUSIVE.** Recorded coding input+cacheRead savings for
the preregistered UI class are **15.2%**, below the 25% target. Quality and selector
mechanics remain green. Context stays off by default; v3 and Jev remain unchanged.

**Later measurement work:** `measurement-coverage.md` describes new verifier timing,
benchmark packet capture, and explicit usage coverage for future runs. It does not
recover title tokens or independent-verifier times from these frozen records.

This report supersedes the arithmetic and interpretation in the original
`v3-baseline-results.md`. Its corrected edition retains the original setup and a
correction ledger. The v1/v2 historical experiments have not been re-audited here.

## Reproduction and evidence integrity

Run from the repository root:

```sh
node --test benchmarks/analyze.test.mjs
node benchmarks/stages/stage5/audit-stage5.mjs > /tmp/openrelay-stage5-audit.json
cmp docs/stage5/v3-audit-data.json /tmp/openrelay-stage5-audit.json
```

The audit command reads artifacts and prints deterministic JSON. It makes no model
calls and writes no files itself. It exits nonzero on missing/ambiguous evidence or
unexpected run settings. [Machine-readable results](v3-audit-data.json) preserve
per-run metrics, source locations, SHA-256 hashes, token reconciliation, packet file
lists, and comparisons. Original run files, output streams, and telemetry are unmodified.

- Exactly **36 distinct sessions**: 17 A, 17 B, and 2 additional A/A controls.
- **180 coding completions** reconcile exactly against OpenCode `step_finish` records,
  matching all five token fields with multiplicity: input, cacheRead, output,
  reasoning, and cacheWrite. No exact duplicate telemetry completions or repeated
  output step IDs were found. No coding call/step count gaps were found.
- All runs used `zai-coding-plan/glm-5.3`, agent `build`, filtering on, routing and
  escalation off, and telemetry build `dev-e70596dac97b`. Context differs by arm.
- **36/36 independent verification PASS**, no timeouts or nonzero OpenCode exits.
  All 36 saved verification scripts match the current fixture copies. Every run
  also contains one successful model-invoked `node verify.js` command. No failed
  verification tool exits were observed; the telemetry retry counter is also zero.
- **17/17 B decisions match** the frozen matrix: 14 build and 3 skip.
  Recorded model calls contain zero premium calls; recorded escalations are zero.

### Accounting limits

**Title usage is missing.** Every run has one `llm.call` for agent `title` but no
corresponding metered completion. Both data sources agree on coding usage because
both omit these 36 title completions. The model-call records identify them as the
same workhorse model, but their tokens are unknown. Therefore the token tables
measure **recorded coding completions**, not the original plan's full all-call cost.
Do not substitute zero for title usage or claim the accounting audit establishes
complete provider usage. The below-target coding result cannot establish a PASS.

**Timing stops before independent verification.** `run.durationMs` measures the
OpenCode subprocess, including startup, context preparation, and in-session tools.
The harness invokes its independent verifier afterward and does not record that
duration. Tables call this *session duration*, not complete task wall time. Tool
time below is the union of measured tool intervals, avoiding overlap double counts.
The remainder includes model/transport/orchestration/startup time and is not a
measurement of provider latency alone.

**Packet text was not archived.** Events preserve selected file names, byte counts,
search counts, and decisions, but not exact excerpts or outgoing system prompts.
This audit uses those records and saved tool output without reconstructing a packet.
It cannot prove exact packet bytes or prompt equality on skipped sessions.

**Completion telemetry lacks message IDs.** Duplicate checks use exact event records
plus token-vector matching against uniquely identified output steps. There is no
stronger message-ID join available in these artifacts.

## Corrected calculations

Savings are `100 × (1 − sum(B)/sum(A))`. Changes are
`100 × (sum(B)/sum(A) − 1)`; negative means B used less or finished sooner. Every
fixture below has equal repetitions across arms. Class totals sum those runs,
without averaging fixture percentages. Pilots and A/A controls do not enter the
original UI class. Zero-baseline percentage changes are unavailable; retry changes
are absolute differences per run.

The previous analyzer used `100 × (A−B)/((A+B)/2)` in its fixture and category tables.
Those symmetric differences were copied into the report as baseline-relative
changes. The overall gate already used the correct denominator. The report also
reversed the signs for both token and latency changes on fixtures 02 and 04.
Stage 5 and per-fixture output now use baseline-relative calculations; the retained
symmetric comparison is explicitly a descriptive spread diagnostic, not a
confidence bound. Stage 5 refuses a savings comparison with unmatched repetitions
or missing token measurements, and separates extension categories from the original UI class.

| Fixture | n/arm | Mean tokens A → B | Token change | Rounds A → B | Mean session s A → B | Session change |
|---|---:|---:|---:|---:|---:|---:|
| 02-routine-bug | 1 | 46,902.0 → 46,850.0 | -0.1% | 4.00 → 4.00 | 23.110 → 18.621 | -19.4% |
| 04-difficult-debug | 1 | 49,212.0 → 49,274.0 | +0.1% | 4.00 → 4.00 | 25.279 → 19.194 | -24.1% |
| 06-ui-status-indicator | 3 | 81,416.7 → 56,009.3 | -31.2% | 5.67 → 4.33 | 41.257 → 25.891 | -37.2% |
| 07-ui-viewport-clip | 3 | 67,269.3 → 56,284.3 | -16.3% | 5.33 → 4.33 | 31.442 → 29.249 | -7.0% |
| 08-ui-state-handling | 3 | 80,683.3 → 63,002.0 | -21.9% | 6.00 → 4.67 | 26.905 → 26.878 | -0.1% |
| 09-ui-shared-style | 3 | 49,388.7 → 61,143.7 | +23.8% | 4.00 → 4.33 | 30.929 → 35.241 | +13.9% |
| 10-git-missing-changes | 1 | 60,411.0 → 72,555.0 | +20.1% | 5.00 → 6.00 | 36.912 → 32.574 | -11.8% |
| 19-repository-refactor | 1 | 88,731.0 → 76,301.0 | -14.0% | 7.00 → 6.00 | 29.170 → 49.794 | +70.7% |
| 21-dependency-upgrade | 1 | 113,138.0 → 63,012.0 | -44.3% | 9.00 → 5.00 | 57.077 → 43.578 | -23.7% |

The UI class has **836,274 → 709,318** recorded input+cacheRead tokens, **63 → 53**
rounds, and **391.598 → 351.779 seconds** summed session duration across 12 runs per
arm. Its savings are **15.2%**, rounds fall **15.9%**, and session duration falls
**10.2%**. Verify success is 12/12 in each arm, with no observed retry increase.

Across the deliberately mixed observed sample (17 runs per arm), savings are
**14.8%** and session duration falls **8.5%**. This is descriptive and is not a
whole-corpus result or the preregistered class gate.

Even the post-hoc 06–08 subset yields only **23.6%** savings
(688,108 → 525,887), not the previously reported approximately 26%. Removing 09
would neither be a valid way to rescue the preregistered class nor clear the
numerical target. The gate failure is not attributable solely to 09.

### A/A observations

- **06:** the extra off run used 80,679 tokens versus the three-run A mean of
  81,416.667: **−0.9%**. The three A runs themselves span **76,839–87,211**.
- **09:** the extra off run used 63,056 versus the A mean of 49,388.667:
  **+27.7%**, correcting the symmetric 24.3% figure. The original three A runs
  span **49,259–49,456**; B spans **51,419–79,117**.

Each is one extra run versus a three-run mean, not an estimated noise floor or a
confidence interval. The 09 A/A observation demonstrates behavioral variation; it
does not establish that the measured B regression is harmless or entirely noise.
The original driver ran one extra 06 and one extra 09, rather than its planned two 06 controls.

## Trace review

Run references below use `A`, `B`, and `AA` for `stage5-v3-a`, `stage5-v3-b`, and
`stage5-v3-aa`. Each full session ID and artifact directory is listed in the per-run
table. Tool rounds and commands are from that run's `opencode-output.jsonl`;
packet metadata comes from its session-matched telemetry.

### 09: repeated file reading, added exploration, and real uncertainty

All three A runs read `verify.js`, `styles/cards.css`, and `src/render.js` together
in round 1; edit the CSS and renderer in round 2; verify in round 3; finish in
round 4. Their costs are nearly identical: 49,456 / 49,451 / 49,259 tokens.

All three B packets list `styles/cards.css`, `src/render.js`, and `index.html`,
with 2,388 bytes and 30–33 ms preparation. The task already names the two edit
targets. The traces differ:

- **B/09/1**, session `ses_f32364602ffe4v9OkuCqkpu755`: round 1 reads the verifier
  and runs `glob **/*`; round 2 reads `index.html`; edits move to round 3. It uses
  five rounds and 79,117 tokens, **60.0% more than A/09/1**. Round 2 input+cacheRead
  is 16,347 after the broad glob, versus 12,505 in A's second round. Extra discovery
  and the larger subsequent context are directly visible; packet causation is not proved.
- **B/09/2**, session `ses_f3234edd5ffedrCYnfeWitIciX`: rereads `styles/cards.css`
  alongside the verifier, then edits both targets. Four rounds; 51,419 tokens,
  **4.0% more than its A pair**.
- **B/09/3**, session `ses_f3233680cffeQChjriynVojSKH`: rereads both packet-listed
  targets and the verifier. Four rounds; 52,895 tokens, **7.4% more than its A pair**.

**AA/09/1**, session `ses_f3232c4b7ffepb0NaQZ7wAH2zf`, also adds an `index.html`
read in round 2 without a packet, reaching five rounds and 63,056 tokens. This
supports behavioral variation as one explanation for extra exploration. All B
pairs still cost more than their A counterparts; there is no demonstrated packet
benefit on 09. The evidence supports reviewing packet usefulness, not tuning a
selector rule from these few outcomes.

In-session verification itself takes approximately 10.4–10.6 seconds on these
runs. That is measured tool time, not model delay. Exact excerpt overlap cannot
be established without the original packet text.

### 19: incomplete recall; latency mostly outside tools

**A/19/1**, session `ses_f322fb612ffeytxUUvFmL7wrch`, lists files in round 1,
reads both live entry points in round 2, then reads the archive and package metadata
in separate rounds before writing the solution. It takes seven rounds and 88,731 tokens.

**B/19/1**, session `ses_f322f42a3ffebqHL2hVL2fwbI5`, receives a 601-byte packet
listing only `src/web/dashboard.js`: **one of two required files**. Preparation
takes 29 ms. It rereads the dashboard and runs `find` in round 1; the listing includes
`src/worker/handle.js`, which it reads in round 2 alongside the verifier, task,
payments module, and archive. It writes the shared helper in round 3 and the two
consumers in round 4. It takes six rounds and 76,301 tokens: **14.0% savings**.

Session duration is **29.170 → 49.794 seconds (+70.7%)**. The union of tool intervals
is **0.282 → 0.591 seconds**. Time outside tools is **28.888 → 49.203 seconds**,
accounting for 20.315 seconds of the total 20.624-second increase. The gap between
B's second and third step finishes is about 16.5 seconds. Available timestamps do
not distinguish model reasoning, provider/transport delay, or orchestration waits.
The latency increase cannot be attributed to the 29 ms retrieval preparation.
The missing worker evidence is real, but this pair does not prove that it caused
the slower run.

### 06: fewer discovery rounds consistently accompany savings

A/06/1 and A/06/2 begin with glob/listing, then read source; A/06/3 spends four
rounds navigating directories and reading files before editing. Their total
round counts are **5 / 5 / 7**. All three B packets list the system panel and its
distractors plus CSS (2,106 bytes, 41–51 ms preparation). Each B run reads the
system panel in round 1; B/06/3 reads one additional panel in round 2. Total rounds
are **4 / 4 / 5**. The paired token changes are **−31.2% / −37.8% / −25.1%**.

This is consistent with the packet displacing file-location work; it does not
eliminate all rereads. The observed aggregate savings are **31.2%**, supported
across all three pairs. That is strong fixture-specific evidence, not a validated
UI-class rollout result or complete all-call accounting.

### 10: an additional Git inspection without a packet

**A/10/1**, session `ses_f3230c752ffeXAOf6O0XcZelGt`, reads config and history,
inspects the target commit, merges it, and verifies: five rounds, 60,411 tokens.
**B/10/1**, session `ses_f323035beffebw3GE1LeaBxxl9`, records `skip/git-intent` and
no packet. It adds `git status` to the initial history command and a separate
`git show fba144b --stat` round before merging: six rounds, 72,555 tokens.

The **20.1% token increase** accompanies an observed extra inspection round;
session duration nevertheless falls **11.8%**. This single pair cannot quantify
normal variance or prove prompt identity. Git-intent exits before the rg probe,
so the earlier blanket explanation of a roughly 50 ms probe on all skip runs
does not apply here. No packet duplication explains this pair's extra work.

## Decision and next experiment

**Overall Stage 5 remains INCONCLUSIVE.** The UI savings point estimate misses
the gate; full all-call token and task-wall-time coverage is also incomplete.
Verified coding quality and observed retries pass. Neither a new selector nor
default-on rollout is justified by this audit. The broader extension's empty
packets remain a distinct retrieval limitation; 19 also demonstrates incomplete
recall even when a packet is built. The earlier claim that candidate generation
is categorically not a bottleneck was too broad.

Recommended order, with no further implementation or model runs authorized by
this audit:

1. **Close the measurement gaps before a new experiment.** Capture title completion
   usage and independent verifier duration, and retain bounded packet evidence for
   these synthetic fixtures. Keep the historical coding-only series separately
   comparable. These are prerequisites for an all-call/full-wall-time claim.
2. **Next model experiment: repeat fixture 21 with frozen v3.** Test whether its
   **44.3%** coding-token pilot saving (113,138 → 63,012) persists across a fresh,
   fixed batch of five interleaved A/B pairs, alternating which arm runs first,
   plus two independent off controls. Keep the pilot outside confirmation totals.
   Use the same workhorse and arm settings, preregister accounting and uncertainty
   treatment before running, and preserve the ≥25% savings and quality/rework gates.
   This resolves whether the strongest extension signal is reproducible; even a
   positive result supports this fixture only, not all dependency migrations.
3. **Defer further selector work and Jev.** No n-driven threshold changes or broad
   corpus rerun follow automatically. A broader retrieval experiment requires a
   separate hypothesis for the empty/incomplete packets.

## Per-run measurements

All rows passed independent verification and token reconciliation, with zero
observed failed verification commands. `Tokens` is input+cacheRead from recorded
coding completions; `s` is session duration. The linked directory contains the
unchanged `run.json` and `opencode-output.jsonl`; full hashes and other fields are
in `v3-audit-data.json`.

| Run | Session ID | Tokens | Rounds | s |
|---|---|---:|---:|---:|
| [A/02/1](../../benchmarks/results/stage5-v3-a/02-routine-bug/run-01) | `ses_f32321a09ffev2FjrsovzmCwse` | 46,902 | 4 | 23.110 |
| [A/04/1](../../benchmarks/results/stage5-v3-a/04-difficult-debug/run-01) | `ses_f32317627ffeKLBKTzKzCSxvmv` | 49,212 | 4 | 25.279 |
| [A/06/1](../../benchmarks/results/stage5-v3-a/06-ui-status-indicator/run-01) | `ses_f32401458ffeh5F0WadumjlRp2` | 76,839 | 5 | 47.020 |
| [A/06/2](../../benchmarks/results/stage5-v3-a/06-ui-status-indicator/run-02) | `ses_f323ecd70ffeqDLVWYsrUHl1Zv` | 80,200 | 5 | 42.550 |
| [A/06/3](../../benchmarks/results/stage5-v3-a/06-ui-status-indicator/run-03) | `ses_f323dcb17ffe9Ffni1C0N3icVf` | 87,211 | 7 | 34.200 |
| [A/07/1](../../benchmarks/results/stage5-v3-a/07-ui-viewport-clip/run-01) | `ses_f323c683affeRQBTlxGpuNNu2n` | 76,657 | 6 | 35.691 |
| [A/07/2](../../benchmarks/results/stage5-v3-a/07-ui-viewport-clip/run-02) | `ses_f323b5808ffePxNzTR5ly5E9JW` | 63,044 | 5 | 27.952 |
| [A/07/3](../../benchmarks/results/stage5-v3-a/07-ui-viewport-clip/run-03) | `ses_f323a66f6ffeEwAU69zBPZe8VK` | 62,107 | 5 | 30.683 |
| [A/08/1](../../benchmarks/results/stage5-v3-a/08-ui-state-handling/run-01) | `ses_f32397ca9ffebX2eciIsxu67zt` | 77,541 | 5 | 21.157 |
| [A/08/2](../../benchmarks/results/stage5-v3-a/08-ui-state-handling/run-02) | `ses_f3238ca93ffeUvbDZp0NZ7ITow` | 74,832 | 6 | 23.810 |
| [A/08/3](../../benchmarks/results/stage5-v3-a/08-ui-state-handling/run-03) | `ses_f3237d5f2ffemKkMEwY0nBBQ95` | 89,677 | 7 | 35.748 |
| [A/09/1](../../benchmarks/results/stage5-v3-a/09-ui-shared-style/run-01) | `ses_f3236e0eeffevIoAYa4497wct8` | 49,456 | 4 | 27.514 |
| [A/09/2](../../benchmarks/results/stage5-v3-a/09-ui-shared-style/run-02) | `ses_f323596d7ffeALi429OvamusqN` | 49,451 | 4 | 31.575 |
| [A/09/3](../../benchmarks/results/stage5-v3-a/09-ui-shared-style/run-03) | `ses_f3234195fffekzAc4tnoAxk7Cs` | 49,259 | 4 | 33.698 |
| [A/10/1](../../benchmarks/results/stage5-v3-a/10-git-missing-changes/run-01) | `ses_f3230c752ffeXAOf6O0XcZelGt` | 60,411 | 5 | 36.912 |
| [A/19/1](../../benchmarks/results/stage5-v3-a/19-repository-refactor/run-01) | `ses_f322fb612ffeytxUUvFmL7wrch` | 88,731 | 7 | 29.170 |
| [A/21/1](../../benchmarks/results/stage5-v3-a/21-dependency-upgrade/run-01) | `ses_f322e7efdffe0lojfArnUgDvDz` | 113,138 | 9 | 57.077 |
| [AA/06/1](../../benchmarks/results/stage5-v3-aa/06-ui-status-indicator/run-01) | `ses_f323cd8f4ffeOK75U9GRq3md8C` | 80,679 | 5 | 27.850 |
| [AA/09/1](../../benchmarks/results/stage5-v3-aa/09-ui-shared-style/run-01) | `ses_f3232c4b7ffepb0NaQZ7wAH2zf` | 63,056 | 5 | 33.562 |
| [B/02/1](../../benchmarks/results/stage5-v3-b/02-routine-bug/run-01) | `ses_f3231bf4bffeq1qCojlPYB1Yvw` | 46,850 | 4 | 18.621 |
| [B/04/1](../../benchmarks/results/stage5-v3-b/04-difficult-debug/run-01) | `ses_f323112daffePkf32UWoBGrdl9` | 49,274 | 4 | 19.194 |
| [B/06/1](../../benchmarks/results/stage5-v3-b/06-ui-status-indicator/run-01) | `ses_f323f55ccffe1mFm2EIGl83g4E` | 52,835 | 4 | 33.103 |
| [B/06/2](../../benchmarks/results/stage5-v3-b/06-ui-status-indicator/run-02) | `ses_f323e2003ffeg3mZ37f5pYtmG7` | 49,852 | 4 | 20.046 |
| [B/06/3](../../benchmarks/results/stage5-v3-b/06-ui-status-indicator/run-03) | `ses_f323d3ef8ffeR8azUMVqS1rMDb` | 65,341 | 5 | 24.524 |
| [B/07/1](../../benchmarks/results/stage5-v3-b/07-ui-viewport-clip/run-01) | `ses_f323bd0f6ffeKaZRa5QSKWVUUI` | 51,966 | 4 | 29.954 |
| [B/07/2](../../benchmarks/results/stage5-v3-b/07-ui-viewport-clip/run-02) | `ses_f323ae582ffe3d8mvEXsDOCKML` | 51,266 | 4 | 31.309 |
| [B/07/3](../../benchmarks/results/stage5-v3-b/07-ui-viewport-clip/run-03) | `ses_f3239eb83ffeRRCPkzArgnHkzT` | 65,621 | 5 | 26.485 |
| [B/08/1](../../benchmarks/results/stage5-v3-b/08-ui-state-handling/run-01) | `ses_f32392406ffeaEl4NMkz0wezpu` | 77,655 | 5 | 21.504 |
| [B/08/2](../../benchmarks/results/stage5-v3-b/08-ui-state-handling/run-02) | `ses_f32386668ffe3U0u8n6ogoardG` | 48,511 | 4 | 35.507 |
| [B/08/3](../../benchmarks/results/stage5-v3-b/08-ui-state-handling/run-03) | `ses_f3237434effeQlPozkv7w4MY0M` | 62,840 | 5 | 23.624 |
| [B/09/1](../../benchmarks/results/stage5-v3-b/09-ui-shared-style/run-01) | `ses_f32364602ffe4v9OkuCqkpu755` | 79,117 | 5 | 33.233 |
| [B/09/2](../../benchmarks/results/stage5-v3-b/09-ui-shared-style/run-02) | `ses_f3234edd5ffedrCYnfeWitIciX` | 51,419 | 4 | 42.654 |
| [B/09/3](../../benchmarks/results/stage5-v3-b/09-ui-shared-style/run-03) | `ses_f3233680cffeQChjriynVojSKH` | 52,895 | 4 | 29.836 |
| [B/10/1](../../benchmarks/results/stage5-v3-b/10-git-missing-changes/run-01) | `ses_f323035beffebw3GE1LeaBxxl9` | 72,555 | 6 | 32.574 |
| [B/19/1](../../benchmarks/results/stage5-v3-b/19-repository-refactor/run-01) | `ses_f322f42a3ffebqHL2hVL2fwbI5` | 76,301 | 6 | 49.794 |
| [B/21/1](../../benchmarks/results/stage5-v3-b/21-dependency-upgrade/run-01) | `ses_f322d9fceffercYi8EGCbXQi3z` | 63,012 | 5 | 43.578 |
