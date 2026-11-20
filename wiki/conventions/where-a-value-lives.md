---
convention where-a-value-lives
---
# Where a value lives

**The rule:** every value has one home, chosen by who changes it and what it is for: input says which actor and
where it starts, props are the parent's live settings, memory is what the machine changes, context comes from
another actor, and anything other fields determine is derived, never stored.

## When it applies

Every field you are about to add to a definition. Ask, in order:

1. Should a change to it give you a **new actor** (another document, another user)? It is **input**.
2. Does the **owning component** set it and may change it while the actor lives (`max`, `disabled`, `readOnly`)?
   It is a **prop**: state that does not come from a machine, injected by the one component that owns the actor
   (`useActor`; pass the handle down to share it with the subtree). Every prop has a value before any view supplies
   one, its Schema's default; how the Schema declares it is the author's choice.
3. Does **another actor** own it (the signed-in user, settings)? It is **context**.
4. Does the **machine** change it? It is **memory**, possibly started from input.

A **shared actor** (reached by a ref: a singleton, or one actor per identity) has no owner, so it takes no props
(`useActorByRef` with props is a type error). Outside state reaches it three ways, and the machine decides how to act:

- **Which actor it is:** input, the ref's identity; fixed.
- **Another machine's state:** context; the machine reads it in guards, or `C.slot.change` in `onContext` turns a change
  into an event.
- **App code that is not a machine** (an effect, host code, a socket): an event it sends, handled as any other.

Props and context share one delivery (in order, compared with `Equal.equals`, never saved); context is wired
statically between actors and checked as a graph, props come from the owner at the call site. A write that must
survive a reload belongs to a shared, persisted actor: a local actor's lanes never persist.

Then check the memory field against six rules:

| #   | If the value is…                     | It belongs in                               |
| --- | ------------------------------------ | ------------------------------------------- |
| R1  | determined by other fields           | a helper or selector, never memory          |
| R2  | meaningful only in one state         | a trait placed on that state, or the view   |
| R3  | there only to tell the outside world | an `emit` (@convention.view-commands)       |
| R4  | the parent's configuration           | `props`                                     |
| R5  | the status of a server-backed thing  | its operation rows, `O.x.get(s, key)`       |
| R6  | a counter that only beats equality   | a selection of the real content, or an emit |

## Before and after

```ts
// BEFORE: ten fields, most of them copies
memory: {
  min: Flow.initial(Schema.Number, 0),            // a copy of a prop
  max: Flow.initial(Schema.Number, 100),          // a copy of a prop
  value: Flow.initial(Schema.NullOr(Schema.Number), null),
  text: Flow.initial(Schema.String, ""),          // String(value), except while typing
  committed: Flow.initial(Schema.NullOr(Schema.Number), null), // only reports a change
  version: Flow.initial(Schema.Number, 0),        // only defeats Equal.equals
},
```

```ts
// AFTER
memory: { value: Flow.input(Schema.NullOr(Schema.Number)) },       // existing: input starts memory
props: {                                                            // R4; every prop needs a Schema default
  min: Schema.Number.pipe(Schema.withDecodingDefaultKey(Effect.succeed(0))),
  max: Schema.Number.pipe(Schema.withDecodingDefaultKey(Effect.succeed(100))),
},
emits: { Change: { value: Schema.NullOr(Schema.Number) } },         // R3: the typed value is the intent
// text: the view owns the draft while typing (R2); committed: an emit (R3); version: gone (R6)
const label = (s: Snapshot) => format(s.memory.value)               // R1: derived
```

```tsx
const stepper = useActor(StepperMachine, {
  input: { value: 1 },                         // read once; changing it needs a keyed remount
  props: { min: 1, max: stock },               // read live; the same actor gets the new value
})
// outside React: runtime.createActor(StepperMachine, { input, props }), then stepper.setProps({ max: 3 })
```

| Value        | Read                  | Changed by         | Saved | Identity |
| ------------ | --------------------- | ------------------ | ----- | -------- |
| input field  | once, at creation     | the machine, after | yes   | yes      |
| prop (local) | every render, live    | the parent only    | no    | no       |
| memory       | every turn            | the machine        | yes   | no       |
| context      | every provider change | another actor      | no    | no       |

## Why

A stored copy drifts: a prop copied by a `Configure` event shows defaults in the first frame and is overtaken by a
child's mount-time send; a status mirrored beside an operation's row stays "loading" after the token is removed; a
nullable "mode" field is an implicit state machine that a forgotten reset breaks. A value with one home cannot
disagree with itself.

## Prior art

React's props and state split; XState v5's `input`, read once (`codebases/xstate/packages/core/src/createActor.ts:267`).

## Status

Props, emits and `onProps` are accepted, not built
(@proposal.ui-primitives-decisions Q3,
Q5, W8).
