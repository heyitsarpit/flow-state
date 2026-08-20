# Migration and proofs

This chapter is the complete accepted migration and proof contract. It defines which public decisions stay
closed, which old surfaces must be removed rather than aliased, which contract and artifact families must
move together, and which compile-time and runtime evidence is required before promotion. A source location
in a `Provenance` field is historical evidence only and adds no migration or proof semantics.

## REV-MIG-001 — Treat accepted public decisions as closed during behavioral closure

**Change:** Separate accepted public design from unresolved implementation semantics.

**Provenance (non-normative):** `DESIGN_REVISIONS.md:1130-1150`.

**Rule:** Actor composition and ownership, the React hook split, module tooling identity, Story
constructors and commands, transition actions, named operation families, reactive-context authoring, and
the actor/ref/lease capability split MUST NOT be reopened merely to resolve the behavioral gaps recorded in
[`UNRESOLVED_BEHAVIOR.md`](../../../revision-spec/UNRESOLVED_BEHAVIOR.md).

Most `BEH-*` items are lifecycle, ordering, ownership, persistence, observation, evidence, cleanup,
compatibility, and proof problems under the accepted surface. Resolving one MUST NOT rename, overload,
replace, or add a competing public API. `BEH-027` is closed by `REV-OPS-016`; `BEH-024` is closed by
`REV-OPS-015`, which accepts timer event-targeting and explicit-refresh polling. A failed proof MAY reopen
only the exact guarantee that cannot be implemented; it does not authorize silent API or semantic
substitution.

Runtime-sized keyed subscription collections remain explicitly deferred and outside this migration.

The accepted public baseline that closure work MUST preserve is:

- definitions own static input, memory, event, state, context, and operation shape; machines own behavior;
  apps close machine and operation admission;
- modules retain tooling identity without creating automatic root actors;
- recursive compound states replace child machines;
- `actorRef`, `createActor`, `ensureActor`, `getActor`, owner leases, and exact context bindings preserve the
  accepted identity and ownership split;
- React uses `useActor`, `useActorByRef`, and `useView` with the four-state production lifecycle;
- Story uses the three constructors and closed command, observation, checkpoint, and result shapes defined
  in the Story chapter; and
- named operation families and transition `actions` replace generic registries and the old action grammar.

Closure work MAY define internal owners, record types, ordering laws, diagnostics, persistence rules, and
proof machinery. It MUST NOT silently rename, overload, replace, or add a competing public operation.

## REV-MIG-002 — Migrate contracts and proofs as one coordinated replacement

**Change:** Prohibit additive aliases and partial promotion of the accepted Story surface.

**Provenance (non-normative):** `DESIGN_REVISIONS.md:696-859`,
`DESIGN_REVISIONS.md:1145-1178`, and `DESIGN_REVISIONS.md:1304-1402`.

**Rule:** Migration MUST close every applicable `BEH-*` item, rewrite every superseded contract and public
type, update the working operation specification, add the required compile-time and runtime proofs, and
remove incompatible old surfaces together.

The Story migration MUST:

1. Replace callable `story({ app, machine, start? })` with non-callable
   `story.app(runtimeSetup, options?)`, `story.machine(machine, options?)`, and
   `story.actor(machine, options?)`; remove `.with(...)`, bare-app app Stories, and live-runtime Story
   inputs.
2. Move fixtures and `maxTurns` into the closed app and machine constructor options, retain descriptive
   metadata there, keep persistence under the `RuntimeSetup` provider, enforce conditional machine input and
   selected-context requirements, and give actor recipes only exact input and `contextBindings`. Recipe
   bindings MUST accept compatible recipes or stable refs and migrate to dependency-ordered creation and
   reverse-order cleanup.
3. Require live hosts and `story.app` to use one typed production `RuntimeSetup` and constructed `Runtime`, with architecture and
   parity proofs rejecting a second runtime, actor, mailbox, scheduler, operation, cache, transition,
   snapshot, or cleanup implementation.
4. Replace `perform`, `deliver`, and `receive` with complete service `Implementation` providers. Story
   execution retains the production operation kernels; no `simulate`, control registry, per-call matcher,
   or result-injection command is public.
5. Replace `flush` and `settle` with `process`, rename `setTime` to `advanceTo`, and remove implicit progress
   from observation and clock movement.
6. Replace result `final` with `run.end`, and replace app checkpoint machine-ID maps with
   `checkpoint.actor(storyActor | actorRef)` plus reserved `runtime` metadata.
