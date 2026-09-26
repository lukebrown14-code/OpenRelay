import type { ProvenanceLabel } from "./schemas"
import type { Direction, Lifecycle, Validity } from "./schemas"

export type { Direction, Lifecycle, ProvenanceLabel, Validity }

export type SourceStateDigest = {
  gitCommit?: string | null
  dirtyFiles?: Record<string, string>
  untrackedFiles?: Record<string, string>
  capturedAt: string
  skipped?: number
}

export type EvidenceRef = {
  path: string
  contentDigest: string
  lineRange?: [number, number]
  symbol?: string
  captured: SourceStateDigest
  recovery?: { excerpt: string; truncated: boolean }
}

export type VerificationRecord = {
  command: string
  cwd: string
  exitStatus: number | "unknown"
  executedAt: string
  sourceStateDigest: SourceStateDigest
  resultRef?: string
}

export type TaskRecord = {
  schemaVersion: number
  taskID: string
  workflowID: string
  project: { projectID: string; worktreeID: string; worktreeRealpath: string }
  originatingSession: string
  continuationSessions: string[]
  objectiveRef?: string
  revision: number
  lifecycle: Lifecycle
  telemetryTasks: string[]
  handoffIDs: string[]
  createdAt: string
  updatedAt: string
}

export type Labeled = { text: string; provenance: ProvenanceLabel }

export type HandoffRecord = {
  schemaVersion: number
  handoffID: string
  taskID: string
  workflowID: string
  sourceSession: string
  direction: Direction
  objective: string
  constraints: Labeled[]
  decisions: Labeled[]
  relevantFiles: EvidenceRef[]
  currentWork?: string
  nextSteps: string[]
  acceptanceCriteria: Labeled[]
  unresolvedQuestions: string[]
  verifications: VerificationRecord[]
  evidenceRefs: EvidenceRef[]
  createdAt: string
}

export type MemoryNoteMeta = {
  schemaVersion: number
  noteID: string
  scope: string
  refs: { paths: string[]; symbols: string[] }
  originTask?: string
  originSession?: string
  authorKind: "user" | "model" | "derived"
  supportEvidence?: EvidenceRef[]
  sourceDigests?: Record<string, string>
  lastValidatedAt: string
  validity: Validity
}

export type MemoryIndex = {
  schemaVersion: number
  projectID: string
  notes: Record<string, MemoryNoteMeta>
  updatedAt: string
}
