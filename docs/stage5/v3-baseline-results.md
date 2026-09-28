# Stage 5 v3 focused baseline — corrected results

**Runs:** 2026-09-23 (20:11–20:32 local, approximately 21 minutes).
**Audit:** 2026-09-23. **Status: INCONCLUSIVE; context off by default.**
The preregistered four-fixture UI class saves **15.2% of recorded coding
input+cacheRead**, below the ≥25% target. All 36 runs passed verification.

This edition corrects the original report's percentage denominator, two sign
errors, and overconfident interpretations of noise. See [the full audit](v3-audit-results.md)
for reproducible per-run data, trace evidence, and accounting limitations. The
original v1/v2 whole-corpus verdict is unchanged and was not re-audited here.

## Frozen setup

| Item | Value |
|---|---|
| Plugin revision | working tree on `814a0d5`, buildID `dev-e70596dac97b` (uncommitted v3; untouched during runs) |
| Model | `zai-coding-plan/glm-5.3` (same as wave-1b) |
| Arms | A = `OPENRELAY_CONTEXT=off`; B = `OPENRELAY_CONTEXT=on`; both filtering **on**, route **off**, escalate **off**, agent `build` |
| Toolchain | node v22.22.0, bun 1.3.8, rg 14.1.0, opencode 1.18.32 |
| Labels | `stage5-v3-a` (17), `stage5-v3-b` (17), `stage5-v3-aa` (2) |
| Harness delta | `benchmarks/run.mjs` gained a `--append` flag (continue run numbering under one label) so arms could interleave; harness-only, no plugin change |

Schedule: per fixture 06–09, three interleaved A/B pairs; A/A runs after the 06 and 09
blocks; then one pair each for 02/04/10; then 19/21 pilots at `--timeout 600`.
Note: the A/A pair was planned as two runs of fixture 06 but the driver's second A/A
line ran fixture 09 — the executed A/A is one extra context-off run each on 06 and 09.

## Verified coverage

- 36/36 independent verification PASS; 180 coding completions reconcile with saved
  OpenCode output. No duplicate completions detected, missing coding steps, or timeouts.
- Zero observed failed verification commands, premium calls, or escalations.
- B selector decisions match the frozen matrix 17/17: build on 06–09, 19, 21;
  skip on 02, 04, 10.
- **Accounting limit:** 36 title calls have no token records. Token figures below
  cover recorded coding completions. Session duration includes the OpenCode process
  and in-session verification, but excludes the harness's independent verifier.
- Exact packet text and system prompts were not archived; telemetry preserves
  packet file lists and decisions. Claims of byte-identical skipped prompts cannot
  be verified from these artifacts.

## Corrected per-fixture results

Changes use `100 × (B/A − 1)`; negative means B used less or finished sooner.
Token savings use the opposite sign. Table means aggregate all repetitions.

| Fixture | n/arm | Mean tokens A → B | Token change | Rounds change | Mean session s A → B | Session change |
|---|---:|---:|---:|---:|---:|---:|
| 02-routine-bug | 1 | 46,902.0 → 46,850.0 | -0.1% | +0.0% | 23.110 → 18.621 | -19.4% |
| 04-difficult-debug | 1 | 49,212.0 → 49,274.0 | +0.1% | +0.0% | 25.279 → 19.194 | -24.1% |
| 06-ui-status-indicator | 3 | 81,416.7 → 56,009.3 | -31.2% | -23.5% | 41.257 → 25.891 | -37.2% |
| 07-ui-viewport-clip | 3 | 67,269.3 → 56,284.3 | -16.3% | -18.8% | 31.442 → 29.249 | -7.0% |
| 08-ui-state-handling | 3 | 80,683.3 → 63,002.0 | -21.9% | -22.2% | 26.905 → 26.878 | -0.1% |
| 09-ui-shared-style | 3 | 49,388.7 → 61,143.7 | +23.8% | +8.3% | 30.929 → 35.241 | +13.9% |
| 10-git-missing-changes | 1 | 60,411.0 → 72,555.0 | +20.1% | +20.0% | 36.912 → 32.574 | -11.8% |
| 19-repository-refactor | 1 | 88,731.0 → 76,301.0 | -14.0% | -14.3% | 29.170 → 49.794 | +70.7% |
| 21-dependency-upgrade | 1 | 113,138.0 → 63,012.0 | -44.3% | -44.4% | 57.077 → 43.578 | -23.7% |

