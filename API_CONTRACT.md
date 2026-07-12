# Flow State API Cutover Contract

Status: active contract for the correctness and consolidation plan.

## Purpose

Preserve the recognizable Launch Workspace API while cutting over legacy aliases
to the selected public surface. The project is not performing another broad API
redesign.

The concrete reference is the checked-in `examples/launch-workspace` tree at
commit `ec75535d0cd0fddaf95cff86073bd81de39652d1`, especially:

- `examples/launch-workspace/API_INVENTORY.md`
- `examples/launch-workspace/src/launchWorkspace.ts`
- `examples/launch-workspace/src/launchWorkspace.test.ts`
- `examples/launch-workspace/src/launchWorkspaceShell.tsx`

The example is a cutover and pressure-test surface. Its supported call shapes are
preserved by default; legacy aliases are migrated or rejected in their owning
slice, and partial or contract-only runtime claims remain work to complete rather
than API behavior to pretend already exists.

## Cutover policy

An implementation change is allowed without further API approval when it:

- fixes incorrect behavior behind an existing public call;
- consolidates duplicate internal owners without changing observable behavior;
- improves inference for existing valid calls;
- narrows invalid callback inputs while keeping valid calls source-compatible;
- makes Schema optional for local execution while preserving existing
  Schema-bearing calls;
- adds typed diagnostics for invalid durable/foreign data;
- migrates callers from a named legacy alias to the approved surviving surface
  in that alias's owning slice.

## Inference direction

Inference follows authored data flow from inputs to consumers. A downstream
execution callback must not infer, redefine, or widen the input contract that it
consumes.

- A resource's declared parameter tuple/type informs `key`, `lookup`, `tags`,
  `placeholder`, and `ref`. The `lookup` callback may infer only its Effect
  success, failure, and requirements.
- A transaction's `params` selector or explicitly declared Params type informs
  `commit`, `preview`, `invalidates`, concurrency keys, and routes. `commit` may
  infer only success, failure, and Effect requirements.
- A stream's `params` selector or explicitly declared Params type informs
  `subscribe` and routes. `subscribe` may infer only emitted value, failure, and
  Effect/Stream requirements.
- A machine's context, event, and state contract informs guards, updates,
  targets, params selectors, and routes. A callback cannot widen those upstream
  types because its implementation happens to accept something broader.
- A child binding preserves the exact child machine type and supervision policy
  available through the current `flow.child` helper. Child input selectors,
  outcome routes, and independent child output/failure propagation are future
  additive API work, not part of the active cutover floor.
- A view's declared sources/input inform `select`; the selector return value may
  infer the view output.

Type errors should be reported at the incompatible downstream callback. They
must not cause upstream Params, Context, Event, or Input to widen to `unknown`,
`any`, a larger union, or a type inferred from the callback implementation.

User approval and a migration entry are required when a change:

- removes or renames a public value, type, field, import path, or call form;
- changes when work starts, stops, retries, routes, suspends, or cleans up;
- changes error, interruption, snapshot, hydration, or serialization behavior
  in a way existing clients can observe;
- introduces a new required argument, wrapper, schema, identity, graph, or Layer;
- turns a previously accepted call into a compile error for reasons other than a
  demonstrated unsoundness.

## Package and import paths to preserve

- `flow-state` for core definitions, runtime creation, and pure helpers.
- `flow-state/react` for `FlowProvider` and React hooks.
- `flow-state/testing` for test builders and deterministic fixtures.
- `flow-state/inspect` for named inspection and trace helpers.
- `flow-state/server` for request-scoped boot/hydration helpers.

Moving internals between source files or packages is allowed. Existing public
imports in the cutover contract must continue to work. Legacy alias imports are
removed or rejected only in their owning migration slice.

Effect may remain a peer dependency, and public results may expose useful Effect
types such as `Effect`, `Stream`, `Option`, or `Exit`. Consumers should not need
to import `Schema` unless they opt into runtime validation or cross an encoded
boundary.

## Core authoring shapes to preserve

