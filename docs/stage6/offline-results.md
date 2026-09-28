# Stage 6 offline results — selective assembly (6C)

**Date:** 2026-09-24. Zero model calls.

## Run history (recorded honestly)

**Run 1 — initial scoring: 8/20 cases PASS — FAIL.**
Diagnosis separated fixture-integrity defects from two real implementation defects
the holdout caught:

| Defect | Class | Fix |
|---|---|---|
| Generator hashed the file list before writing note modules and `memory.json` (9 cases drifted) | fixture generator | hash the actual written tree; regenerate |
| Case `worktree-change` shipped a pre-written empty `memory.json` that blocked note registration | fixture spec | removed the explicit empty index |
| `validateLabeled` accepted an **empty** required list — a handoff with zero acceptance criteria validated and assembled | implementation bug (silent-loss class) | required lists must be non-empty (schemas.ts) |
| Renderer never emitted recovery excerpts — evidence was not actually recoverable receiver-side | implementation gap | excerpts rendered (≤512 B, truncation flag), suppressed when the v3 packet already covers the path, counted in handoff bytes |
| Notes dropped for staleness/packet-coverage still appeared in the reported `selection.selected` | implementation bug (reporting) | reported selection reflects rendered notes only; drops appear as omissions |

**Run 2 — repeat after the fixes above: 20/20 PASS.** Expectations, case trees, and
budgets were unchanged by the fixes; the manifest was re-frozen only because fixture
generation is now integrity-correct. Per the protocol this is a **repeat**, not a
fresh result; the holdout is now sealed for future claims.

## Final numbers (repeat run)

| Gate (§9) | Result | Verdict |
|---|---|---|
| Zero silent losses (mandatory facts present or safe fallback) | all 12 positives retain objective/constraints/acceptance/failure facts | **PASS** |
| Usable evidence in positives | **12/12** assembled with all required facts (target ≥10/12) | **PASS** |
| Zero stale-critical / leakage | no forbidden substring in any output (incl. cross-task and malicious-note canaries) | **PASS** |
| Negatives abstain or fall back | **8/8** with preregistered reasons (`missing-mandatory`, `mandatory-exceeds-budget`, `nothing-to-assemble`, `malformed-artifacts`) | **PASS** |
| Payload bounds | largest assembled packet 782 B vs 12 KiB cap; handoff ≤6 KiB; memory ≤2 KiB | **PASS** |
| No exceptions escape | 0 unexpected throws (malformed index → recorded fallback) | **PASS** |
| Preparation budget | p95 cold **23.2 ms**, warm **24.7 ms** (target ≤100 ms, abandon 250 ms) | **PASS** |

Per-case outcomes (cold/warm ms, assembled bytes):

| Case | Class | Outcome | Bytes | Cold | Warm |
|---|---|---|---|---|---|
| plan-constraints | positive | assembled | 317 | 21.5 | 18.1 |
| failed-verification | positive | assembled | 261 | 18.8 | 18.7 |
| partial-progress | positive | assembled | 289 | 17.8 | 16.7 |
| restart-recovery | positive | assembled | 204 | 19.4 | 18.0 |
| concurrent-tasks | positive | assembled | 205 | 17.5 | 17.0 |
| worktree-change | positive | assembled (note abstained: stale-digest) | 196 | 19.3 | 19.1 |
| current-referenced-note | positive | assembled + n-auth | 268 | 18.2 | 17.5 |
| v3-dedup | positive | assembled (note abstained: covered-by-packet) | 191 | 17.9 | 20.9 |
| path-overlap | positive | assembled + n-tel | 260 | 19.5 | 17.8 |
| cap-tiebreak | positive | assembled + n-a, n-b (n-c: cap) | 240 | 18.1 | 18.8 |
| evidence-recovery | positive | assembled (512 B-bounded excerpt, truncated flag) | 782 | 20.7 | 16.7 |
| conflict-handoff-usable | positive | assembled (2 notes abstained: conflict) | 205 | 18.1 | 18.8 |
| missing-evidence | negative | fallback: missing-mandatory | – | 0.35 | 0.02 |
| oversized-handoff | negative | fallback: mandatory-exceeds-budget | – | 0.45 | 0.09 |
| oversized-note | negative | fallback: nothing-to-assemble (memory-budget) | – | 0.18 | 0.18 |
| malicious-note | negative | fallback: nothing-to-assemble (suspicious-content) | – | 0.12 | 0.10 |
| unrelated-task | negative | fallback: nothing-to-assemble (no-reference) | – | 0.04 | 0.03 |
| ambiguous-stale-note | negative | fallback: nothing-to-assemble (stale-validity) | – | 0.04 | 0.04 |
| cross-task-leakage | negative | assembled with zero B-task facts | 184 | 20.7 | 19.3 |
| malformed-artifacts | negative | fallback: malformed-artifacts | – | 0.10 | 0.02 |

## Observations

- Mandatory-first rendering dominates byte cost: handoffs render 184–782 B — far
  under the 6 KiB cap — so the 12 KiB combined cap has ample headroom at these sizes.
- Abstention paths dominate negative-case latency (~0.1 ms) because they exit before
  hashing; full assembly cases are ~18–23 ms, dominated by `ProjectStore` identity
  (`git rev-parse`) and evidence hashing.
- The empty-required-list defect was exactly the class §9 exists to catch: it would
  have silently dropped acceptance criteria in live handoffs.

## Verdict

**6C advance condition MET** — "Frozen offline cases preserve all mandatory facts and
abstain correctly." Full suite: 259/259 bun tests (dev set + store/provenance/tracker),
tsc clean, holdout 20/20 under the sealed manifest
`5a4a6c8f…981f11d9`. Next: 6D opt-in integration (`OPENRELAY_MEMORY` / `OPENRELAY_HANDOFF`
switches, explicit session continuation, telemetry joins) — still no model calls —
then 6E pilot with user budget authorization.
