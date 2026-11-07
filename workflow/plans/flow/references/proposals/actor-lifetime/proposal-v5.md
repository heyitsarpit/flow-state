# Actor lifetime, version 5: the blunt rule, converged

Status: **PROPOSED; convergence of v4 and its two reviews**, 2026-11-07. The blunt rule, fixes 1–12, decisions 13–15,
improvements 1–4 and the stated limits in [brief-blunt.md](brief-blunt.md) are the user's. Everything this file adds or
changes is proposed until the user accepts it; section 15 asks the open questions, and the calls that depart from an
accepted item are listed as **D1–D5** below. Inputs: [proposal-v4.md](proposal-v4.md) and
[findings-v4.md](findings-v4.md) (reviews A and B). Paths are from the repository root; MD =
`workflow/plans/flow/references/explorations/machine-fragments/machine-design.md`. Code marks: **NEW**, **NEW
MEANING**, **RENAMED**, **REMOVED**, existing, user-defined. Prior art: v4, v3, v2 and v1 beside this file, all kept.

**Departures from accepted items** (each in section 15 or the table in section 16):
- **D1.** Scheduled work runs only while the actor is used (it waits while the actor is kept only by work in flight).
  Neither review proposed this. It resolves A-M-f/B-L3 (the heartbeat that never ends), B5 (a non-persisted debounce
  that fires or not by timing) and the late write in A-M-d/B-L1 together, and it is the React rule: an unmounted
  component's timers stop, and its request already sent still returns. Q2.
- **D2.** "Writes in flight" becomes "finite work in flight": B-H1's reads in a chain, and B-H2's endings owed at `ready`.
- **D3.** Decision 13 (records cliff) is replaced: only records that equal a fresh start are dropped. Q3.
- **D4.** Decision 15 (one `onContext` on return) holds within a Runtime only; a reload's baselines stay silent (A-M-g).
- **D5.** Local actors made by `useActor` get the in-flight exception and a remount rule (v4 Q2 A, both reviews). Q4.

## 0. The rule

**A shared actor lives while something uses it, plus until its finite work already in flight has returned. Its
schedules fire only while it is used, and end with it.** Uses are attached consumers, `snapshots` subscriptions, bound
context consumers and Flow's own holds for `dehydrate` and `Hydrate`. Work in flight is an `InFlight` write, a read a
chain started, and an ending owed at `ready`. Nothing else counts. Free of both for 100 ms, it ends (section 1).

## 1. The rule in full (normative; this block is MD 2.7.17 exactly, entry E5)

