# Flow State Correctness and Consolidation Plan

Status: ready for Phase 0. Preserve the current API; no redesign is authorized.

## Goal

Make Flow State correct, Effect-native, fast, and smaller internally while
preserving the recognizable Launch Workspace API.

The critical path is runtime ownership and lifecycle, keyed resources,
transactions, machine-owned asynchronous work, thin adapters, and finally safe
deletion. Type inference work follows those concrete families; it is not an
independent API rewrite.

## Authorities

Read these before work:

1. `API_CONTRACT.md` — compatibility and permitted migration.
2. `TYPE_INFERENCE_CONTRACT.md` — input-first inference and declaration rules.
3. `ARCHITECTURE_CONTRACT.md` — semantic ownership and Effect boundaries.
4. `CLIENT_STRUCTURE_CONTRACT.md` — consuming-app organization.
5. This file — ordered packets and closure checks.
6. `examples/launch-workspace/API_INVENTORY.md` — executable/partial/contract-only truth.
7. Launch Workspace source/tests and current package exports/implementation.

The pre-reset plan remains historical on branch
`backup/pre-reset-task-plan-2026-07-12` and in
`/tmp/flow-state-task-list-before-reset-2026-07-12`.

## Priority order

| Order | Work                                                | Why it comes here                                      |
| ----- | --------------------------------------------------- | ------------------------------------------------------ |
| 0     | Baseline, compact type fixtures, owner map, metrics | Prevents redoing sound code and establishes proof      |
| 1     | Canonical ResourceStore and actor runtime lifecycle | Every feature and adapter depends on these owners      |
| 2A    | Keyed resources                                     | Canonical data/identity precedes writes and UI         |
| 2B    | Transactions and concurrency                        | Writes depend on resource correctness                  |
| 3A    | Machine transitions and callback typing             | Establishes workflow core before owned async families  |
| 3B    | Streams                                             | Highest async/backpressure risk                        |
| 3C    | Timers                                              | Smaller isolated lifecycle family                      |
| 3D    | Children and restore                                | Supervision depends on actor lifecycle and generations |
| 4A–D  | Testing, React, server, inspection/CLI              | Thin adapters after runtime semantics are stable       |
| 5     | Deletion, packed clients, docs, performance closure | Delete only after parity                               |

Do not start a later row merely because its implementation already has partial
code. Re-audit that code when its dependency row closes.

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

## Approved compatibility vocabulary tasks

These are additive/preferred-name migrations. Existing valid aliases remain
until a separate future removal is approved.

### `CV-1` Add `useActor` while retaining `use`

- [ ] Export `useActor` from `flow-state/react` as the clear actor hook name.
- [ ] Keep `use` source- and behavior-compatible as an alias.
- [ ] Make both names share one implementation, inference, ownership, and cleanup path.
- [ ] Prefer `useActor` in new docs and recipes; include an alias migration note.
- [ ] Prove both names from packed React 18/19 consumers.

### `CV-2` Prefer `getSnapshot()` while retaining `snapshot()`

- [ ] Make `getSnapshot()` the preferred actor read spelling across runtime,
      React, testing, stories/scenarios, inspection, and docs.
- [ ] Keep `snapshot()` as a compatibility alias with identical return type,
      identity, timing, and side-effect-free behavior.
- [ ] Route both names through one implementation and add a differential type/runtime test.
- [ ] Inventory callers before any later proposal to remove `snapshot()`.

### `CV-3` Keep Story for authored/CLI concepts and Scenario for execution

- [ ] Use Story for authored examples, story discovery, and CLI commands such as
      `story list`, `story describe`, and `story run`.
- [ ] Use Scenario for executed outcomes, checks, reports, options, blocked
      reasons, and runtime evidence.
- [ ] Add Scenario-named execution/result types without changing CLI Story vocabulary.
- [ ] Preserve current Story-named execution types as compatibility aliases when
      they are public; migrate internals/docs before considering removal.
- [ ] Prove programmatic tests and CLI story execution consume the same Scenario result.

### `CV-4` Preserve transaction and receipt vocabulary

- [ ] Keep `flow.transaction` with `params`, `commit`, `preview`, `invalidates`,
      routes, and concurrency as the write vocabulary.
