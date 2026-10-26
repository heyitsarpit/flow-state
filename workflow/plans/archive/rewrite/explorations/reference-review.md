# Reference review and pending API decisions

Status: input for the next decision round on [SurfaceSimplification.plan](../SurfaceSimplification.plan).
Nothing here is decided. Paths are relative to `workflow/plans/rewrite/references/` unless noted.

Sources:

- An independent read-only review of the Dispatch Desk reference at commit `fe7df2e3`, written by
  an Opus subagent against the plan, the capability Plans, the user's code-composition skill and
  lint-bomb style guide, and installed Effect 4.0.5.
- My own follow-up critique of the same reference, focused on views.

I spot-checked the review's main claims against the reference and the installed Effect
declarations; they hold. Verified: autosave fires on first entry; `TicketNotFound: E.SaveRejected`
is a payload mismatch (`editor.machine.ts:55`); `editorView` reports `blockedBy: null` when no
handler exists (`editor.selectors.ts:21`); `effect/persistence` `KeyValueStore` with
`layerStorage` and `layerMemory`, and `Context.Service.useSync`, exist in Effect 4.0.5.

## Bugs in the reference to fix directly (no decision needed)

1. **Autosave on entry.** The EDITING schedule starts on every entry, so opening a ticket saves its
   unchanged (possibly stale) title 2 seconds later, and CancelSave re-arms it. Track dirtiness
   (`edits` versus `savedEdits`) and guard AutosaveDue with `deny("NothingToSave")`. The
   `reminded` Story assertion currently fails because of this.
2. **Payload mismatch.** `failure.TicketNotFound: E.SaveRejected` passes `{ ticketId }` to an event
   that needs `{ reason }`.
3. **Unhandled looks enabled.** `blockedBy` is `null` when `can` finds no handler, so Save is
   enabled but inert in SAVED, FAILED and LOCKED.
4. **Silent give-up.** After five lock retries `RetrySave` is denied and LOCKED is stuck while the UI
   says "Retrying automatically". Express give-up as an ordered alternative transition to FAILED.
5. **Keystrokes dropped while saving.** `TitleChanged` has no handler in SAVING, so a controlled
   input freezes during an autosave.
6. **Non-deterministic Story.** "Revoked mid-save" accepts three outcomes. Use a slow-save fixture
   (`Effect.sleep` under TestClock) so the save is deterministically in flight.
7. **Fixtures restate whole services.** Override one method of the base adapter with a Layer
   instead of rewriting every function.
8. **Unseeded jitter.** Run Stories with a seeded `Random` so jittered schedules are reproducible.
9. **Watcher teaches harmful patterns.** `Restart` re-enters a state that owns no work, and
   `memory.watching` duplicates the WATCHING/PAUSED states through a redirect. Move the activity
   into WATCHING and delete the flag and the redirect.
10. **Host ceremony.** Manual consumer-before-provider disposal duplicates what Runtime disposal
    already guarantees; `ensureActor` returns a lease but is named like an actor.

## Pending API decisions (next round)

Each item gives the problem, the proposal, and the settled decision or plan clause it touches.

### P1. Public and internal events

Problem: plumbing events (timers, reactions, outcomes) are as sendable and decodable as user
events. UI code or a URL can forge `SaveSucceeded`; 8 of the editor's 15 events are plumbing.

```ts
events:   { TitleChanged: { title: Schema.String }, SaveRequested: {}, CancelSave: {}, Close: {}, Reopen: {}, RefreshRequested: {} },
internal: { AutosaveDue: {}, ReminderDue: {}, RetrySave: {}, PermissionRevoked: {},
            SaveSucceeded: { ticket: Ticket }, SaveRejected: { reason: Schema.String }, TicketLocked: { lockedBy: Schema.String }, SaveDefected: {} },
```

Only public events are accepted by `actor.send`, Stories and `Editor.Event` decoding. Internal
events may only be referenced from schedules, outcomes and reactions. Adds a lint for public
events unhandled in a reachable leaf. Extends D55.

### P2. A `stay` target

Problem: "update memory and keep the current leaf" has no spelling at a parent or root, so the
queue copies handlers into both health states through a builder. Targeting a concrete leaf from
the root type-checks but is wrong.

```ts
on: {
  SearchChanged: { target: stay, updateMemory: ({ event }) => ({ search: event.search, page: 0 }) },
  PollDue:       { target: stay, actions: [O.ticketList.refetch(listInput)] },
},
states: { HEALTHY: { on: { ListUnavailable: S.DEGRADED } }, DEGRADED: { on: { ListLoaded: S.HEALTHY } } },
```