7. Add exact-actor app `send` targeting. Target-free forms MUST remain exclusive to machine Stories;
   `setContext` MUST remain exclusive to machine Stories; app Stories MUST reject direct context
   injection.
8. Remove fresh machine-Story memory, state, snapshot, and boot overrides. Focused Stories MUST use the
   production memory initializer and exact input.
9. Remove every child-machine Story command, control, snapshot, pending-work, and model surface with the
   broader child-machine deletion.

The React and actor migration MUST:

1. Expose `actorRef(machine, id)` as inert stable identity, make
   `runtime.createActor(machine, { input, contextBindings? })` return a local owner lease, add owner-only
   `runtime.ensureActor(ref, { input, contextBindings? })`, and keep `runtime.getActor(ref)` lookup-only.
   Input MUST be required exactly when the machine requires it, and `contextBindings` MUST mirror every
   declared context key.
2. Remove terminal disposal from ordinary actor handles and refs. The separate `{ actor, dispose }` lease
   MUST carry the only individual disposal capability, while runtime shutdown subsumes outstanding leases.
3. Replace any render-time shell-and-swap behavior with one prepared actor whose final ref, handle, snapshot,
   and command-buffering mailbox survive commit and reconnection unchanged.
4. Replace `active | disposed` with `prepared | active | suspended | disposed`; add `actor:suspend` and
   `actor:resume`, preserve start/restore/dispose, and add no preparation event.
5. Expose exactly `useActor(machine, options?)`, `useActorByRef(ref)`, and `useView(actor, selector)` for local
   creation, shared lookup, and reactive observation. Remove registered views, view IDs, module view
   registries, per-actor React Context, binding components, and disposal through hooks.
6. Keep `FlowProvider` runtime-only, preserve imperative `runtime.createActor` as immediately attached, and
   route React attachment through the production actor lifecycle rather than a React-owned actor engine.

The glossary, public API, type system, runtime semantics, snapshots, architecture, React and host contract,
testing contract, persistence and artifacts, compatibility and deletion, CLI, proof matrix, Beads issues,
fixtures, compile proofs, and runtime proofs MUST be updated consistently rather than leaving two
authorities or a partially migrated public surface.

The replacement MUST be atomic at the contract level. Generated and handwritten public types MUST NOT
expose both old and new constructors, commands, targets, lifecycle values, view registries, child-machine
fields, result fields, or operation grammar. Compatibility documentation MUST identify each removal and its
accepted replacement; it MUST NOT present deleted names as supported aliases. Artifact and CLI schemas MUST
represent app Stories, exact actor evidence lookup, `run.end`, module tooling ownership, compound states,
context requirements, lifecycle records, and operation identities before examples or Beads issues claim the
revision is implemented.

The exhaustive old-surface inventory, disposition categories, no-residue rule, retained boundaries, and
deletion-specific absence proofs are owned by `REV-MIG-004` and `DEL-001` through `DEL-011`. This clause
MUST be read with that ledger; a vague reference to a superseded surface MUST NOT be treated as permission
to retain an alias or as evidence that deletion is complete.

## REV-MIG-003 — Prove every accepted surface against the production owners

**Change:** Consolidate the accepted cross-cutting proof boundary.

**Provenance (non-normative):** `DESIGN_REVISIONS.md:677-694`,
`DESIGN_REVISIONS.md:778-792`, and `DESIGN_REVISIONS.md:1115-1150`.

**Rule:** Compile-time proofs MUST preserve exact machine, actor-ref, event, input, context, memory,
operation, selected-value, Story-target, observation, and checkpoint types. Runtime proofs MUST exercise
the real production actor lifecycle, mailbox, context graph, scheduler, operation kernels, inspection,
persistence, evidence capture, and cleanup paths. Focused source-text or type checks MUST NOT stand in for
behavior proofs.

Each detailed proof obligation remains owned by the semantic `REV-*` clause that defines the behavior;
this migration clause aggregates their completion status and MUST NOT add or weaken an obligation. In
particular, actor/ref/lease and bootstrap proofs are owned by `REV-COMP-011` through `REV-COMP-015`, React
lifecycle proofs by `REV-HOST-002` through `REV-HOST-005`, Story construction and evidence proofs by
`REV-TEST-001` through `REV-TEST-010`, operation proofs by `REV-OPS-001` through `REV-OPS-018`, host-write
proofs by `REV-HOST-008`, and artifact/CLI and child-removal proofs by `REV-MIG-005` and `REV-MIG-006`.

