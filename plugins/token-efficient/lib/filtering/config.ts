export interface FilteringOptions {
  enabled?: boolean
  minBytes?: number
  retention?: {
    ttlHours?: number
    maxBytesPerResult?: number
    maxBytesPerSession?: number
  }
}

export interface FilteringConfig {
  enabled: boolean
  minBytes: number
  ttlMs: number
  maxBytesPerResult: number
  maxBytesPerSession: number
}

export const DEFAULT_FILTERING: FilteringConfig = {
  enabled: false,
  minBytes: 4096,
  ttlMs: 24 * 60 * 60 * 1000,
  maxBytesPerResult: 10 * 1024 * 1024,
  maxBytesPerSession: 50 * 1024 * 1024,
}

function positiveInt(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback
}

export function resolveFilteringConfig(opts: FilteringOptions | null | undefined, envValue?: string): FilteringConfig {
  const enabled =
    envValue === "on" ? true : envValue === "off" ? false : typeof opts?.enabled === "boolean" ? opts.enabled : false
  return {
    enabled,
    minBytes: positiveInt(opts?.minBytes, DEFAULT_FILTERING.minBytes),
    ttlMs: positiveInt(opts?.retention?.ttlHours, DEFAULT_FILTERING.ttlMs / (60 * 60 * 1000)) * 60 * 60 * 1000,
    maxBytesPerResult: positiveInt(opts?.retention?.maxBytesPerResult, DEFAULT_FILTERING.maxBytesPerResult),
    maxBytesPerSession: positiveInt(opts?.retention?.maxBytesPerSession, DEFAULT_FILTERING.maxBytesPerSession),
  }
}
