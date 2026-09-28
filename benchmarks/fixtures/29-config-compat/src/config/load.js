export function loadConfig(config) {
  return { endpoint: config.endpoint ?? "http://localhost", retry: { attempts: config.maxRetries || 2, delayMs: config.retryDelay || 100 } }
}
