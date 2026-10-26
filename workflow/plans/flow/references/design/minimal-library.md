# A minimal Flow State (version 2)

Status: **adopted.** [FlowState.plan](../../FlowState.plan) adopts this document's decisions: 1 to 8a
were agreed with the user, and the plan adopts 9 (actor-to-actor send, its D27), 10 (persistence,
D41) and 11 (Stories and tooling, D42). Where this document and the plan differ, the plan wins;
[the Dispatch Desk reference](../dispatch-desk/README.md) shows every decision in a working
application. Version 2 revised version 1 after a review against about fifty common React patterns.

The test for every name: an author must write it, or a tool must call it, and nothing else
already covers it. Guarantees (ordering, atomic publication, fencing, no replay, honest
uncertainty) all stay; only their vocabulary moves inside.

## The public surface

```text
flow-state           definition  machine  app  actorRef  runtimeSetup
                     resource  transaction  stream
                     deny  check  send  FlowError
                     types: Definition  Machine  App  ActorRef  Actor  Snapshot  Runtime  Diagnostic
flow-state/react     FlowProvider  useActorByRef  useActor  useView
flow-state/testing   story  model  defineConfig  CheckpointProvider
flow-state/inspect   inspect  render  attachInspector  trace
```

Everything else is a field inside one of these calls, or an Effect primitive (Schema, Layer,
Schedule, Stream, Match, Duration, KeyValueStore).

**A boundary the docs should state:** not everything belongs in an actor. Open/closed toggles,
tooltips, theme, field-by-field form input and drag coordinates are better as React state or a
form library. An actor earns its place through guards, operations, schedules, persistence, or
being part of a Story.

---

## 1. Actors: the original model, with its gaps fixed (agreed)

An actor is an instance of a machine, and the machine stays the unit: the app lists machines,
and actors are created from them. Version 1's redesign ("every actor has a ref", "the app lists
actors", three declared kinds) is withdrawn. It added more concepts than it removed, and the
original model already handles shared, per-record and per-component actors.

There are two kinds of actor:

| Kind                       | Same call twice gives… | Host                                      | React                            |
| -------------------------- | ---------------------- | ----------------------------------------- | -------------------------------- |
| **Shared**, named by a ref | the same actor         | `runtime.ensureActor(ref, { input })`     | `useActorByRef(ref, { input? })` |
| **Local**, anonymous       | a new actor each time  | `runtime.createActor(machine, { input })` | `useActor(machine, { input })`   |

The whole actor surface:

| API                                                      | Meaning                                                                                              |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `actorRef(machine, id, { persist?, retain?, context? })` | Names a shared actor; its wiring is declared once                                                    |
| `runtime.ensureActor(ref, { input })`                    | Finds the named actor, or creates it                                                                 |
| `runtime.createActor(machine, { input })`                | Makes a new anonymous actor                                                                          |
| `runtime.disposeActor(actor)`                            | Gets rid of it: in-flight work settles, then it is gone                                              |
| handle `ref`, `send`, `getSnapshot`, `snapshots`         | The actor itself: its address, commands and reads                                                    |
| `useActorByRef(ref, { input? })`                         | The named actor in a component. With `input` it ensures; without, it is lookup-only. Accepts `null`. |
| `useActor(machine, { input })`                           | A new actor per component, disposed shortly after unmount                                            |
| types `ActorRef<M>`, `Actor<M>`, `Snapshot<M>`           | For typing domain hooks, props and view models                                                       |

```tsx
// Shared: a ref per ticket; the same ticket always names the same actor.
export const editorRef = (t: TicketRef) =>
  actorRef(EditorMachine, `${t.workspaceId}/${t.ticketId}`, { persist: true, retain: "10 minutes" });

// Local: a fresh actor for every mounted row (the list-of-buttons case).
function ItemRow({ item }: { item: Item }) {
  const button = useActor(RowButtonMachine, { input: { itemId: item.id, label: item.label } });
  …
}
items.map((item) => <ItemRow key={item.id} item={item} />);
```

**Lifetime:**

- **Local actors** are disposed shortly after their component unmounts. A short internal grace
  period lets Strict Mode remounts reattach to the same actor.
- **Shared actors** live for the Runtime, or for `retain` after their last use, or until
  `disposeActor`.
- **Disposal always waits for in-flight commits to settle**, so leaving a screen never cancels a
  save.
- **Attaching happens in an effect, never in render**, so discarded renders and Suspense create
  nothing.

**Changes from today:**

