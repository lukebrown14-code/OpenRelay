export function formatTimestamp(date) {
  return new Date(date).toISOString()
}

export function formatElapsed(milliseconds) {
  if (typeof milliseconds !== "number" || !Number.isFinite(milliseconds)) throw new TypeError("milliseconds must be finite")
  const seconds = Math.max(0, Math.trunc(milliseconds / 1000))
  const hours = Math.trunc(seconds / 3600)
  const minutes = Math.trunc((seconds % 3600) / 60)
  const rest = seconds % 60
  const parts = []
  if (hours) parts.push(`${hours}h`)
  if (minutes) parts.push(`${minutes}m`)
  if (rest || !parts.length) parts.push(`${rest}s`)
  return parts.join(" ")
}
