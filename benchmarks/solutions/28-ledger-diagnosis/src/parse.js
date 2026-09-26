export function parseRows(csv) {
  const [header, ...lines] = csv.trim().split(/\r?\n/)
  if (header !== "account,kind,amount") throw new Error("bad header")
  return lines.filter(Boolean).map(line => {
    const [account, kind, raw] = line.split(",")
    if (!/^[+-]?(?:\d+)(?:\.\d+)?$/.test(raw ?? "")) throw new Error("invalid amount")
    return { account, kind, amount: Number(raw) }
  })
}