- [ ] Keep resource runtime facts under `resource:*` receipt names.
- [ ] Keep write runtime facts under `transaction:*` receipt names.
- [ ] Remove new primary docs/runtime output that calls these operations query or
      mutation; retain only explicit historical migration notes where useful.
- [ ] Prove runtime, inspection, CLI, JSON, tests, and docs agree on the same receipt names.

## Deferred unless explicitly reactivated

- Durable offline queue, undo, reconnect replay, and cross-reload persistence.
- Recurring/general schedule DSL beyond existing one-shot timer behavior.
- Generated React hooks.
- Broad module-level schema/error manifests.
- Full trace correlation for every possible descriptor/lane.
- Public API renames or removal of compatible helpers/imports.

Existing code for a deferred behavior may be preserved if sound, but workers may
not expand it or claim it complete.

## Work-packet contract

One packet contains:

- one semantic owner or one public type family;
- one named defect, missing behavior, or duplicate owner;
- 2–5 focused positive/negative tests;
- exact allowed files;
- exact focused and affected verification commands;
- one receipt stating reused, merged, removed, and still-open behavior.

Procedure:

1. Read the public call, owner, callers, tests, and Launch Workspace usage.
2. Add/strengthen the focused proof.
3. Make the smallest compatible correction.
4. Inspect Effect channels, cleanup, identity, stale work, type erasure, and duplication.
5. Refactor after green.
6. Run focused/affected checks, then `pnpm fmt && pnpm lint` before commit.
7. Review the complete slice, fix findings, rerun, and commit.

Good early smaller-model packets:

- baseline commands/metrics;
- keyed resource collision proof;
- `flow.can` versus dispatch differential proof;
- transaction input-first inference fixture;
- stream pressure fixture;
- React Strict Mode lifecycle fixture.

Reserve a stronger model/reviewer for:

- transaction or stream generic architecture;
- exact Layer output/error/requirements inference;
- compatibility ownership for `flowTest(machine)`;
- restore/hydration boundary decoding design.

## Cross-phase type inference acceptance

These ten themes remain first-class checks, but are implemented only inside the
concrete packets below. `TYPE_INFERENCE_CONTRACT.md` supplies the detailed matrix.

### 1. Constructor inference matrix

- [ ] `TI-1` Resource, transaction, stream, machine, child, and view constructors
      pass input-first positive/negative fixtures while preserving explicit
      generic fallbacks and the existing API.

### 2. Cross-definition type propagation

- [ ] `TI-2` Definition types propagate through refs, bindings, routes, actors,
      snapshots, runtime, testing, React, server, inspection, and fixtures without
      restatement or untyped intermediate descriptors.

### 3. Impossible-lane elimination

- [ ] `TI-3` Type-level `never` removes only expressible typed lanes; possible
      lanes remain required and defects/interruption/cleanup remain represented.

### 4. Exact callback-family inputs

- [ ] `TI-4` Each callback receives its exact family inputs, unsafe narrower
      callbacks fail locally, and no universal/bivariant owner bag widens inputs.

### 5. Exact Effect and Layer inference

- [ ] `TI-5` Exact Effect/Stream success, typed error, requirements, and Layer
      provision survive public declarations and semantic seams without erasure.

### 6. Module and app inference

- [ ] `TI-6` Module keys, definition maps, dependencies, app lookups, fixtures,
      and Layer requirements remain exact and stable across module reorder.

### 7. Testing inference

- [ ] `TI-7` Tests infer machine/resource/transaction/stream/child/view/app
      contracts and reject wrong owners, fixtures, states, events, and outcomes.

### 8. React inference

- [ ] `TI-8` Actor snapshots/send, resource values, view outputs, and runtime
      compatibility remain exact from packed React 18/19 declarations.

### 9. Declaration quality and compiler-cost budgets

- [ ] `TI-9` Source and packed declarations remain nameable/portable and meet
      measured check-time, emit-time, instantiation, declaration-size, and package budgets.

### 10. Dedicated positive and negative type suites

- [ ] `TI-10` Focused family suites cover source and packed declarations; each
      negative proves one intended error and cannot silently stop failing.

---

