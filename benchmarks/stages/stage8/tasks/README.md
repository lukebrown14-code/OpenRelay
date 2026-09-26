# Stage 8 real-repository discovery tasks

Four fresh coding requests use full allowlisted source snapshots of OpenRelay
(TypeScript) and Delta (Python). They are grounded in observed code behavior,
not mini-projects made to force a search pattern. Prompts omit answer paths;
`tasks.json` and the independent verifiers stay outside each model workspace.
Each task crosses a producer/consumer or config/domain boundary. The snapshots
contain 108 OpenRelay files and 119 Delta files, including Delta's offline test
modules. Delta's modified `config.toml`, credentials, virtual environment,
runtime data, and test fixtures are never copied.

## Prepare and check

```sh
node benchmarks/stages/stage8/stage8-tasks.mjs --prepare or-packet-path-identity
node benchmarks/stages/stage8/stage8-tasks.mjs --verify or-packet-path-identity
```

`--prepare` creates an ignored isolated workspace and a baseline Git commit.
`--verify` runs the independent check against that workspace; it exits nonzero
before the task is solved. `--baseline` does both and requires the expected
failure. The verifier is not in the workspace. The full task list is in
`tasks.json`; use each ID in the same commands. Re-running `--prepare` for an
existing workspace is refused, so a run cannot silently overwrite prior work.

These are coding tasks, not Stage 8 entry-gate observations. The four baseline
verifiers fail on their intended behavior. Existing surrounding checks passed
on untouched snapshots: OpenRelay `assemble.test.ts` (12 tests), Delta catalog
and watch-target tests (34), and Delta market setup/scope/watch-target tests
(25). OpenRelay `context.test.ts` needs the separate 100 MB fixture corpus and
is not runnable from this compact source snapshot; do not count that missing
fixture error as a task failure. The independent verifier remains the PASS gate.

For future trace collection, run filtering plus v3 in a prepared workspace,
save raw OpenCode JSONL, session ID, model/build ID, complete latency, token
usage, and verifier result. Run the same discovery-round audit on those traces
without changing its definition. Do not count the known baseline failure as a
model failure. Three distinct qualifying task cases and two concrete
map-addressable relationships are still required before a map prototype.
Passing a task verifier does not by itself satisfy that gate. The first live
collection is recorded in `docs/stage8/discovery-followup-report.md`: three
of four tasks passed verification and met the discovery threshold, so the
entry gate passed. The later offline map matched lexical ranking at 47/48
required files; the bounded live comparison used 39.3% more recorded tokens
and took 26.8% longer. The map was not integrated. See
`docs/stage8/map-prototype-report.md`.
