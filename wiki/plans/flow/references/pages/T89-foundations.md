---
page T89-foundations
---
# Foundations: what an app author notices (slice T89: T131, T120, T140; 2026-11-22)

**Bottom line:** schedules are declared on the definition, so their names, keys and pause reasons are typed
everywhere from one place, and `Flow.keyed` is gone. Every value Flow hands you is made through one door and frozen,
so a copy or a hand-built object is refused with a clear error instead of misbehaving later.

## New

```ts
// existing: definition, machine, Schema, S, E      NEW: `schedules` on the definition
export const Toaster = definition({
  id: "Kitchen/Toaster",
  states: ["IDLE", "TOASTING", "DONE"],
  events: { Drop: { slot: Schema.String }, Pop: {} },
  internalEvents: { Browned: { slot: Schema.String } },
  schedules: { brown: { key: { slot: Schema.String }, pausedBy: ["LidOpen"], restartOn: Schema.Number } },
})

export const ToasterMachine = machine(Toaster, ({ S, E }) => ({
  default: S.IDLE,
  states: {
    TOASTING: {
      schedules: {
        brown: {                                   // placement only: behaviour, no names declared here
          keys: ({ memory }) => memory.slots.map((s) => ({ slot: s.id })),
          schedule: "30 seconds",
          restartOn: ({ memory }) => memory.slots.length,
          paused: { LidOpen: ({ memory }) => memory.lidOpen },
          send: E.Browned.from(({ key }) => ({ slot: key.slot })),
        },
      },
    },
  },
}))

snapshot.schedules.brown?.[0]?.key.slot   // string, typed from the declaration
snapshot.schedules.brown?.[0]?.pausedBy   // ReadonlyArray<"LidOpen">
```

## Changed

- A schedule placed in the body but not declared on the definition is refused at construction
  (`ScheduleUndeclared`); a declared pause reason without a callback is a type error.
- `Flow.keyed(...)` is removed; a keyed schedule declares `key` on the definition.
- An unknown key in a machine body (`gaurd:` beside `target`) is refused when the machine is built, not by the type
  checker.
- Values Flow makes (machines, tokens, handles) are frozen; a spread copy or hand-built object is refused as the wrong
  kind, while values from a second loaded copy of Flow are still recognised. A machine's compiled internals are no
  longer on its public face.

## Known gaps, each owned

- One schedule placed in a state and again in a state below it: the inner placement's timer is lost today (an
  inverted test, owned by the timer rebuild in T118).
- A Map the app froze itself, or a typed array, on a public value is not frozen by Flow (no fixture does this).