- **Renamed:** lease `dispose` becomes `runtime.disposeActor`.
- **Kept:** `useActorByRef` gains `{ input }` so a component can ensure a durable per-record actor
  (the gap the review found), and accepts `null` for unresolved route params.
- **Added:** `retain` on refs, and the `Actor<M>` and `Snapshot<M>` types.
- **Deleted:** the lookup-only `runtime.getActor`, `story.actor`, and call-site `contextBindings`
  (see decision 2).
- **`ensureActor` keeps its name on purpose.** "Get" would suggest the actor must already exist;
  "ensure" says it is created if needed.
- **Open:** React Activity runs cleanups when hidden, so a local actor hidden longer than its grace
  period is disposed. That needs a decision, or a `retain` option for local actors.

## 2. Wiring is declared once: on the ref, or as an app default

Today `contextBindings` is repeated at every place a local actor is created. Instead:

```ts
export const DeskApp = app({
  id: "dispatch-desk",
  machines: {
    session: SessionMachine,
    // A default for every actor of this machine, including local ones.
    editor: { machine: EditorMachine, context: { canEdit: SessionRef } },
    queue: QueueMachine,
  },
});

// A shared actor may also set its wiring on its ref, including wiring derived from its identity:
export const queueRef = (workspaceId: string) =>
  actorRef(QueueMachine, workspaceId, { context: { userId: SessionRef } });
```

- **A local actor** inherits the app default for its machine.
- **A shared actor** uses its ref's `context`, falling back to the default.
- **The app still lists machines:** the closed universe and the static wiring graph are unchanged.
- **Open:** lazy-loaded features. Listing every machine pulls every feature into the entry bundle.
  A lazy entry, `editor: lazy(() => import("./editor/editor.machine.js"))`, could come after
  version 1.

## 3. Domain hooks wrap the raw hooks

Real apps don't call `useActorByRef` in every component. They write one hook per feature, so
the raw names appear only a few times. That is why clear names matter more than short ones.

```tsx
// features/Tickets/editor/useEditor.ts
export function useEditor(ticket: TicketRef) {
  const editor = useActorByRef(editorRef(ticket), { input: ticket });
  return {
    editor, // components select from it narrowly (decision 8)
    rename: (title: string) => editor.send(Editor.E.TitleChanged({ title })),
    save: () => editor.send(Editor.E.SaveRequested()),
  };
}

const { editor, rename } = useEditor(ticket);
const draft = useView(editor, (s) => s.memory.draft);
```

**Guarantees the library makes so these wrappers are trivial and correct:**

- `useActorByRef` returns the same handle across renders for the same ref, compared by id rather
  than by object, because `editorRef(ticket)` is a new object each render.
- `send` and event constructors are referentially stable, so commands pass to memoised children
  without `useCallback`.
- `useView` does not resubscribe when an inline selector changes identity, and accepts a selector
  defined outside the component.
- `useActorByRef(null)` returns `null`, because hooks cannot be called conditionally.

**Guideline for authors and agents:** a domain hook composes an actor, a view and commands, and
nothing else. Business logic inside a hook (a `useEffect` that sends events on a condition, or
state of its own) is invisible to `graph`, `explain` and Stories, so a lint can flag it. Local
actors have no address, so handing one to deep children is ordinary React context.

**Host side, unchanged:** `runtimeSetup(config).construct()`, `runtime.ready()`,
`runtime.runPromise`, `runtime.dispose()`. Folding setup and construct into one `createRuntime`
call is a separate, still-open candidate. Prefetching needs no new API:
`runtime.ensureActor(editorRef(t), { input: t })` warms the editor and its subscriptions.

## 4. Public events and `internalEvents` (agreed)

A definition declares two event lists:

```ts
events: {                // what users and other actors may send
  TitleChanged: { title: Schema.String },
  SaveRequested: {},
  CancelSave: {},
  Close: {},
  Reopen: {},
},
internalEvents: {        // sent only by this actor's own schedules, reactions and outcomes
  TicketLoaded: { title: Schema.String },
  AutosaveDue: {},
  PermissionRevoked: {},
  Saved: { ticket: Ticket },
  SaveFailed: { reason: Schema.String },
  SaveUncertain: {},
},
```

- **Public events** can be sent by `actor.send`, Stories, other actors (decision 9), and by
  decoding `Editor.Event` at a boundary.
- **Internal events** can only be referenced from `schedules`, `onContext` reactions and operation
  `outcomes`. Sending one from outside is a type error, and decoding one is rejected. This removes
  the bug class where a component or URL could forge an outcome such as `Saved`.
- **Inside the machine both lists behave identically:** the same `on` handlers, guards and
  transitions.
