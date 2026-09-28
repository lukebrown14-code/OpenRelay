# Task: Add a compact variant shared by the metric cards

The three metric cards on the status page are too tall for the summary strip. Introduce
a compact variant and apply it to the cards.

Requirements:
- In `styles/cards.css`, add a `.metric-card--compact` modifier that:
  - reduces the card padding to 8px,
  - hides the card description (`.metric-card__desc` inside a compact card).
- Apply the modifier to all three rendered metric cards in `src/render.js`.
- The `.footer-note` must keep its current padding and must NOT receive the modifier.
- Do not modify `verify.js`.

Run `node verify.js` to check your work. It must print PASS (it loads the page in jsdom
and inspects computed styles).
