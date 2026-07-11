# Flow State Correctness and Consolidation Plan

Status: ready for Phase 0 only. Preserve the current API; no redesign is
authorized. Do not begin production changes until the Phase 0 baseline and the
binding decisions below are recorded in the Phase 0 receipt.

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

The first implementation priority is `P1A`: stop `resource.ref(...)` from
capturing executable lookup/tag/placeholder work and establish one collision-free
resource-instance identity. ResourceStore, actor snapshots, transaction preview,
testing, React, and hydration cannot converge while they disagree on identity.

| Order | Work                                                        | Why it comes here                                                    |
| ----- | ----------------------------------------------------------- | -------------------------------------------------------------------- |
| 0     | Baseline, contract truth, compact type fixtures, owner map  | Establishes proof and resolves documentation/type-contract drift     |
| 1A    | Pure resource refs and canonical resource-instance identity | Highest-priority correctness defect and prerequisite for all data    |
| 1B    | Canonical ResourceStore owner                               | Makes one keyed data owner real after identity is stable             |
| 1C    | Canonical actor owner and ownership domains                 | Establishes app/focused/child authorization and lifecycle            |
| 1D    | Effect lifecycle and minimal live/test delegation seam      | Prevents Phase 1 from falsely closing with a second test interpreter |
| 2     | Transactions and concurrency                                | Writes depend on canonical resource identity and actor generations   |
| 3A    | Machine transitions and callback typing                     | Establishes workflow core before owned async families                |
| 3B    | Streams                                                     | Highest async/backpressure risk                                      |
| 3C    | Timers                                                      | Smaller isolated lifecycle family                                    |
| 3D    | Children and restore                                        | Supervision depends on actor lifecycle and generations               |
| 4A–D  | Testing API, React, server, inspection/CLI                  | Thin adapters after production semantics are stable                  |
| 5     | Deletion, packed clients, docs, performance closure         | Delete only after parity                                             |

Do not start a later row merely because its implementation already has partial
code. Re-audit that code when its dependency row closes.

## Binding implementation decisions

These decisions resolve conflicts discovered in the current source. A packet may
refine implementation mechanics, but it may not reverse these outcomes without
updating the governing contracts and receiving explicit approval.

1. **Definitions describe; owners execute.** `resource.ref(...)` may validate
   params and derive identity, but it must not call or retain an already-created
   lookup Effect, tags, or placeholder value. Registered resource definitions
   remain the source of executable callbacks. App compilation and inspection
   never call client callbacks.
2. **One resource-instance identity is used everywhere.** Identity combines the
   registered descriptor identity with a collision-free encoding of its key.
   Store records, in-flight work, subscriptions, actor projections, preview
   overlays, invalidation, testing, React, receipts, and hydration use that same
   identity. Descriptor ID is metadata, not an instance key.
3. **Key encoding never silently collides.** The encoder type-tags primitives,
   distinguishes `undefined`, `null`, `NaN`, infinities, `-0`, bigint, strings,
   booleans, arrays, and sorted plain-object keys. Cycles and values without a
   stable durable representation fail with a typed diagnostic at durable
   boundaries; they may use explicit runtime-local identity only when no
   serialization is requested. A ref stores its opaque encoded identity once;
   later caller mutation cannot change map identity. Do not use raw
   `JSON.stringify` as identity.
4. **Compatibility projections are derived, never authoritative.** Existing
   descriptor-ID resource reads may remain only as an unambiguous derived view
   for one owned instance. Runtime decisions always use canonical instance
   identity; ambiguous descriptor-ID reads fail or return no value rather than
   selecting an arbitrary instance.
5. **Tag identity is registry-owned.** ID-only tags with the same ID are
   compatible. If optional metadata/schema is present, the app registry rejects
   incompatible same-ID definitions. Resource compilation does not execute tag
   callbacks.
6. **Ownership has three explicit internal modes.** An app-bound runtime accepts
   only registered definitions; a focused compatibility runtime gives
   `createRuntime().createActor(machine)` and `flowTest(machine)` an explicit
   synthetic owner; a child inherits its parent app/runtime domain. No hidden
   empty app counts as ownership.
7. **Testing does not remain a second engine until Phase 4.** Phase 1D must make
   the execution path in `flowTest` delegate transitions and owned work to the
   production runtime. Phase 4A retains testing API, fixture, inference, Story,
   Scenario, and diagnostics cleanup only.
8. **Only the publication-owning generation may publish completion facts.** For
   current same-ID `allow` behavior, every attempt may execute externally, but
   the latest-started generation owns actor snapshot, issue, route, success/failure
   receipt, and invalidation publication. An older, cancelled, replaced,
   restored-over, or otherwise stale generation may finalize and retire only its
   own preview layer without changing the newer visible result; it cannot publish
   an ordinary completion or start queued work owned by another generation.
   “External effect ran” and “generation may publish actor facts” remain separate.
9. **Hydration is decode-then-commit.** Boot/hydration accepts `unknown` at the
   host boundary, validates version and ownership into a temporary value, and
   mutates no runtime owner until the entire payload is valid. Existing valid v1
   payloads remain accepted and v1 remains the default emitted format until a
   separately approved compatibility packet authorizes a new version. Stricter
   rejection of invalid payloads is a compatible correctness fix; missing v1
   ownership facts must be validated when a snapshot is attached to a registered
   machine, not invented during decode.
10. **Inspection reports metadata; it never probes behavior.** Dynamic callback
    results are reported as dynamic/unknown unless runtime evidence exists.
    Inspection and coverage must not invoke route, selector, guard, lookup, tag,
    placeholder, or service callbacks with fabricated values.
11. **The current child API is the compatibility floor.** Preserve existing
    `{ id, machine, supervision }` calls. The richer contract text mentioning
    child `input`, `routes`, output, and failure is incomplete relative to the
    current machine type. Phase 0 must reconcile that contract before Phase 3D;
    no worker may invent trailing machine generics or child semantics locally.
    If the richer shape is retained, it must be an additive, separately reviewed
    type-and-runtime packet with defaults preserving every current call.
12. **Type proof is semantic, not textual.** Source-string bans and annotation
    counts do not prove inference. Positive/negative compiler fixtures and packed
    declaration consumers are authoritative. Explicit annotations remain only
    where TypeScript recursion genuinely requires them and must not widen exact
    module/app maps.

## Known defect ledger

Every defect below must be assigned to exactly one packet and closed by a
positive/negative regression. Do not fix it opportunistically in an unrelated
packet.

| ID      | Current defect                                                                                                                                              | Owning packet |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| BUG-1   | `resource.ref` executes lookup/tags/placeholder eagerly and stores hidden executable state; key execution is not isolated to explicit identity construction | P1A.1         |
| BUG-2   | Store identity uses raw `JSON.stringify`, permitting collisions/failures                                                                                    | P1A.2         |
| BUG-3   | Actor resource snapshots and owned-query keys collapse instances to descriptor ID                                                                           | P1A.3         |
| BUG-4   | Transaction preview overlays and rollback bookkeeping collapse refs by descriptor ID                                                                        | P2.2          |
| BUG-5   | `flowTest` owns an ID-only cache and independent machine/async interpreters                                                                                 | P1D.2         |
| BUG-6   | Transaction completion uses inconsistent gates for summary snapshot, preview, receipt, invalidation, route, and queue publication                           | P2.1          |
| BUG-7   | Preview patches notify/mutate incrementally instead of one atomic batch                                                                                     | P2.2          |
| BUG-8   | App-bound and focused runtimes do not express distinct ownership authorization                                                                              | P1C.1         |
| BUG-9   | Hydration trusts a typed payload, validates little, and can mutate before full validation                                                                   | P4C.1         |
| BUG-10  | Behavior coverage invokes client route callbacks with Proxy probes                                                                                          | P4D.1         |
| BUG-11  | React actor hook starts through compatibility `createActor`, not the canonical orchestrator                                                                 | P4B.1         |
| BUG-12  | `useActor` preferred alias is absent                                                                                                                        | P4B.2         |
| BUG-13  | Launch Workspace docs/inventory disagree about executable resource behavior                                                                                 | P0.2          |
| BUG-14  | Readiness view counts obsolete `cache:invalidate` receipts                                                                                                  | P2.3          |
| BUG-15  | API inventory links a missing `reference-next/lib-api.md`                                                                                                   | P0.2          |
| BUG-16  | Launch Workspace app/graph annotations can widen types while source-text tests remain green                                                                 | P0.3          |
| BUG-17  | Child contract promises input/output/failure propagation absent from current public types                                                                   | P0.4          |
| BUG-18T | Transaction bivariant callback helpers permit unsafe narrower callbacks                                                                                     | P2.4          |
| BUG-18M | Machine bivariant callback helpers permit unsafe narrower callbacks                                                                                         | P3A.2         |
| BUG-18S | Stream bivariant callback helpers permit unsafe narrower callbacks                                                                                          | P3B.3         |
| BUG-19  | Runtime disposal/finalizer/registry eviction ordering is not proved exactly once                                                                            | P1C.3         |
| BUG-20  | Descriptor-ID compatibility reads have no defined ambiguity behavior                                                                                        | P1A.3         |
| BUG-21  | Root `pnpm lint` resolves examples/type fixtures through missing or stale built declarations and emits cascading false errors                               | P0.1          |
| BUG-22  | Keep-alive actor reuse checks only actor ID plus machine ID and can cast a different same-ID machine definition to the requested type                       | P1C.1         |
| BUG-23  | React's inert actor shell calls `machine.getInitialSnapshot()` during render, executing the context factory outside canonical actor start                   | P4B.1         |
| BUG-24  | React actor swap cleanup fires asynchronous disposal without coordinating replacement start, allowing same-ID registry races                                | P4B.1         |
| BUG-25  | `FlowActorStartOptions.policy` accepts any string, so unsupported policy values silently act like another policy                                            | P1C.1         |
| BUG-26  | Resource snapshot/hydration code uses `undefined` as absence and cannot faithfully represent a declared `Value` or error containing `undefined`             | P1A.4         |

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

### High-risk points that remain design-owned

- The exact representation of the descriptor-ID compatibility projection when
  two instances exist. It must never choose arbitrarily, but whether the public
  read diagnoses or yields no value must be fixed in P1A.3 before adapter edits.
- The exact runtime attachment/lease primitive for shared keep-alive actors and
  how hook unmount, explicit stop, and runtime shutdown interact.
- How schema-free local resource values are omitted or rejected at durable
  encoding boundaries without making Schema mandatory for ordinary use.
- How stale preview layers are retired after an external Effect completed while
  preserving newer overlays and atomic subscriber visibility.
- How `flowTest` progress controls drive production owners without exposing
  private fibers or creating a second scheduler.
- Any additive child input/output/failure design. P0.4 currently keeps it deferred.

## Regressions that must not be introduced

These are review blockers even when a focused test is green. Each packet receipt
states which applicable guardrails were checked.

### Public API and type safety

- Do not remove or behaviorally fork `use`, `snapshot()`, `createActor`, public
  package entry points, or other compatibility aliases.
- Do not add a mandatory Schema, public AppGraph, `bind(App)`, second constructor
  family, required lifetime argument, or required generic restatement.
- Do not widen exact Params/Input/Context/Event/State/Value/Error/Requirements to
  `any`, `unknown`, `Record<string, unknown>`, a universal owner bag, or a cast at
  a public/semantic seam.
