# Defect and regression inventory

[Back to the plan tracker](../TASK.md)

This is a navigation inventory of `BUG-*` defects found during the plan. A row
may already be fixed; live code and deterministic regressions, not this table,
determine current status. The owning criterion names where a regression belongs.

P5.5 reconciliation found no unresolved defect through BUG-68. Each detailed
entry records its resolution and regression evidence; later independent review
findings append new rows rather than changing this historical inventory.

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
| BUG-18T | Transaction bivariant callback helpers permit unsafe narrower callbacks                                                                                        | P5.0a        |
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
| BUG-41S | Stream snapshots or facts that infer presence from `value !== undefined` erase a present `undefined` emission                                                  | P3B.1        |
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
| BUG-56  | The machine invoke carrier erases the stream's exact Params/Value/Error/Context input family through a restated or existential definition                      | P3B.3        |
| BUG-57  | Public architecture tests assert stale source-text implementation details, leaving the committed broad verification baseline red                               | P1D.2        |
| BUG-58  | Launch Workspace proof runtimes register machines without the resource definitions those machines invoke, so authority failures replace the intended behavior  | P1D.2        |
| BUG-59  | Child replacement converts disposal to a Promise and settles success and failure identically, so cleanup Cause is erased before replacement and flush          | P3D.2        |
| BUG-60  | `flow.machine(config)` rejects an already checked `FlowMachineConfig` value and packed fixtures hide the regression with five explicit generics                | P3A.2        |
| BUG-61  | Timer restore accepts non-finite timestamps and can install an infinite scheduled timer                                                                        | P3C.1        |
| BUG-62  | Boot v1 accepts unknown fields in nested resource and actor-owned snapshot records instead of enforcing its documented strict wire shape                       | P5.0b        |
| BUG-63  | The Launch function-output collector crossed 1,000 lines and still centralizes every adapter family plus end-only cleanup in one orchestration file            | P5.0c        |
| BUG-64  | Behavior diff reports a resource change when a behavior contract containing duplicate resource IDs is diffed against itself                                    | P5.4         |
| BUG-65  | The agent-workflow guide has non-executable path snippets and receipt excerpts that no longer match the packed CLI                                             | P5.3         |
| BUG-66  | The packed CLI silently exits through a package-manager bin shim because main-entry detection compares the symlink path lexically                              | P5.4         |
| BUG-67  | A stale older `allow` success commits its preview after the newer attempt failed, leaving an unowned optimistic value visible                                  | P5.4b        |
| BUG-68  | Shortest-path discovery appends an observable target-state reentry and drops the genuinely shortest path when `toState` is used                                | P5.4c        |

## 2026-07-14 cross-phase audit

### BUG-5: Flow Test duplicated production owners

**Resolved 2026-07-14.** Flow Test now boots the canonical runtime-backed actor
and delegates snapshots, resources, transactions, streams, timers, children,
issues, pending work, and bounded progress to production owners. The independent
test cache and asynchronous interpreters were deleted, while model replay keeps
app authority and seeded-resource behavior aligned with the live harness.

### BUG-9: Hydration trusted typed input and attached incrementally

**Resolved 2026-07-14.** Boot hydration now decodes `unknown` into one bounded,
deeply immutable v1 value, validates strict fields, semantic IDs, generations,
duplicates, resource definitions, and app ownership, then attaches every resource
ref before one ResourceStore publication. Hostile, conflicting, ambiguous, or
wrong-owner input leaves resource and actor owners unchanged, while equal-time
replay deterministically preserves the already committed value.

### BUG-10: Behavior coverage probed client route callbacks

**Resolved 2026-07-14.** Behavior and graph metadata now derive solely from
authored descriptor structure. Guarded and eventless paths are reported as
dynamic, runtime/mounted facts remain unavailable without committed evidence,
and hostile callback sentinels prove coverage never calls machine initialization,
guards, updates, transaction/stream routes, selectors, lookups, tags,
placeholders, subscriptions, or pressure keys.

### BUG-14 / BUG-39: Launch read models depend on receipt history

