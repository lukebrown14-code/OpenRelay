# Stage 8 map optimization follow-up

**Date:** 2026-09-24. **Verdict:** Neither smaller map qualifies for a live model run. Filtering plus v3 remains the tested baseline; no production code or release was changed.

**Follow-up:** A five-file locator and a 192-byte projection of v3's selected paths were subsequently tested live; both passed quality but used more recorded tokens than two v3 controls. See [map-optimization-live-report.md](map-optimization-live-report.md). Map experiments have stopped at the user's request.

The first broad map pilot passed quality but used **39.3% more recorded coding input plus cache-read tokens** and took **26.8% longer** than its saved v3 comparison on Delta config writeback. That is one run per arm, so the difference does not establish causality, but it triggered the preregistered stop. The broad map was 1,877 bytes and listed eight files, including several that the model did not need before editing.

I tested two benchmark-only alternatives on the frozen source snapshots and 24 existing navigation labels. Their gates were written before each evaluation. The labels and eight-file holdout had already been inspected in earlier development, so these are engineering checks, not unbiased estimates of future task performance.

| Candidate | Maximum rendered size | Both labeled files found | Delta config live-task requirement | Offline gate |
| --- | ---: | ---: | --- | --- |
| Broad map | 2,336 bytes across labels | 23/24 | Includes catalog and config | Previously reached live pilot; failed observed token and speed gates |
| Single import relationship | 343 bytes | 7/24 | Points to provider picker and catalog; misses config | **FAIL**: 7/24 vs 12/24 minimum |
| Four-file locator strip | 417 bytes | 18/24 | Includes catalog, misses config | **FAIL**: live-task requirement |

The [single relationship result](sparse-map-offline-results.json) shows that import proximity alone is too weak. Some needed pairs have no direct import, and the top edge often joins tangential files. The [locator result](locator-map-offline-results.json) preserves more recall at about one fifth of the broad pilot's live map bytes, but ranking still puts UI config screens ahead of the config mutation file. That is the exact relationship needed in the planned Delta live comparison. It also provides no measured advantage over the ordinary lexical navigation baseline.

Both candidates are generated from the frozen, allowlisted source tree. No unsafe path appeared. Their rendering size and coverage met the respective size constraints, but each failed a required coverage condition. Per the [relationship protocol](sparse-map-protocol.json) and [locator protocol](locator-map-protocol.json), I used **zero additional model calls**. Token savings, latency, and coding quality for these two candidates remain **untested**. The earlier broad-map regression cannot be extrapolated to them.

The next useful experiment needs a better selector, not more compression of an incorrect file list. A targeted candidate should recognize where a task's state is changed and where it is persisted, then abstain when that relationship is uncertain. Freeze new tasks before tuning it, check required-file coverage on untouched labels, and only then run a paired, independently verified workhorse comparison with the same quality and speed limits. Do not release a map from these results.

Reproduce the zero-model checks:

```sh
node benchmarks/stages/stage8/map/evaluate-sparse.mjs > docs/stage8/sparse-map-offline-results.json
node benchmarks/stages/stage8/map/evaluate-sparse.mjs --locator > docs/stage8/locator-map-offline-results.json
```