06 is consistently positive across its three pairs. 07 and 08 miss the numerical
savings gate. 09 costs more in each pair, with substantial variation in the first B
run; its packet benefit is not established. 19 and 21 are single-pair pilots.

## Gates and descriptive comparisons

| Measure | Corrected result | Assessment |
|---|---|---|
| UI coding-token savings | 836,274 → 709,318; **15.2%** | Below ≥25%; INCONCLUSIVE |
| UI rounds | 63 → 53; **−15.9%** | Meets ≤+10% |
| Quality | 12/12 per UI arm; 36/36 across all runs | PASS observed |
| Failed verification retries | 0 observed | No increase |
| UI session duration | 391.598 → 351.779 s; **−10.2%** | Improved measured duration |
| Observed 17-run-per-arm aggregate | **14.8%** coding-token savings; **−8.5%** session duration | Descriptive; not a whole-corpus gate |
| Pilot 19 session duration | 29.170 → 49.794 s; **+70.7%** | Flagged; single pair |
| Full all-call/task-time coverage | Title usage and independent-verifier duration missing | No complete-cost PASS claim |

The 06–08 post-hoc subset saves **23.6%**, not approximately 26%. It does not clear
the numerical target and cannot replace the preregistered 06–09 class.

## A/A observations and packet recall

The extra off run on 06 differs **−0.9%** from its three-run A mean. The extra 09
run differs **+27.7%**. These are descriptive observations from one extra run each,
not noise floors or confidence bounds; “inside noise” is not an established verdict.

19's packet lists the dashboard but omits the worker: **1 of 2 required files**.
The worker is discovered by normal exploration and read in round 2. 21's packet
lists its required adapter alongside both SDK versions and an archive decoy.
Exact excerpt contents were not preserved.

## Decision after audit

Keep v3 frozen, context off by default, and Jev gated. On 06 the traces support
reduced discovery work; on 09 the task already names its edit targets, and the
packet does not consistently replace reads or prevent further exploration. On 19
almost all extra duration falls outside measured tool intervals, so it cannot be
attributed to packet preparation. The extension's empty packets and 19's missing
worker remain retrieval limitations; the bottleneck is not universally only packet
value or statistical power.

The audit recommends closing measurement gaps before a fresh, bounded repetition
of 21. No new model runs or plugin changes were performed. See the audit's decision
section for the hypothesis and proposed next experiment.

## Historical correction ledger

The following values are retained solely to explain corrections to the first
edition; they are not current baseline-relative measurements. Most came from the
symmetric formula `100 × (A−B)/((A+B)/2)` with the sign changed for presentation.

| Item | Originally reported | Correct baseline-relative result |
|---|---|---|
| UI token savings | 16.4% | 15.2% |
| 06 token change / rounds / duration | −37.0% / −26.7% / −45.9% | −31.2% / −23.5% / −37.2% |
| 07 token change / rounds / duration | −17.8% / −20.7% / −7.2% | −16.3% / −18.8% / −7.0% |
| 08 token change / rounds | −24.6% / −25.0% | −21.9% / −22.2% |
| 09 token change / rounds / duration | +21.3% / +8.0% / +13.0% | +23.8% / +8.3% / +13.9% |
| 19 token change / rounds / duration | −15.1% / −15.4% / +52.2% | −14.0% / −14.3% / +70.7% |
| 21 token change / rounds / duration | −56.9% / −57.1% / −26.8% | −44.3% / −44.4% / −23.7% |
| 02 token change / duration | +0.1% / +21.6% | −0.1% / −19.4% (sign errors too) |
| 04 token change / duration | −0.1% / +27.4% | +0.1% / −24.1% (sign errors too) |
| 10 token change / duration | +18.3% / −12.4% | +20.1% / −11.8% |
| UI rounds | −17.2% | −15.9% |
| 09 extra off run versus A mean | 24.3% “noise” | +27.7%, descriptive only |
| 06–08 post-hoc savings | approximately 26% | 23.6% |

The 14.8% observed aggregate savings and aggregate −15.2% rounds / −8.5% session
duration already used the correct denominator and remain unchanged. These mixed
fixture aggregates do not establish a whole-corpus claim.

## Reproduction

From the repository root, `node benchmarks/stages/stage5/audit-stage5.mjs` prints the complete
audit without writing artifacts or making model calls. The raw labels remain under
`benchmarks/results/stage5-v3-{a,b,aa}` and their recorded `telemetryDir` roots.
The audit report includes a comparison command and links to all 36 run directories.
