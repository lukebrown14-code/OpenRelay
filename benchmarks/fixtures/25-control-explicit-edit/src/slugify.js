export function slugify(text) {
  return String(text).trim().replace(/\s+/g, "_")
}
