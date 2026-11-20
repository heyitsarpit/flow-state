# Context slots: what an app author notices (T107, 2026-11-20)

**Bottom line:** context is declared on the definition with `Flow.context`, read from exactly one provider, and
reacted to in the machine with `C.slot.change`. Flow now knows which provider fields each slot reads, so it skips
work when they don't change and refuses a slot that mixes providers.

```ts
export const CartPulse = definition({
  id: "Shop/CartPulse",
  // ...
  context: {
    lines: Flow.context(Cart.M.lines),                       // NEW: pass-through, takes the field's Schema
    count: Flow.context(Schema.Number, {                     // NEW: derived from several reads
      reads: { lines: Cart.M.lines, wanted: Cart.M.wanted }, // all from one provider (Cart), or refused
      select: shownCount,                                    // user-defined; runs only when a read changed
    }),
  },
});

export const CartPulseMachine = machine(CartPulse, ({ S, E, C }) => ({ // NEW: C, one token per slot
  default: S.QUIET,
  onContext: [
    C.count.change({                                         // NEW: .change({ when?, event })
      when: (current, previous) => previous === undefined || current > previous,
      event: E.Grew,                                         // previous is number | undefined
    }),
    C.count.change({ event: E.Counted.from((count: number) => ({ count })) }),
  ],
  // ...
}));
```

A state can be read too: `Flow.context(AuthSession.S.SIGNED_IN)` is a boolean, and `Flow.context(Pay.state)` is the
state's name. A compound state reads as true while the actor is in any of its children.

## What is refused now

- A `reads` that mixes two providers, a read of a `Flow.private` field, a `select` or `when` of the wrong type, and a
  `.change` on a slot the definition doesn't declare: compile errors, and construction refuses them if the types are
  bypassed.
- `onContext` inside a state: refused. The experiment failed on its Stories: comparing once on entry reported a false
  change after a second pause, and a silent baseline on entry lost the changes made while paused. One root reaction
  that each state handles differently passes both.
- Two reactions on one slot sending the same event (Compile R19): join their conditions with `||`, or use two events.
- `Provider.select` and a reaction's `select` are gone, and `Definition.Provider` is removed.

## Behaviour to know

- **First value after a failed read** (your Q1 A): `when` is asked with `previous` as `undefined`. A reaction with no
  `when` fires. In a slot whose own values include `undefined`, `previous` can't tell "no earlier value" from an
  earlier `undefined`; this is a doc note on `ChangeSpec`.
- **Saved records:** format 4 saves a reaction's baseline per slot and event, only where it differs from the slot's
  value; formats 1 to 3 step forward. Reordering, adding or removing reactions restores correctly.
- **Known gap:** a slot added by a later release fires a no-`when` reaction once on reload; @task.V3.T56 owns it.

## For your yes

- `wiki/plans/flow/Machines.plan` (lines 683 to 705) shows `when: (current, previous) => current > previous`, which no
  longer compiles. Proposed: use the `previous === undefined ||` form above.

## Status

Unread.
