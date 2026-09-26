# Stage 6E pilot protocol — workhorse receivers, frozen sender states

**Status:** preregistered 2026-09-24 before any pilot model call. Authorization: user
approved running 6E with the plan's caps and stop rules (including the explicit
early-stop triggers requested on 2026-09-24).

**Retrospective reading note (2026-09-24; protocol below unchanged):** The runner
stored `PLAN.md` and `PROGRESS.md` at workspace root, not under `.tasks/` as
described below. The A/C memory-off wording below is a typo: C/D used memory-on.
In the verdict line, handoff is B/A and memory is C/A plus D/B. The saved runner
recorded receiver CLI time without independent-verifier time, and the final pilot
had missing cells. See `pilot-results.md` for the corrected analysis; these
clarifications do not retroactively change the preregistered gates.

## Question

Does a structured-handoff receiver (B) or handoff+memory receiver (D) complete a
continuation task at equal verified quality for fewer recorded coding tokens and no
more wall time than native history continuation (A), and does selected project memory
(C) add value over A?

This is a **receiver-side screening pilot** on frozen synthetic sender states: no
end-to-end or premium-saving claim. Sender construction cost is zero by construction
(synthetic transcripts, no model calls).

## Fixed configuration (all arms)

- Model: `zai-coding-plan/glm-5.3` (workhorse, matches stage-5 baselines). Agent `build`.
- Relay: filtering **on**, `previewSafe` **on** (benchmark channel), route **off**,
  escalate **off**, v3 context **on** for every arm (the reference configuration).
- Arm A/C: `OPENRELAY_MEMORY=off`; Arm B/D: no memory unless stated; Arm C/D:
  `OPENRELAY_MEMORY=on`. Handoff text is delivered as the first user message (B/D);
  it is never also injected into the system packet.
- Arm A/C receive the identical frozen synthetic sender transcript via
  `opencode import` (format round-trip verified zero-token) and continue with
  `opencode run -s <id>`; the final user message is identical across arms.
- Sender artifacts that belong to the repository state (PLAN/PROGRESS under `.tasks/`)
  are present for **all** arms; memory notes (`.codebase/`) exist only for C/D.

## Fixtures

| ID | Name | Scenario | Main question |
|---|---|---|---|
| 22 | plan-config-compat | Accepted plan with a non-obvious v1-compatibility constraint, two affected modules | Do handoff receivers honor mandatory constraints without history? |
| 23 | failed-pipeline-diag | Failed implementation: exact recoverable failure, a tempting rejected approach, unfinished work | Does the handoff carry the exact failure and avoid the rejected approach? |
| 24 | memory-search-followup | Follow-up task where one project note is useful and one went stale after a source change | Does memory selection inject the current note and abstain on the stale one? |
| 25 | control-explicit-edit | Single-file explicit edit, fully specified in the final message | Control: added context should be skipped (A vs D ≈ equal) |
| 26 | control-named-module | Small named-module change; no useful notes | Control: no regression from auxiliary context |

Each fixture: workspace tree with decoys, frozen sender transcript (4–6 realistic
messages), labeled mandatory facts (ground truth), an independent `verify.js`, a
pristine-FAIL/reference-PASS check (`validate-stage6.mjs`), and for 22–24 a frozen
handoff snapshot produced by the 6C builder (rendered text shipped with the fixture,
byte-stable across runs).

## Schedule (recorded before calls)

- Blocks: one per fixture×arm cell (22A…24D, 25A/D, 26A/D), 2 repetitions per cell.
- Block order randomized with a recorded seed; repetitions within a cell are
  interleaved (rep1 of all cells in a wave, then rep2) to spread time drift.
- A/A: 2 extra arm-A runs on fixture 22 and 2 on fixture 23 (separate label).
- Total planned runs: 24 + 4 + 4 = **32** ≤ 34 ceiling. The 6D smoke's 2 sessions
  count as the mechanics-smoke allowance; no further smoke runs.
- Every run writes a `run.json` (arm, fixture, rep, model, env flags, handoff bytes,
  sessionID) plus telemetry under `~/.local/share/openrelay/data/benchmarks/<label>/`.

## Budgets and stop rules

- **S1 hard ceiling:** stop starting new runs at 34 sessions or 3,000,000 recorded
  coding input+cacheRead tokens, whichever comes first; in-flight runs finish.
- **S2 quality stop-fire:** any verify failure in a B/D run whose A/C counterpart
  passes, attributable to the intervention (lost mandatory constraint, rejected
  approach repeated, stale-note guidance followed) → stop that arm immediately,
  investigate, report; retained runs are transparent.
- **S3 early economics (explicit user request):** after fixture 22's first full
  quartet (A/B/C/D rep 1): if median workflow time of B/D exceeds A/C × 1.25, or
  arm B shows savings ≤ 0 with equal quality → pause and report before any further
  runs; resuming requires explicit user go-ahead.
- **S4 usage integrity:** runs with missing primary usage invalidate economic
  conclusions for their cell; they are never treated as zero.

## Measurements and comparisons

Primary: total recorded coding input+cacheRead per receiver workflow (telemetry join
by sessionID). Also: verify pass, rounds, retries, end-to-end duration, handoff bytes,
memory bytes, prep ms. Comparisons: B/A, C/A, D/B, D/A (combined); never add
independent percentages. Small-n caveat: 2 reps per cell is screening evidence only;
bootstrap intervals reported but not treated as confirmation (that is 6F).

## Verdicts

Each feature (handoff = B/A and D/B; memory = C/A) gets PASS / FAIL / INCONCLUSIVE
independently. Pilot PASS advances the feature to 6F consideration; FAIL/INCONCLUSIVE
leaves it off with no selector complexity added.
