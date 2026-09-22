# Stage 2b Plan — Act-Complete Filtering, Zero Extra Turns

**Hypothesis:** the Stage 2 miss was caused by turn overhead (recovery chain) and
evidence-free compression, not by byte reduction. A filtered view that contains everything
needed to act — extracted from the **full** log via the host's `metadata.outputPath` —
plus PASS-collapse should reduce turns *and* context, clearing the gate with zero
recovery calls.

**Decision (user):** full 2b scope; keep the `openrelay_raw_output` tool as escape hatch.

## Phase 0 — Metadata canary (1–2 tiny GLM runs)

Env-gated debug: unique canaries into `output.title` and `output.metadata` via
`tool.execute.after`; log the outgoing request via `experimental.chat.messages.transform`;
check survival. Settles: (a) title/metadata LLM visibility (future verdict channel),
(b) whether the 30 KB `metadata.output` leak reaches the model → if yes, the filter must
also clear `metadata.output` (Phase 1 fix).

## Phase 1 — Core plugin fixes (all deterministic)

1. **Full-log access** (`filter.ts`): if `metadata.truncated`/`outputPath` present, parse
   and store the real log at `outputPath`; fallback to `output.output` on any fs error.
2. **Failure cards** (`parsers.ts`): TAP YAML block (`---`…`...` after `not ok`) parsed as
   a unit — `expected:`/`actual:`/`operator:`/`code:`, error message, first non-internal
   frame as location; ≤5 cards, ~4 KiB cap.
3. **Compound classification** (`classify.ts`): decompose `&&`/`;` chains; filterable only
   if every part classifies; pipes stay raw.
4. **Hard bail rule** (`filter.ts`): classified + exit ≠ 0 + zero failures extracted →
   return raw unchanged. Never emit evidence-free views.
5. **PASS-collapse** (`filter.ts`): recognized + exit 0 → verdict + counts + pointers
   (~100 B).
6. Preserve host `Full output saved to:` pointer verbatim; honest ref labels.
7. Tests: failure cards, compounds, bail, PASS-collapse, outputPath seam (tmp dirs only);
   suite green; `bunx tsc` clean.

## Phase 2 — Measurement hardening

- `analyze.mjs`: gate aggregation restricted to joined sessionIDs only.
- Update `plugins/token-efficient/README.md` (2b behavior); this doc = pre-registration.

## Phase 3 — A/B validation (pre-registered gate)

Protocol: `s2b-off` vs `s2b-on`, 5 fixtures × 3 runs (GLM).

| Gate | Criterion |
|---|---|
| Quality | 100% verify both groups; 100% telemetry joins |
| **Turns (primary)** | on-arm llmCalls ≤ off-arm on every fixture |
| **Tokens (primary)** | ≥20% reduction in input+cacheRead on fixture 05, outside variance |
| Recovery | on-arm recovery calls ≤1/run (expected 0) |
| Bytes | ≥70% reduction on targeted results |
| Stability | no error/latency regression outside noise floor |

PASS → keep code (still default-off; enabling = separate decision).
INCONCLUSIVE/FAIL → revert filtering changes per spec; keep fixtures/analyzer/docs.
