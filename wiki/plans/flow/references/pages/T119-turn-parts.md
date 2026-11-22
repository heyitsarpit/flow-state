---
page T119-turn-parts
---
# Turn parts: what an app author notices (slice T119; 2026-11-23)

**Bottom line:** schedules now fire exactly as their Effect `Schedule` says, even several at the same instant, and
an actor the host makes with `createActor` keeps its schedules like any other. A turn that changes nothing costs
about half what it did. Nothing in a machine body changes.

## Fixed

```ts
// existing: definition, machine, schedules, Schedule   user-defined: Chime, Ring, Check, ring, battery
RINGING: { schedules: { ring: { schedule: Schedule.recurs(3), send: E.Ring } } },
//                                        ^^^^^^^^^^^^^^^^^ three rings with no delay: all three now ring
//                                                          (before, the second re-arm got no wake: 2 of 3)
IDLE: { schedules: { battery: { schedule: "1 hour", send: E.Check } } },
//                  ^^^^^^^ an actor made by createActor now checks on its hour (before, it never did)
```

- An event still queued when its actor (or the whole Runtime) is disposed shows up as `Unhandled` evidence instead of
  vanishing.
- An endless zero-delay schedule runs as written; a Story of one stops with `StoryTurnLimit`. The loop guard counts
  sends, not firings.

## New in tests

```ts
// NEW: create   existing: homeStory, checkpoint, advance   user-defined: ChimeMachine
homeStory("home/chime-local")
  .create(ChimeMachine, { input: { door: "side" } }) // NEW: a local actor, no ref naming it
  .advance("1 hour")
  .checkpoint("checked")
```

- Every Story now also checks, at each checkpoint, that each pending schedule has exactly one alarm and that the host
  holds a wake exactly when an alarm is due.

## Under the hood (only if you read evidence or the host)

- `Published` evidence names the incarnation and why it was published.
- One applier writes every change, the host gets one wake for all due alarms, and one `readsOf` builds every
  callback's input. The old walk, timers and mail functions are deleted.

## Calls made for you (each tagged on @task.V3.T119, reversible)

- Q9 kept alarm order A at one instant; the deciding Story moves to @task.V3.T123.
- The no-op context wave is skipped (0.073 ms against 0.126 per turn, views equal).
- Alarms are judged at Story checkpoints, not after every step (per step made one run take 640 s).
- The Story `create` step was accepted as a small public API addition (orchestrator); its type pin is owed by
  @task.V3.T97.
- X3 (an ended scope's schedule must not run in its ending turn) moved to @task.V3.T109: only `.each` copies show it.

## Review the diff

- The whole slice:
  `hunk diff 900f9b93 9d09f531 -- packages/flow-state-v3 tools`
- Requirements (the reds, then R22):
  `hunk diff 900f9b93 c578b229 -- packages/flow-state-v3`
- Build:
  `hunk show 011a5c41`
- Fix round (the host's wake as a fact, a local actor's use):
  `hunk show 6aab9c8b`
