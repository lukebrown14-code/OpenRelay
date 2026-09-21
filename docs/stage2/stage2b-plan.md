# Stage 2b Plan — Reduce Total Model Consumption per Verified Task

Status: planned; filtering remains **off by default**. This revision supersedes the
earlier Stage 2b turn/byte gates, not the historical Stage 2 experiment registration.

## Objective and hypothesis

Optimize **total model consumption per verified completed task**, not the size of an
individual tool result. Include repeated context, generated output, recoveries, retries,
and auxiliary model requests. Verification is the quality gate, not the optimization target.

Hypothesis: complete, well-organized diagnostic evidence reduces downstream consumption
more reliably than aggressive truncation. A slightly larger first result, or an extra
recovery call, is worthwhile if the complete task consumes less overall.

Stage 2 demonstrated the distinction: approximately 99.4% smaller targeted output, but
only 7.8% lower input+cacheRead on the noisy fixture, with reported main-agent calls
rising from 7.3 to 13.0 and duration from 55.9 to 97.3 seconds. Those context figures are
not a complete model-consumption ledger or a measure of subscription allowance usage.
The incomplete recovery store was a correctness failure even though tasks eventually
passed through the host's saved-file escape hatch. Efficiency remains INCONCLUSIVE.

Keep `openrelay_raw_output` as an escape hatch. Implement correctness and measurement
first; test other ideas independently. No model-based summarizer, Task Controller, or
Context Engine is required for this stage.

## Phase 0 — Establish the actual model boundary

- Use synthetic canaries to establish whether title, metadata, and duplicated
  `metadata.output` reach the serialized model request. `messages.transform` observes
  host messages; it does not by itself prove final provider-payload visibility.
- Inspect the serialization boundary through supported instrumentation. If unavailable,
  mark visibility unverified rather than claiming savings from persisted-object sizes.
  Use at most two tiny live canary runs if local inspection cannot settle this.
- If duplicated raw output is model-visible, remove it only from the model-facing
  representation without breaking the host's UI, exit status, or saved-file recovery.
  Do not blindly clear host metadata.
- Confirm usage-field semantics for the active provider: whether input includes cached
  input, whether output includes reasoning, and what `total` includes. Record the
  normalization rule and unknowns before comparing runs.
- Keep diagnostics opt-in, synthetic/redacted, and temporary; do not log ordinary user
  prompts or credentials. Use supported extension points only.

## Phase 1 — Evidence-preserving correctness fixes

### Full-log access and honest fallback

- Pass exit status and host truncation/path metadata into the filtering boundary.
- Track source completeness explicitly: `complete`, `host-truncated`, or `unavailable`.
  When the host truncated output, read its actual saved log before filtering; never
  describe the hook's tail as the full raw log.
- Accept only a validated host-supplied file reference, not a path parsed from arbitrary
  command output. Validate file type/location and use bounded reads. Preserve existing
  resource limits (10 MiB per result, 50 MiB per session, 24-hour retention), with tests
  confirming configured limits and expiry are honored.
- If the full log is missing, unreadable, too large, or cannot be safely retained, leave
  the host result and its original `Full output saved to:` pointer unchanged. Record a
  bypass reason. Do not aggressively summarize an incomplete tail.
- Store the exact complete source before replacing its visible representation; bind
  references to the owning session/tool call. Every hook remains defensive and must
  never throw into OpenCode.

### Actionable diagnostic groups

- Parse complete failure units: test name, assertion/message, expected/actual, full
  meaningful diff, source location, and relevant stack. For TAP, retain the associated
  YAML block (`---` through `...`), including lowercase fields.
- Apply the same principle to compiler and linter diagnostics. Their evidence may be
  in an `errors` collection, not a test `failures` collection; bail rules are parser-specific.
- Group only exact diagnostic duplicates using stable signatures. Preserve occurrence
  counts and affected locations/test names. Do not infer a common root cause or merge
  distinct expected/actual values just because messages resemble each other.
- Start with an 8 KiB **soft** evidence budget, not a five-card hard cap. Retain distinct
  actionable groups even when this exceeds the budget. If no useful shorter view is
  possible, pass the original result through. Never cut in the middle of a diagnostic.
- Exit status alone is insufficient. Require recognized, internally consistent results;
  preserve cancellation, timeout, infrastructure errors, and unknown sections. A failing
  result with no actionable extracted evidence must pass through unchanged.
- Label scope and completeness honestly. Show counts of groups/occurrences and stable
  recovery references; avoid verbose repeated boilerplate.
- The first experimental candidate changes failure results only. Leave success output
  unchanged so its contribution can be measured separately.

### Recovery that answers the question in one call

- Add diagnostic-group lookup: a group ID returns its assertion, diff, source location,
  and relevant stack together. Keep compatible line-range and search access.