- **Stories send only public events.** They reach internal events through their real sources:
  `advance`, `advanceToNextTimer`, fixtures and providers. There is no test-only escape.
- **Opaque payloads:** a public event of a non-persisted machine may carry an opaque value such as
  `Schema.instanceOf(File)`, so an upload can receive its `File`. Traces redact such fields.
- **Tooling** shows the two lists separately, and `flow check` warns about a public event that is
  unhandled in a reachable state (for example `TitleChanged` while SAVING, which drops keystrokes).
- **Naming:** `internalEvents`, camelCase like every other definition field, and explicit next to
  `events`. Considered and rejected: `internal` (internal what?), `private` (echoes the TypeScript
  keyword), `signals`, `opaque`.

## 5. `.from` computes a payload; the event stays static (agreed)

Today the outcome value itself becomes the event's payload, so events must copy API shapes, and two
errors with different shapes cannot share one event. This was a real bug in the reference:

```ts
// Before
events: { SaveSucceeded: Ticket.fields, SaveRejected: { reason: Schema.String } },
outcomes: {
  success: E.SaveSucceeded,                  // payload = the Ticket itself
  failure: {
    TitleRejected: E.SaveRejected,           // works only because TitleRejected also has { reason }
    TicketNotFound: E.SaveRejected,          // bug: passes { ticketId }, SaveRejected needs { reason }
  },
},

// After: the machine chooses its own payload
internalEvents: { Saved: { ticket: Ticket }, SaveFailed: { reason: Schema.String } },
outcomes: {
  success: E.Saved.from((ticket) => ({ ticket })),
  failure: {
    TitleRejected: E.SaveFailed.from(({ reason }) => ({ reason })),
    TicketNotFound: E.SaveFailed.from(() => ({ reason: "This ticket no longer exists" })),
  },
},
```

**Why not a plain callback** (`success: (t) => E.Saved({ ticket: t })`)? A callback hides which event
is sent, so tools cannot draw the edge (D2). `.from` keeps the event static and computes only the
payload.

**The rules:**

- **One form:** a payload-free event is referenced bare (`E.SaveDefected`); an event with fields
  always uses `.from`, even when the value already matches the payload.
- **Everywhere an event is produced from a value:** operation outcomes (the value or error),
  stream values, `onContext` reactions (the selected value) and schedule `send` (the schedule's
  metadata, for example `E.RetrySave.from(({ attempt }) => ({ attempt }))`). This replaces the
  reaction rule that called constructors with `(current, previous)`, which did not fit one-object
  events; `previous` stays available in `when`.
- **Name:** `.from`, read as "Saved, built from the ticket". Considered and rejected: `.map`
  (suggests transforming an existing event), `.with` (suggests adding fields), `.of` (usually
  means wrapping a value as-is).

## 6. Commits own their consequences (agreed)

**What changes is _where_ a cache effect lives:**

```ts
// Before: the invalidation runs only if the actor is still in SAVING when the result arrives
SAVING: { on: { SaveSucceeded: { target: S.OPEN.SAVED, actions: [invalidate(O.ticketList, …)] } } }
// User clicks Done while saving → CLOSED → SaveSucceeded is unhandled → the queue keeps the old title.

// After: part of the commit, applied when the save settles, whatever state the actor is in
O.saveTitle.commit(params, {
  optimistic: [O.ticketById.setData(({ input }) => ({ key: ref(input), data: (t) => t && { ...t, title: input.title } }))],
  writes: [
    O.ticketById.setData(({ value }) => ({ key: ref(value), data: value })),
    O.ticketList.invalidate(({ value }) => ({ workspaceId: value.workspaceId })),
  ],
  outcomes: {
    success: E.Saved.from((ticket) => ({ ticket })),
    failure: { … },
    unknown: E.SaveUncertain,
  },
})
```

- **`writes`** apply when the commit settles, whatever state the actor is in by then. They may
  contain `setData`, `invalidate` and `clear`. This reverses the Transactions plan's "no
  completion-side invalidates or clears option".
- **`optimistic`** writes apply when the commit starts. They revert automatically on failure or
  defect (fencing ensures a revert never overwrites newer data) and stay, marked as pending, on
  `unknown`. **Every reader of that cache entry sees the optimistic value**, as in TanStack Query,
  so a list rendered by another actor updates immediately. This reverses the Transactions plan's
  actor-local preview layers (its D2).
- **`unknown`** is an optional outcome member, alongside `success`, `failure`, `defect` and
  `interrupt`. It fires for a commit that may have reached the server: cancelled after sending,
  restored mid-flight, or abandoned. Every wait therefore has an exit.
