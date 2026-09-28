# Pi filtering and context test execution

Date: 2026-09-26. Plan: [Pi testing plan](pi-testing-plan.md). Verdict: **STOPPED; no valid token comparison.**

## Work completed

- Confirmed the active Pi model from the user's settings: `zai-coding-cn/glm-5.3`; Pi reports the provider ready. The process environment had no `OPENAI_API_KEY` or `ZAI_CODING_CN_API_KEY`. This used the provider credential already configured in Pi.
- Added a Pi filtering adapter, context adapter, usage observer, per-session raw-output retrieval, and a runner that records sessions and runs the frozen independent verifier.
- Reused the existing raw-output paging logic through a shared module. OpenCode's plugin typecheck still passes; 71 focused filtering, parser, recovery-store, and paging tests pass.
- Offline mechanics checked the full 570,918-byte failing TAP log: the existing conservative filter kept the failing case, reduced the complete stream to 1,341 bytes, and returned the exact raw stream within the originating session only. The context selector made the frozen expected decisions for fixtures 06, 09, 21 (build) and 10 (skip), with packets below 8 KiB.

## Canary record

One Pi filtering canary ran on fixture 05 with filtering on and context off. Pi 0.87.1 completed the coding task; the independent verifier passed. The filtering hook fired once: it received a Pi result of 51,371 bytes and returned a 1,527-byte failure view, preserving the failing assertion. The original 570,918-byte log was recoverable by reference. These are mechanics observations, not a token-savings comparison.

The saved Pi session and independent audit reconcile across all 12 assistant messages:

| Usage measure | Recorded tokens |
| --- | ---: |
| Input | 4,968 |
| Cache read | 40,704 |
| Cache write | 0 |
| Output | 1,271 |
| Total | 46,943 |

The runner initially looked for the session file by ID and marked usage as zero. The audit found Pi names files with a timestamp and confirmed the session usage matches observer events exactly. The runner now discovers session files and reconciles the usage before scoring.

## Why the run is invalid

The workspace was nested under `benchmarks/results/` inside the repository. Pi's shell could reach the workspace parent. Its transcript shows `find ..`, `ls ..`, `node ../verify.js`, `cat ../verify.js`, and a copy of `../verify.js` into the workspace. That exposed the harness verifier and run artifacts, so the verifier PASS and token count cannot be used as a valid benchmark observation. The untouched source tree was not modified by the canary; the fixture workspace and transcript remain under the ignored results directory for audit.

The canary scheduler also stopped before the context canary because the observer runs before the filtering handler and therefore saw the original result. Its initial hook-count check was wrong; the corrected runner reads the filter's own event file. No context model call was made.

I moved subsequent workspaces to a temporary directory and added a shell sandbox plus confined paths for Pi's built-in file tools. The local sandbox probe failed under this managed execution environment: without escalation, `sandbox-exec` was denied by the host sandbox; with escalation, the process aborted with `SIGABRT`. The runner now checks this boundary before launching Pi and stops before a model call if it is unavailable. No second model session was started.

The initial broad command `bun test plugins/token-efficient` also traversed copied tests under ignored `benchmarks/results/stage8-workspaces` and reported missing fixture modules there. From the plugin directory, the focused relevant tests pass: 71/71. The plugin TypeScript check passes. No Pi comparison or context canary is claimed.

## Retained artifacts

- [Canary audit JSON](/Users/luke/src/OpenRelay/benchmarks/results/pi-stage-test/canary-20260926120150/05-noisy-test-log-fon-coff-r1-81554f77-709f-46ae-a879-427d067a0c27/canary-audit.json)
- [Original run record, retained without edits](/Users/luke/src/OpenRelay/benchmarks/results/pi-stage-test/canary-20260926120150/05-noisy-test-log-fon-coff-r1-81554f77-709f-46ae-a879-427d067a0c27/run.json)
- [Raw Pi session](/Users/luke/src/OpenRelay/benchmarks/results/pi-stage-test/canary-20260926120150/05-noisy-test-log-fon-coff-r1-81554f77-709d067a0c27/sessions/2026-09-26T12-01-51-195Z_30fa2bd3-d0e5-4cc5-b0f4-6a30d04a413e.jsonl)

Any next model experiment needs a newly frozen series after the sandbox can run and prove that shell commands and built-in file tools cannot escape the disposable workspace. Treat fixture 05 and this canary as development data, not confirmation evidence.
