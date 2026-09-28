# Stage 5 Experiment Plan — Context Engine v1: Deterministic Retrieval

**Date:** 2026-09-23
**Status:** Approved (user sign-off in session; gates preregistered below)
**Depends on:** Stage 1 telemetry/harness, Stage 2b filtering (validated), Stage 4 routing (PASS,
preliminary)

**Historical plan:** the gates and 13-fixture corpus below describe the original v1
experiment and remain frozen. Current v3 validation and fixtures 14–21 are specified in
`next-steps.md`; the proposed Jev selector trial is in `jev-experiment.md`. The focused v3 baseline has since been audited in
`v3-audit-results.md`: the UI-class gate remains unmet, and title usage plus
independent-verifier duration are missing from the recorded full-cost accounting.

---

## 1. Objective and hypothesis

> Preparing relevant evidence deterministically before the model starts (Git state, `rg`,
> targeted exact reads) reduces blind exploration enough to cut input+cacheRead ≥25% at
> equal task success.

The mechanism is partially model-independent (fewer exploration round trips ⇒ less repeated
input context), but packet adherence and exploration efficiency are model-dependent, so the
verdict must be measured on the production workhorse.

## 2. Preregistered gates (frozen before any A/B data)

| Dimension | Gate |
|---|---|
| Token savings | ≥25% lower input+cacheRead (prepared vs native arm), distinguishable from A/A noise |
| Quality | Same verify-pass rate, reported per category (ui/git/legacy) and overall. Any regression = FAIL |
| Turns | No meaningful increase: >10% higher mean model rounds (LLM calls excluding title/summary/compaction) |
| Retries | No meaningful increase: >0.25 additional failed-verification retries per task |
| Latency | Target ≤+15% end-to-end. Beyond that: **user judgment call**, always reported with absolute seconds. Not an automatic blocker. |
| Verdict mapping | PASS ⇒ eligible for rollout in validated scope. INCONCLUSIVE (savings <25% or within variance) ⇒ Stage 5 stays disabled. FAIL (quality regression or materially more rework) ⇒ reject tested configuration. |

Quality and rework gates take precedence over token savings.

### Measurement rules

- **Savings** = `1 − (prepared input+cacheRead) / (native input+cacheRead)`, summed over all
  model calls per task including retries.
- **Task success** = independent `verify.js` result (never model self-report).
- **Turns** = model inference rounds (`llm.calls` excluding small-agent calls).
- **Retries** = edit→verify cycles after a failed verification (`editTestCycles`,
  failed-verify records).
- **Latency** = end-to-end task wall time including packet preparation (separately reported
  as `context.prepMs`).
- **Variance** = paired repeated runs + A/A noise labels; a ≥25% point estimate inside noise
  is INCONCLUSIVE.
- cacheWrite and output tokens are secondary, reported but not gated.
- Plugin-side retrieval work is accounted separately (`context.*` events) so it can never
  hide effort outside measured totals.

## 3. Corpus — 13 fixtures

Constant across arms: model, routing off, escalation off, filtering **on** (daily-launcher
representative), agent (`build`), verification gates.

**Legacy (unchanged):** `01-trivial-edit`, `02-routine-bug`, `03-medium-feature`,
`04-difficult-debug`, `05-noisy-test-log` (capped at 2 reps — ~300K tokens/run).

**New UI — compact vanilla HTML/CSS/JS app with deliberate distractor components:**

| Fixture | Task | Verification |
|---|---|---|
| `06-ui-status-indicator` | Add a status/version badge to one specific panel | jsdom: element in correct panel, distractors untouched |
| `07-ui-viewport-clip` | Fix clipping/alignment at narrow viewport | **Playwright** headless at pinned viewports (layout truth) |
| `08-ui-state-handling` | Change a loading/error interaction | jsdom + unit tests on state logic |
| `09-ui-shared-style` | Shared style change affecting several components | jsdom: affected updated, unaffected untouched |

**New Git — deterministic seeded repos (fixed authors/dates/graphs), in-workspace bare remote:**

