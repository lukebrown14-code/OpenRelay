export interface MemoryOptions {
  enabled?: boolean
}

export interface MemoryConfig {
  enabled: boolean
}

// Stage 6 features start off in every channel; unset means off (stage6-plan §3).
export function resolveMemoryConfig(opts: MemoryOptions | null | undefined, envValue?: string): MemoryConfig {
  const enabled =
    envValue === "on" ? true : envValue === "off" ? false : typeof opts?.enabled === "boolean" ? opts.enabled : false
  return { enabled }
}
