# Flow State Client Structure Contract

Status: active client-organization contract.

## Purpose

Give consuming applications an understandable place for domain types, Effect
services, Flow definitions, app assembly, runtime creation, UI, server boot, and
tests without making filesystem layout part of runtime semantics.

The contract is semantic:

- a small client may use a few files;
- a normal client should organize by feature/domain;
- a large client may split each feature by definition kind;
- all layouts use the same public API and must produce the same runtime behavior.

Flow State must not discover ownership by scanning folders or require a generated
folder structure.

## Recommended normal layout

```text
src/
  domain/
    ids.ts
    models.ts
    errors.ts
  services/
    project-service.ts
    layers.ts
  features/
    project/
      resources.ts
      transactions.ts
      machine.ts
      views.ts
      module.ts
      project.test.ts
    approval/
      resources.ts
      transactions.ts
      machine.ts
      module.ts
      approval.test.ts
  app/
    app.ts
    layers.ts
    runtime.ts
    boot.ts
  ui/
    FlowRoot.tsx
    ProjectScreen.tsx
    ApprovalScreen.tsx
  server/
    request-runtime.ts
    hydration.ts
  testing/
    fixtures.ts
    test-layers.ts
    controlled-streams.ts
```

Names may change to match the product. The ownership boundaries and dependency
direction matter more than exact folder names.

## Responsibilities

### `domain/`

- Plain domain types, branded IDs, tagged errors, value constructors, and pure
  validation rules.
- May import Effect data/type utilities when valuable.
- Does not import React, runtime handles, CLI, or application assembly.
- Schema belongs here only when it validates a genuine domain or boundary value;
  local authoring does not require Schema.

### `services/`

- Effect service contracts, implementations, and Layers for external systems.
- Normalizes thrown Promise/SDK errors at the foreign boundary.
- Owns secrets/redaction and acquisition/release of external resources.
- Does not start Flow actors or maintain Flow resource caches.

### `features/<feature>/`

- Owns the feature's resources, transactions, machines, streams, views, and
  module declaration.
- Imports domain values and service contracts, not concrete live service wiring.
- Keeps related definitions close enough that routes, refs, ownership, and tests
  are discoverable.
- Exports a small feature surface, usually its module plus definitions that
  another feature legitimately references.
- Does not create a runtime or React provider.

### `app/`

- Composes feature modules with `flow.app`.
- Composes live/test Layers and Flow presets.
- Creates runtime factories for browser, request, worker, or tests.
- Owns boot/hydration wiring and app-level fixtures.
- Contains assembly, not feature business logic or UI rendering.

### `ui/`

- Owns React components and presentation-specific selectors.
- Receives a runtime through `FlowProvider` at an explicit client boundary.
- Uses actor/resource/view hooks to observe and send events.
- Does not directly invoke lookup, commit, stream subscription, timer, or child
  runtime internals.
- Local display state remains React state; canonical shared data remains a
  resource and workflow state remains a machine.

### `server/`

- Owns request-scoped runtime acquisition, boot payload creation, durable
  decoding/encoding, redaction, and finalization.
- Imports app assembly/runtime factories, not React client components.
- Must not keep request runtimes in a mutable module-global cache.

### `testing/`

- Owns reusable deterministic fixtures, test Layers, seed data, clocks, and
  controlled streams.
- Drives production actors and resource stores through public testing/runtime
  surfaces.
- Does not duplicate feature definitions or implement a test-only interpreter.

## Dependency direction

The normal import direction from hosts toward foundations is:

```text
UI / server / testing
  -> runtime factories
  -> app assembly and Layers
  -> feature definitions
  -> service contracts and domain
```

More precisely:

- Domain imports nothing from features, app, UI, server, or tests.
- Services may import domain; concrete service Layers do not import UI.
- Features may import domain, service contracts, and explicitly exported
  definitions from a declared dependency feature.
- Features do not import app assembly, runtime factories, UI, or server code.
- App assembly imports features and service Layers.
- UI and server import the app/runtime boundary and feature/domain types as
  needed; they do not deep-import runtime internals.
