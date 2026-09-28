#!/usr/bin/env bun
import { benchmarkRoot, repositoryRoot } from "../../lib/paths.mjs"
// Run once against the frozen v4 validation set. No plugin or model calls.
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import { candidates, buildV4 } from "./coverage-v4.mjs"
import { extractSignals } from "../../../plugins/token-efficient/lib/context/extract.ts"
import { DEFAULT_CONTEXT } from "../../../plugins/token-efficient/lib/context/config.ts"
import { probeEvidence, verdictFor } from "../../../plugins/token-efficient/lib/context/retrieve.ts"

const root = repositoryRoot
const spec = JSON.parse(fs.readFileSync(path.join(repositoryRoot, "benchmarks/stages/stage5/coverage-v4-validation.json")))
const archive = path.join(root, spec.source)
const manifest = JSON.parse(fs.readFileSync(path.join(repositoryRoot, "docs/stage5/coverage-source-snapshot.json")))
const sha = file => createHash("sha256").update(fs.readFileSync(file)).digest("hex")
if (sha(archive) !== manifest.archiveSha256) throw Error("frozen source archive digest changed")
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openrelay-v4-"))
const median = xs => [...xs].sort((a,b) => a-b)[Math.floor(xs.length / 2)]
try {
  const tar = spawnSync("tar", ["-xzf", archive, "-C", tmp], { encoding: "utf8" })
  if (tar.status !== 0) throw Error(tar.stderr || "archive extraction failed")
  for (const file of manifest.files) if (sha(path.join(tmp, file.path)) !== file.sha256) throw Error(`source file digest changed: ${file.path}`)
  const positive = spec.positive.map(t => {
    const source = fs.readFileSync(path.join(tmp, t.required.file), "utf8").split(/\r?\n/)
    const anchor = source.findIndex(line => line.includes(t.required.anchor)) + 1
    if (!anchor) throw Error(`ground truth anchor absent: ${t.id}`)
    const found = candidates(tmp, t.task)
    const nav = buildV4(tmp, t.task, "navigation")
    const evidence = buildV4(tmp, t.task, "evidence")
    const top = found.ranked.findIndex(c => c.file === t.required.file) + 1
    const covered = packet => packet.candidates.some(c => c.file === t.required.file &&
      (packet === nav ? c.from <= anchor && c.to >= anchor : c.lineNumbers.includes(anchor)))
    return { id: t.id, anchor, top, top2: top > 0 && top <= 2, top4: top > 0 && top <= 4,
      navigation: { built: nav.verdict === "build", covered: covered(nav), bytes: nav.bytes, prepMs: nav.prepMs },
      evidence: { built: evidence.verdict === "build", covered: covered(evidence), bytes: evidence.bytes, prepMs: evidence.prepMs },
      ranked: found.ranked.slice(0, 4).map(x => ({ file: x.file, symbol: x.best?.name, score: x.score })) }
  })
  const negative = spec.negative.map(t => {
    const signals = extractSignals(t.task)
    const v3 = signals.gitIntent ? { verdict: "skip", reason: "git-intent" } : verdictFor(probeEvidence(tmp, signals, DEFAULT_CONTEXT))
    const eligible = !signals.gitIntent && v3.verdict === "skip" && v3.reason === "redundant-candidates"
    const nav = eligible ? buildV4(tmp, t.task, "navigation") : null
    const evidence = eligible ? buildV4(tmp, t.task, "evidence") : null
    return { id: t.id, v3, eligible, navigationBuilt: nav?.verdict === "build", evidenceBuilt: evidence?.verdict === "build",
      navigationFiles: nav?.candidates.map(x => x.file), evidenceFiles: evidence?.candidates.map(x => x.file) }
  })
  const passFor = mode => {
    const vals = positive.map(x => x[mode])
    const builds = vals.filter(x => x.built).length
    const blocks = vals.filter(x => x.covered).length
    const falseBuilds = negative.filter(x => x[`${mode}Built`]).length
    const maxBytes = mode === "navigation" ? 1024 : 4096
    const sizeSafe = vals.every(x => x.bytes <= maxBytes && x.bytes <= 8192)
    const prepMs = median(vals.map(x => x.prepMs))
    return { builds, blocks, falseBuilds, medianPrepMs: prepMs, sizeSafe,
      pass: builds >= 8 && blocks >= 8 && falseBuilds <= 1 && prepMs < 250 && sizeSafe }
  }
  const summary = { top2: positive.filter(x => x.top2).length, top4: positive.filter(x => x.top4).length,
    navigation: passFor("navigation"), evidence: passFor("evidence") }
  summary.pass = summary.top2 >= 7 && summary.top4 >= 8 && (summary.navigation.pass || summary.evidence.pass)
  const result = { sourceSha256: manifest.archiveSha256, validationSha256: sha(path.join(repositoryRoot, "benchmarks/stages/stage5/coverage-v4-validation.json")),
    codeSha256: sha(path.join(repositoryRoot, "benchmarks/stages/stage5/coverage-v4.mjs")), positive, negative, summary }
  const output = path.join(repositoryRoot, "docs/stage5/coverage-v4-validation-results.json")
  if (fs.existsSync(output)) throw Error("validation result exists; do not overwrite frozen evaluation")
  fs.writeFileSync(output, JSON.stringify(result, null, 2) + "\n")
  console.log(JSON.stringify(summary, null, 2))
} finally { fs.rmSync(tmp, { recursive: true, force: true }) }
