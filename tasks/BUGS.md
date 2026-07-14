# Defect and regression inventory

[Back to the plan tracker](../TASK.md)

This is a navigation inventory of `BUG-*` defects found during the plan. A row
may already be fixed; live code and deterministic regressions, not this table,
determine current status. The owning criterion names where a regression belongs.

## Defects and their owning criteria

Do not move a defect across phase lanes for convenience. A same-owner correction
may close several rows when affected tests prove the shared invariant.

| ID      | Defect or forbidden behavior                                                                                                                                   | Criterion ID |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| BUG-1   | `resource.ref` executes lookup/tags/placeholder eagerly and stores hidden executable state; key execution is not isolated to explicit identity construction    | P1A.1        |
| BUG-2   | Store identity uses raw `JSON.stringify`, permitting collisions/failures                                                                                       | P1A.2        |
| BUG-3   | Actor resource snapshots and owned-query keys collapse instances to descriptor ID                                                                              | P1A.3b       |
| BUG-4   | Transaction preview overlays and rollback bookkeeping collapse refs by descriptor ID                                                                           | P2.2a        |
| BUG-5   | `flowTest` owns an ID-only cache and independent machine/async interpreters                                                                                    | P4A.1        |
| BUG-6   | Transaction completion uses inconsistent gates for summary snapshot, preview, receipt, invalidation, route, and queue publication                              | P2.1a        |
| BUG-7   | Preview patches notify/mutate incrementally instead of one atomic batch                                                                                        | P2.2a        |
| BUG-8   | App-bound and focused runtimes do not express distinct ownership authorization                                                                                 | P1C.1        |
| BUG-9   | Hydration trusts a typed payload, validates little, and can mutate before full validation                                                                      | P4C.1b       |
| BUG-10  | Behavior coverage invokes client route callbacks with Proxy probes                                                                                             | P4D.1a       |
| BUG-11  | React actor hook starts through legacy `createActor`, not the canonical orchestrator                                                                           | P4B.1b       |
| BUG-12  | `useActor` cutover hook is absent                                                                                                                              | P4B.2        |
| BUG-13  | Launch Workspace docs/inventory disagree about executable resource behavior                                                                                    | P0.2         |
| BUG-14  | Readiness view counts obsolete `cache:invalidate` receipts                                                                                                     | P4A.3        |
| BUG-15  | API inventory links a missing `reference-next/lib-api.md`                                                                                                      | P0.2         |
| BUG-16  | Launch Workspace app/graph annotations can widen types while source-text tests remain green                                                                    | P0.3         |
| BUG-17  | Child contract promises input/output/failure propagation absent from current public types                                                                      | P0.4         |
| BUG-18T | Transaction bivariant callback helpers permit unsafe narrower callbacks                                                                                        | P2.4         |
| BUG-18M | Machine bivariant callback helpers permit unsafe narrower callbacks                                                                                            | P3A.2        |
| BUG-18S | Stream bivariant callback helpers permit unsafe narrower callbacks                                                                                             | P3B.3        |
| BUG-19  | Runtime disposal/finalizer/registry eviction ordering is not proved exactly once                                                                               | P1C.3a       |
| BUG-20  | Descriptor-ID fallback reads have no defined ambiguity behavior                                                                                                | P1B.1        |
| BUG-21  | Root `pnpm lint` resolves examples/type fixtures through missing or stale built declarations and emits cascading false errors                                  | P0.1b        |
| BUG-22  | Keep-alive actor reuse checks only actor ID plus machine ID and can cast a different same-ID machine definition to the requested type                          | P1C.1        |
| BUG-23  | React's inert actor shell calls `machine.getInitialSnapshot()` during render, executing the context factory outside canonical actor start                      | P4B.1b       |
| BUG-24  | React actor swap cleanup fires asynchronous disposal without coordinating replacement start, allowing same-ID registry races                                   | P4B.1b       |
| BUG-25  | `FlowActorStartOptions.policy` accepts any string, so unsupported policy values silently act like another policy                                               | P1C.1        |
| BUG-26  | Resource snapshot/hydration code uses `undefined` as absence and cannot faithfully represent a declared `Value` or error containing `undefined`                | P1A.4a       |
| BUG-27  | App identity depends on module order and delimiter concatenation                                                                                               | P1A.0        |
| BUG-28  | App/module registries permit reserved/prototype keys and inventory fields can overwrite descriptor fields                                                      | P1A.0        |
| BUG-29  | Frozen definition wrappers retain caller-mutable configuration containers                                                                                      | P1A.0        |
| BUG-30  | Structurally forged or foreign resource refs can cross runtime seams through optional/private shape checks                                                     | P1A.3b       |
| BUG-31  | Open string-indexed receipts cannot prove vocabulary, lane-specific fields, exhaustiveness, or serializability                                                 | P2.3         |
| BUG-32  | Guard defects are swallowed and treated as a false guard                                                                                                       | P3A.1        |
| BUG-33  | Trace/inspection append and observer callbacks can run before the semantic snapshot commits                                                                    | P1D.3a       |
| BUG-34  | Trace, actor-receipt, and default inspection histories are unbounded                                                                                           | P1D.3b       |
| BUG-35  | Resource selection sources remain cached after the final subscriber leaves                                                                                     | P1B.2        |
| BUG-36  | Stream queue/coalescing policies can be unbounded or silently discard overflow                                                                                 | P3B.2        |
| BUG-37  | Portable timer restore persists absolute `dueAt` without a cross-host clock-skew rule                                                                          | P3C.1        |
| BUG-38  | Broad Launch Workspace app annotation erases the exact app type under proof                                                                                    | P1A.0        |
| BUG-39  | Launch Workspace derives product/debug state from unbounded receipt history                                                                                    | P4A.3        |
| BUG-40  | `flow.can` and dispatch can disagree when guards observe synthetic versus runtime time                                                                         | P3A.1        |
| BUG-41R | Optional resource snapshot value/error fields make absent/present and contradictory lifecycle states representable                                             | P1A.4a       |
| BUG-41T | Optional transaction snapshot result/error fields make contradictory completion states representable                                                           | P2.1a        |
| BUG-41S | Optional stream snapshot value/error fields make contradictory terminal states representable                                                                   | P3B.1        |
| BUG-42  | `runtime.resources.get` can manufacture an empty snapshot where the public contract says an unknown ref returns `null`                                         | P1B.1        |
| BUG-43  | A throwing selector/equality function can advance the cached selection snapshot before comparison succeeds, corrupting later reads                             | P1B.2        |
| BUG-44  | Actor construction activates restored/state-owned work before the new incarnation is installed as registry authority                                           | P1C.4a       |
| BUG-45  | Launch Workspace creates and hydrates a runtime during React render, leaking work on aborted render/Strict Mode                                                | P4B.1c       |
| BUG-46  | Invalidation refresh uses detached fibers that can outlive ResourceStore/runtime ownership                                                                     | P1A.4a       |
| BUG-47  | A throwing runtime host cleanup skips later registered cleanups instead of attempting and aggregating every finalizer                                          | P1D.1c       |
| BUG-48  | Ready-work uses `Array.shift()` and drains synchronously without a turn budget, causing superlinear behavior and starvation                                    | P1C.4b       |
| BUG-49  | Boot dehydration has no cross-owner snapshot barrier, so actor/resource facts may not represent one coherent logical cut                                       | P4C.1c       |
| BUG-50T | A transaction can complete synchronously before its running/pending state is committed                                                                         | P2.1a        |
| BUG-50S | A stream can emit/complete synchronously before its running state is committed                                                                                 | P3B.1        |
| BUG-51  | Canonical key inspection invokes observable Proxy meta-object traps instead of rejecting or tokenizing without executing client code                           | P1A.2        |
| BUG-52  | Durable resource/app identity orders strings with locale-sensitive `localeCompare`, so canonical IDs can vary across hosts                                     | P1A.2        |
| BUG-53  | Child snapshots and lifecycle receipts omit incarnation generation, so retry/restore evidence cannot distinguish stale and current children                    | P3D.2        |
| BUG-54  | The Phase 3 differential model imports production transition/async helpers and repeats production identity assumptions, so parity is not an independent oracle | P3A.1        |
| BUG-55  | Pending child disposal/retry boundaries are outside actor flush accounting, leaving observable idle ghost children and delayed replacement publication         | P3D.2        |
| BUG-56  | `machine-invoke-types.ts` restates an erased stream definition instead of carrying the canonical exact stream family                                           | P3B.3        |
| BUG-57  | Public architecture tests assert stale source-text implementation details, leaving the committed broad verification baseline red                               | P1D.2        |

