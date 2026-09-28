# Stage 5 Corpus Extension — Fixtures 14–16 (implemented)

Source: parallel investigation (2026-09-23). These symptom-first tasks add location
work and distractors without replacing the historical corpus. All three are implemented
and pass the pristine-FAIL/reference-solution-PASS check in
`node benchmarks/stages/stage5/validate-stage5.mjs`. Their coding-model economics have not been tested.
The full eight-fixture extension is in `next-steps.md`; the current experiment
recommendation is in `v3-audit-results.md`. Only 19 and 21 have extension model pilots;
14–16 still have no measured coding-model economics.

## Implemented fixture conventions

- `meta.json` `{"class","category","name","verifyTimeoutMs":30000}`
- `package.json` and `bun.lock` pin jsdom for fixtures 14 and 16; fixture 15 uses only Node.
- Per-fixture `.gitignore` (`results/`, `node_modules/`)
- Canonical solution under `benchmarks/solutions/<fixture>/`; pristine FAIL and
  solution PASS are checked by `validate-stage5.mjs`.
- Retrieval recall is measured separately. On the current v3 probe, 14–16 skip with
  `redundant-candidates` and yield no excerpts because the natural symptom text gives
  fixed-string search no usable locator. This is an observed limitation, not a fixture
  failure or a reason to add hints to the task text.
- Validate TASK.md against the tightened GIT_INTENT_RE (none of the drafts below trigger)

## 14 — `14-ui-dismiss-strip` (ui)

**Scenario:** dashboard promo strip's dismiss button does nothing; the notice card's works.
All clicks route through one delegated `data-action` dispatcher whose promo case imports a
stale legacy module targeting an absent DOM node; the real implementation exists and is correct.

**Tree:** index.html · src/sections/topbar.js (renders strip, `data-action="dismiss-promo"`,
aria "Dismiss promotion") · src/sections/notice.js (working sibling) · src/actions/promo.js
(correct impl, currently unrouted) · src/interactions.js (delegated dispatcher — **BUG**:
promo case calls stale `dismissLegacyBanner`) · src/legacy/banner.js (decoy: complete,
plausible, targets absent `#legacy-banner`).

**Trap:** grep "banner"/"Dismiss promotion" lands in the dead banner.js first; editing it
changes nothing (verify still fails), forcing the trace: index.html → topbar (data-action)
→ interactions.js → wrong import.

**verify.js:** render promos → click aria-labeled button → `strip.hidden === true`; re-render
→ still hidden; notice dismiss still works; stats section untouched.

**ground truth:** required `src/interactions.js`; optional promo.js/topbar.js/index.html.

## 15 — `15-debug-export-labels` (debug)

**Scenario:** orders table shows readable labels; the CSV export of the same data emits raw
`P2` for Priority only. Two consumers share one lowercase-keyed label map: the cell renderer
normalizes casing, the exporter doesn't. A decoy legacy exporter muddies the export path.

**Tree:** src/data/orders.js · src/labels.js (shared lowercase keys) · src/table/cells.js
(correct: normalizes before lookup) · src/export/csv.js (**BUG**: no normalization) ·
src/export/legacyExport.js (decoy).

**Trap:** grep `P2`/`priority` hits five files; the tempting fix (uppercasing keys in
labels.js) breaks the on-screen table — verify's render assertions catch it. Must discover
the shared map's second consumer and normalize at the export site.

**verify.js:** renderTable → no cell matches `/^[PN]\d$/`; buildCsv header exact; every
priority field ∈ {Urgent, High, Normal, Low}; status/region regression guards; comma-quoting
preserved.

**ground truth:** required `src/export/csv.js`; optional labels.js/cells.js/orders.js/legacyExport.js.

## 16 — `16-ui-overlay-leak` (ui)

**Scenario:** "Delete API key" confirm dialog leaves `.overlay-backdrop` dimming the page
after either button; reopening stacks a second backdrop. The shared overlay utility is
correct; the confirm dialog bypasses `closeOverlay` with a panel-only hide. A tooltip with
an intentionally persistent scrim is the decoy.

**Tree:** index.html · src/main.js · src/ui/overlay.js (correct util) · src/ui/inviteDialog.js
(correct consumer) · src/ui/confirmDialog.js (**BUG**: missing closeOverlay call) ·
src/ui/popup.js (decoy scrim).

**Trap:** absence-bug — no grep lands on a missing call; only diffing the two consumers
against the util reveals it. Stacking assertion punishes hide-instead-of-remove shortcuts.

**verify.js:** invite open/close → 1→0 backdrops (passes pre-fix); confirm open/cancel →
0 expected, 1 pre-fix; reopen → exactly 1 (stacks pre-fix); invite unaffected after.

**ground truth:** required `src/ui/confirmDialog.js`; optional overlay.js/inviteDialog.js/popup.js/index.html.

## Corpus decision

Keep fixtures 01–13 intact. Run 14–21 as a separate extension cohort so the original
Stage 5 result remains comparable. See `next-steps.md` for the experiment order.
