// Frozen assembly budgets (stage6-plan §7). These were frozen before any pilot run;
// changing them requires a new preregistration.
export const ASSEMBLY_BUDGETS = {
  maxNotesConsidered: 100,
  maxSelectedNotes: 2,
  memoryBytes: 2 * 1024,
  handoffBytes: 6 * 1024,
  totalAuxBytes: 12 * 1024,
  hashBudget: { maxFiles: 32, maxBytes: 4 * 1024 * 1024 },
  prepTargetMs: 100,
  prepAbandonMs: 250,
  maxRecoveryExcerptBytes: 512,
} as const

export type AssemblyBudgets = typeof ASSEMBLY_BUDGETS
