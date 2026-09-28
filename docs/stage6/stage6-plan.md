# Stage 6 — Shared Project Memory and Structured Handoffs

**Status:** 6A–6D done (see `capability-check.md`, `offline-protocol.md`/`offline-results.md`, `smoke-result.json`). **6E executed 2026-09-24** (`pilot-results.md`): 29 retained runs passed verification; corrected main-arm handoff comparison is −15.4% on diagnosis, +22.6% on plan, +8.6% on follow-up, and +6.0% across those three fixtures with equal fixture weight. Handoff is INCONCLUSIVE. Memory did not show benefit in its sole selected-note run and fails to advance; general value remains inconclusive. **Both features stay off; no 6F advance.** Two harness defects (shared-session import contamination, spawnSync encoding crash) invalidated the first attempt and pushed spend to ~44 sessions/~3.2M tokens against the 34/3M caps — disclosed in the report; extension was user-approved mid-flight. 6G release decision: nothing to release.

**Date:** 2026-09-24.

**Objective:** reduce repeated discovery and conversation transfer when work resumes or changes models, while preserving task quality and performance.

**Roadmap:** [architecture, sections 9 and 11, and Stage 6](../token-efficient-architecture.md).

**Starting release:** [Stage 5 v3 daily rollout](../stage5/v3-daily-rollout.md).

## 1. Decision and motivation

Build a small, local memory and handoff system around supported OpenCode sessions. Start with explicit task continuation and evidence that can be checked against source. Test project memory and handoff compression separately before combining them.

The user accepts savings below Stage 5's original 25% target. Stage 6 therefore targets **repeatable positive savings**, with quality and performance as release requirements. A smaller packet alone does not establish success.

Stage 5 provides the following starting evidence:

| Finding | Consequence for Stage 6 |
| --- | --- |
| Repeated v3 UI comparison saved 15.2% of recorded coding input plus cache-read tokens. | Use the deployed v3 behavior as the reference configuration. |
| Fixture 21 saved 22.6%, but complete task time rose 6.3%. | Measure full workflow time; token savings do not imply a faster task. |
| V4 found the required file in 10/10 validation cases but the required block in only 5/10. | Score preserved decisions, constraints, and exact evidence, not just file names. |
| Coverage prototypes failed their advance gates. | Use explicit references and verified task records initially; broad semantic retrieval remains outside this stage. |
| Title-call usage is unavailable on the installed host. | Preserve incomplete-usage labels and distinguish coding-token savings from all-call cost. |
| Stage 4 escalation was not exercised by its live corpus. | Test handoff transport without turning on automatic escalation or claiming it is validated. |

Jev remains a separate proposed experiment in [the existing plan](../stage5/jev-experiment.md). It is not a Stage 6 dependency. V4 work remains parked.

## 2. First useful workflows

1. **Accepted plan → implementation:** carry the objective, approved constraints, implementation steps, and acceptance criteria into a fresh implementation session.
2. **Failed attempt → diagnosis:** carry the attempted changes, current failures, verification provenance, and unresolved questions into a diagnosis session.
3. **Interrupted task → continuation:** restore useful task state without repeating all earlier exploration.
4. **Related later task → selected project knowledge:** reuse a small, current decision or module note when its references match the new task.

The first pilot uses the workhorse on both sides to isolate information transfer. Later confirmation exercises premium → workhorse and workhorse → premium through the existing subscription authentication path. A same-session model switch normally retains history; adding a summary there is not assumed to save tokens.

## 3. Scope and operating boundaries

Implement versioned task artifacts, conservative memory selection, provenance checks, explicit handoff preparation/consumption, and measurement across related sessions. Reuse existing filtering, context retrieval, model enumeration, and telemetry.

Stage 6 features start off in every channel. Daily filtering and v3 context keep their current configuration during experiments. Memory and handoffs need independent enable switches so either can be evaluated or rolled back alone.

The stage does not require a new model router, automatic escalation, a repository graph, vector storage, an external memory service, a custom conversation compactor, or generated architecture documents on every task. It must use supported OpenCode hooks and session operations without creating a replacement agent loop.

## 4. Storage and ownership

Use the architecture's task-specific layout:

```text
project/
  AGENTS.md                         existing project rules
  .codebase/
    INDEX.md                        concise human-readable index
    memory.json                     versioned metadata and explicit references
    modules/<note-id>.md             small project notes, created when useful
  .tasks/<task-id>/
    state.json                      canonical task metadata
    PLAN.md                         accepted plan, when one exists
    PROGRESS.md                     concise observed progress
    handoffs/<handoff-id>.json       immutable structured snapshots
    HANDOFF.md                      view of the selected snapshot
```

