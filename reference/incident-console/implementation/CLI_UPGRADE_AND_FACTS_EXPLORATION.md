# CLI upgrade and codebase-facts exploration

Status: non-normative exploration. This document records an implementation
proposal and migration inventory; it does not amend `CLI.md` or add a public API.
Its former open `BEH-033` question is closed by `REV-MIG-005` and `WIRE-020B`; the
exact private v2 model lives in those normative authorities.

## Decision in one sentence

Make the CLI a fact projection over one Flow-owned model: compiled behavior
facts come from the `AppPlan`, runtime facts come from retained trace evidence,
and source usage facts come from a bounded TypeScript index. Keep those three
evidence sources visibly separate.

The CLI must not become a second runtime, actor engine, scheduler, history,
artifact decoder, semantic compiler, or generic query language.

## What the audits confirmed

The accepted vNext CLI contract is not yet represented by the implementation.
The current implementation still has the old command grammar, Scenario-based
Story execution, legacy artifact wrappers, a structural gateway validator,
direct artifact writes, and leaf-owned exit status.

The current behavior projection is also too weak for the accepted machine model:
it emits flat states with `terminal` and `childIds`, while the new model has
recursive substates, compound defaults, ancestor event handling, context
bindings, operation identities, lifecycle evidence, and `run.end`.

The requested “who depends on this machine/actor/event?” report cannot be
derived from the current gateway. The gateway exposes compiled app values and
module metadata, not source files, symbols, line locations, or dispatch
call-sites. That capability needs a separate static-analysis lane.

## 1. Required cutover before new features

These are already implied by the accepted vNext contract. They are migration
work, not new design decisions.

| Area                   | Current implementation                                                                                                                                                                                    | Required disposition                                                                                                                                                         |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Grammar                | `packages/flow-state/src/cli/index.ts:302-949` has optional artifact flags, legacy formats, extra Story flags, and `story paths`.                                                                         | Match `contracts/CLI.md:20-44` exactly. Add `behavior check`; make artifact operands positional; add `--trace-output` and `--force`; reject deleted flags.                   |
| Story execution        | `cli/index.ts:605-612` and `cli/story-run.ts` route through `runFlowScenarioWithDiagnostics` and CLI Scenario envelopes.                                                                                  | Route `story run` through the same package-private production Story executor used by `StoryPlan.run()`. Share checkpoints, `run.end`, Cause, cleanup, and retained evidence. |
| Deleted Story surface  | `story paths` is registered at `cli/index.ts:851-947` and traverses the old testing model.                                                                                                                | Delete the command, parser, result envelopes, and `story-paths.ts` CLI path. Keep pure model discovery only under the testing boundary required by the accepted revisions.   |
| Artifact input         | `cli/trace-input.ts:115-160` reads unbounded input and accepts local-proof and Scenario wrappers. `core/inspection/trace-artifact.ts:57-83` fabricates a one-state machine and preserves legacy children. | Use one bounded Flow-owned decoder and WIRE-016 validation. Do not accept deleted wrappers or synthesize machine meaning. Implement the exact WIRE-020B v2 envelope.         |
| Behavior shape         | `core/inspection/behavior-contract.ts:76-108` and `:291-338` emit flat states, `terminal`, and `childIds`.                                                                                                | Replace the projection after the coordinated artifact/schema closure with recursive state facts, context requirements, operations, and Story metadata.                       |
| Gateway                | `cli/gateway.ts:55-141` has a second structural validator; `:143-215` searches ancestor dependencies and merges module trees.                                                                             | Consume the branded `BehaviorGateway`. Keep only canonical containment, manifest/dependency, static-import, package-identity, and cleanup checks required by `CLI.md:55-85`. |
| Artifact writes        | `cli/index.ts:324-331` and `:617-633` write directly.                                                                                                                                                     | Use bounded encoding, mode `0600` sibling temporary files, and same-directory hard-link/rename commit semantics from `CLI.md:118-146`.                                       |
| Process ownership      | `story run` mutates `process.exitCode` at `cli/index.ts:650-654`; the process owner maps all failures to `1` at `:951-976`.                                                                               | Return one immutable private result. Let one process owner select `0`, `1`, `2`, `130`, or `143` after runtime disposal and cleanup.                                         |
| Artifact-only behavior | `trace summarize --contextualize` loads the gateway at `cli/index.ts:693-727`.                                                                                                                            | Artifact-only commands must not execute application code. Remove contextualized live loading or make the required identity part of the accepted artifact.                    |
| Inspection history     | The current sink can retain an unbounded array in `core/inspection/inspection-sink.ts:62`, while the accepted default is bounded.                                                                         | Retain one bounded sink only when tracing is requested. Preserve truncation markers and never infer absence from a truncated window.                                         |