- Do not make an unsafe callback compile by adding bivariance, overload catch-alls,
  optional fields, or `as` assertions that leak through declarations.
- Do not “fix” a negative fixture by changing its intended diagnostic, adding
  unrelated errors, `@ts-ignore`, or a cast in the fixture.
- Do not narrow valid Effect requirements or erase typed failure because a live
  test happens to provide the service or never exercises the lane.
- Do not accept unsupported actor/concurrency/pressure policies as strings that
  silently behave like a default.

### Identity, data, and privacy

- Do not use descriptor ID alone for resource instances, actor-owned resources,
  previews, in-flight lookups, subscriptions, tests, React sources, or hydration.
- Do not use raw `JSON.stringify`, delimiter concatenation, object `toString`, or
  map insertion order as canonical identity.
- Do not recompute identity from mutable caller-owned params after ref creation.
- Do not keep runtime-local object/function identity in an unbounded module-global
  registry; its lifetime belongs to the owning runtime/store and must be releasable.
- Do not serialize runtime-local identity as if it were durable or claim that it
  round-trips across processes.
- Do not expose raw key/param values in receipts, diagnostics, traces, CLI, or
  logs by default; use bounded opaque instance IDs and explicit redaction.
- Do not conflate absent with present `undefined`, `null`, `false`, `0`, empty
  string, `NaN`, or an empty collection.
- Do not preserve descriptor-ID compatibility by storing duplicate mutable
  snapshots as a second source of truth or choosing one keyed instance by order.
- Do not let two runtimes/apps alias records, actors, generations, subscriptions,
  queues, or runtime-local key tokens merely because public IDs match.

### Ownership, Effect channels, and cleanup

- Do not copy production decisions into React/testing/server/inspection/CLI to
  make an adapter test pass; route the adapter to the production owner.
- Do not run lookup, commit, subscribe, route, guard, update, selector, tag,
  placeholder, context initialization, or service callbacks during definition
  normalization, app compilation, inspection probing, or inert React render.
- Do not call `Effect.run*` or convert to Promise inside a semantic owner when
  doing so erases requirements, Scope, interruption, Cause, or finalization.
- Do not catch all failures as one `unknown` error; keep typed failure, defect,
  interruption, invalid input, unsupported behavior, and internal failure distinct.
- Do not detach work without a named Scope owner and a shutdown/finalizer test.
- Do not dispose/finalize twice, return before required finalizers finish, or
  delete a registry entry belonging to a replacement generation.
- Do not make stop/dispose succeed by abandoning children, streams, timers,
  lookups, transactions, subscriptions, or request services in the background.
- Do not use mutable module globals for runtime, request, actor, cache, queue,
  scheduler, key-token, or pending-work ownership.

### Concurrency and atomicity

- Do not let a stale transaction/stream/timer/child completion overwrite a newer
  snapshot, issue, receipt, route, invalidation, counter, or generation.
- Do not suppress or undo an external side effect and claim cancellation did it;
  cancellation controls owned fibers and publication, not already-completed I/O.
- Do not make `allow` behave like serialize/reject, or let an older allow attempt
  overwrite the latest-started publication owner.
- Do not let cancel-previous start replacement publication before the old
  generation is marked stale, and do not treat late interruption as failure.
- Do not dequeue or resume work from another transaction scope/key/generation.
- Do not publish any intermediate preview/hydration/batch state to subscribers.
- Do not roll back a stale preview by restoring an old root over newer layers.
- Do not invalidate on rejection, typed failure, defect, interruption, or stale
  success unless the public contract explicitly says so.
- Do not implement deterministic tests with sleeps, wall-clock races, unbounded
  producers, or “flush twice” as a substitute for a defined pending-work rule.

### Actor and React behavior

- Do not reuse a keep-alive actor solely because IDs match; prove definition and
  ownership compatibility before returning a typed actor.
- Do not make keep-alive pass by never disposing anything. Shared retention needs
  runtime-owned attachment accounting plus explicit stop/runtime-shutdown behavior.
- Do not let one React consumer unmount stop an actor still owned by another
  consumer, and do not let Strict Mode create two durable actors/finalizers.
- Do not call the machine context factory once for a render shell and again for
  the real actor start.
- Do not start a same-ID replacement until prior hook ownership is synchronously
  detached and asynchronous disposal cannot race registry registration.
- Do not allow a stale shell/source/listener to publish after machine, runtime,
  actor ID, snapshot, or resource ref changes.
- Do not start lookup/actor/stream/timer/transaction work during render or from a
  resource/view hook that is specified as read-only.

### Hydration, inspection, testing, and deletion

- Do not mutate any resource/actor owner until the complete foreign payload has
  decoded and ownership/schema checks pass.
- Do not silently ignore invalid entries, duplicate IDs, reserved/prototype-like
  keys, unsupported versions, stale generations, or newer existing data.
- Do not add unversioned durable fields or change v1 default emission as part of
  an unrelated decoder fix.
- Do not encode callbacks, Effects, fibers, services, subscribers, live defects,
  or unredacted secrets into boot/snapshot output.
- Do not execute callbacks to infer inspection metadata or upgrade static proof
  to runtime/mounted proof without production evidence.
- Do not let `flowTest.settle()` report idle while production owners have queued,
  blocked, scheduled, or finalizing work.
- Do not make test/live parity pass by weakening one side's assertions or
  normalizing away meaningful receipts, issues, generations, or Causes.
- Do not delete a duplicate-looking file until caller inventory and behavioral
  parity identify the surviving owner; do not delete a public alias as dead code.
- Do not update bundle/performance baselines merely to make a gate green without
  measuring and explaining the change.

## Required behavioral tests for smaller-model packets

Smaller models implement only rows assigned by their packet. They write the
positive and negative test first, demonstrate that the negative exposes the
named defect when applicable, and do not redesign the owner while writing tests.

Test-authoring rules:

- Test observable state, receipts, issues, callbacks, finalizer counts, and
  public handles. Avoid private-map assertions unless the packet is an explicit
  architecture/deletion guard.
- A positive proves the supported behavior. Its paired negative triggers one
  forbidden condition and asserts both the diagnostic/outcome and the absence of
  unintended mutation/work.
- Use TestClock, Deferred, controlled Stream, bounded producers, and explicit
  pending-work controls. No real sleeps or timing luck.
- Prefer a small table-driven matrix when lanes share one rule. Do not create a
  second interpreter or fake semantic owner in the fixture.
- Do not rewrite or weaken an existing regression to match new output. If the
  intended contract conflicts with an existing test, stop and update the packet.
- Run the same scenario through the direct production owner and adapter when the
  packet claims live/test/React/server/CLI parity.

| ID    | Positive behavior to prove                                                                                           | Negative behavior to prove absent                                                                                                | Packet         |
| ----- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| BT-01 | Existing and preferred aliases/imports execute the same implementation and return the same typed result              | Removing, forking, or changing timing/identity of a compatibility alias fails                                                    | CV-1/CV-2/P5.2 |
| BT-02 | Creating a resource definition/ref is inert except for one explicit key derivation at ref creation                   | Lookup, tags, placeholder, app compilation, or inspection callback executes early                                                | P1A.1          |
| BT-03 | Equal approved keys produce one stable instance ID and distinct primitive/tuple/object cases remain distinct         | JSON-collision cases, delimiter tricks, cycles, mutation, or unsupported durable values silently alias                           | P1A.2          |
| BT-04 | Two refs of one resource retain independent value/status/in-flight work/subscribers across runtime and test          | Patch/invalidate/restore/subscribe of one instance changes or wakes the sibling                                                  | P1A.3          |
| BT-05 | Present `undefined` and other falsy values round-trip with correct availability and type                             | Present `undefined` becomes absent/idle, or absence becomes a present value/error                                                | P1A.4          |
| BT-06 | Resource lookup covers success, typed failure, retry, refresh, interruption, and exactly-once finalization           | Defect becomes typed failure, stale lookup publishes, or cancellation leaks/finalizes twice                                      | P1A.4/P1B.1    |
| BT-07 | Seed/patch/invalidate/hydrate batches publish one coherent post-operation snapshot in deterministic order            | A subscriber sees a partially patched multi-ref state, duplicate notification, or reentrant corruption                           | P1B.2          |
| BT-08 | Same-ID ID-only tags reuse one semantic tag and intentional tag invalidation reaches all matching refs               | App compilation runs tag callbacks, incompatible metadata is accepted, or unrelated tags invalidate                              | P1A.4          |
| BT-09 | Registered, focused compatibility, and inherited-child ownership each start the correct actor                        | Wrong-app/unregistered/ambiguous definition starts work or a hidden empty app authorizes it                                      | P1C.1          |
| BT-10 | Keep-alive reuses the same compatible actor and preserves state under the documented ownership policy                | Different same-ID machine/app is cast and reused; invalid policy silently behaves as default                                     | P1C.1/P1C.3    |
| BT-11 | Stop, actor dispose, repeated dispose, and runtime shutdown interrupt owned work and finalize/evict once             | New sends/work start after stopping, finalizer is skipped/doubled, or old cleanup deletes replacement                            | P1C.3          |
| BT-12 | Direct runtime and `flowTest` produce equivalent snapshot/receipts/issues/Cause for one scenario                     | Test reports false idle, uses its old cache/interpreter, or hides a production pending/failure lane                              | P1D.2/P4A.1    |
| BT-13 | `flow.can` and dispatch agree for accepted transitions, guards, updates, entry/exit, and re-entry                    | Rejected event mutates context, starts owned work, emits accepted receipt, or disagrees with `flow.can`                          | P3A.1          |
| BT-14 | Reject, cancel-previous, serialize, and allow follow their documented overlap/order policy                           | Policy cross-talk, wrong queue scope, rejection side effects, or cancellation claims to undo external I/O                        | P2.1           |
| BT-15 | Latest-started allow generation alone publishes same-ID actor facts while all allowed external Effects may run       | Older completion overwrites summary/routes/issues/ordinary completion receipt/invalidation or newer preview                      | P2.1/P2.2      |
| BT-16 | Multi-ref preview applies/commits/rolls back atomically and overlapping layers preserve the visible winner           | Second patch failure leaves partial state or stale rollback restores an old root over a newer layer                              | P2.2           |
| BT-17 | Successful write emits canonical transaction/resource receipts and documented invalidation exactly once              | Reject/failure/defect/interrupt/stale completion invalidates or emits legacy cache/query/mutation receipt                        | P2.3           |
| BT-18 | Stream value/failure/defect/end/interruption/restart follows one generation and finalizes once                       | Late old-generation value/end/route publishes, unsubscribe leaks, or test bridge becomes the owner                               | P3B.1          |
| BT-19 | Every exported pressure policy obeys its bounded capacity/order/drop/backpressure contract                           | Overflow is silent, producer never resumes/interrupts, queue is unbounded, or settle reports idle                                | P3B.2          |
| BT-20 | One-shot timer fires exactly once under TestClock and valid restore resumes remaining delay                          | State exit/stop/dispose/stale generation still fires; invalid duration/target is accepted                                        | P3C.1          |
| BT-21 | Child start/stop/supervision/retry/restore preserves parent ownership and generation with one finalizer              | Old child completion publishes after replacement/restore, wrong child retries, or parent shutdown leaks child                    | P3D.2          |
| BT-22 | React render is inert, real actor starts once, shared keep-alive ownership survives one unmount, and swap is ordered | Context factory/work runs in shell render, Strict Mode leaks, unmount stops another consumer, or async dispose races replacement | P4B.1          |
| BT-23 | Valid v1 boot decodes fully then commits once; attachment validates the target machine/app                           | Malformed/duplicate/wrong-version/wrong-owner payload partially mutates or duplicate ID silently wins                            | P4C.1          |
| BT-24 | Concurrent request runtimes with identical public IDs remain isolated and finalize once                              | Request A observes/stops B, module-global cache leaks data, or failed acquisition leaves services alive                          | P4C.2          |
| BT-25 | Inspection reports declared/dynamic/runtime/mounted evidence without invoking client callbacks                       | Proxy probing executes route/guard/selector/lookup/tag callbacks or static evidence is labeled runtime                           | P4D.1          |
| BT-26 | Programmatic Scenario, CLI human output, and CLI JSON project one evidence/status object                             | Missing proof/domain failure/defect/interruption/internal error exits success or renderers disagree                              | P4A.2/P4D.2    |
| BT-27 | Packed root/React/testing/server/inspect clients execute the same public behavior as source consumers                | Deep/private import is required, declaration widens/leaks private names, or React 18/19 differs                                  | P5.2           |

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

