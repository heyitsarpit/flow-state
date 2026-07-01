# Core And React De-Sloppify Backlog

This file is a focused cleanup backlog for the core and React surfaces in
`packages/flow-state/src`.

It complements:

- [DE_SLOPPIFY_OPPORTUNITIES.md](/Users/arpit/Developer/flow-state/DE_SLOPPIFY_OPPORTUNITIES.md)
- [INSPECT.md](/Users/arpit/Developer/flow-state/INSPECT.md)
- [TESTING.md](/Users/arpit/Developer/flow-state/TESTING.md)

This audit is based on direct code reads, focused verification runs, and
parallel subagent passes over the core and React lanes.

## Scope

Included:

- core runtime and public API shape
- module/app/resource/runtime seams
- React provider/hooks/source layer
- naming drift, wrapper ceremony, and type slop

Excluded:

- docs-site rewrites
- broad inspect expansion details already tracked in `INSPECT.md`
- testing-package expansion details already tracked in `TESTING.md`
- broad package/file-layout reorganization already tracked in
  `SRC_REORGANIZATION_BACKLOG.md`

Decision locks for this backlog:

- Treat this file as contract-honesty cleanup only, not a broad refactor or
  tree-reorganization plan.
- Collapse public surface assembly toward named ESM exports on every public
  route instead of exporting frozen namespace objects.
- Namespace aliases are chosen by the user at import sites, not by the package.
  Examples:
  - `import * as flow from "@flow-state/core"`
  - `import * as hooks from "@flow-state/react"`
  - `import * as inspect from "@flow-state/inspect"`
  - `import * as test from "@flow-state/testing"`
- The React entrypoint should stop exporting a second public `flow` object and
  instead expose named React exports that work with either namespace imports or
  direct named imports.
- Priority order for P0 core work:
  1. honest serializable resource-ref contract
  2. one canonical actor start path and snapshot reader
- Priority order for P0 React work:
  1. honest `flow.use(...)` semantics
  2. honest provider/runtime typing boundary
- Canonical API decisions:
  - actor start path: `runtime.orchestrators.start(...)`
  - actor snapshot reader: `snapshot()`
  - React hook rename target for `flow.use(...)`: `useActor(...)`
  - resource identity: strict serializable key parts with deterministic key
    equality; do not rely on object identity or custom `Equal`/`Hash` contracts
  - delete `createRuntime`
  - delete the rest-arg `flow.app(...)` form; keep `flow.app({ modules })`
  - delete the factory `flow.module(id, () => inventory)` form; keep
    `flow.module(id, inventory)`
  - delete `flow.persist(...)`
  - delete `flow.permission(...)`
  - keep `flow.outcomes(...)`

## Verification

Focused proof run:

```sh
pnpm exec vitest run \
  packages/flow-state/src/public-api-types.test.ts \
  packages/flow-state/src/react/provider.test.ts \
  packages/flow-state/src/react/use-actor.test.ts \
  packages/flow-state/src/react/use-resource.test.ts \
  packages/flow-state/src/react/use-view.test.ts \
  packages/flow-state/src/react-architecture.test.ts
```

Result: `6` files passed, `34` tests passed.

## P0 Core Fixes

Work this list in the priority order above unless a blocking proof run forces a
small reorder.

- [ ] Split serializable resource addresses from runtime-only executable refs.
      Receipts:
      [resource.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/descriptors/resource.ts:75)
      injects hidden `__runtime` metadata,
      [resource-store-memory.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/store/resource-store-memory.ts:409)
      hard-depends on it, and
      [diagnostics.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/diagnostics.ts:382)
      explicitly says serialized or hand-written refs are invalid.
      Why: the public ref shape currently looks like plain data while secretly being
      an executable runtime handle. That is the wrong contract for hydration,
      preload, and server work.

- [ ] Pick one canonical actor start API and one canonical snapshot reader.
      Receipts:
      [app-types.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/public/app-types.ts:244)
      exposes `runtime.orchestrators.start(...)`,
      [app-types.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/public/app-types.ts:261)
      also exposes `runtime.createActor(...)`,
      [contract-runtime.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/runtime/contract-runtime.ts:243)
      implements `createActor(...)` as a wrapper around the same start path, and
      [app-types.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/public/app-types.ts:164)
      keeps both `snapshot()` and `getSnapshot()` on `FlowActor`.
      Why: this looks like compatibility residue, not distinct concepts.
      Decision lock:
      keep `runtime.orchestrators.start(...)` and `snapshot()`.

- [ ] Delete `createRuntime` from the public contract and migrate call sites to
      `flow.runtime(...)` or purpose-built test/runtime helpers.
      Receipts:
      [index.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/index.ts:3)
      exports it publicly, while the docs already position it as the weaker path
      in
      [api.md](/Users/arpit/Developer/flow-state/apps/docs/src/pages/reference/api.md:56).
      Why: it is a competing runtime entrypoint, not a complementary one.

- [ ] Expand and tighten `runtime.resources`.
      Receipts:
      [services/resource-store.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/services/resource-store.ts:13)
      already has `ensure`, `refresh`, and `invalidate`, while
      [app-types.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/public/app-types.ts:181)
      only exposes `seedResources`, `hydrate`, `dehydrate`, `subscribe`, `patch`,
      and `get`.
      [app-types.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/public/app-types.ts:188)
      also erases `patch(...)` to `Record<string, unknown>`.
      Why: the imperative runtime resource surface is thinnest exactly where the
      server/preload contract needs to be clearest.

