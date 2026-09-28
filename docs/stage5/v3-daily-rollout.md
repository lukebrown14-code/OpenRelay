# Stage 5 v3 daily rollout — 2026-09-24

The user approved a limited daily-channel rollout, accepting savings below the original 25% target provided quality and performance remain acceptable. The benchmark verdict is still **INCONCLUSIVE**; rollout is an operational choice based on the observed savings and passing verification runs, not a claim that the preregistered gate passed.

## Active release

- Build: `2026-09-23T23-14-35Z-99fd7d2a254f`
- Bundle SHA-256: `137cb3dc7cb9e56dc626bfa64b7b730c708f548cb432893e27054977bfa4435d`
- Source SHA-256: `99fd7d2a254fe8313220efbddf2f753dbdd60a755c39caa69be104d884ba4c83`
- `opencode-relay` now points to this hash-verified release; the prior daily release is retained as `previous`.
- Daily context defaults to on. `OPENRELAY_CONTEXT=off opencode-relay` disables it for that launch. Development and manual plugin registration remain off unless enabled explicitly.
- The released TUI plugin is at the release root as `tui.tsx`, where the launcher discovers it. The current daily release previously had the TUI source nested under `source/`, so it did not register. Daily and development launch status now both report their TUI entries.

## Evidence and limits

- The repeated v3 UI comparison saved **15.2%** of recorded coding input plus cache-read tokens, passed verification in all 36 baseline runs, and measured UI task duration **10.2% lower**.
- Five fresh fixture 21 pairs saved **22.6%**, with 12/12 independent verifications passing. Complete task duration was **6.3% higher** (about 2.4 seconds per task).
- These samples show no observed verification quality regression, but latency results are mixed and do not establish a general performance guarantee. Title-call token usage remains unavailable, so all-call savings and cost are incomplete.

The context selector remains v3. V4 was not integrated. Monitor the daily telemetry under `~/.local/share/openrelay/data/daily/` for packet decisions, task duration, verification outcomes, and recorded token usage. OpenCode must be restarted for a new launcher release to take effect.