## Phase 0 — Baseline, compact proof, and owner map

Purpose: establish current truth without changing production behavior.

### 0A. Public and behavioral baseline

- [ ] Inventory root, React, testing, inspection, and server exports/types.
- [ ] Map every Launch Workspace API row to declaration, owner, tests, and
      executable/partial/contract-only status.
- [ ] Run Launch Workspace through public built entry points and record exact
      baseline successes/failures.
- [ ] Record focused package tests, types, declarations, builds, and docs gates.
- [ ] Record check time, declaration emit time, type instantiations, declaration
      size, package output size, and Launch Workspace declaration behavior.

### 0B. Compact inference baseline

Do not build the entire final matrix upfront.

- [ ] Add one positive and one negative input-first fixture for resource,
      transaction, machine, stream, Layer, and packed import declarations.
- [ ] Prove downstream callbacks cannot widen upstream Params/Input/Context/Event.
- [ ] Record genuine TypeScript limits rather than adding a new syntax to bypass them.

### 0C. Semantic-owner and deletion inventory

- [ ] Map actor start/read/send/stop/snapshot/restore owners.
- [ ] Map resource lookup/read/seed/subscribe/patch/invalidate/hydrate owners.
- [ ] Map transaction, stream, timer, and child execution owners.
- [ ] Map test/story/React/server/inspection/CLI paths back to production owners.
- [ ] List duplicate interpreters, registries, snapshot formats, pending-work
      stores, receipt/evidence builders, graph walkers, and formatters.
- [ ] List zero-caller internal files/exports after checking dynamic, CLI,
      generated, example, and test callers.
- [ ] Classify `reuse`, `move`, `merge`, `deprecate`, `delete`, `investigate`.

### Phase 0 closure

- [ ] No production behavior changed.
- [ ] Every public surface has a user job, owner, and status.
- [ ] First Phase 1 packet names one production owner and one duplicate path.
- [ ] Low-value deferred work is not on the active critical path.

---

## Phase 1 — Canonical runtime ownership and Effect lifecycle

Purpose: establish owners every later family uses. This is consolidation, not a rewrite.

### 1A. Canonical ResourceStore owner

- [ ] Select/reuse the production ResourceStore path closest to current correct behavior.
- [ ] Route seed/read/lookup/subscribe/patch/invalidate/hydrate through that owner.
- [ ] Prove host convenience methods cannot create a second cache or notification model.
- [ ] Fix absent/current patch semantics without coercing arbitrary values through
      broad records at the public/semantic seam.
- [ ] Preserve typed refs and Effect failures through runtime handles.

### 1B. Canonical actor/orchestration owner

- [ ] Select/reuse the production start/get/send/stop/snapshot/restore path.
- [ ] Complete `CV-2`: one actor read implementation behind preferred
      `getSnapshot()` and compatible `snapshot()`.
- [ ] Reject wrong-app, unregistered, duplicate, and ambiguously owned descriptors.
- [ ] Prove stop/dispose interrupts owned work and finalizes exactly once.
- [ ] Define long-lived/keep-alive actor ownership, registry eviction, explicit
      disposal, and runtime shutdown behavior.
- [ ] Ensure metadata/ownership compilation never executes client callbacks.

### 1C. Effect and Layer lifecycle

- [ ] Preserve exact operation `Effect<A, E, R>` at public and semantic seams.
- [ ] Preserve Layer acquisition errors and remaining requirements after provision.
- [ ] Give runtime, actor, subscription, stream, timer, child, and request work an
      explicit Scope owner.
- [ ] Keep Promise conversion at explicit hosts; remove duplicate Promise semantics.
- [ ] Isolate exact variadic Layer typing as a reviewed type packet rather than
      coupling it to runtime behavior edits. `[SMART]`

### 1D. Live/test differential proof

- [ ] Provide TestClock, deterministic services, controlled streams, flush/settle,
      and pending-work controls to production owners.
- [ ] Prove live/test presets share success, failure, defect, interruption, and cleanup.
- [ ] Reject false idle while production-owned work remains pending.

### Phase 1 closure

- [ ] One ResourceStore and one actor/orchestration semantic owner remain.
- [ ] Duplicate lifecycle registries/interpreters are removed or translation-only.
- [ ] No hidden empty app is treated as proof of explicit ownership.
- [ ] Differential and finalization tests pass.

