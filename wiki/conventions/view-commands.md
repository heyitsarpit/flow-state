# View commands

**The rule:** when the machine decides the view should do something once (focus, scroll, announce), declare it in
`emits` and send it with an `emit` part; never store a request in memory.

## When it applies

The command depends on why a turn happened, not on the state it left, or it must repeat in the same state:

- Escape closes the menu and returns focus to the trigger; an outside click reaches the same state and must not;
- a second failed submit leaves the form in the same state, and focus must still go to the first invalid field.

If the state alone says what to do (navigate once PAID, show a dialog), render from state instead.

## Before and after

```ts
// BEFORE: an event stored as a fact, a counter to beat equality, and a view that dedupes by id
memory: {
  focusRequest: Flow.initial(
    Schema.NullOr(Schema.Struct({ target: Schema.Literal("trigger", "first"), id: Schema.Number })),
    null,
  ),
},
Escape: {
  target: S.CLOSED,
  updateMemory: ({ memory }) => ({ focusRequest: { target: "trigger", id: (memory.focusRequest?.id ?? 0) + 1 } }),
},
```

```ts
// AFTER
emits: { Focus: { target: Schema.Literal("trigger", "first") } },          // the definition
Escape: { target: S.CLOSED, emit: [emits.Focus({ target: "trigger" })] },  // the machine body: ({ S, emits })
OutsideClick: { target: S.CLOSED },                                         // no focus steal
useOnEmit(menu, { Focus: ({ target }) => refs[target].current?.focus() })  // the view
```

A fragment declares its own emits; a view hears them under the instance name, and an `.each` copy passes its key:

```ts
useOnEmit(filters, { search: { Focus: () => inputRef.current?.focus() } })
useOnEmit(list, { rows: { Focus: (_, { key }) => rowRefs.get(key.id)?.focus() } })
```

How it behaves:

- only an accepted transition emits; the mapper reads the event, the before memory and props;
- in React emits queue per listener in turn order and arrive after the commit of the first render whose snapshot is
  at or after their turn, so the element exists; a discarded render delivers nothing;
- any accepted transition emits (a send, a timer, an ending, an `onContext` or `onProps` event), never entry, exit
  or a refused turn; Stories record emits as evidence;
- it is never stored, saved, transferred or replayed, and is dropped when nobody listens;
- outside React, `actor.onEmit({ ... })`.

## Why

A stored request replays after a reload, and its counter restarts when the actor is recreated, so a view that
remembers the old id ignores the next one. An emit has neither problem. Gesture-gated browser APIs (clipboard, file
picker, fullscreen) stay in the view's own event handler.

## Prior art

XState v5's `emit` and `actor.on` (`codebases/xstate/packages/core/src/createActor.ts:468`); Elm's commands.

## Status

`emits`, `emit`, `useOnEmit` and `actor.onEmit` are accepted, not built
([ui-primitives-decisions-2026-11-16.md](../plans/flow/references/proposals/ui-primitives-decisions-2026-11-16.md) Q3).
