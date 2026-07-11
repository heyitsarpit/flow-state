# Phase 0 — Baseline, semantic decisions, and proof

[Back to the plan tracker](../TASK.md)

Manifest only; live packet/phase status is authoritative in [TASK.md](../TASK.md).
Phase 0 permits documentation, baseline fixtures, and BUG-21 tooling repair only;
no production semantic change is authorized.

## Goal

Make Flow State correct, Effect-native, fast, and smaller internally while
preserving the recognizable Launch Workspace API.

The critical path is pure resource definitions and canonical resource-instance
identity, then ResourceStore/runtime ownership and lifecycle, transactions,
machine-owned asynchronous work, thin adapters, and finally safe deletion. Type
inference work follows those concrete families; it is not an independent API
rewrite.

## Authorities

Read these before work:

1. [API_CONTRACT.md](../API_CONTRACT.md) — compatibility and permitted migration.
2. [TYPE_INFERENCE_CONTRACT.md](../TYPE_INFERENCE_CONTRACT.md) — input-first inference and declaration rules.
3. [ARCHITECTURE_CONTRACT.md](../ARCHITECTURE_CONTRACT.md) — semantic ownership and Effect boundaries.
4. [CLIENT_STRUCTURE_CONTRACT.md](../CLIENT_STRUCTURE_CONTRACT.md) — consuming-app organization.
5. This file — ordered packets and closure checks.
6. [Launch Workspace API inventory](../examples/launch-workspace/API_INVENTORY.md) — executable/partial/contract-only truth.
7. Launch Workspace source/tests and current package exports/implementation.

The pre-reset plan remains historical on branch
`backup/pre-reset-task-plan-2026-07-12` and in
`/tmp/flow-state-task-list-before-reset-2026-07-12`.

## Priority order

The first production implementation priority is `P1A`, beginning with `P1A.0`:
normalize safe definition/app identity, stop `resource.ref(...)` from
capturing executable lookup/tag/placeholder work and establish one collision-free
resource-instance identity. ResourceStore, actor snapshots, transaction preview,
testing, React, and hydration cannot converge while they disagree on identity.

| Order | Work                                                                           | Why it comes here                                                    |
| ----- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| 0     | Baseline, contract truth, compact type fixtures, owner map                     | Establishes proof and resolves documentation/type-contract drift     |
| 1A    | Safe definitions, pure resource refs, and canonical resource-instance identity | Highest-priority correctness defect and prerequisite for all data    |
| 1B    | Canonical ResourceStore owner                                                  | Makes one keyed data owner real after identity is stable             |
| 1C    | Canonical actor owner and ownership domains                                    | Establishes app/focused/child authorization and lifecycle            |
| 1D    | Effect lifecycle and minimal live/test delegation seam                         | Prevents Phase 1 from falsely closing with a second test interpreter |
| 2     | Transactions and concurrency                                                   | Writes depend on canonical resource identity and actor generations   |
| 3A    | Machine transitions and callback typing                                        | Establishes workflow core before owned async families                |
| 3B    | Streams                                                                        | Highest async/backpressure risk                                      |
| 3C    | Timers                                                                         | Smaller isolated lifecycle family                                    |
| 3D    | Children and restore                                                           | Supervision depends on actor lifecycle and generations               |
| 4A–D  | Testing API, React, server, inspection/CLI                                     | Thin adapters after production semantics are stable                  |
| 5     | Deletion, packed clients, docs, performance closure                            | Delete only after parity                                             |

Do not start a later row merely because its implementation already has partial
code. Re-audit that code when its dependency row closes.

## Supporting authorities

Phase 0 and every later packet use these single-source ledgers:

- [Semantic decisions](./SEMANTIC_DECISIONS.md) for `DEC-1`–`DEC-22`.
- [Effect and TypeScript architecture](./EFFECT_ARCHITECTURE.md) for Service,
  Layer, Scope, primitive, error-lane, and host-boundary rules.
