# Stage 6 6A — capability check and frozen baseline

**Date:** 2026-09-24.
**Milestone:** 6A of `stage6-plan.md` — installed surface, native continuation behavior,
explicit transfer mechanism, frozen baseline and measurement definitions.
**Method:** static inspection of the installed binary and SDK type definitions, plus a
**live no-model server check** (session create/get/list/fork/message over `opencode serve`
on 127.0.0.1 — zero LLM calls). No model calls were made for this milestone.

**Verified against:** opencode **1.18.32** (`~/.opencode/bin/opencode`, Bun single-file
bundle); `@opencode-ai/plugin` **1.18.30** and `@opencode-ai/sdk` (v1+v2) installed under
`~/.opencode/node_modules/`. The 1.18.32 embedded docs match the 1.18.30 `Hooks`
interface — no drift detected on the plugin surface. Bundle identifiers below are
minified names recovered from binary strings; treat them as evidence, not upstream
source references.

---

## 1. Plugin hook surface (verified)

From `@opencode-ai/plugin/dist/index.d.ts` (`Hooks`, lines 173–322) with dispatch sites
confirmed in the binary (`Plugin.trigger`, generic by string key):

| Hook | Status in 1.18.32 | Stage 6 relevance |
|---|---|---|
| `chat.message` | trigger site verified | turn-boundary association of user intent; routing (Stage 4, in use) |
| `chat.params` | verified | per-request LLM-call telemetry (in use) |
| `tool.execute.before/after` | verified ×7 sites | deterministic evidence collection (in use) |
| `event` (bus) | verified | `session.idle`, `message.updated`, **new: `session.compacted`, `session.next.*`** |
| `experimental.chat.system.transform` | verified ×2 | v3 packet injection (in use); memory/handoff rendering rides here in 6D |
| `experimental.chat.messages.transform` | verified ×2 | canary only today; **mutate-in-place semantics** per stage0 matrix |
| `experimental.session.compacting` | verified | can replace/augment the compaction prompt with task artifacts |
| `experimental.compaction.autocontinue` | verified | suppress the synthetic "continue" turn after compaction |
| `experimental.provider.small_model` | verified | pin compaction/title calls (not used yet) |
| `tool` (custom tools) | verified | `openrelay_raw_output` pattern reusable for a handoff-prepare tool (6D) |
| `permission.ask` | **CAVEAT** — documented in d.ts but no literal `trigger("permission.ask")` site found in the binary; core publishes `permission.asked` bus events instead | Stage 4 checkpoint hook may be riding bus events, not this hook — re-verify before depending on it |

New bus events relevant to Stage 6 (all forwarded to the `event` hook):
`session.compacted`, `session.next.*` (`compaction started/ended`, `step started/ended/
failed`, `context updated`, `model/agent switched`, `prompt.admitted`).

## 2. Session SDK / server API (verified live, no model)

REST routes confirmed by live check against `opencode serve` (v1 SDK
`dist/gen/sdk.gen.*`; v2 `dist/v2/gen/…`):

| Operation | Route | Live result |
|---|---|---|
| Create session | `POST /session` body `{parentID?, title?}` | 200, `ses_…` id, 0 messages, no model call |
| Read session | `GET /session/{id}` | 200 |
| List sessions | `GET /session` | 200 (listing is not strictly project-scoped at creation time) |
| Fork | `POST /session/{id}/fork` | 200, new id, history copied without model call |
| Send prompt | `POST /session/{id}/message` body `{parts[], model?: {providerID, modelID}, agent?, system?, tools?}` | **per-request model + agent selection confirmed by route schema** (not live-fired: requires a model call) |
| Async prompt | `POST /session/{id}/prompt_async` | same body, 204 |
| Summarize | `POST /session/{id}/summarize` body `{providerID, modelID}` | present (not live-fired) |
| Messages | `GET /session/{id}/message[/{messageID}]` | 200, count 0 on fresh session |
| TUI navigation | `POST /tui/select-session` body `{sessionID}` (v2 SDK); CLI `opencode -s <id>`; bus event `tui.session.select` | route verified in binary; "Navigate the TUI to display the specified session" |

SDK helpers: `createOpencodeServer()` spawns `opencode serve`; `createOpencodeClient()`.
The CLI itself talks to the in-process Hono app — plugins get `input.client.*` directly.

## 3. Native continuation and compaction mechanics (verified in code)

**What continuation actually does.** `opencode run -s <id>` (or `-c` = last session)
fetches the session, then `session.prompt()` posts **only the new user message**. The
CLI does not resend history: the **server** rebuilds provider context from the SQLite
store (`~/.local/share/opencode/opencode.db`; tables `session`, `message`, `part`, …)
on every request — `filterCompactedEffect` → `latest` user/assistant →
`toModelMessagesEffect`, with the system array passed through
`experimental.chat.system.transform`. Consequence for Arm A: **transcript transfer cost
reappears as provider input tokens on every step of the continued session** (that is
the baseline being compared against), and its size is observable via telemetry usage —
the final provider-side transformations are not directly observable (recorded as an
accounting limit).

