// Byte-size formatting for the asset pipeline.
// Spec (see TASK.md): binary units, one decimal place, trailing ".0" stripped.

const UNITS = ["B", "KB", "MB", "GB", "TB"]

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) {
    throw new RangeError(`bytes must be a non-negative finite number, got ${bytes}`)
  }
  let value = bytes
  let unit = 0
  while (value > 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit += 1
  }
  const text = value.toFixed(1)
  return `${text.endsWith(".0") ? text.slice(0, -2) : text} ${UNITS[unit]}`
}
