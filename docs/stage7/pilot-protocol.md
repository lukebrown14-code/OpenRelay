# Stage 7 bounded receiver workflow pilot

**Frozen before the main economic runs:** 2026-09-24. The four mechanics workflows
were completed first; their results are excluded from the policy comparisons.
The frozen `pilot-manifest.json` SHA-256 is
`f04352e2c80d639708ed85281bf3b86444cd3a8a58fe180b83010c4bb28ee202`.
Seed `70024` fixes the interleaved schedule. The manifest freezes fixture tree
hashes, models, policy assignments, run IDs, and ceilings.

## Arms and execution

G uses GLM for up to three verified turns; P uses premium. E1 starts with GLM
and switches to premium after one failed independent verification. E2 switches
after two failures. A passing verification stops immediately. Unknown results
and infrastructure errors stop without escalation. Every turn has an eight-step
agent limit and every workflow a ten-minute timeout. Each workflow uses one
session and an isolated repository checkout. The exact models are
`zai-coding-plan/glm-5.3` and `openai/gpt-5.5`, enumerated via `opencode models`
before freezing; the premium path uses existing OAuth and no API key.

All arms use filtering on, v3 context on, memory off, handoffs off, plugin
routing off, and plugin auto-escalation off. The harness controls the model for
each turn with the same feedback template. Independent verification runs on a
separate snapshot, so the model cannot edit the acceptance script in its
workspace. The mechanics E1/E2 workflows force a failure after an actual pass
to exercise the switch and cannot enter economic analysis.

The main matrix is three new fixtures × four policies × two repetitions (24).
The two harder fixtures receive one extra G and P control each (4). Four
mechanics workflows make 32 maximum. Workflows run sequentially. Results and
budget consumption are retained for successes, failures, and incomplete runs.

## Measurements and stops

Primary: recorded coding input+cacheRead by tier across all turns and complete
elapsed workflow time through the last independent verifier. Also report
verified pass, failed attempts, model rounds, model transitions, missing usage,
and controls separately. Title calls remain unobserved. The analyzer excludes
mechanics and A/A from main cell means and never fills missing usage with zero.

Stop starting calls at 32 workflows, 3 million total recorded coding tokens,
or 1 million premium coding tokens. The runner reserves 350,000 total and
150,000 premium tokens before admitting a new workflow and checks cumulative
usage before each continuation. One model call can still exceed its reservation;
any in-flight overshoot is reported. Stop on wrong-model execution, a changed
session ID, missing usage, independent verifier tampering, authentication or
rate-limit errors, or an intervention-attributable quality failure. After the
first complete repetition of the main matrix, stop for futility if neither E
policy reduces premium usage without a median complete-time increase versus P.

This is screening evidence. Fresh confirmation requires a new protocol and
budget; pilot data cannot establish a release PASS. No daily activation follows
automatically.
