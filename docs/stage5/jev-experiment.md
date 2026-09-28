# Jev experiment — model-assisted context selection

**Status:** proposed; no Jev calls or Jev A/B runs. The v3 workhorse baseline and
audit are complete, but the enabled-class savings gate remains unmet (15.2% of
recorded coding usage), with incomplete title-token accounting. Jev remains gated;
see `v3-audit-results.md` for the current recommendation.

## Question

Does Jev improve the decision to build a context packet enough to offset its request cost and latency, while preserving verified coding quality? The comparison is against frozen v3, on the same tasks and with the same candidate evidence. A valid structured answer is not proof that the decision saves tokens.

TypeSafe describes Jev as a model for typed decisions over supplied state. Its Choice response includes an option, probabilities and confidence. The published latency and price are vendor claims, not measured OpenRelay costs. API shape and model version must be checked again before implementation: [Jev announcement](https://typesafe.ai/blog/introducing-system-one-models-and-jev), [Choice documentation](https://docs.typesafe.ai/primitives/choice), [API quick start](https://docs.typesafe.ai/introduction/quickstart).

## Decision boundary

Use the request plus the existing deterministic probe's compact output: named source paths, candidate paths, match counts/patterns, probe status, and a bounded list of source-file names. Do not send file contents, secrets, full diffs or entire repositories to the external service. Keep the probe's path and symlink protections. Pin a Jev model version for experiments rather than `jev-latest`; record the version returned in each response.

Ask one Choice question with `build`, `skip`, and `insufficient_evidence` options. `build` means that the available candidates are likely to spare the coding model meaningful file-location work; `skip` means the packet would mostly repeat obvious or necessary exploration; `insufficient_evidence` means the probe cannot support either conclusion. Thresholds, confidence handling and any override of v3 must be frozen before live runs. An API failure, timeout or malformed response falls back to v3 and is recorded. Do not infer calibrated correctness from the confidence value without checking it on this task distribution.

The current v3 probe returns no candidates for 14–18 and 20. If Jev chooses `build` there, the packet still has no source excerpts. Record those cases as **retrieval gaps**. A separate broader-retrieval arm is needed to test whether Jev can usefully trigger a different search; do not credit the selector for evidence it did not produce.

## Protocol

1. **Frozen baseline (executed; gate unmet):** the focused v3 A/B in `next-steps.md` covered repeated comparisons on 06–09, a few skip controls, and pilots on 19 and 21. The remaining extension fixtures have zero-token selector and verifier checks; model pairs are not required merely because the fixtures exist. Save task text, probe output, v3 decision, packet contents or empty-packet status, model outcome and run cost. Separate development examples from held-out fixtures; avoid editing tasks or thresholds after reading held-out outcomes.
2. **Shadow Jev:** send bounded, redacted states for the frozen examples. Log its decision, per-option probabilities, confidence, version, input tokens, request wall time and any errors. It does not affect the coding run. Examine disagreements by task, especially false skips on tasks with useful packets and false builds on trivial tasks. Compare to observed paired task economics, not a human label such as “UI.”
3. **Live Jev arm:** only if shadow results show a useful disagreement where evidence exists, compare native, frozen v3 and Jev-selected context on repeated, interleaved workhorse runs. Keep packet assembly, workhorse, filtering, routing and escalation fixed. Include fresh tasks not used to tune prompts or thresholds. Use the same independent `verify.js` quality gate and A/A noise estimate.
4. **Accounting and verdict:** report total workhorse `input+cacheRead`, Jev input tokens and billed cost, selector request count, packet prep time, end-to-end latency, rounds, retries and verify pass rate. Report provider spend separately from workhorse token counts; neither should disappear into a percent. Jev is useful only if its incremental savings over v3 exceed run-to-run noise and selector costs, with no quality regression. Otherwise keep v3 and mark Jev INCONCLUSIVE or FAIL.

The API requires a separate TypeSafe credential; OpenRelay's ChatGPT OAuth premium tier is unrelated. No TypeSafe key is needed to run fixture validation or the v3 baseline. Keep the credential out of benchmark workspaces and telemetry. Do not enable network calls in the default plugin path during this experiment.
