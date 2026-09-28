export function signedAmount(row) {
  return row.kind === "refund" ? -row.amount : row.amount
}