- **`attempt.id`:** Flow mints an identity for each attempt and passes it to the adapter as
  `commit: (input, { signal, attempt })`. It is random in production, seeded in Stories, persisted
  with the attempt, and reused when the attempt is reconciled. This reverses the Transactions
  plan's "no public identity getter".
- **`flow check`** warns (not errors) when a transition leaves a state that is waiting on a
  commit's outcome events without cancelling the commit or handling those events in the target.
  Leaving can be intended, and the commit's `writes` still apply.

## 7. Grammar: delete `reenter` and `redirect`; add `restartOn` and `target: "self"` (agreed)

- **Deleted:** `reenter` (its only real use was restarting a debounce) and `redirect` (both
  reference uses mirrored memory into state, an anti-pattern; a condition belongs in the guard of
  the transition that changes the memory).
- **Added: `restartOn` on a schedule.** It restarts only that schedule when a value changes:
  `{ schedule: "2 seconds", send: E.AutosaveDue, restartOn: ({ memory }) => memory.draft }`. A
  schedule with `restartOn` stays idle until the value first changes, so a debounce never fires on
  entry.
- **Added: `target: "self"` means no state change.** The active state stays exactly as it is, with
  no exit and no entry; only memory updates and actions run. It works the same on a leaf, a
  parent or the root, so handlers that only update memory can be declared once on a parent:

  ```ts
  on: {
    SearchChanged: { target: "self", updateMemory: ({ event }) => ({ search: event.search, page: 0 }) },
    PollDue: { target: "self", actions: [O.ticketList.refetch(listInput)] },
  },
  ```

  It cannot collide with a state, because targets are typed state tokens (objects, D9) and
  `"self"` is the single string literal the target type allows. It is the only spelling for
  staying: `flow check` flags a transition that targets its own state token. Diagrams draw it as a
  loop on every state it applies to.

- **Changed: the nearest handler wins.** A child's handler overrides its parent's (the standard
  statechart rule), replacing today's rejection of the same event on both. `flow graph` and
  `flow check` show every override, because a parent's handler can otherwise be shadowed unnoticed.

```ts
// The editor's Saved: update memory anywhere, but move SAVING on to SAVED
on: { Saved: { target: "self", updateMemory: ({ event }) => ({ draft: event.ticket.title, dirty: false }) } },
SAVING: { on: { Saved: { target: S.OPEN.SAVED, updateMemory: () => ({ dirty: false }) } } },
```

Patterns considered for "stay" and rejected: no target (implicit), a `stay` value from the
machine callback, a reserved `S.self` or `S.stay` token (collides with state names), a
`stay: true` field (a second way to say where a transition goes), separate `update`/`go`
constructors, a separate `updates` map (cannot mix with ordered alternatives), and self-targeting
the declaring node (needs a rule to learn).

## 8. Views: select narrowly from a plain snapshot (agreed)

The snapshot is plain frozen data with no methods: `state`, `memory`, `context`, `issues`,
`lifecycle` and `activities`. Every other read is a token or function applied to it, in the style of
`S.X.is(s)`. Story checkpoints are therefore serialisable, and reads are passive by construction.

**`useView(actor, select)` is the only read hook.** It subscribes a component to one question about
one actor; it adds only the subscription and field-wise equality. Each component selects the
narrowest thing it needs, as with XState's `useSelector`. How narrowly a component selects decides
how often it re-renders. There is no central view model passed down as props: a record with `draft`
in it re-renders every section on every keystroke.

```tsx
function TicketPanel({ editor }: { editor: EditorActor }) {
  const state = useView(editor, (s) => s.state); // re-renders on phase change only
  const body = {
    CLOSED: <ClosedTicket editor={editor} />,
    "OPEN.EDITING": <OpenTicket editor={editor} />,
    // … one entry per state
  } satisfies Record<typeof Editor.State.Type, ReactNode>; // a new state fails to compile
  return body[state];
}

function TitleField({ editor }: { editor: EditorActor }) {
  const draft = useView(editor, (s) => s.memory.draft); // only this re-renders per keystroke
  return (
    <input value={draft} onChange={(e) => editor.send(E.TitleChanged({ title: e.target.value }))} />
  );
}

function SaveButton({ editor }: { editor: EditorActor }) {
  const save = useView(editor, (s) => check(s, E.SaveRequested()));
  return (
    <button disabled={save._tag !== "Allowed"} onClick={() => editor.send(E.SaveRequested())}>
      Save
    </button>
  );
}

function TechnicianBadge({ editor }: { editor: EditorActor }) {
  const stage = useView(editor, (s) => s.activities.progress?.data?.stage);
  return stage ? <span className="badge">Technician {stage}</span> : null;
}
```

