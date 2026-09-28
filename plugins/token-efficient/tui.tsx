/** @jsxImportSource @opentui/solid */
import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui"
import path from "node:path"

export type OpenRelayTuiOptions = {
  channel?: string
  buildID?: string
  filtering?: boolean
  previewSafe?: boolean
}

const HOME = process.env.HOME ?? ""

export function relayLabel(options: OpenRelayTuiOptions | null | undefined): string {
  const channel = typeof options?.channel === "string" ? options.channel.trim() : ""
  const buildID = typeof options?.buildID === "string" ? options.buildID.trim() : ""
  return [channel, buildID].filter(Boolean).join(" ")
}

function abbreviateHome(input: string): string {
  if (!HOME || !input) return input
  const relative = path.relative(HOME, input)
  if (relative === "") return "~"
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return input
  return `~${path.sep}${relative}`
}

type ViewProps = {
  api: TuiPluginApi
  channel: string
  buildID: string
  sessionID: string
}

const FALLBACK_PALETTE = { text: undefined, textMuted: undefined, success: undefined, primary: undefined }

function View(props: ViewProps) {
  const theme = () => {
    try {
      return props.api.theme.current ?? FALLBACK_PALETTE
    } catch {
      return FALLBACK_PALETTE
    }
  }
  const session = () => {
    try {
      return props.api.state.session.get(props.sessionID)
    } catch {
      return undefined
    }
  }
  const path_ = () => {
    try {
      const directory = session()?.directory || props.api.state.path.directory
      if (!directory) return { parent: "", name: "" }
      const branch = session()?.directory === props.api.state.path.directory ? props.api.state.vcs?.branch : undefined
      const list = abbreviateHome(branch ? `${directory}:${branch}` : directory).split("/")
      return { parent: list.slice(0, -1).join("/"), name: list.at(-1) ?? "" }
    } catch {
      return { parent: "", name: "" }
    }
  }
  const version = () => {
    try {
      return String(props.api.app.version ?? "").trim()
    } catch {
      return ""
    }
  }

  return (
    <box gap={1}>
      <text>
        <span style={{ fg: theme().textMuted }}>{path_().parent}/</span>
        <span style={{ fg: theme().text }}>{path_().name}</span>
      </text>
      <box border borderStyle="rounded" borderColor={theme().primary} paddingX={1} gap={0}>
        <text>
          <span style={{ fg: theme().success }}>● </span>
          <b>Open</b>
          <span style={{ fg: theme().primary }}>
            <b>Relay</b>
          </span>
          {props.channel ? <span style={{ fg: theme().textMuted }}> {props.channel}</span> : null}
        </text>
        <text fg={theme().textMuted}>
          <b>Open</b>
          <span style={{ fg: theme().text }}>
            <b>Code</b>
          </span>
          {version() ? <span style={{ fg: theme().text }}> {version()}</span> : null}
        </text>
        {props.buildID ? <text fg={theme().textMuted}>{props.buildID}</text> : null}
      </box>
    </box>
  )
}

const tui: TuiPlugin = async (api, options) => {
  try {
    const opts = (options ?? {}) as OpenRelayTuiOptions | undefined
    const channel = typeof opts?.channel === "string" ? opts.channel.trim() : ""
    const buildID = typeof opts?.buildID === "string" ? opts.buildID.trim() : ""
    api.slots.register({
      // sidebar_footer is single_winner: lowest order wins. The host ships an
      // internal indicator at order 100, so anything >= 100 never renders.
      order: 50,
      slots: {
        sidebar_footer(_ctx, slotProps) {
          return <View api={api} channel={channel} buildID={buildID} sessionID={slotProps.session_id} />
        },
      },
    })
  } catch (error) {
    console.error("[openrelay.tui] failed to register indicator", error)
  }
}

const plugin: TuiPluginModule & { id: string } = {
  id: "openrelay.indicator",
  tui,
}

export default plugin