- Return source line numbers, match counts, completeness, and explicit continuation
  cursors. Search pagination must advance rather than repeat the first matches.
- Honor response limits (currently 200 lines / 16 KiB) with honest continuation. A single
  oversized line must not produce an empty result falsely marked complete.
- Missing, expired, or partial data must be explicit; preserve the host recovery route.
  Test session ownership and malformed requests. Measure every recovery attempt,
  including empty/failed ones, rather than treating only successful reads as overhead.

## Phase 2 — Independent filtering experiments

These are candidate improvements, not a bundle to ship together. Start with A, then
evaluate the others only if justified by observed consumption. Each needs its own
incremental evidence against the simplest accepted candidate.

| Experiment | Behavior | Safety boundary |
|---|---|---|
| A. Selective success collapse | Compact recognized successful results, retaining verdict, test/check counts, skips, warnings, and artifact paths | Exit 0 alone is not sufficient; preserve unexpected count changes and unknown content |
| B. Safe compound commands | Support shell-aware parsing of recognized `&&` chains | Every component and output attribution must be understood; `;`, pipes, substitutions, and ambiguous constructs initially pass through |
| C. Verification deltas | Report new, changed, resolved, and unchanged diagnostics across comparable executions | Always execute verification; retain full new/changed evidence and recoverable unchanged evidence |
| D. Concise output at source | Explicitly configured concise native reporter, with complete logs retained | Prove identical test selection, coverage, and exit semantics; do not silently rewrite user commands |

Additional requirements:

- For B, an earlier failure can be hidden by the final exit status of a `;` chain. Do not
  split shell text with a simple regex. The motivating `node verify.js && npm test`
  remains unsupported unless both components can be safely classified; do not special-case
  the benchmark filename to manufacture coverage.
- For C, match command, working directory, test selection, parser version, and a complete
  prior result. Track workspace revision/change state and predecessor result ID; describe
  changes since that execution, not proof of what caused them. Reset when history or
  comparability is uncertain, including restart/compaction unless state is reliably restored.
  Never suppress verification or mistake stale diagnostics for a current result.
- For D, benchmark as a separate opt-in variant. Count logging, retrieval, schema, and
  follow-up costs; keeping a full log must not require rerunning the test suite.
- Do not introduce intent-aware ranking or speculative root-cause summarization until
  simpler deterministic grouping has demonstrated a need for them.

## Phase 3 — Whole-task measurement and provenance

### Primary consumption ledger

For each arm, measure all observed model consumption across all attempts, divided by
the number of verified completions. Failed attempts and retries stay in the numerator;
zero completions is not a successful efficiency result.

- Include main-agent, helper/title, child-agent, and compaction requests attributable
  to the task. Separate setup/pilot costs from confirmation results, but report both.
- Preserve uncached input, cache reads, cache writes, output, and reasoning components.
  Construct the total only after provider normalization proves components do not overlap;
  never add reasoning twice or assume missing usage equals zero.
- Report raw components and provider totals side by side. No invented subscription-quota
  weights or claims that cached tokens equal uncached compute/cost. Compare a fixed model
  and configuration within an experiment; report separate tier/model ledgers if mixed.
- Join run manifests to root and attributable auxiliary session IDs. Restrict all analyzer
  aggregates, including filtering/recovery events, to those joined runs. Incomplete
  attribution or usage coverage makes the primary result INCONCLUSIVE.

### Diagnostics, not substitute objectives

- Report main-agent steps separately from all model requests; also report recovery
  rounds, reruns, output/reasoning growth, duration, errors, and verification results.
- Measure bytes at three distinct points: complete source, host-visible hook input,
  and final model-visible representation (including recovery notes). Report recovered
  bytes separately. Only claim model-facing savings where visibility is established.
- Measure recovery-tool schema overhead: compare Stage 2 absent against filtering off
  with the tool still registered. The final candidate must justify its total installed
  overhead, not merely improve relative to an already-costly off arm.
- Annotate sampled next actions (edit, useful source read, recovery, redundant rerun)
  to explain why a representation helped or hurt. Use traces/manual review, not a new
  model judge whose consumption would undermine the experiment.
- Persist per-fixture results and a representative-workload aggregate. Keep synthetic
  stress results separate so one enormous log cannot dominate the headline. An
  equal-fixture normalized summary can be secondary, with its weighting explicit.

### Versioned telemetry

Record filter reason/parser version such as `vitest:v1`, `tsc:v1`, or `eslint:v1` on
every filtering decision. Increment the relevant version when parser behavior changes.
Also record pipeline version, configuration hash, bypass reason, source completeness,
session/tool-call IDs, and before/after byte definitions.