**Rules for views:**

- Branch on `s.state` exhaustively when choosing between several states. A narrow
  `S.X.is(s)` boolean is fine in a component that cares about one state.
- When a view needs a phase that spans several states, add a parent state to the machine, not a
  boolean in the view. XState-style tags are deferred until a case needs grouping across parents.
- Enablement comes only from `check`, never combined with state.
- A shared function is for facts the machine does not own (a lane's loading status, the message for
  a deny code), called from each component's own selector.

**What a component can read:**

| Kind                                         | Read with                                                   |
| -------------------------------------------- | ----------------------------------------------------------- |
| Phase                                        | `s.state`, `S.X.is(s)`                                      |
| Actor data, provider data, unmapped outcomes | `s.memory`, `s.context`, `s.issues`                         |
| Resource or stream the actor subscribes to   | `s.activities.<name>`                                       |
| Cache entry the actor does not own           | `O.x.get(s, keyInput)`                                      |
| Eligibility                                  | `check(s, event)`                                           |
| Transactions                                 | not read: outcome events put them into `s.state`/`s.memory` |

1. **`s.activities.<name>`** is the lane of the actor's own subscription, so the view never
   rebuilds the machine's key. Activity parameters may read earlier activities, in declaration
   order; a cycle is a static error. A lane is `undefined` while its activity is not running or its
   key is falsy.
2. **Every lane carries `data`** (the value or `undefined`), so `"data" in lane` and `getData` go.
   Absence is `undefined` everywhere, so the `Missing` tag is deleted.
3. **`placeholder` is a function**, like TanStack Query's `placeholderData`, so it can be
   conditional. When the key changes and the new key has no data, it receives `previous` (`{ input,
   data }` from the last lane of this activity that had data) and the new `input`, and returns data
   to show or `undefined`. While it shows, the lane is `Pending` with `data` and `placeholder: true`.
   ```ts
   activities: {
     // keep the page while paging, but not when the filter changes
     list: O.ticketList.subscribe(listInput, {
       placeholder: ({ previous, input }) =>
         previous?.input.status === input.status ? previous.data : undefined,
     }),
     user: O.userById.subscribe(({ memory }) => ({ id: memory.userId })),
     org: O.orgById.subscribe(({ activities }) => activities.user?.data && { id: activities.user.data.orgId }),
   }
   ```
4. **`check(s, event)`** is the only eligibility function. It returns `Allowed | Denied | Unhandled`,
   matched with `Match.valueTags`. `Denied` carries a non-empty list of `{ code, context }` and is a
   `Data` class, so a verdict in a selector re-renders only when it changes. `can` and
   `can(…, { explain: true })` are deleted.
5. **`O.x.get(s, keyInput)`** peeks at a resource or stream cache entry by key input. It is passive:
   a miss returns `undefined` and starts nothing. Its uses are tests and Stories asserting on the
   cache, and showing cached data the actor did not fetch; components that need data subscribe
   through `activities`.
6. **Transactions are not read by views.** A commit belongs to one actor, and decision 6 already
   returns every result, including `unknown`, as an event. The machine records what it means:
   ```ts
   outcomes: { success: E.Saved.from((ticket) => ({ ticket })), unknown: E.SaveUncertain }
   // SaveUncertain → memory.maybeSaved; a list reads `pending` on the cache lane (8a)
   ```
   "Saving" is `S.OPEN.SAVING.is(s)`. A machine that maps no outcomes gets an issue (D20).

The principle: **cache entries are read; an actor's own attempts are reacted to.** Components do not
subscribe to data without a machine; revisit when a real display-only case is painful.

**Obligations:** lanes are stored in the snapshot, never computed from live state at read time, so
checkpoints show the truth of their own moment; a lane keeps its object identity until its entry
changes, so field-wise equality in `useView` holds.

**Deleted:** `.key()`, `.getData()`, `getState`, the `Missing` tag, transaction readers, resource
`.cancel()`, `can`, `explain`, snapshot `timers`. **Kept:** `.clear()`, for removing a deleted record,
and snapshot `lifecycle`.

### What the read API keeps

Every guarantee stays: a tear-free cut of actor and cache, passive reads that insert nothing,
reading data and keys the actor does not own, historical checkpoint reads, `useView` equality and
selector-error memoisation.

