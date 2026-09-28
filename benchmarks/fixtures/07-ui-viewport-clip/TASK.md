# Task: Fix toolbar clipping at narrow viewport

The product page's filter toolbar gets clipped on phones: at narrow widths the filter
chips run off the right edge and are cut off (the toolbar hides overflow).

Requirements:
- At small widths (e.g. 480px), every filter chip must be fully visible — chips must
  wrap onto additional rows inside the toolbar instead of being clipped.
- At desktop width (e.g. 1200px), all chips must still fit on a single row.
- Keep the fix in `styles.css`; the chips themselves and their order must not change.
- Do not modify `verify.js`.

Run `node verify.js` to check your work. It must print PASS (it opens the page in a
headless Chromium at two viewport sizes).
