import { chromium } from "playwright"
import { pathToFileURL } from "node:url"
import { resolve } from "node:path"

const url = pathToFileURL(resolve("index.html")).href

function fail(msg) {
  console.error(`FAIL: ui-viewport-clip (${msg})`)
  process.exit(1)
}

let browser
try {
  browser = await chromium.launch()
} catch (e) {
  fail(`could not launch Chromium: ${String(e.message).slice(0, 200)}`)
}

const page = await browser.newPage()
await page.goto(url)

// Narrow viewport: every chip must be fully visible (no horizontal clipping).
await page.setViewportSize({ width: 480, height: 800 })
const narrow = await page.evaluate(() => {
  const toolbar = document.getElementById("filter-toolbar")
  const chips = [...toolbar.querySelectorAll(".chip")]
  const box = toolbar.getBoundingClientRect()
  return {
    scrollWidth: toolbar.scrollWidth,
    clientWidth: toolbar.clientWidth,
    chipCount: chips.length,
    clipped: chips.filter((c) => {
      const r = c.getBoundingClientRect()
      return r.right > box.right + 1 || r.width === 0
    }).length,
  }
})
if (narrow.chipCount !== 8) fail(`expected 8 chips, found ${narrow.chipCount}`)
if (narrow.scrollWidth > narrow.clientWidth) fail(`chips overflow the toolbar at 480px (${narrow.scrollWidth} > ${narrow.clientWidth})`)
if (narrow.clipped > 0) fail(`${narrow.clipped} chip(s) clipped at 480px`)

// Desktop viewport: chips must still share a single row.
await page.setViewportSize({ width: 1200, height: 800 })
const wide = await page.evaluate(() => {
  const chips = [...document.querySelectorAll("#filter-toolbar .chip")]
  const tops = new Set(chips.map((c) => Math.round(c.getBoundingClientRect().top)))
  return { rows: tops.size }
})
if (wide.rows !== 1) fail(`at 1200px the chips span ${wide.rows} rows; expected a single row`)

await browser.close()
console.log("PASS: ui-viewport-clip")
