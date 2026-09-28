export function formatTimestamp(date) {
  return new Date(date).toISOString()
}

export function formatElapsed(milliseconds) {
  return `${Math.round(milliseconds / 1000)}s`
}
