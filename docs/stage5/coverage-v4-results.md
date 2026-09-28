# Stage 5 v4 context experiment — offline gate

Date: 2026-09-24. Decision: **FAIL; stop before plugin integration and live pilot**.

The agreed plan made offline coverage, abstention, size, and safety prerequisites for any workhorse run. The v4 prototype is confined to `benchmarks/stages/stage5/coverage-v4.mjs`; the production context engine still uses v3 when enabled and remains off by default. No fixtures 22–24 or model runs were created.

## Protocol

- Source: existing frozen 102-file archive, SHA-256 `f6456eac3bb5ae4c0ab30bc838ce2f0dceafbcd7d39e3155e9b1b55e9cca6b99`; every extracted source file was checked against its manifest.
- The 10 positive symptom requests and 10 negative controls in `benchmarks/stages/stage5/coverage-v4-validation.json` were written before the first validation invocation. Earlier coverage task lists were used only for development checks. Each positive specifies a required file and an exact source-line anchor. The negative evaluation applies v3's actual Git and probe decisions first; v4 is considered only after a `redundant-candidates` skip.
- Candidate retrieval starts from v2's lexical/relationship ranker and reranks by TypeScript syntax blocks, symbol names, and query overlap. It then emits either a ≤1,024-byte navigation map or a ≤4,096-byte contiguous evidence excerpt. Each carries file, line range, and source digest. Byte counts include all headers and delimiters.
- Advancement required top-4 ≥8/10, top-2 ≥7/10, relevant block or pointer ≥8/10, built qualifying packet ≥8/10, unnecessary v4 packet ≤1/10 negative controls, median preparation <250 ms, and all size/safety checks. The 25% coding-token saving gate remains for a later live pilot only if offline gates pass.

## Results

| Measure | Lexical v2 | v4 navigation | v4 evidence | Gate |
| --- | ---: | ---: | ---: | ---: |
| Correct file, top 2 | 8/10 | 10/10 | 10/10 | ≥7/10 |
| Correct file, top 4 | 10/10 | 10/10 | 10/10 | ≥8/10 |
| Required line in emitted block or excerpt | — | **5/10** | **5/10** | ≥8/10 |
| Positive packets built | — | 10/10 | 10/10 | ≥8/10 |
| Unnecessary v4 packets, negatives | — | **3/10** | **3/10** | ≤1/10 |
| Packet bytes, median / maximum | — | 580 / 738 | 3,416 / 4,017 | ≤1,024 / ≤4,096 |
| Preparation time, median | — | 52 ms | 53 ms | <250 ms |

The syntax reranker improved file rank, but it often selected the wrong block *inside* the correct file. The five misses were `typecheck-errors`, `controller-settings`, `context-settings`, `audit-token-join`, and `fixture-digest`. Navigation and evidence share the same block selection, so their block coverage is identical. The three negative false builds were a Stage 5 report summary, an unrelated calendar feature, and a request for external package-manager release notes. Exact-file and Git requests were correctly excluded by v3 before v4.

The fixture corpus is small and the positive tasks use source concepts specific enough that top-file accuracy is an easy gate. The block and abstention failures are decisive despite that favorable setup. These results do not estimate model token savings or quality.

## Safety check and disposition

An isolated repository with a normal source file, dotfile, binary file, >256 KiB file, and symlink emitted only the normal source file. A simulated `rg` listing failure **threw** from the experimental ranker instead of returning an abstention. That also fails the required fail-open safety behavior. The code is benchmark-only and has not been connected to a plugin hook; a production hook's defensive catch would suppress the exception, but this prototype does not meet its own safety contract.

The offline gate therefore stops the planned v4 config flags, plugin selection, live benchmark fixtures, and 18–24-run workhorse pilot. The current v3 behavior and default-off context setting are unchanged. The prototype, frozen task set, evaluator, and [machine-readable result](coverage-v4-validation-results.json) are retained for reproducibility. A new candidate would need to fix block localization, conservative abstention, and listing-failure handling, then be evaluated on a **new** untouched validation set before live testing.
