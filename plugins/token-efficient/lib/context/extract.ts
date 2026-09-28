export type Signals = {
  paths: string[]
  quoted: string[]
  errors: string[]
  /** Locators derived from quoted signals (e.g. CSS-class `.foo` also searched as `foo`). */
  derived: string[]
  gitIntent: boolean
}

// Interior dots allowed so `settings.test.js` survives; greedy backtracking captures the
// full name, and the trailing (?![.\w]) keeps short abbreviations like "e.g" out (PATH_STOP
// remains as a backstop).
const PATH_RE = /(?:^|[\s("'`=:,])((?:\.{1,2}\/)?(?:[\w@+.-]+\/)*[\w@+.-]*[A-Za-z0-9_-]\.[A-Za-z]{1,6})(?![.\w])/g
const QUOTED_RE = /"([^"\n]{2,80})"|'([^'\n]{2,80})'|`([^`\n]{2,80})`/g
const ERROR_RE = /\b(?:TS\d{4}|ERR_[A-Z_]+|[A-Z]{3,}(?:_ERROR|_FAILED)|HTTP \d{3}|AssertionError|TypeError|ReferenceError)\b/g

// Unambiguous git vocabulary short-circuits; weak verbs (merge/commit/reset/…) only count
// when several distinct ones co-occur or a branch ref is present — prose like "reset the
// form" or "commit to the DOM" must not flip the packet skip (stage5 audit E1).
const GIT_STRONG_RE =
  /\b(?:git|reflog|cherry-?pick|rebase|uncommitted|unstage[d]?|staged changes|merge conflict|merge commit|working tree)\b/i
const GIT_WEAK_RE = /\b(merge|branch|commit|commits|committed|revert|stash|reset|checkout|stage|staged)\b/gi
const GIT_BRANCH_REF_RE = /(?:feature|release|bugfix|hotfix)\/[\w.-]/i

function gitIntentOf(text: string): boolean {
  if (GIT_STRONG_RE.test(text)) return true
  if (GIT_BRANCH_REF_RE.test(text)) return true
  const weak = new Set<string>()
  for (const m of text.matchAll(GIT_WEAK_RE)) weak.add(m[1].toLowerCase())
  return weak.size >= 3
}

const PATH_STOP = new Set(["e.g", "etc.js", "node_modules"])

function cleanTail(s: string): string {
  return s.replace(/[.,;:]+$/, "").trim()
}

export function extractSignals(text: string): Signals {
  const paths = new Set<string>()
  const quoted = new Set<string>()
  const errors = new Set<string>()
  const derived = new Set<string>()

  for (const m of text.matchAll(PATH_RE)) {
    const p = cleanTail(m[1])
    if (p && !PATH_STOP.has(p) && !p.startsWith("http")) paths.add(p)
  }
  for (const m of text.matchAll(QUOTED_RE)) {
    const q = (m[1] ?? m[2] ?? m[3] ?? "").trim()
    if (!q) continue
    quoted.add(q)
    // CSS-class-like `.panel-header` is searched fixed-string as `panel-header` too:
    // the dotted form only exists in CSS/HTML, the bare form also matches JS usage.
    if (/^\.[\w][\w-]*$/.test(q)) derived.add(q.slice(1))
  }
  for (const m of text.matchAll(ERROR_RE)) errors.add(m[0])

  return {
    paths: [...paths].slice(0, 12),
    quoted: [...quoted].slice(0, 12),
    errors: [...errors].slice(0, 8),
    derived: [...derived].slice(0, 8),
    gitIntent: gitIntentOf(text),
  }
}
