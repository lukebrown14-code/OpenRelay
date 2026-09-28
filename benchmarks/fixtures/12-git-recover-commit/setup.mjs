import { execFileSync } from "node:child_process"

const runbook = `# Incident Runbook

## Sev-1 (service down)
1. Page the on-call engineer.
2. Roll back to the last known-good release.
3. Escalate to the platform lead after 15 minutes.

## Sev-2 (degraded)
1. Check the error-rate dashboard.
2. Capture a flame graph before restarting.
`

function git(...args) {
  return execFileSync("git", ["-c", "user.email=bench@local", "-c", "user.name=bench", ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  })
}

import { mkdirSync, writeFileSync } from "node:fs"
mkdirSync("docs", { recursive: true })
writeFileSync("docs/runbook.md", runbook)
git("add", "docs/runbook.md")
git("commit", "-m", "Add incident runbook")
git("reset", "--hard", "HEAD~1")
console.log("scenario seeded: runbook commit created and reset away")
