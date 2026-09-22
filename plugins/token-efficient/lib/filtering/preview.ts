import fs from "node:fs"
import path from "node:path"

/** Remove only standalone successful TAP records. Everything else is retained verbatim.
 * This deliberately trades compression for preserving unknown diagnostics/artifacts.
 */
export function previewView(text: string, command: string, exit: number | null): string | null {
  // Shell syntax/quoting needs a real parser before safely classifying compounds.
  if (/[;&|<>`\n\r"']|\$\(/.test(command)) return null
  if (!/^\s*(?:(?:npm|pnpm|yarn)\s+(?:run\s+)?test\b|node\s+--test\b|bun\s+(?:run\s+)?test\b)/.test(command)) return null
  if (exit !== 0 && exit !== 1) return null
  const lines = text.split(/\r?\n/)
  // Only top-level, complete TAP streams in preview v1. Nested suites pass through.
  if (!lines.includes("TAP version 13") || lines.some(l => /^\s+(?:ok|not ok) \d+/.test(l))) return null
  const count = (key: string) => {
    const matches = lines.filter(l => new RegExp(`^# ${key} \\d+$`).test(l))
    return matches.length === 1 ? Number(matches[0].split(" ")[2]) : null
  }
  const tests = count("tests"), pass = count("pass"), fail = count("fail")
  const cancelled = count("cancelled"), skipped = count("skipped"), todo = count("todo")
  if ([tests, pass, fail, cancelled, skipped, todo].some(n => n === null)) return null
  if (tests! !== pass! + fail! + cancelled! + skipped! + todo! || cancelled !== 0) return null
  const records = lines.filter(l => /^(?:ok|not ok) \d+(?:\s|$)/.test(l))
  if (records.length !== tests || (exit === 0 ? fail !== 0 : fail === 0)) return null
  if (records.filter(l => /^not ok /.test(l) && !/# (?:TODO|SKIP)\b/i.test(l)).length !== fail) return null
  const retained: string[] = []
  let removed = 0
  for (let i = 0; i < lines.length; i++) {
    const subtest = /^# Subtest: /.test(lines[i]) && /^ok \d+ - /.test(lines[i + 1] ?? "")
    const recordIndex = subtest ? i + 1 : i
    const record = lines[recordIndex]
    if (/^ok \d+ - /.test(record) && !/# (?:SKIP|TODO)\b/i.test(record)) {
      let end = recordIndex + 1
      if (lines[end] === "  ---") {
        let j = end + 1
        while (j < lines.length && /^(?:  duration_ms: [\d.]+|  type: ['"]?test['"]?)$/.test(lines[j])) j++
        // Any unrecognized field stays in context along with its owning record.
        if (lines[j] !== "  ...") { retained.push(lines[i]); continue }
        end = j + 1
      }
      removed += end - i
      i = end - 1
    } else retained.push(lines[i])
  }
  if (!removed) return null
  return `command: ${command}\n[preview: ${removed} successful TAP detail lines omitted; all other lines retained]\n${retained.join("\n")}`
}

/** Never treat a host-truncated tail as the complete source. Bounded, no symlinks. */
export function previewSource(metadata: Record<string, unknown> | undefined, inline: string, max: number): string | null {
  const p = metadata?.outputPath
  if (p === undefined) {
    if (metadata?.truncated === true || /Full output saved to:|output (?:was )?truncated/i.test(inline)) return null
    return Buffer.byteLength(inline) <= max ? inline : null
  }
  if (typeof p !== "string" || !path.isAbsolute(p)) return null
  let fd: number | undefined
  try {
    fd = fs.openSync(p, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
    const st = fs.fstatSync(fd)
    if (!st.isFile() || st.size > max || st.size === 0) return null
    const data = Buffer.alloc(st.size + 1)
    let size = 0
    while (size < data.length) {
      const n = fs.readSync(fd, data, size, data.length - size, null)
      if (!n) break
      size += n
    }
    if (size !== st.size) return null
    return data.subarray(0, size).toString("utf8")
  } catch { return null }
  finally { if (fd !== undefined) fs.closeSync(fd) }
}