Implementation detail (`P4B.2`):

- Owner/files: `packages/flow-state/src/react-entry.ts`,
  `packages/flow-state/src/react/use-actor.ts`, React API/type tests, packed
  React 18/19 fixtures, and preferred-name docs only.
- Tests: both exports are the same function value; both infer identical actor
  snapshot/send types; both follow the same Strict Mode cleanup path; both work
  from the packed `flow-state/react` entry.
- Commands: `F(packages/flow-state/src/react/use-actor.test.ts
packages/flow-state/src/public-api-types.test.ts)`, `T`, `P`, packed React
  fixture commands recorded by P0.1, `C`.
- Non-goal: do not remove `use`, add generated hooks, or create a second hook.

### `CV-2` Prefer `getSnapshot()` while retaining `snapshot()`

- [ ] Make `getSnapshot()` the preferred actor read spelling across runtime,
      React, testing, stories/scenarios, inspection, and docs.
- [ ] Keep `snapshot()` as a compatibility alias with identical return type,
      identity, timing, and side-effect-free behavior.
- [ ] Route both names through one implementation and add a differential type/runtime test.
- [ ] Inventory callers before any later proposal to remove `snapshot()`.

Implementation detail (`P1C.2`):

- Owner/files: actor public types, canonical actor implementation,
  `packages/flow-state/src/core/orchestrator/**`, and callers discovered by an
  exact `rg -n '\.snapshot\('` inventory. Adapters migrate only when their
  owning packet runs.
- Tests: both methods return the same object identity at the same instant; both
  are side-effect free; aliases remain identical after send/flush/restore/stop;
  packed declarations expose the same return type.
- Commands: `F(packages/flow-state/src/orchestrator-system.test.ts
packages/flow-state/src/runtime-lifecycle.test.ts
packages/flow-state/src/public-api-types.test.ts)`, `T`, `P`, `C`.
- Non-goal: no alias removal. A remaining caller is a migration receipt item,
  not permission to break it.

### `CV-3` Keep Story for authored/CLI concepts and Scenario for execution

- [ ] Use Story for authored examples, story discovery, and CLI commands such as
      `story list`, `story describe`, and `story run`.
- [ ] Use Scenario for executed outcomes, checks, reports, options, blocked
      reasons, and runtime evidence.
- [ ] Add Scenario-named execution/result types without changing CLI Story vocabulary.
- [ ] Preserve current Story-named execution types as compatibility aliases when
      they are public; migrate internals/docs before considering removal.
- [ ] Prove programmatic tests and CLI story execution consume the same Scenario result.

Implementation detail (`P4A.2`):

- Owner/files: `packages/flow-state/src/core/api/story-types.ts`,
  `packages/flow-state/src/testing/flow-stories.ts`,
  `packages/flow-state/src/testing/flow-story-test.ts`, CLI story adapters,
  inspection renderers, compatibility exports, and their tests.
- Tests: authored discovery remains Story-named; execution returns the same
  Scenario result through programmatic and CLI paths; public Story execution
  names are aliases; JSON and human output project one result; domain failure,
  blocked proof, defect, and interruption retain distinct status.
- Commands: `F(packages/flow-state/src/flow-story-helper.test.ts
packages/flow-state/src/flow-story-run.test.ts
packages/flow-state/src/cli-test/flow-state-cli.test.ts
packages/flow-state/src/public-api-types.test.ts)`, `T`, `P`, `C`.
- Dependency: P1D.2 must already route Scenario execution through production
  runtime owners.

### `CV-4` Preserve transaction and receipt vocabulary

- [ ] Keep `flow.transaction` with `params`, `commit`, `preview`, `invalidates`,
      routes, and concurrency as the write vocabulary.
- [ ] Keep resource runtime facts under `resource:*` receipt names.
- [ ] Keep write runtime facts under `transaction:*` receipt names.
- [ ] Remove new primary docs/runtime output that calls these operations query or
      mutation; retain only explicit historical migration notes where useful.
- [ ] Prove runtime, inspection, CLI, JSON, tests, and docs agree on the same receipt names.

Implementation detail (`P2.3`, projected by `P4D.2`):

- Owner/files: `core/api/receipt-types.ts`, production resource/transaction
  receipt constructors, inspection receipt projections, CLI renderers,
  Launch Workspace views/status docs, and focused receipt tests.
- Tests: resource actions emit only `resource:*`; write actions emit only
  `transaction:*`; no new runtime output emits `query:*`, `mutation:*`, or
  `cache:*`; JSON and human output share receipt types; Launch Workspace
  readiness invalidation count uses canonical receipts.
- Commands: `F(packages/flow-state/src/transactions.test.ts
packages/flow-state/src/runtime-inspection.test.ts
packages/flow-state/src/inspection-format.test.ts
examples/launch-workspace/src/launchWorkspace.test.ts)`, `T`, `P`, `E`, `D`, `C`.
- Non-goal: historical migration prose may mention old terms when clearly
  labeled; durable offline queue remains deferred.

## Deferred unless explicitly reactivated

- Durable offline queue, undo, reconnect replay, and cross-reload persistence.
- Recurring/general schedule DSL beyond existing one-shot timer behavior.
- Generated React hooks.
- Broad module-level schema/error manifests.
- Full trace correlation for every possible descriptor/lane.
- Public API renames or removal of compatible helpers/imports.

Existing code for a deferred behavior may be preserved if sound, but workers may
not expand it or claim it complete.

Deferred-item guardrails:

| Item                                | Allowed during active packets                                                                      | Not allowed without reactivation                                                             |
| ----------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Durable offline queue/undo/replay   | Preserve compiling compatibility code; test that active in-memory policies do not claim durability | New persistence format, reconnect worker, cross-reload guarantee, or “offline-ready” docs    |
| Recurring/general schedules         | Preserve one-shot `flow.after`; reject/ignore stale one-shot generations correctly                 | Cron/interval/calendar DSL, recurring restore semantics, or recurring completion claims      |
| Generated React hooks               | Preserve generic provider/hooks and hand-written app wrappers                                      | Code generation, module-generated hooks, or required generated client layer                  |
| Broad module schema/error manifests | Use optional Schema at actual encoded/foreign value boundaries                                     | Mandatory local Schema, global codec registry, or manifest required for ordinary definitions |
| Universal trace correlation         | Preserve current correlation facts and distinguish missing evidence                                | Invented causal links or requirement that every possible lane has universal correlation      |
| Public rename/removal               | Add approved preferred aliases and migrate new docs                                                | Remove compatible alias/import, change valid call shape, or publish a deprecation deadline   |

## Work-packet contract

One packet contains:

- one semantic owner or one public type family;
- one named defect, missing behavior, or duplicate owner;
- 2–5 focused positive/negative test groups; a group may be a table-driven
  matrix when one semantic rule has several required lanes;
- exact allowed files;
- exact focused and affected verification commands;
- one receipt stating reused, merged, removed, and still-open behavior.

Each packet definition below names its primary files. A worker must run `rg` for
callers before editing and add directly affected callers/tests to the packet
receipt; that discovery does not authorize unrelated cleanup. Production files
outside the named family require a packet update before they are changed.

Use these command tiers consistently:

- `F(<files>)`: `pnpm exec vitest run <files>` for the exact focused test files.
- `T`: `pnpm --filter flow-state check:cli-source-types`.
- `P`: `pnpm --filter flow-state build` to prove packed declarations and package output.
- `E`: `pnpm --filter @flow-state/launch-workspace test -- --run` after rebuilding `flow-state`.
- `D`: `pnpm docs:build` for documentation/status packets.
- `C`: `pnpm fmt && pnpm lint` immediately before commit.
- `V`: `pnpm verify` only at phase closure or when a packet changes shared public
  types/runtime behavior broadly enough to affect the workspace.

An exact packet command list expands `F` to real paths and then lists the needed
tiers in order. Never report a tier as passed unless that exact command ran.

Packet receipt template:

```text
Packet: <ID and title>
Owner after change: <one semantic owner or type family>
Defect closed: <BUG-ID and observable failure>
Reused: <existing implementation retained>
Merged/moved: <callers routed to owner>
Removed: <duplicate state/engine/code deleted, or none with reason>
Compatibility: <calls/imports/aliases proved>
Tests added: <positive/negative names>
Commands: <exact commands and result>
Still open: <explicitly deferred work and next packet>
```

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
- documentation/API-inventory truth reconciliation;
- keyed resource collision fixtures after P1A.2 fixes the identity contract;
- `flow.can` versus dispatch differential proof;
- transaction input-first inference fixture;
- stream pressure fixture;
- React Strict Mode lifecycle fixture.

Reserve a stronger model/reviewer for:

- transaction or stream generic architecture;
- exact Layer output/error/requirements inference;
- compatibility ownership for `flowTest(machine)`;
- resource-ref purity and canonical key encoding;
- migration of the test interpreter onto production owners;
- transaction stale-completion and atomic preview ownership;
- child contract reconciliation and any additive child type design;
- restore/hydration boundary decoding design.

### Packet routing for implementation models

| Route                       | Packets                                                                                                                                                                                                                          | Handoff rule                                                                                                                                                         |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Smaller model               | P0.1, P0.2, P0.5 inventory work, P1A.2 collision-test subpacket after the encoder implementation is fixed, P2.3, P3A.1 focused differentials, P3B.2 table fixtures, P3C.1 focused timer cases, P4B.2, P5.2/P5.3 mechanical proof | Give exactly one packet, its named files, tests, commands, non-goals, and prior receipt; stop on any public-type or semantic-owner design question                   |
| Medium implementation model | P1B.1/P1B.2, P1C.2, P3B.1 after ownership is fixed, P4A.1 API cleanup, P4B.1 after lease semantics are fixed, P4D.2, P5.1                                                                                                        | Require focused red proof first and a strong review before phase closure                                                                                             |
| Strong model plus reviewer  | P0.3/P0.4 decisions, P1A.1/P1A.2 implementation/P1A.3/P1A.4, P1C.1/P1C.3, P1D.1/P1D.2, P2.1/P2.2/P2.4, P3A.2/P3B.3/P3D.1/P3D.2, P4C.1/P4C.2, P4D.1, P5.4                                                                         | Own the design seam, public compatibility, Effect channels, stale generation rules, and type architecture; produce the narrowed follow-up packets for smaller models |

