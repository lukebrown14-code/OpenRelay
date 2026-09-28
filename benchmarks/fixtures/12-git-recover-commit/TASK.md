# Task: Recover the lost runbook commit

Yesterday a teammate committed `docs/runbook.md` ("Add incident runbook") on this
repository, but the branch was reset afterwards and the file disappeared from the
working tree. The commit itself is still somewhere in this repository.

Requirements:
- Find the original commit and recover it onto `main`, keeping its original message and
  exact content (merge it, or cherry-pick it — do not rewrite the file by hand).
- Do not modify `verify.js`.

Run `node verify.js` to check your work. It must print PASS.
