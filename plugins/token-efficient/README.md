# token-efficient plugin (Telemetry, Filtering, Task Controller, Context Engine)

Implements the Stage 1 telemetry foundation and Stage 2 deterministic tool-output filtering
from `token-efficient-architecture.md` / `docs/stage2-tool-output-filtering.md`.
For project trials use the frozen `opencode-relay` launcher; use `opencode-relay-dev`
for live development. See [project trial setup](../../docs/project-trials.md).
The installer removes the old global symlink/registration after backing it up.

Manual plugin registration (do not combine with the launchers):

```jsonc
"plugin": [["./plugins/token-efficient/index.ts", { "telemetry": { "enabled": true }, "filtering": { "enabled": false } }]]
```

Options:
- `telemetry.enabled` (default true), `telemetry.dir` (default `~/.local/share/opencode/token-efficient`)
- `filtering.enabled` (default **false**), `filtering.minBytes` (default 4096),
  `filtering.retention.ttlHours` (24) / `maxBytesPerResult` (10 MiB) / `maxBytesPerSession` (50 MiB).
- Env override `OPENRELAY_FILTERING=on|off` wins over `filtering.enabled` (used by the benchmark runner).
- `filtering.previewSafe` (default false for compatibility) selects the conservative
  TAP-only preview; channel launchers set it true. Broader historical filtering is not
  enabled by the daily launcher.
- `controller.route` (`off|auto|premium|glm`, default **off**) — deterministic Task
  Controller routing. `off` = no rewrite; `premium`/`glm` = force a tier; `auto` =
  classifier (workhorse default, premium for `/plan|review|deep|chatgpt` or
  complexity markers). Slash overrides (`/glm /chatgpt /plan /review /deep /auto`) win.
- `controller.escalation.maxCycles` (default 3) — failed verifications before the
  workhorse is escalated to premium via `session.promptAsync`. Escalation is opt-in
  only: `OPENRELAY_ESCALATE=on` (default off).
- `controller.checkpoint` (`enabled`, `patterns`) — keyword-driven high-risk flag for
  `permission.ask`; off by default, telemetry-only in v1.
- Env overrides `OPENRELAY_ROUTE` and `OPENRELAY_ESCALATE` win over config (used by the
  benchmark runner). Model IDs are enumerated at runtime (`client.provider.list()`), never
  hard-coded; `controller.premiumModel`/`controller.workhorseModel` (`provider/model`) are
  explicit user overrides.
- `OPENRELAY_CAPTURE_CONTEXT=on` stores exact packet text only when
  `runtime.channel` is `benchmark`; the runner exposes this through
  `--capture-context`. The packet is saved under `telemetry.dir/context-packets/`
  and copied into the run directory after a hash check. See
  `docs/stage5/measurement-coverage.md`.
- `runtime.channel` / `runtime.buildID` label telemetry, the TUI startup toast
  ("OpenRelay <channel> <buildID>", shown once per instance via `client.tui.showToast`;
  silently skipped in headless mode), and the persistent sidebar-footer badge
  (`tui.tsx`): a bordered "● OpenRelay <channel> / OpenCode <version> / <buildID>"
  panel at the bottom of the right sidebar. It wins the `single_winner`
  `sidebar_footer` slot by registering below the host's internal order 100, and is
  injected per launch via `OPENCODE_TUI_CONFIG` (see `scripts/relay-runtime.mjs`).
  Raw logs and cleanup follow
  `telemetry.dir` under its `raw/` subdirectory rather than sharing a fixed global store.
- The plugin default stays off. The explicit project-trial launchers enable the
  conservative preview without claiming it has passed the revised efficiency gates.

## Historical filtering (Stage 2; `previewSafe: false`)

- `tool.execute.after` rewrites recognized **bash** output only: tests (vitest/jest/mocha/
  pytest/node --test/bun test/npm-style test scripts), typecheck (`tsc`/pyright/mypy),
  lint (eslint/biome/ruff/golangci-lint), builds (npm/bun/pnpm/yarn build, cargo/go builds).
  Versioned reasons (`vitest:v1`, `tsc:v1`, …). Unknown, short (<minBytes), or
  uncertain-to-parse output passes through unchanged. Raw output is stashed exactly at
  `~/.local/share/opencode/token-efficient/raw/<session>/<ref>` (0600/0700, 24h TTL, caps).