- [Defect ledger](./BUGS.md) for `BUG-1`–`BUG-50` and forbidden regressions.
- [Behavioral tests](./BEHAVIOR_TESTS.md) for `BT-1`–`BT-53`.
- [Compatibility tasks](./COMPATIBILITY_TASKS.md) for `CV-1`–`CV-4`.
- [Type gates](./TYPE_GATES.md) for cross-phase source/packed inference proof.
- [Packet/receipt contract](./templates/PACKET.md) for execution and handoff.

## Specialist review gates

These are required reviews, not unresolved worker choices:

- API/compatibility review during P0.6 for every observable source/runtime/
  receipt/snapshot/wire/export change and the permanent v1 corpus.
- Effect review before P1D.1c closes for Scope hierarchy, deduplicated lookup
  leases, finalizer Cause exposure, and partial Layer-acquisition cleanup.
- Concurrency review before P2 closes for latest-started `allow`, mailbox/
  reentrant ordering, stale evidence, and the actor/ResourceStore batch barrier.
- React review before P4B.1b implementation for pure initial render, Strict Mode,
  aborted/Suspense render, attachment leases, server snapshots, and provider swaps.
- Security review before P4C/P4D close for data classification, redaction,
  terminal escaping, untrusted payload transport, and size/depth limits.
- Test-architecture review in P0.6/P5.4 for model-based families, permanent
  compatibility corpus, leak thresholds, and CI-safe fault injection.

## Reference-code reading policy

The local checkouts under `docs/codebases/tanstack-query` and
`docs/codebases/xstate` are optional design and test references. They are not
Flow State dependencies, API authorities, or templates. `API_CONTRACT.md`,
`TYPE_INFERENCE_CONTRACT.md`, `ARCHITECTURE_CONTRACT.md`, the decision register
above, and the owning phase packet always win.

Rules for every worker using a reference:

1. Read only the files named by the owning packet unless a strong reviewer
   expands the packet. Record the exact files read in the packet receipt.
2. Extract an invariant, race, negative case, or test shape. Do not transplant
   implementation code, public vocabulary, status models, Promise engines,
   singleton managers, private-field techniques, or upstream defaults.
3. Translate every idea through Flow State's owners: Effect Scope/Fibers/Clock,
   canonical instance identity, typed failure lanes, immutable snapshots,
   bounded evidence, and runtime-owned publication.
4. Treat every `Anti-reference` note as a bug pattern to test against, not an
   implementation suggestion. If a reference conflicts with Flow State, stop
   using it; do not reopen a binding decision inside a smaller-model packet.
5. A copied upstream test is not proof. Rewrite the case through Flow State's
   public/production owner and assert Flow State's exact positive and negative
   behavior.

Reference themes approved by this review:

| Flow State concern         | Useful reference idea                                                                                                   | Binding rejection                                                                                                   |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Batching and subscriptions | Nested batching, first/last subscriber hooks, coherent post-update notification                                         | No module-global notification singleton, wall-clock scheduler, or observer exception in the commit path             |
| Resource/source cleanup    | Remove inactive entries only when the exact current object/generation still owns the key                                | No timer-default cache semantics or stale cleanup deleting a replacement                                            |
| Transaction overlap        | Same-scope serialization, different-scope concurrency, exact target removal, pause/cancel race tests                    | No Promise retry engine, global focus/online state, unbounded queue, or swallowed cleanup error                     |
| Actors and mailboxes       | FIFO non-reentrancy, public ID versus incarnation/session ID, exact unregister, stop-before-replacement                 | No process-global counters/random identity, private mutation, casts as ownership proof, or uncaught inspection sink |
| Timers                     | Virtual-time ordering, cancellation while flushing, callbacks that schedule/cancel callbacks                            | No `Date.now`, absolute cross-host deadlines, or a second simulated clock beside Effect TestClock                   |
| Restore/hydration          | JSON round-trip, idempotency, stale/newer conflict, no replay of completed work, deep child generation tests            | No permissive casts, entry-by-entry mutation, trusted payload hash, or render-time hydration                        |
| React stores               | Stable subscribe/getSnapshot, create-to-subscribe race closure, selector equality, Strict Mode and aborted-render tests | No render-time runtime mutation, cache creation/fetching, implicit runtime disposal, or private actor resurrection  |
| Inspection                 | Event taxonomy and post-transition facts can inspire bounded evidence cases                                             | No unredacted live refs, executable metadata probing, or synchronous observer veto of state                         |

