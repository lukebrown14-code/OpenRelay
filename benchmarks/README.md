# Benchmark lab

The benchmark system compares harness variants on disposable task workspaces. Each fixture has an independent verifier; a passing verifier is the quality gate. Token usage and complete task time are reported separately. Read the stage protocol before running an experimental arm, and use fresh labels for new measurements.

## Shared workflow

```sh
# Typecheck and unit tests for the plugin
bunx tsc -p plugins/token-efficient/tsconfig.json
cd plugins/token-efficient && bun test ./test

# Validate fixture baselines and reference implementations without model calls
node benchmarks/stages/stage5/validate-stage5.mjs
node benchmarks/stages/stage6/validate-stage6.mjs

# Run and compare common fixture benchmarks
node benchmarks/run.mjs --fixture all --runs 3 \
  --model <provider/model> --label <label>
node benchmarks/analyze.mjs <labelA> [labelB]
```

`run.mjs` creates fresh workspaces and records output, verifier result, timing, and usage. `analyze.mjs` joins telemetry by session ID. Use `--dry-run` to check harness mechanics without model calls. Model runs require an authenticated OpenCode provider and consume model usage.

## Experiment organization

- `fixtures/` and `solutions/` hold the numbered task corpus and reference solutions. Solutions stay outside model workspaces.
- `stages/stage5/` contains context retrieval and measurement tools; `stages/stage6/` contains memory and handoff tools; `stages/stage7/` contains routing and escalation tools; `stages/stage8/` contains repository discovery and map experiments, including their task corpus and map prototype.
- `pi/` is a separate harness integration experiment.
- `lib/` contains shared benchmark utilities; `results/` contains benchmark records and generated snapshots.
- The [experiment index](../docs/README.md) is the report and protocol index.

Use `benchmarks/stages/<stage>/` for stage-specific tools. The shared runner and analyzer stay at the `benchmarks/` root.

## Stage 5 context capture

`run.mjs --capture-context` saves the exact context packet added by the system hook for synthetic benchmark runs. It records captured, skipped, unavailable, context-off, or disabled status after digest and size checks. See [measurement coverage](../docs/stage5/measurement-coverage.md).

## Safe benchmark use

The runner uses headless permission approval only inside disposable cloned workspaces. Never point an experimental runner at a working project. Every optimization needs independent verification and an explicit evidence verdict: PASS, FAIL, or INCONCLUSIVE. An inconclusive result does not justify added runtime complexity.