**Resolved 2026-07-14.** Readiness and product projections now derive from
canonical resource freshness, transaction/stream/child snapshots, issues, and
explicit domain state. Receipt evidence remains only in Trace and the debug
panel's bounded recent-evidence lane; regressions replace evidence with empty,
truncated, and unrelated histories and prove business/debug state is unchanged.

### BUG-11 / BUG-23 / BUG-24: React actor ownership bypasses runtime leases

**Resolved 2026-07-14.** The actor hook now prepares one inert initial snapshot
during render and commits that exact value through the canonical orchestrator
lease without rerunning the context initializer. Compatible consumers share one
actor until the final lease releases, while synchronous authority detachment and
serialized finalization prevent same-ID replacement races.

### BUG-45: Launch bootstrap allocates during render

**Resolved 2026-07-14.** The Launch client now renders a deterministic non-Flow
fallback and creates, seeds or hydrates, and owns its runtime only after commit.
Bootstrap failure, boot replacement, and final unmount each dispose the exact
runtime once; server rendering and abandoned render attempts allocate nothing.

### BUG-49: Boot dehydration lacked a cross-owner cut

**Resolved 2026-07-14.** Dehydration validates every requested actor as the exact
instance owned by the runtime before reading state, then captures actor and
resource facts synchronously without yielding or invoking caller serializers.
The complete cut is decoded into detached deeply immutable wire data; independent
before/after facts prove the read emits no evidence, starts no work, and changes
no owner state.

### BUG-12: `useActor` cutover is absent

**Resolved 2026-07-14.** `flow-state/react` now exports `useActor` as its sole
actor hook. Launch Workspace, docs, generated API metadata, source contracts,
and packed React 18/19 consumers use the surviving name, while source and packed
negative proofs reject the removed legacy `use` export.

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

**Resolved 2026-07-14.** Preview staging, overlay ownership, commit, and rollback
now use the exact resource-instance identity owned by ResourceStore. A focused
regression publishes two parameterized refs from one definition independently
through runtime and Flow Test, then proves runtime disposal restores both roots.

### BUG-47: one host cleanup skips later cleanups

**Resolved 2026-07-14.** Runtime host cleanups now run through one named Effect
that captures every cleanup `Exit`, attempts later resource and inspection
unsubscribes after an earlier defect, and combines all cleanup Causes with owner
shutdown and Layer Scope failures. Repeated disposal still joins the same result
without rerunning a cleanup.

### BUG-18T / BUG-18M / BUG-18S: public callbacks remain bivariant

**Resolved 2026-07-14.** Exported transaction, machine, timer, and stream
callbacks are contravariant at authored and carried boundaries. Source and
packed negative witnesses reject narrower Context/Event/State, Params, Value,
Error, pressure-key, and defect callbacks without an erased machine shadow.

### BUG-36: coalescing has unbounded cardinality

**Resolved 2026-07-14.** Queue and `coalesce-latest` declarations both require a
positive safe-integer limit before the descriptor is created. The owner rejects
new distinct coalescing keys at capacity, reports the typed pressure diagnostic,
and hostile tests reject zero, negative, fractional, `NaN`, and infinite limits.

### BUG-41S: emitted undefined is erased

**Resolved 2026-07-14.** Running and terminal snapshots carry an explicit
`hasValue` discriminant, so a present `undefined` survives value publication and
every terminal lane without becoming indistinguishable from no emitted value.

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

**Resolved 2026-07-14.** Child owned entries, snapshots, lifecycle receipts,
retry/re-entry allocation, inspection facts, restore validation, and stale gates
carry one monotonic generation alongside canonical actor identity. Runtime and
Flow Test negative restore witnesses reject incompatible child generations.

### BUG-54: the differential model is self-referential

**Resolved 2026-07-14.** `flow-paths.ts` remains a production-semantic traversal
planner rather than the Phase 3 differential oracle. The differential is now
owned by independent transition plus property-based transaction/stream models
that cover rejection, re-entry, nested routed events, synchronous completion,
state stop, replacement, stale work, and pending accounting on both surfaces.
An architecture test forbids those oracle files from importing `flow-paths` or
the production transition, transaction, and stream semantic owners.

