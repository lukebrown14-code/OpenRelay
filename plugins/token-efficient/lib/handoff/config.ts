export interface HandoffOptions {
  enabled?: boolean
}

export interface HandoffConfig {
  enabled: boolean
}

// Stage 6 features start off in every channel; unset means off (stage6-plan §3).
export function resolveHandoffConfig(opts: HandoffOptions | null | undefined, envValue?: string): HandoffConfig {
  const enabled =
    envValue === "on" ? true : envValue === "off" ? false : typeof opts?.enabled === "boolean" ? opts.enabled : false
  return { enabled }
}
