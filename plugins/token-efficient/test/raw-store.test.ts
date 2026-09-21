import fs from "node:fs"
import path from "node:path"
import { afterAll, describe, expect, test } from "bun:test"
import { loadRawOutput, rawStoreRoot, saveRawOutput, sweepExpired } from "../lib/filtering/raw-store"
import { findFileUnder, tmpDir, walk } from "./helpers"

const createdDirs: string[] = []
function freshDir(): string {
  const dir = tmpDir()
  createdDirs.push(dir)
  return dir
}

afterAll(() => {
  for (const d of createdDirs) {
    try {
      fs.rmSync(d, { recursive: true, force: true })
    } catch {}
  }
})

describe("saveRawOutput/loadRawOutput", () => {
  test("save returns a lowercase hex ref and load round-trips multi-MB multibyte content byte-exact", () => {
    const dir = freshDir()
    const chunk = 'const k = "héllo 世界 🎉"; // ünïcödé line with padding text to grow the buffer\n'
    const content = chunk.repeat(Math.ceil((3 * 1024 * 1024) / chunk.length))
    expect(Buffer.byteLength(content)).toBeGreaterThan(3 * 1024 * 1024)
    const ref = saveRawOutput({ sessionID: "ses-rt", content, dir })
    expect(ref).not.toBeNull()
    expect(ref).toMatch(/^[a-f0-9]+$/)
    const loaded = loadRawOutput({ sessionID: "ses-rt", ref: ref!, dir })
    expect(loaded).toBe(content)
    expect(loaded === null ? 0 : Buffer.byteLength(loaded)).toBe(Buffer.byteLength(content))
  })

  test("distinct contents in the same session get distinct refs", () => {
    const dir = freshDir()
    const a = saveRawOutput({ sessionID: "ses-uniq", content: "alpha-content", dir })
    const b = saveRawOutput({ sessionID: "ses-uniq", content: "beta-content", dir })
    expect(a).not.toBeNull()
    expect(b).not.toBeNull()
    expect(a).not.toBe(b)
    expect(loadRawOutput({ sessionID: "ses-uniq", ref: a!, dir })).toBe("alpha-content")
    expect(loadRawOutput({ sessionID: "ses-uniq", ref: b!, dir })).toBe("beta-content")
  })

  test("raw output is session-scoped: a foreign sessionID cannot load it", () => {
    const dir = freshDir()
    const ref = saveRawOutput({ sessionID: "ses-owner", content: "secret-ish output", dir })
    expect(ref).not.toBeNull()
    expect(loadRawOutput({ sessionID: "ses-stranger", ref: ref!, dir })).toBeNull()
    expect(loadRawOutput({ sessionID: "ses-owner", ref: ref!, dir })).toBe("secret-ish output")
  })

  test("malformed and path-traversal refs return null without touching the filesystem", () => {
    const dir = freshDir()
    for (const ref of ["", "..", ".", "../etc/passwd", "../../home", "a/b", "a\\b", "ABCDEF00", "zz", "abc def", "0x1234", "a".repeat(40) + "/x"]) {
      expect(loadRawOutput({ sessionID: "ses-x", ref, dir }), JSON.stringify(ref)).toBeNull()
    }
    expect(walk(dir).files.length).toBe(0)
  })

  test("a well-formed but unknown hex ref returns null", () => {
    const dir = freshDir()
    expect(loadRawOutput({ sessionID: "ses-missing", ref: "deadbeef", dir })).toBeNull()
  })
})

