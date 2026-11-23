---
convention reusable-primitives
description A library ships a primitive as a factory that takes the app's contract and returns a machine or trait.
---
# Reusable primitives

**The rule:** a library ships a primitive as a factory, a function that takes the app's own contract and returns a
machine (or a trait); the library fixes the contract's input and error type, and the app maps its errors into it.

## When it applies

A menu, combobox or palette that runs an action the app chooses, per instance, and shows its pending state.

## Before and after

```ts
// BEFORE: one service per Runtime, dispatched by string, far from the menu
Layer.succeed(MenuActions, { run: ({ menu, item }) => (menu === "file" ? files.run(item) : edit.run(item)) })
```

```ts
// AFTER: the library
export class MenuActionFailed extends Schema.TaggedError<MenuActionFailed>()("MenuActionFailed", {
  reason: Schema.String,
}) {}

export const menu = <R>(config: {
  readonly id: string
  readonly act: Transaction<{ item: typeof Schema.String }, void, MenuActionFailed, R>
}) =>
  machine(
    definition({
      id: config.id,
      states: ["CLOSED", "OPEN"],
      events: { Open: {}, Choose: { item: Schema.String } },
      internalEvents: { Acted: { item: Schema.String }, Failed: { reason: Schema.String }, Unsure: Flow.uncertain({}) },
      props: { items: Schema.Array(Item).pipe(Schema.withDecodingDefaultKey(Effect.succeed([]))) }, // needs a default
      emits: { Focus: { target: Schema.Literal("trigger") } },
      operations: ({ E }) => ({
        act: config.act.outcomes({
          success: E.Acted.from((_v, { input }) => ({ item: input.item })),
          failure: { MenuActionFailed: E.Failed.from((e) => ({ reason: e.reason })) },
          unknown: E.Unsure,
        }),
      }),
    }),
    ({ S, O, emits }) => ({
      default: S.CLOSED,
      states: {
        CLOSED: { on: { Open: { target: S.OPEN } } },
        OPEN: {
          on: {
            Choose: { actions: [O.act.commit(({ event }) => ({ item: event.item }))] },
            Acted: { target: S.CLOSED, emit: [emits.Focus({ target: "trigger" })] },
          },
        },
      },
    }),
  )
```

```ts
// AFTER: the app
const fileAct = transaction({
  id: "App/file",
  input: { item: Schema.String },
  key: ["item"],
  concurrency: "reject",
  services: [FilesApi],
  commit: ({ item }) =>
    FilesApi.use((api) => api.run(item)).pipe(Effect.mapError((e) => new MenuActionFailed({ reason: e.message }))),
})
export const FileMenu = menu({ id: "App/FileMenu", act: fileAct })
export const EditMenu = menu({ id: "App/EditMenu", act: editAct })
```

## Why

- Each call is a declared machine with its own id, so `flow check`, `flow graph` and Stories see a static graph.
  Keep the id a literal type (`<Id extends string>(config: { readonly id: Id; … })`), so graph names and Story
  addresses stay stable; a plain `string` id loses them.
- `R` reaches the Runtime Layer's type, so a missing service is a type error.
- The action sits next to the menu that runs it.
- Operation ports or `.with(...)` would be `machine.provide` again, which decision D15 dropped.

## Prior art

ui-sdk's per-instance `onAction` (`codebases/ui-sdk/packages/core/src/components/menu/menu.ts:239`); factories
that create XState machines.

## Status

Built: `definition`, `machine`, `transaction`, `outcomes`. Accepted, not built: props, emits, mappers reading
`{ input }`. Unverified: a generic contract passing through `definition()` with exhaustive `failure:` typing; check it
when the first example is written
(`ui-primitives-decisions` Q8; full text: git show 3a84b878:wiki/plans/flow/references/proposals/2026-11-16-ui-primitives-decisions.md).
