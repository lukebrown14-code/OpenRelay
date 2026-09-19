# Stage 0 — OpenCode Extension Surface Capability Matrix

**Date:** 2026-09-19
**Verified against:** opencode 1.18.31 (installed binary, `~/.opencode/bin/opencode`)
**Source inspected:** `anomalyco/opencode` tag `v1.18.31` (plugin loader, plugin runtime, session loop, LLM request prep, compaction, provider, Codex auth plugin)
**Local SDK:** `@opencode-ai/plugin` 1.18.30 type definitions (`~/.config/opencode/node_modules/@opencode-ai/plugin`)
**Provider registry:** models.dev API snapshot (2026-09-19)

**Architecture gate verdict:** ✅ **Stock OpenCode + global plugin + lightweight configuration is viable. No fork required.**

---

## 1. Capability matrix

| Capability | Supported? | Mechanism / Hook | Notes |
|---|---|---|---|
| Global plugin loading | Yes | `~/.config/opencode/{plugin,plugins}/*.{ts,js}` auto-globbed; explicit `plugin` array in `opencode.jsonc` (npm spec, path, or `[name, options]` tuple) | Sequential hook execution, deterministic order. File plugins skip npm compatibility gate. |
| Project plugin overrides | Yes | `.opencode/{plugin,plugins}/*.{ts,js}` per project; deep-merged config, project beats global | Dedupe by plugin identity; last declared wins. |
| Model enumeration | Yes | `client.provider.*` SDK inside plugin; models.dev registry; `provider.models` plugin hook can filter/inject models | Registry lists are authoritative; plugin can rewrite per-provider model list at auth time (Codex plugin does exactly this). |
| Per-agent/model selection | Yes | Agent frontmatter/config `model:`; config `model`, `small_model`; command frontmatter `model:`/`agent:` | Static per agent/command. |
| Model switching during workflow | Yes (turn granularity) | `chat.message` hook: mutate `output.message.model` (the UserMessage) **before** it is persisted; the agent loop re-reads `lastUser.model` every step (`prompt.ts:1141`). Also programmatic `client.session.prompt({ model, agent })` | Model is pinned per user message; a mid-agent-step model change is not supported. Escalation = inject next user turn with premium model. TUI tab-switch also works manually. |
| Context/request transformation | Yes (experimental) | `experimental.chat.messages.transform` — fires **every LLM step** with the full session message array (`prompt.ts:1255`); `experimental.chat.system.transform` — per request (`request.ts:69`) | **Must mutate the array in place**; the trigger's return value is not captured and reassigning `output.messages` does not propagate (`msgs` local var is used afterwards). Mutations affect only the outgoing request, not stored history (each step reloads from DB). This is the packet-mode enabler. |
| Tool-call observation | Yes | `tool.execute.before` (`prompt.ts:307`), `tool.definition`, `event` bus (all events forwarded to plugin, `plugin-index.ts:255`) | Args mutable in place. |
| Tool-result transformation | Yes | `tool.execute.after` — mutate `output.title/output.output/output.metadata` (`prompt.ts:389`) before persistence/reinjection | **Tool-output filtering (Stage 2) is directly supported.** Raw output can be stashed by the plugin for on-demand recovery. |
| Token/usage metadata | Yes | `AssistantMessage.tokens = { input, output, reasoning, cache: { read, write } }` + `cost`; delivered via `message.updated` event and `client.session.messages` | Present for providers that report usage. ChatGPT-sub path zeroes `cost` (subscription). Cache fields depend on provider usage detail — verify GLM empirically in Stage 1. |
| Premium path type: raw vs hosted agent | **RAW** | Codex auth plugin rewrites `/v1/responses` & `/chat/completions` to `https://chatgpt.com/backend-api/codex/responses`, keeping OpenCode-constructed body (messages + function tools). System prompt passed via `instructions` option. No server-side autonomous session/tool management observed. | Preferred case: context packets, budgets, filtering, and telemetry are enforceable on the premium path. Note: OpenCode-specific headers are stripped; `originator`/UA/session-id headers added by built-in plugin. |
| Session/task state | Yes | SDK `client.session.*`: `messages`, `prompt`, `promptAsync`, `fork`, `summarize`, `todo`, `children`, `abort`, `status` | Plugin can drive escalation handoffs programmatically (`promptAsync` with model+agent). |
| Custom commands | Yes | `command/<name>.md` with frontmatter (`description`, `agent`, `model`, `$ARGUMENTS`); `command.execute.before` hook; SDK `session.command` | `/plan`, `/review`, `/deep`, `/glm`, `/chatgpt` are implementable as global commands. |
| Subagents/child sessions | Yes | `task` tool + agent `mode: subagent`; `AgentPart`/`SubtaskPart` prompt inputs; `session.children` | Premium-plan → GLM-implementation delegation can use subagents with different models. |
| GLM Coding Plan connection | Yes | Registry provider `zai-coding-plan` (`@ai-sdk/openai-compatible`, base URL `https://api.z.ai/api/coding/paas/v4`); `zhipuai-coding-plan` for CN endpoint | Models: `glm-5.3`, `glm-5.3-flash`, `glm-5.3-highspeed`, `glm-5.2`, `glm-5.2-highspeed`, `glm-5-turbo`, `glm-4.7`. Auth = generic API key (no dedicated OAuth flow). Do not hard-code model IDs — enumerate at runtime (plan requirement). |
| ChatGPT subscription connection | Yes | Built-in `CodexAuthPlugin` (`plugin/openai/codex.ts`): OAuth (browser + headless device flow), auto token refresh, account-id header | Allowed subscription models (current): `gpt-5.5`, `gpt-5.3-codex-spark`, `gpt-5.4`, `gpt-5.4-mini` (+ future gpt-5.x > 5.4; `-pro` variants and `gpt-5.6` filtered out). Limits for 5.5: 400k context / 272k input / 128k output. Model list changes upstream — enumerate at runtime. |
| No-API-billing enforcement | Yes (conditional) | OAuth path uses dummy API key + subscription tokens; the "Manually enter API Key" auth method is a separate, explicit choice | Rule for our setup: **never authenticate provider `openai` via API key**; no silent PAYG fallback exists in the OAuth path. Keep `OPENAI_API_KEY` unset. |
| Plugin persistence/state | Partial | No dedicated storage API in `PluginInput` (`client`, `project`, `directory`, `worktree`, `$`, `serverUrl`). Plugins persist via own filesystem writes (Node fs / Bun `$`) | Write to project `.tasks/<task-id>/` and a global state dir (e.g. `~/.local/share/opencode/token-efficient/`). Acceptable for design. |
| Native compaction | Yes | Auto compaction on context overflow (`prompt.ts:1161–1168`); `experimental.session.compacting` (customize prompt, `compaction.ts:374`) and `experimental.compaction.autocontinue` (`compaction.ts:501`); config `compaction: { auto, tail_turns }` | In-session hygiene mode can ride on native compaction + hooks. |
| Small-model control | Yes | Config `small_model`; `experimental.provider.small_model` hook (`provider.ts:1953`) | Title/summary/compaction calls can be pinned to GLM. |
| Permission interception | Yes | `permission.ask` hook (`processor.ts:372`); `permission` config; per-agent rules | Human-checkpoint gates implementable (ask/deny/allow overrides). |
| LSP/Git/tool access | Yes | OpenCode native LSP + formatters; `bash` tool for git; plugin-side `Bun.$` shell; SDK `lsp`, `formatter`, `vcs`, `find`, `file` namespaces | Deterministic retrieval (Stage 5) has full access. |
| Event stream | Yes | Every bus event forwarded to plugin `event` hook (`plugin-index.ts:255–262`): `message.updated`, `message.part.updated`, `session.error`, `session.deleted`, etc. | Telemetry foundation (Stage 1) can be passive + lossless. |
| Licensing/distribution | Yes | opencode is MIT-licensed | Plugin distribution unrestricted by harness license. **Provider ToS still must be reviewed by the user** (GLM Coding Plan, ChatGPT/Codex OAuth automation, OpenRouter) — flagged as pending user action, not verifiable from here. |
| OpenRouter integration | Yes | Registry provider `openrouter` (openai-compatible), 371 models incl. `:free` variants; API-key auth | Stage 9 free-agent path viable; source access stays off by default per plan. |

