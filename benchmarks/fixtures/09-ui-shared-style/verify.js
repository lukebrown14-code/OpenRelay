import { JSDOM } from "jsdom"

function fail(msg) {
  console.error(`FAIL: ui-shared-style (${msg})`)
  process.exit(1)
}

const dom = await JSDOM.fromFile("index.html", { resources: "usable", runScripts: "dangerously" })
await new Promise((resolve, reject) => {
  dom.window.addEventListener("load", resolve)
  dom.window.addEventListener("error", reject)
  setTimeout(() => reject(new Error("page load timed out")), 10000)
})

const doc = dom.window.document
const style = (el) => dom.window.getComputedStyle(el)

const cards = doc.querySelectorAll(".metric-card")
if (cards.length !== 3) fail(`expected 3 metric cards, found ${cards.length}`)

for (const card of cards) {
  if (!card.classList.contains("metric-card--compact")) {
    fail(`card ${card.dataset.metric ?? "?"} is missing the metric-card--compact modifier`)
  }
  const pad = style(card).paddingTop
  if (pad !== "8px") fail(`card ${card.dataset.metric} padding-top is ${pad}, expected 8px`)
  const desc = card.querySelector(".metric-card__desc")
  if (!desc) fail(`card ${card.dataset.metric} has no description element`)
  else if (style(desc).display === "none") {
    // correct: descriptions are hidden in compact cards
  } else {
    fail(`description of card ${card.dataset.metric} is still visible`)
  }
}

const footer = doc.querySelector(".footer-note")
if (!footer) fail("footer note missing")
if (footer.classList.contains("metric-card--compact")) fail("footer note must not receive the compact modifier")
const fpad = style(footer).paddingTop
if (fpad !== "16px") fail(`footer padding-top is ${fpad}, expected unchanged 16px`)

console.log("PASS: ui-shared-style")