- Tests may import public feature/app surfaces and testing fixtures; production
  modules never import tests.
- Cross-feature imports must follow declared module dependencies and avoid
  circular barrel exports.

## Layout sizes

### Small client

Appropriate for one machine or one feature:

```text
src/
  flow.ts
  runtime.ts
  App.tsx
  flow.test.ts
```

It may colocate resources, transactions, machine, module, and app in `flow.ts`.
It must still keep runtime creation and React rendering conceptually separate.

### Normal client

Use the recommended feature-folder layout. This is the default documentation
shape because it makes ownership visible without excessive files.

### Large client

Split a feature only when file size, ownership, or independent testing requires
it:

```text
features/project/
  domain/
  resources/
  transactions/
  machines/
  streams/
  views/
  module.ts
  index.ts
```

Large layout may add subfeatures and explicit dependency boundaries. It may not
change public Flow State calls, runtime semantics, identities, or evidence simply
because definitions moved files.

## Colocation rules

- Keep a descriptor and its focused behavior tests near each other.
- Keep route/event types close to the machine or transaction that owns them.
- Keep live and test service implementations beside the service contract or in
  a clearly named Layers file.
- Keep reusable domain errors in `domain/`; do not redefine structurally similar
  error objects in each adapter.
- Keep app assembly explicit in one discoverable place.
- Keep the React client boundary and server request boundary explicit.
- Prefer feature-owned names over phase/run/migration names in durable files.

## Barrels and exports

- Feature barrels expose only the intentional client surface.
- Avoid wildcard barrels that create cycles or make ownership invisible.
- Do not re-export private runtime internals through client features.
- Package imports use `flow-state`, `flow-state/react`, `flow-state/testing`,
  `flow-state/inspect`, and `flow-state/server` according to their jobs.
- A client example must not import `packages/flow-state/src/...` or another
  private repository path.

## Disallowed structures

- A global `utils.ts` containing runtime, identity, Effect, formatting, and test
  behavior with no semantic owner.
- One monolithic assembly file containing domain models, services, definitions,
  runtime creation, React UI, and tests.
- A separate copy of resources or machines for tests, stories, or CLI.
- React hooks that call service implementations directly and bypass declared
  resources/transactions when those are the canonical owners.
- Feature modules that create their own global runtime.
- Server modules that import client components to reach runtime state.
- Folder-name reflection used to infer module identity or runtime ownership.
- Generated folders that clients must hand-edit.
- Deep imports into Flow State implementation files.
- Architecture names such as `phase-2`, `selected`, `migration-ir`, or `run-10`
  in durable product files after the migration is complete.

## Launch Workspace migration guidance

The current Launch Workspace uses several top-level `launchWorkspace*.ts` files.
That layout remains a valid compatibility fixture and should not be reorganized
before runtime correctness work.

During final cleanup, reorganize only when it materially improves ownership:

- domain models and errors may move to `domain/`;
- Effect services and Layers may move to `services/`;
- Project, Approval, Assistant, Chat, Assets, and other definitions may move to
  feature folders;
- app/module/runtime assembly may move to `app/`;
- React components may move to `ui/`;
- request boot/hydration may move to `server/`;
- deterministic fixtures may move to `testing/`.

The migration must preserve imports exposed by the package, descriptor IDs,
resource keys, actor IDs, snapshot compatibility decisions, tests, and runtime
behavior. Move files after behavior is green, not while diagnosing semantics.

## Structure verification

- Small, normal, and large fixtures compile using the same public API.
- Moving a feature between valid layouts does not change descriptor identity,
  actor behavior, resource identity, snapshots, receipts, or inspection output.
- Dependency-cycle checks reject invalid cross-feature/app/UI imports.
- Package-hygiene tests reject private deep imports.
- React and server boundaries remain explicit.
- Tests use production definitions and runtime owners.
- Any exception is documented with the reason the standard ownership boundary
  does not fit.
