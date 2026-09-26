export const invoices = [
  { id: "INV-2041", amount: "$129.00", status: "paid" },
  { id: "INV-2042", amount: "$89.00", status: "open" },
  { id: "INV-2043", amount: "$249.00", status: "paid" },
]

export function renderBillingPanel(target) {
  target.textContent = ""
  const header = document.createElement("div")
  header.className = "panel-header"
  const title = document.createElement("h2")
  title.textContent = "Billing"
  header.appendChild(title)
  const tag = document.createElement("span")
  tag.className = "invoice-tag"
  tag.textContent = "3 invoices"
  header.appendChild(tag)
  target.appendChild(header)

  const list = document.createElement("ul")
  list.className = "invoice-list"
  for (const inv of invoices) {
    const row = document.createElement("li")
    row.className = "invoice-row"
    const id = document.createElement("span")
    id.textContent = inv.id
    const amount = document.createElement("span")
    amount.className = "invoice-amount"
    amount.textContent = inv.amount
    row.appendChild(id)
    row.appendChild(amount)
    list.appendChild(row)
  }
  target.appendChild(list)
}
