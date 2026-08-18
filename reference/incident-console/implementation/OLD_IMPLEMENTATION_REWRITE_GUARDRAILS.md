# Old implementation review: rewrite guardrails

Status: non-normative audit and rewrite gate

This document records high-confidence failures and complexity traps found by a strict review of the old
`packages/flow-state` implementation, its testing/Story paths, historical example runtimes, and the
public/CLI/inspection boundaries. It is an implementation review, not a competing semantic authority.
The accepted revision specification and current contracts decide behavior. This document decides what the
rewrite MUST NOT repeat.

## The single-runtime rule

“One runtime” means one semantic implementation and one runtime-assembly boundary, not one global runtime
instance for the whole process.

The old system had one literal `ManagedRuntime` constructor in the current production path, but it also had
multiple runtime topologies:

1. Production runtime execution.
2. A historical `flowTest` interpreter with its own transitions, mailbox, child, stream, timer,
   transaction, and snapshot ownership (`eb9f441^:packages/flow-state/src/testing/flow-test.ts:241-643`).
3. Example-owned live/test runtime factories with separate layers and orchestration
   (`0fc2d19^:examples/basic-cached-posts/src/app/runtime.ts:1-6`,
   `0fc2d19^:examples/basic-cached-posts/src/app/layers.ts:6-15`).

The historical interpreter has since been removed and the current runtime-backed test path converges on
`createRuntime`. That convergence is the rewrite target, not evidence that the old topology was safe.

Fresh runtime instances are allowed for test isolation, SSR request isolation, Stories, or browser roots.
Every instance MUST use the same production runtime factory, AppPlan/compiler, actor lifecycle, mailbox,
operation kernels, scheduler, StoreKernel, persistence, inspection, and cleanup implementation.

## Runtime ownership and admission

### 1. No second execution engine — P0

The old `flowTest` engine directly planned/applied transitions and separately owned transaction, stream,
timer, child, and snapshot state. Production ownership lived in the orchestrator modules. This allowed
tests to pass while live mailbox ordering, completion, cleanup, or routing differed.

Evidence: `eb9f441^:packages/flow-state/src/testing/flow-test.ts:306-535`,
`packages/flow-state/src/core/orchestrator/`, and the historical removal of at least 2,645 duplicated
lines in commit `0ac8fcc`.

MUST NOT implement a second transition evaluator, mailbox, actor engine, child engine, resource store,
stream controller, timer controller, transaction controller, snapshot model, or preview engine for tests,
Stories, models, examples, or previews.

### 2. No parallel runtime assembly — P0

The old app layer, `createRuntime`, and test boot each assembled overlapping ResourceStore, inspection,
trace, policy, ownership, and orchestrator graphs (`packages/flow-state/src/descriptors/app.ts:79-131`,
`packages/flow-state/src/runtime/contract-runtime.ts:551-599`,
`packages/flow-state/src/testing/flow-test-runtime-boot.ts:66-91`).

MUST NOT expose `createFooRuntime()` and `createFooTestRuntime()` as separate semantic systems. Keep one
assembly boundary; inject clock, services, persistence, deterministic controls, and host configuration
before constructing an isolated runtime instance.

### 3. No silent app-graph mutation — P1

Tests could synthesize focused apps or append a machine to an application when the machine was not already
owned (`packages/flow-state/src/testing/focused-app.ts:70-82`,
`packages/flow-state/src/testing/test.ts:212-237`).

MUST NOT dynamically register machines, descriptors, providers, or operation families into a running app.
Compile one explicit AppPlan, validate complete admission before activation, and fail closed on ownership
mismatch.

### 4. No process-global descriptor registry — P1

Resource definitions were retained by a module-global map and persisted lookup scanned definitions by ID/key
(`packages/flow-state/src/core/api/resource-runtime.ts:31-74`). This creates cross-app ambiguity, test
leakage, retention growth, and non-local hydration.

MUST NOT resolve persisted descriptors through global registries. Resolve through the receiving AppPlan and
exact descriptor-plus-canonical-key identity.

### 5. No descriptor-owned runtime services — P1

`app.layer()` constructed stateful stores, inspection, orchestration, policies, and runtime installers
(`packages/flow-state/src/descriptors/app.ts:69-131`). Static compilation and runtime ownership were
therefore coupled.

MUST NOT let definitions, descriptors, or AppPlan construct stateful runtime services. The compiler emits
an immutable plan; the runtime factory owns all live state and lifetimes.

## Actor, host, and lifecycle guardrails

### 6. No ambiguous actor identity — P1

