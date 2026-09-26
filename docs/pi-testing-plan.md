# Pi filtering and context test plan

Date: 2026-09-26. Status: **STOPPED before a valid comparison.** One filtering canary ran and was invalidated because the model could reach harness files above its workspace. A follow-up macOS sandbox preflight could not start in this environment. Details: [Pi test execution report](pi-testing-results.md). The first run consumed 46,943 recorded tokens; no context canary or screening comparison was run.

Next step: [isolation repair and filtering-only screen](pi-filtering-next-step.md). That follow-up narrows the immediate scope and freezes a smaller execution budget; the remaining context and confirmation stages below stay deferred.

## Decision we want to make

Determine whether two independently loadable Pi extensions reduce tokens while preserving verified task quality and complete task speed:

- **Filtering:** the current conservative filtering profile (`previewSafe: true`), including recovery of omitted output.
- **Context:** the frozen Stage 5 v3 selector and source packet.

Test filtering first, then context against the configuration we would actually use. Treat the OpenCode results as motivation, not evidence of Pi savings. The original Stage 2b result used a different filtering profile; its 72% saving is not a target or prediction for this experiment. Context's historical 25% target is not carried forward: this plan looks for repeatable positive savings with no observed slowdown.

The initial result applies only to the pinned Pi version, model, settings, and task classes tested. A positive screen advances to fresh confirmation; it does not qualify a plugin for general release.

## 1. Freeze the environment and candidates

Use the user's everyday Pi model as the primary benchmark model. Resolve its exact provider/model ID and thinking setting from the selected Pi configuration before any calls, and save them in the experiment manifest. Do not silently substitute a different model. If the everyday model cannot be determined, resolve that choice before running. Keep subscription authentication; do not introduce API/PAYG billing or automatic premium escalation.

The installed runtime inspected for this plan is **Pi 0.87.1**, package `@earendil-works/pi-coding-agent`. Recheck and pin the runtime at execution time. Its installed documentation and declarations establish that:

- `tool_result` can modify tool content and preserves separate error state.
- `before_agent_start` exposes structured prompt options; `before_provider_request` exposes the outgoing payload for delivery checks.
- Bash output is already truncated, with a full-output file when needed. Successful results can expose `details.fullOutputPath`; nonzero exits throw an error with formatted output. An OpenCode metadata adapter cannot be assumed to work unchanged.
- Usage exposes input, output, cache-read, and cache-write counters. Provider normalization still needs checking for the chosen model.

Source references: the installed package's `docs/extensions.md`, `dist/core/extensions/types.d.ts`, and `dist/core/tools/bash.js`, plus `@earendil-works/pi-ai/dist/types.d.ts`.

Prepare minimal benchmark versions of:

| Proposed component | Responsibility |
| --- | --- |
| `plugins/pi/filtering/` | Adapt tool results, preserve failures and raw recovery, expose an independent switch. |
| `plugins/pi/context/` | Prepare the existing v3 packet and add it through Pi's supported prompt interface. |
| `benchmarks/pi/observer.ts` | Record events without modifying model-visible input; loaded identically in every arm. |
| `benchmarks/pi/run.mjs` and `analyze.mjs` | Fresh workspaces, frozen schedules, usage reconciliation, independent verification, and paired analysis. |

These paths are proposed deliverables, not existing runnable commands. Reuse the existing deterministic logic through small adapters. Do not tune parsers, retrieval ranking, packet budgets, or prompts using scored results. Freeze code hashes, resolved settings, tool declarations, and packet delivery behavior before screening. A candidate change starts a new series.

