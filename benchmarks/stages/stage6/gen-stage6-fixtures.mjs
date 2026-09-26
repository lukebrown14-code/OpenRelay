import { benchmarkRoot, repositoryRoot } from "../../lib/paths.mjs"
// Stage 6E fixture generator (docs/stage6/pilot-protocol.md). Zero model calls.
//   bun benchmarks/stages/stage6/gen-stage6-fixtures.mjs
// Emits fixtures 22–26 (workspace, frozen sender transcripts in verified export
// format, handoff renders built by the 6C builder, verify.js, ground truth,
// reference solutions) under benchmarks/fixtures/ and benchmarks/solutions/.
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = benchmarkRoot
const FX = path.join(benchmarkRoot, "fixtures")
const SOL = path.join(benchmarkRoot, "solutions")
const __WORKSPACE__ = "__WORKSPACE__"
const NOW = 1790211840000

// ---- handoff building via the real 6C stack ---------------------------------
async function buildRender(caseID, fields, worktreeFiles = {}) {
  const { buildHandoff } = await import("../../../plugins/token-efficient/lib/handoff/builder.ts")
  const tmp = fs.mkdtempSync(path.join(os_tmpdir(), "s6e-gen-"))
  for (const [rel, content] of Object.entries(worktreeFiles)) {
    fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true })
    fs.writeFileSync(path.join(tmp, rel), content)
  }
  const built = buildHandoff(tmp, {
    taskID: `task-${caseID}`, workflowID: `wf-${caseID}`, direction: "workhorse->workhorse",
    sourceSession: "ses_sender", ...fields,
  })
  if (!built.ok) throw new Error(`handoff build failed for ${caseID}: ${built.errors?.join("; ")}`)
  const { ProjectStore } = await import("../../../plugins/token-efficient/lib/memory/store.ts")
  const store = new ProjectStore(tmp)
  const text = store.renderHandoff(built.handoff)
  fs.rmSync(tmp, { recursive: true, force: true })
  return { handoff: built.handoff, render: text }
}
import os from "node:os"
import { createHash } from "node:crypto"
const os_tmpdir = os.tmpdir