`useActor(machine)` defaulted to the machine ID and attached using `"keep-alive"`, so multiple component
instances could share one actor (`packages/flow-state/src/react/use-actor.ts:90`,
`packages/flow-state/src/core/orchestrator/orchestrator-system.ts:537`).

MUST NOT use machine identity as an actor-instance identity. Use explicit durable actor IDs for shared actors
and explicit owner-scoped/generated identities for local actors.

### 7. No competing disposal authorities — P1

The old surface exposed runtime creation, orchestrator start/attach/stop, and actor-level disposal in
parallel (`packages/flow-state/src/runtime/contract-runtime.ts:433-541`,
`packages/flow-state/src/core/orchestrator/orchestrator-actor-lifecycle.ts:287-292`).

MUST NOT let ordinary actor handles, refs, React hooks, or test harnesses dispose actors. Only the explicit
owner lease controls individual terminal disposal.

### 8. No shell actor followed by identity swapping — P1

React created a full no-op actor shell during render and attached another runtime actor asynchronously
(`packages/flow-state/src/react/use-actor.ts:20-58,86-152`). Commands could disappear or target a different
identity after commit.

MUST NOT expose a fake public actor. Prepare the exact actor during render, attach that same actor during
commit, and make command admission/buffering/rejection explicit and observable.

### 8A. No undocumented host/runtime arity — P1

The public `attach` contract accepted two arguments while React cast it to a private three-argument form and
passed a prepared snapshot (`packages/flow-state/src/core/api/runtime-types.ts:126`,
`packages/flow-state/src/react/use-actor.ts:137-152`). A compatible runtime or test double could ignore the
snapshot and break prepared-state hydration.

MUST NOT use arity casts or private hook/runtime coupling. Put prepared snapshots in the exact internal
contract or route them through a typed adapter with one owner.

### 9. No broad actor subscription for command-only consumers — P1

`useActor` subscribed to the complete actor source (`packages/flow-state/src/react/use-actor.ts:130`,
`packages/flow-state/src/react/use-source.ts:22`), causing rerenders for unrelated snapshot changes.

MUST NOT make command handles reactive by default. Use a stable command surface and keep passive projection
reactivity in `useView` or its accepted successor.

### 10. No uncoordinated StrictMode cleanup — P1

React attachment and cleanup were asynchronous and cleanup failures were discarded with `void release()`
(`packages/flow-state/src/react/use-actor.ts:163-204`). StrictMode setup/cleanup/setup could race attach,
release, and reattach.

MUST NOT rely on incidental effect ordering. Make attachment, suspension, resumption, disposal, and cleanup
failure handling idempotent, linearized, and observable.

### 10A. No split-brain nested host providers — P1

The old provider accepted arbitrary runtimes and tests allowed nested independent providers
(`packages/flow-state/src/react/provider.ts:12`, `packages/flow-state/src/react/provider.test.ts:37`). A
subtree could silently read runtime B while siblings used runtime A.

MUST NOT allow unrelated nested runtime providers inside one host tree without an explicit diagnosed boundary.
Enforce one runtime context per host root or make every nested runtime boundary deliberate and visible.

### 11. Observation is not machine history — P1

Subscription changes appended `actor:subscribe` and `actor:unsubscribe` receipts
(`packages/flow-state/src/core/orchestrator/orchestrator-actor-lifecycle.ts:244`). React mount/unmount could
therefore alter actor history without a domain turn.

Lifecycle inspection evidence is a separate accepted lane: start, restore, suspend, resume, and disposal may
produce lifecycle records, but they MUST NOT create a machine-turn revision or `TurnRecord`.

MUST NOT treat observation, host attachment, or selector installation as machine-turn events or mutate
machine-turn history merely because a consumer mounted. Preserve lifecycle evidence in its separate lane.

## Operation and reactivity guardrails

### 12. No canonical-store previews — P1

The old transaction preview path hydrated optimistic values directly into the shared ResourceStore and
rollback restored/removed canonical records (`packages/flow-state/src/core/orchestrator/orchestrator-transaction-preview.ts:94-325`).

MUST NOT publish an uncommitted preview as canonical shared state. Keep previews scoped to the initiating
actor incarnation and occurrence; promote only through canonical-base compare-and-set; rollback only the
owner overlay.

### 13. No descriptor-only resource identity — P1

The model keyed seeded resources by `resource.ref.id`, allowing multiple canonical instances of one
descriptor to overwrite each other (`packages/flow-state/src/testing/flow-model.ts:31-40`).

MUST NOT identify operation state by descriptor ID alone. Identity is descriptor plus canonical `K`; retain
executable `P` separately for live work and hydration.

