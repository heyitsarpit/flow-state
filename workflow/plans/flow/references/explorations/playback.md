# Story rendering and playback: proposal

Status: exploration, close to final; playback itself is not part of version 1. The foundations it
needs (frames, `StoryFrame`, the view clock) are already in the plans (section 10). Where this
document and a plan differ, the plan wins.

## 1. The idea

Watch the real application UI go through a scripted flow: a demo, an onboarding tour, a design
review of loading and failure states, a failing test, a reproducible bug. The viewer sees the
application with a floating control overlay, not an application inside a preview box.

Two properties of Flow State make this simple:

1. **A Story run is deterministic.** The same Story, fixtures and seed always produce the same
   sequence of states ([Testing.plan](../../Testing.plan) O2).
2. **The UI is a function of state.** Components read frozen snapshots and store data through
   passive reads ([React.plan](../../React.plan) O4). The same state renders the same UI.

So playback never drives a live application. It records once and renders pictures of state:

```text
1. Record:  story.run()  ──►  run.frames = [Frame0, Frame1, …, FrameN]
2. Render:  <StoryFrame frame={run.frames[i]}><App/></StoryFrame>
3. Play:    <StoryPlayer run={run}><App/></StoryPlayer>   (moves i over time, with an overlay)
```

Nothing executes while someone watches. Playback cannot break determinism or repeat side effects,
and the production Story executor stays the only executor.

## 2. It already exists for one moment

Rendering one moment of a Story run is already part of [Testing.plan](../../Testing.plan) O4, as
`StoryFrame` (formerly `CheckpointProvider`). The reference app uses it in
[editor.test.tsx](../dispatch-desk/features/Tickets/editor/editor.test.tsx):

```tsx
const run = await saved.run(); // run the Story headlessly
render(
  <StoryFrame frame={run.checkpoints.saving}>
    <TicketPanel ticket={T42} />
  </StoryFrame>,
);
expect(screen.getByRole("heading").textContent).toBe("Replace foyer light"); // the prediction
```

Story rendering in tests and playback are the same operation: render the app from a moment of a
Story run. Tests render one moment and assert; playback renders many and presents them.

## 3. Four concepts

| Concept           | What it is                                                                                                                                                                                                                   |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Frame**         | One moment of a Story run: every captured actor's snapshot, one store revision, the app time `now`, pending work, its cause (which command or publication produced it), and an optional name. A checkpoint is a named frame. |
| **`StoryFrame`**  | Renders real components from one frame. It takes the frame and nothing else.                                                                                                                                                 |
| **Playback**      | How to present one Story's run: captions, holds, pacing, routes and props per scene. Typed against its Story; never a second source of events.                                                                               |
| **`StoryPlayer`** | Shows a run's frames over time under a floating overlay, built only from `StoryFrame`. A playback adds captions, holds, routes and props per scene.                                                                          |

Nothing else is new. Captions and pacing are presentation, kept outside the Story, so one Story
serves tests, the CLI and any number of playbacks.

## 4. Frames

`story.run()` returns every frame it took, not only named ones:

```ts
const run = await saved.run(); // one frame per command by default
run.frames; // readonly Frame[]
run.checkpoints.saving; // the frame named "saving"
```

- **When frames are taken.** After every command by default. `frames: "publication"` takes one
  after every committed publication, which shows steps such as `SAVING → SAVED` inside a single
  `process()`. `frames: "named"` keeps only checkpoints. Frames are taken at committed
  publications, never mid-wave, so each is consistent.
- **Size.** Unchanged parts keep their identity between frames
  ([Machines.plan](../../Machines.plan) O8), so frames share most of their data. Consecutive
  identical frames collapse into one. A frame points at evidence by sequence position in the run's
  trace instead of copying it. A run keeps at most 10,000 frames and marks truncation explicitly.
- **Failures.** A failing run rejects with a FlowError ([Testing.plan](../../Testing.plan) O8)
  whose evidence includes the frames up to the failing boundary, so failures can be played back.
  This is the most valuable use: a shrunk property-test failure becomes something you can watch.
- **No export.** Frames are not written to files. To play a run elsewhere, ship the Story and its
  fixtures and run it again; runs are deterministic, so the frames come out the same. This avoids
  the conflict with [Inspection.plan](../../Inspection.plan) O5, which allows exported evidence
  only with values digested, and C1, which forbids snapshot replay. Rendering a frame is neither a
  restore nor a replay.

## 5. `StoryFrame`

