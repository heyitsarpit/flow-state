# Flow State vNext contract dispositions and artifact appendix

Status: proposed migration ledger; non-normative until accepted

This file closes the accounting shape required by
[`DESIGN_BEHAVIOR_GAPS.md`](./DESIGN_BEHAVIOR_GAPS.md) BEH-033 and BEH-035. It does not override
[`DESIGN_REVISIONS.md`](./DESIGN_REVISIONS.md), and it does not make
[`DESIGN_BEHAVIOR_SOLUTIONS.md`](./DESIGN_BEHAVIOR_SOLUTIONS.md) normative. A migration may use a row
only after the cited behavioral solution is accepted. Until then, the old clause remains governed by
the revision overlay's retain-unless-superseded rule.

`retain` means the complete old law survives unchanged. `rewrite` means the replacement must preserve
the useful guarantee named here while removing every conflicting noun, API, identity, field, or
ordering law. `delete` means the old capability and its proof disappear; a replacement named in the
row is a different accepted capability, not an alias. No mixed clause may be partly retained in place.

The proof-owner abbreviations are proposed routing labels:

- `PF-COMP` — definition, AppPlan, context graph, module, identity, and type proofs;
- `PF-RUNTIME` — factory, bootstrap, actor, lifecycle, context, store, and disposal proofs;
- `PF-OPS` — operation identity, admission, concurrency, hydration, and persistence proofs;
- `PF-STORY` — recipe, focused-machine, simulation, checkpoint, end, cleanup, and model proofs;
- `PF-ART` — Schema, canonical bytes, inspection, artifact, CLI, and module-slice proofs;
- `PF-HOST` — React, request, SSR, selector, and host-lifetime proofs; and
- `PF-DEL` — negative exports, source absence, examples, tasks, docs, and repository hygiene.

## Normative clause matrix

### Glossary and identity

| Old clause | Disposition | Replacement and proof owner                                                                                                                |
| ---------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `GLO-01`   | rewrite     | Definition includes context requirements, compound states, actions, and named operation families. `PF-COMP`.                               |
| `GLO-02`   | rewrite     | Reusable machine versus exact actor instance, ref, handle, and owner lease. `PF-COMP`.                                                     |
| `GLO-03`   | rewrite     | Keep input and memory distinct and add inherited readonly context as a third domain. `PF-COMP`.                                            |
| `GLO-04`   | rewrite     | Named operation descriptor/family/plan and ActorRef replace primitive-ref ambiguity. `PF-COMP`, `PF-OPS`.                                  |
| `GLO-05`   | rewrite     | Use the accepted bounded canonical `K` domain and one exact tagged encoding. `PF-OPS`.                                                     |
| `GLO-06`   | rewrite     | Operation identity is descriptor plus canonical `K`; executable `P` is excluded. `PF-OPS`.                                                 |
| `GLO-07`   | rewrite     | Modules own tooling groups; `App.M` owns machine admission; neither creates roots. `PF-COMP`.                                              |
| `GLO-08`   | rewrite     | Stable and opaque ActorRef identity replaces root/dynamic/child identity. `PF-COMP`, `PF-RUNTIME`.                                         |
| `GLO-09`   | rewrite     | Action/activity/timer slots and occurrence lanes replace the old activity/child identity union. `PF-OPS`.                                  |
| `GLO-10`   | rewrite     | Separate publication revision, machine/context turn revision, store revision, generation, occurrence, and evidence sequence. `PF-RUNTIME`. |
| `GLO-11`   | rewrite     | Keep private planning/commit concepts; replace TurnRecord-only history with `RuntimeEvidenceRecord`. `PF-RUNTIME`, `PF-ART`.               |
| `GLO-12`   | rewrite     | Snapshot, actor directory, context graph, operation indexes, and passive selection dependencies. `PF-RUNTIME`, `PF-HOST`.                  |
| `GLO-13`   | rewrite     | Issues, pending work, occurrence status, and evidence records replace receipt-era terminology. `PF-RUNTIME`, `PF-OPS`.                     |
| `GLO-14`   | rewrite     | Delete public registered views; retain package-private MachineObserver/SelectionFrame for `useView`. `PF-HOST`, `PF-DEL`.                  |
| `GLO-15`   | rewrite     | Three Story constructors, fixtures, simulation, recipe targets, checkpoints, and end replace callable Story/control/final. `PF-STORY`.     |
| `GLO-16`   | rewrite     | Runtime boot, behavior v2, trace v2, locators, evidence, end, failure, and cleanup use the appendix below. `PF-ART`.                       |

### Public API

| Old clause | Disposition | Replacement and proof owner                                                                                                                                |
| ---------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `API-001`  | rewrite     | Preserve isolated routes while replacing their exact named exports atomically. `PF-DEL`.                                                                   |
| `API-002`  | rewrite     | Re-freeze consumer types around definitions, ActorRef, actor handles, owner leases, Stories, and revised artifacts. `PF-COMP`, `PF-DEL`.                   |
| `API-003`  | rewrite     | Definition owns states/events/input/memory/context/operations; child and view carriers disappear. `PF-COMP`.                                               |
| `API-004`  | rewrite     | One behavior callback gains compound nodes, `onContext`, `onMemory`, and transition/timer actions. `PF-COMP`, `PF-OPS`.                                    |
| `API-005`  | rewrite     | Resource family exposes accepted named methods and descriptor-plus-`K` identity; delete public refs/bound entries. `PF-OPS`, `PF-DEL`.                     |
| `API-006`  | rewrite     | Activities own continuing subscriptions; transition/timer actions own finite plans. `PF-OPS`.                                                              |
| `API-007`  | rewrite     | Transaction family uses `key`, `getState`, `commit`, and lane-wide `cancel`. `PF-OPS`.                                                                     |
| `API-008`  | rewrite     | Retain stream descriptor/family behavior and delete every child descriptor/export/member. `PF-OPS`, `PF-DEL`.                                              |
| `API-009`  | rewrite     | Continuing declarations select plans; completion mapping uses the unified production pipeline; remove child outcomes. `PF-OPS`.                            |
| `API-010`  | delete      | Delete `flow.view`, view IDs, and module view registration; ordinary selector functions plus `useView(actor, selector)` replace them. `PF-HOST`, `PF-DEL`. |
| `API-011`  | rewrite     | `module({ id, machines: record })` owns tooling sections only; roots and views are deleted. `PF-COMP`.                                                     |
| `API-012`  | rewrite     | App keeps explicit identity/version and ordered modules, flattens unique machine keys into `App.M`, and creates no actors. `PF-COMP`.                      |
| `API-012A` | rewrite     | Exact create/ensure/get/ref/lease capability split and RuntimeFactory replace root/dynamic APIs and disposal-capable handles. `PF-RUNTIME`.                |
| `API-012B` | rewrite     | Keep stable synchronous misuse diagnostics and add lifecycle/ref/context/admission diagnostics. `PF-RUNTIME`, `PF-HOST`.                                   |
| `API-013`  | rewrite     | Non-callable `story.app`, `story.machine`, and inert `story.actor`; accepted command vocabulary only. `PF-STORY`.                                          |
| `API-013A` | rewrite     | Infer exact recipe/ref targets, checkpoint names, actor lookup, machine snapshot, runtime metadata, end, and execution errors. `PF-STORY`.                 |
| `API-014`  | rewrite     | Keep fixture as reusable run environment; remove endpoint-control ownership superseded by the Story OperationHost. `PF-STORY`.                             |
| `API-015`  | rewrite     | Pure model accepts only a command-empty fresh machine Story and emits ordinary executable machine Stories. `PF-STORY`.                                     |
| `API-016`  | rewrite     | Behavior registry accepts app- and machine-scoped Stories and exposes inert RuntimeFactory app metadata. `PF-STORY`, `PF-ART`.                             |
| `API-017`  | rewrite     | Inspection derives from the ordered runtime evidence union and revised v2 artifacts; no second history. `PF-ART`.                                          |
| `API-018`  | rewrite     | CLI consumes the revised behavior/story registry, trace schema, locators, end, and cleanup evidence. `PF-ART`.                                             |
| `API-P01`  | rewrite     | Packed route proof asserts new exports and deleted roots/views/children/controls/final. `PF-DEL`.                                                          |
| `API-P02`  | rewrite     | Grammar proof covers context, compound states, actions, named operations, and three Story constructors. `PF-COMP`, `PF-STORY`.                             |
| `API-P03`  | rewrite     | Semantic proof delegates every live and Story action to the same production runtime. `PF-RUNTIME`, `PF-STORY`.                                             |

### Type system

