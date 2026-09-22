import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createHash } from "node:crypto"
import { pathToFileURL } from "node:url"

export const defaultRoot = () => path.join(os.homedir(), ".local/share/openrelay")
export const readJSON = file => JSON.parse(fs.readFileSync(file, "utf8"))
export const sha256 = value => createHash("sha256").update(value).digest("hex")
export const isRelay = entry => /(?:token-efficient|openrelay|relay-runtime)/i.test(String(Array.isArray(entry) ? entry[0] : entry))

export function pointRelease(root, name, release) {
  if (!["current", "previous"].includes(name)) throw new Error("Invalid release pointer")
  if (path.dirname(fs.realpathSync(release)) !== fs.realpathSync(path.join(root, "releases"))) throw new Error("Release must be inside releases/")
  const link = path.join(root, name), temp = `${link}.${process.pid}.tmp`
  const stat = fs.lstatSync(link, { throwIfNoEntry: false })
  if (stat && !stat.isSymbolicLink()) throw new Error(`${link} is not a release symlink`)
  fs.symlinkSync(path.relative(fs.realpathSync(root), fs.realpathSync(release)), temp)
  fs.renameSync(temp, link)
}

export function rollbackRelease(root) {
  const previous = fs.realpathSync(path.join(root, "previous")), current = fs.realpathSync(path.join(root, "current"))
  const manifest = readJSON(path.join(previous, "manifest.json"))
  if (sha256(fs.readFileSync(path.join(previous, "index.js"))) !== manifest.bundleHash) throw new Error("Previous bundle changed")
  pointRelease(root, "current", previous)
  pointRelease(root, "previous", current)
  return previous
}

// Shared by Bun launchers and the Node benchmark runner; never eval config.
export function parseJSONC(text) {
  let clean = "", quoted = false, escaped = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], next = text[i + 1]
    if (quoted) {
      clean += ch
      if (escaped) escaped = false
      else if (ch === "\\") escaped = true
      else if (ch === '"') quoted = false
    } else if (ch === '"') { quoted = true; clean += ch }
    else if (ch === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") i++
      clean += "\n"
    } else if (ch === "/" && next === "*") {
      i += 2
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++
      if (i >= text.length) throw new Error("Unterminated JSONC comment")
      i++; clean += " "
    } else clean += ch
  }
  let out = ""; quoted = false; escaped = false
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]
    if (quoted) {
      out += ch
      if (escaped) escaped = false
      else if (ch === "\\") escaped = true
      else if (ch === '"') quoted = false
    } else if (ch === '"') { quoted = true; out += ch }
    else if (ch === "," && /^\s*[}\]]/.test(clean.slice(i + 1))) continue
    else out += ch
  }
  return JSON.parse(out)
}

function config(file) {
  if (!fs.existsSync(file)) return {}
  return parseJSONC(fs.readFileSync(file, "utf8"))
}

export function checkConflicts(cwd, env, home = os.homedir()) {
  const dirs = new Set([path.join(env.XDG_CONFIG_HOME || path.join(home, ".config"), "opencode")])
  if (env.OPENCODE_CONFIG_DIR) dirs.add(path.resolve(env.OPENCODE_CONFIG_DIR))
  let p = path.resolve(cwd)
  const files = []
  while (true) {
    dirs.add(path.join(p, ".opencode"))
    files.push(path.join(p, "opencode.json"), path.join(p, "opencode.jsonc"))
    if (fs.existsSync(path.join(p, ".git")) || p === path.dirname(p)) break
    p = path.dirname(p)
  }
  dirs.add("/Library/Application Support/opencode")
  if (env.OPENCODE_CONFIG) files.push(path.resolve(env.OPENCODE_CONFIG))
  for (const dir of dirs) {
    files.push(path.join(dir, "opencode.json"), path.join(dir, "opencode.jsonc"))
    for (const plural of ["plugin", "plugins"]) {
      const pd = path.join(dir, plural)
      if (!fs.existsSync(pd)) continue
      for (const name of fs.readdirSync(pd)) {
        if (isRelay(name)) throw new Error(`Conflicting OpenRelay installation: ${path.join(pd, name)}`)
        // Also catch a renamed loader that imports OpenRelay.
        if (/\.(?:ts|js)$/.test(name) && isRelay(fs.readFileSync(path.join(pd, name), "utf8"))) {
          throw new Error(`Possible OpenRelay loader: ${path.join(pd, name)}; remove its registration before using a channel`)
        }
      }
    }
  }
  for (const file of files) {
    if ((config(file).plugin ?? []).some(isRelay)) throw new Error(`Conflicting OpenRelay registration in ${file}`)
  }
  const inline = env.OPENCODE_CONFIG_CONTENT ? JSON.parse(env.OPENCODE_CONFIG_CONTENT) : {}
  if ((inline.plugin ?? []).some(isRelay)) throw new Error("Conflicting OpenRelay registration in OPENCODE_CONFIG_CONTENT")
  return inline
}