## 2. Design-critical implementation notes

1. **Model routing granularity is the user turn.** The loop resolves `getModel(lastUser.model…)` per step from the persisted user message. The Task Controller should:
   - route at `chat.message` time by rewriting `output.message.model`;
   - escalate by `client.session.promptAsync({ model: premium, parts: [...] })` with a fresh blocker packet (turn boundary), not mid-step.
2. **`experimental.chat.messages.transform` semantics.** Fires once per LLM step; mutate the shared array in place (splice/patch parts); do not reassign. Edits are ephemeral (outgoing request only) — safe for packet assembly without corrupting history.
3. **Premium path is raw, with two quirks.** (a) System prompt travels as a single `instructions` string, not a `system` role message — the packet builder must account for this; (b) `maxOutputTokens` is forced `undefined` on the openai provider by the built-in plugin.
4. **Subscription allowance is not observable.** The Codex plugin does not parse rate-limit headers and `cost` is zeroed on this path. The plan's "premium accounting fallback" (call counts, estimated request/response tokens from the visible payload, byte counts, duration) is therefore **required, not optional** — implement it from Stage 1 and label estimates as estimates.
5. **No-PAYG rule.** Enforce by never adding an OpenAI API key (`opencode auth login openai` → use ChatGPT OAuth only). If both existed, the OAuth path still takes precedence for `auth.type === "oauth"`, but key-only auth would bill PAYG.
6. **Version skew.** Installed opencode is 1.18.31; the dev dependency pin is `@opencode-ai/plugin` 1.18.30 (harmless, types only). `experimental.*` hooks are unstable surfaces — re-run this matrix after any opencode upgrade (upgrade discipline).
7. **Config is load-once.** Plugin/config changes require an opencode restart.

## 3. Open items carried into Stage 1

- Empirically confirm GLM Coding Plan reports `cache.read`/`cache.write` in usage (affects cache-aware context experiments, Stage 5).
- Record actual model IDs exposed after auth on both paths (never hard-code).
- Review GLM/ChatGPT/OpenRouter provider terms for subscription-backed automation and any future redistribution (user action).
- Verify `experimental.chat.messages.transform` stability under the first concrete packet-mode prototype; fall back to in-session hygiene mode if behavior differs.

## 4. Decision

> **Proceed with: Stock OpenCode 1.18.x + global plugin (`~/.config/opencode/plugins/token-efficient/`) + lightweight `opencode.jsonc` configuration.**
>
> Packet mode is viable via `experimental.chat.messages.transform` + `experimental.chat.system.transform`; premium tier is raw model access via ChatGPT subscription OAuth; GLM Coding Plan is a first-class openai-compatible provider. No load-bearing requirement requires a fork.
