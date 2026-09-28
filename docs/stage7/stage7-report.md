# Stage 7 closeout — premium escalation timing

**Date:** 2026-09-24. **Decision:** stop the bounded pilot after its first scored
repetition; no release or confirmation.

The fresh three-task matrix passed independent verification in all twelve scored
workflows. E1 and E2 used zero premium tokens because all tasks passed before a
natural escalation threshold was reached. Their median complete times were
74.1s and 75.0s, compared with 35.7s for premium-first. The preregistered
no-slowdown futility condition fired. A controlled mechanics check separately
confirmed that both policies can switch from GLM to the OAuth premium model
within one native session.

The experiment consumed 16 workflows and 1,585,522 recorded coding
input+cacheRead tokens, including 438,519 premium, below its 32-workflow,
3M-total, and 1M-premium ceilings. All 16 runs had distinct sessions, complete
recorded coding usage, unchanged independent verifiers, and matching requested
and observed model IDs. Title usage remains unobserved.

The pilot never exercised a natural GLM failure followed by premium recovery.
It therefore provides no evidence for an automatic escalation threshold. The
small one-run cells also cannot establish a general speed effect or a release
confidence interval. The Stage 4 opt-in controller remains unvalidated for
automatic escalation; the Stage 7 policy exists only in the benchmark runner.

## Finding for the next decision

The GLM-only arm passed all three scored tasks without premium calls. Its
median complete time was 36.5s versus 35.7s for premium-first. This is a
possible **initial-routing** signal, but each arm ran only once per fixture;
the 0.8s median difference is not evidence of speed parity. E1/E2 had no
natural opportunity to improve on GLM-only: all scored tasks passed before a
premium transition. The next premium-efficiency question is which fresh task
classes can start on GLM and finish at equal verified quality and speed.

Stage 8 may now begin with a bounded discovery audit. Stage 5 showed that v3
reduced file-location rounds on fixture 06, while fixture 19's packet omitted
one of two required files; that is a plausible repo-map use case, not yet a
general bottleneck. Measure repeated discovery rounds and missed dependencies
on fresh, larger repositories before building a map. Any map proposal must
compare against deployed filtering plus v3 and preserve the user's
no-slowdown requirement. The Stage 7 pilot does not itself justify a repo map.

Daily OpenRelay keeps filtering and v3 context on, with automatic escalation,
Stage 6 memory, and Stage 6 handoffs off. Premium planning and review were
conditional follow-ups and were not started. Any new escalation experiment
needs fresh tasks that genuinely produce failed GLM attempts and a new frozen
protocol before model calls.

Detailed per-workflow results and methods: `pilot-results.md` and
`pilot-protocol.md`. Frozen schedule and hashes: `pilot-manifest.json`.
