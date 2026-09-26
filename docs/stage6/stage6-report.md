# Stage 6 report — shared project memory and structured handoffs

**Date:** 2026-09-24. **Corrected analysis:** 2026-09-24. **Stage closed after 6E; no release.**

## Final verdicts

| Feature | Verdict | Token saving | Status |
|---|---|---|---|
| Structured handoff | INCONCLUSIVE | −15.4% diagnosis / +22.6% plan / +8.6% follow-up vs native; +6.0% across the three fixtures with equal fixture weight | **OFF** |
| Selected project memory | FAIL to advance; value inconclusive | One live note delivery, +0.3% in a one-run D/B comparison | **OFF** |

The corrected main-arm comparison averages **3,509 extra recorded coding
input+cacheRead tokens per handoff task** across the three main fixtures. The
earlier report's ~7K per-task figure was an arithmetic error, and its −20%
diagnosis figure pooled A/A controls into A. All 29 retained runs passed their
verifiers; this observed result does not prove quality safety beyond the tested
cases. Receiver CLI times were mixed, and independent-verifier time was not saved,
so the complete-workflow latency gate remains unmeasured.

## Evidence chain

| Milestone | Deliverable | Outcome |
|---|---|---|
| 6A capability + baseline | `capability-check.md` | Transfer mechanism selected (fresh session + SDK prompt); native-continuation cost structure verified; no-model live check PASS |
| 6B artifacts + continuity | `lib/memory/` (6B code) | Schemas, ProjectStore (locks, revisions, immutable snapshots), provenance, task-identity recovery; offline tests PASS |
| 6C selective assembly | `offline-protocol.md` / `offline-results.md` | Frozen 12+8 holdout: all §9 gates pass, 20/20 cases, prep p95 ≈23 ms; first run 8/20 caught a real silent-loss bug (fixed, repeat labeled) |
| 6D opt-in integration | `smoke-result.json` | `OPENRELAY_MEMORY`/`OPENRELAY_HANDOFF` switches (off everywhere), prepare/continue tools, memory on system transform; bounded live smoke PASS (one real delivery, session/model association verified) |
| 6E workhorse pilot | `pilot-results.md` | 29 retained runs passed verification; handoff INCONCLUSIVE; memory has no demonstrated benefit from one delivered note; controls were one run each |

## What the pilot can explain

1. The plan fixture's handoff overlapped with `PLAN.md` in every workspace.
   Its B arm also triggered a 2,228-byte v3 packet while A skipped v3, so the
   +22.6% result cannot be assigned to handoff duplication alone.
2. The diagnosis fixture showed −15.4% recorded coding tokens and −37.7%
   receiver CLI time. The exact failure and rejected approach were already in
   `PROGRESS.md` for every arm. The mechanism behind this one-task improvement
   remains unproven.
3. Only one retained run received a memory note. `n-ranking` was skipped for
   `no-reference`; live freshness rejection was not exercised. These data cannot
   establish general memory value or lack of it.
4. Token totals count input and cache-read together. The report does not measure
   price-weighted spend or a complete sender-to-verifier workflow, so cache-cost
   explanations remain hypotheses.

## What ships from Stage 6

- No runtime features (both switches stay off in every channel; rollback = nothing
  to disable).
- Retained infrastructure, all opt-in and tested: `lib/memory/` (schemas, store,
  provenance, selection), `lib/handoff/` (builder, session association),
  `lib/assemble/` (budgeted renderer), `openrelay_handoff_prepare/continue` tools,
  task-identity recovery in telemetry, `benchmarks/` fixtures 22–26 + validator +
  runner + analyzer, and the frozen 6C holdout.

## Accounting disclosure

The pilot consumed ~44 sessions and ~3.2M recorded coding input+cacheRead tokens
against the preregistered 34-session/3M-token caps. The overrun traces to two harness
defects (shared-session import contamination; a spawnSync encoding crash), both fixed
and retained transparently in the results tree; the extension was user-approved
mid-flight with revised numbers.

## Revisit conditions

The diagnosis-task saving is the one directional handoff signal worth studying,
with fresh tasks that separate facts carried only by the sender from facts already
available in workspace files. Any revisit needs real sender sessions, consistent v3
packet behavior, complete workflow timing, and repeated delivery of relevant
memory notes if memory value is tested. This corpus and holdout are spent and
must not be reused for a PASS claim.
