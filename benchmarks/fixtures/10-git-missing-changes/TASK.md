# Task: The launch rate limit never made it to main

Release notes on `main` say the API rate limit was raised for the launch, but deploys
from `main` still enforce the old limit. Somewhere in the repository history the actual
config change exists but never reached `main`.

Requirements:
- Work on `main`. Bring the missing rate-limit change into `main` from wherever it lives
  (merge or cherry-pick the original commit — keep the original change in history).
- Afterwards: `main`'s `config.js` must set `RATE_LIMIT` to `500`, `node src/app.js`
  must report the new limit, and the original commit that raised the limit must be an
  ancestor of `main`.
- Do not rewrite or delete the `release/*` branch.
- Do not modify `verify.js`.

Run `node verify.js` to check your work. It must print PASS.
