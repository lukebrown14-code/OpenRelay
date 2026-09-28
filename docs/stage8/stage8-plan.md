# Stage 8 plan — repository map entry gate

**Status:** Initial audit stopped at its failed gate. A fresh real-repository
follow-up passed the entry gate. The offline map prototype and bounded live
pilot were then executed. The pilot failed the token and speed stop rules;
no runtime integration or release followed. See `map-prototype-report.md`.

## Objective

Find whether a task-specific repository map can save coding tokens on larger,
cross-file work while preserving independently verified quality and complete
latency. The comparison baseline is filtering plus the deployed v3 context
selector. Stage 8's architecture requires evidence of excessive exploration
before building a map.

## Phase 1: evidence and frozen sources

1. Audit saved Stage 5 and Stage 7 tool traces, counting searches/listings,
   navigation-only rounds before the first edit, source reads, repeated reads,
   and required-file access. Keep each run linked to its original trace hash,
   session, fixture, and verification result.
2. Freeze allowlisted source snapshots for OpenRelay and Delta. Record each
   repository HEAD, dirty paths, inclusion/exclusion rules, file hashes and a
   tree digest. Delta is read-only; its modified `config.toml` and runtime data
   are excluded. Snapshot bytes live under ignored `benchmarks/results/`.
3. Enter map prototyping only with **at least three distinct task cases** each
   showing **two or more navigation-only rounds before the first edit** under
   filtering plus v3, and **at least two** of those cases having a concrete
   source relationship that a map could expose. Structural complexity alone
   does not pass this behavioral gate. A failed gate ends Stage 8 as
   **INCONCLUSIVE / no build**.

## Conditional phase 2: offline map and task set

If Phase 1 passes, implement an offline, deterministic JS/TS and Python source
map over the frozen snapshots. Extract definitions, imports, references and
containment; rank by task terms and local dependency proximity; render within
a fixed token budget. Compare map addressability with native retrieval on a
fresh, labeled set of at least 24 tasks spanning both repositories. Evaluate
required-file and implementation-span recall, map size, build time, stale-map
behavior, and failure cases. Keep the prototype outside the plugin.

## Conditional phase 3: model comparison and release decision

Only after a useful offline result, preregister a separately budgeted A/B
experiment: filtering plus v3 versus the same stack plus the map. Run tasks
interleaved with independent verification. Measure input plus cache-read
tokens, complete latency, searches, files read, retries, map overhead, and
quality. Stop on a material quality drop or slowdown. A model experiment and
runtime integration need their own reviewable protocol and budget before they
begin; neither belongs to the audit-first execution.

## Executed artifacts

- `benchmarks/stages/stage8/audit-stage8.mjs` → `discovery-audit.json`
- `benchmarks/stages/stage8/freeze-stage8.mjs` → `source-manifest.json` and ignored snapshots
- `stage8-report.md` → gate result and verdict

The Phase 1 gate failed. Phases 2 and 3 were therefore not started.

## Follow-up: fresh real-repository cases

At the user's request, four fresh cross-file task prompts and external
verifiers were prepared against the frozen OpenRelay and Delta snapshots.
Their baselines fail the intended contracts. They were then run once each;
three verified tasks met the navigation criterion, and two Delta tasks showed
map-addressable imports. See `discovery-followup-report.md` and
`task-corpus-manifest.json`. This passes the entry gate without establishing
that a map improves outcomes. The subsequent offline prototype covered 47/48
required files but did not outperform a lexical ranking. Its first live map
arm passed verification but used 39.3% more tokens and took 26.8% longer than
its saved v3 baseline. The futility stop ended the pilot;
`map-prototype-report.md` has the evidence.
