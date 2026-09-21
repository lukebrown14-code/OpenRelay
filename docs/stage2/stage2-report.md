# Stage 2 Experiment Report — A/B Benchmark (GLM)

**Date:** 2026-09-19 · **Model:** `zai-coding-plan/glm-5.3-flash` · **Protocol:** 5 fixtures × 3 runs × {off, on}
**Labels:** `s2-off` / `s2-on` (+ `s2-smoke3` forensic smoke) · Analyzer: `benchmarks/analyze.mjs`

## Verdict: INCONCLUSIVE (pre-registered gate, `../stage2-tool-output-filtering.md`)

| PASS criterion | Result |
|---|---|
| 100% verify success both groups | ✅ 15/15 + 15/15 |
| 100% telemetry joins | ✅ 30/30 |
| ≥70% byte reduction on targeted results | ✅ 99.4% (benchmark-only: 153,837 → 651 B, 3 calls) |
| ≥20% input-token reduction on noisy fixture, outside variance | ❌ **−14.2% input; −7.8% input+cacheRead**; high variance |
| No retry/error/latency regression | ✅ all within noise floor |
| Raw recovery works | ✅ unit tests + 18 live calls |

Per spec: filtering stays **disabled** (default `off`; nothing enabled in any config).

## Fixture 05 (noisy) headline numbers

| metric | off (A) | on (B) |
|---|---|---|
| LLM calls / run (mean) | 7.3 | **13.0** |
| bash bytes entering context | ~51,290 | **215** (−99.6%) |
| input tokens (mean) | 35,460 | 30,410 (−14.2%) |
| input + cacheRead (mean) | 213,786 | 197,087 (−7.8%) |
| duration (mean) | 55.9 s | 97.3 s |
| recovery calls / run | 0 | 6.0 |

Fixtures 01–04: turn-neutral (e.g. 4.0 vs 4.0 calls), no regressions, no savings.

## Why it missed: turns × caching, not bytes

- r(LLM calls, input+cacheRead) = **0.865** across 31 runs. cacheRead = **78%** of billable context.
- Each extra turn re-reads the full cached context; the recovery chain (6 turns/run, 35–53% of
  run context) consumed what byte-filtering saved.
- Post-fix PASS output (`node verify.js && npm test`, 51 KB, exit 0) bypassed the filter
  (`&&` compounds unclassified) and was re-injected whole (~46 K ctx tokens, 2 runs).

## Forensic root causes (transcript-verified)

1. **Host truncates before the hook.** `tool.execute.after` receives marker +
   `Full output saved to: <path>` + last ~1,939 lines. The filter stored that tail as
   "raw"; the failure lived at line 4,663 of the true 21,634-line log (`metadata.outputPath`).
   16/28 recovery probes returned empty — they searched a corpse. All runs ultimately
   succeeded via OpenCode's saved-file side channel.
2. **Missing bail rule.** Summary counters set `recognized` with `failures=[]`, so a
   failing run was compressed to an evidence-free 217 B view.
3. **TAP YAML gaps.** Lowercase `expected:`/`actual:`/`operator:` keys and the YAML
   failure block were not extracted (fixed post-experiment: TAP summaries + `not ok` names).
4. **`metadata.output` leaks 30,005 B** of raw output into the persisted tool result even
   when filtering is on (LLM visibility unverified — 2b canary).
5. **"full raw output" mislabel** in the omission note; host pointer destroyed.

## Measured turn-waste patterns (ranked, 31 runs)

1. Recovery store incomplete → 16/28 empty probes (~203 K ctx tokens).
2. Saved-file detour: 9 turns grepping/reading `~/.local/share/opencode/tool-output/*` (~133 K).
3. Off-arm 51 KB-in-context cache tax: ~+23 K cacheRead/turn × 4–5 turns ≈ 90–115 K/run.
4. Unfiltered PASS re-injection: ~46 K ctx × 2 runs (+1 redundant re-run).
5. Cold-cache turns (environmental; exclude from model-behavior claims).

Non-issues (measured): redundant verification re-runs (1/31), orientation re-reads
(`src/format.js` read once in every run), rerun-suppression ideas → shelved.

## Deliverables that stand

Fixture `05-noisy-test-log` (node:test, 3,600 cases, deterministic), `run.mjs --filtering`,
analyzer extensions (per-fixture A/B, persisted analysis JSON), 121-test suite, TAP parser
fix, recovery tool, filtering core (off by default).

## Known analyzer issue

Gate-number aggregation scans all telemetry sessions (included smoke runs in the 4-call /
26-recovery figures); 2b restricts aggregation to joined sessions only.