All models stop and update the packet instead of guessing when they discover:

- a public call/import would break;
- a second semantic owner would remain or be introduced;
- an Effect error/requirement/Scope/finalizer would be erased;
- a key, actor, binding, request, or generation identity is ambiguous;
- a negative type fixture fails for an unrelated reason;
- a packet needs production files outside its named family;
- baseline or affected verification was already red for a different reason.

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

### Type-theme execution details

| Theme | Owning packets                          | Required proof                                                                                                                                                  |
| ----- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TI-1  | P1A.4, P2.4, P3A.2, P3B.3, P3D.1, P4B.2 | One inferred call, one explicit-generic compatibility call, one wrong upstream input, and one wrong downstream result per constructor family                    |
| TI-2  | Every family packet plus P4A–D          | Reuse the authored definition through ref/binding/runtime/adapter without restating generics; assert exact output and reject wrong owner                        |
| TI-3  | P2.4, P3B.3, P3D.1                      | `never` removes only the typed lane; defect/interruption/finalizer evidence remains in runtime tests and public types                                           |
| TI-4  | P2.4, P3A.2, P3B.3                      | Add one unsafe-narrower regression before replacing each bivariant helper; do not perform a global variance rewrite                                             |
| TI-5  | P1D.1 and each async family             | Assert exact success/error/requirements before and after the owner seam; verify Layer provision leaves only unprovided requirements                             |
| TI-6  | P0.3 and P1C.1                          | Assert exact literal module keys/IDs, definition lookup, fixture names, reorder stability, dependency errors, and app Layer requirements                        |
| TI-7  | P1D.2 and P4A.1                         | Source and packed testing calls infer exact machine/app families and reject wrong-app fixtures, events, states, refs, and outcomes                              |
| TI-8  | P4B.1/P4B.2                             | Packed React 18 and 19 consumers infer actor send/snapshot, resource values, view outputs, and provider/runtime compatibility                                   |
| TI-9  | P0.1 baseline and P5.3 closure          | Record check/emit time, instantiations, declaration bytes, package bytes, and TS7056/private-name failures with the same commands and environment               |
| TI-10 | Every type packet                       | Each negative fixture has one expected diagnostic or a local `@ts-expect-error` whose disappearance fails the suite; run against source and packed declarations |

Shared type files are `packages/flow-state/src/core/api/**`, public entry points,
`packages/flow-state/src/public-api-types.test.ts`, and
`packages/flow-state/src/public-typing-architecture.test.ts`. A family packet
may edit only its relevant API file and directly affected consumers. Any change
to `FlowMachine`, `FlowAppDefinition`, or common conditional helpers requires a
strong-model review plus `T`, `P`, `E`, and `V` before phase closure.

---

## Phase 0 — Baseline, contract truth, compact proof, and owner map

Purpose: establish current truth without changing production behavior. Phase 0
may add tests and correct documentation, but it may not alter runtime output.

Phase 0 owns three durable artifacts under `architecture/correctness/`:

- `BASELINE.md`: commit, environment, public export matrix, commands, timings,
  declaration/package sizes, and exact baseline failures;
- `OWNER_MAP.md`: every semantic operation, current owner, duplicate callers,
  intended owner, and reuse/merge/delete classification;
- `PACKET_RECEIPTS.md`: append-only packet receipts using the template above.

### `P0.1` Public, behavioral, packed, and performance baseline

- [ ] Inventory root, React, testing, inspection, and server exports/types.
- [ ] Run Launch Workspace through public built entry points and record exact
      baseline successes/failures.
- [ ] Record focused package tests, types, declarations, builds, and docs gates.
- [ ] Record check time, declaration emit time, type instantiations, declaration
      size, package output size, and Launch Workspace declaration behavior.
- [ ] Close BUG-21 so `pnpm lint` from an installed checkout prepares or resolves
      the declarations it needs and reports real source problems, not missing-package cascades.

Details:

- Read/record: package manifests, `packages/flow-state/src/{index,react-entry,testing,server,inspect}.ts`,
  generated `dist/*.d.mts`, build-output baseline, and Launch Workspace public imports.
- Run from a clean tree: `T`; timed `P`; `pnpm --filter flow-state
check:typescript-mode-proofs`; `E`; `D`; `pnpm check`; and the existing
  build-output check. Record Node/pnpm/TypeScript versions and whether a command
  changes generated files.
- Reproduce `pnpm lint` before relying on it. Prefer source-aware workspace
  resolution for lint; if the tool fundamentally requires declarations, make
  the script prepare the exact package output itself and prevent stale `dist`
  from satisfying the gate. Do not hide genuine diagnostics or commit build output.
- Add a packed-consumer matrix for root, React 18, React 19, testing, server, and
  inspect entry points. Record the exact fixture directories/commands in
  `BASELINE.md`; do not claim a packed proof from source aliases.
- Tests/measurements: successful import for every export path; intentional
  failure for private/deep imports; declaration emit contains no private names;
  repeat timing at least three times and report median plus range.
- Allowed changes: Phase 0 artifacts, baseline/type test fixtures, and narrowly
  scoped workspace lint/build-resolution configuration needed for BUG-21 only.

### `P0.2` Launch Workspace executable-truth reconciliation

- [ ] Map every Launch Workspace API row to declaration, owner, tests, and
      executable/partial/contract-only status.
- [ ] Reconcile BUG-13, BUG-14, and BUG-15 without claiming runtime behavior not
      proved by current tests.

Details:

- Files: `examples/launch-workspace/API_INVENTORY.md`, `README.md`,
  `PHASE_0_TEST_CHECKLIST.md`, package status/reference docs, and related
  architecture tests. `launchWorkspaceSupport.ts` is read-only in Phase 0;
  BUG-14 is fixed with canonical receipts in P2.3.
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

Details:

- Files: `public-api-types.test.ts`, `public-typing-architecture.test.ts`, focused
  callback tests, Launch Workspace typing architecture tests, and dedicated
  source/packed fixtures discovered in P0.1.
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

- Files: `API_CONTRACT.md`, `TYPE_INFERENCE_CONTRACT.md`, `TASK.md` only for the
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

### Phase 0 closure

- [ ] No production behavior changed.
- [ ] Every public surface has a user job, owner, status, and proof strength.
- [ ] `BASELINE.md`, `OWNER_MAP.md`, and the Phase 0 receipt are complete.
- [ ] BUG-13/15 documentation drift is fixed; BUG-14 is assigned to P2.3.
- [ ] BUG-21 is fixed and `pnpm lint` no longer depends on manually prepared/stale output.
- [ ] BUG-17 contract conflict is reconciled compatibility-first.
- [ ] P1A.1 and P1A.2 name exact production owners, files, tests, and commands.
- [ ] Low-value deferred work is not on the active critical path.

---

## Phase 1A — Pure resource definitions and keyed identity

Purpose: establish the identity used by every later semantic owner before
consolidating stores, actors, previews, adapters, or hydration.

### `P1A.1` Pure ref construction and executable definition ownership

- [ ] Make `resource.ref(params...)` the canonical instance reference without
      capturing lookup/tag/placeholder Effects or values.
- [ ] Ensure metadata/ownership compilation never executes client callbacks.
- [ ] Keep explicit ref construction deterministic: it may derive the key once,
      but lookup/tags/placeholder execute only inside the ResourceStore owner.
- [ ] Preserve exact Params/Value/Error/Requirements through the definition/ref seam.

Files: `descriptors/resource.ts`, resource runtime detail types,
`core/api/resource-transaction-types.ts`, resource callback helpers,
`core/store/resource-store-lookups.ts`, app ownership compilation, and focused
tests. Remove `__runtime` only after all store callers read the registered
definition through one validated internal registry.

Tests:

1. Creating a definition and compiling an app calls no callback.
2. Calling `ref` calls only `key`, exactly once; it does not call lookup, tags,
   or placeholder and does not construct a lookup Effect eagerly.
3. `ensure`/`refresh` execute lookup at the owner with exact typed failure and
   requirements; interruption runs finalization once.
4. Unknown/unregistered refs fail explicitly rather than carrying hidden work.
5. Inspection/graph/coverage over the definition calls no client callback.

Commands: `F(packages/flow-state/src/resource-callbacks.test.ts
packages/flow-state/src/resource-store.test.ts
packages/flow-state/src/app-inventory.test.ts
packages/flow-state/src/behavior-contract.test.ts)`, `T`, `P`, `E`, `C`.

### `P1A.2` Collision-free canonical key encoder

- [ ] Prove zero-, one-, and many-parameter instances cannot collide.
- [ ] Replace raw `JSON.stringify` identity with the binding-decision encoder.
- [ ] Preserve accepted runtime-local key inputs and reject non-durable keys only
      when encoding/dehydrating a durable payload.
- [ ] Keep descriptor ID plus an opaque bounded instance ID in diagnostics/receipts;
      never expose the raw canonical encoding or caller key values by default.

Files: `core/api/keys.ts`, `core/store/invalidation.ts`, a narrowly named
canonical-key module if separation helps, diagnostics, public key types only if
necessary, and focused store/type tests.

Required matrix:

- `[]`, `[undefined]`, `[null]`, `[""]`, `[0]`, `[-0]`, `[NaN]`, infinities,
  bigint, booleans, strings, nested arrays, and sorted plain objects;
- values that raw JSON collapses; different descriptors with the same key;
- same descriptor/key produces equal identity; object insertion order does not
  change structural identity; cycles and unsupported durable values diagnose;
- mutating a caller-owned nested object after ref creation cannot move the ref to
  another store identity or corrupt lookup/subscription maps;
- no user-controlled delimiter can make two encoded tuples equal.

Commands: `F(packages/flow-state/src/resource-store.test.ts
packages/flow-state/src/public-api-types.test.ts
packages/flow-state/src/diagnostics.test.ts)`, `T`, `P`, `C`.

### `P1A.3` Migrate every active resource projection to instance identity

- [ ] Prove two instances of one descriptor never share status/value/subscribers.
- [ ] Migrate actor owned-query keys and snapshots, transaction target discovery,
      testing cache, React sources, inspection, and hydration to canonical identity.
- [ ] Define and test unambiguous descriptor-ID compatibility projection behavior.
- [ ] Remove descriptor-ID fallback only after every active caller migrates.
- [ ] Prove seed/lookup/patch/invalidate/hydrate notification ordering and batching.

Files: `core/store/**`, `core/orchestrator/orchestrator-resources.ts`, transaction
ref discovery, snapshot types/constructors, `testing/flow-test.ts`, React
resource source, inspection projections, runtime hydration, Launch Workspace
resource readers, and focused callers identified by P0.5. This packet may be
split by adapter, but runtime and store must become canonical first.

Tests:

1. Two project refs retain independent values/status/subscriptions/in-flight work.
2. Patch/invalidate one ref leaves the sibling untouched; tag invalidation may
   intentionally reach both and emits two instance-specific facts.
3. A descriptor-ID compatibility read works with one instance and diagnoses or
   yields no result with two; it never chooses by insertion order.
4. Restore/hydrate round-trips both refs without collision.
5. Actor, test, and React observers all report the same canonical snapshots.

Commands: `F(packages/flow-state/src/resource-store.test.ts
packages/flow-state/src/runtime-invokes.test.ts
packages/flow-state/src/react/use-resource.test.ts
packages/flow-state/src/flow-test-rehydration.test.ts
examples/launch-workspace/src/launchWorkspace.test.ts)`, `T`, `P`, `E`, `C`.