Each run uses a new Pi process, session ID, and disposable workspace **outside the OpenRelay checkout and outside the run-artifact directory**. Copy the same pinned fixture state and installed dependencies into each workspace. Before any future model call, prove an OS-level sandbox confines shell processes to that workspace and denies reads of user files, repository sources, and harness artifacts. Pi's `read`, `write`, `edit`, `ls`, `grep`, and `find` tools also need path and symlink confinement. Fail closed if either boundary cannot be demonstrated. The first run under this plan violated the first condition; see the execution report. Keep model, thinking, tools, retry policy, compaction, prompt, and working-directory structure consistent across arms. Preserve Pi's native truncation and compaction behavior and record when they occur.

Disable unrelated extensions, skills, prompt templates, and inherited project instructions in the isolated benchmark configuration. Load only the frozen benchmark resources explicitly. Account for the filtering recovery tool's schema and calls as treatment overhead; do not add a dummy recovery tool to the baseline to hide that cost.

## 2. Prove mechanics before measuring savings

Start with offline checks and a mock provider where practical. Then allow at most **two short live canaries**, one for each extension, to verify the complete request path. Canary runs count toward the budget but not the savings comparison.

Filtering checks:

- Run real Pi bash tools producing short output, long successful test output, and long failing output with the decisive failure outside Pi's retained tail.
- Confirm the actual error event shape, full-log access, failure evidence, and the original `isError` value survive the adapter. Distinguish timeout/abort from a successful command; an unknown exit must not become PASS.
- Verify a raw-output reference returns the correct session's content. Check the provider-bound request contains the intended filtered result and does not also contain a duplicate full log.
- Unknown formats, unreadable full logs, unsupported results, or adapter exceptions must leave Pi's native result intact. Record abstention rather than presenting a partial tail as a complete log.

Context checks:

- Run the frozen selector on the selected fixtures and record its expected build/skip decisions before coding runs.
- Capture the exact packet, its byte count and digest, preparation time, and a provider-request delivery proof. Ensure a request gets one copy and later user prompts do not inherit a stale packet.
- Check the skip path adds no packet; retain existing path, symlink, binary, and size guards. Preserve Pi's native prompt and tool declarations.

Measurement checks:

- Reconcile finalized assistant messages, session output, and provider attempts by run/session/message or request identity. Count each completion once.
- Establish which usage includes retries, compaction, recovery, auxiliary calls, and aborted requests. Save available partial usage; missing usage is not zero.
- Prove timeout cancellation stops the child process tree. Freeze verifier hashes outside the model's workspace; verify pristine fixtures fail and reference solutions pass.

If either adapter cannot preserve its contract, stop that candidate at the mechanics gate. If token accounting cannot support a comparison, fix it before scoring. Output-byte reductions alone do not establish token savings.

## 3. Run a bounded screening experiment

Run serially to reduce provider contention. Freeze a seeded order that balances A→B and B→A across fixtures and repetitions, with each pair adjacent. Use fresh sessions for every observation; do not reuse a baseline from OpenCode or an earlier Pi experiment. Save provider caching configuration and observed cache usage rather than assuming caches are cold.

### Filtering: 12 scored runs

Two repetitions of each fixture in each arm: **3 fixtures × 2 arms × 2 repetitions**.

| Fixture | Why include it? |
| --- | --- |
| `05-noisy-test-log` | Main target: a large test log with a failure that the model must locate. |
| `02-routine-bug` | Ordinary debugging control with little output to compress. |
| `01-trivial-edit` | Control for unnecessary tool-schema and extension overhead. |

- **A:** Pi + observer.
- **B:** Pi + observer + filtering.
- Context is off in both arms.

Use unchanged fixture prompts. Fixture 05 explicitly asks for an unpiped test run, so label it as a synthetic stress case. Record whether filtering actually fired, which evidence it retained, and any raw-recovery or repeated test calls.

Advance filtering only if both target repetitions verify, its mean target token count falls, target median complete time does not rise, and the two control fixtures together increase mean tokens by no more than 5% with no median slowdown. A control increase inside that tolerance is reported, not described as zero overhead. All scored runs must pass independent verification.

This screen can advance filtering only for the noisy-log scope; it cannot establish that the extension helps typical daily tasks.

