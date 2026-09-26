# Pi filtering: isolation repair and controlled screen

Date: 2026-09-26. Status: **PLANNED; no new model calls.**

Goal: establish whether the existing filtering extension reduces complete-task tokens in Pi while preserving verified correctness and task speed. This is the next bounded step in the [original test plan](pi-testing-plan.md); context testing and plugin packaging follow separately.

## Starting evidence

The first canary demonstrated that filtering can run in Pi: 51,371 bytes became 1,527 bytes with the failing assertion retained. Its 46,943 recorded tokens reconcile with the session. However, Pi accessed the harness verifier above its workspace, invalidating the run as benchmark evidence. There is no valid baseline comparison. Preserve that run and its [audit report](pi-testing-results.md).

The runner now creates an external temporary workspace, but its OS sandbox probe failed in this execution environment. The existing probe only executes `pwd`; even a successful result would not prove isolation. The mocked path checks also do not establish how real Pi tools behave.

## 1. Establish a working execution boundary — zero model calls

Start with a standalone offline preflight using the exact shell wrapper and tool configuration intended for the benchmark. Record the runtime, sandbox profile, tool configuration, commands, expected outcomes, and actual outcomes.

Use synthetic sentinel files outside the workspace to represent repository files, verifier files, run artifacts, and user files. Test access without reading real private data. Permit the fixture workspace and the runtime files needed to execute its tools. Keep verifier sources, benchmark records, other sessions, and credentials inaccessible to model-invoked tools.

Exercise actual Pi tool implementations through a deterministic driver or mock provider:

- Positive controls: read/edit/write a fixture file, search the workspace, run its test command, and create temporary output.
- Negative controls: parent traversal, absolute external paths, home expansion, external symlinks, dangling symlinks used for writes, and recursive searches that encounter external links.
- Shell controls: attempt the previous `find ..`, `cat ../verify.js`, and verifier-copy pattern against sentinels; also attempt access from a child process and an external write.
- Lifecycle controls: cancel a running tool and confirm its descendants terminate before verification begins.
- Extension controls: raw-output retrieval cannot return another session's data; a forged full-output pointer cannot cause the filter to read an external sentinel. Validate allowed log paths at the point of use.

If macOS sandboxing still cannot run in this managed environment, record the failed preflight and prepare a reproducible preflight entry point for a compatible host. A container or VM is an alternative only after checking its availability and verifying the same access tests; it must not mount the checkout, host home, or verifier into the tool environment. Do not bypass the failed boundary or start model calls to diagnose it.

**Gate:** every positive control succeeds and every forbidden operation is denied, including through real tools. Save `isolation-preflight.json`. A mock hook test or successful `pwd` is insufficient. If no compatible execution environment is available, this stage ends with an explicit environment blocker and zero new model calls.

## 2. Finish the measurement harness — zero model calls

Review and repair these concrete gaps before freezing a new series:

| Component | Required result |
| --- | --- |
| `run.mjs` / `confinement.ts` | Require the access preflight before launch; use identical confinement in both arms; preserve original command classification when wrapping bash. |
| Configuration | Resolve and pin installed Pi version, provider/model, thinking level, tool declarations, and settings; verify the selected model remains `zai-coding-cn/glm-5.3` before using it. Preserve existing subscription authentication. |
| Manifest | Hash fixtures, verifier, extensions and their imported filtering code, runner, observer, and isolation configuration; record fresh session identities and a frozen schedule. |
| Observer | Match finalized completions to the session by identity; establish usage normalization and coverage for retries, compaction, aborts, and auxiliary requests. Unknown usage must stop scoring. |
| Delivery capture | Inspect the actual provider-bound request after transformations: retain the failure, preserve error state, and confirm the removed log has not been duplicated elsewhere. Capture benchmark content without credentials. |
| Verification | Check pristine fixtures fail and reference solutions pass. Run the frozen verifier only after Pi and tool descendants exit, check its hash and protected fixture hashes, and bound verifier execution time. |
| Scheduling / budgets | Add the filtering-only schedule and aggregate budget enforcement. Preserve invalid runs and stop reasons. The current `canaries.mjs` also launches context and must not be used unchanged. |
| Analyzer | Require complete scheduled cells and valid accounting; calculate paired savings, A/A drift, and conventional medians (average the middle two for even counts). Emit a gate verdict, not just cell summaries. |