| Today                                                         | Now                                                |
| ------------------------------------------------------------- | -------------------------------------------------- |
| `state`, `S.X.is`, `memory`, `context`, `issues`, `lifecycle` | unchanged                                          |
| `s.O.x.getState(key)` for own data                            | `s.activities.x`                                   |
| `s.O.x.getState(key)` for other data                          | `O.x.get(s, keyInput)`                             |
| `.getData(key)`                                               | `.data` on every lane                              |
| `.key(P)`                                                     | not needed: readers take key input                 |
| transaction state per key                                     | outcome events into state and memory               |
| `can`, `can(…, { explain: true })`                            | `check`, which also reports Unhandled              |
| descriptor `placeholder` metadata                             | `placeholder` function on the activity             |
| one view model per actor                                      | narrow `useView` per component                     |
| resource `.cancel`                                            | lost: leaving the state or a newer request cancels |
| snapshot `timers`                                             | inspection; a countdown puts `dueAt` in memory     |

## 8a. Follow-ups from the surface analysis (agreed)

From a review of the agreed surface, accepted with these examples.

**Guards fall through.** The nearest handler wins only while one of its transitions is enabled;
when all of them decline, the parent's handler is considered, as in XState. `check` follows the same
rule, and `Denied` collects the reasons from every level tried. `flow graph` draws the fallthrough.

```ts
OPEN: {
  on: { Escape: S.CLOSED },
  states: {
    EDITING: {
      on: {
        Escape: {
          target: "self",
          guard: ({ memory }) => memory.dirty || deny("NothingToDiscard"),
          updateMemory: ({ memory }) => ({ draft: memory.saved, dirty: false }),
        },
      },
    },
  },
}
// dirty: discards edits. clean: EDITING declines, so OPEN closes.
```

**Resource lanes carry `pending`.** It is true while an optimistic write on that entry is
unsettled, and stays true on `unknown`. Lists show per-row saving from the entry they already read,
with no memory bookkeeping.

```ts
const entry = useView(queue, (s) => ticketById.get(s, row));
<Star on={entry?.data?.starred} busy={entry?.pending} />
```

**`CheckpointProvider` in `flow-state/testing`** renders components at a Story checkpoint. It
supplies frozen snapshots; `send` is recorded on the checkpoint instead of run; a local actor
resolves only if it existed at that checkpoint.

```tsx
const run = await saveFlow.run();
render(
  <CheckpointProvider checkpoint={run.checkpoints.saving}>
    <PinnedTicket editorRef={EditorRef} />
  </CheckpointProvider>,
);
expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
```

**`S.X.is(s)` narrows types**, so inside OPEN its activities' lanes are present, and
**`S.X.child(s)`** returns the active direct child of X as a literal (`undefined` outside X), so each
component matches one level exhaustively. `S.root.child(s)` gives the top level.

```tsx
const top = useView(editor, (s) => S.root.child(s)); // "OPEN" | "CLOSED"
const step = useView(editor, (s) => S.OPEN.child(s)); // "EDITING" | "SAVING" | "SAVED" | "FAILED" | undefined
const title = useView(editor, (s) => (S.OPEN.is(s) ? s.activities.ticket.data?.title : undefined));
```

**`send` to a ref with no actor** never creates it: the event is dropped and a `SendTargetAbsent`
diagnostic names sender, target and event. `flow check` warns when a send target is not ensured at
startup.

**Specification fixes:**

- `useView` compares with `Equal.equals` (whole value and field by field), so `Data` verdicts from
  `check` re-render only when they change.
- All actors of a Runtime publish into one versioned store, so several `useView` calls in one render
  see the same version.
- An activity name refers to one operation within a machine; anything else is a static error.
- `placeholder`'s `previous` is kept per actor and activity name across exit and re-entry, and is
  never persisted.
- `get` lives on the resource or stream descriptor: `ticketById.get(s, input)`. Machine `O` tokens
  are the same descriptors.
- `check` on an internal event is a type error.
- Story checkpoints serialise each cache version once per run and share it.

**Lints added:** a component whose `check` event differs from the event it sends; a memory field
written only from a value outcome and never used by the machine (read the lane instead).

**Documented non-goals for version 1:** parallel regions (use separate actors), machine-spawned
child actors (use `useActor` or refs), history states, and Suspense or error-boundary integration.

## 9. Actors can tell other actors something

**New in version 2.** Pull-only context covers "B reads A", but toasts after a save, "reset on
logout" and analytics ended up as React effects that tools cannot see and Stories do not cover.

```ts
Saved: {
  target: S.OPEN.SAVED,
  actions: [send(ToastsRef, Toasts.E.Push.from(({ event }) => ({ text: `Saved “${event.ticket.title}”` })))],
}
```

- **Allowed targets:** only shared actors named by a ref (never local actors), and only public
  events.
