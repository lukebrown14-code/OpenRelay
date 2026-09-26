// Benchmark-only system-context injector. Never installed with OpenRelay.
import fs from "node:fs"
import crypto from "node:crypto"

const sha = text => crypto.createHash("sha256").update(text).digest("hex")

export default async () => ({
  "experimental.chat.system.transform": async (input, output) => {
    try {
      const file = process.env.OPENRELAY_STAGE8_MAP_FILE
      const proof = process.env.OPENRELAY_STAGE8_MAP_PROOF
      if (!file || !Array.isArray(output?.system)) return
      const packet = fs.readFileSync(file, "utf8")
      if (!packet.startsWith("[REPOSITORY MAP —") || !packet.includes("[END REPOSITORY MAP]")) return
      output.system.push(packet)
      if (proof) fs.appendFileSync(proof, JSON.stringify({ sessionID: input?.sessionID ?? null, sha256: sha(packet) }) + "\n")
    } catch {}
  },
})
