# Stage 5 Experiment Report — Context Engine v1: Deterministic Retrieval

**Date:** 2026-09-23
**Corpus:** 13 fixtures (5 legacy + 4 UI + 4 Git)
**Workhorse:** `zai-coding-plan/glm-5.3` · **Flash smoke:** `zai-coding-plan/glm-5.3-flash`
**Constants across arms:** filtering on, routing off, escalation off, agent `build`
**Plan:** `stage5-plan.md` (gates preregistered before any A/B data)

**Later work:** v3 implementation details are in `v3-addendum.md`. The next validation
protocol and additional fixtures 14–21 are in `next-steps.md`. No repeated v3 workhorse
A/B or new-fixture model runs are included in this historical report. Jev is a proposed
separate experiment (`jev-experiment.md`).

**Current-status correction:** this is the historical v1/v2 report, including early
v3 expectations. Its earlier scoped-win language is not a validated current claim.
The repeated v3 baseline and audit found **15.2% recorded coding-token savings**
for the original UI class, below the 25% gate. Context remains off by default.
Fixtures 14–21 are implemented. See `v3-audit-results.md` for corrected v3 numbers,
trace evidence, and missing title-usage/independent-verifier timing coverage. The
historical v1/v2 percentages below have not been recalculated in that audit.

## Summary in plain language

**The idea.** Before the AI model starts working on a coding task, have OpenRelay do the
boring detective work first: check the git state, search the repo, and read the relevant
files. Hand the model a short "cheat sheet" (a *context packet*) so it doesn't waste turns
hunting for the right code. The bet: fewer wasted exploration turns = fewer tokens, with
the same quality of work.

**What we built.**

- A context engine: reads your request, picks out file names / symbols / error codes,
  searches the repo deterministically (no AI involved), and assembles a small evidence
  packet (1–5 KB) injected into the system prompt.
- Eight new benchmark tasks (4 UI + 4 Git) with traps and look-alike files, plus
  automatic checks that prove a task was actually solved.
- A "smart on/off switch" (the *selector*) that decides per task whether the cheat sheet
  is worth building at all.
- Telemetry records decisions, packet metadata, and coding completion usage. The
  later audit found missing title-token usage and no archived exact packet text.

**What the experiments found.**

- **Quality never suffered.** All 26 comparison runs passed their verification checks in
  both configurations.
- **The initial single-pair results suggested a benefit for source-location tasks.**
  The originally reported UI/debug savings were promising; repeated v3 results
  later failed to establish the class-level claim.
- **It's pure waste for easy tasks.** If the task already says which file to edit, the
  model finds it instantly anyway — the cheat sheet just adds cost.
- **It's waste for Git tasks.** The cheat sheet tells the model git facts it would look
  up itself in one cheap command anyway.
- **Overall number was mediocre (7.6% savings vs the 25% target)** because the corpus
  mixes all task types — so we stopped spending per the pre-agreed stop rule.

**How v3 made it smart.**

- The engine now *probes* the repo first (a quick search, ~50 ms) and only builds the
  cheat sheet when the search shows the model would otherwise have to hunt across files.
- Git tasks, single-file tasks, and "the search found nothing new" tasks all skip it —
  no context packet is injected. This does not establish identical prompts or run costs.
- Result (pinned by automated tests across all 13 tasks): cheat sheets are built **only**
  for the 4 UI tasks — every task type that lost tokens now skips.
- Packets also shrank ~55% and got a batch of safety fixes (no more leaking `.env`
  contents, no following symlinks out of the project, deterministic output).

