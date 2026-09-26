# Stage 5 v3 — Probe-Gated Selection: Investigation Results & Addendum

**Date:** 2026-09-23
**Base:** `stage5-report.md` (v1 INCONCLUSIVE; v2 git-intent skip)
**Next:** `next-steps.md` documents the repeated v3 A/B and fixtures 14–21;
`jev-experiment.md` documents the later selector trial. New symptom-first fixtures
expose a no-locator retrieval gap, so the 13-task verdict matrix below is historical.
**Current status after audit:** the repeated v3 baseline is complete and remains
INCONCLUSIVE: 15.2% recorded coding-token savings in the original UI class. The
projection below is historical, not a validated saving or zero-regression guarantee.
Fixtures 14–21 are implemented; 19 and 21 have pilots. See `v3-audit-results.md`
for corrected numbers, trace findings, and accounting limits.

**Method:** five parallel investigations (cache economics, probe correctness audit,
packet content review, replay-simulator feasibility, corpus extension design), then
implementation of the synthesized v3.

## Investigation verdicts

| Investigation | Verdict |
|---|---|
| Cache economics | **No placement change.** Packet in the system prompt, byte-stable, is cached at 95–100% after call #1; cacheWrite is reported as 0 by z.ai (write-side perturbation unmeasurable); call-1 variance (±7.3K) is provider-side prefix-cache luck, ~10–25× the packet's cost. Fixture 05's "+11K cacheRead" decomposed into a call-1 cache-hit artifact, not damage. |
| Probe correctness audit | **6 HIGH/MED issues fixed** (below), two of which would have flipped v3 verdicts. |
| Packet content | **−55% packet bytes** shipped (echo-drop, slim git, compact gutter); symbol-map tail + budget tiering deferred (behavior change → needs its own benchmark arm). |
| Replay simulator | **No-build.** Delete-only replay cannot express behavioral restructuring (r≈0.68 predicted-vs-observed, 0/13 bracket coverage, ON-vs-ON variance ±26–34% exceeds most effects). Pseudo-replication risk; violates the "INCONCLUSIVE adds no complexity" rule. |
| Corpus extension | **3 initial specs**, subsequently implemented (14-ui-dismiss-strip, 15-debug-export-labels, 16-ui-overlay-leak); the extension now contains 14–21. Original fixtures are retained. See `docs/stage5/corpus-extension.md`. |

## Correctness fixes shipped in v3 (from the audit)

| ID | Severity | Fix |
|---|---|---|
| E1 | HIGH | `GIT_INTENT_RE` matched prose ("reset the form" → git intent → false packet skip). Now: unambiguous vocabulary short-circuits; weak verbs (merge/commit/reset/…) require ≥3 distinct matches or a `feature/…`-style branch ref. |
| E2/R1 | HIGH | Quoted strings were searched as rg *regexes* (`retry(fn, options)` silently matched nothing; `{...}` threw → empty candidates indistinguishable from absence). Now: fixed-string (`-F`) everywhere + `spawnSync` exit triage — 0=hit, 1=verified absence, ≥2=error → verdict **fails open to build**. |
| R2 | HIGH | Plain `-F` alone broke fixture 06 (the regex dot in `.panel-header` was load-bearing). Shipped with the extractor's dot-stripped locator derivation (`.panel-header` also searches `panel-header`), restoring 06's ground truth. |
| E4 | MED | `PATH_RE` truncated `settings.test.js` → `settings.test`. Now allows interior dots. |
| R3 | MED | O(patterns × files) `-q` re-probe loop deleted; each candidate carries its earning pattern for anchoring. |
| R4 | HIGH | rg output order was nondeterministic (15 distinct orders in 50 runs → 13 distinct packet hashes). Now `--sort path` + JS-side sort + path tie-break. |
| R5 | MED | `anchorExcerpt` separator bytes now counted against budget. |
| — | HIGH | **`.env` leak**: search-discovered dotfiles are denied (explicit user-named dotfiles still allowed, realpath-confined). |
| — | HIGH | Symlink escape: `realpathSync` confinement on every read. |
| — | MED | Explicitly named >512KB file: truncated head window instead of silent drop. Binary (NUL) rejection. CRLF normalization. |
| — | INFO | Engine drops the request echo (TASK.md identical to prompt) from excerpts. |

## v3 selector (shipped)

Two-stage: extract signals → **probe** (fixed-string rg, ~50ms) → **verdict** → reads+packet only on build.

- `git-intent` → skip (v2 behavior).
- `build:new-candidates` — search found location evidence the request didn't name.
- `build:cross-file-scope` — ≥2 source files named.
- `skip:explicit-single-target` — one named target, every locator resolves inside it.
- `skip:redundant-candidates` — nothing named, nothing found.
- `probe-error-fail-open` — rg failure ⇒ build (never let a broken probe silently disable evidence).

**Full-corpus verdict matrix (zero-token, pinned by tests):**

| Verdict | Fixtures |
|---|---|
| build | 06, 07, 08, 09 |
| skip | 01, 02, 03, 04, 05 (explicit-single-target except 03 redundant-candidates), 10–13 (git-intent) |

Improvement over the Option-2 prediction: the hardened signal pipeline also skips 03
and 04 (04's locators fully resolve into its named file under fixed-string + test
exclusions) — **all four original UI fixtures build; legacy and Git fixtures skip.** Accepted tradeoff stands: 04's measured −23.5% packet win is
sacrificed by design (single-explicit-target); if `context.decision` telemetry later
shows single-target tasks with heavy exploration, the threshold can be revisited with
evidence.

## Mechanics validation (live, flash, 2 runs)

- 06: `decision build/new-candidates` → packet **2,106 B** (v1: ~4.7KB; −55% from
  echo-drop + slim git + compact gutter), prep 51ms, verify PASS.
- 02: `decision skip/explicit-single-target` (named: `src/slugify.js`), verify PASS.
- Both `context.decision` events observed in live telemetry with named/candidates payloads.

## Historical economics projection (superseded by measured baseline and audit)

v3 = native for {01–05, 10–13} + measured packet wins for {06–09}: aggregate input+cacheRead
savings ≈ 80.9K/754K ≈ **10.7%** on the current corpus (v1: 7.6%), with no packet injected on skipped classes. That does not establish zero economic
regression or byte-identical prompts: the audit found no archived prompts, and the
observed skip runs still differ in model behavior. Per the
restated **category-scoped gate**: the enabled class (location-heavy UI/debug) must
clear ≥25% with no quality change; the current corpus's four enabled fixtures measured
−23.6%…−50.2% (n=1 each). The focused repeated baseline was subsequently executed; the audited class savings
are 15.2%, below the gate. The historical projection is not a rollout justification.

## Follow-up status

- Symbol-map tail + budget tiering (needs its own PASS arm).
- Corpus extension 14–21 is now implemented; the fixtures are a separate cohort.
  Follow the audited experiment recommendation rather than treating this as pending implementation.
- `context.decision` telemetry accumulates named/candidates data to revisit thresholds
  from evidence.
