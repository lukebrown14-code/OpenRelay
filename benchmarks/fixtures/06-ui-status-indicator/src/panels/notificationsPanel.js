export const events = [
  { time: "09:12", text: "Deploy v2.4.1 completed" },
  { time: "10:03", text: "Nightly backup finished" },
  { time: "11:47", text: "Certificate renewed" },
]

export function renderNotificationsPanel(target) {
  target.textContent = ""
  const header = document.createElement("div")
  header.className = "panel-header"
  const title = document.createElement("h2")
  title.textContent = "Notifications"
  header.appendChild(title)
  const chip = document.createElement("span")
  chip.className = "event-chip"
  chip.textContent = "3 new"
  header.appendChild(chip)
  target.appendChild(header)

  const list = document.createElement("ul")
  list.className = "event-list"
  for (const ev of events) {
    const row = document.createElement("li")
    row.className = "event-row"
    const time = document.createElement("span")
    time.className = "event-time"
    time.textContent = ev.time
    const text = document.createElement("span")
    text.textContent = ev.text
    row.appendChild(time)
    row.appendChild(text)
    list.appendChild(row)
  }
  target.appendChild(list)
}
