# Stage 5 next steps — measurement coverage, then a bounded confirmation

**Status (2026-09-23, after fixture-21 confirmation):** v1 remains INCONCLUSIVE under its original
whole-corpus gate. The focused v3 baseline and its audit are complete. Corrected
UI-class savings are **15.2% of recorded coding input+cacheRead**, below ≥25%;
36/36 runs pass verification and 17/17 B selector decisions match expectations.
Title usage and independent-verifier duration are not captured, so full all-call
cost and task wall time remain unmeasured. Context stays off by default; Jev stays
gated. See `v3-audit-results.md` and the corrected `v3-baseline-results.md`.

**Measurement update:** `measurement-coverage.md` records the implemented timing,
usage-coverage, and benchmark packet-capture changes. Independent-verifier duration
is available on new runs; title usage remains unobservable on the installed host.
The audit's repeated fixture-21 experiment is complete: five fresh interleaved
pairs plus two off controls (pilot excluded) yielded 22.6% recorded coding-token
savings, below the preregistered ≥25% gate, with 12/12 verification PASS. See
`fixture21-confirmation.md`. The scoped verdict is INCONCLUSIVE; context remains
off by default and Jev remains gated.
**Coverage work (2026-09-24):** An offline bounded file-map and import-neighbor
prototype recovered all 11 required files across the six extension fixtures
that v3 skips, using four candidate slots per task. These fixtures contain
only four to six eligible source files, and decoys rank highly. See
`coverage-prototype.md`; there is no plugin or selector change and no new model
comparison. The preregistered larger-repository holdout is now complete and
**fails** its advance gate: 7/10 top-four recall and 5/10 top-two recall
(targets 8/10 and 7/10). One nominal hit received only four excerpt bytes.
See `coverage-heldout-results.md`. Treat those tasks as development data and
test a frozen revision on a new holdout before any live retrieval arm.

**Coverage v2 (2026-09-24):** The frozen source snapshot and new ten-task
holdout are complete. Revised retrieval improved development top-four recall
from 7/10 to 10/10. Fresh holdout file recall passed at 8/10 top-four and
7/10 top-two, but only 7/10 rendered packets contained the labeled
implementation span (required ≥8/10). The advance gate therefore **FAILS**;
see `coverage-v2-results.md`. No experimental plugin arm or model runs were
added. Improve candidate ranking and line selection using this set as
development data, then validate on another fresh holdout.

The experiment order below preserves the protocol that led to the completed baseline;
it is not a request to repeat steps 1–2 automatically.

## New benchmark corpus

Keep fixtures 01–13 intact for historical comparison. Fixtures 14–21 are additional tasks, not replacements. Each has `TASK.md`, metadata, ground truth, an independent `verify.js`, and a reference solution under `benchmarks/solutions/`. Run `node benchmarks/stages/stage5/validate-stage5.mjs` to confirm pristine FAIL and reference-solution PASS without model calls. The three jsdom fixtures require their pinned dependencies from `package.json` and `bun.lock`; the Rust fixture needs Python 3 and an offline Rust toolchain.

| Fixture | Work it represents | Main question |
|---|---|---|
| 14 `ui-dismiss-strip` | Debug a live event route among legacy code | Can retrieval locate the dispatcher rather than the decoy? |
| 15 `debug-export-labels` | Fix one of two consumers of shared labels | Can it identify the export path and preserve the table? |
| 16 `ui-overlay-leak` | Find a missing cleanup call | Can it discover an absence bug from a symptom? |
| 17 `python-rust-migration` | Port a small multi-module CLI | Can prepared context reduce discovery work in a larger task? |
| 18 `cross-file-api-change` | Update a formatter and three live callers | Can it find the full impact of an API change? |
| 19 `repository-refactor` | Centralize a decision across entry points | Can it find both live consumers? |
| 20 `frontend-backend-feature` | Add cancellation across API, renderer and actions | Can it locate the vertical slice? |
| 21 `dependency-upgrade` | Move callers from a callback SDK to a promise SDK | Can it find live imports while ignoring an archive? |

The existing `01-trivial-edit` and `02-routine-bug` are the explicit-edit negative controls. Fixture 14 supplies misleading search results; 15 and 16 supply unfamiliar-repository bug fixes. The Rust migration intentionally has a different scale, so report it separately from short UI/debug tasks.

## Zero-token finding from the new tasks

