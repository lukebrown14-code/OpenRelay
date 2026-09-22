# Token-Efficient OpenCode Coding Architecture

## Build Plan for an AI Coding Agent

**Status:** Proposed implementation plan\
**Primary objective:** Maximize useful completed coding work per scarce
premium-model token while preserving task success and code quality.\
**Primary harness:** OpenCode, unmodified if practical\
**Workhorse model:** GLM Coding Plan\
**Premium model:** ChatGPT Premium / GPT through the supported ChatGPT/OpenCode
authentication path\
**Optional support models:** OpenRouter free models, explicitly opt-in
for source-code access\
**Core custom implementation:** OpenCode plugin/configuration providing
a Task Controller, Context Engine, Shared Project Memory integration,
Tool Layer policy/filtering, and Observability.

------------------------------------------------------------------------

# 1. Project Purpose

The project is a token-efficient orchestration layer for AI-assisted
software development.

The user should continue to work through a normal interactive OpenCode
TUI. The system underneath OpenCode decides how much context a task
needs, which model should receive it, when more context should be
retrieved, when a task should be escalated, and how verification results
should be fed back to the model.

The project is **not** intended to build another coding harness.
OpenCode should continue to provide the TUI, sessions, streaming,
editing, terminal/tool execution, and ordinary provider integration
wherever possible.

The system should instead focus custom engineering on four questions:

1.  **Who should do the work?** --- Task Controller.
2.  **What information does the model actually need?** --- Context
    Engine.
3.  **What can deterministic tools discover or verify without spending
    reasoning tokens?** --- Tool Layer.
4.  **Did the optimization actually improve useful work per scarce
    token?** --- Observability.

The central principle is:

> Give models the smallest context that preserves task performance, then
> expand deliberately when evidence shows more context or stronger
> reasoning is required.

The goal is not minimum raw tokens at any cost. A smaller context that
causes retries, incorrect edits, or premium escalation can be worse than
a slightly larger context that succeeds on the first attempt.

The primary KPI is therefore:

> **Useful completed coding work per scarce premium-model token.**

Secondary metrics include total tokens, cached tokens, task success,
first-pass success, rework, verification results, wall-clock time,
allowance consumption, and PAYG spend.

------------------------------------------------------------------------

# 2. Scope and Non-Goals

## 2.1 In scope

The initial architecture should support:

-   OpenCode as the interactive coding harness.
-   GLM as the default workhorse.
-   ChatGPT Premium/GPT as the premium reasoning and coding tier.
-   Deterministic task routing and escalation.
-   Adaptive context levels.
-   Targeted context retrieval.
-   Tool-output filtering.
-   Structured handoffs between models.
-   Shared project memory.
-   Verification gates.
-   Token, latency, tool-use, and task-quality telemetry.
-   Optional OpenRouter free-model preprocessing.
-   An optional Aider-inspired repository map if benchmarks justify it.
-   Explicit user overrides such as `/auto`, `/glm`, `/chatgpt`, `/plan`,
    `/review`, and `/deep`, where OpenCode's extension surface permits
    them.

## 2.2 Explicit non-goals for the initial implementation

Do **not** initially build:

-   a custom TUI;
-   a custom editor or patch engine;
-   a replacement agent loop;
-   a Kilo/OpenCode fork unless extension APIs prove insufficient;
-   Claude Code integration;
-   LiteLLM;
-   a vector database;
-   a large semantic memory system;
-   a custom conversation compactor if OpenCode's native facilities are
    sufficient;
-   a Tree-sitter/PageRank repo mapper before native retrieval is
    benchmarked;
-   an LLM router on every user turn;
-   automatic free-model access to repository source;
-   a complicated allowance optimizer before reliable allowance
    telemetry exists.

Complexity must earn its place through measurement.

------------------------------------------------------------------------

# 3. High-Level Architecture

``` text
┌─────────────────────────────────────────────────────────────┐
│                         OPENCODE                            │
│                                                             │
│                     Existing TUI                            │
│                         │                                   │
│                         ▼                                   │
│                  TASK CONTROLLER                            │
│        routing • escalation • task state • overrides        │
│                         │                                   │
│                         ▼                                   │
│                   CONTEXT ENGINE                            │
│ retrieval • budgets • filtering • handoffs • memory select │
│                         │                                   │
│        ┌────────────────┼────────────────┐                  │
│        ▼                ▼                ▼                  │
│ PROJECT MEMORY      TOOL LAYER      REPO MAPPER*            │
│ AGENTS/.codebase    Git/LSP/rg      Aider-inspired          │
│ .tasks              tests/lint      symbols/graph           │
│        └────────────────┼────────────────┘                  │
│                         ▼                                   │
│                   CONTEXT PACKET                            │
│                         │                                   │
│                ┌────────┴────────┐                          │
│                ▼                 ▼                          │
│          GLM WORKHORSE     CHATGPT PREMIUM                  │
│                │                 │                          │
│                └────────┬────────┘                          │
│                         ▼                                   │
│                    TOOL LAYER                               │
│           edit • format • lint • types • tests              │
│                         │                                   │
│                         ▼                                   │
│                  TASK CONTROLLER                            │
│             done • retry • expand • escalate                │
│                                                             │
│ OBSERVABILITY watches routing, context, tools, models,      │
│ verification, latency, tokens, cache, attempts and outcome. │
└─────────────────────────────────────────────────────────────┘

* Build only if benchmarks justify it.

Optional:
OpenRouter free models → compression/summarization/handoff assistance
                         only when explicitly allowed and proven useful.
```

The architecture is a feedback loop rather than a one-way pipeline.
Verification failures return exact, filtered evidence to the Context
Engine; the Task Controller then chooses whether to retry, expand
context, or escalate to ChatGPT Premium.

------------------------------------------------------------------------

# 4. Model Roles

## 4.0 Model hierarchy

The model relationship is deliberately asymmetric:

```text
ROUTINE TASK
    ↓
GLM
workhorse
    ↓
verify
    ↓
done

COMPLEX TASK
    ↓
ChatGPT Premium
lead reasoning / planning / architecture
    ↓
GLM
bulk implementation
    ↓
verify
```

For tasks classified as complex from the outset, **ChatGPT Premium leads and hands implementation down to GLM**. GLM does not first attempt work that the controller already considers genuinely complex merely to avoid premium usage.

The opposite direction is reserved for escalation:

```text
ROUTINE TASK
    ↓
GLM
    ↓
reasoning bottleneck / repeated failure
    ↓
ChatGPT Premium
    ↓
GLM follow-up if appropriate
```

Both tiers operate inside the same OpenCode harness. ChatGPT Premium is authenticated using the user's ChatGPT subscription; OpenAI API billing is not part of the default architecture.


## 4.1 GLM --- workhorse

GLM should receive the majority of ordinary coding volume.

Typical responsibilities:

-   local edits;
-   routine features;
-   frontend work;
-   CSS/Tailwind;
-   ordinary refactors;
-   test creation;
-   straightforward bug fixes;
-   mechanical implementation from an accepted plan;
-   fixes resulting from verification or review.

Default rule:

> If GLM can reasonably complete the task at acceptable quality, use
> GLM.

GLM should not be denied useful context merely to save tokens. The
Context Engine should start lean and expand when necessary.

## 4.2 ChatGPT Premium / GPT --- premium tier

ChatGPT Premium is reserved for work where stronger reasoning is likely to produce
meaningful value.

Typical responsibilities:

-   architecture;
-   complex feature planning;
-   difficult debugging;
-   difficult implementation;
-   security-sensitive reasoning;
-   reviewing important or risky changes;
-   resolving repeated GLM failures;
-   explicit `/plan`, `/review`, or `/deep` requests.

A common complex workflow is:

``` text
ChatGPT Premium plan
    ↓
structured plan
    ↓
GLM implementation
    ↓
verification
    ↓
ChatGPT Premium review when justified
    ↓
GLM fix
```

ChatGPT Premium should not automatically plan and review every task. Premium calls
must have a reason.

## 4.3 OpenRouter free-model pool --- optional support

Free models are infrastructure, not trusted authorities.

Potential jobs:

-   compress already-filtered logs;
-   summarize selected source;
-   create a structured handoff;
-   classify a task later if deterministic routing proves insufficient.

Source-code access must default to disabled:

``` yaml
free_agents:
  allow_source_code: false
```

Enabling source access must be an explicit repository/user decision
after reviewing the current provider's privacy and data-use terms.

Free-model output is **untrusted derived data**. It must never become
controller instructions or authoritative project truth merely because a
model produced it.

------------------------------------------------------------------------

# 5. Task Controller

The Task Controller answers:

> What should happen next?

It should initially be deterministic and easy to inspect.

## 5.1 Responsibilities

-   create and maintain a task ID;
-   classify broad task type/complexity using heuristics and explicit
    commands;
-   select GLM or ChatGPT Premium;
-   select a context level;
-   decide verification requirements;
-   track attempts and failures;
-   decide retry vs context expansion vs escalation;
-   trigger structured handoffs;
-   honor manual overrides;
-   emit routing decisions to telemetry.

## 5.2 Initial routing policy

Example:

``` text
trivial/local change
    → GLM

routine bug/refactor/feature
    → GLM

complex architecture or explicit /plan
    → ChatGPT Premium leads planning/reasoning

security-sensitive structural work
    → ChatGPT Premium leads planning/reasoning, then GLM performs routine implementation where appropriate

GLM repeated failure
    → expand context first when missing context is plausible
    → ChatGPT Premium when stronger reasoning is warranted

/review
    → ChatGPT Premium

/deep
    → expanded context + ChatGPT Premium earlier
```

Do not call an LLM simply to choose an LLM in the first implementation.

## 5.3 Deterministic escalation signals

Start with observable signals:

``` text
compiler/type failure              + evidence
test failure                       + evidence
same test repeatedly failing       → escalation pressure
model requests missing source      → retrieve exact source
context budget exhausted           → expand context
tool failure                       → retry/tool handling
N unsuccessful edit/test cycles    → ChatGPT Premium
/deep                              → immediate deep policy
```

The exact value of `N` should be benchmarked rather than assumed. Start
with a configurable default, e.g. 2--3 unsuccessful cycles.

Avoid fuzzy logic such as "the model seems confused" until there is
evidence it is needed.

------------------------------------------------------------------------

# 6. Context Engine

The Context Engine answers:

> What is the smallest useful evidence package for the current step?

This is the project's main optimization layer.

## 6.1 Responsibilities

-   deterministic retrieval;
-   context budgeting;
-   selecting Shared Project Memory;
-   targeted exact source reads;
-   tool-output filtering;
-   constructing model context packets;
-   structured model-to-model handoffs;
-   adaptive context expansion;
-   optional free-model preprocessing;
-   optional Aider-inspired structural repo mapping;
-   provenance/trust labeling.

## 6.2 Retrieval order

Prefer cheap, deterministic evidence before model exploration:

``` text
task
 ↓
project rules
 ↓
Git / rg / LSP / filesystem metadata
 ↓
relevant memory
 ↓
targeted exact reads
 ↓
optional repo map
 ↓
optional free preprocessing
 ↓
model
```

This is not intended to stop a model from exploring. It is intended to
reduce **blind exploration**.

If the model identifies a necessary file or symbol, exact source should
remain recoverable on demand.

## 6.3 Adaptive context levels

Suggested conceptual levels:

### Lean

For local, obvious work.

-   user requirement;
-   relevant project rules;
-   one or a few exact code regions;
-   minimal structural context;
-   compact verification output.

### Normal

For routine multi-file work.

-   Lean content;
-   broader relevant symbols/files;
-   selected architecture/module memory;
-   relevant Git/diff information.

### Expanded

For difficult bugs/features.