### `P1A.4` Resource lifecycle, tags, typing, and local hydration boundary

- [ ] Prove lookup success, typed failure, defect, interruption, retry, and finalization.
- [ ] Define empty/loading/placeholder/ready/refreshing/stale/failed/paused/invalidated facts.
- [ ] Prove freshness and active invalidation behavior without conflicting flags.
- [ ] Prove `ensure`, `observe`, and `refresh` distinct ownership/lifetime behavior.
- [ ] Prove tag reuse, cross-resource invalidation, and incompatible same-ID rejection
      without running tag callbacks during compilation.
- [ ] Make declared Params contextualize key/lookup/tags/placeholder/ref.
- [ ] Infer lookup success/failure/requirements only after Params is fixed.
- [ ] Add focused wrong-params/ref/value/failure/schema fixtures.
- [ ] Decode unknown hydrated values at the boundary and reject partial mutation.

Files: resource public types, store lookup/snapshot/invalidation/hydration modules,
tag/app validation registry, resource callback/type tests, and runtime resource
tests. Do not add mandatory Schema for local values.

Tests: full lookup Exit/Cause/finalizer matrix; freshness transition table under
deterministic time; ensure/observe/refresh ownership differential; compatible
same-ID tag reuse and incompatible metadata rejection; unknown hydration
decode-then-commit; present `undefined` value/error versus absent state; input-first
source and packed fixtures. Close BUG-26 without forbidding `undefined` from a
resource's declared Value/Error type.

Commands: `F(packages/flow-state/src/resource-callbacks.test.ts
packages/flow-state/src/resource-store.test.ts
packages/flow-state/src/runtime-lifecycle.test.ts
packages/flow-state/src/public-api-types.test.ts)`, `T`, `P`, `E`, `C`.

### Phase 1A closure

- [ ] BUG-1/2/3/20/26 are closed with focused regressions.
- [ ] Keyed identity/collision/ordering matrix passes.
- [ ] Resource Launch Workspace rows are executable or honestly deferred.
- [ ] No duplicate cache or ID-only ambiguity remains on active production paths.
- [ ] No definition/app/inspection path executes client resource callbacks.

---

## Phase 1B–D — Canonical runtime ownership and Effect lifecycle

Purpose: establish owners every later family uses. This is consolidation, not a rewrite.

### `P1B.1` Canonical ResourceStore owner and host handles

- [ ] Select/reuse `core/runtime/services/resource-store.ts` plus
      `core/store/resource-store-memory.ts` as the production owner unless P0.5
      proves a more complete existing owner.
- [ ] Route seed/read/lookup/subscribe/patch/invalidate/hydrate through that owner.
- [ ] Prove host convenience methods cannot create a second cache or notification model.
- [ ] Preserve typed refs and Effect failures through runtime handles.

Files: `core/runtime/services/resource-store.ts`, `core/store/**`,
`runtime/contract-runtime.ts`, runtime public handle types, presets, and store/runtime tests.

Tests: runtime handle and direct service observe the same record and subscriber;
duplicate seed policy is explicit; in-flight lookup dedupes by instance; disposal
interrupts lookups/subscriptions; memory/test presets change services/clock, not semantics.

Commands: `F(packages/flow-state/src/resource-store.test.ts
packages/flow-state/src/runtime.test.ts
packages/flow-state/src/runtime-lifecycle.test.ts)`, `T`, `P`, `E`, `C`.

### `P1B.2` Patch, notification, and batch semantics

- [ ] Fix absent/current patch semantics without coercing arbitrary values through
      broad records at the public/semantic seam.
- [ ] Define one notification scheduler and deterministic batch order.
- [ ] Prove seed/lookup/patch/invalidate/hydrate publish at most one coherent
      post-operation snapshot per logical batch.

Files: `core/store/resource-patch.ts`, state update/subscription/snapshot modules,
notification scheduler service, ResourceStore API, and tests.

Tests: absent patch behavior; primitive/array/object values; patch callback typed
failure/defect if applicable; nested/reentrant notification; subscribe/unsubscribe
during publish; multi-ref batch order; no partial observer view.

Commands: `F(packages/flow-state/src/resource-store.test.ts
packages/flow-state/src/core/store/selection-source.test.ts)`, `T`, `P`, `C`.

### `P1C.1` Canonical actor owner and explicit ownership domains

- [ ] Select/reuse the production start/get/send/stop/snapshot/restore path.
- [ ] Implement the three binding-decision ownership modes without exposing a
      mandatory public AppGraph or bind step.
- [ ] Reject wrong-app, unregistered, duplicate, and ambiguously owned descriptors
      in app-bound mode; preserve explicit focused compatibility mode.
- [ ] Ensure metadata/ownership compilation never executes client callbacks.

Files: `core/orchestrator/app-ownership.ts`, registry/system/lifecycle modules,
descriptor validation/app files, runtime construction, public runtime types, and
ownership/runtime tests.

Tests: registered start succeeds; wrong app/unregistered/duplicate ID rejects
before work starts; focused `createRuntime().createActor(machine)` succeeds with
synthetic ownership; child inherits parent domain; same actor ID in different
runtimes does not alias; app/module reorder preserves identity; keep-alive reuse
requires the same registered definition/ownership domain rather than only the
same machine ID; unsupported policy fails in source types and at a foreign runtime boundary.

Commands: `F(packages/flow-state/src/orchestrator-system.test.ts
packages/flow-state/src/app-inventory.test.ts
packages/flow-state/src/runtime.test.ts
packages/flow-state/src/diagnostics.test.ts)`, `T`, `P`, `E`, `C`.

### `P1C.2` One actor read implementation (`CV-2`)

- [ ] Complete the detailed CV-2 packet above.
- [ ] Prefer `runtime.orchestrators.start` in production/example callers while
      retaining `runtime.createActor` as a compatibility route to that owner.

The request-boot path and remaining example tests migrate only after the caller
inventory proves behavior equivalence. No adapter may implement its own actor shell.

### `P1C.3` Actor stop, disposal, keep-alive, and registry finalization

- [ ] Prove stop/dispose interrupts owned work and finalizes exactly once.
- [ ] Define long-lived/keep-alive actor ownership, registry eviction, explicit
      disposal, and runtime shutdown behavior.
- [ ] Close BUG-19 with deterministic ordering evidence.

Required ordering: mark stopping; reject new sends/work; interrupt owned fibers;
await finalizers; publish one terminal/stopped fact if the contract exposes it;
evict the exact registry generation; make repeated stop/dispose idempotent.
Runtime shutdown waits for all actor finalizers before disposing shared services.
A stale actor finalizer cannot evict a newer actor reusing the same ID.

Files: actor lifecycle, registry, orchestrator system, ready/delayed work owners,
runtime disposal, child stop integration, and lifecycle tests.

Tests: explicit stop, actor dispose, runtime dispose, concurrent repeated dispose,
keep-alive reuse, ID replacement, failing/defective finalizer, parent/child
shutdown, and exactly-once finalizer/registry eviction.

Commands: `F(packages/flow-state/src/runtime-lifecycle.test.ts
packages/flow-state/src/orchestrator-system.test.ts
packages/flow-state/src/flush.test.ts)`, `T`, `P`, `E`, `C`.

### `P1D.1` Effect, Layer, Scope, and Promise-host preservation

- [ ] Preserve exact operation `Effect<A, E, R>` at public and semantic seams.
- [ ] Preserve Layer acquisition errors and remaining requirements after provision.
- [ ] Give runtime, actor, subscription, stream, timer, child, and request work an
      explicit Scope owner.
- [ ] Keep Promise conversion at explicit hosts; remove duplicate Promise semantics.
- [ ] Isolate exact variadic Layer typing as a reviewed type packet rather than
      coupling it to runtime behavior edits. `[SMART]`

Files: runtime API/types, Layer composition/installers, host run methods, Scope
acquisition/release sites, request runtime, and exact type/lifecycle tests.

Tests: acquisition typed failure; missing requirement remains required; provided
requirement disappears; success/failure/defect/interruption remain distinct;
scope finalizer once; Promise rejection only at explicit host conversion.

Commands: `F(packages/flow-state/src/runtime.test.ts
packages/flow-state/src/runtime-lifecycle.test.ts
packages/flow-state/src/public-api-types.test.ts)`, `T`, `P`, `E`, `C`.

### `P1D.2` Minimal live/test delegation to production owners

- [ ] Provide TestClock, deterministic services, controlled streams, flush/settle,
      and pending-work controls to production owners.
- [ ] Route `flowTest` machine dispatch and owned transaction/stream/timer/child
      work through the production runtime; retain builders/assertions as adapters.
- [ ] Prove live/test presets share success, failure, defect, interruption, and cleanup.
- [ ] Reject false idle while production-owned work remains pending.
- [ ] Remove or reduce testing cache/interpreter/bookkeeping modules to
      translation/control helpers; record every retained responsibility.

Files: `testing/flow-test.ts`, `flow-test-*-ownership.ts`, transaction bookkeeping,
pending/progress controls, test fixtures/presets, production runtime owners, and
flow-test differential tests. This is a strong-model packet and may be split by
owned-work family, but machine dispatch must delegate first.

Tests: the same scenario through direct runtime and `flowTest` yields equivalent
snapshot/receipts/issues; TestClock controls production timers; controlled stream
feeds production stream owner; pending work prevents false settle; typed failure,
defect, interruption, and finalizer evidence agree; wrong-app focused ownership diagnoses.

Commands: `F(packages/flow-state/src/flow-test-settle.test.ts
packages/flow-state/src/flow-test-streams.test.ts
packages/flow-state/src/flow-test-timers.test.ts
packages/flow-state/src/flow-test-child-helpers.test.ts
packages/flow-state/src/transactions.test.ts
packages/flow-state/src/runtime-invokes.test.ts)`, `T`, `P`, `E`, `V`, `C`.

### Phase 1 closure

- [ ] One ResourceStore and one actor/orchestration semantic owner remain.
- [ ] Duplicate lifecycle registries/interpreters are removed or translation-only.
- [ ] The testing execution path delegates to production owners; Phase 4A owns
      public testing ergonomics/types, not engine replacement.
- [ ] No hidden empty app is treated as proof of explicit ownership.
- [ ] Differential and finalization tests pass.
- [ ] BUG-8/19/22/25 are closed without weakening public actor types or diagnostics.
- [ ] P1A–D receipts list every deleted and intentionally retained duplicate path.

---

## Phase 2 — Transaction inference, concurrency, and atomicity

### `P2.1` Overlap, generation ownership, and stale completion

- [ ] Test same-key and different-key overlapping requests.
- [ ] Test every currently advertised in-memory policy, including allow,
      reject-while-running, cancel-previous, and serialized queued execution.
- [ ] Prove cancelled/replaced requests cannot route or commit late results.
- [ ] Reject stale-generation success, receipts, invalidation, routes, preview
      commit/rollback, issue mutation, and queue ownership.
- [ ] Do not pretend cancellation undoes an already completed external side effect.
- [ ] Keep durable offline queue/replay deferred.

Files: `core/orchestrator/orchestrator-transaction-{start,concurrency,completion,recovery,ownership,types}.ts`,
registry generation helpers, transaction snapshots/receipts, and transaction tests.

Binding behavior:

- `allow`: every request may execute externally, but the latest-started
  same-transaction generation is the publication owner. An older attempt that
  completes first or last cannot overwrite the summary, route, issue, ordinary
  completion receipt, or invalidation owned by the newer attempt. It may retire
  its own preview layer without disturbing the newer visible overlay. A future
  per-attempt result handle would be a separate API decision.
- `reject-while-running`: reject before preview/commit work starts and emit only
  the documented rejection fact.
- `cancel-previous`: interrupt the previous fiber and mark its generation stale
  before starting the replacement; late finalization may clean itself only.
- `serialize`: queued requests have stable queue identity; completing an old
  generation cannot dequeue/start work belonging to a newer owner.

Tests: same/different concurrency keys for all policies; old success after new
success; old failure/defect/interruption after replacement; external commit that
ignores interruption; exact receipt/route/invalidation/preview/queue assertions.

Commands: `F(packages/flow-state/src/transactions.test.ts
packages/flow-state/src/transaction-outcome.test.ts
packages/flow-state/src/runtime-invokes.test.ts)`, `T`, `P`, `E`, `C`.

### `P2.2` Atomic preview, rollback, invalidation, and restore

- [ ] Replace preview overlay descriptor-ID maps with canonical resource-instance identity.
- [ ] Make preview application/rollback atomic with resource state and subscribers.
- [ ] Prove typed failure, defect, interruption, and cancellation restore preview correctly.
- [ ] Invalidate only on documented successful outcomes.
- [ ] Preserve compatible pending facts across restore; reject wrong transaction/app/version.
- [ ] Close BUG-4 and BUG-7 without creating a second optimistic-state owner.

Files: `orchestrator-transaction-preview.ts`, transaction invalidation/recovery,
ResourceStore batch primitive from P1B.2, transaction/resource snapshots,
hydration glue, and transaction/rehydration tests.

Atomic means all preview patches validate first, then one store batch publishes;
failure leaves the store and actor snapshot unchanged. Rollback recomputes the
remaining overlay stack from one root per canonical ref and publishes once.
Commit removes only the completing generation's layers. No timestamp mutation or
descriptor-ID search may stand in for identity.

Tests: multi-ref apply succeeds in one publication; second patch failure leaves
both untouched; overlapping previews on one ref commit/rollback in both orders;
two refs of one descriptor remain separate; typed failure/defect/interruption;
restore wrong owner/version is atomic.

Commands: `F(packages/flow-state/src/transactions.test.ts
packages/flow-state/src/resource-store.test.ts
packages/flow-state/src/runtime-rehydration.test.ts)`, `T`, `P`, `E`, `C`.

### `P2.3` Canonical transaction/resource receipts (`CV-4`)

- [ ] Complete the CV-4 packet and fix BUG-14.
- [ ] Ensure receipt construction is production-owner-owned and adapters only project it.
- [ ] Add one receipt vocabulary registry/test so new primary runtime receipt
      types cannot reintroduce `cache:*`, `query:*`, or `mutation:*` names.

Files/tests/commands are the CV-4 detail above. Also update Launch Workspace
inventory/status only after runtime tests prove the behavior.

### `P2.4` Input-first transaction declarations

- [ ] Make `params` selector return or explicit Params the sole upstream Params contract.
- [ ] Contextualize commit/preview/invalidation/concurrency/routes from fixed Params.
- [ ] Infer success/failure/requirements from commit only after Params is fixed.
- [ ] Replace bivariant callback types one family at a time, each with a concrete
      unsoundness regression and compatibility fixture. `[SMART]`
- [ ] Preserve `flow.transaction`, `submit`, `flow.run`, preview, invalidates,
      routes, and existing concurrency call shapes.
- [ ] Complete `CV-4`: emit only canonical `transaction:*` write receipts and
      `resource:*` resource receipts on new runtime paths.

Files: `core/api/resource-transaction-types.ts`, transaction callback/outcome
types, `core/transactions/**`, orchestrator transaction consumers, public type
tests, and packed fixtures. Keep behavior changes in P2.1–P2.3; this packet is a
reviewed type-family refactor.

Tests: inferred Params fixes every downstream callback; explicit Params remains
compatible; wrong/narrower Params callback fails locally; commit infers exact
success/error/requirements; `never` typed failure removes only the typed failure
route; refs/events in preview/invalidation/routes remain exact; source and packed
declarations agree.

Commands: `F(packages/flow-state/src/transaction-callbacks.test.ts
packages/flow-state/src/transaction-outcome-callbacks.test.ts
packages/flow-state/src/public-api-types.test.ts
packages/flow-state/src/transaction-architecture.test.ts)`, `T`, `P`, `E`, `V`, `C`.

Non-goal: no global removal of every `BivariantCallback`; change only the
transaction family after its unsafe-narrower regression is red.

### Phase 2 closure

- [ ] Input-first positive/negative transaction fixtures pass from packed declarations.
- [ ] Overlap/concurrency/late-completion matrix passes.
- [ ] No duplicate transaction runner or optimistic state owner remains.
- [ ] BUG-4/6/7/14/18T are closed.
- [ ] Durable offline queue/replay remains explicitly deferred and unadvertised.

---

## Phase 3A — Machine transitions and callback correctness

### `P3A.1` One transition planner/application owner

- [ ] Preserve existing machine object/generic forms and literal state/event types.
- [ ] Prove rejected events cannot update state or start work.
- [ ] Add differential tests proving `flow.can(snapshot, event)` agrees with actual dispatch.
- [ ] Prove target/update/entry/exit/re-entry/terminal behavior and stable binding generations.
- [ ] Remove any remaining test-only transition evaluator after P1D.2 delegation.

Files: `core/machines/**`, canonical orchestrator dispatch, `flow.can` owner,
machine snapshot/receipt types, and machine/runtime differential tests.

Tests: unmatched event; false guard; ordered multiple guards; target-only;
update-only; target plus update/actions; exit/entry/re-entry; terminal state;
rejected event starts no submit/invoke/timer/child; `flow.can` agrees before and
after restore; binding generation stays stable unless ownership actually restarts.

Commands: `F(packages/flow-state/src/machine.test.ts
packages/flow-state/src/machine-callbacks.test.ts
packages/flow-state/src/runtime-invokes.test.ts
packages/flow-state/src/flow-transition-inspection.test.ts)`, `T`, `P`, `E`, `C`.

### `P3A.2` Exact machine callback-family typing

- [ ] Give initialization, guard, update, target, params, and route callbacks only
      their exact documented inputs.
- [ ] Remove universal/bivariant callback bags family-by-family with focused proof.
- [ ] Keep explicit annotations where recursive contextual inference genuinely needs them.

Files: `core/api/machine-core-types.ts`, machine callback/config helpers, directly
affected transaction/stream/child owner inputs, callback tests, public/packed
type fixtures. Do not combine this packet with runtime transition edits.

Tests: exact Context/Event/State per callback; a handler for a narrower event is
rejected where it may receive the union; impossible event/state target rejects;
updater result is `Partial<Context>` without permitting unknown keys; recursive
machine annotation exception remains local and nameable; explicit generic form
and object inference remain compatible.

Commands: `F(packages/flow-state/src/machine-callbacks.test.ts
packages/flow-state/src/public-api-types.test.ts
packages/flow-state/src/public-typing-architecture.test.ts)`, `T`, `P`, `E`, `V`, `C`.

### Phase 3A closure

- [ ] Callback variance and invalid state/event fixtures pass.
- [ ] `flow.can` and dispatch agree across guards and states.
- [ ] Machine core has no test-only transition evaluator.
- [ ] BUG-18M is closed without widening callbacks to `unknown`.

---

## Phase 3B — Stream ownership, pressure, and interruption

### `P3B.1` Production stream ownership and generation lifecycle

- [ ] Prove value, typed failure, defect, end, interruption, unsubscribe, and finalization.
- [ ] Prove producer interruption and consumer/actor disposal terminate ownership once.
- [ ] Prove restart, detach/reattach, keep-alive, and stale-generation emission rejection.
- [ ] Keep Effect Stream primary; controlled AsyncIterable bridges remain test compatibility only.

Files: `core/orchestrator/orchestrator-stream-ownership.ts`, stream/timer
coordinator and inspection facts, `core/streams/**`, snapshot/receipt/issue types,
testing controlled bridge after P1D.2, and runtime stream tests.

Tests: Stream value/failure/defect/end; actor/state exit interruption; explicit
stop/runtime dispose; unsubscribe/finalizer exactly once; restart generation;
late value/end/failure from old generation ignored; route detach/reattach does
not duplicate producer ownership; keep-alive actor semantics.

Commands: `F(packages/flow-state/src/runtime-streams.test.ts
packages/flow-state/src/stream-route.test.ts
examples/launch-workspace/src/runtime-stream-generations.test.ts)`, `T`, `P`, `E`, `C`.

### `P3B.2` Bounded deterministic pressure policies

- [ ] Test every advertised pressure policy with bounded deterministic producers:
      queue limit, coalescing/latest behavior, dropping, and backpressure as applicable.

Before implementation, inventory the actual exported policy union. Do not add a
policy because it appears in old docs. For each advertised policy define buffer
capacity, ordering, overflow fact/counter, producer blocking/interruption, and
drain behavior. Tests use bounded producers and deterministic controls—no sleeps,
unbounded loops, or timing assumptions.

Files: stream pressure config/runtime owner, controlled stream fixture only as a
producer control, pending-work facts, snapshots/receipts, and stream tests.

Tests: capacity boundary and one-overflow case per policy; FIFO where promised;
latest/coalesce exact retained value; drop-new/drop-old fact if advertised;
backpressured producer resumes and interrupts; settle remains non-idle while a
blocked producer or queued value exists.

Commands: `F(packages/flow-state/src/runtime-streams.test.ts
packages/flow-state/src/flow-test-streams.test.ts
packages/flow-state/src/flow-test-settle.test.ts)`, `T`, `P`, `C`.

### `P3B.3` Input-first stream and requirement typing

- [ ] Make stream Params contextualize subscribe/routes before inferring value/failure/requirements.
- [ ] Preserve acquisition requirements separately from Stream requirements. `[SMART]`
- [ ] Remove stream-family bivariant callback unsoundness only after a failing regression exists.

Files: `core/api/machine-view-stream-types.ts`, stream callback helpers, runtime
consumer seams, public/packed type fixtures.

Tests: explicit/inferred Params; wrong narrower callback; exact value/error;
subscribe acquisition Effect requirements versus returned Stream requirements;
possible/impossible value and typed-failure routes; exact event type; no untyped
intermediate invoke descriptor reaches consumers.

Commands: `F(packages/flow-state/src/stream-callbacks.test.ts
packages/flow-state/src/public-api-types.test.ts
packages/flow-state/src/public-typing-architecture.test.ts)`, `T`, `P`, `E`, `V`, `C`.

### Phase 3B closure

- [ ] Pressure and cleanup matrix passes without real sleeps or unbounded drains.
- [ ] No parallel test stream engine remains.
- [ ] BUG-18S is closed and exact acquisition/Stream requirements survive packing.

---

## Phase 3C — Timer correctness

### `P3C.1` One-shot timer lifecycle, restore, and typing

- [ ] Preserve `flow.after` string durations and current call shape.
- [ ] Prove TestClock start, cancel, re-entry, actor stop, runtime disposal, and exactly-once fire.
- [ ] Prove restore resumes valid remaining delay and rejects stale generation firing.
- [ ] Prove timer target/event typing against the owning machine.
- [ ] Keep recurring/general schedules deferred.