### BUG-55: child boundaries escape flush accounting

**Resolved 2026-07-14.** Pending child boundaries retain the exact disposal
`Effect` and participate in actor flush and parent disposal. Replacement publishes
only after successful cleanup; a failed finalizer preserves its Cause, rejects
repeated flush without rerunning, and prevents the next child generation from
starting or publishing an idle ghost.

### BUG-59: child replacement erases cleanup Cause

**Resolved 2026-07-14.** Child replacement retains the disposal `Effect` instead
of converting it to a settled Promise. Cleanup failure therefore preserves its
Cause through flush and parent disposal, and replacement remains blocked after
the first failed finalizer without rerunning it.

### BUG-56: carried stream typing was replaced by an erased copy

**Resolved 2026-07-14.** Invoke typing carries the canonical stream definition
with separate existential input positions instead of a restated structural copy.
Exact Params/Value/Error/Requirements and Context-derived params remain visible
on authored definitions and packed declarations, while impossible lanes stay
absent and no public cast or `any` family is used.

### BUG-57: the committed verification baseline is red

**Resolved 2026-07-14.** The read-surface architecture contract now verifies
that `summarizeIssue` and `summarizeReceipts` come from the production
`receipt-summary` owner, while the production-backed scenario test proves the
public issue-summary behavior. The separate canonical stream-type assertion is
unchanged and continues to expose BUG-56.

### BUG-58: Launch Workspace proof runtimes omit resource authority

**Resolved 2026-07-14.** Focused Launch Workspace runtimes now accept an exact
module inventory and register every production resource definition their proof
machines invoke. The child failure and retry proofs preserve their typed lanes,
the refresh/invalidate proof seeds only its owned resources, and the chat-only
runtime remains machine-only. Exact BUG-30 resource authorization is unchanged.

## Session `019f6023-ec0c-7a81-b714-556f29735f6a` review

This review covers the uncommitted Phase 3 tree on 2026-07-14. The full test
suite is green at 118 files and 1,011 tests, but the thermo-nuclear Approval Bar
does not pass because the negative Effect/type/ownership cases below are not in
that suite.

### BUG-18M: packed machine callbacks remain unsafe