-   broader dependency context;
-   more exact source;
-   relevant decisions/history;
-   failed-attempt evidence.

### Deep

For explicit `/deep`, architecture, or severe debugging.

-   broader repository structure;
-   larger exact-source budget;
-   relevant history/decisions;
-   ChatGPT Premium earlier;
-   less aggressive compression;
-   extended verification/review.

Token values should be configuration parameters learned from benchmarks,
not architectural constants.

------------------------------------------------------------------------

# 7. Context Packets

Each model call should receive a task-specific packet rather than the
entire historical conversation whenever the harness permits.

A packet should have clearly separated sections:

``` text
[TRUSTED CONTROLLER INSTRUCTIONS]

[USER REQUIREMENT]

[PROJECT RULES]

[CURRENT TASK STATE]

[RELEVANT STRUCTURAL CONTEXT]

[EXACT SOURCE / DIFF / ERRORS]

[DERIVED SUMMARIES - UNTRUSTED]

[ACCEPTANCE CRITERIA]

[REQUESTED ACTION]
```

This separation is a security boundary.

Repository text, tool output, generated documentation, and free-model
summaries may contain prompt-injection-like instructions. They are data,
not controller authority.

------------------------------------------------------------------------

# 8. Tool Layer

The Tool Layer supplies cheap, exact evidence and objective
verification.

Where possible, reuse OpenCode's existing tools rather than rebuilding
them.

## 8.1 Code intelligence

-   LSP definitions/references/symbols;
-   `rg`/grep;
-   filesystem listing/metadata;
-   targeted file reads;
-   AST/Tree-sitter only when later justified.

## 8.2 Git

Use Git as history and current-change truth:

-   `git status`;
-   `git diff`;
-   `git log`;
-   `git show`;
-   `git blame` when useful.

## 8.3 Editing

Use OpenCode's native edit/patch mechanisms.

Do not build a new patch engine unless a measured limitation requires
it.

## 8.4 Verification

A standard configurable verification chain:

``` text
implementation
    ↓
formatter
    ↓
lint
    ↓
type checker
    ↓
unit tests
    ↓
integration tests when relevant
    ↓
review when required
```

Models do not self-certify completion.

## 8.5 Tool-output filtering

This is an early high-ROI experiment.

Do not feed a 20,000-token compiler/test log back to the model when the
useful evidence is:

``` text
84 passed
2 failed

FAIL auth.test.ts:82
Expected ...
Received ...

Relevant stack:
...
```

Filtering should preserve:

-   failing command;
-   exit code;
-   failure names;
-   exact errors;
-   relevant stack frames;
-   file/line references;
-   a small amount of surrounding evidence;
-   totals such as pass/fail counts.

Raw output should remain recoverable if the compressed evidence is
insufficient.

------------------------------------------------------------------------

# 9. Shared Project Memory

Each repository receives lightweight shared knowledge.

Recommended structure:

``` text
project/
│
├── AGENTS.md
│
├── .codebase/
│   ├── INDEX.md
│   ├── ARCHITECTURE.md
│   ├── DECISIONS.md
│   ├── modules/
│   │   ├── frontend.md
│   │   ├── auth.md
│   │   └── database.md
│   └── generated/
│       ├── symbols.json
│       ├── graph.json
│       └── map-cache.json
│
└── .tasks/
    └── <task-id>/
        ├── PLAN.md
        ├── PROGRESS.md
        └── HANDOFF.md
```

Do **not** use a single `.tasks/current/` directory. Task IDs allow
concurrent, interrupted, or resumed work without collisions.

## 9.1 Memory layers

  Layer                 Purpose                              Lifetime
  --------------------- ------------------------------------ -----------
  `AGENTS.md`           Agent behavior and project rules     Long-term
  `.codebase/`          Architecture and project knowledge   Long-term
  `.tasks/<task-id>/`   Current task state and handoffs      Temporary

Keep `AGENTS.md` small. Never turn it into a repository dump.

## 9.2 Trust model

### Authoritative/exact

-   user requirement;
-   `AGENTS.md` rules;
-   source code;
-   Git state;
-   exact tool results.

### Deterministically generated

-   symbol indexes;
-   dependency/reference graph;
-   repo-map cache.

These should be reproducible from source and safe to invalidate/rebuild.

### Derived semantic memory

-   architecture prose;
-   module summaries;
-   decisions;
-   plans;
-   handoffs;
-   free-model summaries.

These may be stale or incorrect and should carry provenance where
practical.

Example:

``` text
Decision: Use server-side sessions
Source: commit a3f92e
Task: auth-refactor-14
Relevant files:
  - src/auth/session.ts
  - src/middleware.ts
Last verified: 2026-09-19
```

If relevant files change, the Context Engine should reduce trust in or
revalidate the semantic memory.

## 9.3 Memory injection policy

Memory is retrieved selectively.

Never automatically inject all of:

-   `AGENTS.md`;
-   every `.codebase` file;
-   every task artifact;
-   the full repo map.

The Context Engine chooses only relevant sections within the current
context budget.

------------------------------------------------------------------------

# 10. Aider-Inspired Repository Mapping

Aider's repository-map concepts remain part of the design, but **not
part of the mandatory first implementation**.

The hypothesis is that a compact structural map can reduce expensive
model exploration.

Conceptual pipeline:

``` text
repository
    ↓
Tree-sitter / LSP
    ↓
definitions + references
    ↓
symbol/reference graph
    ↓
task relevance
    ↓
rank important symbols
    ↓
strict token budget
    ↓
repo map
```

Example output:

``` text
src/lib/auth.ts
  createSession(userId)
  refreshSession(sessionId)
  destroySession(sessionId)

src/lib/session.ts
  Session
  getSession(token)
  updateSession(session)

src/middleware.ts
  onRequest()
    → getSession()
```

The map supplies structure; exact source is fetched only for symbols the
model actually needs.

Potential later techniques:

-   Tree-sitter symbol extraction;
-   LSP definitions/references;
-   dependency edges;
-   Aider-style graph ranking/PageRank;
-   task-specific relevance weighting;
-   token-budgeted rendering;
-   incremental cache invalidation.

Do not implement the sophisticated version until native OpenCode +
Git/LSP/rg retrieval has been measured.

------------------------------------------------------------------------

# 11. Structured Handoffs

Models should exchange state, not transcripts.

For tasks classified as complex from the outset, the normal handoff direction is **ChatGPT Premium → GLM**.

## 11.1 ChatGPT Premium → GLM implementation handoff

Include:

-   objective;
-   accepted architecture decisions;
-   relevant files/symbols;
-   implementation steps;
-   constraints;
-   acceptance criteria;
-   risks;
-   unresolved questions.

Do not include the entire ChatGPT Premium conversation.

## 11.2 GLM → ChatGPT Premium escalation handoff

This is not the normal hierarchy for complex tasks. It is used when a task began with GLM and later encounters a reasoning bottleneck or repeated failure.

Include:

-   objective;
-   accepted plan/architecture;
-   current exact Git diff;
-   changed files;
-   verification results;
-   exact current failures;
-   attempts that materially affect diagnosis;
-   known concerns.

Do not include successful intermediate chatter or irrelevant historical
tool output.

## 11.3 Handoff persistence

Store durable task state in:

``` text
.tasks/<task-id>/
  PLAN.md
  PROGRESS.md
  HANDOFF.md
```

These files allow sessions to resume without preserving enormous
conversational context.

------------------------------------------------------------------------

# 12. Example Runtime Workflows

## 12.1 Trivial edit

``` text
User: "Change card radius from 8px to 12px."
    ↓
Task Controller → trivial
    ↓
rg/LSP identifies target
    ↓
Lean packet
    ↓
GLM edits
    ↓
formatter / targeted check
    ↓
done
```

No ChatGPT Premium. No free model. No broad repo map.

## 12.2 Routine feature

``` text
user request
    ↓
Task Controller → GLM / Normal
    ↓
Context Engine
    ├── project rules
    ├── rg/LSP/Git
    ├── selected module memory
    └── exact source
    ↓
GLM implementation
    ↓
verification
    ↓
filtered failures if any
    ↓
GLM fix
    ↓
done
```

## 12.3 GLM becomes stuck

``` text
GLM attempt
    ↓
verification failure
    ↓
filtered exact evidence
    ↓
GLM retry
    ↓
same/material failure
    ↓
Task Controller
    ├── expand context if missing evidence is plausible
    └── otherwise escalate
    ↓
ChatGPT Premium receives fresh blocker packet
    ↓
ChatGPT Premium diagnoses or solves the difficult portion
    ↓
GLM performs routine follow-up if appropriate
    ↓
verification
```

## 12.4 Complex feature

``` text
/plan complex feature
    ↓
ChatGPT Premium + Expanded/Deep context
    ↓
interactive plan
    ↓
user approval/changes where appropriate
    ↓
PLAN.md
    ↓
GLM implementation packet
    ↓
GLM implementation
    ↓
verification
    ↓
ChatGPT Premium review only if risk/complexity warrants
    ↓
GLM fixes findings
    ↓
verification
    ↓
done
```

------------------------------------------------------------------------

# 13. Observability and Telemetry

Optimization without measurement is not acceptable.

Create a stable task ID and record metrics per task/run.

## 13.1 Model metrics

Where available:

-   input tokens;
-   output tokens;
-   cached input tokens;
-   model/backend;
-   premium vs workhorse vs free tokens;
-   model switches;
-   call count;
-   allowance usage if reliably exposed;
-   PAYG cost.

## 13.2 Context metrics

-   initial packet size;
-   exact-source tokens;
-   memory tokens;
-   repo-map tokens;
-   tool-result tokens before filtering;
-   tool-result tokens after filtering;
-   compression ratio;
-   context expansion count;
-   compaction events where observable.

## 13.3 Agent/tool metrics

-   files read;
-   searches;
-   LSP calls;
-   Git calls;
-   tool calls;
-   edit/test cycles;
-   retries;
-   escalation reason;
-   verification commands;
-   failed commands.

## 13.4 Quality metrics

-   task success;
-   first-pass success;
-   test pass rate;
-   lint/typecheck result;
-   review findings;
-   regressions;
-   human correction/rework;
-   hidden-test success in benchmarks.

## 13.5 Performance metrics

-   retrieval latency;
-   model latency;
-   verification latency;
-   total wall-clock time.

## 13.6 Primary KPI

``` text
useful completed coding work
────────────────────────────
 scarce premium-model tokens
```

Raw total-token reduction is secondary.

A free preprocessing step may increase total tokens while reducing
scarce ChatGPT Premium tokens and still be a successful optimization.

------------------------------------------------------------------------

# 14. Benchmark Methodology

Testing must be empirical and staged.

Do not compare a new optimization against a single baseline run.

## 14.1 Initial benchmark corpus

Start with 3--4 representative task classes:

1.  **Trivial/local edit** --- small, obvious change.
2.  **Routine bug/refactor** --- requires locating and modifying a few
    relevant areas.
3.  **Medium feature** --- multi-file implementation with tests.
4.  **Difficult task** --- architecture, unfamiliar code path, or
    non-obvious debugging.

Use repositories/tasks with objective acceptance criteria wherever
possible.

Prefer:

-   existing tests;
-   hidden tests;
-   deterministic lint/type checks;
-   known expected diffs/behavior;
-   blind human review when objective verification is insufficient.

Expand the corpus only if results are ambiguous.

## 14.2 A/A calibration

Before evaluating an optimization:

``` text
Baseline A
vs
Baseline A
```

Run repeated trials under similar conditions to estimate natural
variance in:

-   tokens;
-   tool calls;
-   latency;
-   attempts;
-   success.

This establishes a noise floor.

## 14.3 Decision states