## Assumption audit

This section separates facts observed in the current source from design choices
and predictions. Smaller models may rely on confirmed facts and binding
decisions; they must not turn an unresolved point into an implementation guess.

### Confirmed from current source/tests

- `resource.ref(...)` executes lookup/tags/placeholder eagerly and stores the
  results on a non-enumerable `__runtime` property.
- Store/in-flight/subscription identity uses descriptor ID plus raw
  `JSON.stringify(ref.key)`, while actor resources, preview overlays, and the
  flow-test cache still contain descriptor-ID-only paths.
- Current `allow` transaction tests deliberately make the latest-started
  same-ID attempt the snapshot/route winner even when an older external commit
  completes later. Older and newer external Effects may both run.
- Current completion code gates snapshot/issues/routes differently from preview,
  receipts, invalidation, rollback, and queue resumption; publication authority
  is not represented once and reused.
- Keep-alive reuse checks stable actor ID plus `machine.id`, then casts the
  existing actor to the caller's requested machine type. It does not prove the
  same definition object, app owner, or compatible contract.
- `FlowActorStartOptions.policy` is `string`; only `"keep-alive"` has special
  reuse behavior, so misspellings silently fall into other behavior.
- The React actor shell calls `machine.getInitialSnapshot()` during render, and
  hook cleanup launches `actor.dispose()` without awaiting it before a possible
  replacement start.
- Runtime boot is v1, `hydrateBoot` accepts an already typed payload, duplicate
  actor IDs are collapsed by `Object.fromEntries`, and resources are applied
  after only a version check.
- Resource internal state uses `Option`, but public snapshot/hydration conversion
  uses `undefined` as the absence marker. A legitimate `undefined` value/error
  cannot round-trip faithfully.
- Behavior coverage invokes outcome-route callbacks with Proxy probes.
- `flowTest` still owns transition, cache, transaction, stream, timer, child,
  and pending-work behavior that can drift from production owners.

### Corrections made by this review

- Do not treat every active `allow` attempt as an independent actor-fact
  publisher. Preserve current latest-started publication semantics unless a
  separately approved API change says otherwise; older attempts may execute
  externally but cannot overwrite newer actor facts.
- Do not introduce or emit boot v2 inside the decoder fix. Decode v1 safely and
  validate ownership when attaching snapshots; request a separate versioned
  compatibility packet if v1 lacks required durable facts.
- A runtime-owned React attachment/lease is a target mechanism, not an existing
  capability. A smaller model must not simulate it by merely skipping dispose,
  adding a React-global refcount, or swallowing duplicate-actor errors.
- “Incompatible same-ID tag” is not currently meaningful for ID-only tags. It
  becomes enforceable only if optional tag metadata/schema exists in a reviewed
  registry design; same-ID ID-only tags remain compatible.
- Structural key encoding, runtime-local object identity, and durable key
  support are deliberate target rules, not descriptions of current behavior.
  Their implementation stays in the strong-model packet; smaller models may add
  the approved table tests but may not invent another equality policy.

### Design-owned implementation seams

The semantic answers are fixed by DEC-1–DEC-22. Strong-model packets still own
the internal representation of provenance capabilities, the cross-owner batch
barrier, actor attachment records, stale preview-layer retirement, production
test controls, and versioned decoder types. Smaller models may implement the
named behavioral fixtures but may not select alternate semantics.