The run manifest must capture model/provider, OpenCode version, fixture/verifier hashes,
plugin revision plus dirty-diff fingerprint, variant, run order, and analysis version.
Retain machine-readable analysis and joined-session manifests for reproducibility.

As part of implementation, add an explicitly dated correction to the historical report:
recovery correctness failed despite task success; high variance does not establish
absence of latency regression; input+cacheRead is not proven subscription billing usage.
Preserve the original experiment's recorded measurements and registration.

## Phase 4 — Tests and staged validation

### Deterministic tests first

- Golden captured logs: TAP/YAML, multiple assertions, long diffs, compiler/lint errors,
  duplicate versus distinct diagnostics, ANSI, warnings, skips, cancellation, and unknowns.
- Failures at the head/middle/tail of host-truncated logs; missing/expired/oversized/invalid
  files; storage limits; exact source retention; honest fallback and host-pointer survival.
- Evidence budgets, version identifiers, shorter-output checks, and unchanged passthrough.
- Group/range/search recovery, advancing pagination, oversized lines, and session ownership.
- Shell quoting, recognized/unknown compounds, and misleading final exit codes.
- Analyzer session scoping, auxiliary attribution, usage normalization, and missing fields.
- Serialized-payload integration checks where supported; plugin tests, typecheck, and
  benchmark-runner smoke checks. Protect verifier/test files against task modifications.

### Pilot and ablation

Use fixture 05 for an exploratory pilot: three runs each of Stage 2 absent, filtering
off with recovery schema, corrected failure filtering, and failure filtering plus A.
Run serially with counterbalanced order, fresh sessions, fixed configuration, and
recorded cache conditions. Do not run all baselines first and all candidates afterward.
Restart OpenCode when changing plugin/configuration; verify each arm actually loaded.

Stop immediately on evidence loss or broken recovery. Select the simplest promising
candidate; three runs are screening evidence, not grounds for a PASS. Test B–D later
as separate ablations, not by tuning the selected candidate on confirmation results.

### Held-out workload and confirmation

Keep fixtures 01–04 as controls. Add four fixed representative fixtures before tuning:
multiple failures with useful diffs, compiler errors, linter errors, and successful
verification containing warnings/skips. Allow natural command choices; do not force
large-output commands to manufacture savings. Keep fixture 05 as a separate stress test.

After the pilot, freeze the candidate, fixtures, metric definitions, and baseline. Use
ten paired repetitions per fixture: five AB and five BA in a seeded shuffled schedule,
serial fresh sessions. Nine fixtures × ten pairs means a cap of 180 confirmation task
attempts; proceed only after the cheaper pilot and accounting checks pass. Compare the
candidate against the Stage-2-absent baseline to include schema/installation overhead.

Report paired, within-fixture uncertainty for the representative aggregate and each
fixture (e.g. stratified paired bootstrap, 10,000 resamples with a saved seed). Small
samples limit inference; a wide interval means INCONCLUSIVE. Do not use mixed-fixture
coefficient of variation as a universal noise threshold, peek to extend the sample,
or tune the candidate during confirmation. A revision requires a new registered run.

### Pre-registered acceptance gates

The numerical thresholds below are engineering targets, not claims about expected
performance or guaranteed statistical power. Freeze them before confirmation.

| Gate | Criterion |
|---|---|
| Evidence integrity | No lost critical diagnostics, false success, or misleading recovery |
| Quality | 100% verification in both arms; protected verifier/test hashes unchanged |
| Accounting | Complete task/auxiliary usage coverage and telemetry joins; failed attempts included |
| Primary efficiency | At least 10% lower total model consumption per verified completion across the eight representative fixtures, with the 95% interval excluding no benefit |
| Per-fixture guardrail | No statistically supported consumption increase greater than 10%; disclose all observed regressions and uncertainty |
| Latency guardrail | Upper 95% interval for representative mean duration ratio at most 1.20; disclose individual slowdowns |
| Diagnostic metrics | Turns, recoveries, and byte reduction explain results; they are not independent pass/fail targets |

Evidence loss or candidate-induced quality failure is FAIL. Baseline quality failure
requires investigating experiment validity before any efficiency claim. Missing usage,
uncertain benefit, or an unresolved guardrail is INCONCLUSIVE, not “no regression.”
A supported guardrail breach is FAIL. A stress-only benefit does not justify general
rollout; a narrower parser-specific proposal needs its own registered comparison.

PASS permits retaining only independently supported behavior; enabling remains a
separate decision. On FAIL/INCONCLUSIVE, remove or leave experimental optimization
behavior disabled without accumulating unproven complexity. Retain safe correctness
fixes, tests, fixtures, analyzer improvements, and documentation. Do not bundle delta
summaries or reporter changes into a passing core without their own evidence.