The cross-cutting parity proof MUST execute equivalent domain-command sequences through live and Story
hosts and compare snapshots, `TurnRecord`s, pending work, operation facts and generations, context turns,
and cleanup evidence. Architecture checks MUST reject any separate Story/testing runtime, actor, mailbox,
scheduler, operation store or kernel, transition engine, cache, snapshot implementation, or cleanup engine.
React lifecycle inspection evidence remains outside the machine timeline, so parity MUST NOT add synthetic
Story suspend or resume commands.

## REV-MIG-005 — Freeze one private v2 artifact and CLI model

**Change:** Close `BEH-033` by promoting one bounded artifact/CLI schema authority without adding public
artifact types, AppPlan fingerprint APIs, or commands, while preserving complete Cause values on the
declared public Flow error boundaries.

**Provenance (non-normative):** User-directed Cause-visibility amendment and the WIRE-020B schema-closure
repair recorded in this accepted revision. This pointer records the override and adds no separate behavior.

**Rule:** `PERSISTENCE_AND_ARTIFACTS.md` WIRE-020B owns the exact package-private behavior-contract v2,
trace-artifact v2, serialized Cause projection, Story failure projection, and decoded evidence model. `CLI.md` owns only the existing
ten-leaf command grammar, transport, rendering, exit status, and file publication. Direct Story execution
and CLI `story run` MUST consume that one decoded model; no CLI-only decoder, result hierarchy, legacy `final`
or `children` alias, Scenario surface, or new source-analysis command is permitted.

Behavior and trace artifacts use the exact WIRE-020B canonical JSON grammar: UTF-8 lexicographic object keys,
strict finite-number and string encoding, semantic ordering for authored state, checkpoints, records, facts,
and Cause reasons, ID ordering for declaration arrays, one trailing newline at the file boundary, the
WIRE-016 structural limits, exact app/persistence/module/machine/Story identity, and the accepted lifecycle,
operation, checkpoint, end, cleanup, truncation, and evidence fields.
Effect Cause is projected to ordered duplicate-preserving `Fail`/`Die`/`Interrupt` reasons for JSON artifact
and CLI boundaries. The complete Effect `Cause.Cause<unknown>` remains public on `FlowDisposeError` and
`FlowStoryExecutionError`; it is not serialized. Unknown fields, duplicate keys, unsupported versions,
noncanonical Cause payloads, and all legacy
v1/Scenario/final/children shapes reject before application or runtime acquisition. CLI text and JSON are
projections of one immutable private result. A successful `story run` is a completed result with non-null
`end` and null `failure`; execution, cancellation, cleanup, and trace-write failures are `CliError` values
with partial Story evidence in the primary diagnostic and ordered secondary diagnostics.

**Proof obligations:** Round-trip behavior and trace v2, Cause reason order and multiplicity, opaque-domain
codec boundaries, malformed/hostile/bounded input, truncation completeness, direct Story/CLI parity, all
existing command and exit vectors, atomic file publication, signal boundaries, fresh packed-binary parity,
and absence of legacy artifact/CLI vocabulary.

## REV-MIG-006 — Remove subordinate-machine capability completely

**Change:** Close `BEH-034` by making recursive substates one actor and requiring explicit actors for
independent workflows.

**Rule:** No public or package-private vNext contract may expose child actor creation, child inputs, child
lifecycles, child completion, child snapshots, child addresses, child persistence, child Story commands,
child model nodes, or `children` artifact/CLI fields. Recursive compound states share one actor's memory,
context, event protocol, mailbox, operations, and lifetime. An independent workflow is either an explicitly
owned actor admitted by the AppPlan or unsupported; it is never synthesized from a nested state. Legacy child
fields and subordinate-machine artifact records are rejected at compile, boot, artifact, and CLI decode
boundaries rather than ignored or aliased.

**Proof obligations:** Compile negative proofs for child fields and child routes, recursive-state single-actor
runtime proofs, persistence/artifact/CLI rejection of `children`, deletion searches across source/tests/docs,
and explicit-actor parity for any surviving subordinate workflow.

## Promotion blocker status

No inherited `BEH-*` entry remains open in [`UNRESOLVED_BEHAVIOR.md`](../../../revision-spec/UNRESOLVED_BEHAVIOR.md). The
operation, host-write, artifact/CLI, and child-removal closures above provide the exact behavior and
coordinated proof ownership; implementation phases still need to execute those proofs before a shipped
phase may be marked complete. A failing proof reopens only the guarantee it disproves.
