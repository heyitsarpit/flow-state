# Ownership And Runtime Facts

If you are asking "why do `flow.module`, `flow.app`, and `App.layer` exist at
all?", the short answer is:

- they are not the smallest productive Flow State slice
- they do buy a few real things today
- some of their metadata is still mostly descriptive

The smallest useful slice is still usually:

- `flow.resource`
- `flow.transaction`
- `flow.machine`
- `flow.runtime(App.layer(...))`

Add `flow.module` and `flow.app` when you want inventory, fixture seeding,
typed module lookup, one runtime assembly boundary, or app-scoped actor
ownership.

## What Pays Rent Today

| Surface            | Real payoff today                                                                                    | What to stay skeptical about                       |
| ------------------ | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `flow.module(...)` | Named inventory, fixture validation, fixture seeding, module namespace                               | Metadata is partly tooling-facing today            |
| `flow.app(...)`    | Typed `moduleMap`, app inventory, duplicate module ids, duplicate resource ids, app-scoped actor ids | It does not broadly validate every descriptor kind |
| `App.layer(...)`   | One place to install ResourceStore, OrchestratorSystem, inspection, and services                     | The installer space is intentionally small         |

## Receipt 1: `flow.module` Is Value-Based

The second argument is a plain inventory object:

```ts
const Project = flow.module("Project", {
  resources: { byId: projectResource },
  machines: { editor: editorMachine },
});
```

Today the factory form is not lazy. It is called once, immediately, when the
module is created.

```sh
cd packages/flow-state
node scripts/module-app-audit-receipts.mjs
```

```json
{
  "factoryRuns": 1
}
```

That means the function form is currently grouping syntax, not deferred loading.
If the object form is clear enough, prefer it.

## Receipt 2: What The Third Argument Actually Changes

From the same runnable receipt:

```json
{
  "moduleInventory": {
    "name": "Project",
    "resources": ["byId"],
    "machines": ["editor"],
    "views": ["summary"],
    "dependencies": ["Session"],
    "screens": ["Editor"],
    "fixtures": ["projectSeed"],
    "tags": ["project"],
    "permissions": ["project:write"]
  },
  "appInventory": {
    "viewsByScreen": [
      {
        "screen": "Editor",
        "module": "Project",
        "name": "summary"
      }
    ],
    "fixtures": [
      {
        "module": "Project",
        "name": "projectSeed"
      }
    ]
  }
}
```

Here is the real payoff by field:

| Field          | What it does today                                                                          | Verdict           |
| -------------- | ------------------------------------------------------------------------------------------- | ----------------- |
| `fixtures`     | Validates the local fixture registry and powers `flowTest.app(...).seedModuleFixtures(...)` | Real              |
| `screens`      | Feeds `app.inventory().viewsByScreen`                                                       | Real, but coarse  |
| `dependencies` | Copied into `module.inventory()`                                                            | Docs-only for now |
| `tags`         | Copied into `module.inventory()`                                                            | Docs-only for now |
| `permissions`  | Copied into `module.inventory()`                                                            | Docs-only for now |

The fixture path is the strongest concrete value:

```json
{
  "seededFixtureSnapshot": {
    "id": "audit.project",
    "status": "success",
    "value": {
      "id": "p-1",
      "name": "Seeded project"
    }
  }
}
```

That output came from:

- `flowTest.app(App).seedModuleFixtures("projectSeed")`
- a module-local `fixtures: { projectSeed: [...] }` registry
- a matching `meta.fixtures: ["projectSeed"]` declaration

If you remove the declaration or the registry entry, module creation or fixture
seeding fails.

Important limit: `flowTest.app(App)` is not required for ordinary
`seedResources(...)`. The app-backed harness mainly buys fixture-name
resolution and app inventory context.

## Receipt 3: What `flow.app(...)` Changes At Runtime

`flow.app(...)` matters most when ownership becomes visible in the runtime.

```json
{
  "bareActorId": "audit.editor-machine",
  "appActorId": "Project+Session/Project/editor"
}
```

That one naming change propagates into inspection and receipts:

```json
{
  "inspectionEvents": [
    {
      "type": "actor:start",
      "id": "Project+Session/Project/editor"
    },
    {
      "type": "machine:event",
      "id": "audit.editor-machine",
      "eventType": "ADVANCE",
      "targetActorId": "Project+Session/Project/editor",
      "correlationId": "Project+Session/Project/editor:event:1"
    },
    {
      "type": "actor:snapshot",
      "id": "Project+Session/Project/editor",
      "state": "ready"
    }
  ]
}
```

That is the main concrete runtime payoff today:

- predictable actor registry keys
- stable default top-level actor ids
- clearer inspection output
- clearer receipt correlation
- more stable child actor paths and rehydration keys

This is why `flow.app(...)` is more than naming ceremony, even though it is not
changing the underlying transition semantics.

## Receipt 4: Validation Is Narrower Than The Name Suggests

The same script also proves that app-level validation is currently selective:

```json
{
  "duplicateResourceError": "[FLOW-APP-006] Duplicate flow resource id: audit.duplicate-resource ...",
  "duplicateMachineAppId": "MachineAlpha+MachineBeta"
}
```

That means:

- duplicate module ids are rejected
- duplicate resource ids across modules are rejected
- duplicate machine ids across modules are currently allowed

So `flow.app(...)` is not yet broad cross-module contract validation. It is a
smaller surface than that.

## What Feels Worth Keeping

- `fixtures` because they produce real test-time savings and validation
- `App.layer(...)` because it is the cleanest runtime installation boundary
- app-scoped actor ownership because it shows up directly in runtime facts
- typed `moduleMap` because app code can stay explicit without hand-built maps

## What Feels Like Ceremony Right Now

- `dependencies`, `tags`, and `permissions` in the value pitch until they gain a
  real runtime or tooling consumer.
- `policies` being surfaced in module inventory even though it is not validated
  or used by the app harness path.

There is also one important shape caveat: `viewsByScreen` is built by pairing
every module view with every declared module screen. If a module has several
views and several screens, that inventory is a cross-product, not a precise
view-to-screen mapping.

## Simplification Candidates

1. Prefer the object form of `flow.module` in docs and examples unless the
   factory form is doing something concrete.
2. Narrow the docs pitch to what is real now: inventory, fixture seeding,
   `moduleMap`, app ownership, and `App.layer`.
3. Future-flag or remove `dependencies`, `tags`, and `permissions` from the
   strong current-value story until they have a consumer.
4. Either validate `policies` or stop presenting it as a first-class inventory
   surface.
5. Revisit the duplication between `fixtures: { ... }` and
   `meta.fixtures: [...]` if the shared-fixture-name pattern is not carrying
   enough weight.
6. Consider dropping one `flow.app` call form if the rest-arg and
   `{ modules }` overloads are not both pulling their weight.

## Read This Next

- [App Structure](/guide/app-structure)
- [Runtime](/reference/runtime)
- [Inspection](/reference/inspection)
- [Testing](/guide/testing)
