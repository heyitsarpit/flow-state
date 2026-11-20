---
convention controlled-values
---
# Controlled values

**The rule:** when the parent owns a value (React's `value` plus `onChange`), pass it as a prop and report changes
with an emit; the machine never stores it.

## When it applies

A form library, a URL or another component already holds the value, and the machine only proposes changes. If the
machine owns the value, it is memory started from input instead (@convention.where-a-value-lives).

## Before and after

```ts
// BEFORE: the parent's value mirrored into memory, and two owners fighting over it
memory: { value: Flow.initial(Schema.Number, 0) },
events: { Set: { value: Schema.Number } },        // the parent pushes its value in from an effect
```

```ts
// AFTER
props: {                                                        // every prop needs a Schema default
  value: Schema.Number.pipe(Schema.withDecodingDefaultKey(Effect.succeed(0))),
  max: Schema.Number.pipe(Schema.withDecodingDefaultKey(Effect.succeed(10))),
},
emits: { Change: { by: Schema.Number } },                       // the intent, not a computed value
Press: { emit: [emits.Change.from(({ event }) => ({ by: event.by }))] },
```

```tsx
const stepper = useActor(StepperMachine, { props: { value: qty, max: stock } })
useOnEmit(stepper, { Change: ({ by }) => setQty((q) => clamp(q + by, 1, stock)) }) // the parent applies it
```

## Why

A mirrored value has two owners: the parent's copy and the machine's copy disagree until an effect syncs them, and
a send from a child's mount can land between. Props are read live and in order; an emit reports the proposal once.
Emit the intent (`by`), not a value computed from `props.value`: hold-repeat can tick twice before the parent
re-renders, and two `Change(4)`s would lose a step.

## Prior art

React's controlled inputs; ui-sdk's `follow` and `setOptions`, which let state read new options during render
(`codebases/ui-sdk/packages/core/src/foundation/kernel/primitive.ts:364`).

## Status

Props and emits are accepted, not built
(@proposal.ui-primitives-decisions Q3,
Q5f).
