# Stage 7 pilot result — premium escalation timing

**Date:** 2026-09-24. **Verdict:** FAIL to advance under the no-slowdown gate.
The pilot stopped after the first complete main repetition, as required by
`pilot-protocol.md`. No second repetition, A/A controls, confirmation, premium
planning, or premium review experiment was run.

## What ran

Four mechanics workflows and twelve scored workflows completed. All 16 had
distinct session IDs, complete recorded coding usage, and a passing final
independent verifier. The verifier copies in every run match the frozen fixture
copies. Telemetry model IDs match the requested per-attempt models in all 16
sessions. Mechanics E1 and E2 each made one GLM-to-premium transition within a
single session; their deliberately forced failures are excluded below.

| Fixture | Policy | Final pass | Attempts | Premium coding tokens | Total coding tokens | Complete seconds |
|---|---|---:|---:|---:|---:|---:|
| 27 duration format | G | PASS | 1 | 0 | 46,181 | 32.3 |
| 27 duration format | P | PASS | 1 | 51,817 | 51,817 | 35.7 |
| 27 duration format | E1 | PASS | 1 | 0 | 46,153 | 31.0 |
| 27 duration format | E2 | PASS | 2 | 0 | 110,427 | 65.5 |
| 28 ledger diagnosis | G | PASS | 1 | 0 | 61,347 | 36.5 |
| 28 ledger diagnosis | P | PASS | 1 | 65,245 | 65,245 | 35.4 |
| 28 ledger diagnosis | E1 | PASS | 1 | 0 | 106,149 | 102.3 |
| 28 ledger diagnosis | E2 | PASS | 1 | 0 | 133,714 | 156.7 |
| 29 config compatibility | G | PASS | 1 | 0 | 71,554 | 73.0 |
| 29 config compatibility | P | PASS | 1 | 90,619 | 90,619 | 51.2 |
| 29 config compatibility | E1 | PASS | 1 | 0 | 96,480 | 74.1 |
| 29 config compatibility | E2 | PASS | 1 | 0 | 87,541 | 75.0 |

G, P, E1, and E2 each have one scored run per fixture. The median complete
workflow times are **36.5s, 35.7s, 74.1s, and 75.0s**, respectively. E1 and E2
used no premium tokens because all scored tasks passed before their thresholds
required a switch. E1 and E2 nevertheless had higher median complete time than
P, so neither met the no-slowdown condition. On the diagnosis task E1 took
102.3s versus P's 35.4s; E2 took 156.7s. One-run cells are descriptive and
cannot estimate a general latency distribution.

## Stop and accounting

The pre-registered futility rule said to stop after the first complete main
repetition if neither E policy lowered premium usage without a median
complete-time increase versus P. Both policies lowered premium usage to zero,
but both increased median time. The stop fired. Remaining scheduled runs were
not started, and the unused budget was not treated as a reason to continue.

All 16 workflows, including mechanics, consumed **1,585,522 recorded coding
input+cacheRead tokens**, of which **438,519** were premium; both are below the
3M/1M ceilings. The twelve scored workflows consumed 967,227 coding tokens,
of which P used 207,681 premium tokens. These figures exclude unobserved title
usage and are not all-call or price-weighted spend. Complete seconds include
the final independent verifier, but do not include experiment setup between
workflows.

## Interpretation and limits

- Scored tasks did **not** exercise natural escalation. The live transition
  works in the controlled mechanics workflows, but the pilot cannot show that
  E1 or E2 recovers a real GLM failure.
- On these fresh fixtures, GLM-only G passed 3/3 without premium and had a
  36.5s median, close to P's 35.7s. The observed E1/E2 latency differences
  reflect run variability and E2's extra routine-task attempt as well as model
  choice. They do not establish a stable causal slowdown size.
- Quality was 12/12 PASS in scored runs. This supports the tested tasks only;
  it does not establish quality parity for hard tasks or production use.
- No paired confirmation interval or broad premium-efficiency claim is
  possible with one scored run per fixture/policy. A/A controls were never run
  because the early stop fired.

**Decision:** keep automatic escalation off in daily. Retain the isolated
runner, frozen fixtures, and opt-in controller code as experimental
infrastructure. Any future escalation study needs fresh tasks that genuinely
produce unsuccessful GLM attempts, plus a new preregistered budget and stop
rule. The GLM-only arm's 3/3 passes and 36.5s median against premium-first's
35.7s median suggest testing initial model selection on fresh repeated tasks;
one run per fixture cannot establish speed parity. Premium planning and review
remain separate unstarted Stage 7 questions. See `stage7-report.md` for the
Stage 8 handoff and its evidence gate.
