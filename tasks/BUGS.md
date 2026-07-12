# Defect and regression inventory

[Back to the plan tracker](../TASK.md)

This is a navigation inventory of `BUG-*` defects found during the plan. A row
may already be fixed; live code and deterministic regressions, not this table,
determine current status. The owning slice names where a regression belongs.

## Defects and their owning slices

Do not move a defect across phase lanes for convenience. A same-owner correction
may close several rows when affected tests prove the shared invariant.

| ID      | Defect or forbidden behavior                                                                                                                                | Owning slice |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| BUG-1   | `resource.ref` executes lookup/tags/placeholder eagerly and stores hidden executable state; key execution is not isolated to explicit identity construction | P1A.1        |
| BUG-2   | Store identity uses raw `JSON.stringify`, permitting collisions/failures                                                                                    | P1A.2        |
| BUG-3   | Actor resource snapshots and owned-query keys collapse instances to descriptor ID                                                                           | P1A.3b       |
| BUG-4   | Transaction preview overlays and rollback bookkeeping collapse refs by descriptor ID                                                                        | P2.2a        |
| BUG-5   | `flowTest` owns an ID-only cache and independent machine/async interpreters                                                                                 | P4A.1        |
| BUG-6   | Transaction completion uses inconsistent gates for summary snapshot, preview, receipt, invalidation, route, and queue publication                           | P2.1a        |
| BUG-7   | Preview patches notify/mutate incrementally instead of one atomic batch                                                                                     | P2.2a        |
| BUG-8   | App-bound and focused runtimes do not express distinct ownership authorization                                                                              | P1C.1        |
| BUG-9   | Hydration trusts a typed payload, validates little, and can mutate before full validation                                                                   | P4C.1b       |
| BUG-10  | Behavior coverage invokes client route callbacks with Proxy probes                                                                                          | P4D.1a       |
| BUG-11  | React actor hook starts through compatibility `createActor`, not the canonical orchestrator                                                                 | P4B.1b       |
| BUG-12  | `useActor` preferred alias is absent                                                                                                                        | P4B.2        |
| BUG-13  | Launch Workspace docs/inventory disagree about executable resource behavior                                                                                 | P0.2         |
| BUG-14  | Readiness view counts obsolete `cache:invalidate` receipts                                                                                                  | P4A.3        |
| BUG-15  | API inventory links a missing `reference-next/lib-api.md`                                                                                                   | P0.2         |
| BUG-16  | Launch Workspace app/graph annotations can widen types while source-text tests remain green                                                                 | P0.3         |
| BUG-17  | Child contract promises input/output/failure propagation absent from current public types                                                                   | P0.4         |
| BUG-18T | Transaction bivariant callback helpers permit unsafe narrower callbacks                                                                                     | P2.4         |
| BUG-18M | Machine bivariant callback helpers permit unsafe narrower callbacks                                                                                         | P3A.2        |
| BUG-18S | Stream bivariant callback helpers permit unsafe narrower callbacks                                                                                          | P3B.3        |
| BUG-19  | Runtime disposal/finalizer/registry eviction ordering is not proved exactly once                                                                            | P1C.3a       |
| BUG-20  | Descriptor-ID compatibility reads have no defined ambiguity behavior                                                                                        | P1B.1        |
| BUG-21  | Root `pnpm lint` resolves examples/type fixtures through missing or stale built declarations and emits cascading false errors                               | P0.1b        |
| BUG-22  | Keep-alive actor reuse checks only actor ID plus machine ID and can cast a different same-ID machine definition to the requested type                       | P1C.1        |
| BUG-23  | React's inert actor shell calls `machine.getInitialSnapshot()` during render, executing the context factory outside canonical actor start                   | P4B.1b       |
| BUG-24  | React actor swap cleanup fires asynchronous disposal without coordinating replacement start, allowing same-ID registry races                                | P4B.1b       |
| BUG-25  | `FlowActorStartOptions.policy` accepts any string, so unsupported policy values silently act like another policy                                            | P1C.1        |
| BUG-26  | Resource snapshot/hydration code uses `undefined` as absence and cannot faithfully represent a declared `Value` or error containing `undefined`             | P1A.4a       |
| BUG-27  | App identity depends on module order and delimiter concatenation                                                                                            | P1A.0        |
| BUG-28  | App/module registries permit reserved/prototype keys and inventory fields can overwrite descriptor fields                                                   | P1A.0        |
| BUG-29  | Frozen definition wrappers retain caller-mutable configuration containers                                                                                   | P1A.0        |
| BUG-30  | Structurally forged or foreign resource refs can cross runtime seams through optional/private shape checks                                                  | P1A.3b       |
| BUG-31  | Open string-indexed receipts cannot prove vocabulary, lane-specific fields, exhaustiveness, or serializability                                              | P2.3         |
| BUG-32  | Guard defects are swallowed and treated as a false guard                                                                                                    | P3A.1        |
| BUG-33  | Trace/inspection append and observer callbacks can run before the semantic snapshot commits                                                                 | P1D.3a       |
| BUG-34  | Trace, actor-receipt, and default inspection histories are unbounded                                                                                        | P1D.3b       |
| BUG-35  | Resource selection sources remain cached after the final subscriber leaves                                                                                  | P1B.2        |
| BUG-36  | Stream queue/coalescing policies can be unbounded or silently discard overflow                                                                              | P3B.2        |
| BUG-37  | Portable timer restore persists absolute `dueAt` without a cross-host clock-skew rule                                                                       | P3C.1        |
| BUG-38  | Broad Launch Workspace app annotation erases the exact app type under proof                                                                                 | P1A.0        |
| BUG-39  | Launch Workspace derives product/debug state from unbounded receipt history                                                                                 | P4A.3        |
| BUG-40  | `flow.can` and dispatch can disagree when guards observe synthetic versus runtime time                                                                      | P3A.1        |
| BUG-41R | Optional resource snapshot value/error fields make absent/present and contradictory lifecycle states representable                                          | P1A.4a       |
| BUG-41T | Optional transaction snapshot result/error fields make contradictory completion states representable                                                        | P2.1a        |
| BUG-41S | Optional stream snapshot value/error fields make contradictory terminal states representable                                                                | P3B.1        |
| BUG-42  | `runtime.resources.get` can manufacture an empty snapshot where the public contract says an unknown ref returns `null`                                      | P1B.1        |
| BUG-43  | A throwing selector/equality function can advance the cached selection snapshot before comparison succeeds, corrupting later reads                          | P1B.2        |
| BUG-44  | Actor construction activates restored/state-owned work before the new incarnation is installed as registry authority                                        | P1C.4a       |
| BUG-45  | Launch Workspace creates and hydrates a runtime during React render, leaking work on aborted render/Strict Mode                                             | P4B.1c       |
| BUG-46  | Invalidation refresh uses detached fibers that can outlive ResourceStore/runtime ownership                                                                  | P1A.4a       |
| BUG-47  | A cleanup or actor-stop failure can skip later cleanup and prevent ManagedRuntime/Layer Scope disposal                                                      | P1D.1c       |
| BUG-48  | Ready-work uses `Array.shift()` and drains synchronously without a turn budget, causing superlinear behavior and starvation                                 | P1C.4b       |
| BUG-49  | Boot dehydration has no cross-owner snapshot barrier, so actor/resource facts may not represent one coherent logical cut                                    | P4C.1c       |
| BUG-50T | A transaction can complete synchronously before its running/pending state is committed                                                                      | P2.1a        |
| BUG-50S | A stream can emit/complete synchronously before its running state is committed                                                                              | P3B.1        |

## Regressions that must not be introduced

These are review blockers when applicable to changed code, even if one focused
test is green.

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
  parity identify the surviving owner; do not delete a public alias as dead code.