---

## Phase 2A — Keyed resource correctness

### Identity and ordering

- [ ] Make `resource.ref(params...)` the canonical instance identity.
- [ ] Prove zero-, one-, and many-parameter instances cannot collide.
- [ ] Prove two instances of one descriptor never share status/value/subscribers.
- [ ] Prove seed/lookup/patch/invalidate/hydrate notification ordering and batching.
- [ ] Remove descriptor-ID fallback only after every runtime/React/test/inspection caller migrates.

### Resource lifecycle

- [ ] Prove lookup success, typed failure, defect, interruption, retry, and finalization.
- [ ] Define empty/loading/placeholder/ready/refreshing/stale/failed/paused/invalidated facts.
- [ ] Prove freshness and active invalidation behavior without conflicting flags.
- [ ] Prove `ensure`, `observe`, and `refresh` distinct ownership/lifetime behavior.
- [ ] Prove tag reuse, cross-resource invalidation, and incompatible same-ID rejection
      without running tag callbacks during compilation.

### Resource typing and boundaries

- [ ] Make declared Params contextualize key/lookup/tags/placeholder/ref.
- [ ] Infer lookup success/failure/requirements only after Params is fixed.
- [ ] Add focused wrong-params/ref/value/failure/schema fixtures.
- [ ] Decode unknown hydrated values at the boundary and reject partial mutation.

### Phase 2A closure

- [ ] Keyed identity/collision/ordering matrix passes.
- [ ] Resource Launch Workspace rows are executable or honestly deferred.
- [ ] No duplicate cache or ID-only ambiguity remains on active paths.

---

## Phase 2B — Transaction inference, concurrency, and atomicity

### Input-first transaction declarations

- [ ] Make `params` selector return or explicit Params the sole upstream Params contract.
- [ ] Contextualize commit/preview/invalidation/concurrency/routes from fixed Params.
- [ ] Infer success/failure/requirements from commit only after Params is fixed.
- [ ] Replace bivariant callback types one family at a time, each with a concrete
      unsoundness regression and compatibility fixture. `[SMART]`
- [ ] Preserve `flow.transaction`, `submit`, `flow.run`, preview, invalidates,
      routes, and existing concurrency call shapes.

### Overlap and stale completion matrix

- [ ] Test same-key and different-key overlapping requests.
- [ ] Test every currently advertised in-memory policy, including allow,
      reject-while-running, cancel-previous, and serialized queued execution.
- [ ] Prove cancelled/replaced requests cannot route or commit late results.
- [ ] Do not pretend cancellation undoes an already completed external side effect.
- [ ] Keep durable offline queue/replay deferred.

### Preview, rollback, invalidation, and restore

- [ ] Make preview application/rollback atomic with resource state and subscribers.
- [ ] Prove typed failure, defect, interruption, and cancellation restore preview correctly.
- [ ] Invalidate only on documented successful outcomes.
- [ ] Reject stale-generation success, receipts, invalidation, and routes.
- [ ] Preserve compatible pending facts across restore; reject wrong transaction/app/version.
- [ ] Complete `CV-4`: emit only canonical `transaction:*` write receipts and
      `resource:*` resource receipts on new runtime paths.

### Phase 2B closure

- [ ] Input-first positive/negative transaction fixtures pass from packed declarations.
- [ ] Overlap/concurrency/late-completion matrix passes.
- [ ] No duplicate transaction runner or optimistic state owner remains.

---

## Phase 3A — Machine transitions and callback correctness

- [ ] Preserve existing machine object/generic forms and literal state/event types.
- [ ] Give initialization, guard, update, target, params, and route callbacks only
      their exact documented inputs.
- [ ] Remove universal/bivariant callback bags family-by-family with focused proof.
- [ ] Prove rejected events cannot update state or start work.
- [ ] Add differential tests proving `flow.can(snapshot, event)` agrees with actual dispatch.
- [ ] Prove target/update/entry/exit/re-entry/terminal behavior and stable binding generations.
- [ ] Keep explicit annotations where recursive contextual inference genuinely needs them.

