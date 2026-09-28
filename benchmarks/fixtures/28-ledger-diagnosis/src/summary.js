import { parseRows } from "./parse.js"
import { signedAmount } from "./normalize.js"

export function summarize(csv) {
  const totals = {}
  for (const row of parseRows(csv)) totals[row.account] = (totals[row.account] ?? 0) + signedAmount(row)
  return totals
}
