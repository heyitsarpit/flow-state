# Interaction state

**The rule:** frame-rate data (pointer moves) stays in refs and is written straight to the DOM; gesture milestones
that need timing go to a local actor; the persisted machine receives one event that describes the change, never a
copy of its own state.

## When it applies

Dragging, resizing, long-press, hover intent and typeahead buffers: anything that matters only while the user is
interacting and is wrong after a reload.

| Kind                                   | Rate         | Lives in                      |
| -------------------------------------- | ------------ | ----------------------------- |
| pointer x, y, the element under it     | 60 to 120/s  | refs and a CSS transform      |
| press, long-press fired, drop          | a few per gesture | a local actor (`useActor`) |
| hover over items, typed letters        | human speed  | a trait placed on the state   |
| the result                             | once         | one event to the persisted machine |

## Before and after

```ts
// BEFORE: the persisted tree enters MOVING, and the drop sends the whole outline copied at drag start
states: ["BROWSING", "MOVING"]
onDrop={() => files.send(Files.events.Reorder({ nodes: draft }))}
```

```ts
// AFTER
onPointerMove={(e) => { ghost.current!.style.transform = `translate(${e.clientX}px, ${e.clientY}px)` }}

const press = useActor(PressMachine)       // local actor: not saved, its timer on the Runtime Clock
// PressMachine:
// PRESSING: { schedules: { hold: { schedule: "400 millis", send: E.Held } }, on: { Held: { target: S.DRAGGING } } }

onDrop={() => files.send(Files.events.Move({ id: drag.id, parent: over.parent, index: over.index }))}
```

Short-lived fields of a mode go in a trait placed on that state, so each entry starts fresh:

```ts
states: ["CLOSED", { OPEN: Flow.state(["ROOT", "SUB_SHOWN"], { traits: { nav: MenuNav } }) }]
// MenuNav's memory: highlighted, pendingSub, typed. Leaving OPEN ends it; no reset list to keep in step.
```

## Why

- A drag in the persisted machine restores half a move after a reload.
- A copied list overwrites changes made during the drag: a lost update.
- A pointer move as an event costs a turn, a frozen snapshot and a render per frame.
- A `setTimeout` in the view escapes the Runtime Clock, so no Story can test a long-press.
- Fields reset by hand drift: the menu reopened with a stale submenu and searched for "xa".

## Prior art

XState's tiles example sends only mouse milestones and resets hover with `assign` actions
(`codebases/xstate/examples/tiles/src/tilesMachine.ts:37-46`); vue-sonner keeps drag offsets in refs
(`node_modules/vue-sonner/src/packages/Toast.vue:194-240`).

## Status

Uses only built or planned features: local actors, schedules, `Flow.state` traits.