- **Delivery:** asynchronously, as a FIFO turn of the target, never inside the sender's turn.
- **Static:** the edge `Editor --Saved--> Toasts.Push` is in the graph.
- **No reads:** this does not make context bidirectional. Reads stay acyclic.
- **Telemetry:** for production telemetry, `attachInspector` is the supported observer; it is no
  longer described as tooling only.

## 10. Persistence, services and multi-tab

```ts
export const DeskSetup = runtimeSetup({
  app: DeskApp,
  services: Layer.mergeAll(
    DemoTicketApi,
    KeyValueStore.layerStorage(() => localStorage),
  ),
  persistence: { scope: "dispatch-desk:user-42", version: "1" },
});
```

- **What persists:** ref `persist` and resource `persist` decide; transactions and streams follow
  their actor, and memory is encoded with the definition's Schemas.
- **Deleted:** `webStorage`, `indexedDbStorage`, the codec option and the seven `Persistence*`
  types.
- **A different user** means a new Runtime. The documented recipe: an anonymous Runtime for login,
  a user-scoped Runtime after it, and `<FlowProvider key={scope}>` so React remounts on the switch.
- **A second tab** on the same scope runs without persistence and reports a diagnostic, instead of
  silently overwriting the first tab.
- **Auth tokens** reach service Layers through a documented token-holder service that the Auth
  machine updates through an operation. No new API.
- **SSR hydration** is explicitly out of scope for version 1. A per-request Runtime with an
  in-memory `KeyValueStore` already supports server rendering.

## 11. Stories and tooling

```ts
export const saveFlow = story
  .app(DeskSetup, { id: "ticket-save", fixtures: [SlowSave] })
  .send(editorRef(T42), Editor.E.TitleChanged({ title: "Replace foyer light" }))
  .send(editorRef(T42), Editor.E.SaveRequested())
  .process()
  .checkpoint("saving") // deterministic: the fixture's save takes 2s of TestClock
  .advance("2 seconds")
  .process()
  .checkpoint("saved");
```

- **Stories:** app Stories target refs (`story.actor` recipes are gone). A local actor is reached through
  `story.machine(machine, { input })`, the focused Story kind, since local actors have no address.
  Stories run under a seeded `Random`.
- **Fixtures:** Layers that override one method of the base adapter.
- **Story commands:** `send`, `process`, `advance`, `advanceTo` (for cron), `advanceToNextTimer`,
  `checkpoint` and `run`. `setContext` stays for focused Stories.
- **Deleted:** `story.actor`, and the `title`, `description` and `maxTurns` options.
- **Inspect:** `trace` keeps `import` and `export`; summarise and diff stay CLI commands.
- **CLI:** `trace proof` is deleted.

---

## The editor, end to end

`ref`, `canSave` and `commitDraft` are small helpers; `commitDraft` is the commit in decision 6.

```ts
export const EditorMachine = machine(Editor, ({ S, E, O }) => ({
  default: S.OPEN,
  onContext: [
    {
      select: ({ context }) => context.canEdit,
      when: (canEdit) => !canEdit,
      event: E.PermissionRevoked,
    },
  ],
  on: {
    PermissionRevoked: { target: S.CLOSED, actions: [O.saveTitle.cancel(ref)] },
    Saved: {
      target: "self",
      updateMemory: ({ event }) => ({ draft: event.ticket.title, dirty: false }),
    },
    SaveUncertain: { target: "self", updateMemory: () => ({ maybeSaved: true }) },
  },
  states: {
    OPEN: {
      default: S.OPEN.EDITING,
      activities: {
        ticket: O.ticketById.subscribe(ref, {
          outcomes: { value: E.TicketLoaded.from((t) => ({ title: t.title })) },
        }),
      },
      on: { Close: S.CLOSED },
      states: {
        EDITING: {
          schedules: {
            autosave: {
              schedule: "2 seconds",
              send: E.AutosaveDue,
              restartOn: ({ memory }) => memory.draft,
            },
          },
          on: {
            TicketLoaded: {
              target: "self",
              guard: ({ memory }) => !memory.dirty || deny("KeepLocalEdits"),
              updateMemory: ({ event }) => ({ draft: event.title }),
            },
            TitleChanged: {
              target: "self",
              updateMemory: ({ event }) => ({ draft: event.title, dirty: true, error: "" }),
            },
            SaveRequested: { target: S.OPEN.SAVING, guard: canSave, actions: [commitDraft] },
            AutosaveDue: {
              target: S.OPEN.SAVING,
              guard: (i) => i.memory.dirty && canSave(i),
              actions: [commitDraft],
            },
          },
        },
        SAVING: {
          on: {
            TitleChanged: {
              target: "self",
              updateMemory: ({ event }) => ({ draft: event.title, dirty: true }),
            },
            Saved: { target: S.OPEN.SAVED, updateMemory: () => ({ dirty: false, error: "" }) },
            SaveFailed: {
              target: S.OPEN.FAILED,
              updateMemory: ({ event }) => ({ error: event.reason }),
            },
            CancelSave: { target: S.OPEN.EDITING, actions: [O.saveTitle.cancel(ref)] },
          },
        },
        SAVED: {
          on: {
            TitleChanged: {
              target: S.OPEN.EDITING,
              updateMemory: ({ event }) => ({ draft: event.title, dirty: true }),
            },
          },
        },
        FAILED: {
          on: {
            TitleChanged: {
              target: S.OPEN.EDITING,
              updateMemory: ({ event }) => ({ draft: event.title, dirty: true }),
            },
            SaveRequested: { target: S.OPEN.SAVING, guard: canSave, actions: [commitDraft] },
          },
        },
      },
    },
    CLOSED: { on: { Reopen: S.OPEN } },
  },
}));
```

