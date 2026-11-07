# Actor lifetime, version 6: the on-screen rule, and lifting up

Status: **ACCEPTED by the user, 2026-11-07; MERGED into machine-design.md on 2026-11-07 as OD31.** Recorded as **OD31**, with rule 73 and section 2.7.17 rewritten, rule 44 amended, plan rows
C104–C111 replaced in place and **C124–C127** added. Paths are from the repository root; MD =
`workflow/plans/flow/references/explorations/machine-fragments/machine-design.md`. Code marks: **NEW**, **NEW
MEANING**, **RENAMED**, **REMOVED**, existing, user-defined. Prior art, kept beside this file: proposal-v5.md (its
open questions are answered here), findings-v4.md (the two reviews), brief-blunt.md (the accepted base), v4, v3, v2, v1.

## 0. What the user decided (2026-11-07)

The on-screen rule (section 1). Keeping an actor alive is lifting its use up; no `keepAlive`, no `lifetime` option, no
memory-only record for ended non-persisted actors (v5 Q1 D rejected). Lift services and data; keep screen-dependent
work in the screen's state. Two development diagnostics and `ScheduleLeadsToWrite`. v5 Q2 A (schedules wait), Q3 A
(the records cliff drops only fresh-start records; replaces brief decision 13), Q4 A (local actors). The rest of v5
stands (`<Hydrate>`'s hold, `detach`, `ActorAbsent`, `NoRecord`, Stories' meanings, B3–B14). The "you are being let
go" signal is deferred (`proposals/revisit.md`).

## 1. The rule, in full (this block is the new MD 2.7.17, entry L8)

````markdown
#### 2.7.17 Actor lifetime: alive while used, and until its work in flight returns

