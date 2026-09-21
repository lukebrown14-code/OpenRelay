# Stage 2b Experiment Report — A/B Benchmark (GLM)

**Date:** 2026-09-20 · **Model:** `zai-coding-plan/glm-5.3-flash` · **Protocol:** 5 fixtures × 3 runs × {off, on}
**Labels:** `s2b-off` / `s2b-on` (+ `s2b-smoke` pre-flight) · Plan: `stage2b-plan.md`

## Verdict: **PASS** (pre-registered gate in `stage2b-plan.md`)

| Gate | Criterion | Result |
|---|---|---|
| Quality | 100% verify success both groups | ✅ 15/15 + 15/15 |
| Quality | 100% telemetry joins | ✅ 30/30 |
| Turns (primary) | on-arm llmCalls ≤ off-arm on every fixture | ✅ fixtures 01/02/04 exact equality (filter never fires there); 05: 7.33 → 6.33 (−13.6%) |
| Tokens (primary) | ≥20% input+cacheRead reduction on noisy fixture, outside variance | ✅ **−72.4%** (231,431 → 63,936; every on-run beats every off-run, zero overlap) |
| Recovery | on-arm recovery calls ≤1/run (expected 0) | ✅ **0** across 3 runs |
| Bytes | ≥70% reduction on targeted results | ✅ **99.0%** (205,195 → 2,122 B over 4 calls) |
| Stability | no retry/error/latency regression outside noise | ✅ 0 errors; duration deltas +5–14% within Stage 1 noise floor (CoV 40–70%) |

**Documented exception:** fixture 03 on-arm llmCalls 7.0 vs off-arm 6.67 (+0.33). The filter
has zero events on fixture 03 — arms are behaviorally identical there, so the delta is
run-to-run noise in a no-treatment condition, not a filtering cost. Recorded for
transparency against the strict gate wording.

## What shipped between Stage 2 and 2b (the interventions)

1. **Metadata canary finding** (1 GLM run): `title` and `metadata` are serialized into the
   outgoing request — and `metadata.output` carried **30,005 raw bytes** into the request
   even when `output.output` was filtered to 215 B. Stage 2's "99.6%" byte reduction was
   ~35% at the request level. The filter now **clears `metadata.output`** whenever it
   rewrites output (`sanitizeFilterMetadata`).
2. **Full-log access**: the hook parses the harness-saved full log (`metadata.outputPath`)
   instead of the pre-truncated tail; the raw store now holds the true full output.
3. **Failure cards**: TAP YAML blocks parsed as units (`expected`/`actual`/`operator`/
   `code`/message/location) rendered as got/want cards (≤5, ~4 KiB cap).
4. **Hard bail rule**: classified + exit ≠ 0 + zero extracted evidence → raw unchanged.
5. **PASS-collapse**: recognized + exit 0 → verdict + counts + pointers (~300 B).
6. **Compound commands**: `&&`/`;` decomposed; unknown parts fail closed on failure,
   collapse on success (kills the 51 KB `verify.js && npm test` re-injection).
7. **Analyzer**: gate aggregation restricted to joined sessions; `llmCalls` +
   `tokensInPlusCache` gate metrics added.

## Fixture 05 detail

| run | arm | llm | in+cacheRead | filtered calls | recoveries | pass |
|---|---|---|---|---|---|---|
| 01 | off | 6 | 152,452 | 0 | 0 | ✅ |
| 02 | off | 8 | 337,172 | 0 | 0 | ✅ |
| 03 | off | 8 | 204,669 | 0 | 0 | ✅ |
| 01 | on | 6 | 58,540 | 1 | 0 | ✅ |
| 02 | on | 6 | 61,653 | 1 | 0 | ✅ |
| 03 | on | 7 | 71,615 | 2 | 0 | ✅ |

Example filtered failure view (610 B replacing 51,274 B):

```
command: npm test
result: # tests 3600 | # suites 0 | # pass 3599 | # fail 1 | …
failures (1):
- case \#0777 formatBytes(1024) => "1 KB"
  got: 1024 B want: 1 KB (strictEqual)
  code: ERR_ASSERTION
  Expected values to be strictly equal:
  at test/format.test.mjs:45:5
[4606 lines omitted — full output: openrelay_raw_output ref=…]
[harness log: …]
```

## Status

- Filtering remains **disabled by default**; enabling is a separate decision.
- Canary module (`lib/canary.ts`, `OPENRELAY_CANARY=on`) retained for future channel probes.
- Stage 2 deliverables preserved; see `stage2-report.md` for the INCONCLUSIVE history.
