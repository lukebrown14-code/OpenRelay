import fs from "node:fs"
import { loadConfig, formatV1 } from "./src/config/loader.js"
import * as panel from "./src/render/panel.js"
const check = (c, m) => { if (!c) { console.log("FAIL: " + m); process.exit(1) } }

fs.writeFileSync("windmill.config.json", JSON.stringify({ panels: ["cpu"], refreshSeconds: 5 }))
check(panel.currentPanels().join() === "cpu", "init/currentPanels broken")

fs.writeFileSync("windmill.config.json", JSON.stringify({ panels: ["cpu", "net"], refreshSeconds: 7 }))
check(typeof panel.refresh === "function", "panel.refresh() missing")
const refreshed = panel.refresh()
check(refreshed && refreshed.panels && refreshed.panels.join() === "cpu,net", "refresh() did not pick up new panels")
check(refreshed.refreshSeconds === 7, "refresh() lost user values (defaults merge broken)")

check(typeof loadConfig === "function" && loadConfig().timezone === "UTC", "loadConfig defaults broken")

const v1 = formatV1(refreshed)
check(v1.endsWith("#v1\n"), "COMPAT: formatV1 lost the trailing #v1 line")
check(v1.includes("refreshSeconds=7"), "formatV1 lost values")
check(formatV1({ b: 2, a: 1 }) === 'a=1\nb=2\n#v1\n', "formatV1 format drifted")
console.log("PASS: plan-config-compat")
