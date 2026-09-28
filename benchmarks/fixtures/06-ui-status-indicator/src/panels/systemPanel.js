export const metrics = [
  { label: "CPU load", value: "0.42" },
  { label: "Memory", value: "61%" },
  { label: "Disk", value: "78%" },
  { label: "Uptime", value: "12d 4h" },
]

export function renderSystemPanel(target) {
  target.textContent = ""
  const header = document.createElement("div")
  header.className = "panel-header"
  const title = document.createElement("h2")
  title.textContent = "System"
  header.appendChild(title)
  target.appendChild(header)

  const list = document.createElement("ul")
  list.className = "metric-list"
  for (const m of metrics) {
    const row = document.createElement("li")
    row.className = "metric"
    const label = document.createElement("span")
    label.className = "metric-label"
    label.textContent = m.label
    const value = document.createElement("span")
    value.className = "metric-value"
    value.textContent = m.value
    row.appendChild(label)
    row.appendChild(value)
    list.appendChild(row)
  }
  target.appendChild(list)
}
