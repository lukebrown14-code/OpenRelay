# Stage 8 discovery audit

**Date:** 2026-09-24. **Original verdict:** **INCONCLUSIVE / no build** on the
small saved corpus. A later [real-repository follow-up](discovery-followup-report.md)
passed the entry gate. This report preserves the original audit and stop decision.
The later map pilot failed its token and speed gates; see
[the map report](map-prototype-report.md).

## Evidence

The read-only audit covers 47 saved, independently verified runs: 17 native
and 17 v3 runs from the Stage 5 v3 baseline, ten runs from the fixture 21
confirmation, and three Stage 7 runs with v3. All 47 passed their fixture
verifier. The 34 baseline `run.json` and output hashes agree with the prior
Stage 5 audit; the remaining artifact hashes are recorded in
`discovery-audit.json`. No trace was malformed.

| Observed before first edit | Native (22 runs) | Filtering + v3 (25 runs) |
| --- | ---: | ---: |
| Navigation-only rounds | 18 | 2 |
| Runs with at least two such rounds | 4 | **0** |
| Distinct fixtures in those runs | 3 | **0** |
| Source reads | 73 | 43 |
| Repeated source reads | 0 | 0 |

A navigation-only round contains solely `glob`, `grep`, directory reads, or
listing/search shell commands. A source read in the same round disqualifies it.
The three native fixtures with repeated navigation were 06, 08, and 21. Their
historical behavior is useful context, but the Stage 8 gate applies to the
deployed v3 stack. The saved runs are small fixtures and are not a claim that
v3 eliminates discovery costs in larger repositories.

There are 20 v3 runs with fixture-defined required files. All required files
were explicitly read before the first edit in 14 of them. That figure is a
tool-read measure, not task coverage: a packet may supply a file without a
read. Fixture 19's v3 packet included `src/web/dashboard.js` but omitted its
other required file, `src/worker/handle.js`; the latter was read before edit.
Fixture 10's git task also had an incomplete packet, as intended by the
selector's git gate. Neither showed two navigation-only rounds. All runs
passed verification, so these observations do not establish a map benefit.

## Frozen repositories

The [source manifest](source-manifest.json) records file-level SHA-256 hashes,
HEAD, dirty paths, and tree digests. Ignored snapshot bytes are at
`benchmarks/results/stage8-snapshots/`. After adding the executable task corpus,
the snapshots contain 108 allowlisted OpenRelay files (670,869 bytes) and 119
Delta files (1,054,661 bytes, including 40 top-level test modules). Delta's
modified `config.toml`, test fixtures and snapshots, virtual environment,
caches, and runtime data were excluded. These
source snapshots make a future offline study reproducible; Delta has no saved
model behavior traces in this audit and cannot supply the missing entry-gate
cases by itself. No Delta files were changed.

## Decision and limits

The entry condition required at least three distinct v3 task cases with two
or more navigation-only rounds, with a map-addressable source relationship in
at least two. It observed **zero** such cases. Accordingly, no repo-map
prototype, new task corpus, model runs, plugin changes, or release were made.
Token savings and latency effects for a map remain unknown. A future Stage 8
attempt needs fresh traces from larger real tasks that reveal the qualifying
behavior, then a newly budgeted comparison against filtering plus v3. The
current bottleneck evidence points elsewhere than repeated file-location
rounds on this corpus.

Four larger cross-file task definitions and independent baseline-failing
verifiers were added later in `benchmarks/stages/stage8/tasks/`. They use these frozen
snapshots but have not been run through a model. The original entry-gate verdict
therefore remains unchanged.

Reproduce locally:

```sh
node benchmarks/stages/stage8/audit-stage8.mjs > docs/stage8/discovery-audit.json
node benchmarks/stages/stage8/freeze-stage8.mjs --verify
```
