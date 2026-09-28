export function parseRows(csv) {
  return csv
    .trim()
    .split("\n")
    .slice(1)
    .map((line) => {
      const [category, qty] = line.split(",")
      return { category: category.trim(), qty: Number(qty.trim()) }
    })
}
