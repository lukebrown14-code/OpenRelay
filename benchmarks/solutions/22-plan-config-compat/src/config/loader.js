import fs from "node:fs"

const DEFAULTS = { timezone: "UTC", panels: [], refreshSeconds: 60 }

export function loadConfig(path = "windmill.config.json") {
  let user = {}
  try {
    user = JSON.parse(fs.readFileSync(path, "utf8"))
  } catch {}
  return { ...DEFAULTS, ...user }
}

export function reloadConfig(path = "windmill.config.json") {
  return loadConfig(path)
}

export function formatV1(cfg) {
  const keys = Object.keys(cfg).sort()
  return keys.map((k) => `${k}=${JSON.stringify(cfg[k])}`).join("\n") + "\n#v1\n"
}
