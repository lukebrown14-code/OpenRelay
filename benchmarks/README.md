# Benchmarks (Stage 1: corpus + A/A calibration harness)

Four fixture classes with objective acceptance criteria (each `verify.js` exits 0 only
when the task is correctly completed; pristine fixtures always fail):

| Fixture | Class | Objective check |
|---|---|---|
| `fixtures/01-trivial-edit` | trivial/local | constant changed to 12 + summary string |
| `fixtures/02-routine-bug` | routine bug | 7 slugify cases pass (lowercase bug) |
| `fixtures/03-medium-feature` | medium feature | 7 behavioral checks on new `retry()` util (multi-file) |
| `fixtures/04-difficult-debug` | difficult | 5 fake-clock checks on token bucket (fractional refill truncation bug) |

Reference solutions live in `solutions/` (outside the repos, so agents can't see them).
Each fixture is a git repo with a pinned baseline commit; each run clones fresh.

## Running

```sh
cd ~/.config/opencode/benchmarks

# one fixture, 3 runs, GLM workhorse:
node run.mjs --fixture 02-routine-bug --runs 3 --model zai-coding-plan/glm-5.3-flash --label aa-glm-baseline

# all fixtures:
node run.mjs --fixture all --runs 3 --model zai-coding-plan/glm-5.3-flash --label aa-glm-baseline
```

Each run: fresh clone → `opencode run -m <model> --auto --format json "<TASK.md>"` →
`node verify.js` → record `run.json` (+ captured opencode output). `--auto` approves
tool permissions headlessly — only safe because workspaces are disposable clones.
`--dry-run` validates harness mechanics without calling models.

## A/A calibration

Run the same config twice under different labels, then:

```sh
node analyze.mjs aa-glm-baseline-1 aa-glm-baseline-1b
```

The analyzer joins each run to its telemetry via sessionID (plugin event stream in
`~/.local/share/opencode/token-efficient/events/`), reports per-label aggregates
(mean/sd/CoV) and flags per-metric deltas as within-noise / outside-noise.
Decision rule (from the plan): differences inside the A/A noise floor are
INCONCLUSIVE → do not add complexity.

## Exit criteria (Stage 1)

- [x] repeated runs can be compared (run.json + telemetry join by sessionID)
- [ ] metrics stable enough to identify meaningful changes — requires actual A/A runs
- [x] success criteria objective for most benchmark tasks (4/4 fixtures have deterministic verify.js)
