# Task: Fix the rate limiter

`src/rate-limiter.js` implements a token bucket used by an API gateway. Users report
intermittent 429s: the bucket sometimes refuses takes even though enough time has
passed for the tokens to regenerate. `verify.js` reproduces the problem deterministically
with a fake clock.

Diagnose and fix the refill logic in `src/rate-limiter.js` so all checks pass:

- refill must accumulate fractional tokens across short intervals (no truncation)
- takes must still fail while `available() < n` and succeed at the threshold
- refill must never exceed `capacity`
- do not change the public API (`available()`, `tryTake(n)`)

Do not modify `verify.js`.

Run `node verify.js` to check your work. It must print PASS.