```text
#### 2.7.17 Actor lifetime: alive while used, and until its work in flight returns

Rule 73 is normative (decided, OD27, OD31). It replaces Runtime O3's `retain`, a guessed duration per ref that expired
an actor whatever it was doing. An actor behaves as a mounted component does: its state lives while something uses
it, its timers stop when nothing does, and a request already sent still returns. That last part is the one exception,
and it prevents a dangerous bug: work already in flight keeps the actor until its ending's turn has run, so a chained
step (Pay's confirm, then `place`) is committed by the incarnation that started it, never left for the next visit.
Leaving is sometimes how a user cancels, so nothing else outlives the last use.

Prior art. React clears an unmounted component's timers in its effect cleanup, and a fetch already sent still
resolves. XState ties an actor to its owner (`useActorRef`'s effect cleanup). TanStack Query keeps an unobserved query
for `gcTime` (5 minutes in a browser, Infinity on a server; `query-core/src/removable.ts:25-28`) and never removes one
while it fetches (`query.ts:226-227`); a pending mutation outlives its observers (`mutation.ts:155-162`), as lanes do
(OD19). Flow keeps TanStack's rule for store data (a resource's own `gcTime`), but not for actors: an actor runs work,
and a window would run it for an absent screen. Actor state that must outlast a screen is persisted, or used from a
layout.

    // before
    actorRef(EditorMachine, ticket, { persist: true, retain: "10 minutes" });
    actorRef(PresenceMachine, ticket, { retain: "15 seconds" });
    // after
    actorRef(EditorMachine, ticket, { persist: true });   // dropped: retain
    actorRef(PresenceMachine, ticket);                     // dropped: retain

Scope. Shared actors (`actorRef`), and local actors made by `useActor`, whose one use is their component (React O3).
A local actor made by host `createActor` lives until `disposeActor` or Runtime disposal (Runtime O3). `disposeActor`,
`forget` and Runtime disposal are explicit and are not governed by this section.

Uses. A use is:
- an ensuring hook (`useActorByRef(ref, {…})`), from its passive commit effect (the one `useSyncExternalStore`
  subscribes in) to that effect's cleanup, including while its attach waits for readiness, lazy adoption, a `Hydrate`
  boundary or a disposing predecessor. Render registers nothing, so a discarded render leaks none. When a shown
  subtree suspends again, React keeps its passive effects (it cleans up only layout effects), so a Suspense fallback
  keeps its uses; React Activity's hidden mode cleans up passive effects, so hiding ends them;
- a live `snapshots` subscription, from host code or from Flow, from the moment it is made until it stops. On an
  identity with a record and no live incarnation it restores the actor (Return, below). On an identity with neither,
  it emits that identity's current snapshot (Reads, below) and waits: the ensure that next creates the actor finds
  the use already held. It completes when its subscriber stops, or after the terminal snapshot of `disposeActor`,
  `forget` or Runtime disposal;
- `dehydrate`'s hold: its Runtime subscribes to each shared actor in the call that installs it (an ensure, or a
  provider restored for it), before control returns to `prepare`, so an `await` inside `prepare` loses none; the
  hold ends at capture or rejection;
- `Hydrate`'s hold on each actor its payload inserted, from the boundary's commit until that actor's first consumer
  attaches or the boundary unmounts;
- a bound context consumer, which is a use of its provider;
- in an app Story, `ensure(ref)` until `detach(ref)` (2.10.10).
`ensureActor` alone, `getSnapshot`, a lookup (`useActorByRef(ref)` with no options), `useView` and sends are not
uses. Uses count per actor identity (rule 74).

Work in flight. Besides its uses, an actor is kept by finite work it already started, until that work's ending's
turn has run in the same incarnation:
- a write lane of the actor that is `InFlight` (waiting to be invoked or on the wire; bound or unplaced, rule 53);
- a read started by a kept turn. A kept turn is one that admits the ending of work that keeps the actor. So
  write, read, write (`Confirmed` refetches the cart, its answer commits `place`) runs to its end; a read started in
  any other turn keeps nothing;
- at `ready`, an ending owed by the restore (Ready, below).
A write any turn commits is `InFlight`, so it keeps the actor too. Mail already queued is processed: the end waits
behind it, and a send restarts nothing. A `Held` lane, with or without waiting commits, keeps nothing; rule 44 hands
it off.

Scheduled work runs only while the actor is used. With no use (during the grace, or while kept only by work in
flight) its schedules do not fire: a deadline that comes due waits. If a use returns before the end, each waiting
deadline fires once, in deadline order, as Machines O5's overdue rule says; at the end a persisted record keeps them
and a non-persisted actor loses them. Activities and stream sessions run until the end. So a chained step reached
only through a schedule waits for the next use, and `flow check` warns (below). A poll a chain needs belongs inside
the read (`Effect.repeat` with a `Schedule` in the lookup's Effect: one finite read); a transport deadline belongs
inside the commit (`Effect.timeoutOrElse`, 2.7.6).

The grace. An actor is free when it has no use and no work in flight. When it becomes free, the core returns an
effect arming the grace, 100 ms on the Runtime Clock (React O3's, internal, the same for local actors), identified
by its deadline. The driver in `src/host/` sleeps, yields once so that fibers forked before the expiry have run, and
delivers the expiry as a Runtime step. A use or new work in flight disarms it; an expiry whose deadline is not the
armed one does nothing. The core never reads the clock.

The end. At the expiry, if the actor is still free, the end step runs after the mailbox drains:
1. A persisted actor's record (state, memory, armed and waiting deadlines, restartOn baselines) is encoded into the
   Runtime's copy in this step; a capture may not have run yet. If it cannot be encoded, the actor does not end: it
   stays live, the codec's diagnostic is published once (Persistence O5), `uses.busy` names it, and the grace is
   armed again, so the end is retried at each expiry.
2. Its lanes move to the Runtime unbound (rule 44), with any endings parked for a path (rule 53).
3. Its schedules are cancelled and its activities and sessions stopped (Runtime O6's cleanup); the end is a trace
   record with the reason `NoUses`.
Until the driver reports that cleanup is done, the actor is ending: sends follow the table below, and an ensure
waits and binds the next incarnation (Runtime O3). When a new incarnation of an equal local identity (2.7.13)
starts while an older one is kept only by work in flight, the older one is disposed at once and the new one adopts
its lanes, so the remounted screen receives the ending, not an invisible predecessor.

Return. A persisted identity whose record is in the Runtime's copy returns as a new incarnation, restored from that
copy (never re-read from storage), when an ensure, a subscription or a send reaches it. It receives, in order: its
starting turn; rule 44's deliveries (parked endings, then each held head's `unknown { Restored }`, once per
incarnation); one `onContext` wave if a provider's selection differs from the one it ended with in this Runtime;
then the event that restored it, if a send. Each schedule follows Machines O5. `Restored` means a new incarnation: a
reload, or a return after an end. An ensure over a record that no longer decodes discards it (`RestoreDiscarded`),
adopts the identity's lanes (rule 46) and creates from input. A non-persisted identity has nothing to return to: an
ensure creates fresh and adopts its lanes, with their parked endings.

Ready and hydration. At `ready`, a restored record stays a record until an ensure, a subscription or a send reaches
it, except an identity whose captured lanes owe it an ending: a lane that was `InFlight` at capture (its restore
ending is `NotSent { Restored }` or `unknown { Restored }`) or a parked ending. That identity is restored live at
`ready`, and each owed ending is work in flight until its turn has run, so an offline-first app's queued writes
resume after a reload without each screen being opened. A reload's context baselines stay silent (Persistence O4).
A hydrated actor activates at its `Hydrate` commit under `Hydrate`'s hold.

Reads. A handle follows the identity, not the incarnation, so its reads and its sends agree after an end.
`getSnapshot` reads the live incarnation; with none, a persisted identity's record from the Runtime's copy (decoded
once per revision; lifecycle `active`, since any ensure or send brings that state back); with neither, the
pre-attach snapshot (React O2) if the identity never had an incarnation in this Runtime, otherwise the last
incarnation's terminal snapshot (lifecycle `disposed`). A lookup of an identity with a record returns that record
view, never `null`; it is a read, not a use. A pre-attach handle reads the same copy, so a quick return never
flashes `initial`.

Sends (amends Runtime O4 and LazyFeatures O2; action `send(ref, e)` and handle `send(e)` alike):

| Target at the send | Result |
| --- | --- |
| live: used, kept by work in flight, or in the grace | delivered (Runtime O4). A send is not a use; the end waits behind it |
| ending, persisted | queued for the next incarnation, restored when cleanup is done, which receives it after Return's deliveries; `disposeActor` or `forget` during that cleanup drops the queue with `NoRecord` |
| ending, not persisted | dropped, `SendTargetAbsent { reason: "NoRecord" }` |
| ended, persisted, record decodes | restored (Return); delivered last. It has no use, so its schedules wait, and it ends after the grace unless the event starts work in flight |
| ended, record does not decode | dropped, `RecordUndecodable`; the record stays for an ensure to discard |
| no record (not persisted, never created, disposed, forgotten) | dropped, `NoRecord` |
| a lazy entry not adopted | dropped, `NotAdopted` |
| being disposed by `disposeActor` | dropped, `NoRecord` (Runtime O4) |

A send never creates: creating is an ensure's decision, and a send must not resurrect a disposed or forgotten
identity, start a singleton without its input, or adopt a lazy entry. Restoring is not creating: the record already
holds state and memory. LazyFeatures O2's "never adopts or creates its target" reads "never adopts a lazy entry or
creates an actor; it may restore one from its record". Reasons are reported on the sender and never roll back its
turn. A send to many ended persisted identities restores each (stated limit).

States:

| State | Holds | Left by |
| --- | --- | --- |
| Live, used | the whole actor: state, memory, activations, deadlines, activities, sessions, mailbox | the last use ending |
| Live, kept by work in flight | the same; schedules wait; `uses.busy` lists the work | the last kept ending's turn; then free |
| Live, in the grace | the same, schedules waiting, one armed grace | a use or new work (stays live), or the expiry |
| Live, end blocked | the same; `uses.busy` names the unencodable record | an expiry at which it encodes |
| Ending | the terminal snapshot; activities stopping; sends queued for a persisted identity | cleanup done; a cleanup failure quarantines (Runtime O6) |
| Ended, persisted | the Runtime's copy of the record, the stored record, its lane records and parked endings | an ensure, subscription or send (Return); `disposeActor` (record removed, lanes kept unbound, rule 46); `forget`; Runtime disposal |
| Ended, not persisted | nothing of the actor; its non-`Idle` lanes, unbound, with their parked endings | the lanes resolve, a new incarnation adopts them, or Runtime disposal |
| Record at `ready` | as ended, persisted; restored live at once if its lanes owe it an ending | as ended, persisted |
| Quarantined | the ref's failure and Cause | Runtime disposal |

Over Persistence O3's bounds (4,096 records, 16 MiB), a capture drops the oldest ended records that equal a fresh
start (the state and memory a new ensure would build from the identity's input, only the initial leaf's entry
deadlines, no non-`Idle` lane, no parked ending), with evidence. If that is not enough, the capture is rejected as
O3 says, and its evidence names the oldest ended identities, so the app can `forget` them. A record that holds
anything a user did is never dropped.

Host code keeps an actor by subscribing to it, in the same step as the ensure, before anything awaits:

    const editor = runtime.ensureActor(editorRef(T42));          // existing; keeps nothing by itself
    yield* Effect.forkScoped(Stream.runDrain(editor.snapshots)); // a use until the scope closes

Keeping state across routes: hold the use in the layout or app shell (a `useActorByRef(ref, {})` above the routes,
or a provider binding), or persist the ref. Background work that must go on while no screen shows it (a session's
token refresh, a kitchen timer, an upload's backoff) runs only while used, so it needs a use in the app shell.

Commit on the way out: a `Close` event commits a dirty draft, and that write keeps the actor until it returns.

    Close: [
      { target: S.CLOSED, guard: [dirty, O.save.idle(ticketKey)], actions: [commitDraft] },
      { target: S.CLOSED },
    ],

Send it from the navigation itself (a close button, a router's leave hook), never from an effect cleanup: React
Strict Mode runs cleanups in development and Activity runs them when it hides a subtree that can be shown again.

`flow check` reports `ScheduleLeadsToWrite` for each schedule whose `send` turn can reach a write member (`commit`,
`retry` or `cancel` of a transaction or domain write), following handlers, raises, exits, entries, host transitions
(rule 7) and lookup endings with their raises, to a fixed point, over every arming path: entry, `armOn`,
`restartOn`, keyed `keys`, `.each` copies and subroutine entry. It is a warning when the schedule is armed in a turn
that admits a write's ending (a chain through a schedule, such as a retry with a delay); otherwise it is info. The
message depends on the refs the app declares for the machine: not persisted, or local, "lost if the screen leaves
first"; persisted, "delayed until the next use: it fires once, late, against what the server holds then, so the
write needs a precondition (a version or `If-Match`)". A repeating schedule whose write can outlast its period is
named as such. `flow explain` prints the path per schedule. The finding never affects lifetime.

Inspection gives each actor `uses: { consumers, subscriptions, contexts, pendingEnsures, busy }`, shown by `flow
trace` and `flow explain`: `consumers` are attached hooks; `pendingEnsures` are hooks past their commit effect and
not yet attached; `subscriptions` each carry an owner (host code, `dehydrate`, `Hydrate`, a follower); `contexts`
are bound consumers; `busy` lists work in flight by address (rule 65), the mailbox depth, waiting deadlines and an
unencodable record. A free actor shows its grace in `inspection.work`. Every end and return is a trace record, and
a create of an identity that ended in the last 5 seconds carries how long ago it ended. An actor is printed by its
machine and input fields (`Editor{workspaceId: "north", ticketId: "T-42"}`) or a singleton's name (rule 74).

Multi-tab. Under Persistence O7 a second tab runs without persistence and uses are per Runtime. Under multi-tab.md
(a proposal), a follower's attached mirror is a use in the leader, ended by its detach or its presence lock's
grant, and a new leader restores as Ready says and waits for no one.

Stated limits. A persisted autosave inside its debounce fires at the next use or reload (late, not lost); a
non-persisted one is lost. Reactions while away appear on return, or never for a non-persisted actor. A
non-persisted actor whose uses end for longer than the grace (a route change slower than 100 ms, Activity hiding)
starts fresh. A send that restores runs the starting turn, entry lookups and activities, then ends after the grace.
A write that never settles keeps its actor until Runtime disposal. A `snapshots` subscription never stopped is the
caller's leak; Inspection names its owner. Follower uses need browser tests. Restore cost is not measured.

What no longer happens implicitly: a busy actor losing its live incarnation, which made R8 H2 and R9 H1 reachable
without a reload. What stays: Runtime-owned lanes (OD19), parked endings on lane records (OD21, OD22) for reload,
Runtime disposal and dormant lazy records, unbound lanes for `disposeActor` and local actors, unplaced lanes (rule
53), adoption by identity, `unknown { Restored }` and `runtime.unsettledWrites()`.
```

