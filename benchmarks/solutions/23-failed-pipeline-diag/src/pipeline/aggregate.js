export function totalsByCategory(rows) {
  const totals = {}
  for (const row of rows) {
    const key = row.category
    totals[key] = (totals[key] ?? 0) + row.qty
  }
  return totals
}
