# Coverage v2 offline result — 2026-09-24

**Verdict: FAIL for the preregistered advance gate.** The revision improved
top-four recall on the ten development tasks from 7/10 to 10/10 on the same
frozen source snapshot. On ten fresh holdout tasks, it met the file-recall,
packet-size, and preparation-time gates but included the labeled
implementation span in **7/10 packets**; the gate required **8/10**. The
experimental retrieval arm was therefore not connected to the plugin.

| Gate | Result | Required |
| --- | ---: | ---: |
| Required files in top four | 8/10 | ≥8/10 |
| Required files in top two | 7/10 | ≥7/10 |
| Labeled implementation span in rendered packet | 7/10 | ≥8/10 |
| Complete packet size | maximum 8,192 UTF-8 bytes | ≤8,192 |
| Median complete preparation | 26.3 ms | <250 ms |
| File-map or packet errors | 0 | 0 |

The three span misses are informative. Event persistence ranked other
benchmark and event files ahead of the store implementation. The risk
checkpoint task favored the benchmark prototype and neighboring controller
modules. For command classification, the responsible file ranked second but
the packet selected lines other than the labeled compound-command decision.
That last case confirms the previous result: file recall is insufficient when
the excerpt does not show the relevant behavior.

The revision uses length-normalized lexical fields, deterministic import
neighbors, and source lines around matching terms. It gives each of four
candidates an initial content allowance, then fills remaining packet space
by rank. The [source archive](coverage-source-snapshot.tar.gz) and
[manifest](coverage-source-snapshot.json) freeze 102 files. The
[protocol](coverage-v2-protocol.md), [development data](coverage-v2-development-data.json),
and [holdout data](coverage-v2-holdout-data.json) preserve task labels, hashes,
ranks, rendered-line selections, packet bytes, and timing. The original
prototype and live v3 path were not changed.

The focused tests passed for deterministic output, late relevant lines,
UTF-8 packet size, four-candidate allowance, and excluded dotfiles, tests,
symlinks, binary files, and oversized files. These tests establish the
prototype's mechanics; the holdout failure remains the advance decision.

Use these ten holdout tasks as development data for the next ranking and
excerpt revision. A new, preregistered holdout is required before any opt-in
integration. The offline result makes no claim about coding-token savings.
