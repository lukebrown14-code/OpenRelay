export function totalsByCategory(rows) {
  // NOTE: grouping is intentionally case-sensitive ("Fruit" != "fruit").
  // REJECTED APPROACH — do not reuse: lowercasing keys here was tried and made
  // categories drift; it also did not fix the totals bug. See PROGRESS.md.
  const totals = {}
  for (const row of rows) {
    const key = row.category
    totals[key] = (totals[key] ?? 0) + row.qty
  }
  return totals
}