Every optimization ends in:

-   **PASS** --- meaningful efficiency improvement without material
    quality loss.
-   **FAIL** --- quality regression or insufficient benefit.
-   **INCONCLUSIVE** --- effect cannot be distinguished from noise.

Default rule:

> If INCONCLUSIVE, do not add the complexity.

## 14.4 Replay limitation

Historical trace replay is useful for cheap analysis, but
routing/context changes alter subsequent behavior.

Therefore replay results are suggestive only.

Important decisions must be validated with actual reruns.

------------------------------------------------------------------------

# 15. Implementation Stages

The stages are ordered by expected ROI and architectural risk rather
than by conceptual sophistication.

Effort estimates are intentionally rough:

-   **S** --- small;
-   **M** --- moderate;
-   **L** --- substantial;
-   **XL** --- major subsystem.

Savings/impact ranks are hypotheses to validate.

------------------------------------------------------------------------

# OpenCode Integration and Installation Model

The system should be implemented as a **global OpenCode plugin plus lightweight OpenCode configuration**, not as a fork and not as a large block of logic embedded in `opencode.json`.

## Responsibility split

```text
~/.config/opencode/
│
├── opencode.jsonc
│   └── static OpenCode configuration / plugin registration
│
├── plugins/
│   └── token-efficient/
│       ├── index.ts
│       ├── controller/
│       ├── context/
│       ├── memory/
│       ├── handoff/
│       └── telemetry/
│
└── commands/
    └── optional user commands such as /deep and /review
```

The exact supported paths and plugin registration syntax must be verified against the installed/current OpenCode version during Stage 0 rather than assumed.

### `opencode.jsonc` responsibilities

Use OpenCode configuration for relatively static integration concerns:

- register/load the token-efficient plugin when required;
- normal provider/model configuration supported by OpenCode;
- ordinary OpenCode settings;
- project-specific overrides where useful.

Do **not** encode the orchestration architecture as a large collection of configuration rules.

Logic such as the following belongs in the plugin:

```text
routine task
    → GLM

complex task
    → ChatGPT Premium leads reasoning/planning
    → GLM performs bulk implementation

GLM repeated failure
    → determine whether missing context is plausible
    → expand context or escalate to ChatGPT Premium

security/high-risk change
    → require stronger verification
    → optionally request ChatGPT Premium review
```

## Plugin responsibilities

The global TypeScript/JavaScript plugin implements the policy and orchestration layer:

```text
OpenCode
    │
    ▼
Token-Efficient Plugin
    │
    ├── Task Controller
    │     ├── classify
    │     ├── route
    │     ├── retry
    │     └── escalate
    │
    ├── Context Engine
    │     ├── deterministic retrieval
    │     ├── context budgets
    │     ├── tool-output filtering
    │     └── context packets
    │
    ├── Shared Project Memory integration
    │
    ├── Structured Handoffs
    │     ├── ChatGPT Premium → GLM
    │     └── GLM → ChatGPT Premium escalation
    │
    └── Observability
          ├── tokens
          ├── routing
          ├── verification
          └── task outcomes
```

OpenCode remains responsible for the TUI, sessions, normal model/provider integration, editing, tool execution, and its native agent loop wherever possible. The plugin should use supported OpenCode extension points rather than recreate these facilities.

## Model usage inside OpenCode

Both primary model tiers should operate **natively inside the same OpenCode harness**.

```text
OpenCode
    │
    ├── GLM
    │    └── GLM Coding Plan subscription
    │
    └── ChatGPT Premium
         └── user's ChatGPT subscription authentication
              └── NO OpenAI API/PAYG billing
```

The plugin assigns logical roles such as `workhorse` and `premium` to models actually exposed by the user's current OpenCode/provider setup. Do not hard-code guessed model IDs. Stage 0 must enumerate the available models after authentication and verify the binding mechanism.

The OpenAI premium path has a hard billing requirement:

- use the user's ChatGPT subscription authentication supported by OpenCode;
- do not require an OpenAI API key for normal operation;
- do not silently fall back to OpenAI API/PAYG;
- if PAYG is ever supported later, it must be explicit opt-in and separately observable.

## Global installation, lightweight projects

The orchestration implementation should normally be installed **once globally**.

```text
MACHINE
~/.config/opencode/
└── plugins/
    └── token-efficient/
        └── one shared implementation

PROJECT A/
├── AGENTS.md
├── .codebase/
└── .tasks/

PROJECT B/
├── AGENTS.md
├── .codebase/
└── .tasks/
```

Projects contain only project-specific rules, durable project knowledge, generated structural artifacts when enabled, and task state. They should not contain copies of the controller or Context Engine.

This preserves the low-maintenance goal: improvements to routing, context selection, telemetry, or handoff logic are made once in the global plugin and become available across projects.

Project-level OpenCode configuration may override global defaults only when a repository genuinely needs different behavior.

## Distribution target

Develop locally first. If the architecture proves useful and OpenCode's supported packaging mechanism is suitable, package the plugin so installation can eventually be reduced to normal OpenCode plugin/package configuration.

Do not make packaging/distribution a V1 requirement. First prove the architecture locally.

# Design Clarifications from Architecture Review

## Premium path: Stage 0 must verify integration type

The premium tier is the single most important Stage 0 dependency. It is not enough to verify that ChatGPT subscription authentication exists.

Stage 0 must determine whether the authenticated OpenAI path exposed to OpenCode is:

1. **Raw model/provider access** — OpenCode/plugin-controlled messages and tools are the effective model context. This is the preferred case because context packets, budgets, filtering, and telemetry can be enforced.
2. **Hosted-agent access** — the remote service performs additional autonomous context management or tool use outside the plugin's control. In this case, the architecture must not claim strict premium context enforcement. Treat this as a degraded capability and benchmark it separately.

The capability matrix must therefore include:

```text
Capability                              Supported?   Mechanism   Notes
ChatGPT subscription authentication     ...
Premium path type: raw vs hosted agent  ...
Outbound message transformation         ...
Premium tool-use control/visibility      ...
Premium context enforceability           ...
Premium usage/token metadata             ...
```

### Premium accounting fallback

The primary KPI remains useful completed work per scarce premium token when reliable token metadata is available.

If the ChatGPT subscription path does not expose reliable token usage, do not block the project. Record proxy metrics instead:

- premium call count;
- estimated request tokens from the exact payload visible to the plugin;
- estimated response tokens from visible output;
- request/response byte or character counts;
- duration;
- task success and human rework;
- any provider-reported allowance/rate-limit signals.

Label estimates explicitly as estimates. Never mix estimated and provider-reported token counts without distinguishing them.

Do not assume a fixed ChatGPT subscription capacity. Plus/Pro limits, model availability, and subscription-backed coding allowances may differ and may change. Stage 0 records the observed behavior and Stage 1 benchmarks under the user's actual subscription.

## Context Engine operating modes

The Context Engine has two supported modes. This prevents the plugin from accidentally becoming a replacement agent loop.

### Preferred: packet mode

Use packet mode only when OpenCode exposes supported hooks that allow a task-specific request/message context to be constructed without reimplementing sessions, tool execution, or the core agent loop.

Possible mechanisms to verify in Stage 0:

- request/message transformation hooks;
- context hooks;
- subagent/child sessions initialized with constructed context.

### Degraded: in-session hygiene mode

If OpenCode does not safely support fresh packet construction, retain the native OpenCode session/history and optimize it rather than replacing it:

```text
native OpenCode history
    + selective project-memory injection
    + deterministic retrieval
    + filtered tool results
    + controlled compaction
    + targeted exact-source reads
```

In this mode, context budgets are optimization targets rather than guarantees.

**Hard rule:** do not recreate OpenCode's agent/session loop merely to obtain perfect packet isolation. If packet mode requires fork-like maintenance inside a plugin, use in-session hygiene mode instead.

## Human checkpoints

The Task Controller must support explicit human approval gates before high-impact operations. At minimum, checkpoint policies should cover:

- destructive operations or irreversible data changes;
- database/schema migrations;
- authentication/authorization model changes;
- large dependency or framework changes;
- broad architectural changes with high implementation cost;
- actions involving secrets, credentials, production systems, or deployment;
- other project-configured high-risk operations.

Preferred flow:

```text
reason / plan
    ↓
checkpoint required?
    ├── no  → continue
    └── yes → present concise plan + risks + intended changes
                    ↓
               user approval
                    ↓
                 continue
```

A checkpoint should happen before expensive implementation where practical. User rejection or requested changes become controller state and should not require replaying the full premium conversation.

## Cache-aware context experiments

Context minimization can reduce prefix stability and therefore reduce cache benefits. Stage 5 must measure caching where the provider exposes it.

Compare at least:

```text
lean/dynamic context
vs.
more stable reusable context
```

Record:

- uncached input tokens;
- cached input tokens or cache-hit indicators when available;
- output tokens;
- effective allowance/cost behavior if observable;
- total calls;
- task success;
- latency.

If cached-input accounting under GLM Coding Plan or the ChatGPT subscription path is opaque, record the limitation and use observable proxy metrics. Do not assume fewer raw input tokens means lower scarce allowance consumption.

## Repository hygiene

Generated project-local state must not pollute normal source-control context.

Default guidance:

```gitignore
.tasks/
.codebase/generated/
```

Whether `.codebase/ARCHITECTURE.md`, `.codebase/DECISIONS.md`, module summaries, or other durable project memory should be committed is a project policy decision. Generated caches and transient task state should normally remain ignored.

The Context Engine must also exclude its own transient/generated artifacts from broad repository retrieval unless they are being intentionally queried as memory.

## Experiment design

A/A calibration remains required, but binary task success should usually be a **quality gate**, not the sole optimization signal.

Prefer continuous primary measurements such as:

- input/output tokens or estimates;
- premium calls;
- tool calls;
- files read;
- context size;
- edit/test cycles;
- latency.

Then require objective quality checks (tests, lint, type checks, acceptance criteria, review) not to regress materially.

This makes the default rule useful:

> **INCONCLUSIVE → do not add complexity.**

## Upgrade discipline

OpenCode's extension surface is a point-in-time dependency. Keep the plugin thin and re-run the Stage 0 capability checks after material OpenCode upgrades before relying on new or changed hooks.

## Stage 0 integration gate

Before implementation, verify the current OpenCode extension surface can support the design. Produce a capability matrix covering at least:

```text
Capability                         Supported?   Mechanism / Hook   Notes
Global plugin loading              ...
Project plugin overrides           ...
Model enumeration                  ...
Per-agent/model selection          ...
Model switching during workflow    ...
Context/request transformation     ...
Tool-call observation              ...
Tool-result transformation         ...
Token/usage metadata               ...
Session/task state                 ...
Custom commands                    ...
Subagents/child sessions           ...
GLM Coding Plan connection         ...
ChatGPT subscription connection    ...
No-API-billing enforcement         ...
Plugin persistence/state           ...
Native compaction                  ...
LSP/Git/tool access                ...
Licensing/distribution             ...
```

The default architecture decision is:

> **Stock OpenCode + global plugin + lightweight configuration.**

Only consider an OpenCode fork if Stage 0 proves that a load-bearing requirement cannot be implemented through supported extension points. A missing convenience feature is not sufficient justification for a fork.

## Stage 0 --- Verify OpenCode's Actual Extension Surface

**Effort:** S--M\
**Expected impact:** Critical dependency validation\
**Do this before building architecture.**

Inspect the current OpenCode version/source/docs and verify:

-   plugin lifecycle and hooks;
-   ability to observe/intercept model requests;
-   ability to select/switch models;
-   ability to observe tool calls/results;
-   ability to filter or transform tool results before model
    reinjection;
