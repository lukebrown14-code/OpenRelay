# Stage 3 Plan — Output Discipline (`discipline:v1`)

**Status:** PLANNED (pre-registration; edit this doc only to record results, in a
separate `stage3-report.md`).

**Hypothesis:** GLM's conversational output compounds — every assistant token is
re-read (cached) on every subsequent turn, and cacheRead is ~78% of billable context
(Stage 2 corpus measurement). A deterministic system-prompt discipline block can cut
output tokens ≥25% without quality loss, and shrink accumulated context as a
second-order effect.

**Levers under test (2×2 factorial):** output discipline × tool-output filtering.
Both levers stay off in shipped config; arms activate them via env only.

## Implementation

1. **`lib/discipline.ts`** (plugin): versioned rules block `discipline:v1`, deterministic
   text (stable dimension; bump version only on behavior change):

   ```text
   discipline:v1
   1. When tools are needed, call them without a prose preamble.
   2. Never restate file contents, command output, or diffs in prose.
   3. No progress narration unless a step fails or blocks (then ≤1 line).
   4. Final response ≤5 lines: files changed, verification command + verdict, anomalies.
   ```

   Rule 1 deliberately targets **narration removal, not forced tool usage** — the model
   must not be nudged into unnecessary tool calls on tasks that need none.

2. **Injection point:** `experimental.chat.system.transform` — append the block to
   `output.system`. Stage 0-verified hook: fires per LLM request, mutates the outgoing
   request only, never persisted history. Hook body defensive (never throw into host).
3. **Config/env gate:** `discipline.enabled` option (default **false**);
   `OPENRELAY_DISCIPLINE=on|off` env override wins — mirrors `OPENRELAY_FILTERING`.
4. **Benchmark plumbing:** `run.mjs --discipline off|on` (validated, default off) → env
   passthrough to spawned opencode + recorded in `run.json`.
5. **Analyzer:** factorial mode — `node analyze.mjs <base> <filt> <disc> <both>`:
   per-lever main effects + interaction for tokensOut, tokensInPlusCache,
   **tokensTotal (input + cacheRead + output)**, llmCalls, durationSec, verifyPass;
   persist to `analysis-s3-*.json`.
6. **Tests:** rules appended only when enabled; env override precedence; transform hook
   defensive on malformed input; version string surfaces in telemetry-free way (run.json
   + env, no new plugin events needed).
7. **Non-goals:** no small-model pinning changes, no logit-level control, no persisted
   message rewriting (`chat.message` injection rejected: pollutes history), no
   model-based judging of verbosity.

## Experiment

2×2 factorial, 5 fixtures × 3 runs per cell = **60 runs** (~2–4 h GLM quota). All cells
run fresh in one window (reusing `s2b-on` as the filtering-only cell was considered and
rejected — temporal drift).

| label   | filtering | discipline |
|---------|-----------|------------|
| s3-base | off       | off        |
| s3-filt | on        | off        |
| s3-disc | off       | on         |
| s3-both | on        | on         |

## PASS gate (pre-registered, per lever)

Two tiers of efficiency metric:

- **Mechanism metric** — `tokensOut`: directly tests the discipline hypothesis.
- **Primary economic metric** — **tokensTotal = input + cacheRead + output** over the
  whole task: the Relay objective (total context consumption). A smaller tokensOut cut
  can still be valuable if it shrinks later cacheRead; a tokensOut win that loses on
  tokensTotal is not an enable.

Gates:

- **Quality:** 100% verify success and 100% telemetry joins, all four arms.
- **Discipline hypothesis gate:** ≥25% mean tokensOut reduction (mechanism metric),
  outside variance.
- **Discipline economic gate:** tokensTotal must not regress; the per-lever change is
  explicitly reported and drives the enable decision.
- **Filtering main effect (sanity):** replicates Stage 2b — ≥20% tokensInPlusCache
  reduction on fixture 05.
- **No turn-count regression:** `s3-disc` and `s3-both` must not cause a systematic
  increase in `llmCalls` (Stage 2 lesson: shorter responses can omit information the
  model then needs another turn to recover, erasing the saving).
- **No destructive interaction:** s3-both tokensInPlusCache ≤ s3-filt (discipline must
  not erode the filtering win); no rework (verifications/filesEdited), error, or latency
  regression outside the noise floor.
- **Verdicts are per-lever:** discipline and filtering PASS/FAIL independently; enabling
  either by default requires its own PASS. INCONCLUSIVE (savings inside noise) → keep
  off, remove unvalidated complexity.

## Risks

- **Compliance variance:** prompt-level lever only; GLM may ignore rules on some runs —
  measure per-run tokensOut spread, not just means.
- **Over-terse → extra turns:** omitted information can force recovery turns; guarded by
  the explicit llmCalls no-regression gate above.
- **Usability:** terse replies are not benchmark-measurable; judge manually before any
  default-on decision (architecture doc: "prefer concise progress reporting when it does
  not reduce usability or quality").
- **Reasoning tokens:** discipline targets final text and inter-turn prose; GLM
  reasoning tokens are tracked separately and not expected to move.
- **Noise floor:** n=3 per cell; the 2×2 gives 6 runs per lever contrast (main effect),
  doubling effective power vs a plain A/B.

## Shipping consideration (post-PASS only)

The experiment-strict `final response ≤5 lines` rule is deliberately rigid so the effect
is measurable. If Stage 3 passes, the *shipped* default should be softer:

> Default to ≤5 lines for successful coding tasks; expand when explanation, blockers,
> risks, or the user's request require it.

Enabling decisions remain separate per lever and separate from this experiment.

## Execution checklist

1. `lib/discipline.ts` + index wiring + config/env gate; `bunx tsc` + bun test green.
2. `run.mjs --discipline` + `run.json` field; dry-run smoke.
3. Analyzer factorial mode; smoke on existing labels.
4. Live smoke (1 GLM run, discipline on): confirm rules visible, output terse, quality OK.
5. Launch 60 runs (4 × `run.mjs --fixture all --runs 3`); analyze; write
   `stage3-report.md`; update this README + AGENTS.md status.