function transcript(sessionTitle, directory, msgs) {
  const sid = "ses_sender_synthetic_0001"
  let t = NOW
  const messages = msgs.map(([role, text]) => {
    t += 60000
    const id = `msg_${role}_${t}`
    return {
      info: {
        role,
        time: { created: t },
        agent: "build",
        ...(role === "user"
          ? { model: { providerID: "zai-coding-plan", modelID: "glm-5.3" } }
          : { parentID: "msg_parent", mode: "build", path: { cwd: directory, root: "/" }, cost: 0, tokens: { total: 500, input: 450, output: 50, reasoning: 0, cache: { write: 0, read: 0 } }, modelID: "glm-5.3", providerID: "zai-coding-plan" }),
        id,
        sessionID: sid,
      },
      parts: [{ type: "text", text, id: `prt_${t}`, sessionID: sid, messageID: id }],
    }
  })
  return {
    info: { id: sid, slug: "sender-state", projectID: "global", directory, path: directory.replace(/^\//, ""), title: sessionTitle, version: "1.18.32", cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }, time: { created: NOW, updated: t } },
    messages,
  }
}

const read = (rel) => fs.readFileSync(path.join(__dirname, rel), "utf8")

// ---- fixture definitions -----------------------------------------------------

const fixtures = []

fixtures.push({
  id: "22-plan-config-compat",
  meta: { name: "22-plan-config-compat", class: "stage6", category: "stage6", verifyTimeoutMs: 30000 },
  final: "Continue from where we left off: implement the accepted plan now. Run node verify.js when you are done.",
  worktree: {
    "windmill.config.json": JSON.stringify({ timezone: "UTC", panels: ["cpu", "mem"], refreshSeconds: 30 }, null, 2) + "\n",
    "PLAN.md": "Accepted plan: add config hot-reload.\n\n1. src/config/loader.js: export reloadConfig(path?) that re-reads the config file and returns the merged config (defaults still apply).\n2. src/render/panel.js: export refresh() that reloads and returns the current config (panels included).\n\nMANDATORY CONSTRAINT: formatV1 output must stay byte-identical — the trailing #v1 line is load-bearing (external dashboards grep for it). Do not 'clean it up'.\n\nAcceptance: node verify.js exits 0.\n",
    "src/config/loader.js": `import fs from "node:fs"\n\nconst DEFAULTS = { timezone: "UTC", panels: [], refreshSeconds: 60 }\n\nexport function loadConfig(path = "windmill.config.json") {\n  let user = {}\n  try {\n    user = JSON.parse(fs.readFileSync(path, "utf8"))\n  } catch {}\n  return { ...DEFAULTS, ...user }\n}\n\nexport function formatV1(cfg) {\n  // v1 wire format consumed by external dashboards. The trailing "#v1" line is\n  // load-bearing: monitoring greps for it. Do not change this output.\n  const keys = Object.keys(cfg).sort()\n  return keys.map((k) => \`\${k}=\${JSON.stringify(cfg[k])}\`).join("\\n") + "\\n#v1\\n"\n}\n`,
    "src/render/panel.js": `import { loadConfig } from "../config/loader.js"\n\nlet current = null\n\nexport function init() {\n  current = loadConfig()\n  return current\n}\n\nexport function currentPanels() {\n  if (!current) init()\n  return current.panels\n}\n`,
    "src/legacy/exporter.js": `// DEPRECATED legacy exporter. Kept only so old dashboards keep working during\n// migration. New code should NOT route through here.\nexport function exportV1(cfg) {\n  return Object.entries(cfg).map(([k, v]) => \`\${k}=\${v}\`).join(";")\n}\n`,
  },
  transcriptTitle: "config hot-reload planning",
  transcript: [
    ["user", "We need hot config reload for the windmill dashboard: when windmill.config.json changes, panels should pick it up without a restart. Please explore and propose a plan."],
    ["assistant", "Explored the tree. Relevant files: src/config/loader.js (loadConfig + formatV1) and src/render/panel.js (init/currentPanels). src/legacy/exporter.js is deprecated and should stay untouched. One trap found: formatV1's trailing #v1 line is load-bearing — external dashboards grep for it, so any refactor must keep the output byte-identical. Proposed plan: add reloadConfig(path?) to loader.js (re-read + merge over DEFAULTS) and refresh() to panel.js that reloads and returns the new config. Acceptance: node verify.js exits 0."],
    ["user", "Plan accepted as proposed, including keeping the #v1 line exactly. Write that into PLAN.md and stop there — implementation happens next session."],
    ["assistant", "PLAN.md written with the accepted steps and the #v1 compatibility constraint marked mandatory. Ready for implementation."],
  ],
  handoff: {
    objective: "Implement the accepted config hot-reload plan (see PLAN.md): reloadConfig in src/config/loader.js, refresh() in src/render/panel.js.",
    constraints: [{ text: "formatV1 output must remain byte-identical, including the trailing #v1 line (dashboards grep for it)", provenance: "user-approved" }],
    decisions: [{ text: "src/legacy/exporter.js stays untouched (deprecated)", provenance: "user-approved" }],
    acceptanceCriteria: [{ text: "node verify.js exits 0", provenance: "user-approved" }],
    relevantFiles: ["src/config/loader.js", "src/render/panel.js"],
    nextSteps: ["implement reloadConfig()", "implement panel.refresh() wiring"],
  },
  verify: `import fs from "node:fs"\nimport { loadConfig, formatV1 } from "./src/config/loader.js"\nimport * as panel from "./src/render/panel.js"\nconst check = (c, m) => { if (!c) { console.log("FAIL: " + m); process.exit(1) } }\n\nfs.writeFileSync("windmill.config.json", JSON.stringify({ panels: ["cpu"], refreshSeconds: 5 }))\ncheck(panel.currentPanels().join() === "cpu", "init/currentPanels broken")\n\nfs.writeFileSync("windmill.config.json", JSON.stringify({ panels: ["cpu", "net"], refreshSeconds: 7 }))\ncheck(typeof panel.refresh === "function", "panel.refresh() missing")\nconst refreshed = panel.refresh()\ncheck(refreshed && refreshed.panels && refreshed.panels.join() === "cpu,net", "refresh() did not pick up new panels")\ncheck(refreshed.refreshSeconds === 7, "refresh() lost user values (defaults merge broken)")\n\ncheck(typeof loadConfig === "function" && loadConfig().timezone === "UTC", "loadConfig defaults broken")\n\nconst v1 = formatV1(refreshed)\ncheck(v1.endsWith("#v1\\n"), "COMPAT: formatV1 lost the trailing #v1 line")\ncheck(v1.includes('"refreshSeconds":7'), "formatV1 lost values")\ncheck(formatV1({ b: 2, a: 1 }) === 'a=1\\nb=2\\n#v1\\n', "formatV1 format drifted")\nconsole.log("PASS: plan-config-compat")\n`,
  groundTruth: { required: ["src/config/loader.js", "src/render/panel.js"], optional: [], mandatoryFacts: ["#v1 line preserved", "both modules touched", "defaults merge kept"] },
  solution: {
    "src/config/loader.js": `import fs from "node:fs"\n\nconst DEFAULTS = { timezone: "UTC", panels: [], refreshSeconds: 60 }\n\nexport function loadConfig(path = "windmill.config.json") {\n  let user = {}\n  try {\n    user = JSON.parse(fs.readFileSync(path, "utf8"))\n  } catch {}\n  return { ...DEFAULTS, ...user }\n}\n\nexport function reloadConfig(path = "windmill.config.json") {\n  return loadConfig(path)\n}\n\nexport function formatV1(cfg) {\n  const keys = Object.keys(cfg).sort()\n  return keys.map((k) => \`\${k}=\${JSON.stringify(cfg[k])}\`).join("\\n") + "\\n#v1\\n"\n}\n`,
    "src/render/panel.js": `import { loadConfig, reloadConfig } from "../config/loader.js"\n\nlet current = null\n\nexport function init() {\n  current = loadConfig()\n  return current\n}\n\nexport function currentPanels() {\n  if (!current) init()\n  return current.panels\n}\n\nexport function refresh() {\n  current = reloadConfig()\n  return current\n}\n`,
    "src/legacy/exporter.js": `// DEPRECATED legacy exporter. Kept only so old dashboards keep working during\n// migration. New code should NOT route through here.\nexport function exportV1(cfg) {\n  return Object.entries(cfg).map(([k, v]) => \`\${k}=\${v}\`).join(";")\n}\n`,
  },
})

fixtures.push({
  id: "23-failed-pipeline-diag",
  meta: { name: "23-failed-pipeline-diag", class: "stage6", category: "stage6", verifyTimeoutMs: 30000 },
  final: "Continue from where we left off: apply the correct fix (not the rejected approach), then run node verify.js.",
  worktree: {
    "PROGRESS.md": "Task: fix the totals drift in the CSV pipeline.\n\nAttempt 1 (REJECTED): lowercased category keys in src/pipeline/aggregate.js. verify.js still failed AND case-sensitive grouping would drift. Reverted; do not reuse.\n\nActual finding (unconfirmed): src/pipeline/parse.js returns qty as a raw string, so totals concatenates instead of adding.\n\nStatus: fix NOT applied. Exact current failure: FAIL: parseRows must coerce qty to a number\n",
    "src/pipeline/parse.js": `export function parseRows(csv) {\n  return csv\n    .trim()\n    .split("\\n")\n    .slice(1)\n    .map((line) => {\n      const [category, qty] = line.split(",")\n      return { category: category.trim(), qty: qty.trim() }\n    })\n}\n`,
    "src/pipeline/aggregate.js": `export function totalsByCategory(rows) {\n  // NOTE: grouping is intentionally case-sensitive ("Fruit" != "fruit").\n  // REJECTED APPROACH — do not reuse: lowercasing keys here was tried and made\n  // categories drift; it also did not fix the totals bug. See PROGRESS.md.\n  const totals = {}\n  for (const row of rows) {\n    const key = row.category\n    totals[key] = (totals[key] ?? 0) + row.qty\n  }\n  return totals\n}\n`,
    "src/pipeline/report.js": `import { parseRows } from "./parse.js"\nimport { totalsByCategory } from "./aggregate.js"\n\nexport function report(csv) {\n  return totalsByCategory(parseRows(csv))\n}\n`,
    "data/sample.csv": "category,qty\nFruit,3\nFruit,4\nfruit,5\nTools,2\n",
  },
  transcriptTitle: "pipeline totals debugging",
  transcript: [
    ["user", "The nightly totals are wrong: data/sample.csv should show Fruit=7, fruit=5, Tools=2 but report() returns garbage. Please debug src/pipeline/."],
    ["assistant", "I suspected a case-sensitivity issue in aggregate.js and tried lowercasing the category keys. verify.js STILL failed — and lowercasing would merge Fruit/fruit which the audit forbids. Reverted that change. Re-reading parse.js: parseRows returns qty as a raw string, so totalsByCategory concatenates instead of adding. That matches the exact failure: FAIL: parseRows must coerce qty to a number. Correct fix: coerce qty with Number() in parse.js. I have NOT applied it yet."],
    ["user", "Good catch. Record the rejected approach in PROGRESS.md and stop — the fix gets applied in the next session."],
    ["assistant", "PROGRESS.md updated: rejected approach (lowercasing) marked do-not-reuse, actual cause and exact failure recorded, fix left unapplied. Ready."],
  ],
  handoff: {
    objective: "Fix the CSV pipeline totals drift: coerce qty to a number in src/pipeline/parse.js (parseRows).",
    constraints: [
      { text: "Do NOT lowercase category keys — grouping is case-sensitive; that approach was tried and rejected", provenance: "tool-observed" },
      { text: "Keep the exact failure in mind: FAIL: parseRows must coerce qty to a number", provenance: "tool-observed" },
    ],
    decisions: [{ text: "aggregate.js grouping stays case-sensitive and unchanged", provenance: "user-approved" }],
    acceptanceCriteria: [{ text: "node verify.js exits 0 (Fruit=7, fruit=5, Tools=2; qty is numeric)", provenance: "tool-observed" }],
    currentWork: "Root cause identified (string qty in parse.js); fix not yet applied.",
    nextSteps: ["apply Number() coercion in parseRows", "run node verify.js"],
  },
  verify: `import { parseRows } from "./src/pipeline/parse.js"\nimport { totalsByCategory } from "./src/pipeline/aggregate.js"\nconst check = (c, m) => { if (!c) { console.log("FAIL: " + m); process.exit(1) } }\n\nconst rows = parseRows("category,qty\\nFruit,3\\nFruit,4\\nfruit,5\\nTools,2\\n")\ncheck(typeof rows[0].qty === "number", "parseRows must coerce qty to a number")\nconst t = totalsByCategory(rows)\ncheck(t.Fruit === 7, "totals drifted: expected Fruit=7, got " + t.Fruit)\ncheck(t.fruit === 5, "case-sensitive grouping lost (rejected approach reused)")\ncheck(t.Tools === 2, "totals drifted: expected Tools=2, got " + t.Tools)\nconsole.log("PASS: failed-pipeline-diag")\n`,
  groundTruth: { required: ["src/pipeline/parse.js"], optional: ["src/pipeline/aggregate.js"], mandatoryFacts: ["exact failure quoted", "rejected approach not reused", "case-sensitive grouping intact"] },
  solution: {
    "src/pipeline/parse.js": `export function parseRows(csv) {\n  return csv\n    .trim()\n    .split("\\n")\n    .slice(1)\n    .map((line) => {\n      const [category, qty] = line.split(",")\n      return { category: category.trim(), qty: Number(qty.trim()) }\n    })\n}\n`,
    "src/pipeline/aggregate.js": `export function totalsByCategory(rows) {\n  const totals = {}\n  for (const row of rows) {\n    const key = row.category\n    totals[key] = (totals[key] ?? 0) + row.qty\n  }\n  return totals\n}\n`,
    "src/pipeline/report.js": `import { parseRows } from "./parse.js"\nimport { totalsByCategory } from "./aggregate.js"\n\nexport function report(csv) {\n  return totalsByCategory(parseRows(csv))\n}\n`,
    "data/sample.csv": "category,qty\nFruit,3\nFruit,4\nfruit,5\nTools,2\n",
  },
})

// ---- fixture 24: memory follow-up with one useful + one stale note -----------
const SEARCH_INDEX = `function tokenize(text) {\n  return String(text).toLowerCase().match(/[a-z0-9]+/g) ?? []\n}\n\nexport function buildIndex(docs) {\n  // Tokens are lowercased at INDEX time — the query side must lowercase too.\n  const byToken = new Map()\n  const entries = []\n  for (const [id, text] of Object.entries(docs)) {\n    const tokens = tokenize(text)\n    entries.push({ id, tokens })\n    for (const tok of new Set(tokens)) {\n      if (!byToken.has(tok)) byToken.set(tok, new Set())\n      byToken.get(tok).add(id)\n    }\n  }\n  return { byToken, entries }\n}\n\nexport function search(index, query) {\n  const tokens = tokenize(query)\n  if (tokens.length === 0) return []\n  let hits = null\n  for (const tok of tokens) {\n    const set = index.byToken.get(tok) ?? new Set()\n    hits = hits === null ? new Set(set) : new Set([...hits].filter((id) => set.has(id)))\n    if (hits.size === 0) return []\n  }\n  return [...hits].sort()\n}\n`
const SEARCH_INDEX_OLD = "export function buildIndex(docs) {\n  // old revision: BM25-style scoring lived here\n  return {}\n}\n"
const RANK_CURRENT = `// Current scoring: plain term-frequency count (BM25 was removed in commit 4a19).\nexport function score(tokens, docTokens) {\n  let s = 0\n  for (const t of docTokens) if (tokens.includes(t)) s += 1\n  return s\n}\n`

fixtures.push({
  id: "24-memory-search-followup",
  meta: { name: "24-memory-search-followup", class: "stage6", category: "stage6", verifyTimeoutMs: 30000 },
  final: "Continue from where we left off: add phrase search now. Run node verify.js when done.",
  worktree: {
    "PLAN.md": "Accepted plan: add phrase search.\n\n1. src/search/index.js: export searchPhrase(index, phrase) that returns doc ids whose tokens contain the phrase tokens CONSECUTIVELY (in order).\n2. Keep search() semantics unchanged.\n\nAcceptance: node verify.js exits 0.\n",
    "src/search/index.js": SEARCH_INDEX,
    "src/search/rank.js": RANK_CURRENT,
    "src/search/lang.js": `// stopwords + stemmer placeholder (not wired up yet)\nexport const STOPWORDS = new Set(["the", "a", "an", "of"])\n`,
    "docs/README.md": "search module: buildIndex(docs) -> index; search(index, query) -> ids.\n",
  },
  transcriptTitle: "search module follow-up",
  transcript: [
    ["user", "Next iteration on the search module: we need phrase search (consecutive tokens, in order) for the docs app. Please propose the smallest change."],
    ["assistant", "The index in src/search/index.js already stores each doc's token array in entries, so searchPhrase(index, phrase) can scan entries for a consecutive subsequence match. tokenize() lowercases at index time, so the phrase must be lowercased with the same tokenizer. Regular search() stays untouched."],
    ["user", "Accepted — write it into PLAN.md and stop; implementation happens next session."],
    ["assistant", "PLAN.md written. Implementation ready to start."],
  ],
  handoff: {
    objective: "Add searchPhrase(index, phrase) to src/search/index.js: return doc ids whose tokens contain the phrase tokens consecutively and in order.",
    constraints: [{ text: "Regular search() semantics must not change; tokenize() lowercases at index time so the phrase must use the same tokenizer", provenance: "user-approved" }],
    acceptanceCriteria: [{ text: "node verify.js exits 0", provenance: "user-approved" }],
    relevantFiles: ["src/search/index.js"],
    nextSteps: ["implement searchPhrase()", "run node verify.js"],
  },
  notes: {
    "n-token": {
      paths: ["src/search/index.js"],
      content: "Search tokens are lowercased at INDEX time in src/search/index.js; the query side must lowercase with the same tokenizer or lookups silently miss.",
      digestTarget: SEARCH_INDEX,
    },
    "n-ranking": {
      paths: ["src/search/rank.js"],
      content: "Ranking uses BM25 in src/search/rank.js — tune k1/b there if relevance needs work.",
      digestTarget: SEARCH_INDEX_OLD, // stale: workspace rank.js has moved on
    },
  },
  verify: `import { buildIndex, search, searchPhrase } from "./src/search/index.js"\nconst check = (c, m) => { if (!c) { console.log("FAIL: " + m); process.exit(1) } }\n\nconst docs = {\n  d1: "Error handling guide: retry with backoff when the database errors out.",\n  d2: "Database schema migrations run before error reporting starts.",\n  d3: "Cooking pasta: boil water, add salt.",\n}\nconst index = buildIndex(docs)\ncheck(search(index, "database").join() === "d1,d2", "plain search broke")\ncheck(typeof searchPhrase === "function", "searchPhrase missing")\ncheck(searchPhrase(index, "database errors").join() === "d1", "phrase should match d1 only")\ncheck(searchPhrase(index, "database schema").join() === "d2", "phrase should match d2")\ncheck(searchPhrase(index, "schema database").length === 0, "phrase must respect token order")\ncheck(searchPhrase(index, "ERROR Handling").join() === "d1", "phrase must lowercase like the index")\nconsole.log("PASS: memory-search-followup")\n`,
  groundTruth: { required: ["src/search/index.js"], optional: ["src/search/rank.js"], mandatoryFacts: ["consecutive token match", "order respected", "query lowercased like index"] },
  solution: {
    "src/search/index.js": SEARCH_INDEX + `\nexport function searchPhrase(index, phrase) {\n  const tokens = tokenize(phrase)\n  if (tokens.length === 0) return []\n  const hits = []\n  for (const { id, tokens: docTokens } of index.entries) {\n    for (let i = 0; i + tokens.length <= docTokens.length; i++) {\n      let ok = true\n      for (let j = 0; j < tokens.length; j++) {\n        if (docTokens[i + j] !== tokens[j]) { ok = false; break }\n      }\n      if (ok) { hits.push(id); break }\n    }\n  }\n  return hits.sort()\n}\n`,
    "src/search/rank.js": RANK_CURRENT,
    "src/search/lang.js": `// stopwords + stemmer placeholder (not wired up yet)\nexport const STOPWORDS = new Set(["the", "a", "an", "of"])\n`,
    "docs/README.md": "search module: buildIndex(docs) -> index; search(index, query) -> ids.\n",
  },
})

// ---- controls ----------------------------------------------------------------

fixtures.push({
  id: "25-control-explicit-edit",
  meta: { name: "25-control-explicit-edit", class: "stage6", category: "stage6-control", verifyTimeoutMs: 30000 },
  final: "In src/slugify.js change the separator from underscore to hyphen (slugify('Hello World') must return 'Hello-World'). Then run node verify.js.",
  worktree: {
    "src/slugify.js": `export function slugify(text) {\n  return String(text).trim().replace(/\\s+/g, "_")\n}\n`,
  },
  transcriptTitle: "slugify tweak",
  transcript: [
    ["user", "Quick change for later: slugify should use hyphens instead of underscores."],
    ["assistant", "Noted — one-line change in src/slugify.js whenever you want it applied."],
  ],
  handoff: {
    objective: "Change slugify's separator from underscore to hyphen in src/slugify.js.",
    constraints: [{ text: "The separator is exactly the hyphen character '-'", provenance: "user-approved" }],
    acceptanceCriteria: [{ text: "node verify.js exits 0 (slugify('Hello World') === 'Hello-World')", provenance: "user-approved" }],
    relevantFiles: ["src/slugify.js"],
  },
  verify: `import { slugify } from "./src/slugify.js"\nconst check = (c, m) => { if (!c) { console.log("FAIL: " + m); process.exit(1) } }\ncheck(slugify("Hello World") === "Hello-World", "expected hyphen separator")\ncheck(slugify("  a  b ") === "a-b", "trim/collapse broken")\nconsole.log("PASS: control-explicit-edit")\n`,
  groundTruth: { required: ["src/slugify.js"], optional: [], mandatoryFacts: [] },
  solution: {
    "src/slugify.js": `export function slugify(text) {\n  return String(text).trim().replace(/\\s+/g, "-")\n}\n`,
  },
})

fixtures.push({
  id: "26-control-named-module",
  meta: { name: "26-control-named-module", class: "stage6", category: "stage6-control", verifyTimeoutMs: 30000 },
  final: "Add the alias ':grin:' mapping to 'grinning' in src/emoji.js, keep existing aliases working. Then run node verify.js.",
  worktree: {
    "src/emoji.js": `const ALIASES = {\n  ":)": "slightly_smiling_face",\n  ":wink:": "winking_face",\n}\n\nexport function lookup(alias) {\n  return ALIASES[alias] ?? null\n}\n`,
    "src/emoji.test.js": `import { lookup } from "./emoji.js"\nconsole.log(lookup(":)") === "slightly_smiling_face" ? "ok" : "BROKEN")\n`,
  },
  transcriptTitle: "emoji aliases",
  transcript: [
    ["user", "We will need a :grin: alias soon — remember it for the next session."],
    ["assistant", "Noted: add ':grin:' -> 'grinning' to src/emoji.js when we pick this up."],
  ],
  handoff: {
    objective: "Add the ':grin:' alias mapping to 'grinning' in src/emoji.js without breaking existing aliases.",
    constraints: [{ text: "Existing aliases must keep working", provenance: "user-approved" }],
    acceptanceCriteria: [{ text: "node verify.js exits 0", provenance: "user-approved" }],
    relevantFiles: ["src/emoji.js"],
  },
  verify: `import { lookup } from "./src/emoji.js"\nconst check = (c, m) => { if (!c) { console.log("FAIL: " + m); process.exit(1) } }\ncheck(lookup(":grin:") === "grinning", "missing :grin: alias")\ncheck(lookup(":)") === "slightly_smiling_face", "existing alias broken")\ncheck(lookup(":wink:") === "winking_face", "existing alias broken")\nconsole.log("PASS: control-named-module")\n`,
  groundTruth: { required: ["src/emoji.js"], optional: [], mandatoryFacts: [] },
  solution: {
    "src/emoji.js": `const ALIASES = {\n  ":)": "slightly_smiling_face",\n  ":wink:": "winking_face",\n  ":grin:": "grinning",\n}\n\nexport function lookup(alias) {\n  return ALIASES[alias] ?? null\n}\n`,
    "src/emoji.test.js": `import { lookup } from "./emoji.js"\nconsole.log(lookup(":)") === "slightly_smiling_face" ? "ok" : "BROKEN")\n`,
  },
})

// ---- emit ---------------------------------------------------------------------

for (const f of fixtures) {
  const dir = path.join(FX, f.id)
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(path.join(dir, "sender"), { recursive: true })
  fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(f.meta, null, 1) + "\n")
  fs.writeFileSync(path.join(dir, "TASK_RECEIVER.md"), f.final)
  fs.writeFileSync(path.join(dir, "verify.js"), f.verify)
  fs.writeFileSync(path.join(dir, "ground-truth.json"), JSON.stringify(f.groundTruth, null, 1) + "\n")
  for (const [rel, content] of Object.entries(f.worktree)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
    fs.writeFileSync(path.join(dir, rel), content)
  }
  // frozen transcript (workspace path placeholder swapped by the runner)
  fs.writeFileSync(path.join(dir, "sender", "transcript.json"), JSON.stringify(transcript(f.transcriptTitle, __WORKSPACE__, f.transcript), null, 1) + "\n")
  // frozen handoff snapshot + render via the real 6C builder
  const { handoff, render } = await buildRender(f.id.replace(/-/g, "").slice(0, 12), f.handoff, f.worktree)
  fs.writeFileSync(path.join(dir, "sender", "handoff.json"), JSON.stringify(handoff, null, 1) + "\n")
  fs.writeFileSync(path.join(dir, "sender", "handoff-render.txt"), render)
  // memory notes for C/D arms
  if (f.notes) {
    const index = { schemaVersion: 1, projectID: "p-fixture", notes: {}, updatedAt: new Date(NOW).toISOString() }
    fs.mkdirSync(path.join(dir, "sender", "modules"), { recursive: true })
    for (const [id, n] of Object.entries(f.notes)) {
      index.notes[id] = {
        schemaVersion: 1, noteID: id, scope: "module", refs: { paths: n.paths, symbols: [] },
        authorKind: "user", lastValidatedAt: new Date(NOW).toISOString(), validity: "current",
        sourceDigests: Object.fromEntries(n.paths.map((p) => [p, createHash("sha256").update(n.digestTarget).digest("hex")])),
      }
      fs.writeFileSync(path.join(dir, "sender", "modules", `${id}.md`), n.content)
    }
    fs.writeFileSync(path.join(dir, "sender", "memory.json"), JSON.stringify(index, null, 1) + "\n")
  }
  // reference solution
  const sdir = path.join(SOL, f.id)
  fs.rmSync(sdir, { recursive: true, force: true })
  for (const [rel, content] of Object.entries(f.solution)) {
    fs.mkdirSync(path.dirname(path.join(sdir, rel)), { recursive: true })
    fs.writeFileSync(path.join(sdir, rel), content)
  }
  console.log(`fixture ${f.id}: ${Object.keys(f.worktree).length} files, ${f.transcript.length} transcript msgs, handoff ${render.length}B`)
}
console.log("done")
