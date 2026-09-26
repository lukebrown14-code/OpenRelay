# Packet coverage: offline candidate-discovery prototype — 2026-09-24

**Status: feasibility signal, no live behavior change.** The current v3 probe
skips fixtures 14–18 and 20 because their symptom-led requests have no exact
path, quoted locator, or error code. `benchmarks/stages/stage5/coverage-prototype.mjs` tests a
bounded file map: list source paths with `rg`, read a capped set of source files,
rank query-term overlap in paths and bodies, then give a bounded bonus to
direct import neighbors. Ground truth is read only after ranking. This code is
in the benchmark area and is not connected to the OpenRelay plugin or selector.

## Zero-token result

| Fixture | v3 packet | Prototype required recall in top 4 | Required rank(s) |
| --- | --- | ---: | --- |
| 14 promotion dismiss | skipped | 1/1 | 2 |
| 15 CSV export labels | skipped | 1/1 | 1 |
| 16 overlay cleanup | skipped | 1/1 | 1 |
| 17 Python to Rust | skipped | 1/1 | 2 |
| 18 receipt API and callers | skipped | 4/4 | 2, 4, 1, 3 |
| 20 order cancellation | skipped | 3/3 | 1, 3, 4 |

That is **11/11 required files in 24 candidate slots** (45.8% required-file
precision). At top 3, fixtures 18 and 20 miss one required file each. Decoys
remain prominent: the notice file ranks first on 14 and the invite dialog ranks
second on 16. A four-file packet could therefore add irrelevant context even
when recall is complete.

The extension fixtures are tiny: each has only **four to six** eligible source
files. A four-file limit sees much of each repository, so this result cannot
establish useful ranking or token savings on larger workspaces. As one larger
repository sanity check, the prototype listed and read 117 eligible OpenRelay
source files in roughly 80 ms for a context-engine request; `retrieve.ts`
ranked in the top four. This is a local timing observation, not a latency
benchmark. The [raw evaluation](coverage-prototype-data.json) includes all
fixture ranks, file counts, and read bytes.

## Bounds and next gate

The prototype uses `rg --files` with ignored/generated directories excluded;
it refuses more than 5,000 eligible paths, reads at most 500 files and 4 MiB
total, and ignores files over 256 KiB. Dotfiles, symlinks, binary files,
test/harness artifacts, and archive/legacy directories are excluded. Its
sorting and tie breaks are deterministic. These are experiment bounds, not a
reviewed production implementation. The focused tests cover recall,
determinism, a graph-neighbor case, and safety exclusions.

The next evidence needed is **ranking on larger, held-out symptom-led tasks**
with required-file labels, plus an estimate of actual excerpt bytes and decoy
content. If that passes a preregistered recall/precision and preparation-time
gate, add a separate opt-in retrieval arm and compare coding tokens, quality,
rounds, and task duration against frozen v3. The live selector remains v3 and
`OPENRELAY_CONTEXT` remains off by default. The fixture-21 result and its
original 25% preregistered gate are unchanged.