### Context: 16 scored runs

Two repetitions of each fixture in each arm: **4 fixtures × 2 arms × 2 repetitions**.

| Fixture | Why include it? |
| --- | --- |
| `06-ui-status-indicator` | A historical context winner involving source discovery. |
| `09-ui-shared-style` | A less favorable prior result; protects against selecting only winners. |
| `21-dependency-upgrade` | A cross-file migration with prior savings below the old target. |
| `10-git-missing-changes` | A skip control: v3 should avoid adding redundant Git evidence. |

- **A:** Pi + observer + the fixed filtering choice below.
- **B:** The identical configuration + context v3.

If filtering passes its screen, enable it in both context arms. Otherwise disable it in both. Record this conditional choice before the first context pair and keep it fixed throughout the context experiment. Context can proceed even if filtering fails.

Advance context only if all runs verify, the preregistered packet-building group has positive mean token savings and no median slowdown, and the skip control increases mean tokens by no more than 5% with no median slowdown. Freeze group membership from the offline selector check; do not regroup by observed savings. Report the whole corpus as well as build and skip groups.

This measures context's incremental value on the chosen filtering configuration. It does not estimate every filtering/context interaction; a four-arm factorial experiment is unnecessary for this first decision.

### A/A checks: 4 additional runs

Add one identical-configuration pair on fixture 05 and one on fixture 21, using their respective A configuration. Place these pairs at seeded positions in the relevant stage schedule. These four extra runs reveal obvious variability and drift; two A/A pairs do **not** establish a statistical noise bound.

If a candidate's apparent benefit is similar to or smaller than its relevant observed A/A drift, label the screen INCONCLUSIVE and stop automatic advancement. Do not add repetitions opportunistically until a favorable result appears.

## 4. Measure complete work

Use provider-normalized usage fields. After confirming the selected provider's counters are disjoint, define:

```text
promptTokens = input + cacheRead + cacheWrite
totalTokens  = promptTokens + output
savings      = (mean(A) - mean(B)) / mean(A)
```

Record all four components separately, and also report `input + cacheRead` for comparison with historical OpenRelay results. Do not add reasoning tokens again if they are already included in output. If a provider reports overlapping counters, document and freeze the normalization before runs.

Primary token measure: complete recorded prompt tokens across the task, including observable retries and compaction. Also require total recorded tokens not to increase, so smaller input cannot hide larger output. Include auxiliary model usage where observable and report coverage explicitly. Pi's estimated dollar cost is not a measure of subscription allowance consumption.

Complete task time starts before per-run extension preparation/Pi launch and ends after independent verification. Exclude reusable dependency installation and fixture copying from this timer, report those separately, and include all retries and recovery work. Record extension preparation, model turns, tool calls, first-edit time, repeated reads/searches, filtering decisions, packet decisions, compaction, and verification cycles as diagnostics.

For each run save:

- Immutable manifest: source/fixture/verifier/extension hashes, Pi and dependency versions, selected model and thinking level, prompt, switches, tools, settings, and scheduled arm/order.
- Session ID, request/message identities, raw JSON event output, normalized usage and coverage, timestamps, exit/timeout status, independent verifier output, and final diff.
- Before/after filtering artifacts and exact context packet with provider-delivery proofs, limited to these benchmark workspaces. Do not archive authorization headers or credentials.

Hash checks must detect modified verifiers or protected fixture files. Execute the independent verifier from the pristine harness-owned copy, with the edited workspace as its target. Count failures and timeouts in outcomes; never report savings only among successful treatment runs. A genuine pre-session launch failure is retained as invalid and may be replaced within the run budget. A started model run is never silently retried or discarded.

## 5. Stop rules and limits

The screen has a maximum of **34 model sessions**: 2 canaries + 12 filtering + 16 context + 4 A/A. These are proposed execution limits, not model calls initiated by this planning task.

