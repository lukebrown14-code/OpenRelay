import { loadConfig } from "../config/loader.js"

let current = null

export function init() {
  current = loadConfig()
  return current
}

export function currentPanels() {
  if (!current) init()
  return current.panels
}
