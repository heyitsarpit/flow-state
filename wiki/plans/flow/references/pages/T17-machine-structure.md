---
page T17-machine-structure
---
# Machine structure: what an app author notices (T17, 2026-11-16)

**Bottom line:** states can nest, with history; memory gains input, computed and private fields; and a bad
definition now throws one `FlowError` listing every problem with its path, code and help. Reviewed PASS at
`59cb006e`; bench 0.041 ms median per turn on pay (was 0.035).

## Nested states and history

The speaker is the app's own service (a Layer over `HttpClient` in the fixture); the machine only sends to it.

```ts
const Player = definition({                                   // existing
  id: "Music/Player",
  states: ["OFF", { ON: ["BUFFERING", "PLAYING", "PAUSED"] }], // NEW: an object nests states under ON
  events: { Play: { trackId: Schema.String }, Pause: {}, Resume: {}, Stop: {}, Seek: { pos: Schema.Number } },
  internalEvents: { Started: {}, Tick: {} },
  memory: {
    trackId: Flow.initial(Schema.String, ""),                  // existing
    pos: Flow.initial(Schema.Number, 0),
    device: Flow.private(Flow.initial(Schema.String, "living-room")), // NEW: Flow.private, hidden from snapshots
    label: Flow.initial(Schema.String, (fields) => `Speaker: ${String(fields["device"])}`), // NEW: computed initial
  },
  operations: ({ E }) => ({ play: play.outcomes({ success: E.Started /* ... */ }) }),
});

export const PlayerMachine = machine(Player, ({ S, E }) => ({
  default: S.OFF,
  on: {
    Stop: S.OFF,
    Seek: { updateMemory: ({ event }) => ({ pos: event.pos }) }, // root handler: always runs
  },
  states: {
    OFF: { on: { Resume: S.ON.history } },                    // NEW: S.X.history, ON's last active child
    ON: {
      default: S.ON.BUFFERING,                                // NEW: each compound state names its default
      states: {
        BUFFERING: { on: { Started: S.ON.PLAYING } },
        PLAYING: {
          schedules: {
            tick: { schedule: Duration.seconds(1), send: E.Tick, armOn: [Flow.entry, E.Tick.tag, E.Seek.tag] },
          },
        },
        PAUSED: { on: { Resume: S.ON.PLAYING } },
      },
    },
  },
}));
```

- **History:** `Resume` from OFF returns to whichever of BUFFERING, PLAYING or PAUSED was last active in ON.
  Targeted from inside ON, it returns where you just were, as SCXML does.
- **`armOn` and the root:** a `Seek` while PLAYING runs the root's `updateMemory` and restarts the tick. Before,
  PLAYING's implicit handler swallowed the event and `pos` never changed.
- **Fields:** `Flow.input` reads from the actor's input; a computed initial may not read another computed field.
- **Schemas:** each definition exposes Event, State, Input, Memory and Snapshot Schemas; snapshots omit private
  fields.

## What is now refused at construction

Each one throws a `FlowError` whose diagnostics list every violation:

- an operation ending mapped to an event the definition doesn't declare (`UnknownEvent`);
- an operation key outside its input, or an `id` or `persist` of the wrong kind;
- a fixed delay outside 0 to 2^31−1 ms (`DelayOutOfRange`);
- a state named `history`, or a state name containing a dot.

A computed delay that is out of range at creation no longer silences the other schedules: they arm, and the bad
one shows as an issue.

## Known gaps, each with an owner

- Inside nested states, `machine()` widens a string delay and `armOn` names to plain strings, so write
  `Duration.seconds(1)` and `E.X.tag` there. Pinned as an inverted type test; T57 owns it.
- History isn't saved in the record yet, so a reload forgets it. T56 owns it.
- Machines created from `Flow.input` don't start yet. T9 owns it.

## Calls made for you to check

- Three error codes sit outside Diagnostics' closed list: `ServiceFailed`, `InvalidTurn` (also used for a bad
  delay at creation) and `CallbackDefect`. Accept them as new codes, or have them replaced.
- Turn R14's change to `armOn` (the implicit handler yields to any ancestor's) is queued for the Machines Plan
  as @plan.Pending.D13.