## Non-negotiable rules

- Preserve valid calls and import paths in `API_CONTRACT.md`.
- Inference is input-first: declared Params/Input/Context/Event/State inform
  downstream callbacks. Returned Effects/Streams infer only result, typed error,
  and requirements.
- Schema is optional locally and used at real `unknown` durable/foreign boundaries.
- No public `codecs`, `MachineTypes`, mandatory `bind(App)`, second constructor
  family, or mandatory public AppGraph.
- One production runtime owns semantics. Live/test presets and adapters provide
  services or controls; they do not implement another engine.
- Preserve Effect success, typed failure, requirements, Scope, interruption,
  defects, and finalization at public and semantic seams.
- Localized internal assertions are allowed only when TypeScript cannot express
  a validated internal seam, the assertion cannot leak publicly, and focused
  tests prove the invariant. Do not run a global assertion-removal campaign.
- Apply impossible-lane typing only where the preserved grammar expresses it
  soundly. Never widen to `unknown` to fake inference.
- Reuse or move correct code. Replace conflicting owners. Delete only after
  caller inventory and behavioral parity.
- Keep `evaluations/` read-only and out of Git.

## Deferred unless explicitly reactivated

- Durable offline queue, undo, reconnect replay, and cross-reload persistence.
- Recurring/general schedule DSL beyond existing one-shot timer behavior.
- Generated React hooks.
- Broad module-level schema/error manifests.
- Full trace correlation for every possible descriptor/lane.
- Public API renames or removal of compatible helpers/imports.

Existing code for a deferred behavior may be preserved if sound, but workers may
not expand it or claim it complete.

Do not add a write-ahead log, distributed persistence, exactly-once remote
effects, universal priority scheduler, Flow-owned Effect clone, Effect Cache or
RequestResolver above ResourceStore, canonical-JSON signing, cross-realm ref
interoperability, deep clone/freeze of arbitrary client values, mandatory
Schema, automatic child restart, worker/tab synchronization,
`FinalizationRegistry` correctness, or provider-owned React runtime behavior.
These are outside the current product contract even if an upstream library has
a related feature.

Deferred-item guardrails:

| Item                                | Allowed during active packets                                                                      | Not allowed without reactivation                                                             |
| ----------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Durable offline queue/undo/replay   | Preserve compiling compatibility code; test that active in-memory policies do not claim durability | New persistence format, reconnect worker, cross-reload guarantee, or “offline-ready” docs    |
| Recurring/general schedules         | Preserve one-shot `flow.after`; reject/ignore stale one-shot generations correctly                 | Cron/interval/calendar DSL, recurring restore semantics, or recurring completion claims      |
| Generated React hooks               | Preserve generic provider/hooks and hand-written app wrappers                                      | Code generation, module-generated hooks, or required generated client layer                  |
| Broad module schema/error manifests | Use optional Schema at actual encoded/foreign value boundaries                                     | Mandatory local Schema, global codec registry, or manifest required for ordinary definitions |
| Universal trace correlation         | Preserve current correlation facts and distinguish missing evidence                                | Invented causal links or requirement that every possible lane has universal correlation      |
| Public rename/removal               | Add approved preferred aliases and migrate new docs                                                | Remove compatible alias/import, change valid call shape, or publish a deprecation deadline   |

## Packet execution contract

Every packet uses [the shared packet/receipt contract](./templates/PACKET.md) and
[the type gates](./TYPE_GATES.md). Packet status lives only in [TASK.md](../TASK.md).

## Phase 0 execution packets

Purpose: establish current truth without changing production behavior. Phase 0
may add tests and correct documentation, but it may not alter runtime output.

Phase 0 packets create these durable artifacts under `architecture/correctness/`:

- `BASELINE.md`: commit, environment, public export matrix, commands, timings,
  declaration/package sizes, and exact baseline failures;
- `OWNER_MAP.md`: every semantic operation, current owner, duplicate callers,
  intended owner, and reuse/merge/delete classification;
- `SEMANTIC_DECISIONS.md`: selected decisions enriched with owner, publication,
  compatibility, rejected alternatives, and evidence;
- `EFFECT_ARCHITECTURE.md`: concrete service/layer/scope and host graph;
- `CAPACITY_POLICY.md`: measured limits, admission, overflow, eviction, and cleanup;
- `COMPATIBILITY_CORPUS.md`: permanent source/runtime/wire/export fixtures;
- `LAWS_AND_ORACLES.md`: executable laws, named non-laws, independent models,
  generators, shrinking, mutation targets, and permanent fuzz seeds.

Packet receipts are separate immutable files under `tasks/receipts/`; no
append-only aggregate receipt is an execution authority.

### P0.1 baseline family

P0.1 is preserved as a family label. Execute its three subpackets separately.

#### P0.1a Immutable public and behavioral baseline

- [ ] Record the base commit and classify every tree change as pre-existing user
      work, planning work, generated output, or packet output. Do not require a
      literally clean tree while this plan is intentionally uncommitted.
- [ ] Inventory root, React, testing, inspection, and server exports/types.
- [ ] Run the focused package and Launch Workspace public behavior available at
      the base commit; record exact successes, failures, and pre-existing flakes.
- [ ] Record Node, pnpm, TypeScript, OS, package manager, package-lock state, and
      whether each command changes generated files.
- [ ] Create architecture/correctness/BASELINE.md with the base SHA, tree
      classification, commands, exits, and current public export matrix.

Allowed changes: BASELINE.md and the P0.1a receipt only. Do not fix BUG-21 or add
performance/packed fixtures in this packet.

Commands: the exact current package test/type/build commands discovered from
package manifests, run without silently preparing stale output; record them
verbatim and finish with C if the packet changes tracked Markdown.

#### P0.1b Tooling and build-resolution baseline

- [ ] Reproduce BUG-21 against the P0.1a base before relying on root lint.
- [ ] Make installed-checkout lint resolve or prepare exactly the declarations it
      needs and report real source errors instead of missing-package cascades.
- [ ] Prove stale dist cannot satisfy the gate and genuine diagnostics remain visible.
- [ ] Record the tooling change and before/after command exits in its receipt.

Allowed changes: narrowly scoped workspace lint/build-resolution configuration
and its focused tests. Do not add performance fixtures or alter runtime behavior.

Commands: the exact BUG-21 reproduction; the focused tooling/build test; T; P;
pnpm lint; C.

#### P0.1c Packed and performance fixtures

- [ ] Add packed consumers for root, React 18, React 19, testing, server, and
      inspect entry points, including intentional private/deep-import failures.
- [ ] Record check/declaration time, type instantiations, declaration/package
      size, and Launch Workspace declaration behavior.
- [ ] Record fixed small/medium/adversarial scaling tiers for canonical-key
      depth, collection size, subscriber churn, nested batches, actor mailbox
      contention, transaction/stream pressure, evidence retention, and restore.
- [ ] Use warm-up, at least three repetitions, median/range, operation-count and
      allocation/retained-size proxies where stable. Do not invent latency
      budgets; P0.6 selects capacities from measured behavior and product needs.
- [ ] Record exact fixture directories and commands in BASELINE.md so P5.4 can
      repeat the same tiers and report ratios.

Commands: exact packed-fixture commands; timed P; the existing build-output
check; E; pnpm check; C.

### `P0.2` Launch Workspace executable-truth reconciliation

- [ ] Map every Launch Workspace API row to declaration, owner, tests, and
      executable/partial/contract-only status.
- [ ] Reconcile BUG-13 and BUG-15 without claiming runtime behavior not
      proved by current tests.