Notes for the reader (not merged): "kept turn" is the whole of B-H1's transitivity: a write's ending is a kept turn
because the write keeps; a read it starts keeps; that read's ending is a kept turn; a write it commits keeps. The
chain is finite because each link is finite work. Schedules are cut out of it on purpose (D1), and `flow check`
says where a chain crosses one. The driver's one yield before an expiry (B-H3) is an implementation fact of
`src/host/`, not a user contract; the subscription's pending use is what makes the order of ensure and subscribe
irrelevant.

## 2. Public API changes

| Change | Kind | Status |
| --- | --- | --- |
| `retain` on `actorRef` | **REMOVED** | decided (OD27) |
| `SendTargetAbsent` reasons `"NoRecord" \| "RecordUndecodable" \| "NotAdopted"` | `NoRecord` **replaces** `NotPersisted` | accepted |
| Stories `detach(ref)` (app Stories only; a type error on `Story.machine`) | **RENAMED** from the decided `Story.release(ref)` | accepted (fix 10) |
| Stories `ensure(ref)` | **NEW MEANING**: attaches one use | accepted (fix 10) |
| Stories `dispose(ref)` | **NEW MEANING**: `disposeActor`; `{ how: "now" }` **REMOVED**; `{ how: "forget" }` kept | accepted (fix 10) |
| `snapshots` on an identity with no incarnation and no record | **NEW MEANING**: waits as a use instead of completing | proposed (B-H3) |
| A lookup of an identity with a record | **NEW MEANING**: the record view, not `null` | proposed (B-M4) |
| Schedules of an unused actor | **NEW MEANING**: they wait | proposed (D1, Q2) |
| `flow check` `ScheduleLeadsToWrite`, warning or info | a finding name | proposed (improvement 1) |
| Inspection `uses`, a create's "ended … ago" | decided field; content as section 1 | accepted (improvement 3); the create note proposed (B-H4 B) |

Not added: a keep-alive option or hook, a schedule flag, a "let go" signal (section 12), a Story step for the grace,
a lifecycle value for "ended", a reason word for `detach` misuse (Q3 of v4: `ActorAbsent`, applied).

## 3. Actor states, and 4. Sends