**Compaction.** Auto-compaction fires when (a) a provider stream ends with finish
reason `"compact"`, or (b) post-step token totals reach
`max(0, model.limit.input − reserved)` (reserved = min(20000, maxOutputTokens);
config `compaction.{auto,reserved,preserve_recent_tokens,tail_turns,prune}`).
The kept tail defaults to `min(15000, max(2000, ⌊threshold·0.25⌋))` tokens; compacted
regions become synthetic user messages (`<conversation-checkpoint>` + summary). The
compaction LLM call runs with the built-in summarizer prompt and publishes
`session.compacted` (plus a synthetic continue-turn unless
`experimental.compaction.autocontinue` returns `{enabled:false}`). A second
experimental path (`session.next.*`) exists with `length/4` estimation and an anchored
summary template. An `experimental.session.compacting` hook may replace the prompt —
this is the supported seam if task artifacts should feed native compaction (not used
in Stage 6 pilots).

**Identity/persistence facts bearing on task continuity.** Session IDs are stable
(`ses_…`), persisted in SQLite; sessions survive restarts. `session.parentID` +
`POST /session/{id}/fork` give a supported lineage mechanism. No URL scheme exists;
TUI navigation is `/tui/select-session` / `opencode -s`.

## 4. Explicit transfer mechanism (selected for 6D)

**Fresh-session handoff, visible target, source retained:**

1. Sender side (deterministic, 6C): build the handoff snapshot from task artifacts +
   telemetry; write immutable `<task>/handoffs/<id>.json` + derived `HANDOFF.md`.
2. Receiver side (6D): `POST /session` (new session) →
   `POST /session/{id}/message` with `parts:[{type:"text", text: objective+handoff
   render}]`, explicit `model` + `agent`; source session left untouched and linked in
   the task record; optional `POST /tui/select-session` to show the receiver.

This uses only verified routes. `fork`/`summarize` are **not** used for transfer
(fork copies the transcript we are trying not to send; summarize is a model-authored
lossy path reserved for later authoring experiments). Automated session replacement
(mid-session `session.next` moves) is **out of scope / unvalidated**.

**Fallback (recorded, per plan §6):** malformed/stale artifacts or missing mandatory
fields → do not create a receiver session; keep native continuation
(`opencode -s <source>`) as the usable path. No hook throws into the host.

## 5. Task-identity findings (6B input; confirmed)

`telemetry/session-tracker.ts:30–61` — `ensure()` consults only the in-memory map and
mints a fresh `t-…` task ID on miss; `state.json` (`lib/store.ts:95–113`) is a global
read-modify-write map with no locking (last writer wins, PID-suffixed tmp only);
the `processed` message-ID dedup set is memory-only, so completed-message usage can
double-count after a restart; `bindSession` silently rebinds continuing sessions to a
new task, orphaning the old task file. All confirmed in code, matching the plan's §4
critique. Fix lands in 6B: persisted `workflowID` + `processedMessages` on the task
record, restore-on-ensure from the persisted session→task map, event
`task.restored`.

## 6. Frozen baseline and measurement definitions

| Item | Frozen value |
|---|---|
| Starting release | Stage 5 daily rollout build `2026-09-23T23-14-35Z-99fd7d2a254f` (bundle sha256 `137cb3dc…fa4435d`), v3 context on in daily, `previewSafe` **on** |
| Reference config for comparisons | filtering **on**, route **off**, escalate **off**; daily channel records `previewSafe: true` explicitly |
| Models | enumerated at runtime only (`client.provider.list()` → `resolveModels`); pilot receivers use the configured workhorse; premium direction uses the OAuth subscription path (no API key). Exact IDs recorded per run, never hard-coded |
| Arm A (baseline) | native continuation: `opencode run -s <source-session>`; cost = observed usage of the continued session, incl. any native compaction; do **not** manufacture a verbose transcript |
| Arms | B/A handoff, C/A memory, D/B memory-with-handoff increment, D/A combined (never add percentages) |
| Primary economic measure | total **recorded coding input+cacheRead across the whole workflow** (sender + receiver + verifier), completions joined by workflow ID; title/other unobserved calls stay visibly partial |
| Performance measure | median complete workflow time, pilot gate: no observed increase; confirmation upper bound ≤1.00 (plan §11 — not Stage 5's +15%) |
| Budgets (§7) | notes considered ≤100, selected ≤2, memory ≤2 KiB, handoff ≤6 KiB, total aux ≤12 KiB, hashing ≤32 files/4 MiB, prep p95 ≤100 ms (abandon at 250 ms) — frozen before pilot runs |
| Pilot ceiling | 34 sessions / 3M recorded coding input+cacheRead tokens; no premium sessions; schedule recorded before calls |
| Telemetry join | `workflowID` on every sender/constructor/receiver/verifier event; new events `memory.selected/skipped/invalidated`, `handoff.prepared/consumed/fallback` |

**Accounting limits (inherited):** title-call usage unobservable on this host →
all-call figures partial; provider-side request rewriting not observable → Arm A
history cost measured by usage, not by wire capture. `OPENRELAY_MEMORY` /
`OPENRELAY_HANDOFF` remain undefined (= off) until 6D adds them in
`scripts/relay-runtime.mjs`; unset means off in **every** channel.

## 7. 6A advance condition

> "A supported explicit transfer mechanism exists and the causal comparison is
> specified."

**Met.** Transfer = fresh session + prompt with explicit model/agent over verified
routes (§4); causal comparison = four arms over a common native baseline with
workflow-level accounting (§6). Next: 6B schemas, task identity recovery, and offline
checks — still zero model calls.
