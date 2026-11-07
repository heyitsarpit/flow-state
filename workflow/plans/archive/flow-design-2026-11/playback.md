# Story rendering and playback: proposal

Status: accepted. [Testing.plan](../../flow/Testing.plan) O4 (frames, `StoryFrame`) and O9 (playback)
hold the contract; this document explains the design. Where they differ, the plan wins.

## 1. The idea

Watch the real application UI go through a scripted flow: a demo, an onboarding walkthrough, a
design review of loading and failure states, a failing test, a reproducible bug. The viewer sees the
application with a floating control overlay, not an application inside a preview box.

Two properties of Flow State make this simple:

1. **A Story run is deterministic.** The same Story, fixtures and seed always produce the same
   sequence of states ([Testing.plan](../../flow/Testing.plan) O2).
2. **The UI is a function of state.** Components read actor snapshots and store data that never
   change once published ([React.plan](../../flow/React.plan) O4), so the same state renders the same UI.

So playback records once, then only renders:

```text
1. Record:  story.run()  ──►  run.frames = [Frame0, Frame1, …, FrameN]   (the only execution)
2. Render:  <StoryFrame frame={run.frames[i]}><App/></StoryFrame>           (starts no Flow work)
3. Play:    <StoryPlayer run={run}><App/></StoryPlayer>                    (moves i over time)
```

Recording runs the Story on the production Runtime with fixtures, exactly like a test. After that,
nothing in Flow runs while someone watches, so playback never repeats Flow work and the production
Story executor stays the only executor.

## 2. Quickstart

```tsx
// a development page
const run = await editorSaveStory.run();

export default function EditorDemo() {
  return (
    <StoryPlayer run={run}>
      <DeskRoutes /> {/* the app below its FlowProvider */}
    </StoryPlayer>
  );
}
```

That is all a first demo needs: no presentation, no captions. Two rules:

- **Render the app below its `FlowProvider`.** `StoryPlayer` and `StoryFrame` supply the Flow
  context themselves. An app root that builds its own `FlowProvider setup={…}` would construct a
  live Runtime and start real work.
- **Host providers stay the host's.** Router, theme and translations wrap `StoryPlayer` as they
  wrap the app anywhere else.

## 3. Concepts

| Concept           | What it is                                                                                                                                                                                                                                                                          |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Frame**         | Data: one moment of a Story run. Every captured actor's snapshot, one store revision, the app time `now`, pending work, its cause (the command or publication that produced it, including the event a `send` command carried), and an optional name. A checkpoint is a named frame. |
| **`StoryFrame`**  | A component: renders real components from one frame (and, for multi-tab runs, one tab). Frame is the data; `StoryFrame` renders it.                                                                                                                                                 |
| **Presentation**  | Data: how to present one Story's run, created with `definePresentation(story, …)`. Captions, holds, routes and pacing per scene. Typed against its Story and never a second source of events.                                                                                       |
| **Scene**         | One entry in a presentation: a checkpoint plus how to present it.                                                                                                                                                                                                                   |
| **`StoryPlayer`** | A component: plays a run's frames over time under a floating overlay, built only from `StoryFrame`.                                                                                                                                                                                 |
| **Gap**           | An actor the rendered app asks for that the frame does not contain.                                                                                                                                                                                                                 |

## 4. Frames

`story.run()` returns every frame it took:

```ts
const run = await saved.run(); // an initial frame, then one per command
run.frames; // readonly Frame[]; the last one is the run's end
run.checkpoints.saving; // the frame named "saving"
```

- **When.** An initial frame before the first command, then one after every command. With
  `frames: "publication"`, one after every committed publication instead, which shows steps such as
  `SAVING → SAVED` inside a single `process()`. Frames are taken only at committed publications, so
  each is consistent.
- **Size.** Actor snapshots and unchanged lanes keep their identity between publications
  ([Machines.plan](../../flow/Machines.plan) O8, [React.plan](../../flow/React.plan) O4), so frames share most
  of their data. Consecutive identical frames collapse into one, and a run marks truncation if it
  reaches its frame limit.
- **Failures.** A run that rejects carries its frames to the failing boundary
  ([Testing.plan](../../flow/Testing.plan) O8). A failed property test emits a static Story (O6); playing
  that Story's run shows the failure.
- **Frames are never saved.** To share a run, share the Story and run it again; determinism gives
  the same frames. Rendering a frame is neither a restore nor a replay.

## 5. `StoryFrame`

```tsx
<StoryFrame frame={run.checkpoints.saving}>
  <TicketPanel ticket={T42} />
</StoryFrame>
```

It takes a frame and, for multi-tab runs, an optional `tab`. What a component sees:

| Situation                                                  | What it sees                                                                                                         |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| A shared actor the run captured                            | its snapshot at that frame                                                                                           |
| `useActorByRef(ref, options)` for an actor the frame lacks | its starting snapshot (default states, `initial` memory, loading lanes); nothing starts, and the frame records a gap |
| `useActorByRef(ref)` lookup for an actor the frame lacks   | `null`                                                                                                               |
| `useActor(machine)`, a component's own actor               | its starting snapshot                                                                                                |
| The current time                                           | the frame's `now`, through `useNow`                                                                                  |
| A click                                                    | does nothing; inside `StoryPlayer`, the player can compare it with the Story's next command                          |
| Buttons and eligibility                                    | the production `check()`, with denial reasons and context                                                            |

Gaps matter when rendering a whole app: it asks for actors the Story never created, such as other
lists and toasts. They show their starting (often loading) state, and the gap list tells the author
which refs the Story should also ensure.

## 6. `StoryPlayer`

Pass `run` to play a run you already have (a quick demo, a failure). Pass `presentation` for an
authored presentation with captions or routes; the player then records the presentation's own Story
once when it mounts.

```tsx
<StoryPlayer run={run}><DeskRoutes /></StoryPlayer>
<StoryPlayer presentation={presentation}><DeskRoutes /></StoryPlayer>
```

| Control         | Behaviour                                                             |
| --------------- | --------------------------------------------------------------------- |
| Play / pause    | start or stop the presentation clock                                  |
| Next / previous | move by frame, command or scene                                       |
| Scrub           | jump to any frame, backwards included; a lookup, never a re-execution |
| Speed           | scales presentation pacing only; app time is fixed in each frame      |
| Restart         | back to the first frame; re-record only when fixtures or code changed |
| Inspect         | the frame's cause, gaps and the run's evidence for that frame         |

- **Next action.** Each frame's cause names the command that produced it, so the player knows the
  Story's next command. It highlights the control whose click would send that event ("click Save").
- **Evidence.** Inspect shows the run's trace around the frame. Beyond the trace's retained window
  it shows "evidence unavailable" rather than inventing an empty history.
- **Re-recording** happens on mount or on request, never from a cache: nothing identifies a cached
  run with the current view code and fixtures.

### Presentations

```ts
const presentation = definePresentation(editorSaveStory, {
  scenes: [
    { at: "draft", caption: "Edit the title", route: "/desk/north/T-42" },
    { at: "saving", caption: "The save is pending", hold: "1500 millis" },
    { at: "saved", caption: "Saved; the queue repairs itself" },
    { at: "saaved" }, // type error: not a checkpoint of editorSaveStory
  ],
  pacing: { speed: 1, maxWait: "800 millis", minDwell: "120 millis" },
});
```

- **Scenes** name checkpoints of their Story, so `at` is type-checked. Scenes play in the run's
  order. A scene's caption and route apply from its frame until the next scene; checkpoints
  without a scene play with no caption.
- **Routes** are plain strings handed to the host's router. Changing route runs host code, so only
  Flow work is inert during playback.
- **Timing knobs.** `speed` scales every wait. `maxWait` caps the wait between two frames (a
  30-second poll plays quickly). `minDwell` gives every frame some screen time, since frames from one
  `process()` share the same `now`. A scene's `hold` pauses on that scene for its caption.
- A presentation holds no event callbacks; the Story stays the only source of events.

## 7. Limits

- **Not proof of wiring on its own.** It shows how the UI responds to events. The next-action
  highlight shows whether a control produces the Story's next event.
- **Starting state only:** components' own actors and `useState`. Stories cannot create or address
  a component's own actor ([Testing.plan](../../flow/Testing.plan) O1).
- **Rendered output is raw.** Screenshots, text dumps and anything shown on screen carry real
  values, unlike exported traces, which digest sensitive ones
  ([Inspection.plan](../../flow/Inspection.plan) O5). Anything leaving the machine should come from
  Stories with non-sensitive fixture data.
- **Browser presentation** (focus, scrolling, cursor, typing animation) is not state. Uncontrolled
  inputs keep typed text across frames unless the player remounts them.
- **Wall-clock code:** components that call `Date.now()` or run their own timers ignore the
  frame's time; `useNow` is the supported way to show time.
- **Server rendering:** a first server render is not a frame; `serverView` follows
  [Testing.plan](../../flow/Testing.plan) O7. SSR frames are deferred.

## 8. Follow-ups

- **Failure replay:** play the frames of a failing Story or the Story a property test emits, and
  link it from the test report.
- **Wiring check:** a test helper that fails when no control produces a command's event.
- **Agent text frames:** each frame's accessibility tree plus its cause and denial reasons as text,
  so an AI agent can follow a flow without a browser.

Later, if needed: screenshot galleries per checkpoint, before-and-after comparison of two runs, and
continuing live from a frame (which would need a live-processing Story mode).

## 9. Open questions

1. **Default granularity.** One frame per command, with publications opt-in, is the current choice.
2. **A component's own actor.** Should `StoryFrame` let a focused Story's actor stand in for a
   component's `useActor(machine)`? It would bring dialogs and wizards into reach, at the cost of a
   new rule.