### 14. No time-derived state without a publication mechanism — P1

Resource freshness was derived from current time, but subscriptions only received mutation notifications;
no expiration event published the fresh-to-stale transition
(`packages/flow-state/src/core/store/resource-snapshot.ts:58-72`,
`packages/flow-state/src/core/store/resource-store-subscriptions.ts:72-96`).

MUST NOT expose time-derived reactive state as if it were push-reactive without an owned clock/expiration
mechanism. Either publish expiration through the runtime mailbox or make the state explicitly pull-only.

### 15. No hook-local whole-actor reactivity — P1

Each `useView` allocated a source and subscribed to the whole actor; selectors ran on every actor
publication (`packages/flow-state/src/react/use-view.ts:25`,
`packages/flow-state/src/react/view-source.ts:47-60`,
`packages/flow-state/src/core/store/selection-source.ts:68`).

MUST NOT make hook-local subscriptions the primary reactivity architecture. Track exact descriptor/K
dependencies in the runtime, replace the dependency set after evaluation, and coalesce matching fanout.

### 15A. No unstable resource-ref identity — P2

Each resource `ref(...)` call created a new object while `useResource` compared refs by object identity
(`packages/flow-state/src/descriptors/resource.ts:28`,
`packages/flow-state/src/react/use-resource.ts:24`). This caused avoidable subscription churn; maintained
documentation encouraged the unstable form (`apps/docs/src/pages/reference/views-react.md:38`).

MUST NOT key reactive resource state by allocation identity. Use canonical descriptor-plus-key identity;
memoization may optimize allocations but must not define semantics.

### 16. No Effect interpreter in synchronous snapshot reads — P1

React resource snapshot reads crossed into `managedRuntime.runSync` on every read
(`packages/flow-state/src/react/resource-source.ts:48`,
`packages/flow-state/src/runtime/contract-runtime.ts:256`).

MUST NOT put Effect execution in `getSnapshot`. Maintain a stable synchronous immutable read surface backed
by runtime-owned state.

## Testing, Stories, models, and evidence

### 17. No undisposable internal Story runtime — P1

Story execution created a harness and returned after flushing without disposing its internally owned runtime
(`packages/flow-state/src/testing/flow-stories.ts:81,147-175`,
`packages/flow-state/src/testing/runtime-backed-test-harness.ts:170,240`,
`packages/flow-state/src/core/api/testing-types.ts:347-380`).

MUST NOT return from an internally owned Story/test run without `finally` disposal. Do not hide runtime
ownership or rely on actor flush for cleanup.

### 18. No runtime-backed “pure model” — P0

`flow-model.ts` replay created a FlowTest builder, installed layers and clock controls, sent events, and
returned a live harness (`packages/flow-state/src/testing/flow-model.ts:57-85`). The model therefore ran
Effects and inherited runtime leaks.

MUST NOT let pure model discovery instantiate a runtime or execute Effects. Model output is immutable path/
Story data; live execution belongs to an explicitly scoped Story/test runner.

### 19. No mailbox-empty definition of settled — P1

Story success was derived after `flush()` while active fibers, streams, transactions, and children were
tracked separately (`packages/flow-state/src/testing/flow-stories.ts:81-91`,
`packages/flow-state/src/testing/runtime-backed-test-harness.ts:195-205`,
`packages/flow-state/src/testing/pending-work.ts:52`).

MUST NOT define success as an empty mailbox. Distinguish turn flush, timer advancement, predicate
satisfaction, and complete settlement; active bounded work must remain visible.

### 20. No mutable configuration after materialization — P1

`provide()` could append layers after a cached runtime existed and `clock()` could change metadata without
changing the actual clock (`packages/flow-state/src/testing/flow-test-runtime-boot.ts:26,66,112`,
`packages/flow-state/src/testing/runtime-backed-test-harness.ts:266-277,343`).

MUST NOT permit post-materialization mutation. Freeze app, layers, clock, seed, and fixture configuration
before runtime construction, or reject late configuration through separate plan/run types.

### 21. No broad parity normalization — P2

Parity assertions zeroed receipt timing and recursively removed every `fiberId`
(`packages/flow-state/src/testing/runtime-parity-assertions.ts:29-60`). This could conceal ordering,
ownership, fiber, or lifecycle differences.

MUST NOT normalize away contract-relevant evidence. Every ignored field must be classified as genuinely
nondeterministic; preserve turn order, ownership, lifecycle, and cleanup evidence.

### 22. No duplicated fixture starters — P2

