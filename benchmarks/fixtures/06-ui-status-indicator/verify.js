import { JSDOM } from "jsdom"
import { readFileSync } from "node:fs"
import { renderSystemPanel } from "./src/panels/systemPanel.js"
import { renderBillingPanel } from "./src/panels/billingPanel.js"
import { renderNotificationsPanel } from "./src/panels/notificationsPanel.js"

const dom = new JSDOM(readFileSync("index.html", "utf8"))
globalThis.document = dom.window.document
globalThis.window = dom.window
const doc = dom.window.document

function fail(msg) {
  console.error(`FAIL: ui-status-indicator (${msg})`)
  process.exit(1)
}

renderSystemPanel(doc.querySelector("#system-panel"))
renderBillingPanel(doc.querySelector("#billing-panel"))
renderNotificationsPanel(doc.querySelector("#notifications-panel"))

const header = doc.querySelector("#system-panel .panel-header")
if (!header) fail("system panel header missing")
const badge = header.querySelector("span.status-badge")
if (!badge) fail("System panel header has no span.status-badge")
if (!badge.getAttribute("data-status")) fail("status-badge has no data-status attribute")
if (!badge.textContent.trim()) fail("status-badge is empty")

for (const id of ["billing-panel", "notifications-panel"]) {
  const other = doc.querySelector(`#${id} .panel-header`)
  if (!other) fail(`${id} header missing`)
  if (other.querySelector("span.status-badge")) fail(`${id} header must not contain a status-badge`)
  const before = other.innerHTML
  renderSystemPanel(doc.querySelector(id === "billing-panel" ? "#billing-panel" : "#notifications-panel"))
  if (other.innerHTML !== before) fail(`${id} changed after a System panel re-render`)
}

console.log("PASS: ui-status-indicator")
