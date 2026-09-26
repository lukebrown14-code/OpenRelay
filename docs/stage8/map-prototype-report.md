# Stage 8 repository-map experiment

**Date:** 2026-09-24. **Verdict:** **FAIL for rollout** under the user's
quality-and-speed standard. The offline map is addressable, but the first
bounded live comparison increased both recorded tokens and complete latency.
The preregistered futility rule stopped the remaining map runs. No map code
was added to the OpenRelay plugin or daily launcher.

## Offline map

The benchmark-only prototype in `benchmarks/stages/stage8/map/` parses TypeScript and
JavaScript with the TypeScript AST and Python with `ast`. It records definitions,
imports and inbound links, ranks files for a task, and renders a read-only map
under 2,400 bytes. It builds from the frozen, allowlisted snapshots rather
than reading secrets, symlinks, runtime data, or Delta's modified
`config.toml`. A fresh map was built before the live coding run; there is no
incremental cache.

The [offline evaluation](map-offline-results.json) uses 24 labeled coding
navigation tasks across both repositories (16 development, 8 holdout). Within
eight map entries it found **47/48 required files** and displayed **37/48
required symbols**; 23/24 tasks had complete required-file coverage. A simple
lexical ranking also found **47/48** files in eight entries, so this test
does not show an addressability advantage. The largest rendered map was 2,336
bytes. Building each repository graph took about 0.14–0.15 seconds in the
offline run; the live map build took 157 ms. These timing figures are local
preparation costs, not model latency. The eight labels called "holdout" were
inspected during prototype development, so their score is descriptive rather
than an untouched validation result. Labels were authored from known source
relationships and are not a representative random sample of user work.

## Live pilot

The [pilot protocol](map-pilot-protocol.json) compared each map run with its
saved filtering-plus-v3 run on the same frozen task and model. It required
independent verification, complete coding usage, zero premium calls, some
token saving, and complete time no more than 5% above baseline to continue.
This is a one-run-per-arm feasibility pilot, not a confidence interval. The
map was added through a benchmark-only OpenCode system-transform plugin;
injection was confirmed by 25 session-matched hashes. The map shown to the
model was 1,877 bytes and contained both required files.

| Delta config writeback | Filtering + v3 | Filtering + v3 + map | Change |
| --- | ---: | ---: | ---: |
| Independent verifier | PASS | PASS | Same observed result |
| Recorded coding input + cache-read | 669,884 | 933,448 | **+39.3%** |
| Complete time | 332.2 s | 421.3 s | **+26.8%** |
| Navigation-only rounds before first edit | 6 | 1 | −5 |
| First edit round | 12 | 9 | −3 |
| Source reads before first edit | 6 | 9 | +3 |
| Premium calls | 0 | 0 | 0 |

The map run had complete coding telemetry, 24 coding completions, and a
session-matched map-injection proof. The independent verifier passed, as did
35 surrounding Delta catalog and watch-target tests. The [trace audit](map-pilot-audit.json)
records the rounds and artifact hashes. The map reduced pure navigation but
did not reduce total model calls; it coincided with more source reads and a
larger token and latency bill. Because each arm ran once, these differences
cannot isolate map causality from run-to-run variation. They are sufficient to
trigger the conservative stop rule; the user's no-slowdown criterion was not
met in this observed comparison.

The first map launch failed before session creation because the launcher's
conflict detector matched the repository name in the independent injector's
path. It used zero model tokens and is preserved as
`invalid-preflight-delta-config-writeback-1`. The same hashed injector was
then copied to a neutral temporary path and the task rerun. No model attempt
was retried after a session began. The pilot stopped before the OpenRelay
packet and Delta market map arms, so no aggregate saving or quality claim is
available. The map is static during a coding session and may become stale
after edits; that remains an untested risk.

## Decision

Keep filtering plus v3 as the baseline. Do not add the map to OpenRelay or
claim token savings. If the idea is revisited, first test a much smaller map
that adds information beyond lexical search, and require fresh paired runs
with independent verification and complete-time parity before release.

Reproduce the offline evaluation and trace audit without model calls:

```sh
node benchmarks/stages/stage8/map/evaluate.mjs > docs/stage8/map-offline-results.json
node benchmarks/stages/stage8/audit-stage8.mjs --include-stage8 --include-map > docs/stage8/map-pilot-audit.json
```