export function launchSpec({ channel, root = defaultRoot(), repo, dataDir, env = process.env, cwd = process.cwd(), check = true }) {
  const inline = check ? checkConflicts(cwd, env) : JSON.parse(env.OPENCODE_CONFIG_CONTENT || "{}")
  let entry, buildID
  if (channel === "daily") {
    const release = fs.realpathSync(path.join(root, "current"))
    if (path.dirname(release) !== fs.realpathSync(path.join(root, "releases"))) throw new Error("Release pointer is outside releases/")
    const manifest = readJSON(path.join(release, "manifest.json"))
    entry = path.join(release, "index.js")
    if (sha256(fs.readFileSync(entry)) !== manifest.bundleHash) throw new Error("Release bundle has changed; refusing to launch")
    buildID = manifest.buildID
  } else {
    repo ??= readJSON(path.join(root, "installation.json")).repo
    entry = path.join(repo, "plugins/token-efficient/index.ts")
    if (!fs.existsSync(entry)) throw new Error(`Development entry missing: ${entry}`)
    buildID = `dev-${sourceHash(repo).slice(0, 12)}`
  }
  const dir = path.resolve(dataDir || path.join(root, "data", channel))
  const filtering = env.OPENRELAY_FILTERING ?? "on"
  if (!["on", "off"].includes(filtering)) throw new Error("OPENRELAY_FILTERING must be on or off")
  const previewSafe = env.OPENRELAY_PREVIEW_SAFE !== "off"
  if (channel === "daily" && !previewSafe) throw new Error("Legacy filtering is available only in the development channel")
  const options = { telemetry: { enabled: true, dir }, filtering: { enabled: filtering === "on", previewSafe }, runtime: { channel, buildID } }
  return { channel, buildID, entry, dataDir: dir, filtering, previewSafe,
    env: { ...env, PWD: cwd, OPENRELAY_FILTERING: filtering, OPENRELAY_CANARY: "off",
      ...(channel === "daily" ? { OPENRELAY_DISCIPLINE: "off" } : {}),
      OPENCODE_CONFIG_CONTENT: JSON.stringify({ ...inline, plugin: [...(inline.plugin ?? []), [pathToFileURL(entry).href, options]] }) } }
}

export function sourceHash(repo) {
  const hash = createHash("sha256")
  function visit(dir) {
    for (const name of fs.readdirSync(dir).sort()) {
      const file = path.join(dir, name), st = fs.lstatSync(file)
      if (st.isSymbolicLink()) throw new Error(`Source symlink not allowed in release: ${file}`)
      if (st.isDirectory()) visit(file)
      else { hash.update(path.relative(repo, file)); hash.update(fs.readFileSync(file)) }
    }
  }
  visit(path.join(repo, "plugins/token-efficient"))
  for (const name of ["package.json", "bun.lock", "package-lock.json"]) {
    if (fs.existsSync(path.join(repo, name))) hash.update(fs.readFileSync(path.join(repo, name)))
  }
  return hash.digest("hex")
}