Files: `core/orchestrator/orchestrator-after-timer-ownership.ts`, delayed-work
owner, timer snapshots/receipts, duration parsing, test controls after P1D.2,
timer public types, and timer/runtime/rehydration tests.

Semantics: one timer generation belongs to one actor state/binding; state exit,
re-entry, actor stop, or runtime dispose interrupts it; restore validates owner,
generation, target, and remaining nonnegative delay before scheduling; a stale
callback can finalize itself but cannot route or publish.

Tests: string duration parse and invalid duration; TestClock just-before/at
deadline; state exit cancellation; re-entry creates one new generation; repeated
flush does not double-fire; stop/dispose finalizer once; restore remaining delay;
old callback after restore/replacement ignored; invalid target/event fails in
source and packed types.

Commands: `F(packages/flow-state/src/flow-test-timers.test.ts
packages/flow-state/src/runtime-invokes.test.ts
packages/flow-state/src/runtime-rehydration.test.ts
packages/flow-state/src/public-api-types.test.ts)`, `T`, `P`, `E`, `C`.

### Phase 3C closure

- [ ] Timer lifecycle/restore matrix passes under virtual time.
- [ ] No real-time or test-only timer semantics remain.
- [ ] No recurring/general schedule API or completion claim was added.

---

## Phase 3D — Child supervision and restore

### `P3D.1` Current child contract and exact expressible typing

- [ ] Preserve the current `flow.child({ id, machine, supervision? })` call shape
      and exact child machine/context/event/state/supervision types.
- [ ] Keep child input/output/failure/routes deferred according to P0.4 unless a
      separate additive contract is explicitly approved.
- [ ] Allow a focused child callback annotation where TypeScript cannot infer soundly;
      do not widen to `unknown` or add a new API. `[SMART review]`

Files: `core/api/machine-invoke-types.ts`, child definition helper, directly
affected machine invoke types, public/packed type fixtures, and child type tests.

Tests: exact child machine retained through definition/invoke/snapshot helpers;
wrong machine/parent ownership and invalid supervision reject; existing generic
and inferred calls remain valid; no phantom input/output/failure types are
claimed; selected keyed child invoke array shape remains stable.

Commands: `F(packages/flow-state/src/public-api-types.test.ts
packages/flow-state/src/flow-test-child-helpers.test.ts)`, `T`, `P`, `E`, `C`.

### `P3D.2` Child supervision, generation, restore, and finalization

- [ ] Prove parent start/stop/exit, child success/failure/defect/interruption, and finalization.
- [ ] Prove restart budget/policy, failed-child retry, replacement, and failure bubbling.
- [ ] Prove restore generation, stale completion rejection, actor identity, and parent ownership.
- [ ] Prove a child finalizer runs once across stop/restart/restore/disposal.

Files: `core/orchestrator/orchestrator-children.ts`, child lifecycle/inspection
facts, actor registry/lifecycle integration, child snapshots/issues/receipts,
restore serialization, and child/runtime/rehydration tests. Testing helpers must
control/observe this production owner after P1D.2.

Semantics: child identity includes parent actor, binding, child descriptor/key,
and generation; only the active generation can publish; restart budget is
consumed deterministically; retry targets failed children only; parent stop
awaits child finalizers; restore preserves generation so pre-restore completions
remain stale.

Tests: parent state exit/stop/runtime dispose; child normal terminal behavior if
currently expressible, typed issue/failure, defect and interruption; both
supervision policies; restart budget exhausted; retry failed only; replacement;
failure bubbling; restore then late old completion; duplicate actor ID; finalizer
once across every path.

Commands: `F(packages/flow-state/src/flow-test-child-helpers.test.ts
packages/flow-state/src/runtime-invokes.test.ts
packages/flow-state/src/runtime-rehydration.test.ts
examples/launch-workspace/src/launchWorkspace.test.ts)`, `T`, `P`, `E`, `V`, `C`.

### Phase 3D closure

- [ ] Child supervision/restore/stale-generation matrix passes.
- [ ] No static/test-only child definition or lifecycle engine disagrees with production.
- [ ] Serialized and live snapshots preserve the same generation facts.
- [ ] The phase claims only types/lanes expressible by the reconciled P0.4 contract.

---

## Phase 4A — Testing and story compatibility over production owners

P1D.2 already moved execution to production owners. This phase must not defer or
repeat that engine migration; it owns public testing ergonomics, inference,
fixtures, Scenario/Story vocabulary, and diagnostics.

### `P4A.1` Testing builders, fixtures, inference, and bounded progress

- [ ] Make `flowTest`, `flowTest.app`, `test`, stories, and controlled fixtures use
      one production-runtime implementation.
- [ ] Preserve `flowTest(machine)` compatibility while replacing the hidden empty
      app with an explicit compatibility ownership design. `[SMART]`
- [ ] Infer machine/events/states/resources/transactions/streams/children/views/
      fixtures/scenarios from registered definitions.
- [ ] Reject wrong-app descriptors/snapshots, invalid fixtures, impossible
      expectations, false idle, and unbounded settle.
- [ ] Keep pure path/model analysis explicitly static and separate from execution claims.

Files: testing public API/types, builders/read surfaces/runtime boot/fixtures,
pending and progress controls, pure model/path helpers, testing exports, and the
full focused flow-test suite. Production semantic changes go back to the owning
P1–P3 family instead of being patched into testing.

Tests: focused and app harness infer exact definitions; wrong-app ref/machine/
snapshot/fixture diagnoses; impossible state/event/outcome expectation fails at
compile time where expressible; settle has a step/time bound and reports pending
owner facts; static path analysis is labeled declared/static and cannot satisfy
runtime evidence assertions; source and packed testing consumers agree.

Commands: `F(packages/flow-state/src/flow-test-developer-loop.test.ts
packages/flow-state/src/flow-test-settle.test.ts
packages/flow-state/src/flow-test-rehydration.test.ts
packages/flow-state/src/flow-test-model.test.ts
packages/flow-state/src/public-api-types.test.ts)`, `T`, `P`, `E`, `C`.

### `P4A.2` Story/Scenario execution vocabulary (`CV-3`)

- [ ] Complete `CV-3`: authored/CLI Story vocabulary and executed Scenario
      result types share one production execution and evidence result.

Use the CV-3 files, tests, commands, and non-goals above. CLI projection details
remain P4D.2; this packet establishes the shared result object and aliases.

### Phase 4A closure

- [ ] Focused and app scenarios agree with direct production runtime results.
- [ ] No test/story semantic interpreter or duplicate pending-work model remains.
- [ ] `flowTest(machine)` has explicit focused ownership and no hidden empty app.
- [ ] Static/model evidence cannot be mistaken for mounted/runtime evidence.

---

## Phase 4B — React and view adapters

### `P4B.1` Thin provider, actor/resource/view sources, and React lifecycle

- [ ] Preserve `FlowProvider`, `use`, `useResource`, `useView`, and optional `flow.view`.
- [ ] Make provider/hooks consume production runtime handles and one publication owner.
- [ ] Prove exact actor/resource/view inference from packed React declarations.
- [ ] Test Strict Mode double mount/unmount, repeated render, actor swap, provider
      mismatch, selector equality, batching, and exactly-once cleanup.
- [ ] Test SSR/client hydration and React 18/19 packed consumers.
- [ ] Suspend only from canonical active initial-work facts; hooks never start hidden work.

Files: `react/context.ts`, provider, subscribed/selection sources, actor/resource/
view hooks, `react-entry.ts`, production runtime handle types, React tests, and
Launch Workspace shell tests. React may adapt `useSyncExternalStore`; it may not
own a cache, actor registry, resource lookup, view evaluator, or pending-work model.

Binding lifecycle:

- Render creates at most an inert local shell for `useSyncExternalStore`; no
  lookup/actor work or user context factory starts during render. The shell must
  not call `machine.getInitialSnapshot()` independently of canonical actor start.
- Layout/effect acquisition uses `runtime.orchestrators.start`, not an independent
  `createActor` path. Compatibility `createActor` already delegates there.
- Mount-owned actors are disposed on final unmount. A canonical keep-alive actor
  is registry-owned; a hook holds/releases a lease and does not destroy another
  consumer's lease. Strict Mode probe cleanup must not leak or double-finalize.
- Machine/runtime/id/snapshot changes release the previous lease before the new
  actor becomes authoritative. Replacement must be coordinated with asynchronous
  disposal so the same ID cannot fail spuriously or delete the replacement. A
  stale source cannot publish into the new hook.
- Resource and view hooks subscribe to canonical instance/source identity and
  never start hidden work. Suspension reflects a production-owned active initial
  load and throws the owner's stable promise/effect bridge only.

Tests: Strict Mode double mount/unmount; repeated render with one context factory
execution per real actor start; two consumers sharing a keep-alive ID; actor swap
with delayed disposal and same ID; different same-ID machine rejection;
provider/runtime mismatch; canonical keyed resource swap; selector equality;
batched publication; SSR server snapshot and client hydrate; initial
loading/error/no-work suspension; cleanup/finalizer once.

Commands: `F(packages/flow-state/src/react/provider.test.ts
packages/flow-state/src/react/use-actor.test.ts
packages/flow-state/src/react/use-resource.test.ts
packages/flow-state/src/react/use-view.test.ts
packages/flow-state/src/react/use-source.test.ts
examples/launch-workspace/src/launchWorkspaceShell.test.tsx)`, `T`, `P`, `E`, `C`.

### `P4B.2` Preferred `useActor` alias and packed inference (`CV-1`)

- [ ] Complete `CV-1`: export/prefer `useActor` while retaining `use` as the same
      implementation and typed compatibility alias.

Use the CV-1 detail above. Run the packed React 18 and React 19 commands captured
by P0.1 in addition to the focused hook tests.

### Phase 4B closure

- [ ] React differential/lifecycle/inference matrix passes.
- [ ] No React-owned runtime/cache/lease/interpreter remains.
- [ ] BUG-11/12/23/24 are closed and both actor-hook names are one function/type path.
- [ ] Packed React 18 and 19 consumers pass against built package entry points.

---

## Phase 4C — Server and durable boundaries

### `P4C.1` Versioned unknown decode and atomic runtime hydration

- [ ] Decode boot/hydration/snapshot input from `unknown` at the entry boundary.
- [ ] Reject wrong version/app/machine/actor/resource/schema atomically with no partial mutation.
- [ ] Preserve generations, pending ownership, and only serializable facts.
- [ ] Preserve valid v1 payload acceptance and default v1 emission; prepare a
      separately approved format packet if complete durable ownership needs new fields.

Files: server/runtime public boot types, `runtime/contract-runtime.ts`, store and
actor snapshot decoders, resource schema boundary, diagnostics, testing boot
adapter, and runtime/server/rehydration tests.

Binding format behavior:

- Public host input is `unknown`; typed helpers may accept the inferred payload
  type but must call the same decoder.
- v1 decodes structurally into legacy/unclaimed snapshots and remains
  usable through compatibility restore. It cannot be treated as proof of app
  ownership; app-bound start validates the supplied snapshot against the target
  registered machine before use.
- If v1 cannot represent a required durable fact such as app, machine, actor, or
  resource-instance generation, record that limitation and request approval for
  v2. Do not smuggle unversioned fields into v1 or change default emission inside
  a decoder-fix packet.
