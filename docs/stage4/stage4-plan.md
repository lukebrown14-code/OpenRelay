# Stage 4 Plan — Task Controller v1

**Status:** PLANNED (pre-registration; edit this doc only to record results, in a
separate `stage4-report.md`).

**Parent:** `../token-efficient-architecture.md` (Stage 4). Hook surface: Stage 0
capability matrix (`~/.config/opencode/stage0-capability-matrix.md`), items 21, 27–29,
33, 36, 44–49.

**Hypothesis:** Deterministic GLM-first routing + turn-boundary escalation to ChatGPT
Premium preserves task success while concentrating scarce premium tokens on only the
tasks that need stronger reasoning. No LLM router.

## Step 0 — Authenticate the premium tier (prerequisite, unblocks economics)

1. `opencode auth login` → ChatGPT OAuth (never an OpenAI API key — no-PAYG rule, matrix
   #32/#50).
2. Enumerate exposed models at runtime (`client.provider.*`) and record the actual
   premium (openai-tier) and workhorse (glm-tier) model identifiers. Never hard-code
   them (matrix #30–31, #50).
3. The installed SDK confirms that `chat.message` rewrites
   `output.message.model` as `{ providerID, modelID }`; run a one-turn smoke to verify
   the live OpenCode version applies that object as expected.
4. Confirm which premium token fields survive the Codex path: `message.updated` may carry
   `tokens` but `cost` is zeroed (matrix #25/#49). Decide the premium accounting proxy
   now: prefer `tokens` if present, else request/response byte counts + call counts,
   labeled as estimates.

## Implementation

1. **`lib/controller/models.ts`** — runtime model resolution: enumerate `client.provider`
   models, map each to `tier()` (`lib/classify.ts`), and resolve models from connected
   providers rather than registry order. Resolve one eligible openai-tier model as
   `premium` and one glm-tier model as `workhorse`; record the provider/model pair and
   selection reason for reproducibility. Optional config overrides
   `controller.premiumModel` / `controller.workhorseModel` (user-supplied) must be
   validated against the enumerated models. Do not add hard-coded defaults.

2. **`lib/controller/route.ts`** — deterministic decision. Inputs: incoming message text,
   session task state (`attempts`, unsuccessful edit/test cycles, `verifications[]`,
   `outcome`), and an explicit override. Priority: explicit override > an active
   escalation handoff > default routing. An escalation turn must never be routed back to
   GLM by the normal default rule.
   - Overrides (win): `/glm` → workhorse; `/chatgpt` `/plan` `/review` `/deep` → premium;
     `/auto` → clear override.
   - Default: trivial/routine → workhorse. Explicit `/plan` `/review` `/deep` markers
     route to premium; general security checkpoint classification is deferred from v1.
   - Emit `controller.routed` (`{ decision, model, tier, reason, signals }`).

3. **Model rewrite** — in the existing `chat.message` hook, mutate `output.message.model`
   to the resolved model ID before persistence (matrix #21: turn granularity; the loop
   re-reads `lastUser.model` every step).

4. **`lib/controller/escalate.ts`** — turn-boundary escalation. On `session.idle` after
   failed verification accumulation, if the task has ≥N unsuccessful edit/test cycles,
   and has not already escalated or has an escalation pending, inject a fresh premium
   turn via `client.session.promptAsync({ model: premium, parts: [blocker] })` (matrix
   #27). `N` configurable, default 3 (arch §5.3: benchmark 2–3, do not assume).
   Count only cycles where an edit is followed by a failed recognized verification;
   successful checks do not add pressure. Recognize the benchmark verifier commands,
   including `node verify.js`. Persist minimal controller state (`override`, objective,
   unsuccessful cycles, `escalationPending`, `escalated`) in task state, clear the
   per-task override at a new user task, and make the escalation operation idempotent
   across repeated idle events.
   - Blocker packet v1 is a short deterministic summary from task state (objective,
     changed files, last verification verdict + failures), not a full Stage 6 handoff.
   - Emit `controller.escalated` (`{ cycles, N, model }`).

5. **Checkpoint gate** — defer implementation from v1. The `permission.ask` hook is
   available, but migrations, auth changes, secrets, and destructive operations need a
   separate checkpoint policy and benchmark before they are added to the controller.

6. **Commands** — `command/{auto,glm,chatgpt,plan,review,deep}.md` frontmatter. `/glm`
   `/chatgpt` pin the model; `/auto` clears; `/plan` `/review` `/deep` set premium + a
   routing flag consumed by `route.ts`. (Matrix #28: global commands supported.)

7. **Telemetry** — `controller.routed` / `controller.escalated` events (reuse
   `store.event`). Record resolved model IDs, route reason/signals, override, escalation
   cycles, and whether the turn was injected. Add the minimal controller state above to
   task telemetry; Stage 1's existing `verifications`, `attempts`, and `byModel` fields
   remain the source data.

8. **`benchmarks/run.mjs`** — add `--route auto|premium|glm` → env passthrough
   (`OPENRELAY_ROUTE`) + recorded in `run.json`. The runner must wait for the complete
   `opencode run`, including any injected escalation turn, before verification and must
   record the resolved route and model IDs. **`benchmarks/analyze.mjs`** — add per-session
   premiumCalls, premiumProxyTokensIn, premiumProxyTokensOut, workhorseCalls,
   escalations, unsuccessfulCycles, and a `stage4Gate()` summary (mirroring
   `stage2Gate`). Missing usage fields remain missing; they must not be treated as zero.

## Experiment

A/B, 5 fixtures × 3 runs per arm = **30 runs**, followed by a separate escalation
mechanism check.

- **Arm A (`premium-first`):** force `OPENRELAY_ROUTE=premium` — premium model does all
  work. Baseline scarce-premium-token cost.
- **Arm B (`glm-first`):** default deterministic routing + escalation.

Measure: premium call count, premium proxy tokens, success, unsuccessful edit/test cycles,
latency. Premium proxy tokens include reported input/cache/output/reasoning fields when
available; otherwise report call count and byte/token estimates separately. Filtering
stays **off** in both arms (isolate routing; filtering is a separate lever).

The escalation check must compare a GLM-only/no-escalation control with GLM-first plus
escalation on a controlled difficult task that produces at least N failed verification
cycles before a recoverable solution. This isolates whether escalation fires and
recovers; fixture 04 alone is insufficient because Stage 3 showed that GLM can already
solve it without escalation.

## PASS gate (pre-registered)

- **Quality:** 100% verify PASS and 100% telemetry joins, both arms.
- **Efficiency:** Arm B premium calls and proxy tokens meaningfully below Arm A, outside
  variance (target: ≥50% fewer premium calls). Compare per fixture as well as pooled
  results; report repeat-run CoV and treat pooled differences caused by fixture mix as
  insufficient evidence.
- **Escalation mechanism:** in the separate controlled check, escalation fires at N
  unsuccessful cycles, injects exactly one premium turn, and the task verifies afterward.
- **Routing correctness:** smoke — `/glm` → workhorse model, `/chatgpt` → premium model,
  `/auto` → default.
- **No rework regression:** Arm B unsuccessful edit/test cycles are not systematically
  worse than Arm A. Successful verification cycles are not counted as rework.
- **INCONCLUSIVE** (savings inside noise) → keep routing off, remove unvalidated
  complexity. Escalation and overrides are separate sub-decisions; each must justify
  itself.

## Risks

- **Premium cost/time:** 15 premium runs are slow and consume ChatGPT allowance; may need
  to drop to n=2 or split the corpus if quota throttles (Stage 3 hit a 429 wall).
- **Turn granularity:** mid-loop model switch is unsupported (matrix #21); escalation only
  via `promptAsync` at a turn boundary — verify it starts a fresh agent turn with the
  premium model.
- **Live model rewrite:** the SDK shape is known, but the installed OpenCode version must
  still be smoke-tested before relying on `chat.message` mutation.
- **Noise floor:** the pending Stage 1 A/A-calibration issue (wide CoV, n=3) applies here
  too; report per-arm CoV and treat borderline savings as INCONCLUSIVE.
- **Premium proxy accounting** is estimated (cost zeroed) — label estimates, never mix
  with provider-reported tokens (matrix #49).

## Non-goals (v1)

No LLM-based routing/classification. No expand-context-before-escalate (Stage 5/7). No
structured handoff format (Stage 6). No checkpoint or security keyword classifier in v1.
No auto-continue loop reimplementation.

## Optional Jev Routing Experiment (Stage 4+, not a v1 dependency)

Deferred LLM-assisted routing (arch §5.2 "do not call an LLM to choose an LLM in v1";
Stage 10 "smarter model-assisted routing — default do not build"). Runs only on telemetry
evidence that v1 deterministic routing leaves headroom (needless premium calls / GLM
failures), or explicit opt-in.

**Trigger:** `route.ts` emits an `uncertain` decision (mixed signals or heuristic below
threshold). Only uncertain tasks reach Jev.

```text
task → deterministic rules
 ├─ confident → route directly
 └─ uncertain → Jev (advisory) → GLM / ChatGPT / checkpoint
```

Jev scores complexity, ambiguity, risk, routing confidence. Its output is **advisory**:
deterministic guardrails cap it (never downgrade `/deep`/security-sensitive; never emit a
checkpoint). Trust model (arch §4.3): free/untrusted-model output must not become
controller authority — advisory-only is the boundary.

**Benchmark:** `A` deterministic only vs `B` deterministic + Jev on uncertain cases.
Measure: task success, GLM failures before escalation, unnecessary premium calls, total
tokens, latency, Jev cost, disagreement rate (reported diagnostic, not a gate — neither
router is ground truth).

**Gate (pre-registered):** keep Jev only if `B` measurably improves routing efficiency
(fewer premium calls / GLM failures) at quality parity, outside the A/A noise floor.
INCONCLUSIVE → remove. Never a dependency of Task Controller v1.

**Open items:** Jev integration mechanism unverified (OpenCode provider vs CLI) — confirm
with a Step 0-style check before running.

## Execution checklist

1. Step 0 auth + enumeration + model-format smoke (blocker).
2. `lib/controller/*` + `chat.message` rewrite + commands; `bunx tsc` + `bun test` green.
3. `run.mjs --route` + `analyze.mjs` stage4 gate; dry-run smoke.
4. Live smoke: `/glm` and `/chatgpt` route to the expected models; escalation fires on a
   failing task and recovers.
5. Run the 30-run routing benchmark plus the controlled escalation check; analyze; write
   `stage4-report.md`; update `README.md` + `AGENTS.md`
   status.