### Phase 3A closure

- [ ] Callback variance and invalid state/event fixtures pass.
- [ ] `flow.can` and dispatch agree across guards and states.
- [ ] Machine core has no test-only transition evaluator.

---

## Phase 3B — Stream ownership, pressure, and interruption

- [ ] Make stream Params contextualize subscribe/routes before inferring value/failure/requirements.
- [ ] Preserve acquisition requirements separately from Stream requirements. `[SMART]`
- [ ] Prove value, typed failure, defect, end, interruption, unsubscribe, and finalization.
- [ ] Test every advertised pressure policy with bounded deterministic producers:
      queue limit, coalescing/latest behavior, dropping, and backpressure as applicable.
- [ ] Prove producer interruption and consumer/actor disposal terminate ownership once.
- [ ] Prove restart, detach/reattach, keep-alive, and stale-generation emission rejection.
- [ ] Keep Effect Stream primary; controlled AsyncIterable bridges remain test compatibility only.

### Phase 3B closure

- [ ] Pressure and cleanup matrix passes without real sleeps or unbounded drains.
- [ ] No parallel test stream engine remains.

---

## Phase 3C — Timer correctness

- [ ] Preserve `flow.after` string durations and current call shape.
- [ ] Prove TestClock start, cancel, re-entry, actor stop, runtime disposal, and exactly-once fire.
- [ ] Prove restore resumes valid remaining delay and rejects stale generation firing.
- [ ] Prove timer target/event typing against the owning machine.
- [ ] Keep recurring/general schedules deferred.

### Phase 3C closure

- [ ] Timer lifecycle/restore matrix passes under virtual time.
- [ ] No real-time or test-only timer semantics remain.

---

## Phase 3D — Child supervision and restore

- [ ] Preserve `flow.child` call shape and exact child input/output/failure types.
- [ ] Prove parent start/stop/exit, child success/failure/defect/interruption, and finalization.
- [ ] Prove restart budget/policy, failed-child retry, replacement, and failure bubbling.
- [ ] Prove restore generation, stale completion rejection, actor identity, and parent ownership.
- [ ] Prove a child finalizer runs once across stop/restart/restore/disposal.
- [ ] Allow a focused child callback annotation where TypeScript cannot infer soundly;
      do not widen to `unknown` or add a new API. `[SMART review]`

### Phase 3D closure

- [ ] Child supervision/restore/stale-generation matrix passes.
- [ ] No static/test-only child definition or lifecycle engine disagrees with production.

---

## Phase 4A — Testing and story compatibility over production owners

- [ ] Make `flowTest`, `flowTest.app`, `test`, stories, and controlled fixtures use
      one production-runtime implementation.
- [ ] Preserve `flowTest(machine)` compatibility while replacing the hidden empty
      app with an explicit compatibility ownership design. `[SMART]`
- [ ] Infer machine/events/states/resources/transactions/streams/children/views/
      fixtures/scenarios from registered definitions.
- [ ] Reject wrong-app descriptors/snapshots, invalid fixtures, impossible
      expectations, false idle, and unbounded settle.
- [ ] Keep pure path/model analysis explicitly static and separate from execution claims.
- [ ] Complete `CV-3`: authored/CLI Story vocabulary and executed Scenario
      result types share one production execution and evidence result.

### Phase 4A closure

- [ ] Focused and app scenarios agree with direct production runtime results.
- [ ] No test/story semantic interpreter or duplicate pending-work model remains.

---

## Phase 4B — React and view adapters

- [ ] Preserve `FlowProvider`, `use`, `useResource`, `useView`, and optional `flow.view`.
- [ ] Complete `CV-1`: export/prefer `useActor` while retaining `use` as the same
      implementation and typed compatibility alias.
- [ ] Make provider/hooks consume production runtime handles and one publication owner.
- [ ] Prove exact actor/resource/view inference from packed React declarations.
- [ ] Test Strict Mode double mount/unmount, repeated render, actor swap, provider
      mismatch, selector equality, batching, and exactly-once cleanup.
- [ ] Test SSR/client hydration and React 18/19 packed consumers.
- [ ] Suspend only from canonical active initial-work facts; hooks never start hidden work.

### Phase 4B closure

