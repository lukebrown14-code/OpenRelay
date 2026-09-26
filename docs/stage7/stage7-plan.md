# Stage 7 — premium escalation and review policy

**Status:** bounded pilot stopped after its first main repetition under the
preregistered futility rule; no release candidate. See `pilot-results.md`.
**Date:** 2026-09-24.

## Decision and limits

Test whether GLM-first work followed by a premium turn after one or two failed
verified attempts improves useful completed work per premium token. Preserve
independent verification quality and require no complete-task slowdown versus a
premium-first baseline. The pilot is limited to 32 workflows, 3 million recorded
coding input+cacheRead tokens, and 1 million premium coding input+cacheRead tokens.
Only the existing ChatGPT OAuth subscription may supply premium models. No API key
or PAYG fallback. Stage 5 filtering and v3 context are on; Stage 6 memory and
handoffs are off. The daily release does not change during this experiment.

## Mechanics and accounting

Four policies: G stays on GLM; P stays on premium; E1 switches after one failed
attempt; E2 switches after two. One attempt is a bounded agent turn followed by
an independent verifier. Multiple failing commands within a turn count once.
An unknown verifier result or infrastructure error cannot trigger escalation.
Use one native session per workflow and keep the chosen premium model after a
transition. At most three turns and eight model steps per turn. Workflows time out
after ten minutes. An independent pass ends the workflow immediately.

Persist workflow, policy, attempt, model, source digest, verifier result, and
escalation state. On restart, reconcile ambiguous submitted prompts against the
session before retrying. Explicit user model overrides take precedence in normal
use. The benchmark harness controls model choices explicitly and keeps plugin
routing/escalation off to isolate the four policies. It measures complete wall
time, including all turns and independent verifiers, and separately sums premium
and workhorse usage. Missing coding usage invalidates that run; title usage is
reported as partial. All runs, including errors and smokes, count toward the
append-only budget ledger. Stop new calls at a ceiling and report in-flight
overshoot explicitly.

## Pilot

Create three fresh, independently verified fixtures: a routine task, a multi-file
diagnosis, and a constraint-heavy compatibility task. The reference solution must
pass and the pristine source must fail. Freeze fixture hashes, models, agent limit,
build, schedule, and analysis before economic calls.

Run four mechanics workflows (direct GLM, direct premium, forced E1, forced E2),
then three fixtures × four arms × two repetitions (24), then two extra G and P
controls on the two harder fixtures (4): 32 maximum. Run sequentially in a
recorded randomized, interleaved order. A controlled mechanics failure does not
count toward the economic comparison. Pause on wrong-model execution, duplicate
escalation, quality failure attributable to the policy, verifier tampering,
missing usage, session contamination, rate limiting, or budget exhaustion.
After one complete main repetition, stop for futility if neither E policy lowers
premium usage while preserving median complete-task time versus P.

Compare E1/P and E2/P for savings and time, E1/G and E2/G for recovery, and E1/E2
for threshold choice. Report verified success, failed attempts, premium and GLM
coding tokens separately, total duration, retries, model rounds, A/A controls,
invalid runs, and accounting completeness. Keep title and other unobserved calls
visibly excluded. A positive pilot is a screening signal. Release confirmation
requires fresh tasks and a separately preregistered budget, with paired 95%
interval lower bound above zero for premium savings and upper bound at most 1.00
for complete-task time ratio.

## Later Stage 7 questions and rollout

Investigate context expansion before escalation only if traces show missing source
evidence caused failed attempts. Test premium planning and risk-triggered premium
review separately, charging construction, transfer, review, false alarms, and rework.
Jev routing and automatic safety checkpoints are outside Stage 7. An intervention
that cannot meet quality, accounting, and time gates remains off. A passing
confirmed policy becomes an opt-in release candidate; daily activation requires
a separate release decision and a documented disable switch.