Opt-in initialization creates only the required directories and empty schema files. Existing files are never silently replaced. Do not edit `AGENTS.md` automatically or duplicate rules the host already loads. A Markdown view is derived from its canonical metadata; divergent edits require explicit reconciliation rather than silently choosing one version.

Project artifacts remain locally stored and are not automatically committed. Channel telemetry stays under the existing OpenRelay data roots. Broad transcripts and full raw tool outputs stay in their existing stores; a handoff records references and only the evidence required for continuation.

Use a stable project identity plus canonical worktree identity. A common Git directory may link related worktrees, but does not make their source state interchangeable. Non-Git repositories need an explicit local identity. Cross-worktree consumption requires fresh evidence validation; cross-project consumption is rejected.

### Task identity and concurrent sessions

The current tracker creates a task per session and does not restore an existing task record in `ensure()`. Fix this explicitly before claiming resumable tasks:

- Persist a workflow/task identity separately from session identity and associate continuation sessions explicitly.
- Keep existing telemetry task IDs available for historical joins; add workflow, parent-session, and handoff IDs rather than reinterpreting old records.
- Restore state after restart, deduplicate completed-message usage, and prevent two sessions from silently owning the same mutable progress record.
- Use atomic writes, immutable handoff snapshots, and a per-task revision or lock. A global read/modify/write session map alone is insufficient for concurrent writers.
- Do not expire active task evidence or delete unrelated task directories as part of cleanup.

## 5. Minimal schemas and provenance

| Record | Required fields |
| --- | --- |
| Task | Schema version, task/workflow ID, project/worktree identity, originating session, objective reference, revision, lifecycle status, created/updated times. |
| Handoff | Unique ID, schema version, source task/session, direction, objective, constraints, accepted decisions, relevant files, current work, next steps, acceptance criteria, unresolved questions, evidence references, creation time. |
| Verification | Exact command, directory, observed exit status or unknown, execution time, source-state digest at execution, and recoverable result reference. |
| Memory note | Note ID, scope, referenced paths/symbols, origin task/session, author kind, supporting evidence, source digests, last validation time, and current validity status. |
| Evidence reference | Repository-relative path, exact-content digest, optional line range/symbol, captured source state, and a bounded recovery mechanism. |

Differentiate **user-approved**, **tool-observed**, **model-proposed**, and **unknown** values. An assistant's assertion that a test passed is not a tool-observed result. An idle session is not a completed task. Only evidence for the current source state may support a current verification claim.

Record the Git commit when available, plus digests of relevant dirty and untracked files. A commit hash or timestamp alone cannot establish freshness. Renames, deletion, file-content changes, or missing dependencies invalidate affected references. Current source is authoritative about code behavior; referenced prose is derived knowledge. A fresh hash proves that the reference has not changed, not that a semantic claim is correct.

Long-term memory candidates require explicit acceptance into `.codebase/`; completed sessions do not automatically become permanent project knowledge. An author can retire or supersede a note without destroying its provenance.

## 6. Handoff creation and consumption

### Creation

Capture objectives and accepted plans from explicit user/task artifacts. Collect edited-file lists, source digests, and verification records deterministically. The initial implementation does not ask an extra model to summarize every session.

When a semantic field cannot be recovered reliably, preserve it as unknown or require an explicitly supplied handoff field. Do not guess omitted decisions from telemetry. Any later model-assisted authoring must record its tokens, latency, and confidence limitations as part of the complete workflow.

Premium → workhorse records emphasize the accepted plan, constraints, and acceptance criteria. Workhorse → premium records emphasize current changes, material failed attempts, exact remaining failures, and what remains uncertain. A raw-output handle scoped to the sender session is not automatically usable by the receiver: create a task-scoped recovery reference or copy the bounded necessary evidence with checked provenance.

### Consumption

Use an explicit prepare/continue operation with a visible target session and model. First verify the installed SDK's session creation, prompting, model selection, and TUI navigation behavior with a no-model capability check.

Prefer a fresh supported session when the experiment requires replacing transcript transfer. Retain the source session and link it for manual recovery. Do not silently replace the active session, delete persistent history, or inject a continuation on every idle event. If the supported surface cannot provide a usable continuation, keep file export/import as the initial interface and mark automated session transfer unvalidated.