| Old clause  | Disposition | Replacement and proof owner                                                                                                                                                        |
| ----------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TYPE-001`  | rewrite     | Definition literals infer compound states, context, events, memory, input, and operations without widening. `PF-COMP`.                                                             |
| `TYPE-002`  | rewrite     | Definition remains the inference anchor; App.M admission and context requirements join its static universe. `PF-COMP`.                                                             |
| `TYPE-003`  | rewrite     | Preserve the exact input/memory initializer path and infer readonly selected context independently. `PF-COMP`.                                                                     |
| `TYPE-004`  | rewrite     | Preserve event narrowing and type transition/timer action plans against the causal snapshot/event. `PF-COMP`, `PF-OPS`.                                                            |
| `TYPE-005`  | rewrite     | Resource `P`, `K`, success, failure, and requirements flow through one named family. `PF-OPS`.                                                                                     |
| `TYPE-006`  | rewrite     | Transaction `P`, `K`, concurrency, outcomes, and state remain exact and parent-independent. `PF-OPS`.                                                                              |
| `TYPE-007`  | rewrite     | Retain stream inference and delete every child generic, descriptor, outcome, and snapshot lane. `PF-OPS`, `PF-DEL`.                                                                |
| `TYPE-008`  | rewrite     | Retain typed failure, defect, interruption, full-Cause precedence, and `Effect.exit`; remove the stale blocker citation and apply the law to named operations. `PF-OPS`, `PF-ART`. |
| `TYPE-009`  | rewrite     | App.M's complete operation/context graph contributes hidden requirements; modules and roots do not. `PF-COMP`.                                                                     |
| `TYPE-009A` | rewrite     | Normalize Story recipes, context bindings, operation keys, and public carriers with cycle and complexity bounds. `PF-COMP`, `PF-STORY`.                                            |
| `TYPE-010`  | rewrite     | RuntimeFactory and focused-machine compilation close requirements without a second runtime. `PF-RUNTIME`, `PF-STORY`.                                                              |
| `TYPE-011`  | retain      | Effect bridges accept only services installed by the owning runtime/host scope. `PF-RUNTIME`.                                                                                      |
| `TYPE-012`  | rewrite     | Snapshots retain exact machine, state tree, memory, selected context, lifecycle, operation state, and revisions. `PF-RUNTIME`.                                                     |
| `TYPE-013`  | rewrite     | Delete registered-view overloads; reject foreign actor/selector/ref families in the accepted hooks. `PF-HOST`, `PF-DEL`.                                                           |
| `TYPE-014`  | rewrite     | Story types accumulate command targets, recipe closure, checkpoint keys, machine/app evidence, and end. `PF-STORY`.                                                                |
| `TYPE-015`  | rewrite     | Fixture output plus deterministic host closes RuntimeFactory or focused AppPlan requirements exactly. `PF-STORY`.                                                                  |
| `TYPE-016`  | rewrite     | Replace control commands with operation-plan/occurrence-specific typed `simulate` observations. `PF-STORY`, `PF-OPS`.                                                              |
| `TYPE-017`  | rewrite     | Model paths retain the command-empty machine Story contract and accepted command types. `PF-STORY`.                                                                                |
| `TYPE-P01`  | rewrite     | Positive fixtures cover new composition, actors, operations, hooks, Stories, evidence, and artifacts. `PF-COMP`, `PF-STORY`.                                                       |
| `TYPE-P02`  | rewrite     | Negative fixtures reject deleted and cross-family surfaces plus missing context/target/occurrence fields. `PF-DEL`.                                                                |
| `TYPE-P03`  | rewrite     | No-erasure proof follows App.M, context, named operation, recipe, and locator generics. `PF-COMP`, `PF-ART`.                                                                       |
| `TYPE-P04`  | rewrite     | Complexity proof covers compound trees, context DAGs, App.M, Story recipe DAGs, and target accumulation. `PF-COMP`, `PF-STORY`.                                                    |

### Runtime semantics

| Old clause | Disposition | Replacement and proof owner                                                                                                                                                                                                                              |
| ---------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SEM-001`  | rewrite     | Mailboxes order machine facts; lifecycle and evidence use their serialized production lanes rather than pretending to be machine facts. `PF-RUNTIME`.                                                                                                    |
| `SEM-001A` | rewrite     | Memory, exact bindings, silent context baseline, restored outcomes, and continuing reconciliation precede activation/escape. `PF-RUNTIME`.                                                                                                               |
| `SEM-002`  | rewrite     | Planning remains pure/bounded and now includes compound stabilization and atomic action batches. `PF-COMP`, `PF-OPS`.                                                                                                                                    |
| `SEM-003`  | rewrite     | Commit candidate covers state, memory, context, operations, store changes, occurrences, and evidence. `PF-RUNTIME`, `PF-OPS`.                                                                                                                            |
| `SEM-004`  | rewrite     | One commit coordinator publishes actor/store/occurrence/evidence pointers atomically. `PF-RUNTIME`.                                                                                                                                                      |
| `SEM-005`  | rewrite     | Snapshot publication revision covers lifecycle/issues/context; machine-turn revision remains distinct. `PF-RUNTIME`.                                                                                                                                     |
| `SEM-006`  | rewrite     | Retain synchronous public send and same-mailbox private Story acknowledgment for exact targets. `PF-RUNTIME`, `PF-STORY`.                                                                                                                                |
| `SEM-006A` | rewrite     | Durable mapped outcomes cover named operations/timers, preserve occurrences, and remove child outcomes. `PF-OPS`.                                                                                                                                        |
| `SEM-007`  | rewrite     | Snapshot streams replay exact current lifecycle truth and terminal disposal once. `PF-RUNTIME`, `PF-HOST`.                                                                                                                                               |
| `SEM-008`  | rewrite     | One StoreState remains canonical resource authority, with descriptor/`K` identities and effective/base projections replacing old refs. `PF-OPS`.                                                                                                         |
| `SEM-009`  | rewrite     | Store revisions remain monotonic commit identities; changed identities replace the old `changedRefs` vocabulary. `PF-OPS`.                                                                                                                               |
| `SEM-010`  | rewrite     | Descriptor plus canonical typed `K` replaces public resource/transaction refs. `PF-OPS`.                                                                                                                                                                 |
| `SEM-011`  | rewrite     | Preserve ownership/read/freshness/collection separation across passive reads and named families. `PF-OPS`, `PF-HOST`.                                                                                                                                    |
| `SEM-011A` | rewrite     | Finite resource outcomes belong to actor occurrences that may attach to a shared generation. `PF-OPS`.                                                                                                                                                   |
| `SEM-011B` | rewrite     | Value emission follows effective-value revision; equal authoritative writes still update freshness/store revision. `PF-OPS`.                                                                                                                             |
| `SEM-012`  | rewrite     | Placeholder remains noncanonical active projection and is exposed only through state. `PF-OPS`.                                                                                                                                                          |
| `SEM-013`  | rewrite     | RcMap leases own retention/GC, not canonical data, using descriptor/`K` and lease epochs rather than old public refs. `PF-OPS`.                                                                                                                          |
| `SEM-014`  | rewrite     | Fiber interruption never replaces descriptor/`K` generation and actor-occurrence fencing. `PF-OPS`.                                                                                                                                                      |
| `SEM-015`  | rewrite     | Transaction lane is actor, descriptor, canonical `K`; occurrences provide attempt identity. `PF-OPS`.                                                                                                                                                    |
| `SEM-016`  | rewrite     | Ordered transaction overlays and effective/base reads follow the accepted batch algebra. `PF-OPS`.                                                                                                                                                       |
| `SEM-017`  | rewrite     | Preserve the rule that preview/optimistic output never becomes authoritative implicitly, while admitting the accepted explicit authoritative resource writes and stream-response mappings through the normal commit, fence, and evidence path. `PF-OPS`. |
| `SEM-017A` | delete      | Delete managed-child completion, retained child snapshot, routing, restoration, and lifetime. `PF-DEL`.                                                                                                                                                  |
| `SEM-018`  | rewrite     | Serialized transaction admission remains FIFO within the new explicit occurrence and pending bounds. `PF-OPS`.                                                                                                                                           |
| `SEM-019`  | rewrite     | Activity/action/timer slots plus descriptor/`K`/occurrence replace child-inclusive activity identity. `PF-OPS`.                                                                                                                                          |
| `SEM-020`  | rewrite     | Each actor, operation generation, Story run, and outer host capability has one explicit Scope owner. `PF-RUNTIME`, `PF-STORY`.                                                                                                                           |
| `SEM-021`  | rewrite     | Planned cancel/release/supersession records terminal evidence without manufacturing mapped domain outcomes. `PF-OPS`.                                                                                                                                    |
| `SEM-022`  | rewrite     | Operational continuing leases use streams/acquire-release; significant workflows use host-owned first-class actors. `PF-OPS`, `PF-DEL`.                                                                                                                  |
| `SEM-023`  | retain      | Full Cause determines typed failure, defect, interruption, and cleanup projection. `PF-RUNTIME`, `PF-ART`.                                                                                                                                               |
| `SEM-024`  | rewrite     | Lifecycle lane closes admission, publishes exact lifecycle, and completes cleanup with retained failures. `PF-RUNTIME`.                                                                                                                                  |
| `SEM-024A` | rewrite     | No failed domain state is invented; lifecycle/issue evidence reports runtime failure truth. `PF-RUNTIME`.                                                                                                                                                |
| `SEM-024B` | rewrite     | Each issue identity has one exact descriptor/`K`/occurrence or lifecycle clearing owner and full Cause remains in runtime evidence. `PF-RUNTIME`.                                                                                                        |
| `SEM-025`  | rewrite     | `useView` selectors are passive actor/store capability projections; registered views are deleted. `PF-HOST`.                                                                                                                                             |
| `SEM-026`  | rewrite     | `Object.is`, `useShallow`, publication revision, dependency replacement, and exception memoization govern reuse. `PF-HOST`.                                                                                                                              |
| `SEM-027`  | rewrite     | Factory readiness and actor lifecycle remain host/runtime state, never machine state. `PF-RUNTIME`, `PF-HOST`.                                                                                                                                           |

### Snapshots

