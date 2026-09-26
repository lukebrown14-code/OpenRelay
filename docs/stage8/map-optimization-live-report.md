# Stage 8 map optimization: completed live runs

**Date:** 2026-09-24. **Decision:** Stop map experiments at the user's request. No tested map saves recorded tokens against either available v3 control on the Delta config task. Do not release a map.

## What changed in the experiment

The earlier broad map was 1,877 bytes and failed its token and complete-time gates. I tried a five-file locator map (417 bytes in the live task) that preserves the two required Delta source paths. An offline check found both required files in 20/24 labeled navigation cases, versus 18/24 for the four-file locator. The five-file map was added to filtering plus v3, using the independent benchmark injector.

The five-file run passed its independent verifier but used 984,214 recorded coding input plus cache-read tokens, 46.9% above the saved v3 control, while finishing 1.8% faster. The session-matched map proof occurred 25 times; all 24 coding calls had usage and none used premium.

The v3 telemetry showed that the Delta task already received a 9,045-byte packet containing `delta/llm/catalog.py` and `delta/core/config.py`. I therefore tested a different map role: replace that full packet with v3's own selected source paths, rather than add another map. The benchmark-only projection was 192 bytes, contained both required files, and ran with v3 context delivery off. It passed verification, used 970,815 recorded tokens (+44.9% versus the saved v3 control), and finished 2.0% faster. It had 24 complete coding calls, 25 session-matched injection proofs, and zero premium calls. This also failed the preregistered token gate.

Because the saved v3 control was one run, I ran one fresh control with the same frozen task, model, verifier, source snapshot, and filtering plus v3 settings. It passed at 856,258 recorded tokens and 362.8 seconds, 27.8% more tokens and 9.2% more time than the saved control. The same two required files appeared in its v3 packet. This demonstrates substantial run-to-run variation; it does not make either map a token winner.

| Delta config writeback | Recorded input + cache-read | Complete time | Independent verifier |
| --- | ---: | ---: | --- |
| Saved v3 control | 669,884 | 332.2 s | PASS |
| Fresh v3 control | 856,258 | 362.8 s | PASS |
| Broad map added to v3 | 933,448 | 421.3 s | PASS |
| Five-file locator added to v3 | 984,214 | 326.1 s | PASS |
| 192-byte v3 projection replacing packet | 970,815 | 325.6 s | PASS |

All five runs had 24 coding calls, complete coding usage, and zero premium calls. Against the **fresh** control, the five-file and projected maps used 14.9% and 13.4% more recorded tokens, while completing about 10% faster. These are unpaired, single-run comparisons. The faster times in the two small-map runs meet a speed observation, but the token regressions fail the requested combination of savings, speed, and quality. They do not support a causal speed claim.

The offline relationship-only map found both required files in 7/24 labels; the four-file locator found 18/24. A directory-diversified locator found 11/24 and a source-owner ranker found 15/24; neither advanced to a model run. The existing labels have been inspected during development, so these are descriptive checks and cannot be presented as untouched holdout validation.

The benchmark runner, maps, protocols, and raw run records remain under `benchmarks/stages/stage8/map/`, `benchmarks/stages/stage8/run-stage8-*-pilot.mjs`, and ignored `benchmarks/results/`. No OpenRelay plugin or daily release was changed. The only observed map improvement is lower map byte size and, in two runs, lower complete time. **Token saving has not been demonstrated.**
