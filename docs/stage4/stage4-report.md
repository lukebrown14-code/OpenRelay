# Stage 4 Experiment Report — Task Controller v1

**Date:** 2026-09-22 · **Premium model:** `openai/gpt-5.5` · **Workhorse model:**
`zai-coding-plan/glm-4.7` · **Plan:** `stage4-plan.md`

## Split Verdict

- **Deterministic GLM-first routing: PASS (preliminary).** Quality was preserved while
  eliminating premium calls in this corpus.
- **Automatic escalation: INCONCLUSIVE / unvalidated.** No GLM-first run reached the
  escalation threshold, so the live escalation recovery gate was not exercised.
- **Overall Stage 4:** routing is validated for this corpus; escalation and checkpoint
  behavior remain opt-in and unvalidated.

## Experiment

30 live runs: 5 fixtures × 3 runs × 2 arms. Filtering was off in both arms.

| Arm | Route | Escalation | Runs |
|---|---|---:|---:|
| `stage4-premium` | force premium | off | 15 |
| `stage4-glm` | deterministic auto, GLM-first | on | 15 |

Both arms used fresh fixture workspaces. All 30 runs joined telemetry successfully.

## Results

| Metric | Premium-first | GLM-first | Observation |
|---|---:|---:|---|
| Verify pass rate | 100% | 100% | No quality regression |
| Premium calls/run | 6.00 | 0.00 | 100% fewer in GLM-first |
| Workhorse calls/run | 0.00 | 5.07 | Expected routing shift |
| Tokens total/run | 139,726 | 104,296 | 25.4% lower GLM-first; high variance |
| Tokens out/run | 617 | 328 | 46.8% lower GLM-first |
| Duration/run | 27.63s | 46.13s | GLM-first 67% slower |
| Telemetry joins | 15/15 | 15/15 | Gate passed |

The noisy fixture (`05-noisy-test-log`) was the largest context case: GLM-first reduced
`tokensTotal` from 501,413 to 303,912 on average, while both arms still verified 100%.
The analyzer reported wide variance, so the economic comparison is directional rather
than statistically strong.

## Wall-Time Profile

The completed telemetry was profiled by summing assistant inference latency, tool-call
duration, and verification duration (verification is a subset of tool time). Residual is
`run.durationMs - inference - tool time`; it is an approximation because provider latency
and host event timestamps are not guaranteed to be perfectly additive.

| Component | Premium-first | GLM-first | Wall-time share, GLM-first |
|---|---:|---:|---:|
| Wall time | 27.6s | 46.1s | 100% |
| Assistant/model inference | 25.8s | 43.6s | 94.6% |
| Tool execution | 0.8s | 1.4s | 3.0% |
| Verification subset | 0.4s | 0.7s | 1.5% |
| Residual/plugin approximation | 1.0s | 1.1s | 2.4% |

GLM-first was slower by 18.5s/run on average, almost entirely inference latency. The
Relay-controlled residual was effectively unchanged, and tool execution remained small.
The noisy fixture had the largest tool time (3.9s GLM-first), but that was still only a
small fraction of its 82.1s wall time. **No wall-time optimization is justified here:**
reducing provider/model latency would require provider changes or additional routing
complexity and could increase scarce-token usage. Keep the current implementation and
measure again if Relay features materially change tool or hook behavior.

## Escalation Result

The GLM-first arm produced zero `controller.escalated` events, including on
`04-difficult-debug` (0/3 runs). This is not evidence that escalation works or is
unnecessary; the corpus simply did not create the required repeated failed-verification
condition. The escalation gate remains open and `OPENRELAY_ESCALATE` stays opt-in.

## Implementation Findings

The first smoke exposed two runtime issues before the valid comparison:

1. Eager `client.provider.list()` during plugin initialization blocked startup. Model
   enumeration is now lazy and bounded to five seconds.
2. Enumeration selected an unrelated first `glm-*` provider (`bothub`) instead of the
   explicitly requested `zai-coding-plan/glm-4.7`. Same-tier current models are now
   preserved; enumeration is used only for cross-tier routing.

After those fixes, the GLM smoke and premium smoke both passed, and telemetry recorded
the expected model/tier (`zai-coding-plan/glm-4.7` as workhorse and `openai/gpt-5.5` as
premium).

## Follow-up

- Keep deterministic GLM-first routing available for further live validation; do not
  enable automatic escalation by default yet.
- Add or select a deterministic failing fixture that reaches three failed verifications,
  then rerun the escalation recovery smoke and gate.
- Exercise `/glm`, `/chatgpt`, `/plan`, `/review`, `/deep`, and `/auto` through a live
  interactive smoke; current coverage is unit-level plus env-forced routing.
- Do not add Jev routing until deterministic routing shows measurable unresolved misses.
