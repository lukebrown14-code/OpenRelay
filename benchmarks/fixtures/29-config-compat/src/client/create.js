import { loadConfig } from "../config/load.js"

export function createClient(config) {
  const loaded = loadConfig(config)
  return { endpoint: loaded.endpoint, retry: loaded.retry }
}