## 2026-07-14 cross-phase audit

The Phase 1 and Phase 2 review dispositions do not pass against the live tree.
The findings below are confirmed open at `44e707b`; existing IDs are reopened
rather than duplicated, and the owning phase checkboxes link back here.

### BUG-30: foreign resource authority

**Resolved 2026-07-14.** App-bound ResourceStore layers now authorize refs
against the exact resource definitions registered by their app. A genuine ref
from a foreign definition is rejected before lookup, subscription, mutation, or
hydration callbacks run, even when an owned definition has the same public ID
and canonical key.

### BUG-42: unknown resource reads are not null

**Resolved 2026-07-14.** `ResourceStore.get` now returns `null` for an
unauthorized ref before it can manufacture an empty record. The same
runtime-owned authorization predicate gates seed, hydrate, restore, patch,
subscribe, invalidate-by-ref, ensure, refresh, and lookup execution.

### BUG-4: parameterized preview instances alias

**Blocker.** Preview staging keys overlays, snapshots, and touched refs by
[`previewPatch.ref.id`](../packages/flow-state/src/core/orchestrator/orchestrator-transaction-preview.ts#L61),
and rollback resolves the first known ref with that descriptor ID. The green
"multi-ref" fixtures use two different resource definitions, so they do not
cover two parameterized refs of one definition and cannot close P2.2a.

### BUG-47: one host cleanup skips later cleanups

**Resolved 2026-07-14.** Runtime host cleanups now run through one named Effect
that captures every cleanup `Exit`, attempts later resource and inspection
unsubscribes after an earlier defect, and combines all cleanup Causes with owner
shutdown and Layer Scope failures. Repeated disposal still joins the same result
without rerunning a cleanup.

### BUG-18T / BUG-18M / BUG-18S: public callbacks remain bivariant

**Blocker.** Exported transaction, machine, and stream configs still use a
[`BivariantCallback`](../packages/flow-state/src/core/api/resource-transaction-types.ts#L6),
including transaction `commit`, transition guards/actions, and stream params and
subscription. The transaction negative tests define a private
[`ExactSelectorBackedTransactionConfig`](../packages/flow-state/src/public-api-types.test.ts#L43)
instead of testing the exported config, so they prove a test-only replacement.
P2.4, P3A.2, and P3B.3 remain open.

### BUG-36: coalescing has unbounded cardinality

**Blocker.** Queue pressure has a limit, but exported `coalesce-latest` has
[no capacity](../packages/flow-state/src/core/api/machine-view-stream-types.ts#L86).
The owner retains one pending value per distinct key in an unbounded
[`latestByKey` map](../packages/flow-state/src/core/orchestrator/orchestrator-stream-ownership.ts#L254),
so a burst of unique keys grows until mailbox delivery catches up. Current tests
replace one repeated key and do not prove the required bound.

### BUG-41S: emitted undefined is erased

**High.** Every running/terminal stream snapshot makes `value` optional, and
[`createTerminalStreamSnapshot`](../packages/flow-state/src/core/streams/stream-snapshot.ts#L9)
omits it when the last emitted value is `undefined`. A stream whose `Value`
includes `undefined` therefore loses present-versus-absent information at
completion, despite the claimed discriminated terminal snapshot proof.

### BUG-51: canonical keys execute Proxy traps

**Resolved 2026-07-14.** Key snapshotting and canonical encoding now share one
own-descriptor inspection path, hostile reflection fails as `FLOW-STORE-003`, and
resource callback wrapping preserves that library diagnostic without reading
property values or invoking getters, `toJSON`, coercion, or equality. The linked
contracts now state the standard JavaScript limit honestly: transparent Proxies
cannot be identified without observable metadata reflection, so Proxies are
unsupported and their metadata traps may observe validation.

### BUG-52: canonical ordering is locale-sensitive

**Resolved 2026-07-14.** Resource record keys and app module IDs now share an
ascending raw UTF-16 code-unit comparator, independent of locale, ICU data, and
Unicode normalization. A table-driven regression pins locale-sensitive,
surrogate-pair, and canonically equivalent non-ASCII strings across both identity
owners.

### BUG-53: child generations are not observable or restorable

**High.** Registry records have a private incarnation counter, but
[`FlowChildSnapshot`](../packages/flow-state/src/core/api/snapshot-types.ts#L182)
and [`childLifecycleReceiptFacts`](../packages/flow-state/src/core/orchestrator/child-lifecycle-inspection-facts.ts#L15)
carry no generation. Retry reuses the same actor ID, so snapshots, receipts,
restore validation, and inspection cannot prove which child incarnation owns a
completion. P3D.2's generation and stale-completion requirement remains open.

### BUG-54: the differential model is self-referential

**High.** The 2,016-line
[`flow-paths.ts`](../packages/flow-state/src/core/machines/flow-paths.ts#L1)
imports production transition planning, outcome, callback, preview, and receipt
helpers, executes client Effects with `Effect.runSyncExit`, and keys preview
rollback by descriptor ID just like BUG-4. Runtime/model equality can therefore
confirm the same defect twice; P3A.1 needs a small independent state machine or
direct laws at the production owner boundary.

### BUG-55: child boundaries escape flush accounting

**Blocker.** Child stop/retry now places an `idle` snapshot in the parent while
[`runDisposeEffect(...).then(...)`](../packages/flow-state/src/core/orchestrator/orchestrator-children.ts#L295)
settles outside the actor mailbox. [`FlowActor.flush`](../packages/flow-state/src/core/orchestrator/orchestrator-actor-lifecycle.ts#L143)
counts ready work and currently owned child actors, but neither includes pending
child-boundary promises. `runtime.test.ts`, `runtime-inspection.test.ts`, and
`flow-test-child-helpers.test.ts` therefore fail deterministically: stopped
children remain visible and retry publication is missing after flush. P3D.2 must
make boundary finalizers owned pending work and publish only a settled state.

### BUG-56: carried stream typing was replaced by an erased copy

**Blocker.** [`machine-invoke-types.ts`](../packages/flow-state/src/core/api/machine-invoke-types.ts#L15)
declares a second `AnyFlowStreamDefinition` with `Record<string, unknown>`,
`never`, and `unknown` callback lanes instead of importing the canonical stream
definition. This both fails `public-typing-architecture.test.ts` and violates the
no-restated-family rule in P3B.3; fix the variance/cycle at the canonical type
boundary rather than maintaining a structurally copied stream API.

### BUG-57: the committed verification baseline is red

**Blocker.** `public-typing-architecture.test.ts` still requires a local
`const summarizeIssue` even though the read surface now imports the production
summary owner. That stale source-text assertion fails independently, while the
other architecture failure correctly exposes BUG-56. Update the contract test to
assert ownership and public behavior instead of an obsolete local declaration;
do not make the suite green by deleting the useful canonical-type assertion.

## Regressions that must not be introduced

These are review blockers when applicable to changed code, even if one focused
test is green.

### Public API and type safety

- Do not behaviorally fork legacy aliases. Migrate/remove `use`, `snapshot()`,
  and other legacy names only in their owning cutover criteria, and
  keep supported public package entry points exact.
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
- Do not preserve descriptor-ID fallback reads by storing duplicate mutable
  snapshots as a second source of truth or choosing one keyed instance by order.
- Do not let two runtimes/apps alias records, actors, generations, subscriptions,
  queues, or runtime-local key tokens merely because public IDs match.

### Ownership, Effect channels, and cleanup

- Do not copy production decisions into React/testing/server/inspection/CLI to
  make an adapter test pass; route the adapter to the production owner.
- Do not run lookup, commit, subscribe, route, guard, update, selector, tag,
  placeholder, or service callbacks during definition normalization, app
  compilation, inspection probing, or inert React render. React may invoke only
  the documented pure context initializer to materialize an inert snapshot and
  must reuse that snapshot at canonical start.
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
  parity identify the surviving owner; delete public aliases only in their owning
  cutover criterion.
