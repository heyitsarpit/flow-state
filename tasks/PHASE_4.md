# Phase 4 — Testing, React, server, inspection, and CLI adapters

[Back to the plan tracker](../TASK.md) · [Previous: Phase 3](./PHASE_3.md) · [Next: Phase 5](./PHASE_5.md)

Manifest only; packet readiness is tracked in [TASK.md](../TASK.md). React,
hydration/request, and inspection follow their own production-owner dependencies.

Effect construction is governed by the
[binding Effect architecture blueprint](./EFFECT_ARCHITECTURE.md)
and the approved P0.6 `EFFECT_ARCHITECTURE.md` receipt. Testing supplies Layers
and deterministic controls; React/server/inspection/CLI remain host projections
and may not become Effect runtime owners.

## Phase 4A — Testing and story compatibility over production owners

Each production family has already delegated its own testing execution path.
P4A.1 performs the final public testing/pending convergence and closes BUG-5/
BT-12; it must not rebuild or patch family semantics inside testing.

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
- [ ] Close BUG-5 and BT-12 only after every production-family receipt proves
      its testing path delegates and no duplicate family write/owner remains.

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

Use the CV-3 files, tests, commands, and non-goals in
[CV-3](./COMPATIBILITY_TASKS.md#cv-3-keep-story-for-authoredcli-concepts-and-scenario-for-execution).
CLI projection details
remain P4D.2; this packet establishes the shared result object and aliases.

### `P4A.3` Launch Workspace canonical read models and evidence separation

- [ ] Close BUG-14 and BUG-39 by deriving readiness/product state from canonical resource,
      actor, transaction, or view facts instead of counting receipt history.
- [ ] Keep receipts/traces as bounded diagnostic evidence; retention/truncation
      cannot change the rendered business result.
- [ ] Preserve the recognizable Launch Workspace module/view surface and prove
      the revised view through public package imports.

Files: `examples/launch-workspace/src/launchWorkspaceSupport.ts`, its view/
runtime/shell tests, API inventory/status docs, and only the public Flow view
surface required by the established owner. A missing library capability returns
to its owning P1–P3 packet; do not add an example-side cache or receipt adapter.

Tests: identical product view before/after receipt retention/truncation/clear;
resource invalidation changes the canonical resource fact and derived view;
unrelated receipts do not change readiness; no scan of unbounded history; source
and packed Launch Workspace behavior agrees.

Commands: `F(examples/launch-workspace/src/launchWorkspace.test.ts
examples/launch-workspace/src/launchWorkspaceShell.test.tsx
packages/flow-state/src/view-callbacks.test.ts)`, `T`, `P`, `E`, `D`, `C`.

### Phase 4A closure

- [ ] Focused and app scenarios agree with direct production runtime results.
- [ ] No test/story semantic interpreter or duplicate pending-work model remains.
- [ ] `flowTest(machine)` has explicit focused ownership and no hidden empty app.
- [ ] Static/model evidence cannot be mistaken for mounted/runtime evidence.
- [ ] BUG-14/39 are closed; Launch Workspace business/readiness state is independent
      of evidence history and retention.

---

## Phase 4B — React and view adapters

### P4B.1 React adapter family

P4B.1 is a family label with four receipts. React consumes caller-owned runtime
handles and useSyncExternalStore sources; it never owns a cache, registry,
resource lookup, view evaluator, pending model, or Effect runtime.

#### P4B.1a External-store resource and view sources

- [ ] FlowProvider injects a caller-owned runtime and never disposes it implicitly.
- [ ] useResource/useView subscribe to canonical production sources with stable
      subscribe/getSnapshot/getServerSnapshot callbacks.
- [ ] Close the create-to-subscribe missed-update race and preserve batched
      post-commit publication plus selector equality semantics.
- [ ] Resource/view render starts no work, suspends nowhere implicitly, and owns
      no cache or evaluation engine.
- [ ] Prove exact keyed resource/view inference from source and packed declarations.

Tests: provider mismatch; two providers sharing one runtime; keyed ref swap;
selector equality/throw recovery; update between render and subscribe; batched
publication; no hidden lookup/view work; stable server snapshot.

Commands: F(packages/flow-state/src/react/provider.test.ts
packages/flow-state/src/react/use-resource.test.ts
packages/flow-state/src/react/use-view.test.ts
packages/flow-state/src/react/use-source.test.ts); T; P; E; C.

#### P4B.1b Actor hook and runtime lease

- [ ] Preserve use and route acquisition through runtime.orchestrators.start.
- [ ] Render may compute only the documented pure deterministic inert initial
      snapshot. It starts no Effect/work and commit adopts that exact snapshot
      without calling the initializer again.
- [ ] Mount-owned actors dispose on final unmount; keep-alive actors use the
      P1C.3b runtime lease. One consumer release cannot stop another.
- [ ] Runtime/machine/id/snapshot swap releases old authority before compatible
      acquisition; delayed old cleanup cannot delete or publish into replacement.
- [ ] Keep hooks non-suspending and preserve exact actor snapshot/send inference.

Tests: Strict Mode probe; aborted render/Suspense retry causes pure computation
but zero runtime facts; exact seed adoption; two shared leases; same-ID swap with
delayed cleanup; incompatible same-ID machine rejection; finalizer once.

Commands: F(packages/flow-state/src/react/use-actor.test.ts
packages/flow-state/src/react/provider.test.ts
packages/flow-state/src/runtime-lifecycle.test.ts); T; P; E; C.

#### P4B.1c Launch Workspace bootstrap

- [ ] Close BUG-45/DEC-22: create and hydrate the caller-owned runtime in a client
      bootstrap effect outside the rendered Flow subtree, never during render.
- [ ] Render one deterministic stable fallback until ready; setup failure is
      explicit and cannot leave a partial runtime attached.
- [ ] Inject the ready runtime through FlowProvider and dispose it exactly once
      on final bootstrap-host unmount.
- [ ] Preserve the recognizable Launch Workspace client/module/view surface; do
      not add an example-side cache or private actor mutation.

Tests: bootstrap success/failure/hydration/disposal; zero runtime creation during
render/abort/Strict Mode; stable server/client fallback; public package imports.

Commands: F(examples/launch-workspace/src/launchWorkspaceShell.test.tsx
examples/launch-workspace/src/launchWorkspace.test.ts
packages/flow-state/src/react/provider.test.ts); T; P; E; C.

#### P4B.1d SSR, Offscreen, roots, HMR, and environment matrix

- [ ] Prove React 18/19 source and packed consumers.
- [ ] Bind SSR snapshot/client adoption, Offscreen retain versus final unmount,
      multiple roots sharing one runtime, provider replacement, compatible HMR,
      explicit incompatible replacement, and RSC/root-entry boundaries.
- [ ] No Offscreen/HMR path resurrects private actors or implicitly disposes a
      caller-owned provider runtime.
- [ ] Preserve non-suspending behavior unless a separate public contract is approved.

Tests: server snapshot/client hydrate; Offscreen hide/show/final unmount; two
roots one runtime; provider swap; HMR compatible/incompatible; RSC import and
core root environment neutrality; React 18/19 packed fixtures.

Reference reading — ideas/tests only:
`docs/codebases/tanstack-query/packages/react-query/src/useBaseQuery.ts`,
`docs/codebases/tanstack-query/packages/react-query/src/__tests__/useQuery.test.tsx`,
`docs/codebases/xstate/packages/xstate-react/src/useSelector.ts`,
`docs/codebases/xstate/packages/xstate-react/src/useActorRef.ts`, and the
`docs/codebases/xstate/packages/xstate-react/test/useSelector.test.tsx`,
`docs/codebases/xstate/packages/xstate-react/test/useActorRef.test.tsx`, and
`docs/codebases/xstate/packages/xstate-react/test/useActor.test.tsx` may supply
missed-update, selector, Strict Mode, closure,
and rerender shapes. Do not copy render-time cache/runtime creation, fetching,
Suspense, singleton notification, or private actor resurrection;
`docs/codebases/xstate/packages/xstate-react/src/stopRootWithRehydration.ts`
remains an anti-reference.

Commands: the P4B.1a-c focused commands plus exact packed React 18/19 commands
recorded by P0.1c; T; P; E; C.

### `P4B.2` Preferred `useActor` alias and packed inference (`CV-1`)

- [ ] Complete `CV-1`: export/prefer `useActor` while retaining `use` as the same
      implementation and typed compatibility alias.

Use the CV-1 detail in
[CV-1](./COMPATIBILITY_TASKS.md#cv-1-add-useactor-while-retaining-use).
Run the packed React 18 and React 19 commands captured
by P0.1c in addition to the focused hook tests.

### Phase 4B closure

- [ ] React differential/lifecycle/inference matrix passes.
- [ ] No React-owned runtime/cache/lease/interpreter remains.
- [ ] BUG-11/12/23/24/45 are closed and both actor-hook names are one function/type path.
- [ ] Packed React 18 and 19 consumers pass against built package entry points.

---

## Phase 4C — Server and durable boundaries

### P4C.1 durable boundary family

#### P4C.1a Decoder, version, limits, and immutable value

- [ ] Decode boot/hydration/snapshot input from unknown through one boundary.
- [ ] Apply strict known fields plus explicit extensions; reject unsupported/
      newer/mixed versions, duplicates, prototype-like names, and invalid schemas.
- [ ] Enforce measured depth/string/array/count limits before owner mutation.
- [ ] Never intentionally invoke getters, proxies, toJSON, coercion, equality,
      callbacks, or executable refs while validating.
- [ ] Decode every entry to one complete immutable value or return a typed
      rejection. Preserve v1 acceptance/default output and never smuggle fields
      into v1; request separate approval for v2.
- [ ] Include only serializable production facts. Local Schema-free values are
      omitted or explicitly rejected when durable encoding is requested.

Files: public boot/wire types, decoder/schema boundary, version/limit diagnostics,
compatibility corpus, and pure decoder tests. No ResourceStore/actor mutation.

Tests: non-object/null/truncated; wrong/unsupported/mixed version; valid v1 and
real JSON round-trip; unknown fields except extensions; duplicate semantic IDs;
invalid value; hostile prototype/accessor/proxy/toJSON/coercion/sparse/cyclic/
oversize inputs execute zero client code; immutable output; one bad entry rejects
the whole value.

#### P4C.1b Atomic attachment and conflict handling

- [ ] Accept only the complete immutable decoded value from P4C.1a.
- [ ] Validate app/machine/actor/resource ownership at attachment; incoming v1
      legacy/unclaimed facts never invent ownership.
- [ ] Acquire one runtime-owned attachment barrier and commit ResourceStore/actor
      restore once, or mutate nothing.
- [ ] Repeated identical hydration is idempotent with no duplicate fact.
- [ ] Active/newer/conflicting state rejects the complete payload; no incoming
      entry silently wins while actor start/resource observation interleaves.
- [ ] Delegate testing hydration through this production boundary.

Files: runtime contract/hydration attach, store/actor internal restore seams,
testing adapter, and atomic rehydration tests. No decoder or wire-version policy.

Tests: wrong owner/app/machine/ref; one invalid attachment among valid entries;
generation/pending preservation; repeated hydrate; active/newer conflict;
concurrent observe/start; zero snapshot/revision/notification mutation on reject.

#### P4C.1c Coherent dehydrate barrier

- [ ] Close BUG-49: dehydrate is an observationally pure read behind one declared
      cross-owner barrier and captures one coherent actor/resource logical cut.
- [ ] Dehydrate starts no work, emits no evidence, invokes no callbacks, and
      returns only immutable serializable facts already approved by P4C.1a.
- [ ] Document DEC-18 honestly: this is coherent in-process capture, not durable
      atomic storage, remote rollback, exactly-once I/O, or post-process-death finalization.
- [ ] If portable timer/ownership facts require v2, leave them conditional on a
      separately approved version; v1 remains same-clock where documented.

Tests: actor/resource mutation races capture without mixed cuts; read purity;
JSON round-trip through P4C.1a; no facts/work; hostile/live objects excluded;
crash-point documentation does not claim persistence.

Reference reading — ideas/tests only:
`docs/codebases/tanstack-query/packages/query-core/src/hydration.ts`,
`docs/codebases/tanstack-query/packages/query-core/src/__tests__/hydration.test.tsx`,
`docs/codebases/tanstack-query/packages/react-query/src/HydrationBoundary.tsx`,
`docs/codebases/tanstack-query/packages/react-query/src/__tests__/HydrationBoundary.test.tsx`,
and `docs/codebases/xstate/packages/core/test/rehydration.test.ts` may supply
JSON, repeat/conflict, aborted-transition, completed-work non-replay, and child
generation cases. Do not copy permissive casts, hashes, Date.now,
optional-field states, partial mutation, or React render-time hydration.

Commands for each subpacket: F(packages/flow-state/src/runtime.test.ts
packages/flow-state/src/runtime-rehydration.test.ts
packages/flow-state/src/flow-test-rehydration.test.ts
packages/flow-state/src/diagnostics.test.ts); T; P; E; C.

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
- [ ] BUG-9 is closed; failed hydration produces no notification and preserves
      observable snapshots plus owner revision/generation counters.
- [ ] Valid v1 compatibility and attachment-time ownership proof are both tested.
- [ ] BUG-49 is closed; dehydrate is a pure coherent logical cut and no durable
      storage/process-crash guarantee is implied.
- [ ] No unapproved payload version or unversioned durable field was introduced.

---

## Phase 4D — Inspection and CLI projections

### P4D.1 inspection family

#### P4D.1a Pure metadata and core committed-fact inspection

- [ ] Derive app/module/descriptor graph and declared/static evidence from pure
      ownership metadata without invoking client callbacks.
- [ ] Consume P1D.3b committed actor/resource facts for runtime evidence; the
      inspector cannot synchronously veto or participate in publication.
- [ ] Keep declared, static, snapshot, runtime, and mounted evidence levels distinct.
- [ ] Close BUG-10: remove Proxy/fabricated-value probing of route, guard,
      selector, lookup, tag, placeholder, or service callbacks.
- [ ] Literal declared routes may be named; callback-computed routes are
      dynamic/unknown until actual runtime evidence exists.
- [ ] Produce one bounded redacted inspection value, not live refs/actors/Effects.

Files: ownership metadata registry, behavior coverage/contract/graph builders,
core actor/resource fact projection, inspect entry point, and focused tests.
Do not wait for future family facts or redesign CLI output here.

Tests: callbacks throw if invoked and inspection still succeeds; literal versus
dynamic route; static evidence never becomes runtime/mounted; observed committed
fact upgrades only runtime evidence; bounds/redaction; observer failure isolation.

Commands: F(packages/flow-state/src/behavior-contract.test.ts
packages/flow-state/src/behavior-coverage-render.test.ts
packages/flow-state/src/flow-graph.test.ts
packages/flow-state/src/runtime-inspection.test.ts); T; P; E; C.

#### P4D.1b Final family evidence integration and duplicate deletion

- [ ] Integrate transaction, stream, timer, and child facts contributed by their
      production owners without adding family semantics inside inspection.
- [ ] Prove every family preserves evidence level, lane, owner generation,
      monotonic sequence, truncation, and redaction rules.
- [ ] Remove duplicate graph walkers/evidence builders only after parity.
- [ ] Static/model reachability remains explicitly non-runtime evidence.

Files: family fact projections, transition inspection, pending/issue/receipt
views, and duplicate walkers/builders identified by OWNER_MAP.md.

Tests: one positive and negative fact per family; stale generation remains
inspection-only and cannot alter business state; declared/snapshot/runtime/
mounted levels never collapse; old/new projection parity before deletion.

Reference reading — vocabulary/tests only:
`docs/codebases/xstate/packages/core/src/inspection.ts` and
`docs/codebases/xstate/packages/core/test/inspect.test.ts` may suggest distinct
fact-category and lifecycle-order cases. Do not copy live actors, unbounded
payloads, synchronous delivery, or upstream event objects.

Commands: F(packages/flow-state/src/flow-transition-inspection.test.ts
packages/flow-state/src/runtime-inspection.test.ts
packages/flow-state/src/inspection-semantic-summary.test.ts); T; P; E; C.

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
