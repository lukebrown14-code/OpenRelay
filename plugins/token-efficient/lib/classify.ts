export type Tier = "premium" | "workhorse" | "free" | "other"

export function tier(providerID: string | undefined, modelID: string | undefined): Tier {
  const p = (providerID ?? "").toLowerCase()
  const m = (modelID ?? "").toLowerCase()
  if (p.includes("openai")) return "premium"
  if (p.includes("zai") || p.includes("zhipu") || p.includes("glm") || m.startsWith("glm")) return "workhorse"
  if (p.includes("openrouter")) return "free"
  return "other"
}

export function modelKey(providerID: string | undefined, modelID: string | undefined): string {
  return `${providerID ?? "?"}/${modelID ?? "?"}`
}