**Blocker.** Authored action, transition, and `FlowAfterConfig` callbacks are now
contravariant, but the carried [`FlowAfterDefinition`](../packages/flow-state/src/core/api/machine-view-stream-types.ts#L76)
restores bivariance for guard and update. The attempted variance repair also
defaults exported `FlowMachineConfig`, `FlowMachine`, and inspection families to
`any`, then selects a hand-written `ErasedFlowMachine` shadow through `IsAny`.
An unsafe narrower timer callback therefore compiles after the descriptor is
packed, while unannotated public machine types lose Context/Event/State precision.

### BUG-36: non-finite pressure is still unbounded

**Blocker.** `coalesce-latest` now declares `limit`, and finite happy-path limits
correctly bound the distinct-key map. The public constructor accepts every
`number` without validation, though, and the owner enforces capacity only with
[`latestByKey.size >= pressure.limit`](../packages/flow-state/src/core/orchestrator/orchestrator-stream-ownership.ts#L264).
For `NaN` or `Infinity` that comparison never rejects a new key, so an accepted
public declaration still creates unbounded ownership.

### BUG-54: the new independent oracle is too narrow

**High.** The local `stepOracle` is independent and usefully covers basic guard,
update, action order, and re-entry. It does not cover the criterion's nested
dispatch, synchronous owned-family completion, stop/replacement, or stale-work
cases, while the larger `flow-paths.ts` model still imports production semantic
helpers. The new test is good incremental evidence, but it cannot close P3A.1's
independent-oracle correction.

### BUG-55 / BUG-59: flush waits, but failed cleanup is erased

**Blocker.** Pending child boundaries now participate in `flush`, so BUG-55's
idle-ghost and early-idle symptoms are corrected. The boundary calls the public
Promise disposer and uses [`.then(settle, settle)`](../packages/flow-state/src/core/orchestrator/orchestrator-children.ts#L313),
which converts rejection to success before `pendingBoundaryEffects` wraps the
Promise in Effect. A failed finalizer therefore cannot preserve its Cause or
prevent replacement, and parent disposal also starts a detached Promise dispose
before the lifecycle joins the same internal `disposeEffect`.

### BUG-56: canonical name, erased stream family

**Blocker.** Invoke typing imports the canonical stream type now, but instantiates
every Value/Error/Params/Event/Context/Id/Requirements slot as
[`any`](../packages/flow-state/src/core/api/machine-invoke-types.ts#L29). The newly
exported `FlowStreamConfig` also types `params` from `Record<string, unknown>`
instead of its Context source, so direct public annotations reject the intended
context callback while the invoke union loses exact A/E/R. The architecture test
reads `machine-invoke-types.ts` but accidentally checks `machine-view-stream-types.ts`
for `FlowStreamDefinition<any`, which is why the explicit erasure remains green.

### Correctly closed portions

The explicit stream `hasValue` discriminant preserves present `undefined`
through running and terminal snapshots, so BUG-41S is corrected. Child snapshots,
receipts, monotonic retry/re-entry allocation, and active-child restore validation
now carry generation and canonical actor identity, so the reviewed BUG-53 paths
are also corrected.

### Correction disposition

**Resolved 2026-07-14.** Subsequent fixes close every finding from this review:
machine and stream callbacks have source and packed negative witnesses;
non-finite pressure is rejected; independent transition, transaction, and stream
models cover the missing interleavings; child cleanup retains its Effect and
Cause; and invoke typing carries the canonical stream family without `any` or a
restated descriptor.

## 2026-07-14 Phase 2-3 independent implementation audit

This audit covers `b005428..53c615c`. The committed suite is green at 120 files
and 1,020 tests, and the library, packed TypeScript modes, Launch Workspace, and
docs builds pass. The thermo-nuclear Approval Bar still fails because the hostile
source and packed probes below exercise seams absent from that baseline.

### Reopened BUG-18T: the submit carrier restores bivariance

**Resolved 2026-07-14.** Submit and run bindings now expose
`FlowTransactionBinding`, which carries transaction identity and exact authored
family metadata without exposing the bivariant runtime callback carrier. Machine
construction rejects a selector requiring foreign Context in source, isolated,
and freshly packed multi-entry declarations. Owner: `P2.4`.

The original finding was that [`UnknownFlowTransactionDefinition`](../packages/flow-state/src/core/api/resource-transaction-types.ts#L234)
is a shadow transaction family whose params, preview, commit, invalidation,
route, and queue callbacks are bivariant over `unknown`. A transaction whose
params selector requires `{ context: { secret: string } }` therefore compiles in
a machine whose context is only `{ count: number }`; the same mismatch compiles
against the freshly packed multi-entry declarations. The missing regression is
a negative source and packed submit/run binding witness that connects the
transaction's selector source to the owning machine Context. Owner: `P2.4`.

### BUG-60: ordinary machine inference no longer accepts a checked config

**Resolved 2026-07-14.** `flow.machine(config)` now preserves the checked
config's Context, event callbacks, state keys, initial state, literal ID, and
exact config without five explicit generic arguments. Source, isolated, and
freshly packed multi-entry declarations pin the annotation-free call. Owner:
`P3A.2`.

The original finding was that the inferred overload at
[`flow-core.ts`](../packages/flow-state/src/core/api/flow-core.ts#L385) asks
conditional `InferMachineConfig*` helpers to recover a strict callback family
from the same recursive config being checked. For an existing
`config satisfies FlowMachineConfig<...>; flow.machine(config)` call, those
helpers resolve to `never`, overload resolution fails, and Context/Event/State
inference is lost. The packed fixtures conceal this by replacing formerly
inferred calls with five explicit generic arguments. The transient source probe
failed `pnpm --filter flow-state check:cli-source-types` with `initial: "idle"`
not assignable to `never`; the missing regression is the original annotation-free
source and isolated/multi-entry declaration call. Owner: `P3A.2`.

### Reopened BUG-56: canonical stream syntax still erases invoke inputs

**Resolved 2026-07-14.** Machine construction now retains its exact authored
config and checks each invoked stream's canonical params callback input against
the parent Context. A stream whose selector requires foreign Context fails in
source, isolated, and freshly packed multi-entry declarations. Owner: `P3B.3`.

The original finding was that [`FlowInvokeDescriptor`](../packages/flow-state/src/core/api/machine-invoke-types.ts#L27)
instantiates the canonical stream type with `unknown` outputs and `never` input
positions. That existential shape accepts a stream whose params callback requires
foreign Context as an invoke of an incompatible parent machine, in both source
and freshly packed declarations. The missing regression is a negative source and
packed invoke witness that connects stream Context/Params to the parent machine
without a restated or weakened carrier. Owner: `P3B.3`.

### Reopened BUG-41S: receipt facts erase a present undefined value

**Resolved 2026-07-14.** `streamReceiptFacts` now derives availability from the
snapshot's `hasValue` discriminant. A production-runtime/Flow-Test parity proof
pins an absent start fact and a present `undefined` terminal fact without
consulting the value payload. Owner: `P3B.1`.

### BUG-61: timer restore accepts an infinite deadline

**Resolved 2026-07-14.** Restored timer snapshots and their persisted
`timer:start` schedule facts must contain finite `startedAt`, `dueAt`, and
`scheduledMillis` values before actor registration. One hostile matrix proves
the same typed rejection through production runtime and Flow Test, while
diagnostics serialize `NaN` and infinities without replacing the domain failure
with a schema defect. Owner: `P3C.1`.

## 2026-07-15 Phase 2-4 independent implementation audit

This audit covers `6b24f1c..14266e3`, the inherited Phase 2-3 corrections and
the complete Phase 4 adapter range after the prior independent review. The clean
committed tree passes `pnpm verify` at 123 files and 1,050 tests, including the
library build, TypeScript mode proofs, packed Launch Workspace build, and docs
build. The thermo-nuclear Approval Bar still fails on the hostile cases below.

### Reopened BUG-18T: the identity carrier still casts into the bivariant shadow

**Resolved 2026-07-15.** `FlowTransactionBinding` now carries one opaque runtime
definition whose prepared attempts close over exact params, preview,
invalidation, `Effect<A, E, R>`, and outcome routing. Runtime queues, retries,
previews, invalidation, completion, and model traversal consume that prepared
attempt instead of rebuilding callbacks through the deleted
`UnknownFlowTransactionDefinition` shadow. Strict source and freshly packed
isolated-declaration witnesses reject commit, preview, invalidation, route, and
queue callback fields on the identity carrier, while the authored definition
retains exact Params, Value, Error, Requirements, Event, and selector input.
Owner: `P5.0a`.

### BUG-62: boot v1 nested records are not strict

**Resolved 2026-07-15.** Boot decoding now validates exact resource,
transaction, stream, timer, and child snapshot records after the descriptor-safe
own-data clone and before any runtime owner can mutate. The nested-family matrix
rejects unknown and missing fields, present `undefined`, contradictory lifecycle
discriminants, invalid generations and counts, non-finite facts, mismatched map
identities, and invalid recursively nested child snapshots. Public runtime tests
also preserve deterministic repeated hydration and atomic rejection before
resource attachment. Owner: `P5.0b`.

### BUG-63: the output collector crossed the decomposition boundary

**Resolved 2026-07-15.** The 1,011-line collector is now a 19-line coordinator
over inventory, behavior, testing, and inspection owners plus focused writer,
summary, fixture, and scope modules; no owner exceeds 353 lines. The live
collector completes with the same 49 indexed family outputs. Inspection
subscriptions, its actor, and runtime are acquired through an Effect scope, so
normal completion, failed output writes, and partial acquisition release every
acquired owner once in reverse order. Deterministic regressions prove normal and
failed-write cleanup. Owner: `P5.0c`.

### BUG-64: behavior self-diff reports a false resource change

**Resolved 2026-07-15.** Behavior diff identity now scopes machine, resource,
transaction, stream, and view IDs by module and story IDs by machine instead of
colliding on bare IDs. Programmatic and freshly packed CLI regressions prove
that a contract with distinct module-owned resources sharing an ID is
reflexive. Owner: `P5.4`.

### BUG-65: the agent-workflow CLI guide is stale

**Resolved 2026-07-15.** The workflow guide now gives complete `story paths`
invocations and receipt excerpts captured from the packaged CLI's compact
behavior, path, story, and trace output. It names only shipped helper exports
instead of planned renames. The Launch Workspace evaluation lane now uses its
consumer bin shim for public `trace summarize` and `trace proof` commands, and
its local proof generator registers the machine it starts. The full evaluation
script executes successfully against the built package. Owner: `P5.3`.

### BUG-66: the packed CLI does not run through its consumer bin shim

**Resolved 2026-07-15.** CLI main-entry detection canonicalizes the executable
and module paths before comparing them, with a symlink regression at the owner
boundary. The required `pnpm exec flow-state --help` consumer command now
prints the packed CLI help from `examples/basic-cached-posts`. Owner: `P5.4`.

### BUG-67: stale allow success leaves an unowned preview visible

**Resolved 2026-07-15.** An older success remains a committed fallback while a
newer attempt is active, but once that newer owner has settled, the stale
success silently discards its preview instead of publishing it. Rollback replay
also removes overlay bookkeeping once only committed layers remain. The
owner-boundary oracle and the application prove newer-failure rollback exposes
the older active preview, then the older stale completion restores the
canonical root without changing the newer failure snapshot. Owner: `P5.4b`.

### BUG-68: targeted shortest-path discovery prefers a longer reentry path

**Resolved 2026-07-15.** Targeted shortest traversal now restricts matching
paths to the minimum discovered depth before applying duplicate coverage. A
library oracle proves graph and model parity when the target owns an observable
reentry, and the bounded-feed packed CLI proves discovery returns the exact
three-event path that its path checker accepts. Owner: `P5.4c`.

### BUG-69: boot decoding accepts contradictory timer lifecycle records

**Resolved 2026-07-15.** Timer decoding now requires `dueAt >= startedAt`,
rejects `endedAt` on scheduled timers, and requires coherent terminal times for
fired and interrupted timers. Focused decoder and public hydration regressions
prove contradictory foreign state is rejected before any owner attaches.
Owner: `P5.0b`.

### BUG-70: packed example CLI acceptance bypasses the consumer bin shim

**Resolved 2026-07-15.** Each example is copied to an isolated consumer, pnpm
installs the produced tarball with strict peer checking, and every CLI claim
runs through `pnpm exec flow-state`. The matrix now fails if package installation
or the declared bin shim is unavailable. Owner: `P5.5`.

### BUG-71: packed consumer proofs bypass package installation and peer resolution

**Resolved 2026-07-15.** The core, multi-entry, React 18/19, and Launch consumers
now install the produced tarball through pnpm with strict peer checking. Local
dependency links keep the proof offline while pnpm owns tarball extraction,
peer resolution, package layout, and bin creation; the existing runtime/type and
optional-React assertions then run against that installation. Owner: `P5.2`.

### BUG-72: boot decoding accepts contradictory child lifecycle records

**Resolved 2026-07-15.** Child decoding now rejects ownership/lifecycle facts on
an idle child and requires a nested actor snapshot to agree with the child
summary state. Intentionally optional non-idle restore facts remain supported;
focused decoder, public hydration, runtime rehydration, and Flow Test
rehydration regressions prove the corrected boundary. Owner: `P5.0b`.

### BUG-73: machine bindings erase routed event compatibility

**Resolved — Review 5.3, 2026-07-15.** A machine with an explicit Event union accepted
transaction and stream bindings whose routes produce only foreign events. The
public binding types widen routed events to `FlowEvent`, validation checks only
selector context, and runtime casts assert compatibility, so an emitted foreign
event could be silently ignored. Transaction and stream definitions now carry
their routed event discriminants into submit and invoke composition, while
source and packed declaration regressions reject foreign submit, run, and
stream bindings. The Launch Workspace event union also declares its authored
assistant-progress route. Owner: `P5.0a`.

### BUG-74: packed CLI application loading depends on undeclared esbuild

**Resolved — Review 5.3, 2026-07-15.** The installed CLI shelled out to
`pnpm exec esbuild` while `esbuild` is only a development dependency, so an
isolated packed consumer cannot reliably bundle its application behavior
gateway. The CLI now uses the declared production `esbuild` API directly, and
both packed-consumer harnesses install that dependency through the real package
manager path. All six isolated bin-shim consumers pass. Owner: `P5.5`.

### BUG-75: routed event marker loses payloads and public binding annotations

**Resolved — Review 5.4, 2026-07-15.** The Review 5.3 routed-event marker carried
only `Event["type"]`, so a route with an allowed discriminant but incompatible
payload still compiles through source and packed declarations. The exported
`FlowTransactionBinding<Event>` also omits the marker, so an explicit carrier
annotation erases foreign-event rejection for submit and `flow.run`. The full
routed Event now survives authored definitions and the canonical public binding
carrier. Source and packed proofs reject payload mismatch across submit, run,
and stream, plus annotated-carrier erasure across submit and run. Owner:
`P5.0a`.

### BUG-76: optional routed-event witness permits markerless Omit carriers

**Resolved — Review 5.5, 2026-07-15.** The full routed-event witness remained
optional, so a normal `Omit<FlowTransactionBinding<Foreign>,
"__flowRoutedEvent">` annotation removed it and compiled through submit and
`flow.run` without a cast or suppression. The witness is now required and
runtime-present as `undefined`, while its declared type preserves the routed
Event. Markerless structural carriers therefore fail composition, and source
plus packed regressions cover transaction and stream Omit attacks. Owner:
`P5.0a`.

### BUG-77: public string witness permits routed-event reconstruction

**Resolved — Review 5.6, 2026-07-15.** The required `__flowRoutedEvent` witness
could be removed and then reconstructed as `undefined` with an ordinary object
spread, so foreign transaction and stream carriers again compiled through
machine submit and invoke. Routed compatibility now uses a required unique-symbol
brand whose symbol remains private in emitted declarations. Runtime descriptor
objects stay unchanged, while source and packed regressions prove that a
public-looking string property cannot reconstruct the private brand. Owner:
`P5.0a`.

### BUG-78: broad routed-event inference erases machine compatibility

**Resolved — Review 5.7, 2026-07-15.** The private brand fell back to `never` when
a transaction or stream Event widens to the public `FlowEvent` base type. A
consumer can therefore explicitly choose `FlowEvent`, or annotate a route return
as `FlowEvent`, and compile foreign routed events through a narrower machine's
submit, `flow.run`, and stream invoke surfaces without a cast or suppression.
Source and packed repros passed. Definition factories now distinguish required,
absent, and optionally annotated route configurations: routed and ambiguous
carriers preserve their full Event brand, while only a statically route-free
descriptor carries `never`. Existing inferred routes preserve literal event
kinds explicitly. Source and packed regressions reject broad submit, run, and
stream carriers. Owner: `P5.0a`.

### BUG-79: route-free stream brand survives routed config replacement

**Resolved — Review 5.7 correction audit, 2026-07-15.** A route-free stream carries
the machine-universal private `never` brand, but ordinary object spread preserves
that phantom brand while allowing `config.routes` to be replaced. The resulting
descriptor compiles a foreign routed event through a narrower machine even
though the runtime executes the replacement routes. Route-free stream results now
retain `routes?: undefined`, while machine invoke compatibility independently
checks visible route callback returns against the machine event union. Source and
packed regressions reject this clone attack. Owner: `P5.0a`.

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