| Surface                                                                               | Preserved job and call shape                                 | Permitted change                                                                                                                               |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `createKey(...)`                                                                      | Stable resource-instance key                                 | Canonicalize encoding internally; preserve accepted inputs                                                                                     |
| `createTag(id)`                                                                       | Reusable invalidation tag without required Schema            | Keep any Schema overload optional; reject incompatible same-ID definitions                                                                     |
| `flow.resource({ id, key, lookup, tags, placeholder, freshness })`                    | Canonical shared data definition                             | Declared params flow into callbacks; lookup infers only Effect output/error/requirements                                                       |
| `resource.ref(params...)`                                                             | Typed resource-instance reference                            | Make this the canonical internal identity; remove ambiguous internal ID fallback after migration                                               |
| `flow.transaction({ id, params, commit, preview, invalidates, routes, concurrency })` | Typed write definition                                       | Params flow into commit and related callbacks; commit infers only Effect output/error/requirements                                             |
| `flow.outcomes({ success, failure })`                                                 | Typed outcome-to-event mapping                               | Keep as supported API; improve inference; reconsider only through a separate deprecation                                                       |
| `flow.machine({ id, initial, context, states })`                                      | Workflow definition                                          | Preserve object and generic forms; improve inference without a new DSL                                                                         |
| `flow.ensure(...)`                                                                    | Ensure a resource is available while owned                   | Preserve until distinct lifecycle behavior is proved and documented                                                                            |
| `flow.observe(...)`                                                                   | Observe a resource while the owning state is active          | Preserve; do not merge with ensure if subscription lifetime differs                                                                            |
| `flow.refresh(...)`                                                                   | Force resource revalidation                                  | Preserve; share internal resource execution                                                                                                    |
| transition `submit`                                                                   | Start a transaction because an event transition was accepted | Preserve event-owned semantics                                                                                                                 |
| `flow.run(...)`                                                                       | Run a transaction as state-owned work                        | Preserve entry/state-owned semantics; share the transaction runner                                                                             |
| `flow.patch(...)`                                                                     | Explicit resource patch command                              | Preserve while auditing overlap with transaction preview                                                                                       |
| `flow.invalidate(...)`                                                                | Explicit state-owned invalidation command                    | Preserve while auditing overlap with transaction invalidation                                                                                  |
| `flow.stream({ id, params, subscribe, pressure, routes })`                            | State-owned Effect Stream work                               | Params flow into subscribe; subscribe infers only Stream output/error/requirements                                                             |
| `flow.after({ id, delay, target })`                                                   | Delayed transition                                           | Keep helper and string durations as the supported timer API                                                                                    |
| `flow.child({ id, machine, supervision? })`                                           | Supervised child workflow                                    | Preserve helper and current machine/supervision typing; future child input/routes/output/failure require a separately approved additive packet |
| `flow.can(snapshot, event)`                                                           | Pure accepted-event query                                    | Preserve and ensure it agrees with actual dispatch                                                                                             |
| `flow.view({ id, sources, select })`                                                  | Optional reusable multi-source projection                    | Preserve; do not require views for ordinary rendering                                                                                          |
| `selectView(...)`                                                                     | Evaluate a view outside React                                | Preserve while determining whether it remains public or becomes a documented low-level helper                                                  |
| `flow.module(...)`                                                                    | Group definitions and ownership metadata                     | Preserve existing valid call forms; document one preferred form if equivalent forms exist                                                      |
| `flow.app({ modules })`                                                               | Compose modules and validate ownership                       | Preserve; internal ownership representation is not a mandatory public AppGraph API                                                             |
| `App.layer(...)`                                                                      | Install live/test services and configuration                 | Preserve Layer inference and Effect requirements                                                                                               |
| `flow.store.memory/test()`                                                            | Resource-store presets                                       | Preserve initially; presets must not contain alternate semantics                                                                               |
| `flow.orchestrators.live/test()`                                                      | Actor-runtime presets                                        | Preserve initially; live/test must drive the same actor implementation                                                                         |
| `flow.runtime(App.layer(...))`                                                        | Create the canonical host runtime                            | Preserve and make it the sole semantic runtime owner                                                                                           |

Representative local authoring must continue to work without Schema:

```ts
const project = flow.resource<[ProjectId], Project>({
  id: "project",
  key: (id) => createKey("project", id),
  lookup: (id) => loadProject(id),
});

const saveProject = flow.transaction({
  id: "save-project",
  params: ({ context }) => context.draft,
  commit: (draft) => save(draft),
});

const editor = flow.machine<EditorContext, EditorEvent, EditorState>({
  id: "editor",
  initial: "idle",
  context: createEditorContext,
  states: {
    /* existing state grammar */
  },
});
```

Existing Schema-bearing calls may remain valid for runtime validation. Schema
must not be moved into a new required `codecs` container.

## Runtime and adapter surfaces to preserve