-   ability to access token/usage metadata;
-   session/task state hooks;
-   command/custom-command support;
-   current GLM Coding Plan integration path;
-   current ChatGPT/ChatGPT Premium authentication/model path;
-   OpenRouter integration;
-   native compaction behavior;
-   LSP/Git/tool surfaces;
-   ability to persist plugin state;
-   licensing and redistribution constraints.

Also verify current provider/subscription terms before designing around
subscription-backed automation or distributing the integration.

### Stage 0 output

Create a capability matrix:

``` text
Capability                    Supported?  Hook/API       Notes
Model selection               ...
Tool-result interception      ...
Token usage                   ...
Custom commands               ...
...
```

### Stage 0 architecture gate

Preferred:

> Stock OpenCode + plugin/configuration.

Only consider a fork if a load-bearing requirement cannot be implemented
through supported extension points.

If a fork would require replacing or deeply modifying the core agent
loop, provider system, TUI, or session architecture, stop and redesign
around available hooks rather than automatically forking.

------------------------------------------------------------------------

## Stage 1 --- Baseline and Observability

**Effort:** M\
**Expected savings:** None directly\
**Importance:** Highest, because later claims depend on it.

Implement:

-   task IDs;
-   run logging;
-   model/token telemetry;
-   tool-call counts;
-   files read;
-   verification results;
-   attempts;
-   model switches;
-   latency;
-   outcome recording.

Create the 3--4 class benchmark corpus.

Run A/A calibration.

### Exit criteria

-   repeated runs can be compared;
-   metrics are stable enough to identify meaningful changes;
-   success criteria are objective for most benchmark tasks.

------------------------------------------------------------------------

## Stage 2 --- Tool-Output Filtering

**Effort:** S--M\
**Expected savings:** Very high\
**Expected risk:** Low--medium

Implement deterministic filters for:

-   tests;
-   TypeScript/compiler output;
-   lint;
-   build logs;
-   common command failures.

Preserve raw output for on-demand recovery.

### Experiment

Compare:

``` text
A: raw tool output
B: filtered tool output
```

Measure:

-   input tokens;
-   task success;
-   retries;
-   requests for missing log detail;
-   wall-clock time.

### Pass condition

Meaningful context/token reduction with no material task-success
regression.

This is an early "mother lode" hypothesis.

------------------------------------------------------------------------

## Stage 3 --- Output Discipline

**Effort:** S
**Expected savings:** Medium--high
**Expected risk:** Low

Test whether GLM can operate with minimal conversational output. Grounded in Stage 2
findings: assistant prose compounds --- every output token is re-read (cached) on every
subsequent turn; cacheRead is ~78% of billable context. Discipline targets both the
direct output tokens and the accumulated-context tail.

Detailed spec: `stage3/stage3-plan.md`.

### Implementation

-   Add `lib/discipline.ts` (plugin): a versioned rules block `discipline:v1` appended to
    the system prompt via `experimental.chat.system.transform` (Stage 0-verified hook;
    mutates the outgoing request only, never persisted history).
-   Rules v1 (deterministic text, stable telemetry dimension):
    1.  When tools are needed, call them without a prose preamble (narration removal,
        not forced tool usage).
    2.  Never restate file contents, command output, or diffs in prose.
    3.  No progress narration unless a step fails or blocks (then <=1 line).
    4.  Final response <=5 lines: files changed, verification command + verdict, anomalies.
-   Env gate `OPENRELAY_DISCIPLINE=on|off` (wins over config `discipline.enabled: false`
    default), mirroring the Stage 2 `OPENRELAY_FILTERING` pattern.
-   `run.mjs --discipline off|on` --- env passthrough + recorded in `run.json`.
-   Analyzer: 2x2 factorial mode (4 labels) --- per-lever main effects and interaction for
    tokensOut, tokensInPlusCache, tokensTotal (input + cacheRead + output), llmCalls,
    durationSec, verifyPass.
-   Non-goals: no small-model pinning changes, no logit-level control, no persisted
    message rewriting (`chat.message` injection rejected: pollutes history).

### Experiment

2x2 factorial, 5 fixtures x 3 runs per cell (60 runs, ~2--4 h GLM quota). All cells run
fresh in one window (reusing `s2b-on` as the filtering-only cell was considered and
rejected --- temporal drift). Filtering stays off-by-default in shipped config; arms
activate it via env only.

``` text
s3-base : filtering off + discipline off
s3-filt : filtering on  + discipline off
s3-disc : filtering off + discipline on
s3-both : filtering on  + discipline on
```

### PASS gate (pre-registered, per lever)

-   Quality: 100% verify success and 100% telemetry joins, all four arms.
-   Discipline hypothesis gate: >=25% mean tokensOut reduction (mechanism metric)
    outside variance.
-   Discipline economic metric: tokensTotal = input + cacheRead + output over the whole
    task --- must not regress; change explicitly reported and drives the enable decision.
-   No turn-count regression: s3-disc and s3-both must not systematically increase
    llmCalls (Stage 2 lesson: omitted info can force recovery turns that erase savings).
-   Filtering main effect: replicates Stage 2b (sanity check, >=20% tokensInPlusCache on
    fixture 05).
-   No destructive interaction: s3-both tokensInPlusCache <= s3-filt (discipline must not
    erode the filtering win); no rework/error/latency regression outside the noise floor.
-   Verdicts are per-lever: each of discipline/filtering PASSes or fails independently;
    enabling either by default requires its own PASS. INCONCLUSIVE (savings inside noise)
    --- keep off, remove unvalidated complexity.


## Stage 4 --- Task Controller v1

**Effort:** M\
**Expected savings:** High\
**Expected risk:** Medium

Implement deterministic:

-   GLM default routing;
-   ChatGPT Premium explicit routing;
-   retry counters;
-   escalation rules;
-   context-expansion signals;
-   risk/complexity heuristics;
-   user overrides.

No LLM router yet.

Suggested overrides, subject to Stage 0 capabilities:

``` text
/auto
/glm
/chatgpt
/plan
/review
/deep
```

### Experiment

Compare:

``` text
A: premium-heavy/manual baseline
B: GLM-first deterministic routing
```

Measure scarce ChatGPT Premium tokens, success, rework, and latency.

------------------------------------------------------------------------

## Stage 5 --- Context Engine v1: Deterministic Retrieval

**Effort:** M\
**Expected savings:** High\
**Expected risk:** Medium

Implement:

-   Lean/Normal/Expanded/Deep policies;
-   Git retrieval;
-   `rg` retrieval;
-   LSP retrieval;
-   targeted reads;
-   packet builder;
-   exact-source-on-demand;
-   context expansion.

Do not build the Aider mapper yet.

### Experiment

Compare:

``` text
A: normal/native exploration
B: prepared context packet + progressive exact retrieval
```

Measure:

-   input tokens;
-   files read;
-   searches/tool calls;
-   first-pass success;
-   retries;
-   task success.

------------------------------------------------------------------------

### Stage 5 cache/accounting requirement

Measure lean/dynamic context against a more stable-context baseline and record cache effects where exposed. Cached-token behavior can change the apparent economics of context minimization.

### Stage 5 implementation boundary

Use **packet mode** only through supported OpenCode context/request/subagent mechanisms. If those mechanisms are insufficient, use **in-session hygiene mode**. Do not implement a replacement agent/session loop inside the plugin.

## Stage 6 --- Shared Project Memory and Structured Handoffs

**Effort:** M\
**Expected savings:** Medium--high, especially multi-step work\
**Expected risk:** Medium

Implement:

``` text
AGENTS.md
.codebase/
.tasks/<task-id>/
```

Start with minimal schemas.

Implement ChatGPT Premium→GLM and GLM→ChatGPT Premium handoff formats.

Add provenance/staleness metadata for derived memory.

Do not automatically generate large architecture documents on every
task.

### Experiment

Compare long/multi-agent tasks:

``` text
A: conversation/history transfer
B: structured handoff + selective project memory
```

Measure:

-   transferred tokens;
-   downstream task success;
-   details lost;
-   rework;
-   premium tokens.

------------------------------------------------------------------------

## Stage 7 --- ChatGPT Premium Escalation and Review Policy

**Effort:** M\
**Expected savings:** High premium-token efficiency\
**Expected risk:** Medium

Refine when ChatGPT Premium is used.

Test:

-   number of GLM attempts before escalation;
-   expand-context-before-escalate vs immediate escalation;
-   which task/risk classes benefit from ChatGPT Premium planning;
-   which changes benefit from ChatGPT Premium review.

Do not optimize for "ChatGPT Premium used as little as possible." Optimize for
useful work per scarce token.

### Experiment examples

``` text
GLM 1 attempt → ChatGPT Premium
GLM 2 attempts → ChatGPT Premium
GLM + context expansion → ChatGPT Premium
```

and:

``` text
no premium review
vs
risk-triggered premium review
```

------------------------------------------------------------------------

## Stage 8 --- Aider-Inspired Repo Map

**Effort:** L\
**Expected savings:** Potentially high on large repositories\
**Expected risk:** Medium--high\
**Build only if Stage 5 telemetry shows excessive exploration.**

Possible implementation:

-   Tree-sitter/LSP symbol extraction;
-   definition/reference graph;
-   dependency graph;
-   task-specific ranking;
-   Aider-style graph ranking;
-   token-budgeted map renderer;
-   incremental cache invalidation;
-   `.codebase/generated/`.

### Entry condition

Only start if metrics show native retrieval is a meaningful bottleneck,
e.g. excessive searches, file reads, or retrieval tokens on
medium/difficult tasks.

### Experiment

``` text
A: deterministic native retrieval
B: native retrieval + repo map
```

Measure:

-   task success;
-   input tokens;
-   files read;
-   searches;
-   latency;
-   map-generation overhead;
-   stale-map failures.

If quality drops materially, remove it even if tokens decrease.

------------------------------------------------------------------------

## Stage 9 --- OpenRouter Free Context Agents

**Effort:** M\
**Expected savings:** Unknown/possibly medium\
**Expected risk:** Privacy + integrity

Start only after deterministic filtering/retrieval is working.

Candidate experiments:

-   filtered log → free compression → GLM;
-   selected source → free summary → GLM;
-   task state → free structured handoff.

### Security requirements

-   source access off by default;
-   explicit opt-in;
-   provider terms checked;
-   derived output marked untrusted;
-   no free-model output may alter controller/system policy;
-   critical claims recoverable against exact source.

### Experiment

Compare downstream outcomes, not just compression ratio:

``` text
A: deterministic filtering only
B: deterministic filtering + free model
```

Measure:

-   scarce tokens;
-   total tokens;
-   task success;
-   omitted critical details;
-   latency;
-   failure rate.

If the free model merely adds complexity, remove it.

------------------------------------------------------------------------

## Stage 10 --- Advanced Optimization Only If Needed

**Effort:** L--XL\
**Expected savings:** Unknown\
**Default:** Do not build.

Candidates:

-   smarter model-assisted routing;
-   richer semantic memory;
-   advanced cache optimization;
-   provider allowance-pressure routing;
-   additional premium/workhorse models;
-   LiteLLM at an API/PAYG boundary;
-   vector retrieval.

Every item requires evidence from telemetry that a simpler component is
a real bottleneck.

------------------------------------------------------------------------

# 16. Stage Priority / ROI Hypothesis

Initial ranking:

  Optimization                           Effort            Expected ROI   Build priority
  ------------------------------------ -------- ----------------------- ----------------
  Observability                               M   Enables all decisions                1
  Tool-output filtering                    S--M               Very high                2
  Output discipline                           S         High for effort                3
  GLM-first deterministic routing             M               Very high                4

(Output capped at 50 KB. Showing lines 1-1885. Use offset=1886 to continue.)