| Fixture | Task | Verification |
|---|---|---|
| `10-git-missing-changes` | Diagnose work missing from a branch (diverged history) | Branch topology (`branch --contains`), content |
| `11-git-merge-conflict` | Resolve controlled conflict preserving both intents | Merge result content, clean status, tests pass |
| `12-git-recover-commit` | Recover a "lost" commit (non-branch ref) | Commit reachable on target branch, content intact |
| `13-git-separate-work` | Requested change without sweeping in unrelated uncommitted work | Intended diff paths only; unrelated work preserved |

New fixtures target ~30–60K tokens/run.

## 4. Implementation

### Phase 0 — zero-token engineering (before any model runs)

- `docs/stage5/stage5-plan.md` (this document).
- Fixtures 06–13 + per-fixture optional `setup.mjs` runner hook + per-fixture verify timeout
  (Playwright needs >30s).
- `plugins/token-efficient/lib/context/`: request-signal extraction, Git/rg/exact-read
  retrieval, budgets, packet assembly with provenance (path + line span + content hash).
- **Deterministic retrieval eval:** each fixture declares ground-truth files that a useful
  packet must contain; unit-tested recall/precision with no LLM.
- Telemetry: `context.packet_built` (bytes, sources, files, prepMs), plugin-side retrieval
  counters. Analyzer: rounds, retries, cache split, category split, prep overhead.
- 5A: re-verify `experimental.chat.system.transform` / `messages.transform` semantics on
  OpenCode 1.18.32 (matrix was verified on 1.18.31); confirm GLM reports `cache.read` /
  `cache.write` (open Stage 0 item).

### Phase 5B — packet injection (builds on Phase 0)

- Primary: `experimental.chat.system.transform` — ephemeral, not persisted; repo content is
  **data**, never controller instructions; sections labeled `[CONTROLLER CONTEXT]`.
- Fallback (recorded if used): prepend context block at `chat.message` (persisted).
- **Cache-aware:** packet built once per session, byte-stable across turns; refreshed only
  when provenance hashes change.
- Budgets (bytes/section, max excerpts) are configuration, calibrated from Phase 0.
- Retrieval failure / ambiguity / missing tools ⇒ native exploration, silently.
- 5C (Lean/Normal/Expanded/Deep) is **deferred** until 5B passes; Lean + Normal only.

## 5. Experiment protocol — sequential waves with stop rules

Every workhorse run counts toward the verdict dataset; waves gated on interim results.

| Wave | Runs | Purpose / gate |
|---|---|---|
| 0 | 0 model runs | Phase 0 engineering + retrieval eval must pass, else stop |
| 1a | 6 = 3 fixtures × 1 × 2 arms on **flash** | Mechanics smoke: no crashes, arms differ only by flag |
| 1b | 26 = 13 × 1 × 2 on **workhorse** | Interim paired analysis. Stop rules: savings <10% or any quality break ⇒ record INCONCLUSIVE/FAIL and stop |
| 2 (gated) | +26 (2nd rep) + ~13 (3rd rep, borderline fixtures only) | Full preregistered gates |
| A/A | 8 = 4 fixtures × 2 (workhorse; flash A/A for 01–04 already exists) | Noise floor |

**Estimated budget:** ~0.5M (smoke) · ~3M (to interim) · ~6.5–7M if fully confirmed.
**Zero premium tokens** (routing off, escalation off).

### Flags

- Runner: `--context on|off` ⇒ `OPENRELAY_CONTEXT` ⇒ plugin `context.enabled`.
- Default **off** everywhere (plugin default stays off; launcher opt-in later, gated on PASS).

## 6. Analysis & reporting

`analyze.mjs` extensions: category split (ui/git/legacy), model rounds, retry deltas,
cache-read/write split, packet prep overhead, paired A/B with noise check.
Output: `docs/stage5/stage5-report.md` with PASS/FAIL/INCONCLUSIVE against §2.

## 7. Risks

- `experimental.*` hooks changed since 1.18.31 ⇒ documented fallback (§4 5B).
- GLM cache fields absent ⇒ savings gate falls back to raw input; noted in report.
- Flash smoke not representative ⇒ it gates mechanics only, never the verdict.