- [ ] React differential/lifecycle/inference matrix passes.
- [ ] No React-owned runtime/cache/lease/interpreter remains.

---

## Phase 4C — Server and durable boundaries

- [ ] Decode boot/hydration/snapshot input from `unknown` at the entry boundary.
- [ ] Reject wrong version/app/machine/actor/resource/schema atomically with no partial mutation.
- [ ] Preserve generations, pending ownership, and only serializable facts.
- [ ] Prove concurrent request isolation and request-scoped finalization.
- [ ] Prove no mutable module-global request runtime/cache.
- [ ] Keep Schema optional locally and required only for values actually encoded/decoded.

### Phase 4C closure

- [ ] Unknown JSON/version/ownership/atomicity/request-concurrency matrix passes.
- [ ] No server wrapper owns alternate runtime semantics.

---

## Phase 4D — Inspection and CLI projections

- [ ] Derive graph, trace, receipts, issues, coverage, and pending work from
      production facts and pure ownership metadata.
- [ ] Keep declared/static/snapshot/runtime/mounted evidence levels distinct.
- [ ] Remove duplicate gateways, walkers, evidence builders, and formatters after parity.
- [ ] Make CLI exit nonzero and typed for invalid input, missing proof, unsupported
      behavior, domain failure, defect, interruption, and internal failure.
- [ ] Make concise human and JSON output project the same evidence object.
- [ ] Keep full universal trace correlation deferred.

### Phase 4D closure

- [ ] Programmatic inspection and CLI outputs agree on facts and failure status.
- [ ] No formatter/gateway invents causality, ownership, or proof strength.

---

## Phase 5 — Safe deletion, packed proof, docs, and performance closure

### 5A. Deletion and deprecation

- [ ] Re-run export/import/dynamic/CLI/generated/example/test caller inventory.
- [ ] Delete unreachable internal files, duplicate owners, obsolete registries,
      shadow snapshots, and redundant evidence builders after parity.
- [ ] Keep localized justified internal assertions; delete only assertions that
      hide public/semantic erasure or invalid ownership.
- [ ] Preserve public aliases until `API_CONTRACT.md` approves a migration.
- [ ] Add stable low-cost no-new-duplicate/dead-export checks where maintainable.

### 5B. Packed clients and layouts

- [ ] Build/test Launch Workspace against built/packed entry points, never private source.
- [ ] Emit exported Launch Workspace declarations without private leaks or TS7056 expansion.
- [ ] Verify small, normal, and large client layouts have identical API and semantics.
- [ ] Test root, React, testing, inspection, and server entry points from an
      external packed consumer.

### 5C. Documentation and truth

- [ ] Update API inventory so every row is executable, partial, deferred,
      deprecated, or removed truthfully.
- [ ] Provide one minimal example for every surviving public function.
- [ ] Show Schema-free local authoring first and boundary Schema second.
- [ ] Document Effect results/errors/requirements/interruption and client unwrapping.
- [ ] Remove rejected API-design vocabulary from active docs and fixtures.

### 5D. Performance and final review

- [ ] Compare runtime overhead, public exports, duplicate owner count, dead-code
      count, check/emit time, instantiations, declarations, and package size to baseline.
- [ ] Prefer library-side type simplification; reject unmeasured annotation churn.
- [ ] Run format/lint, types, declarations, focused/full tests, builds, packed
      clients, docs, and relevant performance gates.
- [ ] Run independent whole-diff API/correctness/performance review, fix blockers,
      rerun verification, and record explicit deferrals.

## Final definition of done

- [ ] Launch Workspace preserves its recognizable API through public packages.
- [ ] One ResourceStore and one actor runtime own semantics.
- [ ] Tests and adapters control/observe production owners.
- [ ] Keyed data, writes, workflows, streams, timers, children, restore, and
      boundaries pass success/failure/defect/interruption/stale/cleanup matrices.
- [ ] Input-first inference and packed declarations meet the ten type gates.
- [ ] Schema is optional locally and enforced at genuine encoded boundaries.
- [ ] Duplicate/dead internal code is removed after parity.
- [ ] Every public adjustment is compatible or separately approved.
- [ ] Docs and API inventory describe executable truth.
