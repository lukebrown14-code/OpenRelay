export type RouteMode = "off" | "auto" | "premium" | "glm"

export interface ControllerOptions {
  route?: RouteMode
  escalation?: { maxCycles?: number }
  checkpoint?: { enabled?: boolean; patterns?: string[] }
  premiumModel?: string
  workhorseModel?: string
}

export interface ControllerConfig {
  route: RouteMode
  escalateEnabled: boolean
  maxCycles: number
  checkpointEnabled: boolean
  checkpointPatterns: string[]
  premiumModel?: string
  workhorseModel?: string
}

const MODES: readonly RouteMode[] = ["off", "auto", "premium", "glm"]

export const DEFAULT_CHECKPOINT_PATTERNS: readonly string[] = [
  "migration",
  "migrate",
  "authentication",
  "authorization",
  "permission",
  "secret",
  "credential",
  "api key",
  "apikey",
  "token",
  "deploy",
  "production",
  "drop table",
  "truncate",
  "sudo",
  "schema",
]

function positiveInt(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback
}

function pickMode(opts: ControllerOptions | null | undefined, env: NodeJS.ProcessEnv | undefined): RouteMode {
  const envValue = env?.OPENRELAY_ROUTE
  if (typeof envValue === "string" && (MODES as readonly string[]).includes(envValue)) return envValue as RouteMode
  const opt = opts?.route
  if (typeof opt === "string" && (MODES as readonly string[]).includes(opt)) return opt as RouteMode
  return "off"
}

export function resolveControllerConfig(
  opts: ControllerOptions | null | undefined,
  env: NodeJS.ProcessEnv | undefined = process.env,
): ControllerConfig {
  const escalateEnv = env?.OPENRELAY_ESCALATE
  const escalateEnabled = escalateEnv === "on" ? true : escalateEnv === "off" ? false : false
  const patterns = opts?.checkpoint?.patterns
  return {
    route: pickMode(opts, env),
    escalateEnabled,
    maxCycles: positiveInt(opts?.escalation?.maxCycles, 3),
    checkpointEnabled: opts?.checkpoint?.enabled === true,
    checkpointPatterns: patterns && patterns.length > 0 ? [...patterns] : [...DEFAULT_CHECKPOINT_PATTERNS],
    premiumModel: typeof opts?.premiumModel === "string" && opts.premiumModel ? opts.premiumModel : undefined,
    workhorseModel: typeof opts?.workhorseModel === "string" && opts.workhorseModel ? opts.workhorseModel : undefined,
  }
}