- Decode all entries into temporary immutable values, reject duplicate IDs and
  any invalid entry, then perform one ResourceStore/actor-restore commit. No
  resource or actor is visible after a failed decode.
- Include only serializable production facts. Runtime handles, callbacks,
  Effects, fibers, subscribers, closures, and defects as live objects are never encoded.
- A resource value actually encoded/decoded must have the declared boundary
  validation needed for that value. Local-only resources remain Schema-free and
  are omitted or explicitly rejected when requested for durable encoding; never
  silently trust `unknown` as their Value.

Tests: non-object/null/truncated payload; wrong/unsupported version; valid v1;
v1 round-trip; duplicate actor/ref; wrong app/machine/actor at attachment; invalid resource
value; one bad entry among valid entries causes zero mutation; generation and
pending ownership round-trip; nonserializable fact excluded; decode diagnostics
are typed/stable.

Commands: `F(packages/flow-state/src/runtime.test.ts
packages/flow-state/src/runtime-rehydration.test.ts
packages/flow-state/src/flow-test-rehydration.test.ts
packages/flow-state/src/diagnostics.test.ts)`, `T`, `P`, `E`, `C`.

### `P4C.2` Request-scoped runtime ownership and finalization

- [ ] Prove concurrent request isolation and request-scoped finalization.
- [ ] Prove no mutable module-global request runtime/cache.
- [ ] Keep Schema optional locally and required only for values actually encoded/decoded.

Files: `runtime/request-runtime.ts`, server entry point, app Layer acquisition,
request boot example, and request/runtime tests.

Tests: two concurrent requests with same actor/resource IDs remain isolated;
request success/failure/defect/interruption disposes actors/resources once;
request A payload cannot observe B; no module-global mutable runtime/store;
request boot uses canonical orchestrator start; Layer acquisition failure cleans
partially acquired services.

Commands: `F(packages/flow-state/src/runtime.test.ts
packages/flow-state/src/runtime-lifecycle.test.ts
examples/launch-workspace/src/launchWorkspace.test.ts)`, `T`, `P`, `E`, `C`.

### Phase 4C closure

- [ ] Unknown JSON/version/ownership/atomicity/request-concurrency matrix passes.
- [ ] No server wrapper owns alternate runtime semantics.
- [ ] BUG-9 is closed; failed hydration leaves every owner byte-for-byte unchanged.
- [ ] Valid v1 compatibility and attachment-time ownership proof are both tested.
- [ ] No unapproved payload version or unversioned durable field was introduced.

---

## Phase 4D — Inspection and CLI projections

### `P4D.1` Pure metadata and production-evidence inspection

- [ ] Derive graph, trace, receipts, issues, coverage, and pending work from
      production facts and pure ownership metadata.
- [ ] Keep declared/static/snapshot/runtime/mounted evidence levels distinct.
- [ ] Remove duplicate gateways, walkers, evidence builders, and formatters after parity.
- [ ] Close BUG-10: never execute callbacks with fabricated values to infer metadata.

Files: `core/inspection/behavior-coverage.ts`, behavior contract/diff/graph
builders, transition inspection, receipt/trace/issue/pending projections,
ownership metadata registry, inspect entry point, and inspection tests.

Behavior: declared route metadata may report a literal event when statically
declared; callback-computed routes are `dynamic/unknown` without runtime evidence;
an observed production receipt/event may upgrade runtime evidence but never
rewrite declared metadata. Static graph/model reachability is not mounted or
executed proof. One ownership metadata source groups app/module/descriptor facts.

Tests: route/guard/selector/lookup/tag callbacks throw if invoked and inspection
still succeeds; literal route is declared; callback route is dynamic; runtime
event becomes runtime evidence; declared/snapshot/runtime/mounted levels never
collapse; duplicate graph walker projections match before deletion.

Commands: `F(packages/flow-state/src/behavior-contract.test.ts
packages/flow-state/src/behavior-coverage-render.test.ts
packages/flow-state/src/flow-graph.test.ts
packages/flow-state/src/runtime-inspection.test.ts
packages/flow-state/src/inspection-semantic-summary.test.ts)`, `T`, `P`, `E`, `C`.

### `P4D.2` One evidence object for programmatic and CLI output

- [ ] Make CLI exit nonzero and typed for invalid input, missing proof, unsupported
      behavior, domain failure, defect, interruption, and internal failure.
- [ ] Make concise human and JSON output project the same evidence object.
- [ ] Keep full universal trace correlation deferred.

Files: inspection gateway/result types, CLI command handlers, human/JSON
renderers, Story/Scenario adapter, CLI entry, and focused CLI/inspection tests.

Define one outcome/status mapping table in code and docs. Both renderers receive
the same immutable evidence value; they may format differently but must agree on
status, reason, evidence level, counts, and exit code. Unsupported/missing proof
is not success. Internal defects preserve diagnostic cause without presenting it
as a typed domain failure. Complete CV-3/4 projections here.

Tests: golden semantic assertions—not whitespace-only snapshots—for every exit
lane; human/JSON parity; invalid file/input; unsupported behavior; missing
runtime proof; domain failure; defect; interruption; internal failure; concise
output remains bounded; programmatic Scenario result equals CLI story execution result.

Commands: `F(packages/flow-state/src/cli-test/behavior-cli.test.ts
packages/flow-state/src/cli-test/flow-state-cli.test.ts
packages/flow-state/src/inspection-format.test.ts
packages/flow-state/src/behavior-render.test.ts
packages/flow-state/src/flow-story-run.test.ts)`, `T`, `P`, `D`, `C`.

### Phase 4D closure

- [ ] Programmatic inspection and CLI outputs agree on facts and failure status.
- [ ] No formatter/gateway invents causality, ownership, or proof strength.
- [ ] Inspection of definitions executes zero client callbacks.
- [ ] Duplicate walkers/evidence builders/formatters are deleted only with parity receipts.

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

Packet `P5.1` details:

- Start from P0.5 `OWNER_MAP.md`; rerun every recorded caller command at current
  HEAD and append results before deleting anything.
- Candidate files are deleted only when their semantic responsibility is owned
  elsewhere and direct, dynamic, CLI, generated, public, example, and test
  callers are zero. Public aliases are not deletion candidates.
- Delete in family-sized packets: testing interpreters; shadow registries/cache/
  snapshots; duplicate evidence walkers/builders; obsolete formatters; then dead
  helpers/exports. Each deletion packet names the replacement owner and parity tests.
- Tests: public export snapshot unchanged except separately approved additive
  names; CLI still resolves; generated package contains required entry points;
  examples use no private path; no duplicate-owner architecture check regresses.
- Commands per deletion: focused replacement-owner tests, `T`, `P`, `E`, `D` if
  docs/CLI affected, `C`; finish 5A with `V`.

### 5B. Packed clients and layouts

- [ ] Build/test Launch Workspace against built/packed entry points, never private source.
- [ ] Emit exported Launch Workspace declarations without private leaks or TS7056 expansion.
- [ ] Verify small, normal, and large client layouts have identical API and semantics.
- [ ] Test root, React, testing, inspection, and server entry points from an
      external packed consumer.

Packet `P5.2` details:

- Reuse the exact P0.1 fixture matrix and commands so before/after measurements
  are comparable. Install the produced tarball or packed directory; workspace
  source aliases do not count.
- Small layout: one machine/resource and root import. Normal layout: Launch
  Workspace-shaped modules/runtime/testing/React. Large layout: repeated modules
  and definitions large enough to expose TS7056, deep instantiation, or emit cost.
- Tests: identical public calls and runtime semantics across layouts; exact
  declarations for every entry point; React 18/19; ESM import; CLI binary if
  exported; no source/private import; declarations have no unnameable/private
  type; emitted app declarations retain exact maps without annotation restatement.
- Commands: `P`, every packed-fixture command from P0.1, `E`, package hygiene and
  public type tests, `C`.

### 5C. Documentation and truth

- [ ] Update API inventory so every row is executable, partial, deferred,
      deprecated, or removed truthfully.
- [ ] Provide one minimal example for every surviving public function.
- [ ] Show Schema-free local authoring first and boundary Schema second.
- [ ] Document Effect results/errors/requirements/interruption and client unwrapping.
- [ ] Remove rejected API-design vocabulary from active docs and fixtures.

Packet `P5.3` details:

- Sources of truth: current public declarations, production owner tests, packet
  receipts, and Launch Workspace runtime proofs. Documentation does not promote
  a partial descriptor to executable behavior.
- Update `API_INVENTORY.md`, package reference/status/recipes/getting-started,
  server/testing/inspection docs, and Launch Workspace README/checklist together.
- For each surviving public function include one smallest valid example using
  public package imports, its owner/lifetime, Effect success/error/requirements,
  interruption/finalization where relevant, and whether Schema is needed.
- Show local Schema-free authoring first; show Schema only at encoded/foreign
  boundaries. Mark every deferral explicitly.
- Tests: all cited paths/exports exist; examples typecheck against built package;
  status terms are exclusive; no primary query/mutation/cache vocabulary;
  Story/Scenario and `useActor`/`use` migration wording matches CV decisions.
- Commands: documentation/status/recipe/getting-started architecture tests, `T`,
  `P`, `E`, `D`, `C`.

### 5D. Performance and final review

- [ ] Compare runtime overhead, public exports, duplicate owner count, dead-code
      count, check/emit time, instantiations, declarations, and package size to baseline.
- [ ] Prefer library-side type simplification; reject unmeasured annotation churn.
- [ ] Run format/lint, types, declarations, focused/full tests, builds, packed
      clients, docs, and relevant performance gates.
- [ ] Run independent whole-diff API/correctness/performance review, fix blockers,
      rerun verification, and record explicit deferrals.

Packet `P5.4` details:

- Compare against P0.1 using the same machine, environment, warm-up, repetitions,
  and commands. Report median/range, absolute and percentage change for runtime
  overhead, check/emit time, instantiations, declaration bytes, bundle raw/gzip,
  public exports, duplicate-owner count, and dead-code count.
- Treat a package-size baseline failure as a real review item: simplify/delete
  first; update the stored baseline only when growth is intentional, measured,
  explained, and approved in the receipt.
- Independent review checks public compatibility, identity, ownership, Effect
  channels, stale generations, atomicity, finalization, adapter thinness,
  type erasure, diagnostics, and documentation truth across the complete diff.
- Fix all correctness/type-safety blockers before closure. Performance tradeoffs
  or explicit feature deferrals may remain only with measured evidence and a
  named future owner; “follow up later” is not a receipt.
- Commands in order: focused tests for review fixes; `pnpm fmt && pnpm lint`;
  `pnpm check`; `pnpm test`; `pnpm build`; packed matrix; `pnpm docs:build`;
  `pnpm verify`; then confirm `git status --short` contains only intended files.

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

Final evidence required beside these checkboxes:

- One receipt per packet with no unnamed open correctness blocker.
- A final owner map showing one owner for resource, actor, transition,
  transaction, stream, timer, child, pending work, and evidence facts.
- The complete BUG-1–BUG-26 ledger, including BUG-18T/18M/18S, marked closed or
  explicitly deferred only where this plan already authorizes deferral;
  correctness bugs may not be deferred.
- Before/after public exports, declarations, performance, bundle size, duplicate
  owner count, and dead-code count.
- Exact final command outputs/exit status and the commit(s) containing each phase.