- [ ] Document BUG-14 and BUG-39 accurately and assign both behavior changes to P4A.3;
      receipts remain bounded diagnostic evidence, not business storage. Phase
      0 does not edit the read-only Launch Workspace implementation.

Details:

- Files: `examples/launch-workspace/API_INVENTORY.md`, `README.md`,
  `PHASE_0_TEST_CHECKLIST.md`, package status/reference docs, and related
  architecture tests. `launchWorkspaceSupport.ts` is read-only in Phase 0;
  BUG-14/39 are fixed with canonical business read models in P4A.3.
- Decision: replace the missing `reference-next/lib-api.md` pointer with the
  current governing `API_CONTRACT.md` or an actually generated/current reference;
  do not recreate a stale parallel API authority.
- For each row record five separate facts: declaration exists, production owner
  exists, runtime path executes, test observes the behavior, and status. Use
  `executable`, `partial`, `contract-only`, `deferred`, or `broken`; never infer
  executable from a type or descriptor alone.
- Tests: architecture/status tests agree with the inventory; every cited proof
  path exists; no row is both executable and contract-only; deferred offline
  queue and generated hooks remain deferred.
- Commands: `F(packages/flow-state/src/status-docs-architecture.test.ts
packages/flow-state/src/docs-information-architecture.test.ts
examples/launch-workspace/src/launchWorkspacePackageHygiene.test.ts)`, `D`, `C`.

### `P0.3` Compact semantic inference baseline

Do not build the entire final matrix upfront.

- [ ] Add one positive and one negative input-first fixture for resource,
      transaction, machine, stream, Layer, and packed import declarations.
- [ ] Prove downstream callbacks cannot widen upstream Params/Input/Context/Event.
- [ ] Record genuine TypeScript limits rather than adding a new syntax to bypass them.
- [ ] Replace BUG-16's source-text-only confidence with semantic assertions while
      retaining useful architecture lint as a secondary check.
- [ ] Prove BUG-38 with the broad Launch Workspace app annotation still present;
      P1A.0 owns its removal after the exact inferred app tuple/map regression is red.

Details:

- Files: `public-api-types.test.ts`, `public-typing-architecture.test.ts`, focused
  callback tests, Launch Workspace typing architecture tests, and dedicated
  source/packed fixtures discovered in P0.1a/P0.1c.
- Required fixtures: exact `LaunchWorkspaceApp` module tuple/map; module reorder
  stability; resource Params before lookup result; transaction Params before
  commit; stream Params before subscribe; machine Context/Event/State; Layer
  output/error/remaining requirements; one packed import per public entry.
- Negative fixtures each prove one diagnostic: wrong param, narrower callback,
  wrong event/state, wrong app definition, wrong Effect requirement, or private
  declaration leak. A negative that produces unrelated errors is invalid.
- Remove or narrow broad annotations such as `FlowAppDefinition` aliases only in
  a later owning type packet; Phase 0 records the widening and adds proof without
  changing production declarations.
- Commands: `F(packages/flow-state/src/public-api-types.test.ts
packages/flow-state/src/public-typing-architecture.test.ts
examples/launch-workspace/src/launchWorkspaceTypingArchitecture.test.ts)`, `T`, `P`, `C`.

### `P0.4` Child contract reconciliation

- [ ] Resolve BUG-17 before any child runtime/type implementation begins.
- [ ] Preserve every current `flow.child({ id, machine, supervision? })` call.
- [ ] Record the current expressible child types and remove unsupported completion
      claims from the active contract, or obtain separate approval for an additive design.

Binding choice for this plan: compatibility wins. Update the contract row during
Phase 0 to describe the current child shape. Treat child `input`, outcome routes,
and independent output/failure generics as a future additive proposal, not as an
implicit Phase 3D requirement. Phase 3D must still fully preserve the exact
machine/context/event/state and supervision types that exist today. This avoids
inventing a second machine API while keeping the current API fully typed.