The receiver receives the original objective and all mandatory constraints, plus the selected handoff and any separately eligible project memory. The normal source tools remain available. Deliver each logical handoff once; do not insert it into both the first user message and the system packet. Provider context may resend prior messages later, so measure actual completion usage rather than assuming one-time wire cost.

Malformed artifacts, unsupported schemas, missing mandatory information, or stale critical evidence cause a recorded fallback to native continuation or complete history transfer. A failure must never throw into a host hook or leave a session without the original request.

## 7. Conservative memory selection and budgets

Select project notes by explicit note/task reference or overlap with verified source paths already identified by v3. Use stable tie-breaking. Weak matches, conflicting notes, stale notes, and unrelated requests abstain. Do not inject every note or infer a semantic match from a generic keyword alone.

Initial configurable bounds, frozen before pilot runs:

| Item | Initial limit |
| --- | ---: |
| Project notes considered from metadata | 100 |
| Selected notes | 2 |
| Rendered memory content | 2 KiB |
| Rendered handoff data, excluding the original user request | 6 KiB |
| Total auxiliary context: v3 + memory + handoff | 12 KiB |
| Files hashed for freshness per operation | 32, at most 4 MiB total |
| Local preparation | Target p95 ≤100 ms; abandon added work at 250 ms |

Count complete UTF-8 payloads, including headers and provenance, before adding them. Packet bytes are a size bound, not a token-saving metric. Prioritize mandatory handoff constraints and exact current failures, followed by direct source evidence and optional memory. If mandatory material exceeds the cap, fall back with a reason; do not silently truncate acceptance criteria or failures. Large diffs remain recoverable by exact references.

Keep v3's candidate-generation algorithm frozen. The combined renderer must account for the existing packet's complete bytes, avoid duplicate paths/excerpts, and report omissions. Inspect the actual emitted packet in benchmarks; file-selection telemetry alone is insufficient.

All artifact reads/writes must be confined to the initialized project/task roots, reject path traversal and symlink escape, and avoid including dotfile secrets, binary data, or unrelated user content. Repository notes and generated handoffs remain labeled data, without authority to alter controller policy.

## 8. Implementation milestones

| Milestone | Deliverables | Advance condition |
| --- | --- | --- |
| 6A — capability and baseline | Check installed hooks/SDK and native continuation/compaction behavior; freeze current release, runtime settings, models, and measurement definitions. | A supported explicit transfer mechanism exists and the causal comparison is specified. |
| 6B — artifacts and task continuity | Versioned schemas, local initialization, stable workflow IDs, recovery after restart, immutable snapshots, conflict handling, provenance validation. | Isolation, freshness, concurrency, and failure-path checks pass without model calls. |
| 6C — selective assembly | Deterministic handoff builder, bounded note selection, complete-byte budget, evidence recovery, and duplicate suppression. | Frozen offline cases preserve all mandatory facts and abstain correctly. |
| 6D — opt-in integration | Separate memory/handoff configuration, explicit session continuation, defensive hooks, and telemetry/capture joins. | A bounded smoke demonstrates one delivery and correct session/model association. |
| 6E — workhorse pilot | Compare native transfer, structured handoff, selected memory, and their combination. | Useful savings without a quality failure or an observed latency regression; otherwise stop or mark inconclusive. |
| 6F — realistic confirmation | Fresh tasks, actual sender costs, both premium/workhorse directions, independent verification. | Quality, savings, latency, and accounting gates all support the specific feature proposed for release. |
| 6G — daily release decision | Report, release notes, explicit rollback, and an approved scope based on evidence. | Separate user release authorization after the measured result is available. |

Proposed implementation locations:

- `plugins/token-efficient/lib/memory/`: schemas, storage, provenance, selection.
- `plugins/token-efficient/lib/handoff/`: builder, validation, rendering, session association.
- `plugins/token-efficient/tools/`: explicit preparation/continuation interface after 6A selects the supported mechanism.
- `plugins/token-efficient/index.ts`, `lib/context/`, `lib/store.ts`, and `telemetry/session-tracker.ts`: narrow integration and workflow joins.
- `scripts/relay-runtime.mjs`: resolve proposed `OPENRELAY_MEMORY=off|on` and `OPENRELAY_HANDOFF=off|on`; unset means off in every channel.
- `benchmarks/`: dedicated transfer runner/analyzer, fixtures, packet captures, independent verifiers, and noise analysis.

