# Stage 3 Experiment Report — Output Discipline (2×2 factorial)

**Date:** 2026-09-22 · **Model:** `zai-coding-plan/glm-5.3-flash` · **Plan:** `stage3-plan.md`
**Arms:** `s3-base` (off/off) · `s3-filt` (filter on) · `s3-disc` (discipline on) · `s3-both`

## Verdict: discipline **FAILS / INCONCLUSIVE**; filtering **re-validated**

Pre-registered discipline hypothesis gate: **≥25% mean tokensOut reduction, outside variance.**

| Lever | Result | Gate |
|---|---|---|
| **Discipline** (tokensOut) | **−13.9%** (357.9 → 308.0) | ❌ inside noise (CoV 56.3%); below 25% |
| Discipline economic (tokensTotal) | **+9.4%** (no gain) | ❌ must not regress — flat-to-slightly-worse |
| Discipline turn-count (llmCalls) | +1.1% (6.0 → 6.1) | ✅ no systematic increase |
| Discipline quality | 100% verify both arms | ✅ |
| **Filtering** sanity (tokensTotal) | **−49.1%** (107,282 → 54,630) | ✅ replicates Stage 2b |
| Filtering quality | 100% verify both arms | ✅ |

## The discipline hypothesis did not hold for GLM

GLM's baseline output on these coding tasks is already terse (357 tokensOut/run). A
prompt-only discipline block cut it ~14% — inside the noise floor and not matched by any
reduction in total context (tokensTotal +9.4%, driven by one noisy-fixture run). There
was no "verbose explanation" to remove. Per the pre-registered gate: **keep discipline
off; remove unvalidated complexity** (see `stage3-plan.md` "Verdicts are per-lever").

Filtering, by contrast, re-cleared its sanity bar cleanly: −49% total context on the
corpus, −82.8% on fixture 05 specifically, zero recovery calls, 100% verify.

## Per-fixture (base → disc, tokensOut)

| fixture | base | disc | Δ |
|---|---|---|---|
| 01-trivial-edit | 128 | 200 | **+56%** (discipline *more* verbose) |
| 02-routine-bug | 232 | 196 | −16% |
| 03-medium-feature | 599 | 458 | −24% |
| 04-difficult-debug | 321 | 251 | −22% |
| 05-noisy-test-log | 509 | 434 | −15% |

Mixed sign; the trivial-edit fixture shows discipline can even *increase* output.

## Incomplete cell: `s3-both` (interaction term)

The fourth arm was **quota-limited**: GLM returned HTTP 429 "Usage limit reached for
5 hour" (reset ~18:10) partway through. Fixtures 01–02 completed (6/15); 03–05 all
failed with 429 before any tool activity. The 7 `verify: FAIL` rows in `s3-both` are
rate-limit errors, not task failures (`changedFiles: 0`, `error.name: APIError`).

**The interaction term is not needed for the decision:** discipline fails its primary
gate independently, so the combined arm would not ship regardless. Re-running `s3-both`
after the quota reset is optional and low-value.

## Notes

- Noise floors were very wide this run (tokensIn CoV 1.05, tokensInPlusCache 1.20),
  dominated by fixture-05 variance. This is the pending Stage 1 A/A-calibration issue:
  n=3 per cell cannot resolve a ~14% effect against a ~56% CoV floor.
- Discipline code (`lib/discipline.ts` + wiring, `--discipline` flag) **removed** per
  the pre-registered INCONCLUSIVE rule (remove unvalidated complexity).