| Old clause | Disposition | Replacement and proof owner                                                                                                                                                                                                |
| ---------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SNAP-001` | rewrite     | Snapshot carries publication revision and package-private turn correlation plus lifecycle/context. `PF-RUNTIME`.                                                                                                           |
| `SNAP-002` | rewrite     | Actor and passive operation reads use one immutable actor/store cut and exact capabilities. `PF-HOST`.                                                                                                                     |
| `SNAP-003` | rewrite     | Resource availability plus lookup state is the closed typed projection keyed by `K`. `PF-OPS`.                                                                                                                             |
| `SNAP-004` | rewrite     | Placeholder, base, overlay-effective data, retained refresh failure, and empty remain distinct. `PF-OPS`.                                                                                                                  |
| `SNAP-005` | rewrite     | Resource visibility follows AppPlan admission and passive shared-entry lookup, not materialized refs alone. `PF-OPS`.                                                                                                      |
| `SNAP-006` | rewrite     | Transaction state uses typed `K`, occurrence, status, Cause, and timestamps. `PF-OPS`.                                                                                                                                     |
| `SNAP-007` | rewrite     | Transaction projections follow actor occurrence lanes and bounded terminal retention. `PF-OPS`.                                                                                                                            |
| `SNAP-008` | rewrite     | Continuing resource/stream projections use declaration slot, descriptor, `K`, generation, and occurrence; delete children. `PF-OPS`, `PF-DEL`.                                                                             |
| `SNAP-009` | rewrite     | Preserve machine-wide, slot-stable, typed timer identity, but move timer history from the old TurnRecord-only/view vocabulary into `RuntimeEvidenceRecordV2` and the revised artifact projections. `PF-RUNTIME`, `PF-ART`. |
| `SNAP-010` | rewrite     | Snapshot and operation time uses the runtime Clock; remove child-input and old parameter terminology. `PF-RUNTIME`.                                                                                                        |
| `SNAP-P01` | rewrite     | Legal discriminants cover revised lifecycle/context/operations and reject child/final-era members. `PF-OPS`, `PF-DEL`.                                                                                                     |

### Architecture

| Old clause  | Disposition | Replacement and proof owner                                                                                                                                               |
| ----------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ARCH-001`  | rewrite     | AppPlan seals definitions/descriptors/context/modules while runtime owns a changing actor-instance graph. `PF-COMP`, `PF-RUNTIME`.                                        |
| `ARCH-002`  | rewrite     | App identity and persistence version remain explicit; stable ActorRef records replace root encoding and module-root ownership. `PF-COMP`.                                 |
| `ARCH-003`  | rewrite     | Delete roots/dynamic reachability; App.M admits reusable machine families and factory/hosts own instances. `PF-COMP`.                                                     |
| `ARCH-004`  | rewrite     | AppPlan resolves machine, descriptor, operation, state/event/slot, and stable-ref identities; no child IDs. `PF-COMP`, `PF-ART`.                                          |
| `ARCH-005`  | rewrite     | Effect requirements propagate through App.M's complete operation/context graph without roots, dynamic seeds, or children. `PF-COMP`.                                      |
| `ARCH-006`  | rewrite     | Actor construction uses exact input plus exact fixed context bindings or focused selected context. `PF-RUNTIME`, `PF-STORY`.                                              |
| `ARCH-007`  | retain      | One ManagedRuntime/runtime core owns the production graph. `PF-RUNTIME`.                                                                                                  |
| `ARCH-008`  | rewrite     | RuntimeFactory bootstrap installs boot, factory claims, context, pending outcomes, and reconciliation before activation. `PF-RUNTIME`.                                    |
| `ARCH-009`  | rewrite     | Prepared React mailboxes alone buffer bounded commands; factory/runtime handles never escape before readiness. `PF-RUNTIME`, `PF-HOST`.                                   |
| `ARCH-010`  | rewrite     | RuntimeFactory host supplies app, Layer, Clock, boot, operation host, evidence, and seeds. `PF-RUNTIME`.                                                                  |
| `ARCH-011`  | retain      | Host callbacks reenter managed queues/streams and never mutate runtime state reentrantly. `PF-RUNTIME`.                                                                   |
| `ARCH-012`  | rewrite     | Actor cell owns mailbox, immutable snapshot pointer, lifecycle lane, context state, occurrences, and reconciliation. `PF-RUNTIME`.                                        |
| `ARCH-013`  | rewrite     | StoreKernel owns one immutable authoritative root, descriptor/`K` indexes, revisions, generations, and commit candidates. `PF-OPS`.                                       |
| `ARCH-013A` | rewrite     | Store fanout remains runtime-owned and waits for the committing turn's runtime-evidence acceptance and acknowledgment. `PF-OPS`.                                          |
| `ARCH-013B` | rewrite     | Commit/evidence and context-closure barriers govern checkpoint and dehydration cuts with one lock order. `PF-RUNTIME`.                                                    |
| `ARCH-014`  | rewrite     | RcMap owns descriptor/`K` leases and GC only; old public ref vocabulary disappears. `PF-OPS`.                                                                             |
| `ARCH-015`  | rewrite     | FiberMap/FiberSet/serialized workers follow named family concurrency and occurrence fencing. `PF-OPS`.                                                                    |
| `ARCH-016`  | retain      | No law relies on broken `startImmediately` behavior. `PF-RUNTIME`.                                                                                                        |
| `ARCH-017`  | rewrite     | Actor handle separates command/evidence; owner lease alone disposes; refs are inert lookup identity. `PF-RUNTIME`.                                                        |
| `ARCH-018`  | rewrite     | FlowProvider receives a ready runtime; prepared local actor state is the only React construction store. `PF-HOST`.                                                        |
| `ARCH-019`  | rewrite     | MachineObserver/SelectionFrame is the only React subscription and passive actor/store read path. `PF-HOST`.                                                               |
| `ARCH-020`  | rewrite     | App and focused Stories use the same production runtime, operation host seam, evidence barrier, and cleanup. `PF-STORY`.                                                  |
| `ARCH-021`  | rewrite     | Pure model explores only command-empty focused machine Stories and executes paths through the real runner. `PF-STORY`.                                                    |
| `ARCH-022`  | rewrite     | One `RuntimeEvidenceRecord` hub sequences turns, lifecycle, and diagnostics; actor store changes stay in their turn and trusted host writes use one diagnostic. `PF-ART`. |
| `ARCH-023`  | delete      | Delete child ownership; use stream acquire/release or host/factory-owned first-class actors. `PF-DEL`.                                                                    |
| `ARCH-024`  | rewrite     | Runtime shell may allocate service-free cells, but RuntimeFactory withholds public escape until bootstrap completion. `PF-RUNTIME`.                                       |
| `ARCH-024A` | rewrite     | Add RuntimeCore, context/selection/evidence/operation-host concepts to the private-owner list. `PF-DEL`.                                                                  |
| `ARCH-025`  | retain      | Queue shutdown follows admission closure and acknowledgment settlement. `PF-RUNTIME`.                                                                                     |
| `ARCH-026`  | retain      | Exit and full Cause remain intact until explicit host/artifact projection. `PF-RUNTIME`, `PF-ART`.                                                                        |
| `ARCH-027`  | rewrite     | Compound states are admitted; parallel/history/final/children/dynamic collections remain excluded as accepted. `PF-COMP`, `PF-DEL`.                                       |
| `ARCH-028`  | rewrite     | Update non-normative Effect guidance to the new runtime owners, lock order, and one production OperationHost. `PF-RUNTIME`, `PF-OPS`.                                     |

### Persistence, inspection, and artifacts

| Old clause  | Disposition | Replacement and proof owner                                                                                                                                  |
| ----------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `WIRE-001`  | rewrite     | Distinguish JSON-like artifact carrier from operation-key normalization; both remain bounded and hostile-input safe. `PF-ART`, `PF-OPS`.                     |
| `WIRE-001A` | rewrite     | Artifacts use stable canonical JSON; operation `K` uses the accepted tagged encoding; neither silently substitutes the other. `PF-ART`, `PF-OPS`.            |
| `WIRE-002`  | rewrite     | Persist descriptor/`K`, actor occurrences, shared generations, and continuing desired bindings; never persist executable `P`. `PF-OPS`.                      |
| `WIRE-003`  | rewrite     | Domain locators remove children and add context values/bindings, occurrence payloads, and revised operation state. `PF-ART`.                                 |
| `WIRE-004`  | rewrite     | RuntimeFactory host is the only boot input path; focused machine Stories reject boot. `PF-RUNTIME`, `PF-STORY`.                                              |
| `WIRE-005`  | rewrite     | Fingerprint covers runtime identities but excludes tooling-only module IDs; behavior artifacts retain modules separately. `PF-ART`.                          |
| `WIRE-006`  | rewrite     | Store envelope follows named resource entries, overlays, reverse-index-derived facts, generations, and revisions. `PF-OPS`.                                  |
| `WIRE-007`  | rewrite     | Actor entries carry ref, fixed context bindings/revisions, dual revisions, occurrences, bindings, pending outcomes, and no children. `PF-RUNTIME`, `PF-OPS`. |
| `WIRE-008`  | rewrite     | Stable actors use ActorRef IDs; opaque actors are runtime-local; root/dynamic/child kinds disappear. `PF-RUNTIME`.                                           |
| `WIRE-009`  | rewrite     | Capture every live stable actor plus stable context-provider closure; opaque durable dependencies fail closed. `PF-RUNTIME`.                                 |
| `WIRE-010`  | rewrite     | Hydration restores graph/context/outcomes/cursors, drains outcomes, then reruns continuing reconciliation before readiness. `PF-RUNTIME`, `PF-OPS`.          |
| `WIRE-011`  | rewrite     | Finite execution never resumes or replays; retained keys/values allow ordinary later policy. `PF-OPS`.                                                       |
| `WIRE-011A` | rewrite     | Delete persisted concrete stream `P`; rematerialize through post-outcome continuing reconciliation and restart only desired nonterminal streams. `PF-OPS`.   |
| `WIRE-012`  | rewrite     | Pending transactions normalize with exact occurrence interruption and overlay cleanup, never retry. `PF-OPS`.                                                |
| `WIRE-013`  | rewrite     | Restored unowned cache entries receive one fresh GC lifetime after stable actor ownership is reconstructed. `PF-OPS`.                                        |
| `WIRE-014`  | rewrite     | One Effect Schema owner encodes/decodes revised boot, behavior, runtime-evidence, trace, and CLI envelopes. `PF-ART`.                                        |
| `WIRE-015`  | retain      | Version, structure, bounds, carrier, descriptor, decompression, and application failures stay distinct. `PF-ART`.                                            |
| `WIRE-016`  | rewrite     | Shared v2 limits and hostile-value checks remain exact, with revised dual-revision/lifecycle reserves and no dynamic/child counters. `PF-ART`.               |
| `WIRE-017`  | rewrite     | `RuntimeEvidenceRecord` is the sole ordered history; lifecycle is not a machine TurnRecord. `PF-ART`.                                                        |
| `WIRE-018`  | rewrite     | Inspection buffering stays explicit, bounded, truncation-aware, asynchronously drained, and nonblocking for every runtime-evidence record. `PF-ART`.         |
| `WIRE-019`  | rewrite     | Runtime-evidence observation becomes durable only through explicit export. `PF-ART`.                                                                         |
| `WIRE-020`  | rewrite     | Changed descriptor/`K` identities remain revision-local hints in committing turns, never historical diffs. `PF-ART`.                                         |
| `WIRE-020A` | rewrite     | Replace exact behavior/trace envelopes with the appendix below. `PF-ART`.                                                                                    |
| `WIRE-020B` | retain      | Cause projection preserves ordered duplicate reasons and rejects noncanonical payloads. `PF-ART`.                                                            |
| `WIRE-021`  | rewrite     | Checkpoint captures the statically referenced target closure and runtime metadata from one commit cut. `PF-STORY`, `PF-ART`.                                 |
| `WIRE-022`  | rewrite     | Failure evidence uses none/at-failure/end, completed checkpoints, primary Cause, and ordered cleanup. `PF-STORY`, `PF-ART`.                                  |
| `WIRE-023`  | rewrite     | Success returns checkpoints plus `end` only after cleanup; cleanup failure rejects while retaining end. `PF-STORY`.                                          |
| `WIRE-024`  | rewrite     | Pure artifacts may contain focused machine Story paths but no recipes, refs, Effects, observations, or app execution. `PF-STORY`, `PF-ART`.                  |

