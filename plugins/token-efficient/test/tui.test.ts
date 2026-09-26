import { describe, expect, test } from "bun:test"
import plugin, { relayLabel } from "../tui"

function mockApi() {
  const registrations: { order: number; slots: Record<string, Function> }[] = []
  return {
    api: {
      slots: {
        register: (r: { order: number; slots: Record<string, Function> }) => registrations.push(r),
      },
    },
    registrations,
  }
}

describe("openrelay.tui", () => {
  test("module shape: id and tui entrypoint", () => {
    expect(plugin.id).toBe("openrelay.indicator")
    expect(typeof plugin.tui).toBe("function")
  })

  test("registers exactly the sidebar_footer slot below the host's internal order 100", async () => {
    const { api, registrations } = mockApi()
    await plugin.tui(api as any, { channel: "development", buildID: "dev-test" } as any, undefined as any)
    expect(registrations).toHaveLength(1)
    expect(registrations[0].order).toBeLessThan(100)
    expect(Object.keys(registrations[0].slots)).toEqual(["sidebar_footer"])
  })

  test("missing options still register the slot (unlabeled badge)", async () => {
    const { api, registrations } = mockApi()
    await plugin.tui(api as any, undefined, undefined as any)
    expect(registrations).toHaveLength(1)
    expect(registrations[0].slots.sidebar_footer).toBeTypeOf("function")
  })

  test("relayLabel joins channel and buildID", () => {
    expect(relayLabel({ channel: "daily", buildID: "abc" })).toBe("daily abc")
    expect(relayLabel(undefined)).toBe("")
  })
})
