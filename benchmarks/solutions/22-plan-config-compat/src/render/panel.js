import { loadConfig, reloadConfig } from "../config/loader.js"

let current = null

export function init() {
  current = loadConfig()
  return current
}

export function currentPanels() {
  if (!current) init()
  return current.panels
}

export function refresh() {
  current = reloadConfig()
  return current
}