### React and hosts

| Old clause | Disposition | Replacement and proof owner                                                                                                                                                                                                                                                                  |
| ---------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HOST-001` | delete      | Delete synchronous automatic-root construction; RuntimeFactory returns one ready runtime after atomic bootstrap. `PF-RUNTIME`, `PF-DEL`.                                                                                                                                                     |
| `HOST-002` | delete      | Delete root lookup/dynamic creation; use create/ensure/get with exact machine/ref authority. `PF-RUNTIME`, `PF-DEL`.                                                                                                                                                                         |
| `HOST-003` | rewrite     | Preserve synchronous command-only send for prepared actors and active actors within the accepted bounded mailbox law; remove the automatic-root pre-ready handle and Layer-acquisition behavior because `RuntimeFactory` exposes readiness/disposal while bootstrap is atomic. `PF-RUNTIME`. |
| `HOST-004` | rewrite     | Story acknowledgment uses the same mailbox command and publication boundary while `process` replaces old flush/perform sequencing. `PF-STORY`.                                                                                                                                               |
| `HOST-005` | rewrite     | Observation replays immutable publication revisions across prepared/active/suspended/disposed capability rules. `PF-HOST`.                                                                                                                                                                   |
| `HOST-006` | rewrite     | Factory success returns ready runtime; `ready()` is cached compatibility observation, not an activation trigger. `PF-RUNTIME`.                                                                                                                                                               |
| `HOST-007` | delete      | Provider does not acquire a runtime; delete its readiness-acquisition store. `PF-HOST`, `PF-DEL`.                                                                                                                                                                                            |
| `HOST-008` | retain      | FlowProvider accepts only an already-created runtime. `PF-HOST`.                                                                                                                                                                                                                             |
| `HOST-009` | rewrite     | `useActor` prepares/attaches one fresh local actor; `useActorByRef` performs shared lookup; neither observes. `PF-HOST`.                                                                                                                                                                     |
| `HOST-010` | rewrite     | `useView(actor, selector)` is the sole ordinary React subscription path. `PF-HOST`.                                                                                                                                                                                                          |
| `HOST-011` | rewrite     | Equality, publication revision, passive store dependency replacement, and selector exception memoization are exact. `PF-HOST`.                                                                                                                                                               |
| `HOST-012` | rewrite     | Selector receives state/memory/context/lifecycle/issues/can/passive O and no mutation authority. `PF-HOST`.                                                                                                                                                                                  |
| `HOST-013` | rewrite     | Boot belongs to RuntimeFactory host construction and stable actor claims. `PF-RUNTIME`.                                                                                                                                                                                                      |
| `HOST-014` | rewrite     | SSR preparation computes a passive provisional context cut and commit revalidates it before activation. `PF-HOST`.                                                                                                                                                                           |
| `HOST-015` | rewrite     | Request helper invokes the production RuntimeFactory and preserves request isolation without roots. `PF-HOST`.                                                                                                                                                                               |
| `HOST-016` | retain      | Effect bridges retain installed services, errors, interruption, and Scope ownership. `PF-HOST`.                                                                                                                                                                                              |
| `HOST-017` | rewrite     | Dehydration waits for a context-closed stable-actor cut and records exact provider revisions. `PF-RUNTIME`.                                                                                                                                                                                  |
| `HOST-018` | rewrite     | Owner leases and whole-runtime shutdown provide idempotent terminal cleanup; suspended logical edges remain until disposal. `PF-RUNTIME`, `PF-HOST`.                                                                                                                                         |
| `HOST-P01` | rewrite     | Prove no pre-readiness escape and bounded prepared-mailbox FIFO. `PF-RUNTIME`, `PF-HOST`.                                                                                                                                                                                                    |
| `HOST-P02` | rewrite     | Prove live, React, and Story acknowledged commands use one actor engine. `PF-RUNTIME`, `PF-STORY`.                                                                                                                                                                                           |
| `HOST-P03` | rewrite     | Prove publication/evidence/store/context cuts and passive actor/store reads. `PF-RUNTIME`, `PF-HOST`.                                                                                                                                                                                        |
| `HOST-P04` | rewrite     | Prove React Strict Effects, Activity, SSR context, tuple changes, and local/shared hooks. `PF-HOST`.                                                                                                                                                                                         |
| `HOST-P05` | rewrite     | Prove lease/runtime disposal, dependent-provider rejection, lifecycle failure, and terminal handles. `PF-RUNTIME`.                                                                                                                                                                           |

### Testing and Stories

| Old clause | Disposition | Replacement and proof owner                                                                                                                                                                  |
| ---------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TEST-001` | rewrite     | Three constructors replace callable Story; no public control executor or second runner. `PF-STORY`.                                                                                          |
| `TEST-002` | rewrite     | Plans remain inert/immutable/linear with accepted process/simulate/context/time/checkpoint commands. `PF-STORY`.                                                                             |
| `TEST-003` | rewrite     | App Story boot belongs to RuntimeFactory options; focused machine Story is fresh-only with exact input/context. `PF-STORY`.                                                                  |
| `TEST-004` | rewrite     | Fixture remains immutable run environment but external operation completion is owned by Story OperationHost. `PF-STORY`.                                                                     |
| `TEST-005` | rewrite     | Preserve fixture identity/seed collision laws; replace endpoint-control identity with descriptor/occurrence matching. `PF-STORY`, `PF-OPS`.                                                  |
| `TEST-006` | rewrite     | Every Story external operation is intercepted at the production OperationHost and completed by `simulate`. `PF-STORY`, `PF-OPS`.                                                             |
| `TEST-007` | rewrite     | Public send stays synchronous and Story uses same-mailbox acknowledgment; replace child completions and flush/perform sequencing with occurrences and explicit process/simulate. `PF-STORY`. |
| `TEST-008` | rewrite     | App checkpoints capture target closure through `actor(locator)`; machine checkpoints capture implicit snapshot; both include runtime metadata. `PF-STORY`.                                   |
| `TEST-009` | rewrite     | One runner owns outer host resources, runtime, recipe leases, evidence capture, and ordered cleanup. `PF-STORY`.                                                                             |
| `TEST-010` | rewrite     | Cancellation captures at-failure when possible and completes nonabortable ordered cleanup. `PF-STORY`.                                                                                       |
| `TEST-011` | rewrite     | Success returns checkpoints/end; execution, end-capture, and cleanup failures throw exact evidence. `PF-STORY`.                                                                              |
| `TEST-012` | rewrite     | One injected TestClock drives production scheduling; rename setTime/flush/settle, remove root/child work, and preserve explicit no-time-jump bounds. `PF-STORY`.                             |
| `TEST-013` | rewrite     | Pending work reports mailboxes, context waves, controlled occurrences, continuing work, and timers. `PF-STORY`.                                                                              |
| `TEST-014` | rewrite     | Model discovery is pure and limited to command-empty fresh focused machine Stories. `PF-STORY`.                                                                                              |
| `TEST-015` | rewrite     | A model path executes through the ordinary focused Story runner and production runtime. `PF-STORY`.                                                                                          |
| `TEST-016` | rewrite     | Inspection retention belongs only to an explicitly attached bounded runtime-evidence sink; ordinary Story checkpoints install no history. `PF-ART`.                                          |
| `TEST-017` | delete      | Delete root/reachable-machine authority; replace with App.M admission plus exact actor target authority. `PF-COMP`, `PF-DEL`.                                                                |
| `TEST-018` | retain      | Host test runners own assertions, pass/fail, retries, and test naming. `PF-STORY`.                                                                                                           |

### CLI