At least sixteen transaction fixtures duplicated controlled capability setup, FlowTest startup, production
runtime startup, receipt decoding, and normalization; together they were measured at 6,244 lines
(`packages/flow-state/src/testing/fixtures/submit-transaction-allow-latest-wins.ts:79,219-275`).

MUST NOT maintain paired near-copy fixture APIs. Parameterize immutable scenario definitions and controlled
capabilities, then assert through shared snapshots, receipts, pending-work, and cleanup contracts.

### 23. No hidden test scheduler or unbounded test history — P2

The test wrapper owned another ready-work queue while production actors had their own queues, and controlled
streams retained unbounded history while draining with `Array.shift()`
(`packages/flow-state/src/core/scheduling/ready-work.ts:14`,
`packages/flow-state/src/testing/runtime-backed-test-harness.ts:301`,
`packages/flow-state/src/testing/controlled-stream.ts:27-52,87-148`).

MUST NOT add test-only scheduler ownership. Runtime pending work is the source of truth. Test logs must be
bounded or opt-in, and queues must have predictable complexity.

## Performance and complexity guardrails

The audit snapshot contained 330 TypeScript/TSX files and 111,239 lines: 47,071 non-test and 64,168 test
lines. The largest files included `public-api-types.test.ts` (5,177 lines), `runtime.test.ts` (4,891),
`flow-test-rehydration.test.ts` (4,142), and `core/machines/flow-paths.ts` (2,084). This is a maintenance
warning, not a rewrite target.

### 24. No per-record whole-store cloning — P1

`updateRecord()` cloned the complete records Map for each changed record; seed, hydrate, and invalidate
could repeat that work (`packages/flow-state/src/core/store/resource-store-memory.ts:171-189`,
`packages/flow-state/src/core/store/resource-store-state-updates.ts:36-76,158-188`).

MUST NOT clone the complete store once per item in a logical batch. Build one working state, apply the batch,
and publish one bounded immutable state transition and fanout.

### 25. No global scans for keyed concurrency — P2

Transaction admission scanned every active transaction to find a matching concurrency key
(`packages/flow-state/src/core/orchestrator/orchestrator-transaction-concurrency.ts:27-62`,
`packages/flow-state/src/core/orchestrator/orchestrator-transaction-start.ts:130-185`).

MUST NOT use a global active-transaction scan on the hot path. Maintain a secondary exact-key index with
symmetric add/remove ownership, or establish and prove a bounded cardinality.

### 26. No scheduler cancellation-registration race — P1

The default notification scheduler could invoke synchronously before the cancellation closure was inserted
into the pending set (`packages/flow-state/src/core/runtime/services/notification-scheduler.ts:12-25`,
`packages/flow-state/src/core/store/selection-source.ts:31-52`). The resulting closure could remain forever.

MUST NOT register cancellation after scheduling when scheduling may be synchronous. Register a token first or
require a scheduler that returns a cancellation token before executing. Test both synchronous and asynchronous
schedulers.

### 27. No independent ownership registries — P1

Children, resources, streams, transaction concurrency, and lifecycle each maintained separate maps
(`packages/flow-state/src/core/orchestrator/orchestrator-children.ts:118-121`,
`orchestrator-resources.ts:81-94`, `orchestrator-stream-ownership.ts:96-97`,
`orchestrator-transaction-concurrency.ts:27-35`, `orchestrator-actor-lifecycle.ts:81`).

MUST NOT add parallel ownership, finalizer, generation, registry, or publication ledgers without one clear
owner and consistency proof. Prefer one runtime-owned coordination structure per responsibility.

### 28. No unbounded inspection retention — P2

The inspection buffer retained all messages (`packages/flow-state/src/core/inspection/inspection-sink.ts:62-107`).

MUST NOT make unbounded inspection retention the default. Use bounded retention with explicit truncation and
retained-prefix evidence.

### 29. No unchecked type-level expansion — P2

The existing type-performance check already measured 179,459 instantiations at 25 roots and 334,594 at 50
roots (`packages/flow-state/scripts/check-vnext-type-performance.mjs:90-166`).

MUST NOT add recursive, distributive, or cross-product public types without extending the performance proof
and enforcing a checked baseline.

### 29A. No repeated full graph walks — P2

Validation, inventory, fixture lookup, and runtime ownership each rebuilt related indexes
(`packages/flow-state/src/descriptors/validation.ts:351`,
`packages/flow-state/src/descriptors/inventory.ts:61`,
`packages/flow-state/src/core/orchestrator/app-ownership.ts:132`).

MUST NOT add independent graph walks or duplicate indexes when one immutable compiled AppPlan index can serve
admission, ownership, inspection, fixtures, and tooling.