Rule 73 is normative (decided, OD27, OD31). It replaces Runtime O3's `retain`, a guessed duration per ref that expired
an actor whatever it was doing. An actor behaves as a mounted component does: its state lives while something uses
it, its timers stop when nothing does, and a request already sent still returns. That last part is the one
exception, and it prevents a dangerous bug: work already in flight keeps the actor until its ending's turn has run,
so a chained step (Pay's confirm, then `place`) is committed by the incarnation that started it. Leaving is sometimes
how a user cancels, so nothing else outlives the last use. An actor that must outlive a screen is used from where it
should live; Flow has no keep-alive option.

Prior art. React clears an unmounted component's timers, and a fetch already sent still resolves. XState ties an
actor to its owner (`useActorRef`'s effect cleanup), and apps lift long-lived actors into a root provider
(`createActorContext`). TanStack Query keeps an unobserved query for `gcTime` (`query-core/src/removable.ts:25-28`),
never removes one while it fetches (`query.ts:226-227`), and lets a pending mutation outlive its observers
(`mutation.ts:155-162`), as lanes do (OD19). Flow keeps `gcTime` for store data, not for actors: an actor runs work,
and a window would run it for an absent screen.

```ts
// before
actorRef(EditorMachine, ticket, { persist: true, retain: "10 minutes" });
actorRef(PresenceMachine, ticket, { retain: "15 seconds" });
// after
actorRef(EditorMachine, ticket, { persist: true });   // dropped: retain
actorRef(PresenceMachine, ticket);                     // dropped: retain
```

Scope. Shared actors (`actorRef`), and local actors made by `useActor`, whose one use is their component (React O3).
A local actor made by host `createActor` lives until `disposeActor` or Runtime disposal (Runtime O3). `disposeActor`,
`forget` and Runtime disposal are explicit and are not governed by this section.

Uses. A use is:
- an ensuring hook (`useActorByRef(ref, options)`), from its passive commit effect (the one `useSyncExternalStore`
  subscribes in) to that effect's cleanup, including while its attach waits for readiness, lazy adoption, a `Hydrate`
  boundary or a disposing predecessor. Render registers nothing, so a discarded render leaks none. When shown content
  suspends again, React keeps its passive effects, so a Suspense fallback keeps its uses; React Activity's hidden mode
  cleans up passive effects, so hiding ends them;
- a live `snapshots` subscription, from host code or from Flow, from the moment it is made until it stops. On an
  identity with a record and no live incarnation it restores the actor (Return). On an identity with neither, it
  emits that identity's current snapshot (Reads) and waits: the ensure that next creates the actor finds the use
  already held. It completes when its subscriber stops, or after the terminal snapshot of `disposeActor`, `forget`
  or Runtime disposal;
- `dehydrate`'s hold: its Runtime subscribes to each shared actor in the call that installs it (an ensure, or a
  provider restored for it), before control returns to `prepare`; the hold ends at capture or rejection;
- `Hydrate`'s hold on each actor its payload inserted, from the boundary's commit until that actor's first consumer
  attaches or the boundary unmounts;
- a bound context consumer, which is a use of its provider;
- in an app Story, `ensure(ref)` until `detach(ref)` (2.10.10).
`ensureActor` alone, `getSnapshot`, a lookup (`useActorByRef(ref)` with no options), `useView` and sends are not
uses. Uses count per actor identity (rule 74).

Work in flight. Besides its uses, an actor is kept by finite work it already started, until that work's ending's turn
has run in the same incarnation:
- a write lane of the actor that is `InFlight` (waiting to be invoked or on the wire; bound or unplaced, rule 53);
- a read started in a turn that handles the ending of work in flight, transitively: write, read, write (`Confirmed`
  refetches the cart, and its answer commits `place`) runs to its end. A read started in any other turn keeps nothing;
- at `ready`, an ending owed by the restore (Ready and hydration).
A write any turn commits is `InFlight`, so it keeps the actor too. Mail already queued is processed: the end waits
behind it, and a send restarts nothing. A `Held` lane, with or without waiting commits, keeps nothing; rule 44 hands
it off.

Schedules wait while nothing uses the actor. During the grace, or while it is kept only by work in flight, its
schedules do not fire: a deadline that comes due waits. If a use returns before the end, each waiting deadline fires
once, in deadline order (Machines O5's overdue rule); at the end a persisted record keeps them and a non-persisted
actor loses them. Activities and stream sessions run until the end. A chained step reached only through a schedule
therefore waits for the next use, which `flow check` reports (Diagnostics). A poll a chain needs belongs inside the
read (`Effect.repeat` with a `Schedule` in the lookup's Effect: one finite read); a transport deadline belongs inside
the commit (`Effect.timeoutOrElse`, 2.7.6).

The grace. An actor is free when it has no use and no work in flight. When it becomes free, the core returns an effect
arming the grace, 100 ms on the Runtime Clock (React O3's, internal, the same for local actors), identified by its
deadline. The driver in `src/host/` sleeps, yields once so that fibers forked before the expiry have run, and
delivers the expiry as a Runtime step. A use or new work in flight disarms it; an expiry whose deadline is not the
armed one does nothing. The core never reads the clock.

The end. At the expiry, if the actor is still free, the end step runs after the mailbox drains:
1. A persisted actor's record (state, memory, armed and waiting deadlines, restartOn baselines) is encoded into the
   Runtime's copy in this step; a capture may not have run yet. If it cannot be encoded, the actor does not end: it
   stays live, the codec's diagnostic is published once (Persistence O5), `uses.busy` names it, and the grace is
   armed again, so the end is retried at each expiry.
2. Its lanes move to the Runtime unbound (rule 44), with any endings parked for a path (rule 53).
3. Its schedules are cancelled and its activities, sessions and unkept reads stopped (Runtime O6's cleanup). The end
   is a trace record with the reason `NoUses`, listing the live work it stopped (Diagnostics).
Until the driver reports that cleanup is done (the core's `stopped(actor, incarnation)` input), the actor is ending:
sends follow the table below, and an ensure waits and binds the next incarnation (Runtime O3). When a new
incarnation of an equal local identity (2.7.13) starts while an older one is kept only by work in flight, the older
one is disposed at once and the new one adopts its lanes, so the remounted screen receives the ending, not an
invisible predecessor.

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
| ended, persisted, record decodes | restored (Return), delivered last. It has no use, so its schedules wait, and it ends after the grace unless the event starts work in flight |
| ended, record does not decode | dropped, `RecordUndecodable`; the record stays for an ensure to discard |
| no record (not persisted, never created, disposed, forgotten) | dropped, `NoRecord` |
| a lazy entry not adopted | dropped, `NotAdopted` |
| being disposed by `disposeActor` | dropped, `NoRecord` (Runtime O4) |

A send never creates: creating is an ensure's decision, and a send must not resurrect a disposed or forgotten
identity, start a singleton without its input, or adopt a lazy entry. Restoring is not creating: the record already
holds state and memory. Reasons are reported on the sender and never roll back its turn.

Keeping an actor alive: lift its use up. Hold the use where the actor should live, as XState apps lift actors into a
root provider:
- the app shell, for services: a session, notifications, a player, downloads, an idle-logout timer, an IDE's
  workbench services;
- the layout spanning the routes that share an actor: a wizard across routes, a list and its detail;
- the tab strip, for editor tabs, above any React Activity boundary, since hiding ends the uses inside it;
- for a headless host, a `snapshots` subscription taken with the ensure, before anything awaits (a subscription on
  an identity with no actor waits as a use, so their order never matters).

```ts
function WizardLayout({ children }: { children: ReactNode }) { useActorByRef(wizardRef, {}); return children; }
const editor = runtime.ensureActor(editorRef(T42));          // keeps nothing by itself
yield* Effect.forkScoped(Stream.runDrain(editor.snapshots)); // a use until the scope closes
```

Persisting the ref keeps state across an end, but not work: a persisted actor's schedules wait while nothing uses it.

Lift services and data; keep screen-dependent work in the screen's state. Work that should stop when a screen leaves
or changes state belongs to that screen's machine, in the state it serves. A poll that should stop with a child's
state is that state's schedule or activity in the child; its results land in an entity domain, one record per key in
the Runtime's store, which the lifted parts read, so the lifted list and several children see the same record (a
read's session is per placement and key, rule 68). `send(ref, event)` up is for a lifted service's mode chosen by a
child, such as a player's track. No event is sent when a screen leaves, so the screen-scoped activity is the
backstop: what must stop with the screen runs there, and a mode left set by a child that left is one that is harmless
while it stays.

Commit on the way out: a `Close` event commits a dirty draft, and that write keeps the actor until it returns
(`Close: [{ target: S.CLOSED, guard: [dirty, O.save.idle(ticketKey)], actions: [commitDraft] }, { target: S.CLOSED }]`).
Send it from the navigation itself (a close button, a router's leave hook), never from an effect cleanup: React Strict
Mode runs cleanups in development, and Activity runs them when it hides a subtree that can be shown again.

Diagnostics. None is public API; each is evidence, Inspection or a `flow check` finding.
- **An end with live work** (development). When an end stops live work (an armed or waiting schedule, an open stream
  session or activity, a read that did not keep the actor), the Runtime reports the warning `EndedWithWork` once per
  machine and kind of work per Runtime, naming the work and, for a persisted actor, that its deadlines are in the
  record. In production the end's trace record lists the same work.
- **A create soon after an end.** A create of an identity that ended in the last 5 seconds carries how long ago it
  ended, and `flow trace` marks it: a forgotten lift, visible in development when the network is throttled.
- **`ScheduleLeadsToWrite`** (`flow check`), for each schedule whose `send` turn can reach a write member (`commit`,
  `retry` or `cancel` of a transaction or domain write), following handlers, raises, exits, entries, host transitions
  (rule 7) and lookup endings with their raises, to a fixed point, over every arming path: entry, `armOn`,
  `restartOn`, keyed `keys`, `.each` copies and subroutine entry. It is a warning when the schedule is armed in a turn
  that handles a write's ending (a chain through a schedule, such as a retry with a delay); otherwise it is info. For
  a machine with no persisted ref, or a local one, the message says "lost if the screen leaves first: persist the
  ref, commit on close, or lift the actor's use"; for a persisted one, "delayed until the next open: it fires once,
  late, against what the server holds then, so the write needs a precondition such as If-Match". A repeating
  schedule whose write can outlast its period is named as such. `flow explain` prints the path per schedule. The
  finding never affects lifetime.
- **Inspection** gives each actor `uses: { consumers, subscriptions, contexts, pendingEnsures, busy }`, shown by
  `flow trace` and `flow explain`: `consumers` are attached hooks; `pendingEnsures` are hooks past their commit effect
  and not yet attached; `subscriptions` each carry an owner (host code, `dehydrate`, `Hydrate`, a follower);
  `contexts` are bound consumers; `busy` lists work in flight by address (rule 65), the mailbox depth, waiting
  deadlines and an unencodable record. A free actor shows its grace in `inspection.work`. Every end and return is a
  trace record. An actor is printed by its machine and input fields (`Editor{workspaceId: "north", ticketId:
  "T-42"}`) or a singleton's name (rule 74).

States:

| State | Left by |
| --- | --- |
| Live, used | the last use ending |
| Live, kept by work in flight (schedules wait; `uses.busy` lists the work) | the last kept ending's turn; then free |
| Live, in the grace (schedules wait; one armed grace) | a use or new work (stays live), or the expiry |
| Live, end blocked (`uses.busy` names the unencodable record) | an expiry at which it encodes |
| Ending (terminal snapshot; activities stopping; sends queued for a persisted identity) | cleanup done; a cleanup failure quarantines (Runtime O6) |
| Ended, persisted (the Runtime's copy, the stored record, lane records, parked endings) | an ensure, subscription or send (Return); `disposeActor` (record removed, lanes kept unbound, rule 46); `forget`; Runtime disposal |
| Ended, not persisted (its non-`Idle` lanes, unbound, with parked endings) | the lanes resolve, a new incarnation adopts them, or Runtime disposal |
| Record at `ready` | as ended, persisted; restored live at once if its lanes owe it an ending |
| Quarantined (the ref's failure and Cause) | Runtime disposal |

Over Persistence O3's bounds (4,096 records, 16 MiB), a capture drops the oldest ended records that equal a fresh
start (the state and memory a new ensure would build from the identity's input, only the initial leaf's entry
deadlines, no non-`Idle` lane, no parked ending), with evidence. If that is not enough, the capture is rejected as O3
says, and its evidence names the oldest ended identities, so the app can `forget` them. A record that holds anything
a user did is never dropped.

Multi-tab. Under Persistence O7 a second tab runs without persistence and uses are per Runtime. Under multi-tab.md (a
proposal), a follower's attached mirror is a use in the leader, ended by its detach or its presence lock's grant, and
a new leader restores as Ready says and waits for no one.

Stated limits.
- Per-entity timers that no screen can hold (a reminder per row of a list nobody opens) stop with their actor; they
  belong on the server or in a lifted service with keyed schedules.
- A persisted autosave inside its debounce fires at the next open or reload: late, not lost, so the write needs a
  precondition. A non-persisted one is lost.
- A chained step that needs the user (3-D Secure's `authenticate`) runs with nobody on the page; send a `Leave`
  event from the router's leave hook.
- A chain through a delayed retry stops at the delay when the user has left (warned).
- An offline write that ended unknown (`Held`) before a reload is not woken at `ready`; it syncs at the next use.
  Keep an offline write in flight (the commit waits for connectivity inside its Effect) rather than ending unknown.
- Rows held in a non-persisted actor's memory are refetched when it starts fresh; rows held in an entity domain or a
  resource stay in the store for their `gcTime`.
- A send that restores runs the starting turn, entry lookups and activities, then ends after the grace; a send to
  many ended persisted identities restores each. Restore cost is not measured.
- A write or kept read that never settles keeps its actor until Runtime disposal; its timeout belongs in the Effect.
  A `snapshots` subscription never stopped is the caller's leak; Inspection names its owner.
- Follower uses and React's effect timing (Strict Mode, Suspense, Activity) need browser tests.

What no longer happens implicitly: a busy actor losing its live incarnation, which made R8 H2 and R9 H1 reachable
without a reload. What stays: Runtime-owned lanes (OD19), parked endings on lane records (OD21, OD22) for reload,
Runtime disposal and dormant lazy records, unbound lanes for `disposeActor` and local actors, unplaced lanes (rule
53), adoption by identity, `unknown { Restored }` and `runtime.unsettledWrites()`.
````

## 2. Keeping an actor alive

### 2.1 Lift the use: a wizard across routes (not persisted)

```tsx
// BEFORE: app/(signup)/account/page.tsx and app/(signup)/plan/page.tsx, each
const wizard = useActorByRef(signupRef, {});         // existing; user-defined: signupRef
// a route change slower than 100 ms (loading.tsx, a slow chunk) ends the wizard: the next page starts at ACCOUNT

// AFTER: app/(signup)/layout.tsx (user-defined: SignupLayout)
export default function SignupLayout({ children }: { children: ReactNode }) {
  useActorByRef(signupRef, {});                      // existing: the layout spans both routes, so one use holds
  return children;
}
// each page keeps its own useActorByRef(signupRef, {}) to read and send: a second use, unchanged
```

Added: one hook call where the actor should live. Dropped: `retain` (**REMOVED**). The same move covers a list and its
detail (the list's layout), editor tabs (the tab strip, above any Activity boundary) and services (the app shell, 4.8).

### 2.2 Lift services and data; keep screen-dependent work in the screen's state

Notifications live in the app shell and poll every 60 s; the inbox wants every 5 s while it is open. This is also
case 4.9, a lifted poller stopped by a child's state.

```ts
// BEFORE: the inbox switches the lifted service's cadence, and must switch it back
useEffect(() => { notifications.send(E.Fast()); return () => notifications.send(E.Slow()); }, []);
// a missed Slow (a skipped cleanup, Activity) leaves the shell polling at 5 s for the app's life

// AFTER: inbox.definition.ts (user-defined: Inbox, NotificationsDomain, unread, MuteToggled, PollDue, Listed, ListFailed)
export const Inbox = definition({
  id: "Desk/Inbox",
  states: ["OPEN", "CLOSED"],
  events: { MuteToggled: { muted: Schema.Boolean }, Close: {} },
  internalEvents: { PollDue: {}, Listed: {}, ListFailed: {} },
  memory: { userId: Flow.input(Schema.String) },
  operations: ({ E }) => ({
    unread: NotificationsDomain.unread.outcomes({                 // existing: a domain read; rows go to the domain
      success: E.Listed,
      failure: { NoResponse: E.ListFailed, Defect: E.ListFailed, Interrupted: E.ListFailed },
    }),
  }),
});
// notifications.machine.ts (lifted in the app shell; declares the same `unread` read; user-defined: MuteChosen)
LIVE: {
  schedules: { poll: { schedule: Schedule.spaced("60 seconds"), send: E.PollDue } },
  on: {
    PollDue: { target: "self", actions: [O.unread.lookup(({ memory }) => ({ userId: memory.userId }))] },
    MuteChosen: { target: "self", updateMemory: ({ event }) => ({ muted: event.muted }) },   // a mode a child may set
  },
},
// inbox.machine.ts (the screen's own actor): the fast poll is OPEN's schedule
OPEN: {
  schedules: { poll: { schedule: Schedule.spaced("5 seconds"), send: E.PollDue } },
  on: {
    PollDue: { target: "self", actions: [O.unread.lookup(({ memory }) => ({ userId: memory.userId }))] },
    Listed: { target: "self" },
    ListFailed: { target: "self" },
    MuteToggled: { target: "self", actions: [send(NotificationsRef, ({ event }) => Notifications.E.MuteChosen({ muted: event.muted }))] }, // existing: send
    Close: S.CLOSED,
  },
},
CLOSED: {},
```

Both lookups write `NotificationsDomain`, one record per notification, which the shell's badge and the inbox read.
Added: nothing in Flow. Dropped: `Fast`, `Slow`, the cleanup sends. The 5 s poll stops when `OPEN` is left or the
inbox ends (100 ms after its screen leaves), with nothing sent; `MuteChosen` goes up because it is harmless if it
stays set after the inbox leaves. The same shape serves a list lifted into its layout and a detail that polls its
order's status while `TRACKING`.

## 3. The diagnostics

| Diagnostic | Where | Example |
| --- | --- | --- |
| `EndedWithWork` (development warning, once per machine and kind of work) | console, `flow trace` | `Queue{workspaceId: "north"}` ended with `poll` waiting and a `list` session open |
| a create within 5 s of an end | the create's trace record, marked by `flow trace` | `Wizard` created 340 ms after it ended |
| `ScheduleLeadsToWrite` (warning or info) | `flow check`, `flow explain` | editor `autosave` → `save.commit`: "delayed until the next open: it fires once, late, against what the server holds then, so the write needs a precondition such as If-Match" |
| `uses` | `inspect(runtime)`, `flow trace`, `flow explain` | `busy: [{ operation: "mergeCustomers" }]` |

With a throttled network in development, a forgotten lift shows as the create note and the work it cut as
`EndedWithWork`. Neither changes behaviour.

## 4. The cases

**4.1 The editor's autosave (persisted).**

```ts
actorRef(EditorMachine, ticket, { persist: true, retain: "10 minutes" }); // BEFORE: editor.ref.ts; REMOVED: retain
actorRef(EditorMachine, ticket, { persist: true });                       // AFTER; existing
```

Closed inside `autosave`'s 2 s debounce: no use, nothing in flight, so the editor ends 100 ms later with the draft and
the waiting deadline in its record (`EndedWithWork` names `autosave`). Reopened, `autosave` fires once, late, so the
title save gets `If-Match` as `body.trait.ts` does. A save on the wire at the close keeps the editor until `Saved`, and
the same incarnation sends `toastSaved`. Unknown: `resend` waits, the `Held` lane keeps nothing, the editor ends, and
on return `unknown { Restored }` re-enters `UNSURE`. `flow check`: `autosave`, `settle` (info); `resend`,
`LOCKED.retry` (warnings).

**4.2 Checkout: the chained confirm, and a status poll in the chain.** `payRef` and `Pay.tsx` are unchanged.

```ts
Confirmed: { target: S.REFRESHING, actions: [O.cart.lookup(cart)] },   // existing: started in a kept turn, so it keeps
CartRead:  { target: S.PLACING, actions: [O.place.commit(cart)] },     // a kept turn again: place keeps
intentSettled: resource({                                              // existing: resource; user-defined: intentSettled
  id: "Checkout/intent-settled", input: { intentId: Schema.String }, output: Intent, key: ["intentId"],
  lookup: ({ intentId }) => Stripe.use((s) => s.retrieve(intentId)).pipe(   // "processing": poll inside the read
    Effect.repeat({ schedule: Schedule.spaced("2 seconds"), while: (i) => i.status === "processing" }),
    Effect.timeoutOrElse({ duration: "2 minutes", orElse: () => Effect.fail(new StillProcessing()) }), // user-defined
  ),
}),
```

Back pressed mid-confirm: the `InFlight` lane keeps Pay; `Confirmed`'s read keeps; its answer commits `place`, which
keeps; `Placed` lands; Pay ends 100 ms later, one incarnation throughout. `UNSURE.check` is a schedule: with the
shopper gone it waits, the webhook places the order, and on return `unknown { Restored }` resumes the reconcile
(warned). `requires_action` still commits `authenticate` with nobody there (a limit).

**4.3 Presence.** `actorRef(PresenceMachine, ticket, { retain: "15 seconds" })` becomes `actorRef(PresenceMachine,
ticket)`. It ends 100 ms after the panel closes (or when a `ping` on the wire returns); its heartbeat waits meanwhile,
so a slow `ping` cannot chain. A gap over 100 ms inside the ticket leaves and rejoins: hold it in the ticket's layout.

**4.4 The queue on a server page** (`next/app/desk/[workspace]/page.tsx`, unchanged but for identity's `{ input }`).
Each `ensureActor` in `prepare` installs the actor and `dehydrate`'s hold in one call; `<Hydrate>` holds the queue
until `QueueClient` attaches, even under a later Suspense segment. After the user leaves, the poll waits and it ends.

**4.5 A toast.** The always-mounted `ToastStack` is a use, so `SHOWING.expire` fires; `toastSaved` runs in `Saved`'s
kept turn; with no stack mounted, the send drops `NoRecord` on the sender.

**4.6 A local actor.** `useActor(PayMachine, { input })`, unchanged. Unmounted mid-confirm, it is kept, hears
`Confirmed`, commits `place`, ends after `Placed`. Remounted with equal input while kept, the old one is disposed at
once and the new one adopts the lane and hears `Placed`.

**4.7 A Story** (`dispatch-desk/features/Roster/roster.story.ts`, `mergeOutlivesScreen`, after its `Confirm`).

```ts
// BEFORE
  .dispose(North).advance("2 minutes").checkpoint("leftMidMerge")         // kept for retain, then no actor
  .world(Desk.mergeCustomers.release()).ensure(North, { input: { workspaceId: "north" } }).checkpoint("mergeAdopted");
// AFTER
  .detach(North)                          // RENAMED (from Story.release): the screen unmounts
  .advance("1 second")                    // existing: past the grace; North stays, the merge is InFlight
  .checkpoint("leftMidMerge")             // user-defined; uses.busy: [{ operation: "mergeCustomers" }]
  .world(Desk.mergeCustomers.release())   // existing: the fake's wire release; the same North sets its notice
  .advance("1 second")                    // now free, North ends; its record holds the notice
  .ensure(North)                          // NEW MEANING: one use; restored from the record
  .checkpoint("mergeShown");              // user-defined
```

"The answer lands with no actor" is `detach`, `reload`, then the release: North is restored at `ready`, owed
`unknown { Restored }`.

**4.8 An app shell lifting services** (dispatch-desk's Next host). Before: the session's only uses are screens,
`ToastStack` is mounted only by `app/view.tsx`'s `Desk`, and the feed (pushed ticket changes, the desk's
notifications) is used only by `ActivityLog` in an open ticket, so it ends when the ticket closes.

```tsx
// next/app/shell.tsx (NEW file; user-defined: DeskShell)
"use client";
export function DeskShell({ userId, children }: { userId: string; children: ReactNode }) {
  useActorByRef(SessionRef, { input: { userId } });   // existing: a use for the app's life (a singleton takes input)
  return <>{children}<ToastStack /></>;               // existing: ToastStack holds ToastsRef on every route
}
// next/app/layout.tsx: <Hydrate payload={payload}><DeskShell userId={user.id}>{children}</DeskShell></Hydrate>

// next/app/desk/[workspace]/layout.tsx (NEW file; user-defined: WorkspaceLayout)
export default async function WorkspaceLayout({ children, params }: { children: ReactNode; params: Promise<{ workspace: string }> }) {
  const { workspace } = await params;
  return <WorkspaceShell workspaceId={workspace}>{children}</WorkspaceShell>;
}
// next/app/desk/[workspace]/workspace-shell.tsx (NEW file; user-defined: WorkspaceShell)
"use client";
export function WorkspaceShell({ workspaceId, children }: { workspaceId: string; children: ReactNode }) {
  useActorByRef(feedRef({ workspaceId }), {});        // existing: notifications keep arriving on every desk route
  return children;
}
```

Added: two shells, no Flow word (imports as in `app/view.tsx`). `DeskShell` sits inside `Hydrate`, so the dehydrated
session's first consumer is the shell. In the host-owned form, `Desk` adds `useActorByRef(feedRef({ workspaceId }),
{})` beside its session hook.

**4.9 A lifted poller stopped by a child's state** is section 2.2's case.

## 5. Actor states and memory; limits

The states table is in section 1. Where an actor's data is in each state:

| State | Live incarnation | Runtime's copy | Stored record | Lanes |
| --- | --- | --- | --- | --- |
| Live (used, kept, grace, end blocked) | state, memory, activations, deadlines, activities, sessions, mailbox | captured (persisted only) | last capture | bound |
| Ending | terminal snapshot; activities stopping | encoded in the end step | next capture | moving to the Runtime |
| Ended, persisted | none | state, memory, deadlines, baselines | yes | Runtime-owned, parked endings |
| Ended, not persisted | none | none | none | Runtime-owned until resolved or adopted |
| Record at `ready` | none, or live if owed an ending | decoded from storage | yes | restored |

Limits (section 1 states them) and their remedies: per-entity timers no screen can hold → server timers, or a lifted
service with keyed schedules (2.7.10); a late write without a precondition → `If-Match` or a version; a step needing
the user → `Leave` from the router's leave hook, later perhaps the deferred "you are being let go" signal
(`proposals/revisit.md`); a chain through a delayed retry → retry in the ending's turn or poll inside the read; an
offline write that ended unknown before a reload → keep it in flight; rows refetching → keep them in an entity domain
and lift the list; restore cost → unmeasured; follower uses and React effect timing → browser tests.

## 6. The merge change list

Apply after absorb-wiring (W1–W38: OD29, C114–C116, C123) and actor-identity (I1–I19: OD30, rule 74, 2.7.19,
C117–C122). Each Current below occurs exactly once in MD as it stands now (`grep -cF`, or a multi-line `index` count
for the ⏎ entries, run 2026-11-07), and none is touched by a W or I entry, except as noted. Line numbers are today's.

**Interaction with actor-identity.** I8 inserts rule 74 after the line "Local actors keep React O3. `retain` does not
exist."; L4 then replaces rule 73 above it, so rule 74 stays. I9 inserts 2.7.19 after 2.7.18's "Rule 73" bullet; L9
then edits that bullet. **I13–I15 are absorbed by L8**: L8 replaces 2.7.17 between anchors that I13–I15 do not touch,
and its text carries the value refs (I13), "Uses count per actor identity (rule 74)" (I14) and the printing line (I15).
Applying I13–I15 first or skipping them gives the same result. Identity's file has entries I1–I19 only.

**L1. Header revision** (MD:33–35). Current:

```text
**Revision (actor lifetime, 2026-11-07).** `retain` is removed: a shared actor lives while it is used, and work in
progress is a use (rule 73, 2.7.17; decided, OD27). Proposal and evidence:
[../../proposals/actor-lifetime/proposal.md](../../proposals/actor-lifetime/proposal.md).
```

New:

```text
**Revision (actor lifetime, 2026-11-07).** `retain` is removed: a shared actor lives while it is used, plus until its
finite work in flight has returned; its schedules wait while nothing uses it, and an actor that must outlive a screen
is used from where it should live (rule 73, 2.7.17; decided, OD27, OD31). Proposal and evidence:
[../../proposals/actor-lifetime/proposal-v6.md](../../proposals/actor-lifetime/proposal-v6.md); earlier versions
beside it are prior art.
```

**L2. Rule 44, the end** (MD:863–864). Current:

```text
    **unplaced** and parks its endings (rule 53). Implicit disposal never happens while a lane of the actor is
    `InFlight` or has waiting commits (rule 73); a `Held` lane is handed off by this rule.
```

New:

```text
    **unplaced** and parks its endings (rule 53). An actor never ends implicitly while a lane of the actor is
    `InFlight` (rule 73), so a sent write's ending reaches the incarnation that sent it; a `Held` lane, with or
    without waiting commits, keeps nothing and is handed off by this rule. When a shared actor ends, persisted or
    not, endings parked for a path stay on the lane record, and the next incarnation that adopts the lane receives
    them.
```

**L3. Rule 44, once per incarnation** (MD:856). Current: ``per lane in creation order, a held head's `unknown {
Restored }` exactly once`` New: ``per lane in creation order and once per incarnation (a reload, or a return after an
end, rule 73), a held head's `unknown { Restored }` `` (the parenthesis on reloads that follows stays).

**L4. Rule 73, in full** (MD:1107–1112). Current:

```text
73. **A shared actor lives while it is used** (decided, OD27; 2.7.17). A use is an attached consumer, a live
    `snapshots` subscription, a bound context consumer, a pending ensure, mail not yet processed, or a write lane that
    is `InFlight` or has waiting commits. With no uses for the grace (React O3's, on the Runtime Clock), the Runtime
    disposes the actor; a persisted identity keeps its saved record and the Runtime's copy, so the next ensure or send
    restores it without a flash of `initial`. `Held`, armed schedules, placements and stream sessions are not uses.
    Local actors keep React O3. `retain` does not exist.
```

New:

```text
73. **A shared actor lives while it is used, and until its finite work in flight has returned** (decided, OD27,
    OD31; 2.7.17). A use is an attached consumer (from its passive commit effect, never from render), a live
    `snapshots` subscription, a bound context consumer, or Flow's hold for `dehydrate` and `Hydrate`. Work in flight
    is an `InFlight` write lane, a read started in a turn that handles the ending of work in flight (transitively),
    and an ending owed at `ready`; it keeps the actor until its ending's turn has run, so a chained step is
    committed by the incarnation that started it. Nothing else keeps an actor: not schedules, other reads,
    activities, stream sessions, `Held` lanes, parked endings or context; queued mail is processed before the end.
    While nothing uses it, its schedules wait. Free of both for the grace (100 ms on the Runtime Clock, internal,
    the same for local actors), it ends; a persisted actor's record is encoded in that step, and the end waits
    while the record cannot be encoded. An ensure, a subscription or a send restores a persisted identity from the
    Runtime's copy; a non-persisted actor is gone, and its lanes stay with the Runtime (rule 44). An actor that must
    outlive a screen is used from where it should live. Local actors made by `useActor` follow the same rule; host
    `createActor` actors live until disposed. `retain` does not exist.
```

**L5. 2.7.13, parking** (MD:2198–2199). Current: ``(a⏎persisted actor disposed with no uses (rule 73), or awaiting
reload)`` New: ``(a⏎persisted actor that ended under rule 73, a dormant lazy record, or one awaiting reload)``.

**L6. 2.7.13, binding** (MD:2234–2235). Current: ``Restore at ready, and⏎an ensure after no-use disposal (rule 73),
bind`` New: ``Restore at ready, and⏎a return after an end (rule 73), bind``.

**L7. 2.7.13, the R9 H1 walk** (MD:2442–2443). Current: ``"Runtime disposal with an Attempt on the wire, reload, the
write succeeds, ensure: the restored state⏎receives the ending" (R9 H1; retain expiry no longer exists, rule 73)``
New: ``"Runtime disposal with an Attempt on the wire, the write succeeds within the bound, reload: the identity, owed
the parked⏎ending, is restored live at `ready` and receives it" (R9 H1; an implicit end never meets an `InFlight`
lane, rule 73)``.

**L8. 2.7.17, the whole section** (MD:2664–2717). Current: from ``#### 2.7.17 Actor lifetime: alive while used``
through the paragraph ending ``adoption by identity, `unknown { Restored }` and `runtime.unsettledWrites()`.``, the
last line before ``#### 2.7.18``. New: section 1's block, exactly. Replaced in place; the old section's every bullet
(Uses, When, What disposal keeps, Sends, Keeping an actor alive, Scope, Multi-tab, Inspection and Stories, Stated
limits) is superseded.

**L9. 2.7.18, the rule 73 bullet** (MD:2765). Current: ``- **Rule 73.** An ignored unknown leaves no `InFlight` lane,
so it is not a use.`` New: ``- **Rule 73.** An ignored unknown leaves no `InFlight` lane, so it does not keep the
actor.``

**L10. 2.10.1, the `Story.app` row** (MD:3904). Current: ``| `ensure(ref)`, `dispose(ref, { how? })`, `send(target,
…events)`,`` New: ``| `ensure(ref)`, `detach(ref)`, `dispose(ref, { how? })`, `send(target, …events)`,``.

**L11. 2.10.1, data forms** (MD:3934). Current: ``| `ensure`, `dispose` | `{ ensure: [ref?, options?] }`, `{ dispose:
[ref?, options?] }` |`` New: ``| `ensure`, `detach`, `dispose` | `{ ensure: [ref?, options?] }`, `{ detach: [ref?] }`,
`{ dispose: [ref?, options?] }` |``.

**L12. 2.10.2, settling** (MD:4003). Current: ``| `ensure`, `dispose`, `openTab`, `closeTab`, `reload`, `enter`,
`leave`, `reset`, `setContext` | the lifecycle command, as a host would issue it | settle |`` New: ``| `ensure`,
`detach`, `dispose`, `openTab`, `closeTab`, `reload`, `enter`, `leave`, `reset`, `setContext` | the lifecycle
command, as a host would issue it; `ensure` and `detach` attach and end one use, as a screen mounting and
unmounting (rule 73) | settle |``.

**L13. 2.10 word count, Uncommon** (MD:3884). Current: ``| **43** new, 13 reused | Subjects, 2: `Story.app`,
`Story.fragment`. Steps and options, 12: `together`, `dispose`, `how`,`` New: ``| **44** new, 13 reused | Subjects, 2:
`Story.app`, `Story.fragment`. Steps and options, 13: `together`, `dispose`, `detach`, `how`,``.

**L14. 2.10 word count, Total** (MD:3885). Current: ``| **Total** | **94** new, 18 reused |`` New: ``| **Total** |
**95** new, 18 reused |`` (34 + 44 + 17).

**L15. 2.10.10** (MD:4720–4722). Current: ``Rebind is `dispose()` then `ensure()`; no-use⏎disposal (rule 73) is
`Story.release(ref)` then `advance` past the grace, and leaves a busy actor live; `dispose(ref, { how: "now" })` is
`disposeActor` and⏎`{ how: "forget" }` is `forget` (STR9, STF43).`` New:

```text
A focused machine Story holds its subject for the whole run, so
`detach` is a type error there, and its `dispose()` then `ensure()` is a rebind. In an app Story, `ensure(ref)` attaches
one use, as a mounted screen does, and `detach(ref)` ends one (with none held by this Story it is
`StoryInvalidCommand { reason: "ActorAbsent" }`); an `advance` past the grace then ends an actor with no use and no work
in flight, and one kept by a write stays until its ending's turn has run (rule 73). `dispose(ref)` is `disposeActor` and
`{ how: "forget" }` is `forget` (STR9, STF43); no Story step ends an actor and keeps its record while it writes.
`openTab({ from })` and `reload` re-attach the uses this Story held in that tab's latest life, in first-ensure order.
```

**L16. 2.10.15, the parked cell** (MD:4840–4841). Current: ``(rule 73: no-use disposal never⏎meets a busy lane)`` New:
``(rule 73: an implicit end never⏎meets an `InFlight` lane)``.

**L17. 2.10.17.1, the step table** (MD:5018). Current: ``| `ensure`, `dispose`, `enter`, `leave`, `reset`,
`setContext` | open | fixed | after | one | `AlreadyEntered`, `NotEntered`, `ActorAbsent` |`` New: ``| `ensure`,
`detach`, `dispose`, `enter`, `leave`, `reset`, `setContext` | open | fixed | after | one | `AlreadyEntered`,
`NotEntered`, `ActorAbsent` |``.

**L18. 3.6, New, Stories** (MD:7509). Current: ``` `Fake.Closed`, `dispose` (`how`), `reload` ``` New: ``` `Fake.Closed`,
`dispose` (`how`), `detach`, `reload` ```.

**L19. OD27, annotated, not rewritten** (MD:8462–8463). Current: ``  Q3 no dedicated keep-alive API; Q4
`Story.release(ref)`; Q5 Inspection's `uses` per actor; Q6 the grace stays⏎  internal. (2026-11-07)`` New: the same,
then `` *Amended by OD31: work in progress is not a use (work in flight keeps an actor and ends; schedules wait);
`NotPersisted` is `NoRecord`; `Story.release(ref)` is `detach(ref)`; the grace is shared with local actors.*``

**L20. OD31, decision log**, after OD30 (anchor: OD30's last line, ending ```OldVersionActor`. (2026-11-07)``, I2; with identity unmerged, after OD29's W38 sentence). Insert:

```text
- **OD31** The user, 2026-11-07, in the Claude Code session: actor lifetime, the on-screen rule
  (../../proposals/actor-lifetime/proposal-v6.md; rule 73, 2.7.17, rule 44). A shared actor lives while it is used
  (an attached hook from its passive commit effect, a `snapshots` subscription, a bound context consumer, Flow's holds
  for `dehydrate` and `Hydrate`), plus until its finite work in flight returns (an `InFlight` write; a read started in
  the turn that handles such work's ending, transitively; an ending owed at `ready`). Free for 100 ms (internal,
  Runtime Clock, shared with local actors), it ends; a persisted record is encoded in that step, and the end waits
  while it cannot be encoded. Keeping an actor alive is lifting its use up (app shell, layout, tab strip, a host
  subscription); no `keepAlive`, no `lifetime` option, no memory-only record for ended non-persisted actors. Lift
  services and data; keep screen-dependent work in the screen's state. Diagnostics: `EndedWithWork` in development,
  a create within 5 s of an end noted in Inspection, `flow check`'s `ScheduleLeadsToWrite`. Schedules wait while
  nothing uses the actor. Records cliff: only records equal to a fresh start are dropped, otherwise the capture is
  rejected naming the oldest ended actors. Local actors get the in-flight exception, and a remount of an equal local
  identity disposes a predecessor kept only by work. `<Hydrate>` holds each inserted actor until its first consumer
  attaches; a subscription on an identity with no actor waits as a use; a lookup and a handle follow the identity;
  sends restore, queue for an ending persisted target, or drop with `NoRecord` (replacing `NotPersisted`),
  `RecordUndecodable` or `NotAdopted`; `Restored` means a new incarnation, delivered once per incarnation; one
  `onContext` on a return within a Runtime, a reload silent. Stories: `detach(ref)` (renaming OD27 Q4's `release`),
  `ensure` attaches a use, `dispose` is `disposeActor` (amends the Stories decision W27: `{ how: "now" }` removed), `ActorAbsent` for a
  `detach` with no use held. Amends OD27. (2026-11-07)
```

**L21. Plan rows C104–C111, replaced in place** (MD:7742–7749; anchors ``| C104 | Runtime O3 |`` through
``| C111 | Inspection |``, each the start of its row). New rows:

```text
| C104 | Runtime O3 | Rule 73 (OD31): uses (an attached hook from its passive commit effect, a live snapshots subscription, a bound context consumer, Flow's holds for dehydrate and Hydrate); finite work in flight keeps an actor until its ending's turn has run; schedules wait while nothing uses it; free for 100 ms on the Runtime Clock it ends, its record encoded in that step; a persisted identity returns from the Runtime's copy; `actorRef` has no `retain`; `ConflictingActorRef` covers `persist` and `context`; host `createActor` actors live until disposed | Replaces "A use is an attached React consumer, a live snapshots subscription or a bound context consumer", "With retain (a Duration), a shared actor is disposed once retain has passed since its last use ended; a new use cancels that", "A provider with bound consumers never expires", "Without retain a shared actor lives until explicit or Runtime disposal" and "Retain expiry of a persisted actor disposes the live actor but keeps its saved record, so a later ensure restores it"; drops `retain?` from the signature and "retain" from "different persist, retain or context" (C117 rewrites the rest) |
| C105 | Runtime O4, LazyFeatures O2, React O3 | 2.7.17's send table for action and handle sends; reasons `NoRecord`, `RecordUndecodable`, `NotAdopted`; a send never creates and may restore; a snapshots subscription completes when its subscriber stops or after the terminal snapshot of disposeActor, forget or Runtime disposal, and on an identity with no actor waits as a use | Replaces "Sends to a disposing or disposed actor are dropped and reported as SendTargetAbsent, never thrown", "If the target is absent or disposing the event is dropped with SendTargetAbsent", "Sends through a handle whose actor is disposed are dropped as SendTargetAbsent" and "A snapshots subscription completes only at the actor's disposal, after its terminal snapshot"; "never adopts or creates its target" becomes "never adopts a lazy entry or creates an actor; it may restore one from its record" |
| C106 | Persistence O3, O4 | O3: an ended actor's record is encoded in the end step and kept; over the bounds, records equal to a fresh start drop first, then the capture is rejected naming the oldest ended identities. O4: restored records stay records until reached, except identities owed an ending (a lane `InFlight` at capture, a parked ending), restored live and kept until those turns run | Replaces "a persisted actor whose retain expired keeps its saved record (@plan.Runtime.O3)", "Exceeding either bound rejects the whole capture without eviction", "Restored stable actors are active without another ensure" (the rest of that sentence is C120's) and "Their retain clock starts at ready" |
| C107 | ServerRendering O1, O5 | O1: dehydrate's Runtime holds a use on each shared actor from its install to capture or rejection. O5: Hydrate holds each inserted actor until its first consumer attaches or the boundary unmounts | Replaces "Shared actor retention starts at activation"; adds to O1 after "it may ensureActor, createActor and send on handles" |
| C108 | React O2, O3, V4 | Uses from passive commit effects (re-suspension keeps them, Activity hiding ends them); a lookup of an identity with a record returns the record view; a pre-attach handle reads the Runtime's copy; local actors keep the 100 ms grace and gain the in-flight exception and the remount rule; during the grace activities run and schedules wait; across hiding, persist or hold a use outside the hidden subtree | Replaces "missing or disposed means null", "Shared ensuring hooks count as uses until cleanup; retention follows @plan.Runtime.O3", "Work continues during grace" and "Shared refs with retain are the way to keep state across hiding"; amends "Local cleanup leaves the actor active for 100 milliseconds on the Runtime Clock"; V4's "retention" becomes "uses and work in flight" |
| C109 | Runtime V4 | The end after the grace on the TestClock; Strict Mode inside it; a chain of two or more writes and reads in one incarnation; schedules waiting without a use | Replaces "retain expiry on the TestClock" |
| C110 | Testing O1 | App ensure attaches one use and detach(ref) ends one (`ActorAbsent` with none held); dispose is disposeActor, `{ how: "forget" }` is forget; openTab and reload re-attach the Story's uses; a focused Story holds its subject; send may restore, never create | Amends "App ensure(ref, options?) follows @plan.Runtime.O3 at the chosen step" and "send never creates an absent actor"; replaces C110's `Story.release(ref)` |
| C111 | Inspection O1 | Per actor `uses: { consumers, subscriptions, contexts, pendingEnsures, busy }` with subscription owners; ends and returns as trace records; a create within 5 s of an end carries how long ago; printing per rule 74 | Replaces "issues and retain" with "issues and uses" (C122 amends the naming) |
```

**L22. Plan rows C124–C127, appended after the C123 row** (anchor: ``| C123 | Machines O1 |``, the row W37 appends):

```text
| C124 | Machines O5 | Schedules fire only while their actor is used (@plan.Runtime.O3); a deadline due while it is unused waits and fires once when a use returns, as an overdue one does | Amends "On restore or resume, a Duration preserves its deadline and fires once if overdue" to "On restore, resume, a return after an end, or a use returning to an actor whose schedules waited, a Duration preserves its deadline and fires once if overdue" |
| C125 | Diagnostics O2, CommandLine O5 | `ScheduleLeadsToWrite` (warning or info) and its `flow explain` path; the development warning `EndedWithWork` | Adds to CommandLine O5's "Owner plans add findings of their own" and Diagnostics O2's codes; replaces no sentence |
| C126 | Operations O3 | `unknown { Restored }` means a new incarnation (a reload or a return after an end), once per incarnation | Amends "work with an acknowledged Attempt restores as unknown unless a durable settled result is known" |
| C127 | `references/design/multi-tab.md` 4, 5.3, V-MT2 | A follower's attachments are uses in the leader; a new leader waits for no one | Replaces "It releases that follower's attachments (retain)" with "its uses", "`retain` counts attachments in every tab" with "A follower's attachments are uses in the leader", the heading "Sends, dispose and retain" with "Sends, dispose and uses", and V-MT2's "retain across tabs" with "uses across tabs" |
```

### 6.1 Hits left in MD after the merge, with the reason

Run after L1–L22 (line numbers are today's):
- **`retain`** (lines 29, 649, 699, 822, 824, 1502, 1544, 1623, 1688, 1851, 1952, 2145, 2158, 2182, 2248, 2562, 3187,
  3272, 3276, 4932, 4963, 7508, 7598, 7605, 7732, 7751, 8075, 8181, 8360, 8466): a retained unknown, a retained
  prediction (`PredictionNotRetained`), shrinking, streams or the store; none is actor lifetime. 4676 and 4849:
  `Chat.retain({ last })`, a fake's control. 8457 (OD27): a dated record, annotated by L19. The new rule 73 and 2.7.17 name
  `retain` only as the removed option.
- **`release(`**: 3885, 4009–5541, 7509, 8609 are the fakes' wire `release()` (2.10.4); 8462 is OD27's dated
  `Story.release(ref)`, annotated. 2709, 4721 and 7748 are replaced (L8, L15, L21).
- **`NotPersisted`**: 8460, OD27's dated list, annotated. 2699 is replaced.
- **"work in progress"**: 8457, OD27, annotated. 33–34 are replaced.
- **"busy"**: a busy lane under `reject`, `busyTries`, `Stripe.busy` and a fake's `busy` truth (1338, 1420–1517,
  1655, 1719, 1760–1770, 1855–1868, 1920, 2094–2114, 3188, 4093–4108, 4286, 4366, 4436–4461, 4556, 4889, 5243–5312,
  5383, 7215–7338, 8086, 8100, 8108), the keep-busy line (1000, 1053, 3542, 3766, 3780, 3838, 3840, 5604, 8517,
  8520), a busy main thread (4016), a busy mailbox (3141). `uses.busy` in the new 2.7.17 and C111 is OD27's decided
  field. 2708, 2714, 4721, 4841, 7745, 7747, 7749 are replaced.
- **"grace"**: 7395 (`grace@example.com`), 8572 (a host-time settle), 8458 and 8462 (OD27, dated). The new rule 73,
  2.7.17, C104, C108 and C109 use it for the 100 ms grace. 1109, 2690–2705, 4721, 7742–7747 are replaced.

## 7. Suite and reference-app changes (not design text)

### 7.1 Conformance suite (`packages/flow-state-v3/prototypes/conformance/`)

As proposal-v5 section 11, which lists every case by id; in short:
- **The 27 record-keeping `c.dispose(` steps** (26 variants, 12 cases in `scenarios/`) move to four targets: **T1**
  `detach`, the ending reaches the same incarnation id, then it ends; **T2** `detach`, `advance` past the grace,
  `ensure`; **T3** `{ disposeRuntime }`, an answer inside the 5 s bound parked, `reload`, `ensure`; **T4** `dispose`
  stays (`disposeActor`). Changed results: REV5-H5H6's lost answer becomes `["unsure:a:NoResponse",
  "unsure:a:Restored"]`; "a disposed identity sleeps through a reload" inverts (woken at `ready`); REV9-EDGE's kept
  ending through a boot is woken at `ready` (add its try count). `round6.scenario.ts:879`, FRAG-24 and R10-BOOT-ORDER
  keep their explicit dispose. Every reload case changes: the harness re-attaches the suite's uses in first-ensure
  order, an unheld actor stays a record unless owed an ending, and a rebind needing a new incarnation advances 100 ms.
- **LIFE-01..10:** `release` → `detach`, `NotPersisted` → `NoRecord`; LIFE-08 inverts (mail does not restart the
  grace); LIFE-07 adds "a deadline due in the grace does not fire".
- **New:** LIFE-11–28 as v5 11.3 (chains, kept reads, waiting schedules, the grace, `ready`, `Hydrate`, `dehydrate`,
  the record at the end, an unencodable record, every send row, identity, the cliff, context, the local remount,
  Runtime-disposal parking; core inputs as v5 names them), plus **LIFE-29** `EndedWithWork` once per machine and kind,
  none for an end with nothing live, and **LIFE-30** a create within 5 s carries its age, at 5 s it does not.
- **Invariants** after every step: safety, liveness (free for the grace with no input means ended), same incarnation,
  no schedule fires on an ended or unused incarnation; evidence carries incarnation ids; the state hash carries uses
  by kind and owner and the armed grace's deadline, never a counter. Compile-side: `ScheduleLeadsToWrite` (compiler
  tests). Browser tests: passive effects under Strict Mode, re-suspension and Activity; `Hydrate` with a lazy
  segment; follower uses; the host's `forkScoped` order on a real Effect runtime.

### 7.2 Reference apps (`workflow/plans/flow/references/`)

1. **Four refs drop `retain`** (and take identity's value form): `dispatch-desk/features/Tickets/editor/editor.ref.ts`
   `actorRef(EditorMachine, ticket, { persist: true })`; `features/Roster/roster.ref.ts` `actorRef(RosterMachine, {
   workspaceId }, { persist: true })`; `features/Presence/presence.ref.ts` `actorRef(PresenceMachine, ticket)`;
   `features/Assistant/assistant.ref.ts` `actorRef(AssistantMachine, ticket, { persist: true })`. Their comments
   change: roster's "retained for a minute" becomes "the admin screen is its use; a merge on the wire keeps it";
   presence's "stays for 15 seconds" becomes "ends 100 ms after the panel; hold it in the ticket's layout for slow
   in-ticket navigation".
2. **`dispatch-desk/app/host.ts`, `runDeskHost`** (after identity's and absorb-wiring's edits; no `signal`):

```ts
export async function runDeskHost() {
  const runtime = DeskSetup.construct(); // inert: no storage, services, actors or work
  try {
    await runtime.runPromise(runtime.ready());
    await runtime.runPromise(Effect.scoped(Effect.gen(function* () {
      // Host code keeps an actor by subscribing (rule 73); an ensure alone keeps nothing past the grace.
      // Each subscription is taken in this step, before anything waits, and is a use until the scope closes.
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

   `signOut` is unchanged: its `ensureActor(SessionRef, { input: { userId } })` and `send` run in one step, and the session is persisted.
3. **`dispatch-desk/features/Attachments/upload.trait.ts`.** `Restored` now also means a return within the tab, where
   `PendingFiles` still holds the bytes, so a restored upload re-sends at once and the adapter's `FileGone` decides.
   After an unknown, that failure arrives as `StillUnknown { failure }` (rule 18), so the mapping carries its tag.
   `unknown:` may target only `Flow.uncertain` events (rule 13), hence two new ones:

```ts
// internalEvents: Lost is REMOVED; NEW (user-defined):
Resumed: Flow.uncertain({}),                                            // `Restored`: a new incarnation; re-send now
Refused: Flow.uncertain({ failure: Schema.String }),                    // a re-send after an unknown failed definitely
// operations.put.unknown (the other entries unchanged):
Restored: E.Resumed,                                                    // NEW MEANING of Restored here
StillUnknown: E.Refused.from((r) => ({ failure: r.failure._tag })),     // existing: .from; the failure behind the unknown
// schedules.resend.disarmOn: E.Lost → E.Refused, E.Resumed
// on: the Lost handler is REMOVED; ResendDue's two branches move to a const and serve both events:
const resendNow = [                                                      // user-defined
  { target: "self", guard: [O.put.retryable(own, { times: MAX_RESENDS })], updateMemory: () => ({ status: "sending" }), actions: [O.put.retry(own)] },
  { target: "self", updateMemory: () => ({ status: "failed", problem: "GaveUp" }), actions: [O.put.cancel(own)],
    notify: [callbacks.onFailed.from(({ memory }) => ({ ref: memory.ref, problem: "GaveUp" as const }))] },
];
ResendDue: resendNow,
Resumed: resendNow,
Refused: [
  { target: "self", guard: ({ event }) => event.failure === "FileGone" || deny("NotGone"),   // a reload took the bytes
    updateMemory: () => ({ status: "failed", problem: "FileGone" }), actions: [O.put.cancel],
    notify: [callbacks.onFailed.from(({ memory }) => ({ ref: memory.ref, problem: "FileGone" as const }))] },
  { target: "self", updateMemory: () => ({ status: "failed", problem: "GaveUp" }), actions: [O.put.cancel],
    notify: [callbacks.onFailed.from(({ memory }) => ({ ref: memory.ref, problem: "GaveUp" as const }))] },
],
```

   After a reload, the first re-send's `take` fails `FileGone` locally and the copy reports `FileGone` once; within the
   tab the bytes are re-sent. `upload.story.ts`'s `fileGone` keeps its checkpoint; `upload.test.ts` gains the
   return-within-tab case.
4. **The app shell** (4.8): `next/app/shell.tsx`, `next/app/desk/[workspace]/layout.tsx` and `workspace-shell.tsx` are
   new; `next/app/layout.tsx` wraps `children` in `DeskShell` inside `Hydrate`; `app/view.tsx`'s `Desk` holds the feed.
5. **Stories.** `features/Roster/roster.story.ts` `mergeOutlivesScreen` as 4.7. `features/Tickets/desk.story.ts:101`
   and `editor/editor.tabs.story.ts:48`: `.dispose(Editor42, { how: "now" })` becomes `.detach(Editor42)`; the save
   keeps the editor, the same incarnation hears `Saved` (checkpoint `unbound` becomes `kept`); "lands with no actor"
   is `reloadMidSave`'s job. `desk.story.ts:117`'s `{ how: "forget" }` stays; `editor.story.ts:152`'s machine-Story
   `.dispose()` is a rebind and stays.
6. **The editor's title save** carries `If-Match` as `body.trait.ts` does (the late autosave's precondition).
7. **Notes.** `dispatch-desk/REWRITE-PLAN.md` row 47 ("`retain`") and line 160 ("`retain` expires") and `REVIEW.md`
   row 10 (retain expiry as `dispose` then `advance`) are rewritten to rule 73; `references/design/multi-tab.md` as C127.

### 7.3 Not verified

- No code: the rule, the diagnostics, `ScheduleLeadsToWrite`'s fixed point and the driver's yield are unbuilt; the
  round-14x experiment covered an earlier rule.
- React's passive-effect behaviour under re-suspension and Activity is from React's documentation, not a browser test.
- `E.Refused.from` on an `unknown` tag, and `StillUnknown`'s `failure._tag`, were not type-checked; nor was the Next
  shell (a client component inside `Hydrate`, a client child of an async server layout).
- The title save's `If-Match` needs a version on the `Ticket` record; not written.
- `EndedWithWork`'s noise on actors whose sessions are their purpose (presence, the queue's list) is bounded by
  "once per machine and kind" but not measured.
- Restore cost, and multi-tab follower uses, are not measured.