Keeps "target is required" (D1); `stay` is an explicit token, recorded as a self-loop per leaf.
Parallel regions are not proposed: operation lanes already model the orthogonal dimensions, and
one active leaf underpins `.is`, `can`, persistence and diagrams.

### P3. Keyed actor refs with retention

Problem: there is no path to a durable per-record actor from the UI. Local actors from
`useActor` are suspended on unmount and never disposed (leak), a durable and a local editor for
one ticket can coexist, and "first input wins" lets a ref's id and input disagree.

```ts
export const editorRef = (ticket: TicketRef) =>
  actorRef(EditorMachine, ticket, {
    persist: true,
    retain: "10 minutes",
    context: { canEdit: SessionRef },
  });
// identity = canonical key of the input record; input = ticket
const editor = useActorByRef(editorRef({ workspaceId, ticketId })); // ensures on attach
```

Challenges ReactAndHosts O2 ("useActorByRef never ensures") and ApplicationsAndActors C1
("family lookup"). Supersedes my earlier `useEnsuredActor` idea.

### P4. Flow-minted attempt identity

Problem: no correct source for an idempotency key. A per-actor counter repeats across actor
lifetimes; callbacks must stay pure, so `randomUUID` is unavailable; the adapter gets nothing
stable to journal.

```ts
commit: (input: TitleEdit, { signal, attempt }) =>
  TicketApi.use((api) => api.saveTitle({ ...input, requestId: attempt.id }, signal)),
// attempt.id: stable across restore and reconciliation of one attempt, unique across actor
// lifetimes, deterministic under a Story seed
```

Challenges Transactions O4 ("no public identity getter").

### P5. Operation-scoped cache effects and an `unknown` outcome

Problem: leaving SAVING (Done, Load, restore mid-save, unmount) orphans the save: its result event
is dropped and the queue invalidation in the SaveSucceeded handler never runs. A restored pending
save sits in SAVING forever because no outcome maps Unknown.

```ts
O.saveTitle.commit(params, {
  writes: [
    O.ticketById.setData(({ value }) => ({ key: pickRef(value), data: value })),
    O.ticketList.invalidate(({ value }) => ({ workspaceId: value.workspaceId })),   // operation-scoped
  ],
  outcomes: { success: …, failure: {…}, defect: E.SaveDefected, unknown: E.SaveUncertain },
})
```

Plus a `flow check` rule for transitions that leave a waiting state without cancelling or
handling its commit. Optional and stronger: a commit declared on a state (start on entry, cancel
on exit), which reopens Statecharts C1 "invoke". Challenges the Transactions O1 sentence "no
completion-side invalidates or clears option".

### P6. `E.X.from(fn)` for outcome and reaction payloads

Problem: the payload rule is unsettled (README findings 4 and 5). Spreading a value's fields
couples events to adapter types; error fields often do not match the event; reactions call
constructors with `(current, previous)`, which does not fit one-object events.

```ts
outcomes: {
  success: E.SaveSucceeded.from((ticket) => ({ ticket })),
  failure: {
    TitleRejected:  E.SaveRejected.from(({ reason }) => ({ reason })),
    TicketNotFound: E.SaveRejected.from(() => ({ reason: "This ticket no longer exists" })),
  },
},
onContext: [{ select: ({ context }) => context.lockOwner, event: E.LockTaken.from((owner) => ({ owner })) }],
```

The event type stays static (D2, D18); only the payload is computed. Rule: a payload-free event
may be referenced bare; an event with fields uses `.from`.

### P7. `restartOn` for schedules

Problem: debounce currently needs `reenter`, which restarts everything in the state and fires on
first entry; search debounce at the queue root would need parallel regions.

```ts
schedules: { autosave: { schedule: "2 seconds", send: E.AutosaveDue(), restartOn: ({ memory }) => memory.edits } },
schedules: { settle:   { schedule: "300 millis", send: E.SearchSettled(), restartOn: ({ memory }) => memory.search } },
```

Uses the identity rule activities already follow. Complements, not replaces, placing a retry
schedule on a parent state that spans the retry loop (no API change).

### P8. `can` verdict as a tagged union

Problem: `{ allowed, denied }` cannot distinguish "no handler" from "allowed", producing an
enabled but inert button.

