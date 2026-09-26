# Experiment index

OpenRelay tests ways to reduce coding-agent token use and task time while preserving independently verified results. Protocols define each comparison; reports record its outcome and limits.

## Current findings

- Stage 1's runner and telemetry are built; the A/A calibration still needs execution to establish a noise floor.
- [Stage 2b filtering](stage2/stage2b-report.md) passed on the noisy fixture.
- [Stage 3 output discipline](stage3/stage3-report.md) was removed after failed or inconclusive results.
- [Stage 4 task controller](stage4/stage4-report.md) preserved quality with deterministic GLM-first routing; escalation was not exercised and remains unvalidated.
- [Stage 5 context retrieval](stage5/stage5-report.md) remains inconclusive under its original savings gate. A limited daily rollout is documented in [the rollout note](stage5/v3-daily-rollout.md).
- [Stage 6 memory and handoffs](stage6/stage6-report.md) remain off after inconclusive and failed-to-advance results.
- [Stage 7 escalation](stage7/stage7-report.md) stopped after the first scored repetition on the no-slowdown futility rule.
- [Stage 8 repository maps](stage8/map-prototype-report.md) were not integrated after the observed live map comparison used more tokens and time.

## Reports by stage

- [Stage 0 capability matrix](stage0-capability-matrix.md) and [architecture](token-efficient-architecture.md)
- [Stage 2 filtering](stage2/README.md)
- [Stage 3 discipline](stage3/README.md)
- [Stage 4 task controller](stage4/README.md)
- [Stage 5 context engine](stage5/stage5-plan.md) · [next steps](stage5/next-steps.md)
- [Stage 6 memory and handoffs](stage6/stage6-plan.md)
- [Stage 7 model routing](stage7/stage7-plan.md)
- [Stage 8 repository discovery](stage8/stage8-plan.md)
- [Pi experiment plan](pi-testing-plan.md) · [results](pi-testing-results.md)

The legacy `docs/project-trials.md` file is a wipe placeholder. Use the stage reports linked above as the experiment record.
