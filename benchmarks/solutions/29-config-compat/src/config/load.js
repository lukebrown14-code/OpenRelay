export function loadConfig(config) {
  const attempts = config.retry?.attempts ?? config.maxRetries ?? 2
  const delayMs = config.retry?.delayMs ?? config.retryDelay ?? 100
  if (![attempts, delayMs].every(value => Number.isInteger(value) && value >= 0)) throw new Error("invalid retry")
  return { endpoint: config.endpoint ?? "http://localhost", retry: { attempts, delayMs } }
}