Names and SDK calls are implementation proposals until 6A verifies them. Do not treat a type declaration as proof of live host behavior.

## 9. Offline validation before model spend

Develop against explicit synthetic examples, then freeze a separate validation set and all hashes before scoring. Do not retune on that validation set and call a repeat a fresh result.

The holdout contains 12 positive cases and 8 negative/failure cases, covering accepted-plan constraints, failed verification details, partial progress, restart recovery, concurrent tasks, worktree changes, stale notes, missing evidence, ambiguous notes, oversized diffs, malicious instructions in notes, and unrelated tasks.

Advance requires:

- All required objective, constraint, acceptance, and current-failure facts retained or an explicit safe fallback: zero silent losses.
- Relevant, usable memory or handoff evidence in at least 10/12 positive cases. A fallback is safe but does not count as useful coverage.
- Zero accepted stale critical claims, cross-task/project leakage, or unintended new model calls.
- All 8 negative/failure cases abstain or fall back correctly.
- All payload bounds hold, raw evidence is recoverable in the intended receiver scope, and no hook exception escapes.
- Preparation meets the local budget, with cold and warm timings reported separately.

Use focused unit/integration checks for concurrency, restart identity, provenance invalidation, malformed artifacts, and actual hook delivery. Keep independent fixture verifiers separate from the retrieval implementation and hidden from packet selection.

## 10. Benchmark design

### Fixed baseline and four arms

All arms use the same filtering settings, frozen v3 source, verification, models, budgets, and initial repository states. Record `previewSafe` explicitly: daily uses the conservative preview, so filtering-on alone does not fully describe the reference behavior. Automatic routing/escalation remain off; the harness explicitly selects the model required for each phase.

| Arm | Transfer | Project memory |
| --- | --- | --- |
| A | Native/history continuation supported by the host | Off |
| B | Structured handoff | Off |
| C | Same native/history continuation as A | Selected notes |
| D | Structured handoff | Selected notes |

First determine what OpenCode actually sends during normal continuation, including any native compaction. Do not manufacture an unusually verbose transcript baseline to inflate savings. Capture what is observable and identify any inaccessible final provider transformations.

Comparisons are B/A for handoffs, C/A for memory, and D/B for the incremental value of memory with a handoff. Report D/A as the combined effect; do not add independent percentage savings.

### Fixtures and bounded pilot

Create three new multi-step fixtures, reserving IDs 22–24 only if still unused:

1. Accepted plan with a non-obvious compatibility constraint and at least two affected modules.
2. Failed implementation with a recoverable exact failure, a tempting rejected approach, and unfinished work.
3. Related follow-up task where one project note remains useful and another has become stale after a source change.

Each has a pinned sender-state snapshot, realistic prior messages, labeled mandatory facts, decoys, and an independent receiver verifier. Have enough files and history to require discovery; report actual corpus sizes and avoid padding with meaningless content. Add two simple control fixtures where added memory/handoff data should be skipped.

The first pilot uses frozen synthetic sender states and workhorse receivers. It isolates receiver behavior and makes **no end-to-end or premium-saving claim**. Account for synthetic setup explicitly; any model-assisted conversion during the pilot is charged to the relevant arm.

- Main matrix: 3 fixtures × 4 arms × 2 repetitions = 24 receiver sessions.
- Skip controls: 2 fixtures × A/D = 4 receiver sessions.
- A/A observations: 2 extra A sessions on each of 2 main fixtures = 4 sessions.
- Mechanics smoke: at most 2 additional workhorse sessions.
- Proposed pilot ceiling: **34 sessions and 3 million recorded coding input+cacheRead tokens**, whichever is reached first. No premium sessions in this pilot.

Use randomized, interleaved blocks and record the schedule before calls. Reserve headroom before starting a block. Stop starting blocks at the cap; retain incomplete blocks and failed runs transparently. Missing primary usage invalidates economic conclusions rather than being treated as zero. These are proposed experiment limits; this planning task does not initiate calls or inherit an earlier Stage 5 token budget.

### Confirmation

Advance only the feature combination that earned a pilot signal. Use fresh fixtures and complete independent A/B workflows with real sender sessions, construction costs, recovery, and receiver verification.

An initial bounded confirmation can use 2 directions × 3 paired repetitions × 2 arms × 2 sessions per workflow = **24 sessions**. One direction is premium plan → workhorse implementation; the other is workhorse failed attempt → premium diagnosis. Both arms must use the same fixed transition rule. This tests transfer mechanics, not the optimal escalation policy from Stage 7.

