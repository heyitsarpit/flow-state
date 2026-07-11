# Phase 4 — Testing, React, server, inspection, and CLI adapters

[Back to the plan tracker](../TASK.md) · [Previous: Phase 3](./PHASE_3.md) · [Next: Phase 5](./PHASE_5.md)

Status: blocked by Phase 3 closure.

Effect construction is governed by the
[binding Effect architecture blueprint](./PHASE_0.md#binding-effect-architecture-blueprint)
and the approved P0.6 `EFFECT_ARCHITECTURE.md` receipt. Testing supplies Layers
and deterministic controls; React/server/inspection/CLI remain host projections
and may not become Effect runtime owners.

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

Use the CV-3 files, tests, commands, and non-goals in
[Phase 0 compatibility vocabulary](./PHASE_0.md#approved-compatibility-vocabulary-tasks).
CLI projection details
remain P4D.2; this packet establishes the shared result object and aliases.

### `P4A.3` Launch Workspace canonical read models and evidence separation

- [ ] Close BUG-39 by deriving readiness/product state from canonical resource,
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
- [ ] BUG-39 is closed; Launch Workspace business/readiness state is independent
      of evidence history and retention.

---

## Phase 4B — React and view adapters

### `P4B.1` Thin provider, actor/resource/view sources, and React lifecycle

- [ ] Preserve `FlowProvider`, `use`, `useResource`, `useView`, and optional `flow.view`.
- [ ] Make provider/hooks consume production runtime handles and one publication owner.
- [ ] Prove exact actor/resource/view inference from packed React declarations.
- [ ] Test Strict Mode double mount/unmount, repeated render, actor swap, provider
      mismatch, selector equality, batching, and exactly-once cleanup.
- [ ] Test SSR/client hydration and React 18/19 packed consumers.
- [ ] Keep current hooks non-suspending. Hidden Suspense behavior is not approved;
      a future explicit suspense option would require a separate public contract.
- [ ] Close BUG-45 and implement DEC-22: runtime creation/hydration happens in a
      client bootstrap effect outside the rendered Flow subtree, with a stable
      fallback and exactly-once disposal. Render never allocates a runtime.
- [ ] Bind Offscreen, multiple-root, provider swap, HMR/incompatible definition,
      and server-component import behavior without private actor mutation.

Files: `react/context.ts`, provider, subscribed/selection sources, actor/resource/
view hooks, `react-entry.ts`, production runtime handle types, React tests, and
Launch Workspace shell tests. React may adapt `useSyncExternalStore`; it may not
own a cache, actor registry, resource lookup, view evaluator, or pending-work model.

Binding lifecycle:

- Render may materialize an inert initial snapshot by invoking only the documented
  pure deterministic context initializer. It starts no lookup, actor, Effect,
  subscription, timer, stream, transaction, or service work. Strict Mode and an
  aborted render may repeat this pure computation.
- Layout/effect acquisition must pass/adopt that exact inert snapshot. Canonical
  actor start cannot call the context initializer a second time. A supplied
  snapshot bypasses context initialization.
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
  never start hidden work or suspend implicitly.
- `FlowProvider` injects a caller-owned runtime and never disposes it implicitly.
  Any future provider-owned runtime requires an explicit ownership prop/constructor.

Tests: Strict Mode double mount/unmount; aborted render and Suspense retry perform
pure initialization but create no runtime facts; committed actor adopts the exact
inert snapshot without a second initializer call; two consumers sharing a keep-alive ID; actor swap
with delayed disposal and same ID; different same-ID machine rejection;
provider/runtime mismatch and provider does not dispose injected runtime; two
providers sharing one runtime; canonical keyed resource swap; selector equality;
batched publication; SSR server snapshot and client hydrate; no implicit
loading/error suspension; cleanup/finalizer once.
Add Launch Workspace bootstrap success/failure/hydration/disposal, zero runtime
creation during render, stable server/client fallback, Offscreen retain/unmount,
two roots sharing one runtime, HMR-compatible rerender and incompatible explicit
replacement, and RSC/root entry environment-boundary fixtures.

Reference reading — ideas/tests only:

- `docs/codebases/tanstack-query/packages/react-query/src/useBaseQuery.ts` and
  `docs/codebases/tanstack-query/packages/react-query/src/__tests__/useQuery.test.tsx`:
  extract stable external-store callbacks, the create-to-subscribe missed-update
  race, selector/batch behavior, and server snapshot cases. Do not copy
  render-time cache creation, fetching, optimistic mutation, Suspense, or the
  singleton notification manager.
- `docs/codebases/xstate/packages/xstate-react/src/useSelector.ts`,
  `docs/codebases/xstate/packages/xstate-react/src/useActorRef.ts`,
  `docs/codebases/xstate/packages/xstate-react/test/useSelector.test.tsx`,
  `docs/codebases/xstate/packages/xstate-react/test/useActorRef.test.tsx`, and
  `docs/codebases/xstate/packages/xstate-react/test/useActor.test.tsx`: extract
  selector equality, Strict Mode, changing logic/config, closure freshness, and
  rerender-count cases.
  `docs/codebases/xstate/packages/xstate-react/src/stopRootWithRehydration.ts` is
  an anti-reference: never stop and then mutate private actor/system fields to
  resurrect ownership.

These references do not override the stricter binding rule above: React render
may create only the approved inert snapshot, performs no runtime mutation, and
the provider never disposes a caller-owned runtime.

Commands: `F(packages/flow-state/src/react/provider.test.ts
packages/flow-state/src/react/use-actor.test.ts
packages/flow-state/src/react/use-resource.test.ts
packages/flow-state/src/react/use-view.test.ts
packages/flow-state/src/react/use-source.test.ts
examples/launch-workspace/src/launchWorkspaceShell.test.tsx)`, `T`, `P`, `E`, `C`.

### `P4B.2` Preferred `useActor` alias and packed inference (`CV-1`)

- [ ] Complete `CV-1`: export/prefer `useActor` while retaining `use` as the same
      implementation and typed compatibility alias.

Use the CV-1 detail in
[Phase 0 compatibility vocabulary](./PHASE_0.md#approved-compatibility-vocabulary-tasks).
Run the packed React 18 and React 19 commands captured
by P0.1 in addition to the focused hook tests.

### Phase 4B closure

- [ ] React differential/lifecycle/inference matrix passes.
- [ ] No React-owned runtime/cache/lease/interpreter remains.
- [ ] BUG-11/12/23/24/45 are closed and both actor-hook names are one function/type path.
- [ ] Packed React 18 and 19 consumers pass against built package entry points.

---

## Phase 4C — Server and durable boundaries

### `P4C.1` Versioned unknown decode and atomic runtime hydration

- [ ] Decode boot/hydration/snapshot input from `unknown` at the entry boundary.
- [ ] Reject wrong version/app/machine/actor/resource/schema atomically with no partial mutation.
- [ ] Preserve generations, pending ownership, and only serializable facts.
- [ ] Preserve valid v1 payload acceptance and default v1 emission; prepare a
      separately approved format packet if complete durable ownership needs new fields.
- [ ] Make repeated identical hydration idempotent with zero duplicate publication;
      reject a payload that conflicts with newer/live state unless an explicit
      future replacement policy is approved.
- [ ] Enforce P0.6 payload depth/size/count limits and reject prototype-like keys.
- [ ] Close BUG-49: dehydrate is an observationally pure read behind one declared
      cross-owner barrier and captures a coherent actor/resource logical cut.
- [ ] Apply DEC-20 strict known fields plus explicit `extensions`, reject newer/
      mixed nested versions and duplicate semantic IDs, and never invoke accessors,
      coercion, `toJSON`, or client equality while decoding.

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
- Hydration acquires one runtime-owned attachment barrier. Actor start/resource
  observation touching the same owners cannot interleave. A conflict with active
  or newer state rejects the complete payload; incoming v1 never silently wins.

Tests: non-object/null/truncated payload; wrong/unsupported version; valid v1;
v1 round-trip; duplicate actor/ref; wrong app/machine/actor at attachment; invalid resource
value; one bad entry among valid entries causes zero mutation; generation and
pending ownership round-trip; nonserializable fact excluded; decode diagnostics
are typed/stable; actual JSON stringify/parse; repeated-idempotent hydrate;
newer/live conflict; concurrent observe/start conflict; prototype key and bounded
depth/string/array/count fuzz; immutable decoded containers; unknown field except
explicit `extensions`; newer and mixed nested versions; duplicate semantic IDs;
accessor/getter/proxy/`toJSON`/coercion sentinels execute zero client code; one
coherent dehydrate actor/resource cut; dehydrate emits no facts or work.

Execution split: `P4C.1a` owns decoder/version/limits and produces a complete
immutable decoded value. `P4C.1b` owns atomic owner attachment/conflict handling.
Neither packet invents v2 or combines timer wire redesign with decoder hardening.

Reference reading — ideas/tests only:

- `docs/codebases/tanstack-query/packages/query-core/src/hydration.ts` and
  `docs/codebases/tanstack-query/packages/query-core/src/__tests__/hydration.test.tsx`:
  extract real JSON round-trip, repeated hydrate, older/newer conflict, and
  active-work preservation cases. Do not copy permissive casts, trusted payload
  hashes, `Date.now`, optional-field state, or mutation while iterating an
  only-partially-validated payload.
- `docs/codebases/tanstack-query/packages/react-query/src/HydrationBoundary.tsx`
  and
  `docs/codebases/tanstack-query/packages/react-query/src/__tests__/HydrationBoundary.test.tsx`:
  use aborted-transition cases as proof that speculative render must not mutate
  current owners; do not copy render-time hydration.
- `docs/codebases/xstate/packages/core/test/rehydration.test.ts`: add restore
  cases for completed-work non-replay and exact active child generations, while
  retaining Flow State's wire format, decoder, and attachment policy.

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
- [ ] BUG-9 is closed; failed hydration produces no notification and preserves
      observable snapshots plus owner revision/generation counters.
- [ ] Valid v1 compatibility and attachment-time ownership proof are both tested.
- [ ] BUG-49 is closed; dehydrate is a pure coherent logical cut and no durable
      storage/process-crash guarantee is implied.
- [ ] No unapproved payload version or unversioned durable field was introduced.

---

## Phase 4D — Inspection and CLI projections

### `P4D.1` Pure metadata and production-evidence inspection

- [ ] Derive graph, trace, receipts, issues, coverage, and pending work from
      production facts and pure ownership metadata.
- [ ] Keep declared/static/snapshot/runtime/mounted evidence levels distinct.
- [ ] Remove duplicate gateways, walkers, evidence builders, and formatters after parity.
- [ ] Close BUG-10: never execute callbacks with fabricated values to infer metadata.
- [ ] Consume the post-commit isolated fact stream from P1D.3; inspection cannot
      synchronously participate in or veto semantic publication.

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

Reference reading — vocabulary/tests only: inspect
`docs/codebases/xstate/packages/core/src/inspection.ts` and
`docs/codebases/xstate/packages/core/test/inspect.test.ts` for distinct
actor/event/transition/microstep/action/snapshot fact categories and
lifecycle-order test shapes. Do not copy event objects, live actor references,
unbounded payloads, or synchronous inspection delivery. Flow State's
declared/static/snapshot/runtime/mounted evidence levels, redaction, bounds, and
post-commit fact stream remain binding.

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
