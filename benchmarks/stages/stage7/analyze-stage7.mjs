#!/usr/bin/env node
import { benchmarkRoot, repositoryRoot } from "../../lib/paths.mjs"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = benchmarkRoot
const manifest = JSON.parse(fs.readFileSync(path.join(repositoryRoot, "docs/stage7/pilot-manifest.json"), "utf8"))
const resultsDir = path.join(benchmarkRoot, "results", manifest.label)
const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length
const median = xs => { const s = [...xs].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2 }
const change = (a, b) => a > 0 ? (b / a - 1) * 100 : null
const fmt = n => n === null ? "unavailable" : n.toFixed(1)

export function summarize(records) {
  const main = records.filter(r => r.phase === "main" && r.completedAt)
  const cell = (fixture, policy) => main.filter(r => r.fixture === fixture && r.policy === policy)
  const stats = rs => ({ n: rs.length, passed: rs.filter(r => r.status === "pass").length,
    premium: rs.length && rs.every(r => r.usageComplete) ? mean(rs.map(r => r.tokens.premium)) : null,
    total: rs.length && rs.every(r => r.usageComplete) ? mean(rs.map(r => r.tokens.total)) : null,
    seconds: rs.length && rs.every(r => Number.isFinite(r.totalDurationMs)) ? median(rs.map(r => r.totalDurationMs / 1000)) : null,
    transitions: rs.filter(r => r.attempts.some(a => a.tier === "premium") && r.attempts.some(a => a.tier === "workhorse")).length })
  const comparisons = []
  for (const fixture of Object.keys(manifest.fixtures)) for (const policy of ["G", "P", "E1", "E2"]) {
    const rs = cell(fixture, policy)
    if (rs.length) comparisons.push({ fixture, policy, ...stats(rs) })
  }
  const paired = []
  for (const fixture of Object.keys(manifest.fixtures)) for (const candidate of ["E1", "E2"]) {
    const p = stats(cell(fixture, "P")), e = stats(cell(fixture, candidate))
    if (!p.n || !e.n) continue
    paired.push({ fixture, candidate, n: `${e.n}/${p.n}`, premiumChangePct: p.premium !== null && e.premium !== null ? change(p.premium, e.premium) : null,
      timeChangePct: p.seconds !== null && e.seconds !== null ? change(p.seconds, e.seconds) : null, success: `${e.passed}/${e.n} vs ${p.passed}/${p.n}` })
  }
  const totals = records.reduce((s, r) => { s.workflows++; s.tokens += r.tokens?.total ?? 0; s.premium += r.tokens?.premium ?? 0; return s }, { workflows: 0, tokens: 0, premium: 0 })
  return { records, comparisons, paired, totals, completeUsage: records.filter(r => r.usageComplete).length }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const records = fs.existsSync(resultsDir) ? fs.readdirSync(resultsDir).flatMap(name => {
    const file = path.join(resultsDir, name, "run.json")
    return fs.existsSync(file) ? [JSON.parse(fs.readFileSync(file, "utf8"))] : []
  }) : []
  const s = summarize(records)
  console.log("Stage 7: one workflow includes all turns and independent verification; coding input+cacheRead only")
  console.log("fixture\tpolicy\tn\tpass\tmeanPremium\tmeanTotal\tmedianSec\ttransitions")
  for (const c of s.comparisons) console.log(`${c.fixture}\t${c.policy}\t${c.n}\t${c.passed}/${c.n}\t${fmt(c.premium)}\t${fmt(c.total)}\t${fmt(c.seconds)}\t${c.transitions}`)
  console.log("\nfixture\tpolicy/P\tnPolicy/nP\tpremiumChange%\ttimeChange%\tquality")
  for (const c of s.paired) console.log(`${c.fixture}\t${c.candidate}/P\t${c.n}\t${fmt(c.premiumChangePct)}\t${fmt(c.timeChangePct)}\t${c.success}`)
  console.log(`\nAll consumed: ${s.totals.workflows} workflows, ${s.totals.tokens} coding tokens, ${s.totals.premium} premium coding tokens; complete usage ${s.completeUsage}/${s.records.length}`)
  console.log("Mechanics and A/A controls are excluded from main cell means. No confirmation interval is inferred from the pilot.")
}