What changed against today's reference:

- The draft is seeded from loaded data while pristine, so there is no stale `title` input.
- Autosave fires only for dirty drafts, and restarts on edits without re-entering.
- Keystrokes during a save or after a failure are kept, and FAILED can retry.
- A save whose result is unknown sets `maybeSaved` in any state, including CLOSED.
- A save that finishes after Close still updates memory (the root `Saved` handler) and the queue
  (the commit's `writes`).

## Deleted or absorbed

| Gone                                                                                                                                                      | Replaced by                                                                             |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `InputOf`, `MemoryOf`, `StateOf`, `EventOf`, `RequirementsOf`, `CanonicalKeyInput`, `StateToken`, `EventToken`, `Resource`, `Transaction`, `Stream` types | The definition's derived Schemas (`typeof Editor.Event.Type`); Layer types              |
| Lookup-only `getActor`, lease objects, call-site `contextBindings`                                                                                        | `ensureActor` / `useActorByRef`, `runtime.disposeActor`, wiring on refs or app defaults |
| `story.actor`, Story `title`, `description`, `maxTurns`                                                                                                   | Refs, `story.machine`                                                                   |
| `reenter`, `redirect`                                                                                                                                     | `restartOn`, `target: "self"`, guards                                                   |
| Machine callback `invalidate`, `clear`                                                                                                                    | `O.x.invalidate`, `O.x.clear` in actions or `writes`                                    |
| `.key`, `.getData`, `getState`, resource `.cancel`                                                                                                        | Key inputs, `O.x.get`, `s.activities`, lane `.data`, leaving the owning state           |
| `can`, `can(…, { explain: true })`, transaction readers, `Missing`                                                                                        | `check(…)`, outcome events, `undefined`                                                 |
| `runPromiseExit`                                                                                                                                          | `runPromise(Effect.exit(…))`                                                            |
| Snapshot `timers`                                                                                                                                         | Inspection                                                                              |
| `webStorage`, `indexedDbStorage`, codec, `Persistence*` types                                                                                             | `KeyValueStore`, definition Schemas                                                     |
| `trace.summarize`, `trace.diff`, `trace proof`                                                                                                            | CLI commands                                                                            |

## What we lose, and what we accept

| Loss                                         | Status                                                                          |
| -------------------------------------------- | ------------------------------------------------------------------------------- |
| Eventless transitions (`redirect`)           | Accepted. Revisit if a real case appears.                                       |
| Strict ancestor/descendant handler rejection | Accepted. The nearest handler wins; overrides are visible in tools.             |
| Infinite lists as one cache entry            | Deferred. Version 1 stitches pages in memory; a pages resource mode can follow. |
| SSR hydration                                | Deferred. Out of scope for version 1.                                           |
| Lazy-loaded features                         | Deferred. A lazy app entry is sketched in decision 2.                           |
| Multi-tab shared persistence                 | Deferred. The second tab runs without persistence.                              |

## Risks

- **Type inference** for app wiring defaults, `.from`, per-tag outcome
  tables, `s.activities`, `target: "self"` and `send(ref, …)` is the heaviest remaining type work
  (the V2 spike).
- **Retention and grace timing** must be specified exactly and driven by the Runtime clock, so
  Stories stay deterministic.
- **Actor-to-actor `send`** could become an event bus that hides control flow. Limiting it to public
  events, shared actors and visible graph edges is the guard rail.
