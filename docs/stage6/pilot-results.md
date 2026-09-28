# Stage 6E pilot results — workhorse receivers, frozen sender states

**Date:** 2026-09-24. Protocol: `pilot-protocol.md` (preregistered before calls).
**Corrected analysis (2026-09-24):** 29/29 retained runs passed their independent
verifiers. Handoff B/A is **INCONCLUSIVE**: −15.4% recorded coding tokens on the
diagnosis fixture, +22.6% on the plan fixture, and +8.6% on the follow-up fixture.
Memory showed no demonstrated benefit in the one run that actually selected a note.
Both features remain off; no 6F advance. The original analysis pooled A/A controls
into A means; the table below separates them. No new model calls were made for this
correction.

## What ran

29 runs of record (plus 2 lost to a harness crash and 11 contaminated A/C attempts,
all retained transparently under `results/stage6e/*`):

| Fixture | A | B | C | D |
|---|---|---|---|---|
| 22 plan-config-compat | 4 (2 = A/A) | 1 | 2 | 2 |
| 23 failed-pipeline-diag | 4 (2 = A/A) | 2 | 2 | 2 |
| 24 memory-search-followup | 2 | 1 | 2 | 1 |
| 25 control-explicit-edit | 1 | – | – | 1 |
| 26 control-named-module | 1 | – | – | 1 |

Missing cells (22B r2, 24B r2, 24D r2) were lost when the first attempt was stopped
for contamination; n=1 cells are flagged below. **Observed quality: 29/29 verifier
PASS and 29/29 successful CLI exits.** The analyzer cannot establish a zero-retry
claim from these records.

## Headline numbers (recorded coding input+cacheRead, cell means)

| Fixture | A | B | C | D | B/A | D/A |
|---|---|---|---|---|---|---|
| 22 plan+compat | 63.5K | 77.9K | 76.4K | 72.4K | **+22.6%** | +13.9% |
| 23 failed-diag | 56.2K | 47.6K | 89.8K | 47.4K | **−15.4%** | −15.7% |
| 24 search follow-up | 56.5K | 61.3K | 62.9K | 61.5K | +8.6% | +8.9% |
| 25 control-edit | 46.9K | – | – | 46.4K | – | −1.0% |
| 26 control-module | 47.1K | – | – | 46.6K | – | −1.1% |

A/A controls are separate: fixture 22 main A averaged 63,538 tokens and A/A
63,473 (−0.1%); fixture 23 main A averaged 56,231 and A/A 62,663 (+11.4%).
These two-run controls describe variability; they cannot establish that either
intervention effect exceeds a statistical noise floor. Across the three main
fixtures with equal fixture weight, B/A was **+6.0%**, or **3,509 extra recorded
coding tokens per task**. This is a descriptive average over three tasks.

## Interpretation per feature

**Structured handoff (B/A): INCONCLUSIVE — do not ship.**
- Fixture 23 (diagnose a known failure): handoff used **15.4% fewer** tokens and
  receiver CLI time was 37.7% shorter (35.0s to 21.8s median). Both the exact
  failure and rejected approach were already in `PROGRESS.md` for every arm, so
  the specific cause of this saving is not established.
- Fixture 22 (implement an accepted plan): the single B run used 22.6% more tokens
  and took 34.0% longer than median A. `PLAN.md` was available to every arm. The
  B prompt also triggered a 2,228-byte v3 packet while A skipped v3; B/A therefore
  includes a context-layer interaction. One B run cannot establish a repeatable
  regression or isolate handoff duplication as the cause.
- Fixture 24: +8.6% tokens and +4.0% receiver time (B n=1); uncertain.
- Controls: D/A was about −1% tokens in one run each, with no selected notes;
  these are smoke checks, not evidence of a general no-regression property.

**Project memory (C/A and D/B): no demonstrated benefit — stays off.**
- Only 24D selected a note (`n-token`, 174 B), and D/B was +0.3% tokens in a
  one-run comparison. The memory-only 24C runs selected zero notes; C/A cannot
  estimate the benefit of injected memory. Fixtures 22 and 23 had no notes.
- 23C rep2 used 118K tokens, an unexplained outlier. It must not be attributed
  to memory content that was never selected.
- The `n-ranking` note was skipped for `no-reference`, before a freshness check
  could demonstrate stale-note rejection. The offline holdout covers freshness;
  this live pilot does not.

**Performance gate:** receiver CLI medians were mixed: B/A 22 +34.0%, 23 −37.7%,
24 +4.0%. These durations include transcript import for A/C but exclude the
independent verifier for every arm. The protocol's complete-workflow timing gate
cannot be evaluated from the saved runner records. No latency PASS is claimed.

## Accounting (transparent)

- Sessions consumed: ~44 against the 34-session preregistered ceiling (29 runs of
  record + 11 contaminated + 2 crash-lost + 1 in-flight kill). Tokens: ~3.2M against
  the 3M ceiling — inside the user-approved extension envelope (+1.3–1.8M over the
  original 2.07M spent at extension time) but above the original caps. The overruns
  are the direct cost of the two harness defects below.
- Defects found and fixed mid-pilot (both retained in the record):
  1. **Shared-session contamination** — the synthetic transcript shipped a fixed
     session ID and `opencode import` upserts by ID, so every A/C run continued one
     ever-growing session (56 accumulated calls). Invalidated the first 11 A/C runs;
     fixed by rewriting all IDs per run.
  2. **spawnSync encoding crash** — B/D rep-1 output parsing crashed after the model
     ran; 2 sessions spent without records. Fixed (`encoding: "utf8"`).

## Verdict

| Feature | Pilot outcome | Action |
|---|---|---|
| Structured handoff | INCONCLUSIVE (fixture-dependent; strong positive only on diagnosis-class tasks, n=1) | Stays off; no 6F advance as a general feature |
| Selected project memory | FAIL to advance (one live selected-note run; value inconclusive) | Stays off |

Per the protocol: INCONCLUSIVE adds no complexity; the same holdout/fixtures are not
to be reused for a later PASS claim without fresh tasks. If a narrow
diagnosis-handoff feature is ever reconsidered, it needs a new preregistered
protocol with fresh fixtures and real sender sessions (6F design), not a re-run of
this corpus.

The corrected analyzer checks coding usage completeness and duplicate completion
IDs, retains A/A labels, and reports median receiver CLI time. The 29 retained runs
total 1,785,215 recorded coding input+cacheRead tokens. It reports no bootstrap
interval because these sparse, unequal cells cannot support a confirmation claim.
Title and other unobserved calls are excluded from token totals.

Raw data: `benchmarks/results/stage6e{,-aa}`, telemetry
`~/.local/share/openrelay/data/benchmarks/stage6e{,-aa}`, analyzer
`benchmarks/stages/stage6/analyze-stage6.mjs`, driver logs under the session temp dir.