The implementation cutover should delete, not alias, these surfaces:

- `story paths`, `story run --check`, `--pending-work`, and `--save-trace`;
- `pretty` and `compact` format modes and flag-based artifact operands;
- Scenario and local-proof decoding, `final`, `children`, and `child-outcomes`;
- CLI-owned Scenario/result/evidence envelopes and duplicate gateway semantics;
- direct output writes and leaf-level process exit mutation.

The old names must be absent from the shipped declarations, command help,
examples, docs, and positive CLI proofs. Rejected aliases would prolong the
ambiguity and make source/packed parity harder to prove.

## 2. The fact model

The product goal is a fast answer to “what is true about this codebase?”
without requiring a user to read the implementation. That requires provenance,
not merely more fields in one large JSON object.

### Three evidence lanes

| Lane             | Authoritative source                                                                       | Can answer                                                                                                   | Cannot claim                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Compiled plan    | One immutable `AppPlan`/fact index built from the branded gateway                          | What machines, substates, context requirements, operations, modules, Stories, and ownership the app admits   | That a state or event was executed in the observed run                                    |
| Static source    | A TypeScript/TSX program index built without executing application code                    | Which files, symbols, components, Stories, tests, actor calls, and event dispatch sites reference a subject  | That a dynamic/reflected/generated call executes, or that a static reference is reachable |
| Runtime evidence | Shared TurnRecords, lifecycle records, checkpoints, `run.end`, and bounded trace artifacts | What exact actor, event, transition, operation, context, resource, stream, and cleanup activity was observed | That an absent fact did not happen when the capture is incomplete or truncated            |

Every result should carry its evidence tier and completeness state. Recommended
labels are `compiled-plan`, `static-source`, `runtime-observed`,
`partial`, and `unknown`. These are proposal vocabulary only until the result
and artifact contracts are closed.

### Keep the graphs separate

The CLI should expose separate views rather than combining unrelated edges into
a misleading “machine hierarchy”.

| View                    | Nodes and edges                                                                                                                | Meaning                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| State tree              | One machine's recursive compound states, defaults, active leaves, transitions, timers, activities, and redirects               | Nested substates share one actor and mailbox. This is the actual hierarchy.                        |
| Context graph           | Consumer machine/actor → required context slot → exact provider machine/actor/ref and selector/revision                        | Readonly dependency and propagation. It is not actor parentage, ownership, or machine inheritance. |
| Actor graph             | Exact actor refs → machine identity, owner lease, provider bindings, lifecycle, operations, and dependents                     | Live runtime relationships for the current runtime incarnation.                                    |
| Operation graph         | Machine/actor → named descriptor → canonical `K`/generation/occurrence → resource, transaction, stream, timer, or invalidation | Declared and observed operation identity without collapsing descriptor and runtime occurrence.     |
| Story coverage          | Story → actor recipe/ref → command sequence → checkpoints → machine states/transitions/operations observed                     | Evidence about test intent and execution, not a second assertion model.                            |
| Source provenance graph | File/symbol/component → machine/actor/event/operation/resource and reverse dependents                                          | Static references and call-sites with locations and resolution status.                             |

The user-facing context report can look tree-like for readability, but its
serialized semantics must remain a provider graph. Calling it “inheritance” or
“parent/child ownership” would create behavior not present in the contract.

## 3. Facts needed for a fast glance

### Machine facts

`behavior render` should eventually show, from the compiled plan:

- exact machine and module identity;
- a recursive state tree with fully qualified paths, leaf/compound kind,
  authored defaults, and active-leaf representation;
- event handlers at every ancestor/leaf, transition targets, guard/action
  identity or presence, redirects, reentry, timers, and activities;
- reachability and dead-state candidates clearly labeled as compiled analysis,
  not runtime proof;
- operation declarations, context requirements, and Story references.

Do not serialize function bodies. Stable authored identities, presence flags,
and runtime outcomes are sufficient for the first fact surface.

The old `childIds` field must not be reused for substates. It described invoked
child machines, which the accepted machine model removes; recursive substates
are a different structure.

### Context and actor facts

A context report should show the exact provider and consumer bindings, selected
context keys, provider refs, dependency order, revisions/propagation evidence,
and unresolved or cyclic requirements. An actor report should show the durable
or runtime-local ref, machine identity, app/module ownership, lifecycle, owner
lease boundary, provider bindings, and operations observed for that actor.

