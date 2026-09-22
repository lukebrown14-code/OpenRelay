import { spawn } from "node:child_process"
import { checkConflicts, defaultRoot, launchSpec, readJSON } from "./relay-runtime.mjs"
import path from "node:path"

export async function launch(channel, args, { root = defaultRoot(), env = process.env, cwd = process.cwd() } = {}) {
  try {
    const installation = readJSON(path.join(root, "installation.json"))
    const spec = launchSpec({ channel, root, repo: installation.repo, env, cwd })
    if (args.includes("--relay-status")) {
      const { env, ...status } = spec
      console.log(JSON.stringify(status, null, 2))
      return
    }
    const commands = new Set(["run", "serve", "web", "auth", "models", "debug", "session", "stats", "export", "import", "mcp", "agent", "acp", "plugin", "github", "db", "upgrade", "uninstall", "attach"])
    if (args[0] && !args[0].startsWith("-") && !commands.has(args[0])) checkConflicts(path.resolve(cwd, args[0]), env)
    const dirIndex = args.indexOf("--dir")
    if (dirIndex >= 0 && args[dirIndex + 1]) checkConflicts(path.resolve(cwd, args[dirIndex + 1]), env)
    for (const arg of args) if (arg.startsWith("--dir=")) checkConflicts(path.resolve(cwd, arg.slice(6)), env)
    // Attaching to an already-running server would silently use that server's plugin.
    if (args[0] === "attach" || args.some(a => a === "--attach" || a.startsWith("--attach="))) {
      throw new Error("Channel launchers start their own OpenCode process; attach does not select its plugin")
    }
    console.error(`[OpenRelay ${channel}] ${spec.buildID}; filtering ${spec.filtering}; conservative preview ${spec.previewSafe ? "on" : "off"}`)
    const child = spawn(installation.opencode, args, { cwd, env: spec.env, stdio: "inherit" })
    for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, () => child.kill(signal))
    child.on("error", e => { console.error(e.message); process.exitCode = 1 })
    child.on("exit", (code, signal) => { process.exitCode = code ?? (signal === "SIGINT" ? 130 : 1) })
  } catch (e) { console.error(`OpenRelay: ${e.message}`); process.exitCode = 1 }
}

