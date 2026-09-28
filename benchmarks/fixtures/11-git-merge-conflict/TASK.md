# Task: Merge the search-suggestions feature into main

Branch `feature/search-suggestions` needs to land on `main`. Both branches changed the
`search` block of `settings.js`, so the merge will conflict.

Requirements:
- Merge `feature/search-suggestions` into `main` and resolve the conflict so that the
  final settings keep **both** intended changes:
  - `timeoutMs` stays at the production value from `main` (`250`),
  - the `suggestions: true` flag from the feature branch is present.
- The merge must be committed (a clean working tree with conflict markers left over is
  not acceptable), and `node settings.test.js` must pass.
- Do not modify `verify.js` or `settings.test.js`.

Run `node verify.js` to check your work. It must print PASS.
