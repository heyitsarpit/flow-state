# What an ending knows

**The rule:** a call's input carries what the server needs and what the ending must know as of the call's start
(ids, amounts sent); current configuration (does this item close the menu?) comes from props or memory, never from
the call.

## When it applies

An outcome mapper or the handler of an ending needs to know which call ended, or what to do next.

- **What was true when the call started** goes in the call's input: it is saved with the Attempt, so a restore
  keeps it.
- **The current configuration** comes from props or memory: it follows the parent and is never saved with a call.

## Before and after

```ts
// BEFORE: a view flag carried through the server call and copied back
input: { item: Schema.String, closes: Schema.Boolean },
Act: { actions: [O.act.commit(({ event }) => ({ item: event.key, closes: event.closes }))] },
success: E.Acted.from((_v, { input }) => ({ item: input.item, closes: input.closes })),
Acted: [{ guard: [({ event }) => event.closes || deny("KeepsOpen")], target: S.CLOSED }, {}],
```

```ts
// AFTER
props: { items: Schema.Array(Schema.Struct({ key: Schema.String, closes: Schema.Boolean })) },
input: { item: Schema.String },                                             // server data only
Act: { actions: [O.act.commit(({ event }) => ({ item: event.key }))] },
success: E.Acted.from((_v, { input }) => ({ item: input.item })),            // the id rides the input
Acted: [
  { guard: [({ event, props }) => closesOn(props.items, event.item) || deny("KeepsOpen")], target: S.CLOSED },
  {},
],
```

## Why

A view flag in the input is saved with the Attempt and copied through three places so the mapper can hand it back.
The id belongs there: it names the server thing and is the operation's key.

## Prior art

TanStack Query's `onSuccess(data, variables)`
(`codebases/tanstack-query/packages/query-core/src/types.ts:1117-1122`).

## Status

Mappers receiving `{ input, key, attempt }` is in the Plan (Operations O3) but not built: today they get only the
value (`packages/flow-state-v3/src/core/serve.ts`). Props are accepted, not built
([ui-primitives-decisions-2026-11-16.md](../plans/flow/references/proposals/ui-primitives-decisions-2026-11-16.md) Q6).
