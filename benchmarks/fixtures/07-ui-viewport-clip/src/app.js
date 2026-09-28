const FILTERS = [
  "All",
  "In stock",
  "Free shipping",
  "On sale",
  "Price: low to high",
  "Rating 4+",
  "New arrivals",
  "Refurbished",
]

function buildToolbar(target) {
  target.textContent = ""
  for (const label of FILTERS) {
    const chip = document.createElement("button")
    chip.type = "button"
    chip.className = "chip"
    chip.textContent = label
    target.appendChild(chip)
  }
}

const toolbar = document.getElementById("filter-toolbar")
if (toolbar) buildToolbar(toolbar)
