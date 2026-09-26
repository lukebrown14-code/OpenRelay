# Fixture 21 confirmation protocol — preregistered 2026-09-23

This protocol was written before the first confirmation model call. The earlier
one-pair pilot is excluded from all confirmation calculations. This is a scoped
test of the frozen v3 context packet on `21-dependency-upgrade`, not a Stage 5
corpus or rollout decision.

## Frozen inputs

- Fixture: `benchmarks/fixtures/21-dependency-upgrade`; SHA-256 over sorted
  relative file names followed by file bytes:
  `03170bb8b03bde495ecd0e1e0e6ed2a2c401af85b744ad3b758fdc49a90d6a32`.
- Plugin/lockfile source hash via `sourceHash(repo)`: build ID
  `dev-b0daed6452e3`. Do not edit plugin code, fixture, lockfiles, or arm
  settings during this experiment.
- Toolchain: Node `v22.22.0`, Bun `1.3.8`, OpenCode `1.18.32`, ripgrep
  `15.2.0`.
- Model `zai-coding-plan/glm-5.3`, agent `build`; filtering on, routing off,
  escalation off, context off for A and AA, context on for B. The runner uses a
  fresh fixture workspace for every run, 300-second model timeout, and the
  fixture's 30-second independent-verifier timeout. No premium calls.
- Commands use `node benchmarks/run.mjs --fixture 21-dependency-upgrade
  --runs 1 --model zai-coding-plan/glm-5.3 --label <label> --agent build
  --filtering on --route off --escalate off --context <off|on> --append
  --capture-context`. Labels are `stage5-21-confirm-a`,
  `stage5-21-confirm-b`, and `stage5-21-confirm-aa`.

## Order and stop rules

Five fresh pairs run in order **AB, BA, AB, BA, AB**. Insert one independent
context-off AA control after pair 1 and another after pair 5. This gives five
A, five B, and two AA runs. Match pairs by each arm's run number, not wall-time
adjacency.

After pair 1, check both runs' session telemetry, usage, task timing, independent
verification, and exact arm settings. A must record `packetCapture.status` as
`context-off`; B must capture a hash-verified packet containing
`src/profileAdapter.js`. Stop and retain artifacts if mechanics fail. For later
runs, stop on timeout, nonzero OpenCode exit, missing telemetry, incomplete
coding usage, invalid packet capture, changed inputs/settings, or missing timing.
Do not silently replace a run. A normal B verification failure is a quality
FAIL; an A verification failure makes the comparison INCONCLUSIVE.

## Analysis and verdict

The primary measure is **recorded coding-completion input + cacheRead tokens**.
Installed OpenCode does not expose all title-call usage, so total all-call
input cannot be claimed. Savings are `100 × (1 − sum(B tokens) / sum(A tokens))`.
Pair bootstrap resamples five pair indices with replacement (all `5^5 = 3125`
ordered samples), calculates ratio-of-sums savings for each, and uses the
nearest-rank 2.5th percentile as its lower bound. A/A drift is the larger
absolute percentage difference of each AA token count from the five-run A
mean.

A scoped coding-token PASS requires all of: savings ≥25%; bootstrap lower
bound >0%; savings greater than maximum A/A drift; independent verify PASS in
all ten A/B runs; mean B failed verification cycles no more than 0.25/task
above A; and mean B model rounds no more than 10% above A. A B verification
failure is FAIL. An intact comparison that misses a savings/rework/round gate
is INCONCLUSIVE; add no selector complexity. Invalid mechanics or A failures
are INCONCLUSIVE. Report pair results, A/A controls, quality, retries, rounds,
captured packet evidence, coding usage coverage, and task duration including
independent verification. A B task duration more than 15% above A is flagged
for user judgment and blocks rollout even if the token gate passes. Keep context
off by default and Jev gated regardless of this scoped outcome.

## Infrastructure abort and separately labeled restart

The first `stage5-21-confirm-a/run-01` invocation exited before session creation:
the sandbox denied writes to `~/.local/share/opencode/log/opencode.log` and the
Relay benchmark telemetry directory. It has no model completion or valid usage.
The run and stderr remain in place and are excluded from all estimates. Per the
stop rule, the initial `stage5-21-confirm-*` series is **invalid and stopped**.

Before any restarted model call, the same frozen fixture, plugin, metric, order,
gates, and timeouts are preregistered for new labels
`stage5-21-confirm-r2-a`, `stage5-21-confirm-r2-b`, and
`stage5-21-confirm-r2-aa`. The only execution change is running the benchmark
process with filesystem access to OpenCode's existing log/auth directories and
Relay's telemetry directory. The first restarted A/B pair must pass the same
mechanics check; another infrastructure failure stops the r2 series.
