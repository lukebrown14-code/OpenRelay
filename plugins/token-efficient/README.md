# token-efficient plugin (Stage 1: Baseline & Observability)

Implements the Stage 1 telemetry foundation from `token-efficient-architecture.md`.
Registered globally in `~/.config/opencode/opencode.jsonc`:

```jsonc
"plugin": [["./plugins/token-efficient/index.ts", { "telemetry": { "enabled": true } }]]
```

Options: `telemetry.enabled` (default true), `telemetry.dir` (default `~/.local/share/opencode/token-efficient`).

## What it records

One task record per session (subagent child sessions get their own), written to
`tasks/<project-slug>/<task-id>.json` and mirrored as events in `events/<project-slug>.jsonl`.

| Metric | Source |
|---|---|
| Task/run IDs | sessionID ↔ taskID map, persisted in `state.json` |
| Attempts | user messages per session (`chat.message` hook) |
| LLM calls | per request (`chat.params`), tagged agent + small-model flag |
| Tokens & cost | `input/output/reasoning/cacheRead/cacheWrite/cost` per completed assistant message |
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
`session.error`, `task.idle`.

Telemetry never throws into the host: every hook body is defensive and failures are swallowed.

## Layout

```
index.ts                      plugin entry (hooks wiring)
lib/ids.ts                    task IDs, slugs, hashing
lib/store.ts                  storage: event JSONL, task state files, session map
lib/classify.ts               model tier classification
telemetry/session-tracker.ts  per-session aggregation (tokens, switches, latency, outcomes)
telemetry/tool-tracker.ts     tool metrics, files, verification detection
```

## Notes

- Config/plugin changes require an opencode restart.
- GLM Coding Plan reported `cacheRead: 0` on a fresh single call; verify cache
  accounting across repeated runs (Stage 1 open item).
- Premium-path (ChatGPT subscription) token/cost semantics differ (cost is zeroed
  upstream); proxy accounting remains a design requirement.
