# Larger repository packet-coverage result — 2026-09-24

**Advance gate FAIL: no opt-in live retrieval arm yet.** The frozen
[protocol](coverage-heldout-protocol.md) tested ten symptom-led location tasks
against the OpenRelay working tree. The prototype found the required file in
the top four for **7/10** tasks (required ≥8/10) and in the top two for
**5/10** (required ≥7/10). All file maps completed and median preparation was
**18.9 ms** (required <250 ms). No model calls or plugin changes were made.

| Task | Required-file rank | Estimated excerpt bytes for required file | Main issue |
| --- | ---: | ---: | --- |
| Failure summary | 4 | 4 | A nominal hit with almost no useful excerpt |
| Raw output session boundary | absent | 0 | Analyzer and fixture source ranked ahead |
| Workhorse model resolution | 1 | 1,842 | Hit |
| Escalation threshold | 1 | 1,024 | Hit |
| Sidebar build identifier | 1 | 3,038 | Hit |
| Launcher registration conflict | 2 | 3,022 | Hit |
| Duplicate usage accounting | 3 | 2,044 | Hit |
| Benchmark packet digest | absent | 0 | Packet capture and audit files ranked ahead |
| Passing output preview | 2 | 3,041 | Hit |
| Startup toast text | absent | 0 | Launcher files ranked ahead |

The 8 KiB total / 3 KiB per-file budget simulation put **any** required excerpt
in 7/10 tasks, matching top-four recall. Only **6/10** received at least 256
estimated bytes; that 256-byte diagnostic was computed after the run and is **not** a
replacement for the preregistered gate. The estimated four-byte failure-summary excerpt
shows why filename recall alone overstates packet coverage. Across tasks,
large audit/analyzer files and adjacent launcher or packet modules were common
decoys. The [machine-readable data](coverage-heldout-data.json) records all
candidate paths, ranks, source sizes, excerpt allocations, and timing.

The corpus manifest covers 146 source paths, SHA-256
`ea3ab087046ab8598508d691e40e4f18cd111d3e61bfd210366de1c41aad19e6`.
The ranker SHA-256 was
`b89188c9523107fcf5b2f710059df9beb424ba45822883fb8a4d94c35e0b6252`;
task-spec SHA-256 is in the data file. These tasks were authored from this
repo's known responsibilities before running the ranker, so they are held out
from ranker tuning but are still one repository and one author's labels. One
different OpenRelay query was used as a sanity check before this protocol.

The next work is to use these ten tasks as **development data** for candidate
ranking and budget allocation, then evaluate a frozen revision on a new,
larger holdout. The live v3 selector and default-off context setting remain
unchanged. The failure of this zero-token gate is enough to defer model-cost
comparisons; it says nothing about the coding-token effect of a future packet.
