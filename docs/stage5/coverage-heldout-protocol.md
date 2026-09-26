# Larger repository packet-coverage check — frozen 2026-09-24

This protocol and `benchmarks/stages/stage5/coverage-heldout-tasks.json` were written before
running the ten-task evaluation. The ranking prototype is frozen at SHA-256
`b89188c9523107fcf5b2f710059df9beb424ba45822883fb8a4d94c35e0b6252`.
No ranking weights, stop terms, limits, task wording, or required-file labels
may change during this evaluation. The source corpus is the current OpenRelay
working tree, with source eligibility and caps as implemented by the prototype;
the evaluator will record a corpus manifest hash. This is a larger repository
holdout relative to the tiny extension fixtures, though one OpenRelay context
request was already used as a sanity check and is excluded from these ten tasks.

Each task is a symptom-led location request with manually labeled primary
source file. The label identifies the code most directly responsible for the
described behavior; it is not a claim that a full coding fix needs only that
file. The evaluator must not pass labels to the ranker. All tasks use the same
top-four candidate cap and frozen 8 KiB total / 3 KiB per-file excerpt budget
used for the proposed packet path. This is a zero-model-call test.

**Advance to an opt-in live retrieval arm only if** at least 8/10 required
files appear in the top four and in the budget-feasible packet order, at least
7/10 appear in the top two, every task completes without a file-map error,
and median preparation time is below 250 ms on this machine. Report per-task
rank, decoys, candidate source bytes, estimated packet-budget inclusion, and
latency. If a gate fails, record the failure and use this set as development
data; construct a new holdout before retesting a modified ranker. Do not
alter the live v3 selector or claim token savings from this zero-token check.