- `openrelay_raw_output` custom tool recovers raw output: session-scoped refs,
  `range`/`search` modes, ≤200 lines / 16 KiB per call, pagination metadata. Its own
  output is never re-filtered.
- Telemetry: `tool.filtered` (`reason`, `bytesBefore/After`, `ratio`, `omittedLines`, `ref`),
  `tool.raw_recovered` (`ref`, `mode`, `bytesReturned`), per-task `filtering` totals.

## What it records

One task record per session (subagent child sessions get their own), written to
`tasks/<project-slug>/<task-id>.json` and mirrored as events in `events/<project-slug>.jsonl`.

| Metric | Source |
|---|---|
| Task/run IDs | sessionID ↔ taskID map, persisted in `state.json` |
| Attempts | user messages per session (`chat.message` hook) |
| LLM calls | per request (`chat.params`), tagged agent + small-model flag |
| Tokens & cost | `input/output/reasoning/cacheRead/cacheWrite/cost` per completed assistant message; `messageID` and `usageAvailable` mark deduplication and missing usage |
| Per-model breakdown | `byModel` with tier classification (premium/workhorse/free) |
| Model switches | consecutive assistant messages with different provider/model |
| Latency | per assistant message (`time.created → time.completed`) |
| Tool calls | counts, durations, output bytes, errors per tool (`tool.execute.before/after`) |
| Files read/edited | `read` / `edit|write` tool args |
| Verification results | bash commands matching test/lint/typecheck patterns; verdict from exit code or output markers |
| Edit/test cycles | verifications that follow an edit |
| Outcomes/errors | `session.error`, assistant message errors, `session.idle` |

Tier classification (`lib/classify.ts`): `openai` → premium, `zai/zhipu/glm` → workhorse,
`openrouter` → free, else other.

## Event stream

Normalized JSONL: `{ts, v, type, slug, session, task, data}` with types:
`task.created`, `user.message`, `llm.call`, `assistant.completed`, `model.switch`,
`tool.call`, `file.read`, `file.edited`, `verification`, `message.error`,
`session.error`, `task.idle`, `tool.filtered`, `tool.raw_recovered`,
`controller.routed`, `controller.escalated`, `controller.checkpoint`.
Benchmark packet capture adds `context.packet_captured` or
`context.packet_capture_failed`. Title requests can lack a matching assistant
completion on the installed OpenCode version; the analyzer marks all-call usage
partial in that case.

Telemetry never throws into the host: every hook body is defensive and failures are swallowed.

## Layout

```
index.ts                      plugin entry (hooks wiring, filter hook, tool registration)
lib/ids.ts                    task IDs, slugs, hashing
lib/announce.ts               TUI identity toast payload
lib/store.ts                  storage: event JSONL, task state files, session map
lib/classify.ts               model tier classification
lib/filtering/config.ts       filtering options/defaults, env override
lib/filtering/classify.ts     command classification → versioned filter reasons
lib/filtering/parsers.ts      per-family evidence extraction (versioned)
lib/filtering/raw-store.ts    bounded session-scoped raw output storage
lib/filtering/filter.ts       filter orchestrator (gates, stash, telemetry)
lib/controller/config.ts      Task Controller options/defaults, env overrides
lib/controller/models.ts      runtime premium/workhorse model resolution (no hard-coded IDs)
lib/controller/route.ts       deterministic routing decision + slash overrides
lib/controller/escalate.ts    failed-verification escalation threshold
lib/controller/checkpoint.ts  keyword-driven high-risk flag (permission.ask)
tools/raw-output.ts           openrelay_raw_output recovery tool
telemetry/session-tracker.ts  per-session aggregation (tokens, switches, latency, outcomes)
telemetry/tool-tracker.ts     tool metrics, files, verification detection
```

## Notes

- Config/plugin changes require an opencode restart.
- GLM Coding Plan reported `cacheRead: 0` on a fresh single call; verify cache
  accounting across repeated runs (Stage 1 open item).
- Premium-path (ChatGPT subscription) token/cost semantics differ (cost is zeroed
  upstream); proxy accounting remains a design requirement.

(End of file - total 97 lines)
