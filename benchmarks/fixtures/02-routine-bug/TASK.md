# Task: Fix slugify

`src/slugify.js` is broken: it does not lowercase its output. All test cases in
`verify.js` fail.

Fix `slugify` so that every case passes:
- trim the input
- remove apostrophes (both ' and ’)
- collapse every run of non-alphanumeric characters into a single "-"
- lowercase the result
- trim leading/trailing dashes

Do not modify `verify.js`.

Run `node verify.js` to check your work. It must print PASS.
