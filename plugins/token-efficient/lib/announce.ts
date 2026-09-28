import type { FilteringConfig } from "./filtering/config"

export interface RelayRuntimeInfo {
  channel?: string
  buildID?: string
}

export interface RelayToast {
  title: string
  message: string
  variant: "info" | "success" | "warning" | "error"
  duration: number
}

export function relayToast(runtime: RelayRuntimeInfo | null | undefined, filtering: FilteringConfig): RelayToast {
  const identity = runtime?.channel ? `OpenRelay ${runtime.channel}` : "OpenRelay"
  return {
    title: runtime?.buildID ? `${identity} ${runtime.buildID}` : identity,
    message: `filtering ${filtering.enabled ? "on" : "off"} · conservative preview ${filtering.previewSafe ? "on" : "off"}`,
    variant: "info",
    duration: 10000,
  }
}