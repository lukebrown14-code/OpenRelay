import fs from "node:fs"

const DEFAULTS = { timezone: "UTC", panels: [], refreshSeconds: 60 }

export function loadConfig(path = "windmill.config.json") {
  let user = {}
  try {
    user = JSON.parse(fs.readFileSync(path, "utf8"))
  } catch {}
  return { ...DEFAULTS, ...user }
}

export function formatV1(cfg) {
  // v1 wire format consumed by external dashboards. The trailing "#v1" line is
  // load-bearing: monitoring greps for it. Do not change this output.
  const keys = Object.keys(cfg).sort()
  return keys.map((k) => `${k}=${JSON.stringify(cfg[k])}`).join("\n") + "\n#v1\n"
}