| Surface                       | Cutover promise                                                 | Intended internal change                                                 |
| ----------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `runtime.resources`           | Preserve typed seed/read/patch/subscribe/hydration capabilities | One canonical resource store and identity model                          |
| `runtime.orchestrators`       | Preserve actor start/get/stop/snapshot capabilities             | One actor runtime and lifecycle registry                                 |
| `FlowProvider`                | Preserve provider boundary accepting a runtime                  | Provider does not create a parallel interpreter                          |
| `useActor(...)`               | Supported actor hook                                            | Use production actor ownership and render-safe subscription              |
| legacy `use(...)`             | Removed in the P4B.2 cutover                                    | Existing callers migrate to `useActor`; no second hook remains           |
| `useResource(...)`            | Preserve typed resource-ref hook                                | Subscribe to canonical resource store                                    |
| `useView(...)`                | Preserve optional projection hook                               | Reuse runtime facts and one signal/subscription owner                    |
| testing entrypoint            | One supported test builder after the owning cutover             | Delegate to production runtime test controls                             |
| legacy testing aliases        | Removed after caller migration                                  | No duplicate test engine or legacy wrapper remains                       |
| `createControlledStream(...)` | Preserve deterministic stream fixture                           | Control production Stream ownership, not a test interpreter              |
| inspection helpers            | Preserve named graph/trace/analysis helpers                     | Derive from production facts and pure metadata                           |
| server boot helpers           | Preserve request-scoped boot/hydration calls                    | Validate only serialized boundary values and keep request Scope isolated |

## Approved minor behavioral/API improvements

These are goals, not permission to break valid existing calls:

- Directional inference from authored inputs into their consuming callbacks,
  with outputs/errors/requirements inferred from returned Effects and Streams.
- Family-specific callback inputs instead of universal runtime bags.
- Optional schemas for runtime validation and serialization boundaries.
- Canonical typed resource references with no ambiguous internal ID-only lookup.
- One runtime implementation shared by live and deterministic presets.
- One internal transaction runner shared by `submit` and `flow.run`.
- One internal resource command path shared by ensure/observe/refresh/patch/
  invalidate while preserving their distinct public lifecycle jobs.
- One testing implementation behind existing testing entry points.
- One preferred documentation form for equivalent module/app/test call forms,
  with legacy aliases removed after their owning caller migration.
- Typed failures for invalid snapshot, hydration, ownership, or missing boundary
  validation instead of assertions or silent fallback.
- Cut over to `useActor` and remove legacy `use`.
- Cut over to `getSnapshot()` and remove legacy `snapshot()`.
- Use Story for authored/CLI concepts and Scenario for executed result/report types.
- Preserve `transaction`, `params`, `commit`, `preview`, `resource:*`, and
  `transaction:*` as canonical write/resource vocabulary.

## Explicitly not selected

- A required public `codecs` object.
- A separate type-first constructor family.
- `MachineTypes` or another mandatory type-spec wrapper.
- `bind(App)` as the sole React API.
- A mandatory public AppGraph node/edge grammar.
- A fixed constructor-count target.
- Public renaming of orchestrators to `ActorSystem` during this work.
- Removing `flow.run`, `flow.after`, `flow.child`, `flow.patch`,
  `flow.invalidate`, or supported module/app forms without an owning cutover.
- Reintroducing historical `flow.query` or `flow.mutation`; `transaction` remains
  the write term.

## Migration ledger

The following cutovers are approved by the task plan and must be executed in
their owning slices, with caller/docs migration and positive/negative proof.

| Candidate                         | Current decision                  | Cutover requirement                                                                                                        |
| --------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Schema-free authoring             | Preserve/improve                  | Existing Schema-bearing calls remain valid                                                                                 |
| Narrow callback inputs            | Improve source-compatibly         | All valid Launch Workspace callbacks compile; newly rejected access must be demonstrably unsound                           |
| Resource ID-only fallback         | Remove internally                 | Migrate internal callers to typed refs; do not keep ambiguous fallback as a parallel owner                                 |
| `use` to `useActor`               | Approved cutover                  | `useActor` is the surviving hook; migrate callers/docs and reject legacy `use` imports                                     |
| `snapshot()` to `getSnapshot()`   | Approved cutover                  | `getSnapshot()` is the surviving actor read; migrate callers/docs and reject legacy `snapshot()` calls                     |
| Story to Scenario for execution   | Approved cutover                  | Story remains authored/CLI; Scenario names executed outcomes/checks/reports; remove public Story execution aliases         |
| Transaction/resource receipts     | Preserve canonical vocabulary     | Keep transaction/params/commit/preview and `transaction:*`/`resource:*`; query/mutation/cache only in historical prose     |
| Testing entrypoint aliases        | Choose one supported entrypoint   | Migrate callers/docs to the selected test builder and remove duplicate public aliases                                      |
| Multiple `flow.module` call forms | Choose one documented form        | Migrate callers/docs to the selected form and remove unsupported overloads in the owning slice                             |
| Store/orchestrator presets        | Audit after runtime consolidation | Keep only presets that delegate to the canonical owners; remove duplicate semantic presets                                 |
| Helper overlap                    | Share internal owners             | Keep public helpers only when their lifecycle job remains distinct; delete wrappers that only preserve historical spelling |

Every future migration entry must name:

1. the concrete problem;
2. surviving public path;
3. affected callers and docs;
4. positive and negative parity evidence;
5. deprecation or removal release, if one exists;
6. rollback plan.