```ts
const save = can(snapshot, Editor.E.SaveRequested(), { explain: true });
// { _tag: "Allowed" } | { _tag: "Denied"; denials: NonEmpty<{ code; context }> } | { _tag: "Unhandled" }
Match.valueTags(save, {
  Allowed: () => "enabled",
  Denied: ({ denials }) => denials[0].code,
  Unhandled: () => "hidden",
});
```

Consistent with D61. Plus a check rule for schedule-sent events whose every handler may deny with
no alternative.

### P9. Activity reads in views

Problem: views rebuild the keys the machine subscribed with (`ref` blocks, `listInput` exported
from the machine into the UI): one fact in two places, and machine internals in UI code.

```ts
ticket: s.activities.ticket,     // ResourceState | undefined, the actor's current subscription
list:   s.activities.list,
stage:  s.activities.progress,   // StreamState
// plus s.O.saveTitle.latest for this actor's most recent attempt
```

Activity names become unique machine-wide (as schedule names are). Key-based readers stay for
data the actor does not own.

### P10. Persistence on Effect's KeyValueStore

Problem: `PersistenceStorage`, `webStorage`, `indexedDbStorage` and `memoryStorage` duplicate
`effect/persistence` `KeyValueStore`; one blob per scope rewrites everything on each capture;
two tabs on one scope silently overwrite each other.

```ts
runtimeSetup({
  app: DeskApp,
  services: Layer.mergeAll(
    DemoTicketApi,
    KeyValueStore.layerStorage(() => localStorage),
  ),
  persistence: { scope: "dispatch-desk:user-42", version: "1" },
});
```

At minimum, specify detect-and-refuse for a second same-scope writer.

### Smaller items to settle in the same round

- **Shared helper types** (README finding 2): use `Pick<typeof Editor.Snapshot.Type, "memory" |
  "context">`; make "Snapshot includes selected context" explicit in D55. No new API.
- **User switch** means a new Runtime per principal, not an in-Runtime event; session expiry is a
  Session state read through context.
- **Resource placeholder**: settle `placeholder: "previous"` so changing a list key keeps the
  previous page instead of flashing a skeleton.
- **Story ergonomics**: restore fixture seeds (dropped with D47), name schedules in
  `advanceToNextTimer({ name })`, and let model traversal include statically known schedule and
  outcome events.
- **Public type names**: `Actor<typeof Machine>` for handles and `Runtime<typeof App>` for
  runtimes (README finding 12).
- **State tokens** could expose their literal path, removing `Schema.encodeSync(Editor.State)` in
  `stateKey` and allowing `Match.value(state.path)` in view models.

## Missing for a real app

| Need                                  | Status          | Suggested shape                                                                      |
| ------------------------------------- | --------------- | ------------------------------------------------------------------------------------ |
| Per-item actors (list to detail)      | Missing         | Keyed refs with `retain` (P3)                                                        |
| Leaving while work is in flight       | Broken          | P5                                                                                   |
| Idempotent retries and reconciliation | Missing         | P4, plus a reconcile action that clears Unknown                                      |
| Orthogonal regions                    | Awkward         | `stay` (P2) and `restartOn` (P7); true parallel regions only if a third case appears |
| Debounce and search-as-you-type       | Awkward         | P7                                                                                   |
| Keep previous data and pagination     | Missing         | Resource placeholder; infinite lists as a key family with view-side concatenation    |
| Optimistic updates                    | Missing surface | Transactions O3 preview layers exist, but commit options have no preview field       |
| Forms (load, edit, dirty, save)       | Awkward         | Seed the draft from loaded data while pristine; dirty marker                         |
| Auth, user switch, expiry             | Awkward         | Runtime per principal; expiry as a Session state                                     |
| Multi-tab                             | Missing         | Same-scope writer lock or refusal (P10)                                              |
| Navigation and routing                | Fine            | Decode with the definition's Schemas; keyed refs map routes to actors                |
| Error boundaries                      | Fine            | Actor issues and memoised selector failures                                          |
| SSR                                   | Fine on paper   | Per-request Runtime; data Schemas enable seeding                                     |
| Undo                                  | Expressible     | Memory history and events                                                            |
| Offline                               | Out of scope    | Serialised transactions plus persistence get partway                                 |

## Worth preserving

- The definition/machine split, with operations bound by name.
- `deny(code, context)` flowing into `can(…, { explain: true })` and `flow explain`.
- Derived keys and partial-record invalidation.
- Activity parameters that read context, re-keying without reactions or events.
- Health-dependent polling as two states with different Schedules.
- Fixtures as Layers, explicit `process()`, and checkpoints as immutable evidence.
- One `FlowError`, `flow.config.ts`, and on-demand graph and diff.
