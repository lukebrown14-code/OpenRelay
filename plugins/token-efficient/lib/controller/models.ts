import { tier } from "../classify"

export type ModelRef = { providerID: string; modelID: string }

/** Minimal shape of an entry in `client.provider.list().data.all`. */
export type ProviderSummary = {
  id: string
  name?: string
  models?: Record<string, { id: string; name?: string }>
}

export interface ResolvedModels {
  premium?: ModelRef
  workhorse?: ModelRef
}

function parseRef(s: string): ModelRef | undefined {
  const i = s.indexOf("/")
  if (i <= 0) return undefined
  const providerID = s.slice(0, i).trim()
  const modelID = s.slice(i + 1).trim()
  if (!providerID || !modelID) return undefined
  return { providerID, modelID }
}

function resolveByTier(
  providers: ProviderSummary[],
  targetTier: "premium" | "workhorse",
  override?: string,
): ModelRef | undefined {
  if (override) {
    const explicit = parseRef(override)
    if (explicit) return explicit
  }
  for (const p of providers) {
    for (const key of Object.keys(p.models ?? {})) {
      const m = p.models?.[key]
      if (!m) continue
      if (tier(p.id, m.id) === targetTier) return { providerID: p.id, modelID: m.id }
    }
  }
  return undefined
}

/** Resolve concrete premium/workhorse model refs from the enumerated provider list. */
export function resolveModels(providers: ProviderSummary[], cfg: { premiumModel?: string; workhorseModel?: string }): ResolvedModels {
  return {
    premium: resolveByTier(providers, "premium", cfg.premiumModel),
    workhorse: resolveByTier(providers, "workhorse", cfg.workhorseModel),
  }
}

export function modelKeyOf(ref: ModelRef): string {
  return `${ref.providerID}/${ref.modelID}`
}