- Files: `API_CONTRACT.md`, `TYPE_INFERENCE_CONTRACT.md`, `TASK.md`, and this
  Phase 0 file only for the
  reconciliation; current `machine-invoke-types.ts`, child runtime, public tests,
  and Launch Workspace child use are evidence and remain unchanged.
- Tests: no runtime test in this packet. Record compile probes showing what the
  current child definition does and does not carry.
- Commands: `T`, `C`.

### `P0.5` Semantic-owner, duplicate-engine, and deletion inventory

- [ ] Map actor start/read/send/stop/snapshot/restore owners.
- [ ] Map resource lookup/read/seed/subscribe/patch/invalidate/hydrate owners.
- [ ] Map transaction, stream, timer, and child execution owners.
- [ ] Map test/story/React/server/inspection/CLI paths back to production owners.
- [ ] Map every runtime `Context.Tag`/`Effect.Service`, its direct dependencies, Layer
      (`succeed`/`effect`/`scoped`), acquisition error, Scope owner, Effect
      methods, and host bridge. Flag service bags, parallel DI,
      `Layer.Any`/wiring casts, and `Effect.run*` inside semantic owners.
- [ ] Map each raw mutable Map/Set, Promise queue/flush, manual fiber/subscription
      registry, and custom timer/retry/cache/batching primitive. Classify it as
      pure data, approved host adapter, native-Effect migration candidate, or
      duplicate owner.
- [ ] List duplicate interpreters, registries, snapshot formats, pending-work
      stores, receipt/evidence builders, graph walkers, and formatters.
- [ ] List zero-caller internal files/exports after checking dynamic, CLI,
      generated, example, and test callers.
- [ ] Classify `reuse`, `move`, `merge`, `deprecate`, `delete`, `investigate`.

Details:

- Start with production owners under `core/store`, `core/orchestrator`,
  `core/machines`, and `runtime`. Trace all public adapters inward.
- Explicitly inventory the duplicate ID-only cache and transition/transaction/
  stream/timer/child owners under `testing/`; do not label them harmless test
  helpers when they decide semantics.
- For every delete candidate record static imports, dynamic imports, CLI entry,
  generated output, public export, docs/example reference, and test reference.
  “No `rg` result” alone is insufficient for CLI/generated files.
- The first production packets are fixed by this plan: P1A.1 owns resource-ref
  purity and P1A.2 owns identity. The inventory may refine file lists, not skip them.
- Commands: read-only inventory commands recorded verbatim in `OWNER_MAP.md`,
  followed by `pnpm check` to prove Phase 0 artifacts/tests do not break the repo.

### `P0.6` Semantic decisions, capacity policy, and compatibility corpus

This is the final Phase 0 synthesis packet. It runs only after P0.1a–c, P0.2,
P0.3, P0.4, and P0.5 have receipts. It turns DEC-1–DEC-22 into measurable inputs
for Phase 1 rather than allowing implementation packets to answer architecture
questions implicitly.

- [ ] Record one ownership/publication sentence for resource mutation, actor
      send, transaction start/completion, stream value, timer fire, child
      replacement, hydration, React acquisition, and evidence projection.
- [ ] Record the canonical public/internal resource-instance shape and exact
      descriptor-ID ambiguity diagnostic.
- [ ] Record app/module ID grammar, canonical app identity algorithm, registry
      container rule, and definition-container copy/freeze boundary.
- [ ] Record ref provenance, cross-runtime/cross-package rejection, and the list
      of seams that may use localized validated assertions.
- [ ] Record notification FIFO/snapshot/reentrancy/fault-isolation semantics.
- [ ] Inventory every retained collection and classify it as topology-bounded,
      configured-capacity, or runtime-lifetime-owned. Use P0.1c measurements to
      choose and record default/max capacity, overflow/eviction diagnostic, and
      active-entry protection for each configurable collection.