Proposed confirmation caps: **2 million total recorded coding input+cacheRead**, of which at most **500,000 premium**, and at most **12 premium sessions**. Models are selected from runtime enumeration and frozen for the run. Premium uses the existing OAuth subscription path; no API billing fallback. Preregister the exact schedule and stop rules after the pilot, before any confirmation call. If the small sample cannot establish the gates, report INCONCLUSIVE and estimate the additional evidence needed rather than extending indefinitely.

## 11. Measurements and release gates

Use a workflow ID to join every sender, constructor, receiver, recovery, and independent verifier. Sum all observed coding completions; do not join by label or file name alone. Record per-model/tier input, output, reasoning and cache fields separately; never silently fill missing usage with zero or add overlapping token categories twice.

The primary economic measure is total **recorded coding input+cacheRead across the entire workflow** in confirmation. Report premium usage separately. Also report transferred bytes/token estimates, memory writes/reads, search/read rounds, retries, first-pass verification, missing mandatory facts, stale-claim use, and complete elapsed workflow time. Charge memory creation/refresh to the workflow that causes it. Report cold-start and reuse results, including how many later tasks are needed to repay memory creation overhead.

| Gate | Required interpretation |
| --- | --- |
| Quality | No intervention-caused independent-verifier failure, lost mandatory constraint, wrong-task action, or stale critical claim. Baseline failures are retained and investigated; equal aggregate pass rates alone are insufficient. |
| Savings | Positive baseline-relative workflow savings, with a paired 95% interval lower bound above zero on confirmation. No fixed 25% minimum. Report task-class results and weighting; small repeated samples do not prove broad generalization. |
| Performance | No observed increase in median complete workflow time in the pilot. Confirmation must support no slowdown: paired 95% upper bound for the mean time ratio ≤1.00. If timing remains uncertain, the rollout gate is INCONCLUSIVE even when savings are positive. |
| Tail behavior | Report maxima and observed slow cases. Small pilots cannot establish production p95; any proposed tail-latency claim needs sufficient fresh observations. |
| Preparation | Offline bounds hold and measured overhead is included in workflow time. |
| Accounting | All primary coding usage and verifier timings join correctly. Unobserved title/other calls remain visibly partial; no all-call spend claim. |
| Fallback | Feature-off and error paths retain usable native behavior with no repeated prompts or unintended sessions. |

The performance gate deliberately reflects the user's preference for savings without slowing work. Do not silently replace it with Stage 5's +15% review threshold. A different practical tolerance would be a separate explicit decision before a new confirmation run.

PASS/FAIL/INCONCLUSIVE applies to each feature independently. Two repetitions per pilot cell are screening evidence only. Bootstrap/A/A results from tiny samples are descriptive; report their limitations and avoid presenting one extra off run as a noise bound. On any attributable quality failure, stop the affected live arm and investigate before further spend. Do not tune a losing feature on confirmation results and reuse the same holdout for a PASS claim.

## 12. Telemetry, reporting, and rollout

Add proposed events such as `memory.selected`, `memory.skipped`, `memory.invalidated`, `handoff.prepared`, `handoff.consumed`, and `handoff.fallback`. Include workflow/task/session association, reason, artifact digest, source-state digest, byte counts, and preparation time. Metadata is the daily default; exact packets/transfers are captured only for synthetic benchmarks with an explicit capture flag.

Deliver:

- `docs/stage6/capability-check.md`: installed surface and continuation mechanism.
- `docs/stage6/offline-protocol.md` and `offline-results.md`: frozen cases, hashes, measurements, and gate outcome.
- `docs/stage6/pilot-protocol.md` and `pilot-results.md`: arms, schedule, budgets, per-run evidence, and feature decisions.
- `docs/stage6/confirmation-protocol.md` and `stage6-report.md`: complete workflow evidence, accounting limitations, final verdicts, and deployment recommendation.

Only a passing feature is a release candidate. Daily activation is a separate action after results are reviewed; the present request authorizes this plan. Rollback must disable memory and handoff consumption independently without deleting artifacts, changing source sessions, or preventing normal OpenCode use. Follow the existing release/runtime installation mechanism and require a restart for a new daily build.

**First implementation step:** execute 6A, freeze the real native continuation baseline, and implement the 6B schemas and task identity recovery. This establishes whether structured handoffs can replace repeated history in this host before adding live model cost.