```tsx
<StoryFrame frame={run.checkpoints.saving}>
  <TicketPanel ticket={T42} />
</StoryFrame>
```

| Situation                                     | What a component sees                                                                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| An actor the run captured                     | its snapshot at that frame                                                                                                                 |
| An ensuring hook for an actor the frame lacks | the pre-attach snapshot of [React.plan](../../React.plan) O2; nothing starts, and the frame reports it as a **gap**                        |
| A lookup for an actor the frame lacks         | `null`                                                                                                                                     |
| `useActor` (a component's local actor)        | its pure pre-attach snapshot                                                                                                               |
| The current time                              | the frame's `now`, through `useNow`                                                                                                        |
| A click                                       | nothing runs. The Story owns every event, so there is no send callback; Flow's own tools may compare a click with the Story's next command |
| Buttons and eligibility                       | the production `check()`, with denial reasons and context                                                                                  |
| A multi-tab run                               | `tab` selects which tab's state to render                                                                                                  |

Gaps matter for whole-app rendering. A real app ensures actors the Story never created, such as
other lists, toasts and route actors. Those render as pre-attach (often loading) states, and the
gap list tells the author which refs a playback's Story should ensure.

## 6. `StoryPlayer`

```tsx
<StoryPlayer run={run}>
  <DeskApp />
</StoryPlayer>

<StoryPlayer playback={playback}>
  <DeskApp />
</StoryPlayer>
```

It holds a frame index and a presentation clock, and renders
`<StoryFrame frame={run.frames[i]}>` beneath a floating overlay. Given a run it plays that run;
given a playback it runs the playback's own Story, so a playback can never be paired with another
Story's run.

| Control         | Behaviour                                                                  |
| --------------- | -------------------------------------------------------------------------- |
| Play / pause    | start or stop the presentation clock                                       |
| Next / previous | move by frame, command or scene                                            |
| Scrub           | jump to any frame, backwards included, with no re-execution                |
| Speed           | scales presentation pacing only; app time is fixed in each frame           |
| Restart         | frame 0; re-recording reruns the Story when fixtures or code changed       |
| Inspect         | the frame's cause, evidence and gaps: event, repairs, deny reasons, issues |

- **Pacing.** By default the player waits between frames for their app-time gap, scaled by speed
  and clamped, so a 30-second poll plays quickly and a 300 ms transition plays at real speed.
  Frames from one `process()` share the same `now`, so every frame also gets a minimum dwell.
- **Next action.** The player knows the Story's next command, so it highlights the control that
  produces it ("click Save") and confirms that clicking it would send that event.
- **Re-recording.** The player always re-runs the Story rather than caching frames: the app
  fingerprint covers neither view code nor fixtures, so a cache could show stale UI.

### Playbacks

A playback says how to present one Story's run: captions, holds, pacing, routes and props. It is
not a second script; the Story stays the only source of events. A playback belongs to one Story
and is created from it with `definePlayback`. It holds no callbacks and
nothing executable, but it is fully typed:

- **Scene names come from the Story.** Stories keep checkpoint names as literal types
  ([Testing.plan](../../Testing.plan) O1), so `at` accepts only that Story's checkpoints.
- **Props are typed by the rendered component.** A playback that renders one component names it with
  `render`; each scene's `props` are checked against that component's props.
- **Routes are typed by the host.** Flow does not know the app's router, so the route type is a
  type parameter, defaulting to `string`. A host root cannot change route frame by frame, because
  the URL lives outside the frame, so each scene can name the route to render.
- **Times use existing types.** `hold`, `maxGap` and `minDwell` are `Duration.Input`.

```ts
const playback = definePlayback(editorSaveStory, {
  scenes: [
    { at: "draft", caption: "Edit the title", route: "/desk/north/T-42" },
    { at: "saving", caption: "The save is pending", hold: "1500 millis" },
    { at: "saved", caption: "Saved; the queue repairs itself" },
    { at: "saaved", caption: "…" }, // type error: not a checkpoint of editorSaveStory
  ],
  pacing: { speed: 1, maxGap: "800 millis", minDwell: "120 millis" },
});

// one component instead of the whole app
const panelPlayback = definePlayback(editorSaveStory, {
  render: TicketPanel, // scene props: ComponentProps<typeof TicketPanel>
  props: { ticket: T42 }, // default for every scene
  scenes: [
    { at: "saving", props: { ticket: T43 } },
    { at: "saved", props: { tiket: T42 } }, // type error
  ],
});

// a host route type
type DeskRoute = `/desk/${string}` | `/desk/${string}/${string}`;
const deskPlayback = definePlayback<typeof editorSaveStory, DeskRoute>(editorSaveStory, {
  scenes: [{ at: "draft", route: "/desk/north/T-42" }],
});
```

## 7. Limits

- **Shown:** everything a Story drives: shared actors, store data, lanes, pending and failed
  states, repairs and diagnostics.
- **Initial state only:** local actors and component `useState`. App Stories cannot create or
  address local actors ([Runtime.plan](../../Runtime.plan) O3). Open question 2 covers binding a
  focused Story's actor into a component.
- **Browser presentation:** focus, scrolling, cursor and typing animation are not state. A playback could add annotations anchored to DOM elements later; they never become business events.
  Uncontrolled inputs keep typed DOM text across frames unless the player remounts them.
- **Wall-clock code:** components that call `Date.now()` or run their own timers ignore the
  frame's time. `useNow` is the supported way to show time.
- **Server rendering:** a first server render is not a frame (`serverView` follows
  [ServerRendering.plan](../../ServerRendering.plan) O4 overlay rules). SSR frames are deferred.
- **Not proof of wiring on its own.** It shows how the UI responds to events. The next-action
  check in section 6 and the wiring helper in section 8 cover whether controls send them.

## 8. Uses and follow-up features

| Use or feature                  | What it is                                                                                                                                               | Needs beyond the plans                  |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| **Failure replay**              | play the frames of a failing Story or a shrunk property-test failure; attach them to the test report                                                     | the player                              |
| **Wiring check**                | a helper such as `expectWiring(run)`: at each frame, a control must produce the Story's next event, or the check fails                                   | a test helper                           |
| **Agent text frames**           | each frame's accessibility tree plus its cause and deny reasons, as text; an AI agent can "see" a flow without a browser                                 | a test helper                           |
| **Evidence panel**              | events between two frames, through the existing [Inspection.plan](../../Inspection.plan) O6 projections                                                  | the player                              |
| **Visual regression**           | screenshot each named frame                                                                                                                              | nothing; works today                    |
| **Before and after diff**       | align two runs' frames by scene name, then by event sequence, and diff screenshots                                                                       | a test helper                           |
| **Coverage map**                | link each exercised statechart edge to the first frame that took it                                                                                      | a tool view                             |
| **Storybook adapter**           | one Storybook story per scene, rendered through `StoryFrame`; app-wide providers (router, theme) come from a player config, as Storybook's decorators do | a small adapter                         |
| **Docs generation**             | captions, frame screenshots and rendered model text                                                                                                      | a tool                                  |
| **State galleries from models** | render every state a model path reaches, one tile each                                                                                                   | focused-actor binding (open question 2) |
| **Live takeover**               | continue live from a frame: re-run the Story up to it in a live Runtime, then hand it to React                                                           | a live-processing Story mode            |

Stepping back to any frame is a lookup, never a re-execution, so it is instant and cannot behave
differently on the way back. That is worth keeping as a design property.

## 9. Open questions

1. **Default granularity.** Is one frame per command the right default, with publications opt-in?
2. **Focused-actor binding.** Should `StoryFrame` let a focused Story's actor stand in for a
   component's `useActor(machine)`? It brings dialogs, wizards and model galleries into reach, at
   the cost of a new rule.
3. **Gaps in practice.** Is reporting gaps enough, or should the player offer to ensure missing
   refs in a derived Story?
4. **Where the player lives.** `flow-state/testing` (no new route) or a separate development-only
   route, which would change [Package.plan](../../Package.plan) D1's six routes.

## 10. What is already in the plans

- **[Testing.plan](../../Testing.plan) O1 and O4:** `run({ frames })` and `StoryRun.frames`;
  checkpoints are named frames; `StoryFrame` (renamed from `CheckpointProvider`) with a `frame`
  prop and `tab`, and the rules of section 5.
- **[Testing.plan](../../Testing.plan) O8:** failing-run evidence includes its frames.
- **[React.plan](../../React.plan) O4:** `useNow(every)`, the view clock that `StoryFrame` pins to
  the frame's `now`.
- **[Package.plan](../../Package.plan) O1:** `StoryFrame` in `flow-state/testing`; `useNow` in
  `flow-state/react`.
- **Design docs and the reference app** use `<StoryFrame frame={…}>`.

Not yet in the plans: `StoryPlayer`, `definePlayback`, and the follow-up features of section 8.
