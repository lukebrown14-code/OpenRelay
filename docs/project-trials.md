# Project Trials

Log of benchmark trials run against the OpenRelay plugin. Each trial records what changed,
what was measured, and what it taught us. Reconstructed from the surviving benchmark
results and telemetry after the 2026-09-22 repo wipe; figures are measured means from
`benchmarks/results/analysis-*.json` unless marked otherwise.

## What each entry tracks

1. **Task attempted** — fixture(s) and what the task asks of the agent.
2. **Relay features enabled/disabled** — filtering, discipline, preview profile.
3. **Model used** — provider/model id.
4. **Worked first time** — whether verification passed on the first edit (proxy:
   `changedFiles`/`verifyPass`/verification count; not yet a first-class metric).
5. **Corrections/rework needed** — edit-test cycles, files edited, diff size.
6. **Tests/verification result** — `verifyPass` rate and final verify output.
7. **Missing context / bad decisions** — observed failure modes and root causes.
8. **Token/turn usage** — `tokensIn/Out`, `cacheRead`, `tokensTotal`, `llmCalls`.
9. **Subjective quality/usability** — model behavior observations from transcripts.
10. **Comparison vs Relay-off** — the same task with the feature disabled.

Model across all trials below: `zai-coding-plan/glm-5.3-flash` (GLM Coding Plan).

---

## Trial 1 — Stage 1 A/A calibration

- **Task:** fixtures 01–04, 3 runs each (12 runs). **Features:** none (baseline).
- **Worked first time:** yes — every run reached `verifyPass`.
- **Rework:** one-shot edit-then-verify tasks; minimal diffs.
- **Verification:** 100% (12/12).
- **Token/turn (mean):** tokensOut 327 · tokensIn 8,725 · in+cacheRead 53,050 · llmCalls 5.6 ·
  duration 28.3 s.
- **Notes:** baseline noise floor established (tokensIn CoV 0.65). Confirmed GLM
  cache-token reporting varies across runs — the pending A/A exit criterion.

## Trial 2 — Stage 2 tool-output filtering (A/B)

- **Task:** fixtures 01–05, 3 runs × {filtering off, on}. **Model:** GLM flash.
- **Worked first time:** yes in both arms (100% verify) — but the *filtered* arm needed
  extra turns to recover details the filtered view dropped.
- **Rework:** 0 recoveries (off) vs ~6 recovery-tool calls/run (on), most returning empty.
- **Verification:** 100% (15/15) both arms.
- **Token/turn (mean):** off → on: tokensOut 335 → 424 · llmCalls 5.9 → 7.0 ·
  in+cacheRead 84,133 → 79,744. Fixture 05 specifically: input 35,460 → 30,410 (−14%),
  in+cacheRead −7.8%, turns 7.3 → 13.0.
- **Missing context / bad decisions:** (a) OpenCode truncates bash output *before* the hook
  — the filter stored a corpse, so recovery searched a log missing the failure; (b) no bail
  rule — a failing run was compressed to an evidence-free 217 B view; (c) `metadata.output`
  leaked 30 KB of raw output into the request even when filtered; (d) omission note mislabeled
  the truncated tail as "full raw output".
- **Comparison vs Relay-off:** bytes −99.6%, but net tokens flat because the recovery loop
  added turns and each turn re-reads the cached context.
- **Verdict:** INCONCLUSIVE — turn overhead ate the byte savings.

## Trial 3 — Stage 2b act-complete filtering (A/B)

- **Task:** fixtures 01–05, 3 runs × {off, on}. **Features:** failure-card filtering +
  PASS-collapse + `metadata.output` sanitation + full-log parsing (`metadata.outputPath`).
- **Worked first time:** yes; **rework:** 0 recovery calls in the on-arm.
- **Verification:** 100% (15/15) both arms.
- **Token/turn (mean):** off → on: llmCalls 5.8 → 5.7 · in+cacheRead 88,240 → 55,921 (−37%).
  Fixture 05: in+cacheRead 231,431 → 63,936 (**−72.4%**), turns 7.33 → 6.33, 0 recoveries,
  byte reduction 99.0%.
- **Comparison vs Relay-off:** every on-run beat every off-run on fixture 05 (no overlap).
- **Verdict:** **PASS.** The winning move was a self-sufficient filtered view (got/want +
  location + summary) that removed the need for follow-up turns.

## Trial 4 — Stage 3 output discipline (2×2 factorial)

- **Task:** fixtures 01–05, 3 runs × 4 cells. **Features:** `discipline:v1` system-prompt
  rules × tool-output filtering.
- **Verification:** 100% in the three completed arms (base/filt/disc); the `both` cell was
  GLM-quota-limited (HTTP 429) on fixtures 03–05.
- **Token/turn (mean):** base → disc: tokensOut 358 → 308 (**−13.9%**, inside 56% noise),
  tokensTotal +9.4%, llmCalls 6.0 → 6.1. base → filt: tokensTotal 107,282 → 54,630
  (**−49%**), llmCalls 6.0 → 5.5.
- **Missing context / bad decisions:** fixture 01 got *more* verbose under discipline
  (128 → 200 tokensOut) — discipline can backfire on trivial tasks.
- **Subjective quality/usability:** GLM is already terse on these coding tasks; there was
  little conversational output to remove, so a prompt-level nudge added no measurable value.
- **Comparison vs Relay-off:** discipline ≈ no-op (inside noise); filtering re-validated its
  Stage 2b win independently.
- **Verdict:** discipline FAILS/INCONCLUSIVE (code removed per the pre-registered rule);
  filtering re-validated.

---

## Template for future trials

```markdown
## Trial N — <name>

- **Task attempted:** <fixtures / description>
- **Relay features enabled/disabled:** <filtering | discipline | previewSafe | none>
- **Model used:** <provider/model>
- **Worked first time:** <yes/no/partial + evidence>
- **Corrections/rework needed:** <edit-test cycles, files, diff size>
- **Tests/verification result:** <verifyPass rate + tail>
- **Missing context / bad decisions:** <observed failure modes + root causes>
- **Token/turn usage:** <tokensIn/Out, cacheRead, tokensTotal, llmCalls, duration>
- **Subjective quality/usability:** <transcript-based observations>
- **Comparison vs Relay-off:** <same task with feature disabled>
- **Verdict:** <PASS / FAIL / INCONCLUSIVE>
```