- [ ] Normalize resource vocabulary and retire visible `query:*` drift.
      Receipts:
      [DE_SLOPPIFY_OPPORTUNITIES.md](/Users/arpit/Developer/flow-state/DE_SLOPPIFY_OPPORTUNITIES.md)
      already flags this, and the test harness still exposes
      [app-types.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/public/app-types.ts:271)
      `cache().query(...)`.
      Why: public authoring says `resource`, while runtime/debug/test seams still
      leak older `query` terminology.

- [ ] Choose one durable `flow.app(...)` authoring form and one honest
      `flow.module(...)` default.
      Receipts:
      [flow-core.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/public/flow-core.ts:110)
      supports both `flow.app({ modules })` and `flow.app(moduleA, moduleB, ...)`,
      and
      [module.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/descriptors/module.ts:7)
      eagerly executes the `flow.module(..., () => inventory)` factory form.
      Why: both features add explanation cost without enough runtime payoff today.
      Decision lock:
      keep `flow.app({ modules })` and `flow.module(id, inventory)`.

- [ ] Quarantine or delete descriptor-only exports that are not yet paying rent.
      Candidates:
      `flow.persist(...)`, `flow.permission(...)`, `flow.outcomes(...)`, and inert
      inspect option bags.
      Receipts:
      [flow-core.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/public/flow-core.ts:195),
      [public/inspect.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/public/inspect.ts:20).
      Why: these shapes currently look more first-class than their runtime/tooling
      proof justifies.
      Decision lock:
      delete `flow.persist(...)` and `flow.permission(...)`; keep
      `flow.outcomes(...)` for now.

## P0 React Fixes

Work the first two items before the smaller ergonomics follow-ups.

- [ ] Rename or redesign `flow.use(...)` so the shell-first actor contract is
      explicit.
      Receipts:
      [use-actor.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/react/use-actor.ts:19)
      creates a no-op shell actor,
      [use-actor.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/react/use-actor.ts:116)
      swaps to the live actor in `useLayoutEffect(...)`, and
      [views-react.md](/Users/arpit/Developer/flow-state/apps/docs/src/pages/reference/views-react.md:40)
      has to explain this behavior explicitly.
      Why: `flow.use(...)` sounds like "you now have a live actor," but the first
      render contract is weaker than that.
      Decision lock:
      rename toward `useActor(...)` rather than keeping the generic `use(...)`
      name.

- [ ] Fix the provider/runtime typing truth instead of relying on a cast.
      Receipts:
      [provider.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/react/provider.ts:7)
      requires a full `FlowRuntime`,
      [context.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/react/context.ts:9)
      stores only a `FlowRuntimeTransport`, and
      [use-runtime.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/react/use-runtime.ts:7)
      casts that transport back to `FlowRuntime`.
      Why: the runtime/provider boundary should be structurally honest.

- [ ] Decide key identity policy before freezing `useResource(...)` semantics.
      Receipts:
      [use-resource.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/react/use-resource.ts:16)
      compares ref keys with `Object.is(...)`, while
      [TODO.md](/Users/arpit/Developer/flow-state/TODO.md:198)
      still lists key identity and collision policy as open work.
      Why: object-shaped params are otherwise a likely resubscribe/churn footgun.
      Decision lock:
      require strict serializable key parts and deterministic key equality;
      do not rely on object identity or custom equality protocols.

- [ ] Add a first-class component-owned load/runtime story.
      Receipts:
      [use-resource.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/react/use-resource.ts:34)
      only reads/subscribes,
      [app-types.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/public/app-types.ts:181)
      does not expose `ensure`/`refresh`/`invalidate` on `runtime.resources`, and
      [TODO.md](/Users/arpit/Developer/flow-state/TODO.md:206)
      still says "A component can read a resource directly without starting a
      flow" as unfinished.
      Why: React currently has a read story, but not a fully explicit component
      preload/load story.

- [ ] Reduce React namespace forwarding drift.
      Receipts:
      [react-entry.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/react-entry.ts:1)
      exports another `flow` object, and
      [public/flow.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/public/flow.ts:15)
      mostly forwards to hook wrappers.
      Why: root, server, and React all export a `flow` namespace, which makes the
      package topology and mental model noisier than necessary.
      Decision lock:
      remove the React `flow` namespace export in favor of named React exports.

- [ ] Add a selector-grade React surface between raw snapshots and authored
      views.
      Receipts:
      [use-view.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/react/use-view.ts:8)
      only offers `useView(actor, view, equal?)`, while
      [selected-source.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/store/selected-source.ts:9)
      already contains reusable selector machinery.
      Why: the current ergonomics are too binary: either raw snapshots or full view
      descriptors.

## P1 Follow-Ups

- [ ] Split public type ownership more aggressively.
      Receipts:
      [app-types.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/public/app-types.ts),
      [data-types.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/public/data-types.ts),
      and
      [machine-types.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/public/machine-types.ts)
      are still large shared type buckets.

- [ ] Keep testing cleanup in sync with the core package cleanup.
      Receipts:
      [testing/flow-test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/testing/flow-test.ts:1958)
      and
      [app-types.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/public/app-types.ts:355)
      still encode the double-start builder and `provide(service: unknown)` drift.
      Track the concrete redesign in [TESTING.md](/Users/arpit/Developer/flow-state/TESTING.md).

- [ ] Keep inspect cleanup in sync with the core package cleanup.
      Receipts:
      [public/inspect.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/public/inspect.ts:12)
      is still descriptor-first and thin.
      Track the concrete redesign in [INSPECT.md](/Users/arpit/Developer/flow-state/INSPECT.md).

## Exit Criteria

- One obvious runtime start path.
- One honest resource-ref contract.
- One explicit React actor-ownership story.
- One settled key-identity policy.
- No public cast-based runtime/provider lie.
- No user-facing `query` drift where the product concept is `resource`.
- No first-class export that is only placeholder ceremony.
