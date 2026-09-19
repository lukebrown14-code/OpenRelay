# Task: Add a retry utility

Add a `retry(fn, options)` utility in `src/retry.js` and re-export it from `src/index.js`.

Requirements:

- `retry(fn, { attempts, delayMs })` calls `fn()` (which may be async) up to `attempts` times.
- Resolves with the first successful result (a resolved promise).
- If all attempts fail, rejects with the last error.
- Waits `delayMs` milliseconds between attempts (no wait after the final failure).
- Defaults: `attempts = 3`, `delayMs = 0`.
- Rejects if `attempts < 1`.

Run `node verify.js` to check your work. All checks must pass.
