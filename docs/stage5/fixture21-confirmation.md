# Fixture 21 confirmation result — 2026-09-23

**Verdict: INCONCLUSIVE for the preregistered ≥25% coding-token gate.** The
frozen v3 packet saved **22.6%** of recorded coding-completion input plus
cacheRead tokens over five fresh interleaved A/B pairs (423,181 → 327,439;
95,742 fewer). The exact paired-bootstrap 2.5th percentile is **18.2%**, above
zero, and the largest A/A drift is **3.7%**. Savings are repeatable in this
fixture but below the numerical target. The earlier one-pair 44.3% pilot was
excluded. This does not change the whole-corpus Stage 5 verdict or justify a
rollout or selector change.

The [preregistered protocol](fixture21-protocol.md) fixed the model, fixture,
plugin build, interleaving, stop rules, and gates before model calls. The
[machine-readable analysis](fixture21-confirmation-data.json) contains every
run's session ID, token count, timing, packet status, and gate output. Results
are under `benchmarks/results/stage5-21-confirm-r2-{a,b,aa}/`.

## Results

| Pair | A coding tokens | B coding tokens | Saving | A task seconds | B task seconds |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 74,056 | 62,292 | 15.9% | 42.927 | 42.138 |
| 2 | 87,365 | 61,961 | 29.1% | 38.902 | 36.338 |
| 3 | 87,578 | 64,881 | 25.9% | 38.117 | 42.651 |
| 4 | 98,699 | 75,958 | 23.0% | 35.909 | 52.967 |
| 5 | 75,483 | 62,347 | 17.4% | 32.772 | 26.338 |

The two independent context-off controls used 87,786 and 84,885 coding tokens,
respectively, versus an A mean of 84,636.2. The five B packets were identical
1,148-byte captures (SHA-256
`7d46860a920aaba0fc5b3dc0706f988afb538b88cf68b75f4a9b3edff0e8b640`)
and each contained `src/profileAdapter.js`. Packet preparation took 26–33 ms.
All 12 independent verifiers passed; there were zero failed verification cycles,
zero premium calls, and zero escalations. B averaged 5.2 model rounds versus
A's 6.8 (−23.5%). Full task duration, including the independent verifier,
averaged 40.086 seconds for B versus 37.725 seconds for A (+6.3%), below the
preregistered +15% latency flag. Pair 4's B run was unusually slow, so the
duration estimate should be read as a five-pair observation, not a general
latency guarantee.

The primary token measure has complete **coding-completion** coverage in all
12 runs. Whole-call usage remains partial because the installed OpenCode host
does not expose title-call tokens. No all-call saving or paid cost is inferred.
The recorded model session durations exclude independent verification; the
task-duration figures above include it.

## Mechanics and interpretation

The original `stage5-21-confirm-a/run-01` attempt exited before session
creation when the sandbox denied writes to OpenCode's log and Relay telemetry
directories. Its artifacts are retained, and the original series was stopped
as invalid. The separately preregistered `r2` series used the same frozen
inputs and arm settings with the required filesystem access. Its first A/B
pair passed the mechanics check before the remaining runs proceeded. Source
hash stayed `dev-b0daed6452e3`; fixture hash stayed
`03170bb8b03bde495ecd0e1e0e6ed2a2c401af85b744ad3b758fdc49a90d6a32`.

The packet appears useful for this task: all five pair savings were positive,
the bootstrap lower bound exceeded zero, and verification quality held. The
strict 25% gate failed, so keep context **off by default**, leave Jev gated,
and add no selector complexity. A next experiment should target a broader
task class or a clearer packet-value hypothesis with its own preregistered
gate; this fixture alone cannot establish a Stage 5 rollout benefit.