## API, CLI, persistence, and artifact guardrails

### 30. No public internal services — P1

The old root exports exposed service tags, stores, orchestrators, runtime-layer types, inspection families,
registered views, and child APIs (`packages/flow-state/src/index.ts:1-42`).

MUST NOT export `ManagedRuntime`, stores, orchestrators, internal layers, harnesses, inspection artifacts,
registered views, custom comparators, or child-machine types from public entrypoints.

### 31. No CLI-only semantic compiler or decoder — P1

The CLI gateway and trace-input path maintained their own validator, bundler, and artifact decoder
(`packages/flow-state/src/cli/gateway.ts:55,203-220`,
`packages/flow-state/src/cli/trace-input.ts:26-115`).

MUST NOT create a CLI-only application compiler, shape validator, artifact decoder, or synthetic proof path.
CLI must project the same runtime/inspection/artifact truth.

### 31A. No repeated CLI gateway bundling — P2

The CLI gateway copied and bundled dependencies for each gateway load
(`packages/flow-state/src/cli/gateway.ts:203-220,257`). Cleanup existed, so this is a latency and boundary
cost rather than a confirmed leak.

MUST NOT make bundling a second semantic loader or require repeated full dependency assembly when a trusted
local gateway can load directly. Keep CLI loading separate from core runtime semantics.

### 32. No fabricated machines or artifact identity — P1

Trace import synthesized a one-state machine rather than resolving the receiving application graph
(`packages/flow-state/src/core/inspection/trace-artifact.ts:57`).

MUST NOT fabricate machines, root/child/final snapshot fields, proof receipts, or artifact identities during
import. Resolve identity through the receiving AppPlan or fail closed.

### 33. No parallel result/envelope families — P1

Testing, Story, CLI, and inspection each carried overlapping result, report, formatter, and artifact models
(`packages/flow-state/src/testing.ts:1`, `packages/flow-state/src/cli/story-read.ts:1`,
`packages/flow-state/src/cli/story-run.ts:7-190`,
`packages/flow-state/src/core/inspection/inspect.ts:63`).

MUST NOT preserve parallel semantic envelopes. Decode one shared evidence model, then project it to JSON,
text, or CLI output.

### 34. No mutable legacy hydration contract — P1

The server subpath preserved old mutable boot and hydration types (`packages/flow-state/src/server.ts:1-3`).

MUST NOT carry forward mutable v1 boot artifacts or a second persistence/bootstrap contract. Persistence
must be app-branded, context-closed, and consumed by the same production runtime.

### 35. No public direct-resource observation path — P1

The old React entrypoint exposed direct resource hooks and registered views that bypassed actor projections
(`packages/flow-state/src/react/use-resource.ts:1-46`, `packages/flow-state/src/react-entry.ts:1-7`).

MUST NOT preserve `useResource`, registered `useView(view, equal?)`, custom comparators, or direct store
subscriptions. Machine correctness must use runtime-owned passive dependency tracking.

### 35A. No stale consumer documentation as migration authority — P2

Maintained docs still taught deleted runtime, store, orchestrator, and registered-view APIs
(`apps/docs/src/pages/reference/runtime.md:12`,
`apps/docs/src/pages/guide/server-hydration.md:21`,
`apps/docs/src/pages/reference/views-react.md:83`).

MUST NOT preserve old docs or examples as compatibility requirements. Migrate them with the public surface,
and replace source-text architecture expectations that encode deleted names.

## Required rewrite review gates

Every replacement slice MUST answer these questions before implementation is accepted:

1. Which single production owner executes this behavior in live, test, Story, SSR, and CLI contexts?
2. Which one runtime-owned state, lifetime, registry, queue, and evidence owner exists?
3. What happens for synchronous scheduling, interruption, disposal, remount, hydration, and stale completion?
4. Which exact descriptor/K, actor incarnation, generation, and occurrence fences prevent cross-instance writes?
5. Which executable proof compares live and Story/test execution without erasing contract-relevant evidence?

The central proof matrix and local receipts must own these answers. Source-text architecture assertions,
focused mock tests, and passing type checks are supporting evidence only; they cannot prove runtime topology,
cleanup, parity, or absence of duplicate semantics.

## Review conclusion

The rewrite target is one production runtime implementation, one runtime assembly boundary, one immutable
AppPlan, one mailbox-driven actor model, one canonical StoreKernel/overlay ledger, exact actor ownership,
dependency-tracked passive views, bounded evidence, and explicit disposal. The old implementation's largest
failure was not merely “too many files”; it was allowing multiple owners to represent the same execution.