- [ ] Record the discriminated failure/receipt lanes and compatibility-supertype
      migration rule.
- [ ] Record the React pure-initial-snapshot/adoption and runtime lease contract.
- [ ] Record v1 immutable compatibility corpus and the explicit facts that would
      trigger a separately approved v2.
- [ ] Record the ESM/environment/peer/duplicate-package compatibility matrix.
- [ ] Record DEC-17's laws/non-laws and independent oracle for each identity,
      read, lifecycle, batch, queue, projection, and round-trip property.
- [ ] Record crash/durability nonclaims, fairness/yield/admission rules, hostile
      JavaScript accepted/rejected values, strict wire-field/version behavior,
      graceful shutdown/Cause aggregation, and React bootstrap/Offscreen/HMR.
- [ ] Record the concrete service/layer/scope dependency graph and complete the
      Effect blueprint for ResourceStore, OrchestratorSystem, transactions,
      streams, timers, children, evidence, hydration, React, server, testing,
      and CLI. No dependent packet may choose a different primitive/owner
      without a strong-model amendment.

Required artifacts:

- `SEMANTIC_DECISIONS.md`: DEC-1–DEC-22 with owner, publication point,
  compatibility impact, rejected alternatives, and required tests.
- `EFFECT_ARCHITECTURE.md`: service/layer/scope graph, exact operations and
  `A/E/R`, native primitive choices, host boundaries, acquisition/finalizer
  order, rejected clones, and focused proof commands for every runtime family.
- `CAPACITY_POLICY.md`: structure, owner, unit, measured baseline, default/max,
  overflow/eviction behavior, cleanup trigger, and adversarial proof command.
- `COMPATIBILITY_CORPUS.md`: supported source/runtime/receipt/snapshot/wire/export
  versions and permanent fixture locations.
- `LAWS_AND_ORACLES.md`: executable laws, named non-laws, production helpers the
  tests must not reuse, independent actor/transaction models, metamorphic
  relations, generators/shrink strategy, mutation targets, deterministic
  scheduler, leak checks, permanent fuzz seeds, and owning proof commands.

No production file changes are allowed. Read production source and existing
tests as evidence; update only planning/contracts/fixtures that do not alter
runtime behavior. If a decision would break a currently valid public call, mark
the dependent packet blocked and request explicit migration approval rather
than hiding the break inside a correctness test.

Tests/commands: add
`packages/flow-state/src/correctness-plan-architecture.test.ts`, then run
`pnpm exec vitest run packages/flow-state/src/correctness-plan-architecture.test.ts`;
run the exact source/packed fixtures recorded by P0.1c/P0.3; T; P; C.

### Phase 0 closure

- [ ] No production behavior changed.
- [ ] Every public surface has a user job, owner, status, and proof strength.
- [ ] `BASELINE.md`, `OWNER_MAP.md`, and the Phase 0 receipt are complete.
- [ ] BUG-13/15 documentation drift is fixed; BUG-14/39 are assigned to P4A.3.
- [ ] BUG-21 is fixed and `pnpm lint` no longer depends on manually prepared/stale output.
- [ ] BUG-17 contract conflict is reconciled compatibility-first.
- [ ] P0.6 artifacts close every DEC-1–DEC-22 field; no dependent packet retains
      a worker-selectable semantic decision.
- [ ] `EFFECT_ARCHITECTURE.md` names every runtime service, Layer kind,
      Scope/fiber owner, failure lane, host bridge, and conditional native
      primitive; semantic-owner `Effect.run*` and parallel DI paths have an
      owning removal packet.
- [ ] P1A.0, P1A.1, and P1A.2 name exact production owners, files, tests, and commands.
- [ ] Default limits and typed overflow/eviction outcomes are recorded for every
      capacity-bounded collection; no silent/unbounded default is left implicit.
- [ ] Low-value deferred work is not on the active critical path.

---