| Old clause | Disposition | Replacement and proof owner                                                                                                     |
| ---------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `CLI-001`  | retain      | The exact leaf command and flag set remains unchanged. `PF-ART`.                                                                |
| `CLI-002`  | rewrite     | Actor selectors consume canonical artifact locator text; correlation selectors use revised occurrence/generation IDs. `PF-ART`. |
| `CLI-003`  | retain      | Trusted local gateway containment, dependency, package-identity, and cleanup laws remain exact. `PF-ART`.                       |
| `CLI-004`  | rewrite     | Discovery remains inert; Story run shares the revised runner and returns end rather than final. `PF-ART`, `PF-STORY`.           |
| `CLI-005`  | rewrite     | Rebaseline unshipped v2 behavior/trace schemas using the appendix; continue rejecting v1. `PF-ART`.                             |
| `CLI-006`  | rewrite     | Preserve atomic files and explicit bounded sinks while exporting revised evidence/end/failure/cleanup. `PF-ART`.                |
| `CLI-007`  | rewrite     | Exact command result schemas use app/machine Story scope, locators, multi-actor checkpoints, and end. `PF-ART`.                 |
| `CLI-008`  | retain      | Text/JSON/stdout/stderr/EPIPE and byte-stability laws remain exact. `PF-ART`.                                                   |
| `CLI-009`  | retain      | One process owner selects the existing exit-status classes after cleanup. `PF-ART`.                                             |
| `CLI-010`  | rewrite     | Signals capture at-failure, never manufacture end, finish cleanup, and write requested partial trace atomically. `PF-ART`.      |
| `CLI-011`  | rewrite     | Retain truncation truth; remove child sections and add context/lifecycle/occurrence sections. `PF-ART`.                         |
| `CLI-012`  | retain      | Fresh packed binary proof remains required. `PF-ART`.                                                                           |

### Compatibility and deletion

| Old clause | Disposition | Replacement and proof owner                                                                                                                                                                                                 |
| ---------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CUT-001`  | retain      | Public routes switch atomically after replacements pass. `PF-DEL`.                                                                                                                                                          |
| `CUT-002`  | rewrite     | Preserve semantic guarantees, not root/view/control/child/final wrappers. `PF-DEL`.                                                                                                                                         |
| `CUT-003`  | rewrite     | Add every newly deleted symbol, field, command, identity, and child-equivalent owner to fail-closed checks. `PF-DEL`.                                                                                                       |
| `CUT-004`  | rewrite     | Preserve no compatibility parser while replacing flat-state rejection with accepted compound grammar. `PF-DEL`, `PF-COMP`.                                                                                                  |
| `CUT-005`  | rewrite     | Preserve the ban on implicit preview promotion, rewrite success/invalidation around the accepted ordered action-batch algebra and explicit authoritative writes, and remove the stale blocker citation. `PF-OPS`, `PF-DEL`. |
| `CUT-006`  | retain      | Actor send remains synchronous. `PF-DEL`.                                                                                                                                                                                   |
| `CUT-007`  | rewrite     | Story results retain evidence rather than scenario status and use end rather than final. `PF-DEL`, `PF-STORY`.                                                                                                              |
| `CUT-007A` | retain      | CLI model exploration remains deleted. `PF-DEL`.                                                                                                                                                                            |
| `CUT-008`  | retain      | V1 artifacts are rejected, never guessed or migrated. `PF-ART`, `PF-DEL`.                                                                                                                                                   |
| `CUT-P01`  | rewrite     | Negative root-route imports cover roots/views/children/controls/old Story/final/disposal handles. `PF-DEL`.                                                                                                                 |
| `CUT-P02`  | rewrite     | Declaration absence covers every removed type/member/overload and child-equivalent carrier. `PF-DEL`.                                                                                                                       |
| `CUT-P03`  | rewrite     | Runtime proof rejects compatibility branches and second engines. `PF-DEL`.                                                                                                                                                  |
| `CUT-P04`  | rewrite     | Retained-compatibility proof covers synchronous send, Cause, Clock, codecs, CLI grammar, and host assertions. `PF-DEL`.                                                                                                     |
| `CUT-P05`  | rewrite     | Repository cleanup follows the deletion inventory below. `PF-DEL`.                                                                                                                                                          |
| `CUT-P06`  | rewrite     | Revisions, accepted solutions, promoted contracts, disposition ledger, tasks, and receipts have one explicit authority chain. `PF-DEL`.                                                                                     |

### Proof matrix

| Old clause  | Disposition | Replacement and proof owner                                                                                                                                                                             |
| ----------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PROOF-001` | rewrite     | Public typing covers context, compound states, App.M, operations, refs/leases, hooks, and Stories. `PF-COMP`.                                                                                           |
| `PROOF-002` | rewrite     | Pure compilation covers module uniqueness, context/recipe DAGs, identities, bounds, and inert discovery. `PF-COMP`.                                                                                     |
| `PROOF-003` | rewrite     | Acknowledgment/publication covers actions, context waves, dual revisions, and evidence sequence. `PF-RUNTIME`.                                                                                          |
| `PROOF-004` | rewrite     | Runtime/Scope lifetime covers factory rollback, actors, leases, suspension, Story outer scope, and cleanup. `PF-RUNTIME`.                                                                               |
| `PROOF-005` | rewrite     | Exact primitive proof becomes descriptor/`K`/occurrence/generation and stale-fence safety. `PF-OPS`.                                                                                                    |
| `PROOF-006` | rewrite     | Resource ownership proof covers passive reads, freshness, effective values, tags, expansion, and collection. `PF-OPS`.                                                                                  |
| `PROOF-007` | rewrite     | Transaction proof covers occurrence lanes, concurrency, overlays, batch conflicts, and Cause. `PF-OPS`.                                                                                                 |
| `PROOF-008` | rewrite     | Fixture isolation plus universal Story OperationHost interception and live-path parity. `PF-STORY`, `PF-OPS`.                                                                                           |
| `PROOF-009` | rewrite     | `process`, explicit TestClock commands, pending controlled work, bounds, and no implicit progress. `PF-STORY`.                                                                                          |
| `PROOF-010` | rewrite     | Recipe/ref capture set, one-cut checkpoints, end, failure evidence, and cleanup truth. `PF-STORY`.                                                                                                      |
| `PROOF-011` | rewrite     | Command-empty focused model purity and live focused-path parity. `PF-STORY`.                                                                                                                            |
| `PROOF-012` | rewrite     | Actor refs/leases, React prepare/suspend/resume, context edges, passive reads, SSR, and requests. `PF-HOST`.                                                                                            |
| `PROOF-013` | rewrite     | RuntimeEvidenceRecord ordering, lifecycle correlation, explicit sink retention, gaps, and drain. `PF-ART`.                                                                                              |
| `PROOF-014` | rewrite     | Boot/context/occurrence hydration, revised v2 artifacts, module slices, CLI, atomic files, and signals. `PF-ART`.                                                                                       |
| `PROOF-015` | rewrite     | Operational remote leases use streams; significant lease actors are factory/host-owned; child path is absent. `PF-OPS`, `PF-DEL`.                                                                       |
| `PROOF-016` | rewrite     | Three proving apps exercise accepted actors/context/operations/Stories without roots/views/children/controls. `PF-DEL`.                                                                                 |
| `APP-001`   | rewrite     | Todo Essentials proves the accepted cached-resource and optimistic-transaction composition through App.M, named operations, factory-owned actors, revised React hosts, and new Stories. `PF-DEL`.       |
| `APP-002`   | rewrite     | Incident Console proves first-class actors, readonly context, streams, occurrences, app Stories, evidence, and CLI v2 without roots, views, controls, children, or final-state compatibility. `PF-DEL`. |
| `APP-003`   | rewrite     | Hydrated Offline Notes proves request-scoped factory boot, stable actor claims, context-closed hydration, outbox memory, controlled connectivity, and new Stories. `PF-DEL`.                            |
| `PROOF-017` | rewrite     | Exact deletion inventory, packed negatives, docs/tasks cleanup, no second runtime, and one authority survive. `PF-DEL`.                                                                                 |

## Exact v2 artifact appendix

These are exact structural field sets for the proposed rebaselined, unshipped v2 envelopes. A field
not listed is forbidden. Inapplicable union fields are absent, never `undefined`. All numbers are
non-negative safe integers. Canonical carriers, Cause projections, hostile-input rejection, and the
shared WIRE-016 limits remain unchanged unless the promoted operation-key clause explicitly uses the
separate bounded tagged `K` encoding.

### Common locators and identities

```ts
type ActorLocator =
  | Readonly<{
      kind: "actor-ref";
      machineId: string;
      stableId: string;
    }>
  | Readonly<{
      kind: "story-actor";
      machineId: string;
      ordinal: number;
    }>
  | Readonly<{
      kind: "runtime-actor";
      machineId: string;
      ordinal: number;
    }>;

type OccurrenceLocator = Readonly<{
  actor: ActorLocator;
  operationKind: "resource" | "transaction" | "stream";
  descriptorId: string;
  key: CanonicalCarrier;
  ordinal: number;
}>;

type SharedResourceGenerationLocator = Readonly<{
  descriptorId: string;
  key: CanonicalCarrier;
  generation: number;
}>;

type StoryLocator =
  | Readonly<{ kind: "app"; id: string }>
  | Readonly<{ kind: "machine"; id: string; machineId: string }>;
```

The top-level `appId` qualifies every actor locator. `actor-ref` is durable. `story-actor` is assigned
by first recipe traversal in the frozen plan. `runtime-actor` is assigned by successful actor admission
order in that runtime and is trace-local, never restoration identity. Locator arrays sort by canonical
encoded locator bytes.

### Behavior artifact

