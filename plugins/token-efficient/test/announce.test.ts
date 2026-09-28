import { describe, expect, test } from "bun:test"
import { relayToast } from "../lib/announce"
import { DEFAULT_FILTERING } from "../lib/filtering/config"

describe("relayToast", () => {
  test("launcher runtime includes channel and buildID", () => {
    const toast = relayToast(
      { channel: "daily", buildID: "2026-09-22" },
      { ...DEFAULT_FILTERING, enabled: true, previewSafe: true },
    )
    expect(toast.title).toBe("OpenRelay daily 2026-09-22")
    expect(toast.message).toBe("filtering on · conservative preview on")
    expect(toast.variant).toBe("info")
    expect(toast.duration).toBeGreaterThan(0)
  })

  test("manual registration has bare identity and off-state message", () => {
    const toast = relayToast(undefined, DEFAULT_FILTERING)
    expect(toast.title).toBe("OpenRelay")
    expect(toast.message).toBe("filtering off · conservative preview off")
  })

  test("partial runtime info degrades gracefully", () => {
    expect(relayToast({ buildID: "dev-abc123" }, DEFAULT_FILTERING).title).toBe("OpenRelay dev-abc123")
    expect(relayToast({ channel: "development" }, DEFAULT_FILTERING).title).toBe("OpenRelay development")
    expect(relayToast({}, DEFAULT_FILTERING).title).toBe("OpenRelay")
  })
})