Static actor references and runtime actor identities must remain distinct. A
source call-site can identify `ensureActor` or a hand-authored ref; only runtime
evidence can prove which actor incarnation was active in a capture.

### Story and test facts

`story list` and `story describe` should expose declared facts without creating
a runtime: Story kind, app/machine identity, tags, fixtures, boot/context
requirements, `maxTurns`, command count/sequence, actor targets, recipe/ref
bindings, controlled operation descriptors, canonical `K`, occurrence, and
checkpoint names.

`story run` should project the shared executor result: exact actor-targeted
checkpoints, `runtime.now`, pending work, `run.end`, TurnRecord/lifecycle
counts, operation generations, stream latest-value state, context turns,
failures, and cleanup truth.

“Flaky” must not be inferred from one run. A future health report would require
bounded repeated runs, stable environment metadata, and retained failure
evidence. Virtual time and wall-clock duration must be reported separately.

### Operation, resource, and reactivity facts

The compiled plan should inventory resources, transactions, streams, timers,
canonical-key rules, queue/concurrency policies, invalidation routes, and
machine operation requirements. Runtime traces should add generations,
occurrences, previews, rollback/commit outcomes, stream terminal status, and
StoreFanout publication evidence when those records exist.

A high-value future report is:

```text
resource/transaction/stream
  -> descriptor and canonical K
  -> owning actor bindings
  -> dependent selectors/actors/components
  -> invalidation and publication routes
  -> observed generations, outcomes, and cleanup
```

This supports the “machine as reactive state” goal without making the CLI own
subscriptions. Reactivity remains a runtime-owned behavior; the CLI only
projects declared and observed facts about it.

## 4. Requested dependency and event-callsite feature

The recommended first source-analysis capability is one finite command, not a
general query language:

```text
flow-state code explain <selector> [--project-root <dir>] [--tsconfig <path>] [--format text|json]
```

This is a proposed contract amendment. It must not be added to the exact
accepted leaf set silently.

Candidate selectors are finite and data-only:

```text
machine:<machine-id>
event:<machine-id>/<event-type>
actor-ref:<stable-ref>
operation:<family>/<descriptor-id>
resource:<resource-id>
story:<story-id>
```

For a machine or actor selector, the result should include:

- imports, exports, registration, module ownership, and re-exports;
- `createActor`, `ensureActor`, exact lookup, `useActor`, and `useActorByRef`
  call-sites;
- `actor.send`, `send`, event-constructor, Story-command, and test call-sites;
- machine handlers and event transition targets from the compiled plan;
- operation/resource/view/context references;
- forward dependencies and reverse dependents, each with project-relative
  file, line, column, enclosing symbol, syntax kind, and confidence;
- runtime-observed matches when a compatible trace is supplied;
- unresolved aliases, dynamic imports, reflection, generated files, and
  dynamic dispatches as explicit unknowns.

Recommended status semantics:

| Finding            | Meaning                                                              |
| ------------------ | -------------------------------------------------------------------- |
| `static-exact`     | Direct source reference resolved by the TypeScript program.          |
| `static-inferred`  | Reference resolved through a known local alias or exported binding.  |
| `runtime-observed` | Matching activity appeared in retained runtime evidence.             |
| `dynamic-unknown`  | The analyzer found a dynamic boundary and cannot prove the full set. |

The report must say “not found by this parser” rather than “no callers” when
the static index is incomplete. It must say “not observed in this complete
capture” rather than “never happened” for runtime absence.

### Static-analysis implementation boundary

The analyzer should use the installed TypeScript compiler and selected
`tsconfig`, parse each source file once, and build forward and reverse indexes.
It must not import or execute the application gateway, instantiate actors, run
Effects, read mutable runtime stores, or fabricate events. Generated files and
unsupported language/project boundaries must be marked and bounded.

Source facts should use project-relative paths and stable call-site identities;
absolute paths make results non-portable and defeat deterministic diffs.

## 5. Recommended command evolution

Use existing commands for facts that already belong to their evidence source:

| Command                         | First useful projection                                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `behavior render`               | Compiled app/module inventory, recursive machine state facts, context graph, operation graph, ownership, and Story declarations.      |
| `story list` / `story describe` | Inert Story metadata, actor recipes/refs, commands, fixtures, checkpoints, and operation descriptors.                                 |
| `story run`                     | Shared production execution evidence, `run.end`, actor/lifecycle/operation/context/resource facts, and optional bounded trace output. |
| `trace summarize`               | Retained-window lifecycle, operation, resource, transaction, stream, timer, context, and issue facts.                                 |
| `trace proof` / `trace diff`    | Exact actor/correlation evidence and complete/different/incomplete comparisons.                                                       |

