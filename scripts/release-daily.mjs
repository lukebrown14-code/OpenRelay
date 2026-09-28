#!/usr/bin/env bun
// Build and atomically activate the daily OpenRelay release from this checkout.
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import { pathToFileURL } from "node:url"
import { defaultRoot, launchSpec, pointRelease, readJSON, sha256, sourceHash } from "./relay-runtime.mjs"

const repo = path.resolve(import.meta.dirname, "..")
const root = defaultRoot()
const releases = path.join(root, "releases")
const oldCurrent = fs.realpathSync(path.join(root, "current"))
const timestamp = new Date().toISOString().replaceAll(":", "-").replace(/\.\d{3}Z$/, "Z")
const sourceDigest = sourceHash(repo)
const buildID = `${timestamp}-${sourceDigest.slice(0, 12)}`
const finalRelease = path.join(releases, buildID)
if (fs.existsSync(finalRelease)) throw Error(`Release already exists: ${finalRelease}`)
const staging = fs.mkdtempSync(path.join(releases, `.staging-${buildID}-`))
const run = (cmd, args, cwd = repo) => {
  const result = spawnSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] })
  if (result.status !== 0) throw Error(`${cmd} ${args.join(" ")} failed with status ${result.status}`)
  return result.stdout.trim()
}
const atomicCopy = (from, to) => {
  const temp = `${to}.${process.pid}.tmp`
  fs.copyFileSync(from, temp)
  fs.renameSync(temp, to)
}
try {
  fs.mkdirSync(path.join(staging, "source"), { recursive: true })
  fs.cpSync(path.join(repo, "plugins/token-efficient"), path.join(staging, "source"), { recursive: true })
  fs.copyFileSync(path.join(repo, "plugins/token-efficient/tui.tsx"), path.join(staging, "tui.tsx"))
  for (const name of ["package.json", "package-lock.json", "bun.lock"]) fs.copyFileSync(path.join(repo, name), path.join(staging, name))
  run("bun", ["build", "plugins/token-efficient/index.ts", "--target=bun", `--outfile=${path.join(staging, "index.js")}`])

  // Validate the bundle and the TUI entry before changing either release pointer.
  const imported = await import(pathToFileURL(path.join(staging, "index.js")).href)
  if (typeof imported.default !== "function") throw Error("Bundled plugin has no default plugin export")
  run("bun", ["build", "plugins/token-efficient/tui.tsx", "--target=bun", "--packages=external", `--outfile=${path.join(staging, "tui-check.js")}`])
  fs.unlinkSync(path.join(staging, "tui-check.js"))
  if (!fs.existsSync(path.join(staging, "tui.tsx"))) throw Error("TUI entry is missing from release")

  const packageLock = readJSON(path.join(staging, "package-lock.json"))
  const revision = run("git", ["rev-parse", "HEAD"])
  const dirtyDiff = spawnSync("git", ["diff", "--binary", "HEAD"], { cwd: repo, encoding: "buffer", maxBuffer: 64 * 1024 * 1024 })
  if (dirtyDiff.status !== 0) throw Error("Unable to record working-tree diff hash")
  const manifest = {
    buildID, createdAt: new Date().toISOString(), preview: true, contextDefault: "on", sourceHash: sourceDigest,
    revision, dirtyDiffHash: createHash("sha256").update(dirtyDiff.stdout).digest("hex"),
    bundleHash: sha256(fs.readFileSync(path.join(staging, "index.js"))),
    dependencyVersions: Object.fromEntries(Object.entries(packageLock.packages ?? {})
      .filter(([name]) => name.startsWith("node_modules/")).map(([name, value]) => [name, value.version])),
    checks: { pluginBundleImport: true, tuiBundleBuild: true, dailyContextDefault: true, contextOffOverride: true },
  }
  fs.writeFileSync(path.join(staging, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 })

  const smokeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "openrelay-release-smoke-"))
  try {
    const smokeReleases = path.join(smokeRoot, "releases")
    fs.mkdirSync(smokeReleases)
    const smokeRelease = path.join(smokeReleases, buildID)
    fs.cpSync(staging, smokeRelease, { recursive: true })
    fs.symlinkSync(path.relative(smokeRoot, smokeRelease), path.join(smokeRoot, "current"))
    const spec = launchSpec({ channel: "daily", root: smokeRoot, check: false, env: {} })
    if (spec.context !== "on" || !spec.tui || fs.realpathSync(spec.tui.entry) !== fs.realpathSync(path.join(smokeRelease, "tui.tsx"))) {
      throw Error("Daily launch smoke did not enable context and register the released TUI")
    }
    const override = launchSpec({ channel: "daily", root: smokeRoot, check: false, env: { OPENRELAY_CONTEXT: "off" } })
    if (override.context !== "off") throw Error("OPENRELAY_CONTEXT=off did not override the daily default")
  } finally { fs.rmSync(smokeRoot, { recursive: true, force: true }) }

  fs.renameSync(staging, finalRelease)

  const runtimeDir = path.join(root, "runtime")
  for (const name of ["relay-runtime.mjs", "relay-launcher.mjs"]) atomicCopy(path.join(repo, "scripts", name), path.join(runtimeDir, name))
  pointRelease(root, "previous", oldCurrent)
  pointRelease(root, "current", finalRelease)
  console.log(JSON.stringify({ buildID, release: finalRelease, previous: oldCurrent, bundleHash: manifest.bundleHash,
    sourceHash: sourceDigest, contextDefault: "on", tui: path.join(finalRelease, "tui.tsx") }, null, 2))
} catch (error) {
  fs.rmSync(staging, { recursive: true, force: true })
  throw error
}