```ts
type BehaviorArtifactV2 = Readonly<{
  kind: "behavior-contract";
  version: "flow-state/behavior-contract.v2";
  appId: string;
  persistenceVersion: string;
  appPlanFingerprint: string;
  modules: readonly BehaviorModuleV2[];
  stories: readonly BehaviorStoryV2[];
}>;

type BehaviorModuleV2 = Readonly<{
  moduleId: string;
  machines: readonly BehaviorMachineV2[];
}>;

type BehaviorMachineV2 = Readonly<{
  machineId: string;
  states: readonly BehaviorStateNodeV2[];
  events: readonly string[];
  contextRequirements: readonly ContextRequirementV2[];
  operations: readonly OperationFamilyV2[];
  activitySlots: readonly BehaviorSlotV2[];
  actionSlots: readonly BehaviorSlotV2[];
  timerSlots: readonly BehaviorSlotV2[];
}>;

type BehaviorStateNodeV2 = Readonly<{
  stateId: string;
  parentStateId: string | null;
  kind: "atomic" | "compound";
  defaultChildStateId: string | null;
}>;

type ContextRequirementV2 = Readonly<{
  key: string;
  providerMachineId: string;
}>;

type OperationFamilyV2 = Readonly<{
  name: string;
  kind: "resource" | "transaction" | "stream";
  descriptorId: string;
}>;

type BehaviorSlotV2 = Readonly<{
  slotId: string;
  name: string;
  owner:
    | Readonly<{ kind: "state-activity"; stateId: string }>
    | Readonly<{ kind: "on-memory"; registrationOrdinal: number }>
    | Readonly<{ kind: "event-action"; stateId: string; eventId: string }>
    | Readonly<{ kind: "timer-action"; stateId: string; timerId: string }>
    | Readonly<{ kind: "timer"; stateId: string; timerId: string }>;
}>;

type BehaviorStoryV2 = Readonly<{
  id: string;
  scope: Readonly<{ kind: "app" }> | Readonly<{ kind: "machine"; machineId: string }>;
  title: string | null;
  description: string | null;
  tags: readonly string[];
  coveredMachineIds: readonly string[];
}>;
```

Modules sort by raw UTF-16 `moduleId`; machines by raw UTF-16 `machineId`; state nodes use compiler
preorder with a parent before descendants; events retain definition order; context requirements retain
declared-key order; operations sort by kind, descriptor ID, then family name; slots retain compiled
slot order; Stories sort by raw UTF-16 external `id`; tags retain authored deduplicated order; coverage
IDs are deduplicated and raw-UTF-16 sorted. Module order and module IDs never enter
runtime/persistence identity. The behavior artifact contains no callback, selector, Effect, Layer,
fixture, recipe, runtime ref, input, memory, selected context value, or operation `P`.

### Runtime evidence records

```ts
type RuntimeEvidenceRecordV2 = TurnRecordV2 | LifecycleRecordV2 | DiagnosticRecordV2;

type TurnRecordV2 = Readonly<{
  kind: "turn";
  sequence: number;
  actor: ActorLocator;
  moduleId: string;
  publicationRevision: number;
  turnRevision: number;
  storeRevision: number;
  cause: "event" | "context" | "outcome" | "timer" | "store";
  snapshot: ActorSnapshotArtifactV2;
  facts: readonly TurnFactArtifactV2[];
}>;

type LifecycleRecordV2 = Readonly<{
  kind: "lifecycle";
  sequence: number;
  actor: ActorLocator;
  moduleId: string;
  publicationRevision: number;
  turnRevision: number;
  from: "prepared" | "active" | "suspended" | "disposed";
  to: "active" | "suspended" | "disposed";
  cause:
    | "imperative-create"
    | "ensure-fresh"
    | "boot-restore"
    | "react-attachment"
    | "react-effect-cleanup"
    | "runtime-host-suspend"
    | "react-effect-setup"
    | "runtime-host-resume"
    | "owner-dispose"
    | "runtime-dispose"
    | "bootstrap-rollback"
    | "invariant-failure";
  snapshot: ActorSnapshotArtifactV2;
}>;

type DiagnosticRecordV2 = Readonly<{
  kind: "diagnostic";
  sequence: number;
  code: string;
  owner: ActorLocator | null;
  publicationRevision: number | null;
  storeRevision: number | null;
  details: CanonicalCarrier;
}>;
```

Records sort by strictly increasing `sequence`, and facts preserve commit order. Actor-owned store
changes appear only as facts in their committing turn. A trusted host-only store mutation uses one
diagnostic whose non-null `storeRevision` names the resulting store root, so one mutation never creates
two history records. `moduleId` is derived tooling attribution and is never part of actor or operation
identity. Revised exact actor-snapshot and fact unions must be frozen beside these envelopes before
Phase 7; old child members are forbidden.

### Checkpoint, pending work, end, failure, and cleanup

```ts
type RuntimeObservationV2 = Readonly<{
  now: number;
  storeRevision: number;
  evidenceSequence: number;
  pendingWork: PendingWorkV2;
}>;

type PendingWorkV2 = Readonly<{
  finite: readonly PendingOccurrenceV2[];
  continuing: readonly PendingOccurrenceV2[];
  timers: readonly PendingTimerV2[];
  contextWaves: readonly PendingContextWaveV2[];
}>;

type PendingOccurrenceV2 = Readonly<{
  occurrence: OccurrenceLocator;
  sharedGeneration: SharedResourceGenerationLocator | null;
  status: "admitted" | "queued" | "controlled" | "running" | "settling";
}>;

type PendingTimerV2 = Readonly<{
  actor: ActorLocator;
  timerSlotId: string;
  dueAt: number;
}>;

type PendingContextWaveV2 = Readonly<{
  waveSequence: number;
  pendingActors: readonly ActorLocator[];
}>;

type ActorEvidenceV2 = Readonly<{
  actor: ActorLocator;
  snapshot: ActorSnapshotArtifactV2;
}>;

type StoryEvidenceV2 =
  | Readonly<{
      kind: "app";
      actors: readonly ActorEvidenceV2[];
      runtime: RuntimeObservationV2;
    }>
  | Readonly<{
      kind: "machine";
      snapshot: ActorSnapshotArtifactV2;
      runtime: RuntimeObservationV2;
    }>;

type CheckpointV2 = Readonly<{
  name: string;
  commandIndex: number;
  evidence: StoryEvidenceV2;
}>;

type FailureEvidenceV2 =
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "at-failure"; evidence: StoryEvidenceV2 }>
  | Readonly<{ kind: "end"; evidence: StoryEvidenceV2 }>;

type StoryFailureV2 = Readonly<{
  phase: "prepare" | "command" | "cancellation" | "end-capture" | "disposal";
  commandIndex: number | null;
  completedCheckpointNames: readonly string[];
  evidence: FailureEvidenceV2;
  cancellation:
    | null
    | Readonly<{ kind: "abort-signal" }>
    | Readonly<{ kind: "process-signal"; signal: "SIGINT" | "SIGTERM" }>;
  cause: CauseProjection;
}>;

type CleanupFailureV2 = Readonly<{
  stage: "story-actors" | "runtime" | "evidence-sinks" | "operation-host" | "fixtures" | "clock";
  target: ActorLocator | string | null;
  cause: CauseProjection;
}>;

type CleanupV2 =
  | Readonly<{ status: "complete" }>
  | Readonly<{
      status: "failed";
      failures: readonly CleanupFailureV2[];
      cause: CauseProjection;
    }>;
```

Finite and continuing entries sort by occurrence-locator bytes; timers by `dueAt`, actor locator, then
slot ID; context waves by wave sequence and their actors by locator. Checkpoint order is command order
and names remain unique. App actor evidence sorts by locator, including the complete statically
referenced target set and its context-provider closure. Cleanup failures sort by cleanup execution
order: reverse-topological Story actors, runtime, evidence sinks, operation host, fixtures, then Clock;
within a stage they retain actual deterministic finalizer order. The aggregate Cause concatenates
failure reasons in that order without deduplication.

### Trace artifact

```ts
type TraceArtifactV2 = Readonly<{
  kind: "trace-artifact";
  version: "flow-state/trace-artifact.v2";
  appId: string;
  persistenceVersion: string;
  appPlanFingerprint: string;
  story: StoryLocator;
  capturedAt: number;
  truncatedBeforeSequence: number | null;
  records: readonly RuntimeEvidenceRecordV2[];
  checkpoints: readonly CheckpointV2[];
  end: StoryEvidenceV2 | null;
  failure: StoryFailureV2 | null;
  cleanup: CleanupV2;
}>;
```

Successful execution has non-null `end`, null `failure`, and complete cleanup. Command, cancellation,
prepare, or end-capture failure has null `end`; its failure evidence is `none` before actor creation or
`at-failure` after actor creation. If commands and end capture succeed but cleanup fails, `end` remains
non-null, `failure.phase` is `disposal`, `failure.evidence` is the same `end`, and cleanup is failed.
Top-level `checkpoints` are exactly the completed checkpoint evidence. Failure repeats only their
ordered names for local correlation and never duplicates checkpoint evidence.
Requested trace export occurs after sink drain and cleanup truth are known; execution failure never
suppresses it.

### CLI projections

The leaf command union and result envelope stay unchanged. The exact changed command payloads are:

```ts
type StorySummaryV2 = Readonly<{
  id: string;
  scope: Readonly<{ kind: "app" }> | Readonly<{ kind: "machine"; machineId: string }>;
  title: string | null;
  tags: readonly string[];
}>;

type StoryRunDataV2 = Readonly<{
  storyId: string;
  checkpoints: readonly CheckpointV2[];
  end: StoryEvidenceV2;
  traceOutput: string | null;
}>;

type StoryExecutionDiagnosticV2 = Readonly<{
  storyId: string;
  phase: StoryFailureV2["phase"];
  commandIndex: number | null;
  checkpoints: readonly CheckpointV2[];
  evidence: FailureEvidenceV2;
  cancellation: StoryFailureV2["cancellation"];
  cause: CauseProjection;
  cleanup: CleanupV2;
  traceOutput: string | null;
}>;
```