Only source provenance needs a new namespace. A separate `behavior facts`
family with one leaf per machine/context/event/operation/ownership/reactivity/
persistence/architecture report would duplicate `behavior render`, multiply
result schemas, and make the exact CLI set harder to reason about.

If the first source-analysis slice proves useful, add only the finite
`code explain` leaf. Consider `code impact` or `story health` later, after
their input completeness and repeatability rules are measurable.

## 6. Performance and safety guardrails

The first implementation should have these limits:

1. Build one immutable `AppPlan`/fact index per gateway load. Reuse it for
   behavior render, Story discovery, context, ownership, operations, and
   coverage. Do not call `app.inventory()` independently for each projection.
2. Parse source files once and retain both forward and reverse indexes. Use an
   index-based queue/deque for graph traversal; the current `Array.shift()` in
   `core/inspection/graph-descriptor.ts:242-265` becomes quadratic at scale.
3. Bound artifact input, AST files, result nodes/edges, output bytes, trace
   retention, and recursive depth. Every truncation must be explicit and
   preserve an incomplete status.
4. Keep caches outside the project root. If measurement justifies caching,
   key it by gateway/import/dependency/TypeScript-config/content fingerprints;
   do not introduce a daemon or project-local generated state as the first step.
5. Keep artifact commands gateway-free and source analysis execution-free.
   Trusted gateway loading remains limited to the accepted live commands and
   must preserve package identity and temporary-file cleanup guarantees.

The CLI process may retain its Effect runtime for process I/O and cleanup. That
does not count as a second Flow domain runtime. Live, tests, Stories, and the
CLI Story path must all use the one production Flow runtime implementation.

## 7. Proof and documentation updates

The accepted migration needs executable proof updates in the following areas:

- exact new grammar and rejection of every deleted command/flag;
- source/packed CLI parity and fresh installed-binary execution;
- inert discovery and artifact-only no-gateway behavior;
- bounded WIRE-016 input, atomic output, stdin, truncation, and signal cleanup;
- direct `StoryPlan.run()` and CLI `story run` evidence parity;
- compound states, context requirements, actor identity/lifecycle, operations,
  and complete/different/incomplete trace comparisons;
- source-analysis completeness labels, dynamic-boundary handling, deterministic
  locations, and no application-code execution.

Likely implementation and proof owners are:

| Owner                                                                     | Work                                                                                         |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `packages/flow-state/src/cli/index.ts`                                    | Grammar, one result/output owner, process exit and signal handling.                          |
| `packages/flow-state/src/cli/story-run.ts` and Story internals            | Shared production executor and evidence projection.                                          |
| `packages/flow-state/src/cli/gateway.ts`                                  | Branded gateway loading and project/package boundary.                                        |
| `packages/flow-state/src/cli/trace-input.ts` and inspection artifact code | One bounded decoded model; remove legacy reconstruction.                                     |
| `packages/flow-state/src/core/inspection/*` and CLI tests/docs            | Recursive facts, context/operation projections, queue/performance fixes, and cutover proofs. |

The normative files that would require amendment for new source commands or
fact sections are `contracts/CLI.md`, `contracts/PUBLIC_API.md`, and
`contracts/PROOF_MATRIX.md`. `contracts/PERSISTENCE_AND_ARTIFACTS.md` is now the
schema authority: exact JSON fields, codecs, and diagnostic shapes are frozen by
`WIRE-020B`; this exploration remains implementation planning only.

## 8. Open decisions for later discussion

These are intentionally not resolved here:

- Should the first new source command be `code explain`, or should source
  provenance be exposed only through an existing artifact command after a
  separate artifact input is supplied?
- Which finite `behavior render --section` values are worth adding beyond
  `contract` and `coverage`, and which facts belong in the default text glance?
- Does source analysis need a compiled behavior artifact for machine-ID
  correlation, or should the initial selector surface be source-symbol based?
- Which runtime fact sections are retained in the bounded trace artifact, and
  which remain in-memory-only projections?
- What output budgets are appropriate for recursive states, source call-sites,
  reverse dependency edges, and combined static/runtime reports?

Until these decisions are accepted, implement only the already-accepted CLI
cutover and keep the fact-query surface behind package-private exploratory
code/tests.
