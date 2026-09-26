const CARDS = [
  { id: "cpu", title: "CPU", desc: "5-minute load average across cores" },
  { id: "mem", title: "Memory", desc: "Resident usage of the app pool" },
  { id: "disk", title: "Disk", desc: "Free space on the data volume" },
]

const VALUES = { cpu: "0.42", mem: "61%", disk: "78%" }

function buildCard(card) {
  const el = document.createElement("section")
  el.className = "metric-card"
  el.dataset.metric = card.id
  const title = document.createElement("h2")
  title.className = "metric-card__title"
  title.textContent = `${card.title} ${VALUES[card.id]}`
  const desc = document.createElement("p")
  desc.className = "metric-card__desc"
  desc.textContent = card.desc
  el.appendChild(title)
  el.appendChild(desc)
  return el
}

const summary = document.getElementById("summary")
if (summary) {
  for (const card of CARDS) summary.appendChild(buildCard(card))
}
