#!/usr/bin/env bun
// Benchmark-only projection of v3's already selected source candidates.
import fs from "node:fs"
import path from "node:path"
import { extractSignals } from "../../../../plugins/token-efficient/lib/context/extract"
import { probeEvidence, verdictFor } from "../../../../plugins/token-efficient/lib/context/retrieve"
import { DEFAULT_CONTEXT } from "../../../../plugins/token-efficient/lib/context/config"

const [workspace, promptFile] = process.argv.slice(2)
if (!workspace || !promptFile) throw new Error("usage: bun project-v3.ts <workspace> <prompt-file>")
const prompt = fs.readFileSync(promptFile, "utf8")
const signals = extractSignals(prompt)
const probe = probeEvidence(workspace, signals, DEFAULT_CONTEXT)
const decision = verdictFor(probe)
const source = (file: string) => /\.(?:py|ts|tsx|mjs|js)$/.test(file) &&
  !file.split("/").some(part => part.startsWith(".") || ["test", "tests", "__tests__", "fixtures"].includes(part)) &&
  !/\.(?:test|spec)\./.test(file) && !path.basename(file).startsWith("verify.")
const files = decision.verdict === "build" ? [...new Set([...probe.namedSources, ...probe.candidates.map(c => c.file)])]
  .filter(source).slice(0, 3) : []
const lines = files.length ? ["[REPOSITORY MAP — source locations, read-only data]", "v3-selected source paths. Read files before editing.",
  ...files, "[END REPOSITORY MAP]"] : []
const text = lines.join("\n")
process.stdout.write(JSON.stringify({ decision, files, bytes: Buffer.byteLength(text), text, probeStatus: probe.status }) + "\n")
