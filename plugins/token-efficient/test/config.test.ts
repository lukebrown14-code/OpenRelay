import { describe, expect, test } from "bun:test"
import { DEFAULT_FILTERING, resolveFilteringConfig } from "../lib/filtering/config"
import type { FilteringConfig, FilteringOptions } from "../lib/filtering/config"

const DEFAULTS: FilteringConfig = {
  enabled: false,
  minBytes: 4096,
  ttlMs: 24 * 60 * 60 * 1000,
  maxBytesPerResult: 10 * 1024 * 1024,
  maxBytesPerSession: 50 * 1024 * 1024,
}

describe("resolveFilteringConfig", () => {
  test("DEFAULT_FILTERING matches the frozen defaults", () => {
    expect(DEFAULT_FILTERING).toEqual(DEFAULTS)
  })

  test("null/undefined options resolve to defaults", () => {
    expect(resolveFilteringConfig(null)).toEqual(DEFAULTS)
    expect(resolveFilteringConfig(undefined)).toEqual(DEFAULTS)
    expect(resolveFilteringConfig(undefined, undefined)).toEqual(DEFAULTS)
    expect(resolveFilteringConfig({}, undefined)).toEqual(DEFAULTS)
  })

  test("enabled flag passes through", () => {
    expect(resolveFilteringConfig({ enabled: true })).toEqual({ ...DEFAULTS, enabled: true })
    expect(resolveFilteringConfig({ enabled: false })).toEqual({ ...DEFAULTS, enabled: false })
    expect(resolveFilteringConfig({ enabled: undefined })).toEqual(DEFAULTS)
  })

  test('envValue "on" enables, everything else left at defaults', () => {
    expect(resolveFilteringConfig(null, "on")).toEqual({ ...DEFAULTS, enabled: true })
    expect(resolveFilteringConfig(undefined, "on")).toEqual({ ...DEFAULTS, enabled: true })
    expect(resolveFilteringConfig({ enabled: false }, "on")).toEqual({ ...DEFAULTS, enabled: true })
    expect(resolveFilteringConfig({ enabled: true }, "on")).toEqual({ ...DEFAULTS, enabled: true })
  })

  test('envValue "off" disables and wins over opts', () => {
    expect(resolveFilteringConfig(null, "off")).toEqual(DEFAULTS)
    expect(resolveFilteringConfig({ enabled: true }, "off")).toEqual(DEFAULTS)
    expect(resolveFilteringConfig({ enabled: true, minBytes: 10 }, "off")).toEqual({ ...DEFAULTS, minBytes: 10 })
  })

  test("garbage envValue is ignored and falls back to opts", () => {
    for (const garbage of ["", "yes", "no", "true", "false", "1", "0", "ON", "OFF", "on ", " on", "enabled"]) {
      expect(resolveFilteringConfig({ enabled: true }, garbage), JSON.stringify(garbage)).toEqual({
        ...DEFAULTS,
        enabled: true,
      })
      expect(resolveFilteringConfig({ enabled: false }, garbage), JSON.stringify(garbage)).toEqual(DEFAULTS)
      expect(resolveFilteringConfig(null, garbage), JSON.stringify(garbage)).toEqual(DEFAULTS)
    }
  })

  test("partial options merge with defaults", () => {
    expect(resolveFilteringConfig({ minBytes: 1024 })).toEqual({ ...DEFAULTS, minBytes: 1024 })
    expect(resolveFilteringConfig({ enabled: true, minBytes: 512 })).toEqual({
      ...DEFAULTS,
      enabled: true,
      minBytes: 512,
    })
  })

  test("partial retention options merge with defaults", () => {
    expect(resolveFilteringConfig({ retention: { ttlHours: 2 } })).toEqual({ ...DEFAULTS, ttlMs: 2 * 60 * 60 * 1000 })
    expect(resolveFilteringConfig({ retention: { maxBytesPerResult: 2048 } })).toEqual({
      ...DEFAULTS,
      maxBytesPerResult: 2048,
    })
    expect(resolveFilteringConfig({ retention: { maxBytesPerSession: 4096 } })).toEqual({
      ...DEFAULTS,
      maxBytesPerSession: 4096,
    })
    expect(resolveFilteringConfig({ retention: { ttlHours: 1, maxBytesPerResult: 100, maxBytesPerSession: 200 } })).toEqual({
      ...DEFAULTS,
      ttlMs: 60 * 60 * 1000,
      maxBytesPerResult: 100,
      maxBytesPerSession: 200,
    })
  })

  test("garbage/NaN option values fall back to defaults", () => {
    expect(resolveFilteringConfig({ minBytes: Number.NaN })).toEqual(DEFAULTS)
    expect(resolveFilteringConfig({ retention: { ttlHours: Number.NaN } })).toEqual(DEFAULTS)
    expect(resolveFilteringConfig({ retention: { maxBytesPerResult: Number.NaN } })).toEqual(DEFAULTS)
    expect(resolveFilteringConfig({ retention: { maxBytesPerSession: Number.NaN } })).toEqual(DEFAULTS)
  })

  test("env override combines with partial opts", () => {
    const opts: FilteringOptions = { enabled: false, minBytes: 8192, retention: { ttlHours: 4 } }
    expect(resolveFilteringConfig(opts, "on")).toEqual({
      ...DEFAULTS,
      enabled: true,
      minBytes: 8192,
      ttlMs: 4 * 60 * 60 * 1000,
    })
  })
})