`behavior render --module` and `behavior diff --module` select one exact module section and app-Story
coverage edges whose `coveredMachineIds` belong to that module. Trace selector text uses the canonical
JSON encoding of `ActorLocator` after the existing `actor:` prefix. Trace diff sections delete
`child-outcomes` and use exactly `event-sequence`, `transitions`, `state-changes`, `context-changes`,
`lifecycle`, `issues`, `resource-writes`, `resource-freshness`, `transaction-outcomes`,
`stream-outcomes`, `operation-occurrences`, and `timer-behavior`.

## Phase 0 Schema and golden dispositions

Every Schema declaration in `phase-0/contract-fixtures.ts` has an explicit disposition below.

| Schema                        | Disposition | Replacement                                                                                                                                                      |
| ----------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NonNegativeSafeInteger`      | retain      | All counters, revisions, sequences, ordinals, timestamps, and bounds remain non-negative safe integers with terminal-publication credit checks where applicable. |
| `CanonicalCarrier`            | retain      | Artifact/domain opaque carrier remains JSON-like and bounded; operation `K` uses its separate accepted tagged encoding.                                          |
| `CauseReasonProjection`       | retain      | Ordered Fail/Die/Interrupt projection remains exact.                                                                                                             |
| `CauseProjection`             | retain      | Ordered duplicate Cause reasons remain exact and noncanonical payloads reject.                                                                                   |
| `FlowIssueSchema`             | rewrite     | Add context, lifecycle, occurrence, hydration, factory, and capture diagnostics.                                                                                 |
| `ResourceRefSchema`           | rewrite     | Private descriptor/`K` resource identity; no public ref surface.                                                                                                 |
| `TransactionRefSchema`        | rewrite     | Private actor transaction lane plus occurrence identity.                                                                                                         |
| `ResourceSnapshotSchema`      | rewrite     | Revised availability/lookup projection.                                                                                                                          |
| `TransactionSnapshotSchema`   | rewrite     | Revised typed `K`/occurrence state union.                                                                                                                        |
| `StreamSnapshotSchema`        | rewrite     | Revised typed `K`/occurrence/generation union with no retained emission.                                                                                         |
| `TimerSnapshotSchema`         | retain      | Existing typed timer projection and Clock fields survive.                                                                                                        |
| `ChildSnapshotSchema`         | delete      | No replacement.                                                                                                                                                  |
| `ActorSnapshotSchema`         | rewrite     | Compound state, selected context, lifecycle, dual revisions, and revised operations; no children.                                                                |
| `OverlaySchema`               | rewrite     | Ordered overlay owner occurrence and effective/base semantics.                                                                                                   |
| `StoreResourceSchema`         | rewrite     | Descriptor/`K`, tags, freshness, generations, effective/base value, and revision fields.                                                                         |
| `StoreStateSchema`            | rewrite     | Revised store entries, overlays, generation fencing, and revision.                                                                                               |
| `ActivityBootSchema`          | rewrite     | Continuing binding slot, descriptor/`K`, generation, occurrence cursor; no child/P.                                                                              |
| `PendingOutcomeSchema`        | rewrite     | Operation occurrence and timer outcomes only; no child binding.                                                                                                  |
| `ActorBootSchema`             | rewrite     | ActorRef, context bindings/provider revisions, dual revisions, occurrence cursors, and no child fields.                                                          |
| `RuntimeBootSchema`           | rewrite     | Stable actor closure, revised StoreState, compatibility identity, and no roots/dynamic/children.                                                                 |
| `SlotIdentitySchema`          | rewrite     | Activity/action/timer exact slot union.                                                                                                                          |
| `BehaviorMachineSchema`       | rewrite     | `BehaviorMachineV2` appendix shape.                                                                                                                              |
| `BehaviorStorySchema`         | rewrite     | App/machine scope plus coverage.                                                                                                                                 |
| `BehaviorArtifactSchema`      | rewrite     | `BehaviorArtifactV2` appendix shape.                                                                                                                             |
| `TurnFactSchema`              | rewrite     | Context, operation occurrence/generation, store, timer, and issue facts; delete child facts.                                                                     |
| `TurnRecordSchema`            | rewrite     | `TurnRecordV2` and `RuntimeEvidenceRecordV2` union.                                                                                                              |
| `PendingWorkSchema`           | rewrite     | Exact pending occurrence/timer/context-wave shape.                                                                                                               |
| `ObservationSchema`           | rewrite     | App/machine `StoryEvidenceV2` plus runtime observation.                                                                                                          |
| `CheckpointSchema`            | rewrite     | Exact `CheckpointV2`.                                                                                                                                            |
| `CleanupSchema`               | rewrite     | Exact ordered `CleanupV2`.                                                                                                                                       |
| `StoryFailureSchema`          | rewrite     | Exact `StoryFailureV2` and evidence union.                                                                                                                       |
| `TraceArtifactSchema`         | rewrite     | Exact `TraceArtifactV2`.                                                                                                                                         |
| `CliCommandSchema`            | retain      | Leaf command union is unchanged.                                                                                                                                 |
| `DiffSectionSchema`           | rewrite     | Exact revised section names and module projections.                                                                                                              |
| `StorySummarySchema`          | rewrite     | Exact `StorySummaryV2`.                                                                                                                                          |
| `CliSuccessSchema`            | rewrite     | Story list/describe/run, behavior, trace, end, and checkpoint projections.                                                                                       |
| `UsageDetailsSchema`          | retain      | Usage detail shape remains exact.                                                                                                                                |
| `GatewayDetailsSchema`        | retain      | Gateway detail shape remains exact.                                                                                                                              |
| `ArtifactDetailsSchema`       | rewrite     | Revised artifact paths, locators, versions, and incompatibility details.                                                                                         |
| `StoryExecutionDetailsSchema` | rewrite     | Exact Story execution diagnostic fields above.                                                                                                                   |
| `CleanupDetailsSchema`        | rewrite     | Ordered cleanup failures plus aggregate Cause.                                                                                                                   |
| `IoDetailsSchema`             | retain      | Atomic local-I/O detail shape remains exact.                                                                                                                     |
| `InterruptionDetailsSchema`   | retain      | SIGINT/SIGTERM detail shape remains exact.                                                                                                                       |
| `InternalDetailsSchema`       | retain      | Internal invariant detail shape remains exact.                                                                                                                   |
| `CliDiagnosticSchema`         | rewrite     | Add revised factory/ref/context/occurrence/evidence/end diagnostics and remove child/control/final terms.                                                        |
| `CliErrorSchema`              | rewrite     | Reuse revised closed diagnostic union.                                                                                                                           |
| `Phase0Schemas`               | rewrite     | Export the revised boot, behavior, trace, Cause, runtime-evidence, CLI success, and CLI error Schema owners from one registry.                                   |

Golden dispositions are exhaustive by closed filename groups:

- rewrite `behavior.min.golden`, `boot.min.golden`, `trace.complete.min.golden`, and
  `trace.truncated.min.golden` against the revised v2 schemas;
- retain the seven `cause.*.golden` files byte-for-byte;
- regenerate every `cli-success-*.golden` and `cli-error-*.golden` from the revised exact CLI Schemas,
  even when one individual payload remains byte-equal; no hand-edited mixed generation is allowed.

## Task, proof-corpus, example, and deletion matrix

### Implementation tasks and supporting ledgers

| File                                             | Disposition | Required change                                                                                                                                                        |
| ------------------------------------------------ | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tasks/README.md`                                | rewrite     | Route every phase through accepted BEH closures and this ledger; remove stale completion claims.                                                                       |
| `tasks/PHASE_0_BASELINE_AND_CONTRACT_CUTOVER.md` | rewrite     | Reopen exact Schemas/goldens/disposition verification before implementation.                                                                                           |
| `tasks/PHASE_1_DEFINITIONS_AND_APP_PLAN.md`      | rewrite     | Compound states, context, named operations, App.M, module ownership; delete roots/views/children/dynamicMachines.                                                      |
| `tasks/PHASE_2_RUNTIME_AND_ACTOR_ENGINE.md`      | rewrite     | RuntimeFactory, ActorRef/lease/admission, context graph, dual revisions, evidence union, lifecycle.                                                                    |
| `tasks/PHASE_3_RESOURCE_KERNEL.md`               | rewrite     | Named families, typed `K`, passive reads, tags/placeholders/effective values, action-batch algebra.                                                                    |
| `tasks/PHASE_4_TRANSACTIONS_AND_ACTIVITIES.md`   | rewrite     | Occurrences, streams, timers, hydration reconciliation, remote operational leases; delete all child work.                                                              |
| `tasks/PHASE_5_REACT_AND_HOSTS.md`               | rewrite     | Prepared local actors, stable refs, useActorByRef, useView, suspension, SSR context, RuntimeFactory requests.                                                          |
| `tasks/PHASE_6_STORIES_AND_MODEL.md`             | rewrite     | Three constructors, recipes, focused context, universal OperationHost control, process/simulate, capture/end/cleanup.                                                  |
| `tasks/PHASE_7_ARTIFACTS_INSPECTION_CLI.md`      | rewrite     | Revised v2 appendix, evidence union, module slices, locators, end/failure, no child/final fields.                                                                      |
| `tasks/PHASE_8_MIGRATION_AND_DELETION.md`        | rewrite     | Three proving apps use accepted surfaces; execute deletion inventory below and verify no child-equivalent owner.                                                       |
| `REQUIRED_TESTS.md`                              | rewrite     | Map every `RT-*` row to a promoted replacement proof; delete child/root/view/control/final cases only after their negative replacements exist.                         |
| `QUICK_EXAMPLES.md`                              | rewrite     | Use App.M, actors/refs/leases, context, named operations, compound states, and new Stories only.                                                                       |
| `USER_WORKFLOW_COVERAGE.md`                      | rewrite     | Delete roots/views/dynamicMachines/children/final claims and classify unsupported machine-owned subordinates honestly.                                                 |
| `README.md`                                      | rewrite     | Route authority through revisions, accepted solutions, promoted contracts, this disposition ledger, proofs, tasks, and receipts without claiming open gaps are closed. |
| `OPERATIONS.md`                                  | rewrite     | Retain the use-case inventory while deleting child assumptions and linking each requirement to the accepted named-family solution.                                     |
| `OPERATIONS_SPEC.md`                             | rewrite     | Promote the accepted operation behavior once, then remove superseded/open alternatives and route proofs to the rewritten matrix.                                       |
| `OPERATION_SPEC_REVISIONS.md`                    | delete      | Move every surviving operation decision into the one promoted operation contract first; retain no second working specification.                                        |
| `PRE_CODING_AUDIT.md`                            | rewrite     | Remove stale ready-to-code claims until all BEH closures, Schemas, dispositions, and proofs are accepted.                                                              |
| `SCRATCHPAD.md`                                  | rewrite     | Remove promoted findings and retain only genuinely unresolved implementation blockers with current owners.                                                             |
| `phase-0/README.md`                              | rewrite     | Describe the rebaselined v2 Schema/golden/index boundary and its non-runtime role.                                                                                     |
| `phase-0/architecture-evidence.json`             | rewrite     | Replace root/view/child/control architecture paths with RuntimeFactory/context/operation-host/evidence owners.                                                         |
| `phase-0/authority-citations.json`               | rewrite     | Add revisions, accepted solution clauses, dispositions, and replacement contract links; reject stale authorities.                                                      |
| `phase-0/export-dispositions.json`               | rewrite     | Record every accepted export addition/replacement/deletion, including negative route proof owners.                                                                     |
| `phase-0/export-inventory.json`                  | rewrite     | Regenerate from the target public routes after the coordinated cutover.                                                                                                |
| `phase-0/inventory-authority.mjs`                | rewrite     | Validate the new authority chain and absence of superseded operation/design ledgers after promotion.                                                                   |
| `phase-0/inventory-dispositions.mjs`             | rewrite     | Validate every clause, Schema, task, example, deletion, BEH item, replacement, and proof owner in this ledger.                                                         |
| `phase-0/inventory-exports.mjs`                  | rewrite     | Validate new exact exports and removed roots/views/children/controls/legacy Story fields.                                                                              |
| `phase-0/issue-deletion-index.json`              | rewrite     | Add every removed child/root/view/control/result/identity/source family and its replacement proof.                                                                     |
| `phase-0/proof-index.json`                       | rewrite     | Route all revised `PROOF-*` cases and BEH seams to executable commands and owners.                                                                                     |
| `phase-0/validate.ts`                            | rewrite     | Decode the exact revised Schemas/goldens and mechanically enforce this ledger's coverage rules.                                                                        |

