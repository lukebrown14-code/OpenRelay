import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createJiti } from "/Users/luke/.pi/agent/install/releases/0.87.1/node_modules/jiti/lib/jiti.mjs"

const root = fs.mkdtempSync(path.join(os.tmpdir(), "openrelay-pi-confine-"))
process.env.OPENRELAY_PI_SANDBOX_PROFILE = path.join(root, "profile with spaces.sb")
const handlers = new Map()
try {
  fs.mkdirSync(path.join(root, "src"), { recursive: true })
  fs.writeFileSync(path.join(root, "src", "ok.ts"), "export {}\n")
  fs.symlinkSync(os.homedir(), path.join(root, "outside"), "dir")
  const jiti = createJiti(path.dirname(fileURLToPath(import.meta.url)))
  const { default: load } = await jiti.import("../../benchmarks/pi/confinement.ts")
  load({ on(name, handler) { handlers.set(name, handler) } })
  const invoke = (toolName, value) => handlers.get("tool_call")({ toolName, input: toolName === "bash" ? { command: value } : { path: value } }, { cwd: root })
  if (invoke("read", "src/ok.ts") !== undefined) throw new Error("workspace file was blocked")
  for (const unsafe of ["../verify.js", "~/.ssh/id_rsa", "outside/.ssh/id_rsa", path.dirname(root)]) {
    if (invoke("read", unsafe)?.block !== true) throw new Error(`escaped path was allowed: ${unsafe}`)
  }
  const original = "echo 'fixture; output'"
  const event = { toolName: "bash", input: { command: original } }
  handlers.get("tool_call")(event, { cwd: root })
  if (!event.input.command.includes("sandbox-exec") || !event.input.command.endsWith("'")) throw new Error("bash was not wrapped safely")
  console.log(JSON.stringify({ status: "PASS", workspaceReadAllowed: true, traversalBlocked: true, tildeBlocked: true, symlinkEscapeBlocked: true, bashWrapped: true }))
} finally {
  delete process.env.OPENRELAY_PI_SANDBOX_PROFILE
  fs.rmSync(root, { recursive: true, force: true })
}
