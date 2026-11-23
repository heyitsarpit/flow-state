---
page T142-typed-machine
description A misspelled key in a machine body is a compile error, and every type outside the body derives from the definition.
---
# The typed machine: what an app author notices (slice T142: T113, T143, T144; 2026-11-22)

**Bottom line:** a misspelled key anywhere in a machine body is now a red line in your editor, and every type you
need outside a body comes from the definition, so you never hand-write an event's or memory's shape again. A
definition's face shows only tokens and Schemas.

## New

```ts
// existing: machine, definition   user-defined: House, Room, byRoom, until
machine(House, ({ S, E }) => ({
  on: { Arrive: { target: S.HOME, updateMemori: () => ({ until: 0 }) } },
  //                              ^^^^^^^^^^^^ NEW: a type error on the misspelled key
}))

// NEW: a part's type is on its token
type SetTarget = typeof Room.E.SetTarget.Type   // { readonly celsius: number }, the event's payload
type Target = typeof Room.M.target.Type         // number, one memory field

// a helper typed from the definition, not by hand
const byRoom = ({ memory }: { readonly memory: typeof Room.Memory.Type }) => ({ room: memory.room })

// NEW: a body's tokens, named once
const helper = (tokens: Flow.BodyTokens<typeof Room>) => tokens.S.OFFLINE
```

- Every typo class is caught: `target`, `updateMemory` and the keys it returns, `guard`, `actions`, `states`,
  `schedules`, an event name under `on`, and a schedule name. The runtime still refuses one at construction.
- A lint rule, `no-hand-typed-callback`, flags a callback parameter typed by hand where a derived type exists.

## Changed

- **The definition's face:** `Room.states`, `Room.events`, `Room.internalEvents`, `Room.memory`, `Room.context`,
  `Room.operations`, `Room.schedules` and `Room.M.field.schema` are gone. Flow reads its own private copy. What
  stays: tokens (`S`, `state`, `E`, `M`, `O`) and Schemas (`Event`, `State`, `Input`, `Memory`, `Snapshot`).
- A variant of a definition is written out in full, as `Cells` now is beside `Pay`; there is no way to copy one
  definition's config into another.
- Flow fields that take a Schema (`Flow.uncertain`'s fields, a schedule's `key` and `restartOn`) must be Schemas that
  need no services, as every other field Schema already had to be.
- Type checking the package takes about 27% longer (1.00 s to 1.27 s), the cost of the typo check.

## Known gaps, each owned

- A memory or event field named `pipe` turns the typo check off for that body (Flow mistakes it for an Effect
  value). Pinned as a failing type test; owner T121.
- `Reads`, one type for a whole callback's input, is deferred until props and fragments exist (the UI slice).
- Two clients that declare the same events accept each other's event tokens, since event tokens are compared by
  shape.

## Review the diff

- The whole slice:
  `hunk diff afdb86ec f7659c02 -- packages/flow-state-v3`
- Fixtures only:
  `hunk diff afdb86ec f7659c02 -- packages/flow-state-v3/fixtures`
- Requirements (the reds, then the split into three Tasks):
  `hunk diff afdb86ec ce4549d9 -- packages/flow-state-v3`
- Build:
  `hunk diff ce4549d9 ab64ce88 -- packages/flow-state-v3`
- Closing cleanup (lane clients without a factory, typo pins, lint alias case):
  `hunk show f7659c02`
- T113, the face: `hunk show fe1c1bd3`
- T143, crossings and derived fields: `hunk show 016c7d64`
- T144, the sweep: `hunk show 48c38fc9`; the body capture and lint rule: `hunk show ab64ce88`