Additional screening caps:

- **3 million recorded total tokens**, including cache reads/writes, output, canaries, failures, and A/A controls.
- **90 minutes** of aggregate active run time.
- Per run: **300,000 recorded total tokens or 8 minutes**, whichever is reached first.

Enforce counters as completions arrive and cancel at the next available boundary. An in-flight request can exceed a token ceiling before usage arrives; record any overshoot and start no further calls. Reserve one full per-run allowance before starting another run. Missing usage pauses execution for audit rather than granting extra budget.

Stop the affected candidate immediately for lost failure evidence, corrupted error state, cross-session leakage, protected-file modification, incomplete accounting, or an independent verification failure. Preserve completed runs and investigate; a code fix requires a newly frozen series. Unexpected baseline failures also stop the current comparison for diagnosis.

After the first repetition across a candidate's target fixtures, stop its remaining screen if the aggregate target token count has not fallen or target median complete time has risen. This is a conservative futility rule; it is not proof that the idea can never work. Controls and A/A cannot be omitted from any claimed completed screen. If a cap prevents finishing the required comparison, report INCONCLUSIVE rather than relaxing it.

## 6. Confirm promising results on fresh tasks

Only a candidate that clears the screen advances. Freeze a separate confirmation manifest and budget before running it. Keep the implementation unchanged and author two new tasks from relevant repository snapshots, with independent verifiers and more realistic file counts. Filtering tasks should naturally generate relevant long logs; context tasks should require discovering source relationships among plausible unrelated files. Confirm that the frozen candidate applies before any model runs, and disclose this targeted selection.

For each advancing candidate, run **2 fresh tasks × 2 arms × 4 paired repetitions = 16 sessions**. Use the same comparator as screening. Cap each candidate at **2 million recorded total tokens and 60 minutes**, with the same per-run limits. If both advance, the confirmation maximum is 32 sessions; the entire program is at most 66 sessions and 7 million recorded tokens, subject to earlier stops.

Report every task and pair. Give tasks equal weight in the primary mean of per-task percentage savings, with pooled token totals separately. Use a preregistered paired bootstrap within each task (10,000 draws, fixed seed) to summarize uncertainty for these two tasks; do not treat it as population-wide validation. Apply the same equal-task weighting when screening multiple target fixtures.

| Verdict | Required evidence |
| --- | --- |
| **PASS for the tested scope** | Every scored run passes independent verification; complete usage and delivery checks reconcile; both fresh tasks save mean prompt tokens; the equal-task savings estimate has a 95% bootstrap lower bound above zero; total tokens do not increase; each task's median complete time does not increase. |
| **FAIL for adoption** | A quality/integrity regression, or the completed comparison has no mean token saving or an observed median slowdown. |
| **INCONCLUSIVE** | Positive savings with uncertainty spanning zero, incomplete comparison/usage, conflicting task results, or insufficient budget to finish. |

With four pairs per task, uncertainty estimates remain limited. Report time ratios and their uncertainty even when observed medians pass; do not claim that this sample proves universal speed parity. Do not weaken the criteria after seeing results or release either extension solely on a screen result.

## Deliverable and next action

Produce one report with separate filtering and context verdicts, their exact configurations, token and complete-time changes, verification counts, usage coverage, and all stopped or invalid runs. Link the frozen manifests and raw artifacts. State whether the result supports a narrowly scoped Pi extension, further investigation, or keeping the feature off.

Implementation starts with the Pi adapters and measurement checks in sections 1–2. The experiment then follows the frozen screening schedule and stop rules. Packaging or daily installation follows a scoped confirmation result.

Historical references: [Stage 2b](stage2/stage2b-report.md), [v3 daily rollout and its limits](stage5/v3-daily-rollout.md), [measurement coverage](stage5/measurement-coverage.md), and [Stage 8 variation and map outcomes](stage8/map-optimization-live-report.md).