With the current v3 extractor and probe, 19 and 21 build packets. The live baseline
packet on 19 contained only one of two required files; 21 contained its required file.
Probe candidates and actual packet recall must be reported separately. Fixtures 14–18 and 20 skip as `redundant-candidates`: their symptom-first requests contain no exact path, quoted string, or error code that the fixed-string probe can use. For those tasks, `gatherEvidence` also returns no source excerpts. This is a useful observed selector/retrieval gap, not an expected PASS claim. Do not rewrite the requests just to make the selector pass. Record packet coverage and target-file recall separately from task outcome.

A Jev decision alone cannot fix the empty packet on those six tasks. Any broader candidate-generation method, such as a bounded file map or semantic search, needs its own implementation and A/B arm. See `jev-experiment.md`.

## Experiment order

1. **Freeze v3 and establish a focused baseline (executed).** Record the plugin revision and toolchain versions. Compare the four fixtures for which v3 builds a packet (06–09) with at least three interleaved runs per arm, plus an A/A noise check. Sample skipped fixtures 02, 04 and 10 with one pair each to measure probe overhead and catch unexpected behavior. Do not repeat the whole 13-task suite at this stage; fixture 05 alone costs roughly 300K tokens per run. Analyze quality, `input+cacheRead`, rounds, retries, end-to-end latency, packet coverage and prep time. No premium calls.
2. **Use the new fixtures as a separate extension cohort (pilots executed).** The zero-token verifier and probe checks cover all 14–21. The initial model comparisons used 19 and 21, the two tasks for which v3 builds a packet with relevant evidence (partial required-file recall on 19). One pair each is a mechanics pilot; repeat them only if quality and token signals justify it. For the six skipped fixtures, run at most a small representative sample (for example 14 and 17) to check probe overhead or a specific selector hypothesis. A full pair for every skipped fixture cannot measure packet benefit. Give migration a longer task timeout if it is sampled. Do not blend 14–21 into the historical 13-task aggregate or replace 06/07/10.
3. **Decide where the bottleneck lies (audit complete; see audit report).** If a packet was built with relevant evidence but the model still explored, improve packet value only after examining the trace. If the packet was skipped or empty on tasks that needed exploration, investigate candidate generation before tuning selection thresholds. If v3's enabled class is not reliably better after repetitions, keep context off by default.
4. **Only then test Jev.** Start with shadow decisions on frozen inputs, followed by a live comparison only if shadow decisions show useful disagreements and available evidence. Use the separate experiment plan.

## Gates and reporting

Preserve the original overall Stage 5 verdict and its ≥25% savings gate. A full 13- or 21-fixture repeated A/B is warranted only after the focused trial demonstrates a reliable benefit and a broader rollout decision needs whole-corpus evidence. For a new scoped claim, preregister the enabled task class and threshold before model runs: at least 25% lower `input+cacheRead` beyond A/A variation, equal verify-pass rate, no material increase in failed verification cycles or model rounds, and report absolute latency including preparation. Report individual fixture outcomes and paired differences, not just category means. If results are inside noise, record INCONCLUSIVE and add no selector complexity.

**Comparison arms:** both use the Relay, the same workhorse model and agent, filtering **on**, routing **off**, and escalation **off**. Arm A sets `OPENRELAY_CONTEXT=off` (filtering only); arm B sets `OPENRELAY_CONTEXT=on` (filtering plus v3). A raw OpenCode/no-Relay arm asks a different question and would confound the v3 comparison. Non-Git skipped B tasks still run the probe; Git-intent exits before it. Session duration is not assumed identical to A in either case.

Historical baseline command examples (the baseline is complete; no new runs are part of the audit):

```sh
node benchmarks/stages/stage5/validate-stage5.mjs
cd benchmarks
node run.mjs --fixture 06-ui-status-indicator --runs 1 --model zai-coding-plan/glm-5.3 --label stage5-v3-a-01 --filtering on --route off --escalate off --context off
node run.mjs --fixture 06-ui-status-indicator --runs 1 --model zai-coding-plan/glm-5.3 --label stage5-v3-b-01 --filtering on --route off --escalate off --context on
node analyze.mjs stage5-v3-a-01 stage5-v3-b-01
```

Use the same flags for other fixtures and repeats, with `--timeout 600` for 17. Do not treat the example's single pair as the completed experiment.