**Other things we checked (so we don't have to again).**

- Caching: the cheat sheet does *not* break the provider's token caching. Keep it where
  it is.
- A "simulator" to fake more test runs without spending tokens: **not possible** — the
  model changes its behavior in ways a simulation can't reproduce.
- The three initially designed harder tasks are now implemented, alongside fixtures
  17–21 (see `corpus-extension.md` and `next-steps.md`).

**Where this leaves Stage 5.**

- Officially **INCONCLUSIVE** on the original whole-corpus target — the tested configuration saved 7.6% in aggregate. Historical corpus-ceiling
  estimates were projections from those observations, not proof of an absolute limit.
- The early UI/debug signal motivated a scoped v3 test. **That class-level test did
  not clear the savings gate**; only fixture-specific benefits are established in
  the recorded coding measurements (see the audit).
- Still **off by default** (`OPENRELAY_CONTEXT=on` turns it on); Git tasks self-exclude.
- Each packet decision is logged (`context.decision`), so real-world usage will tell us
  whether the on/off line is drawn in the right place.

## Verdict

**INCONCLUSIVE — Stage 5 stays disabled by default.**

- **Overall input+cacheRead savings: 7.6%** (target ≥25% beyond noise). Below the
  preregistered stop threshold (<10%), so Wave 2 was not run.
- **UI category: strong PASS signal** (37–50% savings, −29–55% model rounds, same quality).
- **Git category: FAIL signal** (net worse on all four fixtures: +12% tokens, +5% rounds,
  +21% latency).
- **Legacy: neutral** (mildly negative on trivial tasks; `04-difficult-debug` won 23.5%).

Quality was preserved everywhere (26/26 verify PASS), but the packet does not pay for
itself on Git or trivial tasks, which neutralizes the UI gains in aggregate.

## Mechanics (Wave 1a — flash smoke)

6 runs, 6/6 verify PASS. Packet built exactly once per session, prep ~174–313ms/run,
arms differed only by the `OPENRELAY_CONTEXT` flag, zero premium tokens. `cache.read`/
`cache.write` confirmed reported by GLM (5A closed; the savings gate is measurable).

## Wave 1b results (workhorse, n=1 per cell)

| Category | verify | input+cacheRead Δ | model rounds Δ | latency Δ |
|---|---|---:|---:|---:|
| legacy (5) | 100% = 100% | −0.5% | −4.9% | −7.5% |
| **ui (4)** | 100% = 100% | **−40.3%** | **−44.4%** | **−38.7%** |
| **git (4)** | 100% = 100% | **+12.1%** | **+4.9%** | **+20.9%** |
| overall (13) | 100% = 100% | −7.6% | −12.7% | −8.1% |

(Δ expressed as B vs A; negative = the prepared arm uses less / is faster.)

### Per-fixture input+cacheRead (B vs A)

| Fixture | Δ |
|---|---:|
| 06-ui-status-indicator | −50.2% |
| 07-ui-viewport-clip | −45.4% |
| 08-ui-state-handling | −37.0% |
| 09-ui-shared-style | −23.6% |
| 04-difficult-debug | −23.5% |
| 05-noisy-test-log | +11.4% |
| 01/02/03 (trivial→feature) | +3.0% / +3.3% / +4.4% |
| 12-git-recover-commit | +4.2% |
| 11-git-merge-conflict | +12.7% |
| 13-git-separate-work | +12.7% |
| 10-git-missing-changes | +15.1% |

## Finding: the packet only pays when file *location* is the bottleneck

The prepared packet reduces tokens precisely when the model would otherwise spend
multiple exploration rounds locating the right source (UI component among distractors,
difficult-debug). It is **pure overhead** in two regimes:

1. **Trivial/single-file tasks** (01–03): the model finds the file immediately anyway;
   the ~5–6KB packet is additive.
2. **Git tasks (10–13):** the packet's Git evidence (status/log/diff) does not displace
   the model's own git commands — it still runs them to make the fix and commit — so the
   excerpted git state is duplicated, not substituted. Net: +tokens, +rounds, +latency.

No retrieval-miss or stale-evidence failures were observed; the gate that failed is
economic, not correctness.

## Gates (prerecorded) vs observed

| Gate | Threshold | Observed | Met? |
|---|---|---|---|
| Savings | ≥25% | 7.6% overall (UI 40%, Git −12%) | No (overall) |
| Quality | no regression | 100% = 100% | Yes |
| Rounds | ≤+10% | −12.7% overall (Git +4.9%) | Yes (overall) |
| Retries | ≤+0.25/task | 0.00 | Yes |
| Latency | review >+15% | −8.1% overall (Git +20.9%) | Flag for Git |

## Recommendation — targeted v2, not Wave 2

The result does not justify Wave 2 (another ~3M tokens) on the current configuration.
Instead, a cheaper, hypothesis-driven fix is available: **task-adaptive packet assembly**.

- Suppress the packet (or drop the Git-evidence section) when the request signals
  `gitIntent` — let Git tasks use native exploration.
- Suppress for requests with a single explicit path and no search need (trivial class),
  where the packet is overhead.
- Keep the packet for source-location tasks (UI, debugging), where it demonstrably wins.

This is a ~20-line change gated behind the existing signal extraction, re-validated with
a small paired re-run of the affected fixtures (UI + Git + one trivial + one debug)
before any full-corpus spend.

## Follow-up

- ~~Implement task-adaptive packet selection; re-run 4-fixture paired smoke.~~
  **Done as v2** (below) and superseded by **v3 probe-gated selection** — see
  `v3-addendum.md`.
- Only if that re-run clears ≥25% savings with no Git regression, run Wave 2 (2nd rep)
  to confirm beyond n=1.
- `05-noisy-test-log` showed +11.4% (slight regression) and should be re-checked under
  the adaptive selector; its 300K/run cost keeps it out of any cheap smoke.

---

## v2 addendum — task-adaptive selection (2026-09-23)

**Change:** `ContextEngine.prepare` now skips the packet entirely when the request
signals git intent (`context.packet_skipped {reason:"git-intent"}`), letting Git tasks
use native exploration. Non-git requests are unchanged. (Selector deliberately does
NOT try to suppress trivial tasks: their loss is small and structurally identical to
winner `04` — no deterministic pre-task signal separates them without overfitting.)

**Re-smoke** (4 fixtures, workhorse `glm-5.3`, n=1 per cell, A arm reused from Wave 1b):

| Fixture | packet? | input+cacheRead Δ | rounds Δ | latency Δ |
|---|---|---:|---:|---:|
| 06-ui-status-indicator | built | −50.2% | −54.5% | −54.6% |
| 02-routine-bug | built | (legacy pair, see below) | | |
| 04-difficult-debug | built | (legacy pair, see below) | | |
| 10-git-missing-changes | **skipped** | +23.2% | +18.2% | +19.1% |

Legacy pair (02+04): savings −8.2%, rounds −13.3%, latency −49.4%.

**Findings:**

1. **Selector mechanics confirmed:** git requests build no packet (0.75 packets/run
   across the 4), prep ~90ms, quality 4/4 PASS.
2. **UI/debug wins fully preserved** (06: −50% tokens, −55% rounds; legacy pair −8%
   with −49% latency).
3. **Key evidence:** fixture 10 regressed +23% in the B arm **with zero packets
   injected** — worse than its +12% packet-carrying Wave 1b arm. Git exploration on
   this fixture has ±20% run-to-run variance at n=1, so the Wave 1b git verdict
   (+12% with packet) is directionally consistent with the duplicated-effort analysis
   but cannot be separated from noise without more reps.

**Historical v2 interpretation, superseded:** the single-pair UI/debug signals
motivated a category-scoped v3 experiment; they did not validate category-wide
rollout. The completed v3 baseline remains INCONCLUSIVE after audit (15.2% recorded
coding-token savings for the enabled UI class). Keep context off by default and
Git-intent skipping in place. Additional Git experiments require a separate reason
to target that class; the existing single pairs do not establish a noise bound.