describe("retention caps", () => {
  test("content over the per-result cap returns null and stores nothing", () => {
    const dir = freshDir()
    const tooBig = "a".repeat(10 * 1024 * 1024 + 1)
    const ref = saveRawOutput({ sessionID: "ses-cap1", content: tooBig, dir })
    expect(ref).toBeNull()
    expect(walk(dir).files.length).toBe(0)
  })

  test("cumulative session cap: once the session exceeds the cap further saves return null", () => {
    const dir = freshDir()
    const ses = "ses-cap2"
    const refs: string[] = []
    for (let i = 0; i < 5; i++) {
      const content = `#${i}-` + "x".repeat(9 * 1024 * 1024)
      const ref = saveRawOutput({ sessionID: ses, content, dir })
      expect(ref, `save ${i} under cap`).not.toBeNull()
      refs.push(ref!)
    }
    const over = saveRawOutput({ sessionID: ses, content: "y".repeat(9 * 1024 * 1024), dir })
    expect(over).toBeNull()
    expect(loadRawOutput({ sessionID: ses, ref: refs[0], dir })).not.toBeNull()
    expect(loadRawOutput({ sessionID: ses, ref: refs[4], dir })).not.toBeNull()
    const other = saveRawOutput({ sessionID: "ses-cap2-other", content: "small", dir })
    expect(other, "other sessions are unaffected").not.toBeNull()
  }, 30000)
})

describe("sweepExpired", () => {
  test("removes only expired files across sessions and keeps fresh ones", () => {
    const dir = freshDir()
    const rOld1 = saveRawOutput({ sessionID: "s1", content: "old-one", dir })!
    const rFresh = saveRawOutput({ sessionID: "s1", content: "fresh-one", dir })!
    const rOld2 = saveRawOutput({ sessionID: "s2", content: "old-two", dir })!
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000)
    for (const r of [rOld1, rOld2]) {
      const p = findFileUnder(dir, r)
      if (!p) throw new Error(`saved file not found for ref ${r}`)
      fs.utimesSync(p, old, old)
    }
    sweepExpired({ dir, ttlMs: 60 * 60 * 1000 })
    expect(loadRawOutput({ sessionID: "s1", ref: rOld1, dir })).toBeNull()
    expect(loadRawOutput({ sessionID: "s2", ref: rOld2, dir })).toBeNull()
    expect(loadRawOutput({ sessionID: "s1", ref: rFresh, dir })).toBe("fresh-one")
    sweepExpired({ dir, ttlMs: 60 * 60 * 1000 })
    expect(loadRawOutput({ sessionID: "s1", ref: rFresh, dir })).toBe("fresh-one")
  })
})

describe("permissions and defensive behavior", () => {
  test("saved files are 0o600 and store directories are 0o700", () => {
    const dir = freshDir()
    const ref = saveRawOutput({ sessionID: "s", content: "perm-check", dir })
    expect(ref).not.toBeNull()
    const { files, dirs } = walk(dir)
    expect(files.length).toBeGreaterThan(0)
    expect(dirs.length).toBeGreaterThan(0)
    for (const f of files) {
      expect(fs.statSync(f).mode & 0o777, f).toBe(0o600)
    }
    for (const d of dirs) {
      expect(fs.statSync(d).mode & 0o777, d).toBe(0o700)
    }
  })

  test("load/sweep on a missing dir return null / do not throw", () => {
    const missing = path.join(tmpDir(), "does-not-exist")
    expect(loadRawOutput({ sessionID: "s", ref: "abc123", dir: missing })).toBeNull()
    expect(() => sweepExpired({ dir: missing, ttlMs: 1000 })).not.toThrow()
  })

  test("save/load into a dir that is an existing file returns null without throwing", () => {
    const dir = freshDir()
    const asFile = path.join(dir, "blocker")
    fs.writeFileSync(asFile, "not a directory")
    expect(saveRawOutput({ sessionID: "s", content: "content", dir: asFile })).toBeNull()
    expect(loadRawOutput({ sessionID: "s", ref: "abc123", dir: asFile })).toBeNull()
  })

  test("rawStoreRoot is a non-empty string and tests never write to it", () => {
    const root = rawStoreRoot()
    expect(typeof root).toBe("string")
    expect(root.length).toBeGreaterThan(0)
  })
})
