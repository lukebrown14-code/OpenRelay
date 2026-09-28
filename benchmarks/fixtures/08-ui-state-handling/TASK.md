# Task: Show an error state when status loading fails

`StatusWidget` renders three state blocks: loading, data, and error. Loading a status
report can fail, but the widget currently spins forever: when `fetchStatus` rejects,
the loading block never goes away and no error is shown.

Requirements:
- When `fetchStatus` rejects, `load()` must leave the widget in the failed state:
  show the `.widget-error` block with the error message text, and hide the
  `.widget-loading` block.
- The success path must keep working exactly as it does today.
- The next successful `load()` after a failure must clear the error block.
- Do not modify `verify.js`.

Run `node verify.js` to check your work. It must print PASS.