Use deterministic sessions and tool outputs to check these behaviors without a provider call. Include long successful output, a failure outside Pi's retained tail, timeout/unknown exit status, unsupported output, and raw recovery. Filtering exceptions must preserve Pi's native result.

Freeze the corrected harness and filtering implementation before live work. Any subsequent candidate or harness correction starts a new series; retain the earlier observations.

## 3. Run one fresh filtering canary

Use fixture `05-noisy-test-log`, filtering on, context off, in a fresh isolated process. Exclude this run from savings estimates.

**Gate:** filtering actually fires; provider delivery contains the decisive failure and correct error state; raw recovery works; access checks remain enforced; independent verification passes; session and observer usage reconcile completely. Stop on any failure and retain the artifacts.

## 4. Run the filtering screen

Run serially with fresh processes, sessions, and workspaces. Use unchanged prompts and identical settings in both arms. Arm A loads the observer and confinement; arm B adds filtering and its recovery tool. Count that tool's schema and calls as treatment overhead. Context stays off.

| Task | Purpose | Scored sessions |
| --- | --- | ---: |
| `05-noisy-test-log` | Synthetic long-log target | 2 A/B pairs = 4 |
| `02-routine-bug` | Ordinary debugging control | 2 A/B pairs = 4 |
| `01-trivial-edit` | Small-task overhead control | 2 A/B pairs = 4 |
| `05-noisy-test-log`, filtering off | A/A variability check | 1 additional pair = 2 |

Freeze a seeded schedule before any calls. Keep each pair adjacent, reverse A/B order between repetitions, and include the A/A pair in the first wave. Complete the first repetition across all three fixtures before evaluating the futility rule. Stop before wave two if target prompt tokens do not fall or target complete time rises. Report an early stop as an incomplete screen; retain all observations.

Measure complete recorded prompt tokens (`input + cacheRead + cacheWrite`, after confirming disjoint provider counters), total tokens, independent verification, and complete elapsed time through verification. Record component usage, cache behavior, turns, recovery calls, filtering activity, and coverage. Exclude reusable dependency installation and fixture copying from complete time, reporting them separately.

### Limits for this next step

- Maximum **15 new model sessions**: 1 canary, 12 A/B observations, and 2 A/A observations.
- Maximum **1.5 million recorded total tokens** and **45 minutes aggregate active run time**, including canary and failed runs.
- Per run: **300,000 total tokens or 8 minutes**. Reserve a full per-run allowance before launching the next run; record any in-flight overshoot and launch nothing further.
- The original invalid canary remains a separate 46,943-token expense in the cumulative report. These limits replace the filtering portion of the broader schedule; they do not authorize resetting its overall budget or starting context/confirmation automatically.

Stop immediately on boundary failure, lost failure evidence, changed error state, session leakage, protected-file modification, incomplete usage, verification failure, or a budget ceiling. Do not silently replace started model runs or tune the filter using scored results.

## 5. Make the decision

The screen advances only when all 14 scored observations verify and accounting reconciles, both target repetitions demonstrate filtering activity, mean target prompt tokens fall, and target mean total tokens and median complete time do not increase. The two ordinary controls must show an equal-task mean prompt-token increase of at most 5%, with no pooled total-token increase or median slowdown. Report each control separately.

Define A/A drift as the absolute difference between the two baseline prompt-token counts divided by their mean. Target savings must exceed that observed drift to advance. One A/A pair is a diagnostic, not a statistical noise bound.

- **PASS at screening:** all gates pass; proceed to a separately frozen confirmation on fresh realistic long-log tasks under the original plan. This supports only further testing of the noisy-log scope.
- **FAIL for adoption:** a valid completed comparison shows no target saving, a slowdown, excessive control overhead, or a verified filtering quality regression.
- **INCONCLUSIVE:** isolation/accounting prevents a valid comparison, a stop leaves the screen incomplete, or the apparent saving is no larger than observed A/A drift. Keep the feature experimental and add no product complexity.

Deliver a report with every run, token and time differences, quality results, usage coverage, invalid/stopped observations, and links to the frozen schedule and artifacts. A screen result does not establish everyday Pi savings or justify packaging. Context remains a separate experiment, with its baseline filtering choice determined by this result.

## Immediate implementation task

Build the standalone isolation preflight and run its offline access tests. Its result determines whether the rest of this plan can execute here or requires a compatible host.