Both tables are in section 1. States changed from v4: "kept by writes" is "kept by work in flight", schedules
waiting (D1); "end blocked" leaves at an expiry (B-L2); "hydrated, unused" is gone (`Hydrate`'s hold); a record at
`ready` owed an ending is live (B-H2). Sends: the ending window exists because cleanup is asynchronous (the driver
interrupts activity and session fibers); the experiment's cleanup was synchronous, so it found disposal atomic. The
core gains `stopped(actor, incarnation)` to close the window (B-M7). A send-restored target's deadlines wait (D1),
so a broadcast to N persisted identities restores N, fires none of their overdue deadlines, and each ends (A-M-d).

## 5. The cases

### 5.1 The editor's autosave (persisted)

```ts
// BEFORE: dispatch-desk/features/Tickets/editor/editor.ref.ts
actorRef(EditorMachine, ticket, { persist: true, retain: "10 minutes" }); // REMOVED: retain
// AFTER
actorRef(EditorMachine, ticket, { persist: true });                       // existing
```

Added: nothing. Dropped: `retain`. The user types and closes the panel inside `autosave`'s 2 s debounce: no use,
nothing in flight, so the editor ends 100 ms later with the draft and the waiting deadline in its record. Reopened,
the overdue `autosave` fires once: late, not lost, against what the server holds then, so the title save gets
`If-Match` as `body.trait.ts` does (C128). A save on the wire at the close keeps the editor until `Saved` lands and
`toastSaved` is sent by the same incarnation. If it comes back unknown, `UNSURE` arms `resend`, which waits (no
use); the lane is `Held`, the editor ends, and on return `unknown { Restored }` re-enters it. `flow check` reports
`settle`, `autosave`, `resend` and `LOCKED.retry` (warning for `resend` and `retry`: armed in an ending's turn).

### 5.2 Checkout: the chained confirm, and a poll in the chain

```ts
// BEFORE and AFTER, unchanged: checkout/features/Pay/pay.ref.ts, Pay.tsx
export const payRef = actorRef(PayMachine, "checkout", { persist: true });  // existing; user-defined: payRef, PayMachine
const checkout = useActorByRef(payRef, {});                                 // existing: the mounted page is a use
```

Added: nothing. The shopper presses back while the confirm is on the wire. The lane is `InFlight`: Pay stays.
`Confirmed`'s turn is kept, `PLACING` commits `place`, which keeps; `Placed` lands; Pay ends 100 ms later. A
`PlaceUnsure` retries in the ending's own turn, so it keeps too. If `Confirmed` needs a fresh cart first:

```ts
Confirmed: { target: S.REFRESHING, actions: [O.cart.lookup(cart)] },     // existing: lookup; started in a kept turn, so it keeps
CartRead:  { target: S.PLACING, actions: [O.place.commit(cart)] },       // a kept turn again: place keeps
```

If the confirm says "processing", poll inside the read, so the chain stays one finite read:

```ts
intentSettled: resource({                                                 // existing: resource; user-defined: intentSettled
  id: "Checkout/intent-settled", input: { intentId: Schema.String }, output: Intent, key: ["intentId"],
  lookup: ({ intentId }) => Stripe.use((s) => s.retrieve(intentId)).pipe(
    Effect.repeat({ schedule: Schedule.spaced("2 seconds"), while: (i) => i.status === "processing" }), // existing Effect API
    Effect.timeoutOrElse({ duration: "2 minutes", orElse: () => Effect.fail(new StillProcessing()) }),  // user-defined: StillProcessing
  ),
});
```

`UNSURE.check` is a schedule: with the shopper gone it waits, Pay ends holding the unknown confirm, and the webhook
places the order server-side; on return `unknown { Restored }` resumes the reconcile. `flow check` warns on `check`
(armed in `PayUnsure`'s turn). Limit B3 stands: `requires_action` commits `authenticate` with nobody on the page.

### 5.3 Presence, the server page, a toast, a local actor

```ts
actorRef(PresenceMachine, ticket, { retain: "15 seconds" }); // BEFORE; REMOVED: retain
actorRef(PresenceMachine, ticket);                           // AFTER; existing
const pay = useActor(PayMachine, { input });                 // existing, unchanged; user-defined: PayMachine
```

- **Presence:** 100 ms after the panel closes (or when a `ping` on the wire returns) it ends and its sessions close.
  Its heartbeat waits once the panel is gone, so a slow `ping` cannot chain into the next (D1). A loading gap over
  100 ms leaves and rejoins: hold the hook in the ticket's layout.
- **The queue on a server page** (`dispatch-desk/next/app/desk/[workspace]/page.tsx`, unchanged): each
  `ensureActor` inside `dehydrate`'s prepare installs the actor and dehydrate's hold in one call, so chained lookups
  finish under ServerRendering O2. `<Hydrate>` holds each inserted actor until its first consumer attaches, so a
  `QueueClient` under a later Suspense segment still finds the server's state (v4 B1 closed). After the user
  leaves, the 30 s poll waits and the queue ends.
- **A toast:** the always-mounted stack is a use, so `SHOWING.expire` fires; the editor's `toastSaved` runs in
  `Saved`'s kept turn; with no stack mounted the send drops `NoRecord` on the sender.
- **A local actor** (D5): unmounted mid-confirm, it is kept, hears `Confirmed`, commits `place`, ends after
  `Placed`; remounted with equal input while kept, the old one is disposed at once and the new one adopts the lane.

### 5.4 A Story

```ts
// AFTER: dispatch-desk/features/Roster/roster.story.ts, mergeOutlivesScreen
  .ensure(North)                                       // NEW MEANING: one use, as the admin screen
  .send(North, E.MERGING.Pick({ survivorId: "acme" }), E.MERGING.Confirm())
  .detach(North)                                       // RENAMED (from Story.release): the screen unmounts
  .advance("1 second")                                 // existing: past the grace; North stays, the merge is InFlight
  .checkpoint("leftMidMerge")                          // user-defined; uses.busy: [{ operation: "mergeCustomers" }]
  .world(Desk.mergeCustomers.release())                // existing: the fake's wire release; the same North sets its notice
  .advance("1 second")                                 // existing: now free, North ends; its record holds the notice
  .ensure(North)                                       // NEW MEANING: restored from the record
  .checkpoint("mergeShown");                           // user-defined
```

Dropped: the record-keeping `dispose`, `{ how: "now" }`. "The answer lands with no actor" is `detach`, `reload`,
then the release: the new tab's North is restored at `ready` (its lane owes it `unknown { Restored }`, B-H2).

### 5.5 Other cases

| Case | What happens |
| --- | --- |
| A long upload | `put` is `InFlight`: the editor stays, its activities running, for the whole upload |
| A never-resolving unknown | `Held`: keeps nothing; on return `unknown { Restored }` |
| A write that never settles | keeps the actor until Runtime disposal; its timeout belongs in the commit (2.7.6's `Effect.timeoutOrElse`) |
| A reload mid-write | the lane was `InFlight` at capture: restored at `ready`, kept until its `Restored` ending's turn |
| React Strict Mode | cleanup and setup in one commit, inside the grace |
| Suspense fallback over shown content | passive effects stay: uses kept, the actor lives |
| React Activity hidden | passive cleanups run: after 100 ms a persisted actor ends (restored on reveal), a non-persisted one starts fresh |
| Headless host | section 1's host code; a bare `ensureActor`, an `await` past 100 ms, then a send to a non-persisted actor drops `NoRecord` |

## 6. Recipes, and 7. `flow check`

Recipes, all in section 1: commit on the way out (send `Close` from the navigation, never a cleanup; B6), hold the
use in the layout or app shell (B-H4, B-M5), poll inside the read (B-H1); send `Leave` from the router's leave hook
for a chain that needs the user (B3). `ScheduleLeadsToWrite` is as section 1. Changes from v4: lookup endings and their raises are followed (B-H1: Pay's `check` is found); the
finding is a warning for a chain through a schedule; the message names the precondition (B4) and the overlapping
period (B-L3); "lost if the screen leaves first" replaces "unmounts". In the apps: the editor's `settle`, `autosave`,
`resend` and `LOCKED.retry`; the body's settle and retry; the upload's `start` and `resend`; Pay's `check` and
`retry`. It is a compile-side check: its cases are compiler tests, not runtime cases.

## 8. Leaks considered

v4's table stands, with these rows changed or added: polls, re-arming schedules and heartbeats wait without a use
and end with the actor, so an overlapping heartbeat cannot chain (D1); a write **or a kept read** that never
settles keeps the actor until Runtime disposal, named in `uses.busy`; an unencodable record is retried at each
expiry with one diagnostic; ended records are bounded by Persistence O3, pristine ones dropped first (D3); a
subscription waiting on a never-created identity is the caller's leak, named by owner; `Hydrate`'s hold ends at
first attach or unmount; grace timers are one per actor, identified by deadline; restores at `ready` are only of
identities owed an ending, each ending after its owed turns.

## 9. Replacement text for MD

Sixteen entries. Each `Current` occurs once in MD (verified on the working tree, 2026-11-07); ⏎ marks a line break
inside a `Current`. Merge order: absorb-wiring (OD29, C114–C116, C123), then identity (OD30, C117–C122), then this.
E5's block already carries identity's I13–I15 (value refs, the per-identity line, the printing line), so those three
are absorbed; rule 74's anchor sentence survives E3.

**E1. Header revision** (MD:33–35). Current: the paragraph starting ``**Revision (actor lifetime, 2026-11-07).**``.
New:

```text
**Revision (actor lifetime, 2026-11-07).** `retain` is removed: a shared actor lives while something uses it, plus
until its finite work in flight has returned; its schedules fire only while it is used and end with it (rule 73,
2.7.17; decided, OD27, OD31). Proposal and evidence:
[../../proposals/actor-lifetime/proposal-v5.md](../../proposals/actor-lifetime/proposal-v5.md); earlier versions
beside it are prior art.
```

**E2. Rule 44.** (a) Current: ``Implicit disposal never happens while a lane of the actor is⏎    `InFlight` or has
waiting commits (rule 73); a `Held` lane is handed off by this rule.`` New: ``An actor never ends implicitly while a
lane of the actor is⏎    `InFlight` (rule 73), so a sent write's ending reaches the incarnation that sent it; a
`Held` lane, with or without waiting commits, is handed off by this rule. When a shared actor ends, endings parked
for a path stay on the lane record, persisted or not, and the next incarnation that adopts the lane receives
them.`` (b) Current: ``a held head's `unknown { Restored }` exactly once`` New: ``a held head's `unknown { Restored
}` exactly once per incarnation``.

**E3. Rule 73, in full** (MD:1107–1112). Current: from ``73. **A shared actor lives while it is used**`` to
``Local actors keep React O3. `retain` does not exist.``. New:

```text
73. **A shared actor lives while something uses it, plus until its finite work in flight has returned** (decided,
    OD27, OD31; 2.7.17). A use is an attached consumer (from its passive commit effect, never from render), a live
    `snapshots` subscription, Flow's hold for `dehydrate` and `Hydrate`, or a bound context consumer. Work in flight
    is an `InFlight` write lane, a read started by a turn that admits the ending of such work, and an ending owed at
    `ready`; it keeps the actor until its ending's turn has run, so a chained step is committed by the same
    incarnation. Nothing else keeps it: not schedules, other lookups, activities, stream sessions, `Held` lanes,
    parked endings or context; mail is processed before the end. While it has no use its schedules wait. Free for
    the grace (100 ms on the Runtime Clock, internal, shared by local actors), it ends, unless its record cannot be
    encoded, which delays the end. A persisted actor's record is encoded in the step that ends it, with its
    deadlines; an ensure, a subscription or a send restores it. A non-persisted actor is gone; its lanes stay with
    the Runtime (rule 44). Local actors keep React O3, with the same exception. `retain` does not exist.
```

**E4. 2.7.13, the R9 H1 walk.** Current: ``"Runtime disposal with an Attempt on the wire, reload, the write
succeeds, ensure: the restored state⏎receives the ending" (R9 H1; retain expiry no longer exists, rule 73)``. New:
``"`reload` with an Attempt on the wire, the server applies it: the restored identity is live at `ready` and⏎receives
`unknown { Restored }`" (R9 H1; its Runtime-disposal form, where the ending parks, is the policy suite's; an implicit
end never meets an `InFlight` lane, rule 73)``.

**E5. 2.7.17, the whole section.** Current: from ``#### 2.7.17 Actor lifetime: alive while used`` through the
paragraph ending ``adoption by identity, `unknown { Restored }` and `runtime.unsettledWrites()`.``, the line before
``#### 2.7.18``. New: the text block of section 1, exactly (its indented code lines become a `ts` fence).

**E6–E9, E11, E12: substring swaps.**

```text
E6  Current: - **Rule 73.** An ignored unknown leaves no `InFlight` lane, so it is not a use.
    New:     - **Rule 73.** An ignored unknown leaves no `InFlight` lane, so it does not keep the actor.
E7  Current: | `ensure(ref)`, `dispose(ref, { how? })`, `send(target, …events)`,
    New:     | `ensure(ref)`, `detach(ref)`, `dispose(ref, { how? })`, `send(target, …events)`,
E8  Current: | `ensure`, `dispose` | `{ ensure: [ref?, options?] }`, `{ dispose: [ref?, options?] }` |
    New:     | `ensure`, `detach`, `dispose` | `{ ensure: [ref?, options?] }`, `{ detach: [ref?] }`, `{ dispose: [ref?, options?] }` |
E9  Current: the lifecycle command, as a host would issue it | settle |
    New:     the lifecycle command, as a host would issue it; `ensure` and `detach` as a screen mounting and unmounting (rule 73) | settle |
    (in the row starting | `ensure`, `dispose`, `openTab`; the same row's first cell gains `detach` after `ensure`)
E11 Current: (rule 73: no-use disposal never⏎meets a busy lane)
    New:     (rule 73: an implicit end never⏎meets an `InFlight` lane)
E12 Current: | **43** new, 13 reused | Subjects, 2: `Story.app`, `Story.fragment`. Steps and options, 12: `together`, `dispose`, `how`,
    New:     | **44** new, 13 reused | Subjects, 2: `Story.app`, `Story.fragment`. Steps and options, 13: `together`, `dispose`, `detach`, `how`,
    Current: | **Total** | **94** new, 18 reused |
    New:     | **Total** | **95** new, 18 reused |
    Current: `Fake.Closed`, `dispose` (`how`), `reload`
    New:     `Fake.Closed`, `dispose` (`how`), `detach`, `reload`
```

**E10. 2.10.10.** Current: ``never persisted (brief C14), so `closeTab` and `reload` there are type errors. Rebind
is `dispose()` then `ensure()`; no-use⏎disposal (rule 73) is `Story.release(ref)` then `advance` past the grace, and
leaves a busy actor live; `dispose(ref, { how: "now" })` is `disposeActor` and⏎`{ how: "forget" }` is `forget` (STR9,
STF43).`` New:

```text
never persisted (brief C14), so `closeTab` and `reload` there are type errors; its subject is held for the whole run,
`detach` is a type error there, and its `dispose()` then `ensure()` is a rebind. In an app Story, `ensure(ref)` attaches
one use, as a mounted screen does, and `detach(ref)` ends one (with none held by this Story it is
`StoryInvalidCommand { reason: "ActorAbsent" }`); an `advance` past the grace then ends an actor with no use and no work
in flight, and one kept by a write stays until its ending's turn has run (rule 73). `dispose(ref)` is `disposeActor` and
`{ how: "forget" }` is `forget` (STR9, STF43); no Story step ends an actor and keeps its record while it writes.
`openTab({ from })` and `reload` re-attach the uses this Story held in that tab's latest life, in first-ensure order.
```

**E13. MD:2199.** Current: ``(a⏎persisted actor disposed with no uses (rule 73), or awaiting reload)``. New:
``(a⏎persisted actor that ended under rule 73 while holding the lane, a dormant lazy record, Runtime disposal, or a
reload)``.

**E14. MD:2235.** Current: ``Restore at ready, and⏎an ensure after no-use disposal (rule 73), bind``. New: ``Restore
at ready, and⏎a return after an end (rule 73), bind``.

**E15. Decision log.** Append after OD30 (after OD29 if identity has not merged), on the user's acceptance:

```text
- **OD31** The user, 2026-11-07, in the Claude Code session: actor lifetime, the blunt rule
  (../../proposals/actor-lifetime/proposal-v5.md, rule 73, 2.7.17). A shared actor lives while something uses it,
  plus until its finite work in flight has returned: an `InFlight` write, a read started by a turn admitting such
  work's ending, an ending owed at `ready`. Its schedules wait while it has no use and end with it. Uses count from
  passive commit effects; `dehydrate` and `Hydrate` hold uses; a subscription on an identity with no actor waits as a
  use; the grace is 100 ms on the Runtime Clock for shared and local actors; records stay records at `ready` unless
  owed an ending; the record is encoded at the end, which waits while it cannot be; sends restore, queue for an
  ending persisted target, or drop with `NoRecord` (replacing `NotPersisted`), `RecordUndecodable` or `NotAdopted`;
  a handle and a lookup follow the identity; Stories' `detach(ref)` (renaming OD27 Q4's `release`), `ensure` as a
  use, `dispose` as `disposeActor` (amends W27: `{ how: "now" }` removed). Records cliff: only records equal to a
  fresh start are dropped. `Restored` means a new incarnation. One `onContext` on a return within a Runtime; a
  reload stays silent. Local actors made by `useActor` keep the in-flight exception, and a remount disposes a kept
  predecessor at once. Amends OD27's use list and grace. (2026-11-07)
```

**E16. Plan rows.** Replace C104–C111 in place (same ids); add C124–C128 after C123.

| ID | Plan | Change | Replaces or amends |
| --- | --- | --- | --- |
| C104 | Runtime O3 | Rule 73 (OD31): uses, work in flight, waiting schedules, the 100 ms grace, the end step, return; `actorRef` has no `retain`; `ConflictingActorRef` covers `persist` and `context`; host `createActor` lives until disposed; the Reference line names editor.ref.ts without `retain` | "With retain (a Duration) … last use ended", "A provider with bound consumers never expires", "Without retain … Runtime disposal", "Retain expiry of a persisted actor …" |
| C105 | Runtime O4, LazyFeatures O2, React O3 | Section 1's send table for action and handle sends; reasons `NoRecord`, `RecordUndecodable`, `NotAdopted`; a send never creates and may restore; "A snapshots subscription completes only at the actor's disposal" becomes "when its subscriber stops, or after the terminal snapshot of `disposeActor`, `forget` or Runtime disposal; on an identity with no actor it waits as a use" | "Sends to a disposing or disposed actor are dropped", "If the target is absent or disposing the event is dropped", "never adopts or creates its target", "Sends through a handle whose actor is disposed are dropped as SendTargetAbsent", "A snapshots subscription completes only at the actor's disposal" |
| C106 | Persistence O3, O4 | O3: an ended actor's record is encoded in the end step and kept; over the bounds, records equal to a fresh start drop first, then the capture is rejected naming the oldest ended identities. O4: restored records stay records until reached, except identities owed an ending (a lane `InFlight` at capture, a parked ending), restored live and kept until those turns run; saved mapped outcomes are such endings | "a persisted actor whose retain expired keeps its saved record", "Exceeding either bound rejects the whole capture without eviction", "Restored stable actors are active without another ensure", "Their retain clock starts at ready" |
| C107 | ServerRendering O1, O2, O5 | `dehydrate` holds each shared actor from install to capture or rejection; `Hydrate` holds each inserted actor until its first consumer attaches or the boundary unmounts | "Shared actor retention starts at activation" |
| C108 | React O2, O3, V4 | Uses from passive commit effects (Suspense re-suspension keeps them, Activity hiding ends them); a lookup of an identity with a record returns the record view; a pre-attach handle reads the Runtime's copy; local actors keep the 100 ms grace, the in-flight exception and the remount rule; across hiding, persist or hold a use outside the hidden subtree | "Shared ensuring hooks count as uses until cleanup; retention follows @plan.Runtime.O3", "missing or disposed means null", "Shared refs with retain are the way to keep state across hiding", V4 "retention" |
| C109 | Runtime V4 | An unused actor ends after the grace; Strict Mode keeps it; work in flight keeps it and a chain of two or more runs in the same incarnation; schedules wait without a use | "retain expiry on the TestClock" |
| C110 | Testing O7 | `detach(ref)` on app Stories; `ensure` attaches a use; `dispose` is `disposeActor`, `{ how: "forget" }` is `forget`; `openTab({ from })` and `reload` re-attach the Story's uses; `Story.machine` holds its subject | replaces C110's `Story.release(ref)` |
| C111 | Inspection | `uses` as section 1, Flow's holds as subscription owners, a create's "ended … ago", printing per rule 74 | amends C111 |
| C124 | Machines O5 | "On restore or resume" includes a return within the Runtime and a use returning to an actor whose deadlines waited | amends |
| C125 | Diagnostics, CommandLine | `ScheduleLeadsToWrite` (warning or info) and its `flow explain` path, as section 1 | adds |
| C126 | Operations O3 | `unknown { Restored }` means a new incarnation: a reload or a return after an end, once per incarnation | amends |
| C127 | `multi-tab.md` 4, 5.3, V-MT2 | "It releases that follower's attachments (retain)" → "its uses"; "`retain` counts attachments in every tab" → "a follower's attachments are uses in the leader"; "retain across tabs" → "uses across tabs"; a new leader waits for no one | replaces |
| C128 | References | drop `retain` in editor.ref.ts, roster.ref.ts, presence.ref.ts, assistant.ref.ts; `app/host.ts` as section 9.1; roster.story.ts and desk.story.ts as 5.4; upload.trait.ts as section 9.2; the editor's title save carries `If-Match` as body.trait.ts does; REWRITE-PLAN.md row 47 and line 160, REVIEW.md row 10 | replaces |

### 9.1 `dispatch-desk/app/host.ts`: `runDeskHost` (after identity's edits)

```ts
export async function runDeskHost() {
  const runtime = DeskSetup.construct(); // inert: no storage, services, actors or work
  try {
    await runtime.runPromise(runtime.ready());
    await runtime.runPromise(Effect.scoped(Effect.gen(function* () {
      // Host code keeps an actor by subscribing (rule 73); an ensure alone keeps nothing past the grace.
      // Each subscription is made in this step, before anything waits, and is a use until the scope closes.
      const keep = (snapshots: Stream.Stream<unknown>) => Effect.forkScoped(Stream.runDrain(snapshots));
      const session = runtime.ensureActor(SessionRef, { input: { userId: "dispatcher-7" } }); // providers first
      const toasts = runtime.ensureActor(ToastsRef);
      const queue = runtime.ensureActor(queueRef({ workspaceId: "north" }));
      const feed = runtime.ensureActor(feedRef({ workspaceId: "north" }));
      const editor = runtime.ensureActor(editorRef({ workspaceId: "north", ticketId: "T-42" }));
      for (const s of [session.snapshots, toasts.snapshots, queue.snapshots, feed.snapshots, editor.snapshots]) yield* keep(s);
      // A local actor made by host code lives until it is disposed (Runtime O3).
      const scratch = runtime.createActor(EditorMachine, { input: { workspaceId: "north", ticketId: "T-43" } });
      const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
        if (runtime.unsettledWrites().length > 0) event.preventDefault(); // a write on the wire outlives this page
      };
      yield* Effect.acquireRelease(
        Effect.sync(() => addEventListener("beforeunload", warnBeforeLeaving)),
        () => Effect.sync(() => removeEventListener("beforeunload", warnBeforeLeaving)),
      );
      editor.send(Editor.E.TitleChanged({ title: "Replace foyer light" }));
      // Reads one snapshot and stops, so it keeps nothing.
      yield* editor.snapshots.pipe(Stream.take(1), Stream.runForEach((s) => Effect.sync(() => console.log(s.state))));
      editor.send(yield* Schema.decodeUnknownEffect(Editor.Event)({ _tag: "Close" })); // decode at the boundary
      console.log((yield* Effect.exit(TicketApi.use((api) => api.load({ workspaceId: "north", ticketId: "T-42" }))))._tag);
      yield* Effect.promise(() => runtime.disposeActor(scratch));
      // Closing the scope ends the five subscriptions: each actor ends after the grace or when its work in flight
      // returns; the persisted editor and session keep their records.
    })));
  } finally {
    await runtime.dispose(); // owns everything left, in reverse dependency order
  }
}
```

`signOut` is unchanged: its `ensureActor(SessionRef, …)` and `send` run in one step, and the session is persisted.

### 9.2 `dispatch-desk/features/Attachments/upload.trait.ts`

`Restored` used to mean "a reload, so the bytes are gone". It now also means a return within the tab, where
`PendingFiles` still holds them. So `Restored` re-sends at once and the adapter's `FileGone` decides; after an
unknown send that failure arrives as `StillUnknown { failure }` (rule 18), so the mapping carries its tag:

```ts
// internalEvents: Lost is REMOVED; NEW (user-defined): a re-send after an unknown failed definitely
Refused: Flow.uncertain({ failure: Schema.String }),
// unknown: (the other entries unchanged)
Restored: E.ResendDue,                                                  // NEW MEANING: a new incarnation; re-send now
StillUnknown: E.Refused.from((r) => ({ failure: r.failure._tag })),     // existing: .from; the failure behind the unknown
// schedules.resend.disarmOn: E.Lost → E.Refused
// on: the Lost handler is REMOVED; NEW:
Refused: [
  {
    target: "self",
    guard: ({ event }) => event.failure === "FileGone" || deny("NotGone"),  // a reload took the bytes
    updateMemory: () => ({ status: "failed", problem: "FileGone" }),
    actions: [O.put.cancel],                                                // release; the first send may have landed (OD20)
    notify: [callbacks.onFailed.from(({ memory }) => ({ ref: memory.ref, problem: "FileGone" as const }))],
  },
  {
    target: "self",                                                          // any other definite failure after an unknown
    updateMemory: () => ({ status: "failed", problem: "GaveUp" }),
    actions: [O.put.cancel],
    notify: [callbacks.onFailed.from(({ memory }) => ({ ref: memory.ref, problem: "GaveUp" as const }))],
  },
],
```

After a reload, `take` fails `FileGone` on the first re-send, and the copy reports `FileGone` once, with no wasted
re-sends; within the tab the bytes are re-sent. `upload.story.ts`'s `fileGone` keeps its checkpoint;
`upload.test.ts` gains the return-within-tab case.

## 10. User-land bugs found (v4's list, updated)

Closed: B1 (`Hydrate`'s hold), B2 (D5), B5 (D1: a non-persisted debounce is always lost), B8 (B-H2), B9 (D3), B11
(the record view). Kept as limits: B3 (send `Leave` from the router's leave hook), B4 (the warning names the
precondition), B6 (the recipe, with the corrected React facts), B7 (once per incarnation, rule 44; handlers must be
idempotent), B10 (the real reason, section 1). New:
- **B12.** A schedule armed in a kept turn waits, so a chain through a delayed retry stops at the delay when
  the user has left (warning; persisted: next use; non-persisted: lost).
- **B13.** Background work stops with its screen (B-M5): a token refresh on a session actor used only by a
  header that some routes hide. Recipe: the app shell holds the use.
- **B14.** An offline-first write that went `Held` before the reload is not woken at `ready`; it syncs at the
  next use. Recipe: keep an offline write in flight (the commit waits for connectivity inside its Effect) rather
  than letting it end unknown.

## 11. Suite changes

### 11.1 The 27 record-keeping `dispose` steps

The experiment's "22 busy disposes" counted its first run; the current tree has 27 `c.dispose(` steps in 26
variants of 12 cases (`packages/flow-state-v3/prototypes/conformance/scenarios/`). Targets: **T1** `detach`, the
ending reaches the same incarnation (assert equal incarnation ids), then it ends; **T2** `detach`, `advance` past the
grace (nothing in flight keeps it), `ensure`; **T3** Runtime-disposal form: `{ disposeRuntime }`, the answer
within the 5 s bound is saved as a parked ending (Persistence O3), `reload`, `ensure`; **T4** `dispose` stays
(`disposeActor`, an explicit end; for a persisted identity the ending is evidence).

| Case / variant | Target | Expected change |
| --- | --- | --- |
| FRAG-08 persisted-disposed-ending-parked-delivered-once | T1 | `PLACING` reached in the same incarnation; delivered once |
| FRAG-08 rebind-delivers-a-hold-once | T2 | unchanged |
| FRAG-08 non-persisted-with-no-return-is-evidence | T4 | unchanged; add a T1 sibling: delivered, not evidence |
| FRAG-12 unbound-hold-with-a-waiter-yields | T2 | unchanged |
| FRAG-12 unbound-hold-with-no-waiter-stays | T2 | unchanged |
| FRAG-13 (local, issuesLocal) | T4 | unchanged |
| FRAG-20 adopted-ending-is-current-from-the-active-leaf | T4 | `disposeActor` keeps lanes unbound; the fresh one adopts the `InFlight` lane; unchanged |
| FRAG-20 a-bound-hold-never-yields-an-actor-back-in-time | T2 without the advance (detach, ensure in one step: same incarnation) | unchanged |
| FRAG-20 no-waiter-left-no-yield | T2 | unchanged |
| FRAG-20 local-sent-finishes-to-evidence | T4 | unchanged; add the D5 remount case (11.3) |
| REV5-H5H6 a-persisted-rebind-adopts-its-fragments-ending | T1 | unchanged result, no rebind |
| REV5-H5H6 and-its-lost-answer-once-with-no-restored | T1 | becomes `["unsure:a:NoResponse", "unsure:a:Restored"]` after the return (rule 44, once per incarnation) |
| REV5-H5H6 a-hold-heard-before-disposal-is-restored-to-the-rebound-life | T2 | unchanged |
| REV5-H5H6 a-frozen-kid-adopts-at-the-thaw-not-at-the-rebind | T1, then T2 | the unplaced lane keeps it; the path-parked ending survives the end (rule 44); `Back` delivers it |
| REV5-H5H6 a-disposed-identity-sleeps-through-a-reload | `detach`, `reload` | inverted: "woken at ready" (its lane was `InFlight` at capture), hears `unknown { Restored }`, then ends |
| REV5-M1 a-crash-during-recovery-loses-no-parked-ending | T3 | unchanged |
| REV5-M1 the-record-goes-once-delivered | T3 | unchanged |
| REV7-D80 D93-a-dispose-is-not-lost-to-a-kill | T4 | unchanged |
| REV8-PINS D72-a-parked-ending-survives-a-kill-before-delivery | T3 | unchanged |
| REV9-KEPT a-kept-deadline-goes-with-a-disposed-actor-and-comes-back (`round9.scenario.ts:201-211`) | T2 | unchanged: ended with an armed schedule, comes back, fires once |
| REV9-LOOP a-dispose-during-a-spin-ends-it | T4 | unchanged |
| REV9-EDGE a-new-local-life-hears-nothing-of-the-old | T4 | unchanged |
| REV9-EDGE a-new-persisted-life-does-hear-it | T2 | unchanged |
| REV9-EDGE a-new-life-tries-a-kept-ending-once | T2 | unchanged |
| REV9-EDGE a-sleeping-actors-kept-ending-stays-kept-through-a-boot | T2, `reload` | woken at `ready` (a parked ending is owed) and tries it once; `InvalidTurn` again keeps it on the row, so the assertion holds; add the try count |
| REV9-EDGE a-stranded-wait-ends-with-its-actor | T2 | unchanged |
| SPIKE-04 dispose-then-ensure-brings-both-back | T2 | unchanged: the session does not keep it; the record comes back whole |

`round6.scenario.ts:879` (`{ dispose: B }` behind a slow load) and FRAG-24, R10-BOOT-ORDER keep their explicit
dispose. **Every reload case changes**, not only these: the harness's `reload` re-attaches the uses the suite held,
in first-ensure order; an actor it did not hold is a record unless owed an ending; reads after a reload go through
the handle (record view). A rebind that needs a new incarnation must `advance` past 100 ms.

### 11.2 LIFE-01..10 migration

All: `release` → `detach`; `NotPersisted` → `NoRecord`. LIFE-01, 02, 03, 06, 07, 10 keep their expectations.
LIFE-04 keeps its grace pins. LIFE-05 keeps its result (the unplaced lane now keeps the actor until the failure
lands, which the case already waits for). **LIFE-08 inverts**: the send at 60 ms is delivered to the same
incarnation, and the actor ends at 100 ms, not 160 ms (mail does not restart the grace). LIFE-09 reads `NoRecord`.
LIFE-07 adds: the deadline coming due during the grace does not fire (D1).

### 11.3 New cases

Core cases run in the conformance suite; **[core input]** names what the harness or the core port must gain.

| Id | Pins | Core input |
| --- | --- | --- |
| LIFE-11 | a chain of three: detach mid-confirm, `Confirmed` → `place` → `Placed`, one incarnation id throughout | — |
| LIFE-12 | write, read, write: `Confirmed` starts a lookup, its answer commits `place`; kept throughout | — |
| LIFE-13 | a read not started by a kept turn keeps nothing: an entry lookup after a send-restore is cut by the end | — |
| LIFE-14 | schedules wait: a 50 ms debounce after detach never fires; persisted: fires once at the next `ensure`; re-attach within the grace fires it once | — |
| LIFE-15 | a heartbeat whose write outlasts its period: after detach the next tick waits; ends when the write returns | — |
| LIFE-16 | the grace: one-step Strict Mode; 99 ms kept, 100 ms ended; a stale expiry does nothing; mail does not restart it | — |
| LIFE-17 | `Held` keeps nothing; `unknown { Restored }` once per incarnation across two returns | — |
| LIFE-18 | `ready`: a plain record stays a record; one with a lane `InFlight` at capture is live, kept through its `Restored` turn and the write it commits; one with a parked ending likewise | — |
| LIFE-19 | `Hydrate`'s hold until first attach or unmount | `hydrate(payload)`, `activate(boundary)`, `unmountBoundary` |
| LIFE-20 | `dehydrate`: a prepare that waits 200 ms between ensures loses nothing; the hold ends at capture | `subscribe`/`unsubscribe { owner }` |
| LIFE-21 | record at the end: ended before its first capture; pre-attach handle and lookup show the record, never `initial` or `null` | — |
| LIFE-22 | unencodable record: the end waits, retried at each expiry, diagnostic once, ends once encodable | `codecFails(actor, on/off)` |
| LIFE-23 | every send row of section 1, including all four no-record causes | lazy entries (`NotAdopted`); `stopped(actor, incarnation)` for the ending rows |
| LIFE-24 | handle follows identity; a subscription to a never-created identity waits and is a use at the create; host order ensure-then-subscribe and subscribe-then-ensure both keep | `subscribe`/`unsubscribe { owner }` |
| LIFE-25 | records cliff: over the bound, pristine records drop first; a draft never; else rejected with names | a bounds override (records limit) |
| LIFE-26 | context on return within a Runtime: one `onContext` after rule 44's deliveries; unchanged: none; reload: silent | context providers (`setContext` on a provider) |
| LIFE-27 | D5: a local actor unmounted mid-confirm places the order; a remount while kept disposes the old one, the new one hears `Confirmed` | local attach/detach |
| LIFE-28 | T3's parking path: Runtime disposal with an answer inside the bound, reload, delivered once | `disposeRuntime` with answers inside the bound |

Compile-side: `ScheduleLeadsToWrite` over every arming path and through lookup endings, warning versus info,
checked against `flow explain` (compiler tests). **Browser tests** (not core): passive-effect counting under Strict
Mode, Suspense re-suspension and Activity hiding; `Hydrate` with a lazily loaded segment; multi-tab follower uses;
the host's `forkScoped` order on a real Effect runtime (an Effect test).

### 11.4 Harness, invariants, state hash

`conformance/harness.ts` gains `{ detach: [ref?] }`; `{ ensure }` attaches a use; `{ dispose }` is `disposeActor`.
`conformance/drive.ts` tracks uses per actor and re-attaches at `reload`; the faked re-attach of use counts goes.
Evidence carries incarnation ids. The global invariants, checked after every step: (1) **safety**, no implicit end
while a use is held or work is in flight; (2) **liveness**, an actor free for the grace with no intervening input is
ended; (3) **same incarnation**, every ending of work in flight at the last detach is delivered to that incarnation
id; (4) **no schedule fires** on an ended incarnation or on one with no use. The state hash carries the uses by kind
and owner and the armed grace's deadline, never a generation counter (the experiment's 23% growth came from
counters). Round-14x's `step.ts` changes: `busy` drops "waiting commits" and mail, gains kept reads and owed endings;
the timer pass skips schedule firings while uses are 0.

## 12. `revisit.md` entries

```text
- Actor lifetime: a "you are being let go" signal to the actor, the real fix for a debounced save on a route change
  (a machine could flush on it). New API; deferred by the user on 2026-11-07 (OD31, proposal-v5 section 12).
- Actor lifetime: a memory-only record for ended non-persisted actors (proposal-v5 Q1 D), if the user defers it.
```

## 13. Issue by issue (earlier issues)

Every row of v4 section 13 stands as written there, except: "Restored and hydrated actors have no uses" → records
stay records unless owed an ending; `Hydrate` holds a use (B-H2, Q1 A). "Gaps longer than the grace" → Q1 here.
"Debounce, autosave, re-sends, backoff" → they wait without a use (D1). "Chained steps" → work in flight, reads
included. "Strict Mode, route changes" → Strict Mode is inside the grace; route changes are Q1. R1-M6 and P5 (hiding)
→ Suspense keeps uses, Activity ends them. M4 (records cliff) → D3. "Multi-tab: a new leader waits for no one"
stands. The v3 H3 host race → fix 1, plus the pending subscription and the driver's yield.

## 14. Limits, and the rule tested again

Accepted limits stand (brief-blunt), with B3, B4, B7, B12–B14 added and B1, B2, B5, B8, B9, B11 closed. Each app
below is run against section 1 as written, with Q1 at its default (A):

| App | What happens | User-land bug left |
| --- | --- | --- |
| Editor autosave (persisted) | debounce waits at leave; next use fires it once | a late save without `If-Match` overwrites (B4); never sent if never reopened |
| Chained payment with a poll | a poll inside the read keeps Pay to `place`; a poll as a schedule waits | an app that ignores the warning places at the next visit; the webhook is the safety net |
| Offline-first notes, reloaded | lanes `InFlight` at capture restore at `ready` and resume; an immediate re-send keeps going | writes that went `Held` before the reload wait for the next open (B14); a `Restored` handler that re-sends by schedule waits too |
| Host worker subscribing first | the subscription waits as a use; the ensure finds it | ensure, `await` something, then subscribe: lost after 100 ms (documented) |
| Wizard across routes (not persisted) | survives a gap under 100 ms | **lost on a slow route change** (Q1); persisted or shell-held wizards are safe |
| Presence | leaves 100 ms after the panel; heartbeat waits | a slow in-ticket navigation shows leave and rejoin to others |
| Heartbeat or token refresh | runs only while used | stops when no screen uses it (B13) |
| A Story | `detach`, `advance` are deterministic on the TestClock | none found; Strict Mode and Activity need browser tests |
| Kitchen timer, upload backoff | wait without a use | stop when the screen leaves (B13) |
| Broadcast to many persisted actors | each restored, none fires a deadline, each ends | restore cost, unmeasured |

Unchanged: follower uses need browser tests; restore cost is not measured; a long write keeps an unused actor's
activities and sessions open; a handle's send after an end reaches whichever incarnation is live.

## 15. Open questions

**Q1. Route navigation and non-persisted shared state (B-H4; the user's decision).** List → detail → back, a wizard
across routes with `loading.tsx`, dashboard tabs: on localhost the next page mounts within 100 ms, in production
often 300 ms or more, so the actor is gone and starts fresh. Store data survives (a resource's `gcTime`, 5 minutes);
the actor's own state (step, selection, unsent draft) does not.

```tsx
// app/(wizard)/layout.tsx — the recipe in every option
export default function Layout({ children }) { useActorByRef(wizardRef, {}); return children; } // existing: the shell holds the use
```

- **A. Recipe only** (the accepted timing): "hold the use in the layout or app shell" is the headline recipe. Bug:
  state loss that never shows on localhost, only in production, on slow routes.
- **B. A + an Inspection note:** a create within 5 s of the identity's end carries how long ago it ended, and `flow
  trace` marks it. Bug: as A, but visible in development when the network is throttled.
- **C. A longer internal grace** (2–5 s). Bug: the cliff moves, not goes; presence and sessions stay open that long
  for absent screens; an ensure-then-await host gets lucky more often, hiding its bug.
- **D. A memory-only record:** an ended non-persisted shared actor leaves its state and memory in the Runtime (not
  storage), bounded by count (4,096, oldest out) and gone at reload; a return restores it as a persisted one does,
  and its waiting deadlines fire once then. The lifetime rule is untouched: it still ends, with no schedules,
  sessions or activities. Bugs: a screen expected to reset on leave resumes (a reset needs an explicit event or
  `disposeActor`); sensitive memory stays in the tab until evicted; up to 4,096 dormant actors' memory. It also
  removes `NoRecord` for an ended non-persisted target (a send restores it) and one code path (rule 44 with and
  without a record).

**Recommendation: D, with A's recipe for work that must keep running and B's note.** It is the only option where
correctness does not depend on network speed, it adds no API, and its one surprise (resuming instead of resetting)
is the one TanStack and every module-level store already teach. If the user prefers the accepted rule, take **B**.
Section 1 is written for A plus B's note; D changes the Return paragraph, the `NoRecord` row and one stated limit.

**Q2. Schedules wait while the actor has no use (D1).** Before (v4): a kept actor runs all schedules, so a heartbeat
whose write outlasts its period never ends, a non-persisted debounce fires or not by timing, and a send-restore fires
overdue deadlines. After: they wait. Cost: a chain through a delayed retry stops at the delay (warned). Rec. **yes**.

**Q3. Records cliff (replaces accepted decision 13).** A: drop only records equal to a fresh start, then reject
naming the oldest ended identities (D3). B: review B's fix, evict only the in-memory copy and re-read storage on
return (keeps the storage cliff, and contradicts R10 M5's "never re-read from storage"). C: decision 13 with a lane
and deadline condition (still deletes local drafts). Rec. **A**: it never deletes what a user did.

**Q4. Local actors (D5; reopens "local actors keep React O3").** Both reviews chose v4 Q2 A plus the remount rule.
Before: `useActor(PayMachine)` unmounted mid-confirm charges with no order. After: placed. Rec. **yes**.

## 16. Finding by finding (findings-v4.md)

| Finding | Answer | Where |
| --- | --- | --- |
| B-H1 / A-H-c, reads and timers in a chain | reads started by a kept turn keep, transitively; schedules do not (D1, warned); the analysis follows lookup endings; poll inside the read | 1, 5.2, 7 |
| B-H2, offline-first after a reload | identities owed an ending (lane `InFlight` at capture, parked ending) restored at `ready` and kept through those turns; `Held` excluded (B14) | 1, C106, LIFE-18 |
| B-H3, host subscribing first | a subscription on an identity with no actor waits as a use; the driver yields before an expiry; host code in 9.1 | 1, 9.1, LIFE-24 |
| B-H4, routes and network speed | user decision, Q1; TanStack cited correctly (`removable.ts:25-28`, `query.ts:226-227`) | 1, 15 |
| A-M-b, "nothing else keeps it" vs an unencodable record | rule 73 says the record "delays the end" | E3 |
| B-M1, L4's "[P]" and "commits" | free = no use and no work in flight; mail only delays the end; "unless it commits" deleted; LIFE-08 inverted | 1, 11.2 |
| B-M3, which React effect | passive effects; Suspense re-suspension keeps uses, Activity ends them; v4:291 and v4:308 corrected | 1, 5.5 |
| A-M-c / B-M4, lookup `null` vs record | a lookup returns the record view; a read | 1, C108 |
| A-M-d / B-L1, send-restore side effects | stated limit; overdue deadlines wait (D1); a broadcast restores N | 1, 4 |
| A-M-f / B-L3, overlapping heartbeat | cannot happen: schedules wait without a use (D1); the finding still names the period | 1, 7 |
| A-M-g, decision 15 narrowed | marked: within a Runtime only; a reload's baselines stay silent (no Schema exists to persist a selection) | 1, D4 |
| B-M5, background schedules stop | stated, B13, the app-shell recipe; a delayed retry changes the chain (B12, warned) | 1, 10 |
| B-M7, the "ending" window | `stopped(actor, incarnation)` core input | 4, LIFE-23 |
| B-L2, retry of a blocked end | at each grace expiry | 1 |
| A-H-b, the upload fixture | written in full: `Restored` re-sends, `StillUnknown { failure }` carries the tag | 9.2 |
| B-M2 / A-B9, the cliff deletes drafts | D3, Q3; the memory eviction not taken (memory is already inside O3's bounds) | 1, 15 |
| A-H-a, C123 taken | new rows C124–C128 | E16 |
| A-H-d, host.ts untrue | replacement code | 9.1 |
| A-M-a, E5 verbatim with proposal references | E5 is section 1's block, free of fixes, Q and [P] marks | 1, E5 |
| A-M-h, stale MD lines | MD:2199 (E13), MD:2235 (E14), Total 94 → 95 (E12), the OD31 fallback "after OD29" (E15) | 9 |
| A-L, `{ detach: ref }` form | `{ detach: [ref?] }` | E8 |
| A-L, I15's printing | carried into E5 | 1 |
| A-L, "unless it commits" | deleted | 1 |
| A-L, "terminal snapshot" for a never-created identity | the pre-attach snapshot; terminal only after an incarnation | 1 |
| A-L, `detach` on `Story.machine` | a type error; the subject is held for the run | E10 |
| A-M-e / B-M8, safety-only invariant | liveness, same incarnation, no schedule fires ended or unused; incarnation ids in evidence | 11.4 |
| B-M6, the 22 cases and inputs | 27 steps listed with targets; LIFE migration; core inputs per case; core versus browser | 11.1–11.3 |
| A / B, state hash, chains, reload cases, round6:879, rebind advance | hash uses and the grace deadline; LIFE-11 chain of three; every reload case; kept; stated | 11.1, 11.4 |
| v4 Q1 | A applied: `Hydrate` holds a use | 1, C107 |
| v4 Q2 | A plus the remount rule, applied; confirm in Q4 | 1, Q4 |
| v4 Q3 | A applied: `ActorAbsent` | E10 |
| B3 | limit; the router-leave hook | 6, 10 |
| B4 | limit; the finding names the precondition; the editor's title save gains `If-Match` | 7, C128 |
| B5, B6, B7, B10 | B5 closed by D1; B6 recipe; B7 "once per incarnation" in rule 44 (E2b); B10 the reason in section 1 | 10 |
| B8, B9, B11 | by B-H2, D3, B-M4 | 10 |

What I could not resolve without the user: Q1 (the timing of non-persisted state across routes), and the three
departures Q2–Q4. Nothing in this file needs new public API; the meaning changes are listed in section 2.
