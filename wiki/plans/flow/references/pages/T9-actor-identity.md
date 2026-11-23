---
page T9-actor-identity
description A machine reads another actor's state as typed context and reacts when it changes; mutating memory fails the turn in dev.
---
# Actor identity and context: what an app author notices (T9, 2026-11-17)

**Bottom line:** a machine can read another actor's state as typed context, and react when it changes. A context
slot declares the Schema of what it selects. Values of any depth and any size save, restore and compare without
crashing. In dev and test, mutating memory fails the turn. Reviewed PASS at `f8c7e247`. Bench, per turn (median):
palette stress 1.44 ms (was 8.98), `session/long` 0.164 ms (was 0.175).

## Context: read a provider, react on change

The provider is an ordinary machine (`Session`); the consumer names the slice it needs and its Schema.

```ts
export const Avatar = definition({                                  // existing
  id: "Workspace/Avatar",
  persist: true,
  states: ["SHOWN"],
  events: {},
  internalEvents: { Seen: {} },
  memory: { seen: Flow.initial(Schema.Number, 0) },
  context: {                                                        // existing: context
    user: SessionMachine.definition.Provider.select(               // existing: Provider.select
      Schema.UndefinedOr(Schema.String),                            // NEW: the selection's Schema comes first
      (s) => (s.memory.user === "" ? undefined : s.memory.user),   // user-defined selector
    ),
  },
});

export const AvatarMachine = machine(Avatar, ({ S, E }) => ({
  default: S.SHOWN,
  onContext: [{ select: ({ context }) => context.user, event: E.Seen }], // existing: onContext
  on: { Seen: { updateMemory: ({ memory }) => ({ seen: memory.seen + 1 }) } },
}));
```

What you'll see:

- **The Schema is required.** A selection passes through it once, so the consumer reads, compares and saves the same
  value live and after a reload. `undefined`, Option, Date, Map, Set and class values all work. A selection the
  Schema refuses is a defect in your selector, reported as an issue; a value with no canonical form (a NaN under
  `Schema.Json`) is reported `UnencodableValue`, and the slot keeps its last value.
- **A reload invents nothing.** A persisted consumer that comes back hears onContext only for slots whose value
  really changed while it was away.
- **Issues clear.** A context issue raised by a failing provider clears when that provider next succeeds.

## Refs by value, and refusals

An actor is named by its machine and input, and naming the same actor twice gives the same actor. These are refused
with a `FlowError` that names the path: a ref whose context conflicts with a live one (`ConflictingActorRef`, checked
across the whole provider graph); disposing a provider that still has consumers (`BlockedByDependents`); a consumer
with no provider (`MissingContextProvider`). Story `ensure` and `dispose` steps go through the same checks.

## No size or depth limits

There is no cap on a value's size or depth: a 5,000-row list or a value nested 1,000,000 deep saves, restores and
compares. Storage quota is the real limit, and a write the store refuses ends as `StorageRefused`. Big
collections are still better as reads or entities, virtualised in the UI.

## Values are immutable

Memory, selections, payloads and inputs are immutable once admitted. In dev and test they are deep-frozen, Maps,
Sets and Dates included, so a mutation throws where it happens and that turn fails as a defect:

```ts
on: { Add: { updateMemory: ({ memory, event }) => { memory.items.push(event.item); return {} } } } // throws in dev
on: { Add: { updateMemory: ({ memory, event }) => ({ items: [...memory.items, event.item] }) } }   // correct
```

Production does no freezing, and pays nothing for it.

## Open

The actor-to-actor `send(ref, event)` action is not built; it is your call. The follow-up loop guard returns with it.
