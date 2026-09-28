export interface ContextOptions {
  enabled?: boolean
  budget?: {
    maxTotalBytes?: number
    maxFileExcerptBytes?: number
    maxFiles?: number
    rgMaxFilesPerPattern?: number
    gitDiffBytes?: number
  }
}

export interface ContextConfig {
  enabled: boolean
  maxTotalBytes: number
  maxFileExcerptBytes: number
  maxFiles: number
  rgMaxFilesPerPattern: number
  gitDiffBytes: number
}

export const DEFAULT_CONTEXT: ContextConfig = {
  enabled: false,
  maxTotalBytes: 8192,
  maxFileExcerptBytes: 3072,
  maxFiles: 6,
  rgMaxFilesPerPattern: 8,
  gitDiffBytes: 2048,
}

function positiveInt(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback
}

export function resolveContextConfig(opts: ContextOptions | null | undefined, envValue?: string): ContextConfig {
  const enabled =
    envValue === "on" ? true : envValue === "off" ? false : typeof opts?.enabled === "boolean" ? opts.enabled : false
  const b = opts?.budget ?? {}
  return {
    enabled,
    maxTotalBytes: positiveInt(b.maxTotalBytes, DEFAULT_CONTEXT.maxTotalBytes),
    maxFileExcerptBytes: positiveInt(b.maxFileExcerptBytes, DEFAULT_CONTEXT.maxFileExcerptBytes),
    maxFiles: positiveInt(b.maxFiles, DEFAULT_CONTEXT.maxFiles),
    rgMaxFilesPerPattern: positiveInt(b.rgMaxFilesPerPattern, DEFAULT_CONTEXT.rgMaxFilesPerPattern),
    gitDiffBytes: positiveInt(b.gitDiffBytes, DEFAULT_CONTEXT.gitDiffBytes),
  }
}
