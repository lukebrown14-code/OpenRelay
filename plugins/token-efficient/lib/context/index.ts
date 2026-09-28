import fs from "node:fs"
import { buildPacket } from "./packet"
import { extractSignals } from "./extract"
import { buildEvidence, fnv1a, probeEvidence, verdictFor, type Evidence, type ProbeResult } from "./retrieve"
import type { ContextConfig } from "./config"

type SessionEntry = {
  signature: string
  packet?: string
  evidence?: Evidence
  skipped?: string
  verdict?: { verdict: "build" | "skip"; reason: string }
  paths?: string[]
}

export type ContextEventSink = (type: string, data: Record<string, unknown>, sessionID?: string) => void

export class ContextEngine {
  private sessions = new Map<string, SessionEntry>()

  constructor(
    private config: ContextConfig,
    private event: ContextEventSink,
  ) {}

  get enabled(): boolean {
    return this.config.enabled
  }

  /** Probe, decide, and (when built) assemble the packet for a session's request. Never throws. */
  prepare(sessionID: string, worktree: string, userText: string): void {
    if (!this.config.enabled) return
    try {
      const signature = fnv1a(`${worktree}\0${userText}`)
      const existing = this.sessions.get(sessionID)
      if (existing && existing.signature === signature) return
      if (!fs.existsSync(worktree)) return

      const signals = extractSignals(userText)

      // v2: Git tasks regress with a prepared packet — the Git evidence duplicates the
      // commands the model runs anyway. Let git-intent requests use native exploration.
      if (signals.gitIntent) {
        this.sessions.set(sessionID, { signature, skipped: "git-intent", verdict: { verdict: "skip", reason: "git-intent" } })
        this.event("context.packet_skipped", { reason: "git-intent" }, sessionID)
        this.emitDecision(sessionID, { verdict: "skip", reason: "git-intent" }, undefined, undefined)
        return
      }

      // v3 probe verdict: decide between search (cheap) and read (expensive) stages.
      const probe = probeEvidence(worktree, signals, this.config)
      const decision = verdictFor(probe)
      const probePaths = [...(probe.namedSources ?? []), ...probe.candidates.slice(0, 8).map((c) => c.file), ...signals.paths]
      this.emitDecision(sessionID, decision, probe.namedSources, probe.candidates.slice(0, 8).map((c) => c.file))

      if (decision.verdict === "skip") {
        this.sessions.set(sessionID, { signature, skipped: decision.reason, verdict: decision, paths: probePaths })
        this.event("context.packet_skipped", { reason: decision.reason }, sessionID)
        return
      }

      const evidence = buildEvidence(worktree, probe, signals, this.config, userText)
      const packet = buildPacket(evidence)
      this.sessions.set(sessionID, { signature, packet, evidence, verdict: decision, paths: [...probePaths, ...evidence.excerpts.map((e) => e.file)] })

      this.event("context.packet_built", {
        bytes: packet.length,
        prepMs: evidence.prepMs,
        files: evidence.excerpts.map((e) => e.file),
        searchedPatterns: evidence.searchedPatterns.length,
        omitted: evidence.omitted.length,
        git: Boolean(evidence.git),
        signals: {
          paths: signals.paths.length,
          quoted: signals.quoted.length,
          errors: signals.errors.length,
          gitIntent: signals.gitIntent,
        },
      }, sessionID)

      if (this.sessions.size > 200) {
        const oldest = this.sessions.keys().next().value
        if (oldest !== undefined && oldest !== sessionID) this.sessions.delete(oldest)
      }
    } catch {}
  }

  private emitDecision(
    sessionID: string,
    decision: { verdict: "build" | "skip"; reason: string },
    named?: string[],
    candidates?: string[],
  ): void {
    try {
      this.event("context.decision", { ...decision, named, candidates }, sessionID)
    } catch {}
  }

  /** Packet for the outgoing system prompt, or undefined when none applies. */
  packetFor(sessionID: string | undefined): string | undefined {
    if (!this.config.enabled || !sessionID) return undefined
    try {
      return this.sessions.get(sessionID)?.packet
    } catch {
      return undefined
    }
  }

  /** Verified source paths (request-named + probe candidates) for this session's request. */
  pathsFor(sessionID: string | undefined): string[] {
    if (!sessionID) return []
    try {
      return this.sessions.get(sessionID)?.paths ?? []
    } catch {
      return []
    }
  }

  clear(sessionID?: string): void {
    try {
      if (sessionID) this.sessions.delete(sessionID)
      else this.sessions.clear()
    } catch {}
  }
}
