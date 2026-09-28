# Stage 5 measurement coverage

**Status (2026-09-23):** measurement instrumentation implemented and tested without
model calls. The frozen 36-run audit remains byte-for-byte reproducible. The next
fixture-21 comparison has not been run.

## Title usage capability

The installed `@opencode-ai/plugin` 1.18.32 interface exposes `chat.params` before a
model request and forwards `message.updated` events to the plugin. The installed SDK's
`AssistantMessage` type includes message ID, agent, and token usage. It has no
general response-completion hook for requests that do not produce a session assistant
message. In the existing 36 runs, each `title` `llm.call` has no matching
`message.updated`/`assistant.completed` event or OpenCode `step_finish`. The plugin
cannot obtain those title tokens from the supported event surface observed here.
This is a capability finding for the installed version, not proof about future
OpenCode versions or provider billing.

Source checked: `node_modules/@opencode-ai/plugin/dist/index.d.ts` (`Hooks`),
`node_modules/@opencode-ai/sdk/dist/v2/gen/types.gen.d.ts` (`AssistantMessage` and
`EventMessageUpdated`), `plugins/token-efficient/telemetry/session-tracker.ts`,
and the local Stage 0 capability matrix under `~/.config/opencode/`.

Completion telemetry now records `messageID` and `usageAvailable`. Repeated
`message.updated` events for the same ID emit one completion. When a completion
lacks valid input, output, or cache-read usage, its event has `tokens: null` and
the analyzer marks coverage partial; it never substitutes zero. The task state’s
token counters remain sums of **known** usage, so read them with the analyzer’s
coverage status.

`analyze.mjs` keeps `tokensInPlusCache` as the **coding-completion** metric used in
the historical Stage 5 comparison. It reports `smallTokensInPlusCache` and
`titleTokensInPlusCache` separately when their request/completion counts match.
`allCallsInPlusCache` is available only when every observed `llm.call` has one
valid completed usage record. `usageCoverage` is `complete`, `partial`, or
`unavailable`. The Stage 5 gate output prints `unavailable` for all-call savings
when either arm lacks coverage. Existing records stay partial because their title
usage was never emitted.

## Benchmark timing and packet evidence

The benchmark runner now adds these fields to new `run.json` records:

| Field | Meaning |
|---|---|
| `durationMs` | Existing OpenCode subprocess time, including context preparation and in-session tools |
| `verifyStartedAt`, `verifyEndedAt`, `verifyDurationMs` | Independent verifier interval and elapsed time |
| `totalDurationMs` | Time from OpenCode launch through the independent verifier |
| `verifyExitCode`, `verifySignal`, `verifyTimedOut`, `verifyError` | Verifier outcome, including timeouts and spawn failures |
| `packetCapture` | `disabled`, `context-off`, `skipped`, `captured`, or `unavailable`; captured records include file name, SHA-256, and byte count |

The analyzer reports `verifyDurationSec` and `totalDurationSec` when those fields
exist. Old runs have null values; old session `durationSec` retains its meaning.
The harness records verifier failures and timeouts even when verification does not
pass. `totalDurationMs` stops after the independent verifier, before artifact
bookkeeping.

Use `--capture-context` for synthetic benchmark runs. It sets
`OPENRELAY_CAPTURE_CONTEXT=on` only in the benchmark child. The plugin checks both
that flag and the benchmark runtime channel. At the system-transform hook it saves
the exact packet string appended to `out.system`, with a SHA-256 digest, under the
benchmark telemetry directory. The runner checks the file's real path, size, and
digest before copying it to the run directory as `context-packet.txt`. A skip is
recorded from `context.decision`. Failure or ambiguous evidence yields
`packetCapture.status = "unavailable"`; it is never interpreted as a skip.
The capture is bounded to 32 KiB and is absent from normal daily/development runs.

The saved packet is the text OpenRelay appended to the system hook. The API does
not expose a final serialized provider request here, so this artifact does not
prove that no later plugin or provider transformation changed it.

## Validation and next decision

- `bunx tsc -p plugins/token-efficient/tsconfig.json`: PASS.
- `bun test plugins/token-efficient`: 227 PASS, including a direct system-hook
  capture test with the flag on and off.
- `node --test benchmarks/analyze.test.mjs benchmarks/measurement.test.mjs`: 11 PASS.
- A dry-run of fixture 01 recorded verifier failure, exit 1, verifier duration,
  and total duration without a model call; its temporary result was removed.
- Re-running `node benchmarks/stages/stage5/audit-stage5.mjs` produced output identical to
  `v3-audit-data.json`. Historical coding results are unchanged.

The all-call cost gate remains unavailable on the installed host because title
usage is unobserved. A future fixture-21 confirmation can report recorded coding
usage and complete task duration, with title coverage explicitly partial, provided
its protocol states that limitation before running. No selector change or default
rollout follows from this instrumentation.
