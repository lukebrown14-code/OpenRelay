# Stage 8 real-repository discovery follow-up

**Date:** 2026-09-24. **Decision:** The repository-map **entry gate passes**.
This authorizes an offline map prototype and task-addressability study. It
does not establish token savings, speed, quality parity, or release readiness.

The initial Stage 8 audit found zero qualifying v3 runs in the small fixture
corpus. Four fresh tasks were then prepared on frozen OpenRelay and Delta
source snapshots. Each ran once under GLM 5.3 with filtering and v3 on,
memory, handoffs, routing, and escalation off. The prompts and independent
verifiers are frozen in `task-corpus-manifest.json`; the source trees are in
`source-manifest.json`. No premium calls occurred.

| Task | Independent result | Navigation-only rounds before first edit | Source reads before first edit | Recorded coding input + cache-read | Complete time |
| --- | --- | ---: | ---: | ---: | ---: |
| OpenRelay packet path identity | PASS | 3 | 10 | 972,026 | 301 s |
| Delta config writeback | PASS | 6 | 6 | 669,884 | 332 s |
| OpenRelay memory cap order | Timeout; verifier FAIL | 1; no edit | 8 | 155,609 partial | 1,094 s |
| Delta market dependencies | PASS | 2 | 12 | 938,570 | 343 s |

The three verified PASS tasks are distinct cases with at least two
navigation-only rounds. Their required files were all explicitly read before
the first edit. The Delta config task traversed the model-picker writeback to
the shared config writer; the Delta market task traversed market removal,
config, and target resolution. Both relationships are visible through local
imports and symbols, so the separate **two map-addressable relationships**
condition passes. The OpenRelay packet task also crossed the producer/consumer
packet boundary, although that relationship is less direct for a static map.
The [run-level audit](discovery-followup-audit.json) records every trace hash,
session ID, round, required file, and result.

Three successful runs used **2,580,480** recorded coding input + cache-read
tokens. The timed-out run adds **at least 155,609** recorded tokens; its usage
was incomplete, so **2,736,089** is a lower bound for all four. Successful
complete times were 5.0–5.7 minutes. The memory task exceeded its configured
eight-minute timeout before the process closed, exposing a cancellation issue
in the benchmark harness; it is excluded from the entry-gate count. All three
successful runs passed surrounding repository tests (OpenRelay assembly: 15;
Delta catalog/watch targets: 34; Delta market setup/scope/watch targets: 25).

The first attempt to launch OpenCode failed before session creation because
the filesystem sandbox blocked its log path. It used zero model tokens and is
preserved as `invalid-preflight-or-packet-path-identity-1`. The successful
rerun followed the unchanged v1 protocol. V1 then stopped at its 1.2M token
ceiling. Before further model calls, a separate v2 protocol froze the remaining
three tasks and a 3.6M recorded-token ceiling. V2 recorded 1,764,063 tokens,
including the incomplete timeout run, within that ceiling. No attempts were
retried after a model session began.

V3 built a packet for the Delta config task and skipped the other three. A
map may help when v3 skips or when its packet does not show a needed
relationship, but there is no map arm or native control in this entry audit.
The sample is one run per task, with no estimate of map savings or latency.
An offline JS/TS and Python map prototype was subsequently built and tested;
the bounded live pilot failed its token and speed stop rules. See
`map-prototype-report.md`.

Reproduce the audit without model calls:

```sh
node benchmarks/stages/stage8/audit-stage8.mjs --include-stage8 > docs/stage8/discovery-followup-audit.json
node benchmarks/stages/stage8/freeze-stage8.mjs --verify
node benchmarks/stages/stage8/freeze-stage8-task-corpus.mjs --verify
```