### Proving applications and examples

| Example or family                                 | Disposition | Required change                                                                                                                                 |
| ------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Todo Essentials target                            | rewrite     | Merge cached posts and optimistic transactions using App.M, factory-owned actors, named operations, new React hooks, and new Stories.           |
| Incident Console target                           | rewrite     | Replace roots/views/controls/children/final with first-class actors, readonly context, streams, occurrences, app Stories, evidence, and CLI v2. |
| Hydrated Offline Notes target                     | rewrite     | Factory request boot, stable actor claims, context-closed hydration, outbox memory, controlled connectivity stream, and new Stories.            |
| `examples/incident-console`                       | rewrite     | It becomes the Incident Console target and proves the first-class runbook lease actor or operational stream without a child-equivalent owner.   |
| `examples/basic-cached-posts`                     | delete      | Merge supported behavior into Todo Essentials.                                                                                                  |
| `examples/optimistic-transactions`                | delete      | Merge supported behavior into Todo Essentials.                                                                                                  |
| `examples/bounded-infinite-feed`                  | delete      | Move bounded aggregation/backpressure to package contract fixtures; no showcase replacement.                                                    |
| `examples/server-prefetch-hydration`              | delete      | Merge supported behavior into Hydrated Offline Notes.                                                                                           |
| `examples/offline-recovery`                       | delete      | Merge supported behavior into Hydrated Offline Notes.                                                                                           |
| `examples/FEATURE_COVERAGE.md`                    | delete      | Generate coverage from AppPlan, registered Stories, proofs, and receipts.                                                                       |
| `examples/typescript-proof-packed-react-18`       | rewrite     | Compile/packed proof only; new hooks and Strict lifecycle, no showcase/runtime fork.                                                            |
| `examples/typescript-proof-packed-react-19`       | rewrite     | Compile/packed proof only; new hooks and Activity lifecycle, no showcase/runtime fork.                                                          |
| `examples/typescript-proof-isolated-declarations` | rewrite     | Prove portable target declarations and absence of erased/deleted types.                                                                         |
| `examples/typescript-proof-isolated-modules`      | rewrite     | Prove module/app package isolation and one Flow/Effect identity.                                                                                |
| `examples/typescript-proof-multi-entry`           | rewrite     | Prove exact root/React/testing/server/inspect entries after atomic cutover.                                                                     |
| `examples/typescript-proof-strict`                | rewrite     | Prove strict inference for context, operations, refs/leases, hooks, and Stories.                                                                |
| package contract fixtures                         | rewrite     | Own dynamic aggregate/backpressure, OperationHost parity, occurrence, capture, and child-absence oracles.                                       |

### Deletion obligations

| Deletion target                                                                                                        | Disposition            | Gate before deletion                                                                             |
| ---------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------ |
| Root `TASK.md` contents and repository-root `tasks/**`                                                                 | delete                 | Retain only the short pointer to this implementation task index after inbound-link verification. |
| `reference/incident-console/IMPLEMENTATION_BLOCKERS.md`                                                                | delete                 | Move every live rationale/evidence reference to promoted clauses and proofs.                     |
| `API_CONTRACT.md`, `ARCHITECTURE_CONTRACT.md`, `TYPE_INFERENCE_CONTRACT.md`                                            | delete                 | Zero inbound normative links; new contracts and dispositions cover every live law.               |
| `COMPATIBILITY_CORPUS.md`, `OWNER_MAP.md`, `CAPACITY_POLICY.md`, `LAWS_AND_ORACLES.md`, `CLIENT_STRUCTURE_CONTRACT.md` | delete                 | Migrate every capacity, owner, oracle, and compatibility claim to promoted clauses/proofs.       |
| `docs/library-reference.md`, `docs/reference/lib_api.md`, `extra_features_api.md`                                      | delete                 | Generated/shipped reference replaces old public API facts.                                       |
| `test_api.md`, `test_conversation.md`                                                                                  | delete                 | New Story/testing reference and executable examples replace them.                                |
| `docs/product/XState-and-Effect-Integration.md`                                                                        | delete                 | Move surviving rationale to architecture; remove old API claims.                                 |
| `HOW_TO_USE_FLOW_STATE.md`                                                                                             | delete or full rewrite | It survives only if rewritten entirely from shipped vNext behavior.                              |
| `docs/xstate-deferred-patterns-memo.md`                                                                                | delete                 | Move surviving ownership rules to architecture first.                                            |
| obsolete root/package READMEs and `apps/docs/src/pages/**`                                                             | delete                 | Executable vNext examples and generated docs must already replace them.                          |
| `docs/codebases/**`                                                                                                    | retain                 | Vendored evidence remains non-normative.                                                         |
| `docs/docs-framework.md`                                                                                               | retain conditionally   | Retain only while Vocs is the selected documentation infrastructure.                             |
| legacy testing and controlled-stream files                                                                             | delete                 | New Story OperationHost, recipe runner, model, and negative exports pass.                        |
| legacy React/server/inspection/CLI files                                                                               | delete                 | New host hooks, request factory, evidence hub, artifacts, and packed CLI pass.                   |
| legacy runtime/registry/scheduler/artifact/compatibility files                                                         | delete                 | One production RuntimeCore owns all live and Story execution; source-absence oracle passes.      |
| child descriptor/runtime/snapshot/persistence/Story/example files                                                      | delete                 | Compile, runtime, artifact, and source searches show no child-equivalent capability.             |
| root/view/dynamicMachines/control/perform/deliver/receive/flush/settle/final compatibility aliases                     | delete                 | Packed negative imports/calls and runtime absence proofs pass.                                   |
| `@tanstack/store` and dead dependencies                                                                                | delete                 | No remaining importer and broad package build/test succeeds.                                     |
| source-text architecture tests and legacy snapshots                                                                    | delete                 | Replace each with behavioral or structural proof keyed to `PROOF-*`.                             |
| stale generated build filters and deleted-package assumptions                                                          | delete                 | Root scripts resolve only live packages and delegate to package owners.                          |

## Mechanical closure rule

Promotion must run a repository check that:

1. extracts every normative old clause heading matching
   `^(GLO|API|TYPE|SEM|SNAP|ARCH|WIRE|HOST|TEST|CLI|CUT|PROOF)-` and finds it exactly once in the
   normative clause matrix above;
2. extracts every `*Schema` declaration from `phase-0/contract-fixtures.ts` and finds it exactly once
   in the Schema matrix;
3. finds every implementation task file exactly once in the task matrix;
4. classifies every Phase 0 golden into exactly one closed filename group;
5. rejects a `rewrite` without a promoted replacement clause and proof case, a `delete` with a live
   import/reference outside migration records, or a `retain` whose old text contains a deleted noun;
6. rejects behavior/trace/CLI Schema fields or diff sections not listed in the appendix; and
7. fails if any accepted `BEH-*` item has no clause, Schema/task, and proof owner where applicable.

This ledger is complete accounting, not acceptance. A conflict between an appendix field and an
accepted behavioral decision must change this proposed file before contract promotion; an
implementation must never choose between them itself.
