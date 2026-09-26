# Coverage v2 validation protocol — frozen before first holdout evaluation

Date: 2026-09-24. The source snapshot is
`coverage-source-snapshot.tar.gz` (SHA-256
`f6456eac3bb5ae4c0ab30bc838ce2f0dceafbcd7d39e3155e9b1b55e9cca6b99`),
with file manifest in `coverage-source-snapshot.json`. The ranker is
`benchmarks/stages/stage5/coverage-v2.mjs` (SHA-256
`62760b10778f1cb767539ee4512ad3c0c914249f65499a036e61c501d1f8c7cf`).
The ten fresh task and span labels are in `benchmarks/stages/stage5/coverage-v2-holdout.json`
(SHA-256
`40b8873df8a5989619cebc3fbdb8e9852b4a42d226ba3f9d175aa9f0628479e3`).
Do not alter these three inputs during validation. The prior ten-task holdout
is development data only; the fixture 14–20 corpus was also used for design.

For each new task, rank on the extracted source snapshot without passing
labels to the ranker. Render the actual v2 packet with four candidates and
record required-file ranks, whether every labeled implementation span appears
in the packet, packet bytes, read/list counts, preparation time, and errors.
Check that labels occur in the source snapshot before scoring.

The offline advance gate is all of: at least 8/10 tasks with every required
file in the top four; at least 7/10 in the top two; at least 8/10 packets with
every labeled implementation span; every packet at most 8,192 UTF-8 bytes;
zero file-map or packet errors; median complete preparation time below 250 ms.
This does not establish token savings. If any gate fails, keep this set as
development data and make a new holdout before testing a changed ranker. If
all gates pass, prepare an opt-in development/benchmark retrieval arm only;
do not run a model comparison in this step.
