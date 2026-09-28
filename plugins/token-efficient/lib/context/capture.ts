import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
import type { Store } from "../store"

// Only the benchmark launcher opts in. Packet text may contain repository content.
export function captureBenchmarkPacket(
  store: Store,
  sessionID: string,
  packet: string,
): { hash: string; bytes: number; file: string } | undefined {
  if (!/^[A-Za-z0-9_-]+$/.test(sessionID)) return undefined
  try {
    const hash = createHash("sha256").update(packet).digest("hex")
    const dir = path.join(store.root, "context-packets", store.slug)
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
    const file = path.join(dir, `${sessionID}-${hash}.txt`)
    if (!fs.existsSync(file)) fs.writeFileSync(file, packet, { encoding: "utf8", mode: 0o600, flag: "wx" })
    const written = fs.readFileSync(file)
    if (written.toString("utf8") !== packet) return undefined
    return { hash, bytes: written.length, file }
  } catch {
    return undefined
  }
}
