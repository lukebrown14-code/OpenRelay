Implement `formatElapsed(milliseconds)` in `src/duration.js` for status messages.
Return `0s` for zero or negative finite values; otherwise truncate milliseconds
to whole seconds. Show hours, minutes, and seconds when nonzero, with no leading
zero components: `3661000` becomes `1h 1m 1s`, `61000` becomes `1m 1s`, and
`59000` becomes `59s`. Reject non-finite or non-number inputs with `TypeError`.
Preserve the existing `formatTimestamp` export. Run an appropriate check.
