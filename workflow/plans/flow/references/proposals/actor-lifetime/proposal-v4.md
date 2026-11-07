# Actor lifetime, version 4: the blunt rule

Status: **ACCEPTED in principle; text for review**, 2026-11-07. The rule, fixes 1–12, decisions 13–15, improvements
1–4 and the limits are the user's (see [brief-blunt.md](brief-blunt.md)). Calls this draft makes beyond the brief are marked
**[P]**, to be read before the merge. Paths are from the repository root; MD =
`workflow/plans/flow/references/explorations/machine-fragments/machine-design.md`. Code marks: **NEW**, **NEW
MEANING**, **RENAMED**, **REMOVED**, existing, user-defined. Prior art: [proposal-v3.md](proposal-v3.md) (send table,
dehydrate, Stories, memory table, replacement-text structure), [proposal-v2.md](proposal-v2.md) and
[proposal.md](proposal.md), all kept.

## 0. The rule

**A shared actor lives while something uses it, plus until its writes already in flight have returned. Its schedules
belong to it and end with it.** Uses are attached consumers, `snapshots` subscriptions and bound context consumers;
the one exception is an `InFlight` write; nothing else counts; then, after the grace, it ends (section 1).

## 1. The rule in full (normative; becomes MD rule 73 and 2.7.17)

**L1. Scope.** Shared actors (`actorRef`). Local actors keep React O3 with the same grace (L4); Q2 asks about the
exception for them. Explicit `disposeActor`, `forget` and Runtime disposal are unchanged and ignore L2–L5.

**L2. Uses.** A use is:
- an ensuring hook, from its commit effect to its cleanup, including while its attach waits for readiness, lazy
  adoption, a `Hydrate` boundary or a disposing predecessor. Render registers nothing (React O2), so a discarded
  render cannot leak one;
- a live `snapshots` subscription, from host code or from Flow itself: `dehydrate`'s private Runtime subscribes, on
  dehydrate's behalf, to each shared actor at the moment it is installed (ensured, or restored as a provider), before
  control returns to `prepare`, so an `await` inside `prepare` cannot lose one; it unsubscribes after capture or on
  rejection (fix 4) **[P: "at install" is how "before any await" is met]**;
- a bound context consumer (a use of its provider);
- a Story's `ensure(ref)`, until its `detach(ref)` (section 2).

`ensureActor` alone, `getSnapshot`, a lookup (`useActorByRef(ref)` with no options), `useView` and sends are not uses.

**L3. Kept while writing.** While any write lane under the actor's identity is `InFlight` (waiting to be invoked or
on the wire; bound or unplaced, rule 53), the actor stays live. The ending is admitted as a turn of that same
incarnation, routed current or late from its owner (rule 14), so whatever that turn commits (Pay's `place` after the
confirm) is committed by the actor that sent the first write, and is itself `InFlight`. Events already in the mailbox
are processed: the end step queues behind them (a turn is atomic; queued events are finite). A live actor runs **all**
of its schedules and activities, whatever keeps it; they never keep it. A `Held` lane, with or without waiting
commits, does not keep it (it moves only in a turn; rule 44 hands it off).

**L4. The grace.** An actor is **free** when it has no use, no `InFlight` lane and no mail, and no turn is running. When
it becomes free, the core returns an effect arming the grace (100 ms on the Runtime Clock, React O3's, internal, the
same for local actors; fix 1) with the actor's free-generation; the driver in `src/host/` sleeps and delivers the
expiry as a Runtime step. A use or a new `InFlight` lane bumps the generation, so a stale expiry does nothing. A
turn during the grace (a schedule firing, a send) does not restart it unless it commits **[P]**. The core stays pure: it
never reads the clock. "One task" is not enough: an Effect `forkScoped` subscriber starts a tick later (v3 review H3).

**L5. The end step.** At expiry, if still free, one Runtime step:
1. for a persisted actor, encodes its record (state, memory, armed deadlines, restartOn baselines) into the Runtime's
   copy **in this step** (captures coalesce over 5 s and may not have run; fix 6). If the record cannot be encoded,
   the actor does **not** end: it stays live, the codec's diagnostic is published (Persistence O5), Inspection's
   `uses.busy` names it, and the end is tried again after its next publication (fix 7; **[P]** when);
2. moves its lanes to the Runtime unbound (rule 44), path-parked endings included (fix 12);
3. cancels its schedules, stops its activities and sessions (Runtime O6's cleanup), and records the end in
   Inspection with the reason "no uses".

While cleanup runs the actor is **ending**: sends follow section 4; an ensure waits for cleanup and binds the next
incarnation (Runtime O3).

**L6. Return.** A persisted identity whose record is in the Runtime's copy returns as a new incarnation, restored from
that copy (never re-read from storage), when an ensure, a `snapshots` subscription or a send reaches it. It receives,
in order: its starting turn; rule 44's deliveries (parked endings, each held head's `unknown { Restored }`); then, if a
provider's selection differs from the one the record was ended with, one `onContext` wave (decision 15; **[P]** its place in the order); then the
event that restored it, if a send. Each schedule follows Machines O5: a Duration keeps its deadline and fires once if
overdue, a multi-step Schedule restarts at step one. **`Restored` means "a new incarnation"**: a reload, or a return
after the actor ended within the Runtime (decision 14). An ensure over a record that no longer decodes discards it
with `RestoreDiscarded`, adopts the identity's lanes (rule 46) and creates from input. A non-persisted identity has
nothing to return to: an ensure creates fresh and adopts its lanes and their parked endings (fix 12).

**L7. Ready and hydration.** At `ready`, restored records stay records until something ensures, subscribes to or
sends to them; nothing starts live because it was restored (fix 3). A hydrated actor activates at its `Hydrate`
commit and, if free then, starts the grace (fix 3; Q1). Children's effects run before `Hydrate`'s, so a consumer in the
same commit is already a use.

**L8. Handles and reads.** A handle follows the identity, not the incarnation (fix 9). `getSnapshot` reads the live
incarnation; with none, a persisted identity's record from the Runtime's copy (decoded once per revision; lifecycle
`active`, since any ensure or send brings exactly that state back; **[P]**); with no record, the last incarnation's terminal
snapshot (lifecycle `disposed`). A pre-attach handle of a persisted identity reads the same copy, so a quick return
never flashes `initial` (fix 5). Subscribing is a use (L2) and restores as L6; on an identity with no record the
stream emits the terminal snapshot and completes, creating nothing **[P]**. Sends follow section 4. So reads and sends agree.

**L9. Visibility.** Inspection's `uses: { consumers, subscriptions, contexts, pendingEnsures, busy }` (decided names)
shows exactly why an actor is live: `consumers` are attached hooks, `pendingEnsures` hooks past their commit effect
and not yet attached, `subscriptions` each with its owner (host code, `dehydrate`, a follower), `contexts` bound
consumers, and `busy` the `InFlight` lanes by address (rule 65), the mailbox depth, and an unencodable record. A free
actor shows its grace in `inspection.work`. Every end and return is a trace record.

## 2. Public API changes

| Change | Kind | Status |
| --- | --- | --- |
| `retain` on `actorRef` | **REMOVED** | decided (OD27) |
| `SendTargetAbsent` reasons: `"NoRecord" \| "RecordUndecodable" \| "NotAdopted"` | `NoRecord` **replaces** `NotPersisted` | accepted |
| Stories `detach(ref)` ends a use | **RENAMED** from the decided `Story.release(ref)` | accepted (fix 10) |
| Stories `ensure(ref)` | **NEW MEANING**: attaches one use, as a mounted screen | accepted (fix 10) |
| Stories `dispose(ref)` | **NEW MEANING**: `disposeActor`; `{ how: "now" }` **REMOVED** (amends W27); `{ how: "forget" }` kept | accepted (fix 10) |
| Inspection `uses.busy` | decided field; content fixed in L9 | accepted (improvement 3) |
| `flow check` info `ScheduleLeadsToWrite` | a finding name, no user code | **[P]** name (improvement 1, section 7) |

Not added: a keep-alive option or hook, a schedule flag, a "let go" signal (improvement 4, `revisit.md`, section 12),
a Story step or address for the grace (a Story crosses it with an ordinary `advance`), a lifecycle value for "ended".
Q3 asks whether `detach` misuse needs its own reason word; the default reuses `ActorAbsent`.

## 3. Actor states: what each holds, what frees it

| State | Holds | Left by |
| --- | --- | --- |
| **Live, used** | the whole actor: state, memory, activations, deadlines, activities, sessions, mailbox | the last use ending |
| **Live, kept by writes** | the same; `uses.busy` lists the `InFlight` lanes and mail | the last ending's turn; then free |
| **Live, in grace** | the same plus one armed grace (generation) | a use or a commit (stays live), or the expiry (L5) |
| **Live, end blocked** | the same; `busy` names the unencodable record | an encodable publication, then L5 |
| **Ending** | terminal snapshot; activities stopping; sends queued for a persisted identity (section 4) | cleanup done; failure quarantines (Runtime O6) |
| **Ended, persisted** | the Runtime's copy of the record (deadlines, last context selection), the stored record, its lane records and parked endings | ensure, subscription or send (L6); `disposeActor` (record removed, lanes kept unbound, rule 46); `forget`; the records cliff (decision 13); Runtime disposal |
| **Ended, non-persisted** | nothing of the actor; its non-`Idle` lanes, unbound, with path-parked endings (fix 12) | lanes resolve, a new incarnation adopts them, or Runtime disposal |
| **Record at ready, not ensured** | as ended, persisted | as ended, persisted |
| **Hydrated, activated, unused** | live, in grace | as live, in grace (Q1) |
| **Quarantined** | the ref's failure and Cause | Runtime disposal |

Freed per ended actor: everything but the record copy (inside Persistence O3's 4,096 records and 16 MiB, dormant
records included) and its unresolved lanes (each a real write, listed by `unsettledWrites()`). A pre-attach handle's
decoded record lives on the handle and goes with the component.

## 4. Sends (action `send(ref, e)` and handle `send(e)` alike; fix 8)

| Target at the send | Result |
| --- | --- |
| live, or kept by writes, or in grace | delivered (Runtime O4); a send is not a use, so the grace keeps running |
| ending, persisted | queued for its next incarnation, which is restored after cleanup and receives it after L6's deliveries; an explicit `disposeActor` or `forget` during that cleanup drops the queue with `NoRecord` |
| ending, non-persisted | dropped, `SendTargetAbsent { reason: "NoRecord" }` **[P]** (nothing to queue for) |
| ended, persisted, record decodes | restored (L6); delivered after its parked endings, `unknown { Restored }` and `onContext`; the restored actor is free unless the event commits, so it ends after the grace |
| ended, record does not decode | dropped, `RecordUndecodable`; the record stays for an ensure to discard |
| no record (non-persisted, never created, disposed, forgotten) | dropped, `NoRecord` |
| lazy entry not adopted | dropped, `NotAdopted` |
| explicitly disposing (live `disposeActor`) | as Runtime O4: dropped, `NoRecord` |

**A send never creates.** The reason is not "it has no input": a value-named ref (OD30) carries its input. It is that
creating is an ensure's decision: a send must not resurrect a disposed or forgotten identity, start a singleton without
its input, or adopt a lazy entry. **Restoring is not creating**: the record already holds state and memory. LazyFeatures
O2's "never adopts or creates its target" becomes "never adopts a lazy entry or creates an actor; it may restore one
from its record". Reasons are reported on the sender and never roll back its turn.

## 5. The cases

### 5.1 The editor's autosave (persisted, per ticket)

```ts
// BEFORE: dispatch-desk/features/Tickets/editor/editor.ref.ts
export const editorRef = (ticket: TicketKey) =>     // user-defined: editorRef, TicketKey
  actorRef(EditorMachine, ticket, {                 // existing: actorRef (value-named, OD30); user-defined: EditorMachine
    persist: true,                                  // existing
    retain: "10 minutes",                           // REMOVED: retain (OD27)
  });

// AFTER
export const editorRef = (ticket: TicketKey) =>
  actorRef(EditorMachine, ticket, { persist: true }); // existing
```

Added: nothing. Dropped: `retain`. The user types and closes the panel 1 s later, inside `autosave`'s 2 s debounce.
No use, nothing in flight: 100 ms later the editor ends, its record holding the draft and the armed deadline. Reopened
the next day, it is restored and the overdue `autosave` fires once: the save is **late, not lost** (stated limit). If a
save was on the wire at the close, the editor stays until `Saved` lands, sends `toastSaved` from the same incarnation,
then ends. If the save comes back unknown, `UNSURE` arms `resend` (a schedule: it does not keep the editor), the lane is
`Held`, the editor ends; on return the held save comes back as `unknown { Restored }` and the resend runs. `LOCKED`'s
backoff ends with the editor and restarts on return. `flow check` reports each of these schedules as
`ScheduleLeadsToWrite` ("delayed until the next open"), and the recipe in section 6 commits the draft on Close.

### 5.2 Checkout in 3-D Secure, and the chained confirm (persisted singleton)

```ts
// BEFORE and AFTER, unchanged: checkout/features/Pay/pay.ref.ts and Pay.tsx
export const payRef = actorRef(PayMachine, "checkout", { persist: true });  // existing; user-defined: payRef, PayMachine
const checkout = useActorByRef(payRef, {});                                 // existing: the mounted page is a use
<button onClick={() => checkout.send(E.Leave())}>Back to shop</button>      // existing; user-defined: E.Leave
```

Added: nothing. Dropped: nothing (`payRef` never had `retain`, so before this it lived forever). The shopper presses
the browser's back button (no `Leave`) while the confirm is on the wire. The lane is `InFlight`: Pay stays. `Confirmed`
lands in the same incarnation, `PLACING` commits `place`, which is `InFlight` too; `Placed` lands; Pay is free and ends
100 ms later. **No customer is charged without an order.** Without the exception, `Confirmed` would park, and `place`
would wait for the shopper's next visit. If the confirm comes back unknown, `UNSURE`'s `check` (a lookup schedule)
does not keep Pay: it ends with the hold in the Runtime, and nobody polls Stripe for an absent page; on return or reload
`unknown { Restored }` re-enters `UNSURE` and the reconcile resumes. **Found limit (B3):** if `Confirmed` says
`requires_action`, Pay commits `authenticate` with nobody on the page; section 10.

### 5.3 Presence (not persisted)

```ts
// BEFORE: dispatch-desk/features/Presence/presence.ref.ts
export const presenceRef = (ticket: TicketKey) =>   // user-defined: presenceRef, TicketKey
  actorRef(PresenceMachine, ticket, { retain: "15 seconds" }); // existing: actorRef; REMOVED: retain
// AFTER
export const presenceRef = (ticket: TicketKey) => actorRef(PresenceMachine, ticket);
```

Added: nothing. Dropped: `retain`. The panel closes: 100 ms later (or after a `ping` on the wire returns) presence
ends and its two sessions close, so other users stop seeing a viewer who left (the 15 s lie is gone). Two screens of
one ticket swapped in one commit keep it; a loading gap longer than 100 ms leaves and rejoins (stated limit: lift the
hook into the ticket's layout).

### 5.4 The queue on a server page

```tsx
// BEFORE and AFTER, unchanged: dispatch-desk/next/app/desk/[workspace]/page.tsx
const payload = await dehydrate(                                     // existing
  deskServerSetup(user),                                             // user-defined
  (runtime) => {
    runtime.ensureActor(SessionRef, { input: { userId: user.id } }); // existing: a singleton
    runtime.ensureActor(queueRef({ workspaceId }));                  // existing: value-named (OD30)
  },
  { within: "1500 millis" },                                         // existing: dehydrate's bound, not a lifetime
);
```

Added: nothing. Dropped: nothing. Each `ensureActor` on dehydrate's Runtime installs the actor and dehydrate's
subscription in the same call (L2), so the queue's chained lookups finish under ServerRendering O2 and nothing ends
mid-load; Inspection names the subscription's owner as `dehydrate`. On the client, `<Hydrate>` activates the queue in
its commit; `QueueClient`'s hook in the same commit is already a use (L7). When the user leaves the desk, the 30 s poll
does not keep the queue: it ends. **Found limit (B1)**, Q1: a consumer that hydrates in a later Suspense segment.

### 5.5 A toast

```ts
// BEFORE and AFTER, unchanged: features/Toasts/toasts.ref.ts, ToastStack.tsx, editor.machine.ts
export const ToastsRef = actorRef(ToastsMachine, "toasts");  // existing; user-defined: ToastsRef, ToastsMachine
const toasts = useActorByRef(ToastsRef, {});                 // existing: the stack is always mounted, a use
const toastSaved = send(ToastsRef, Toasts.E.Push.from(/* … */)); // existing: send; user-defined: toastSaved, Push
```

Added: nothing. Dropped: nothing. `SHOWING.expire` is the toasts actor's own; it ends with it. The editor's
`toastSaved` runs in the turn of `Saved`, which the editor is kept alive to receive (5.1), so the toast appears even
after the panel closed. With no stack mounted, the toasts actor ends and the send drops `NoRecord` on the sender.

### 5.6 A local actor (React O3)

```tsx
const draft = useActor(DraftMachine, { input });  // existing: one local actor per component incarnation; user-defined: DraftMachine
// unmount → 100 ms (the shared grace, fix 1) → disposed, whatever is armed or on the wire (React O3, kept)
```

Added: nothing. Dropped: nothing. A local actor cannot be sent to or persisted. Its lanes stay with the Runtime and a
remount with equal (machine, input) adopts them (2.7.13), so a held save comes back as `unknown { Restored }`. But an
ending that would have committed a chained step reaches no incarnation: **found limit (B2)**, Q2.

### 5.7 A Story

```ts
// BEFORE: dispatch-desk/features/Roster/roster.story.ts, mergeOutlivesScreen
  .ensure(North, { input: { workspaceId: "north" } })  // existing
  .send(North, E.MERGING.Pick({ survivorId: "acme" }), E.MERGING.Confirm())
  .dispose(North)                                      // existing: record-keeping dispose of a writing actor
  .advance("2 minutes")                                // the retain expires
  .checkpoint("leftMidMerge")
  .world(Desk.mergeCustomers.release())                // existing: the fake's wire release
  .ensure(North, { input: { workspaceId: "north" } })
  .checkpoint("mergeAdopted");

// AFTER
  .ensure(North)                                       // NEW MEANING: attaches one use, as the admin screen (OD30: no input)
  .send(North, E.MERGING.Pick({ survivorId: "acme" }), E.MERGING.Confirm())
  .detach(North)                                       // RENAMED (from Story.release): the screen unmounts
  .advance("1 second")                                 // existing: past the grace; North stays, the merge is InFlight
  .checkpoint("leftMidMerge")                          // user-defined; uses.busy: [{ operation: "mergeCustomers" }]
  .world(Desk.mergeCustomers.release())                // existing, no collision with detach: the live North sets its notice
  .advance("1 second")                                 // existing: now free, North ends; its record holds the notice
  .checkpoint("mergeDone")                             // user-defined
  .ensure(North)                                       // NEW MEANING: a use again; North is restored from the record
  .checkpoint("mergeShown");                           // user-defined

// "the answer lands with no actor" is a reload, as in production:
  .detach(North)                                       // RENAMED
  .reload()                                            // existing: the tab dies with the merge on the wire
  .world(Desk.mergeCustomers.release())                // existing: the server applies it; the new tab sees unknown { Restored }
```

Added: `detach`. Dropped: the record-keeping `dispose`, `{ how: "now" }`. The old Story ended a writing actor and kept
its record, which production cannot do.

### 5.8 Other cases

| Case | What happens |
| --- | --- |
| Multi-tab | Persistence O7 today: a second tab runs without persistence, uses are per Runtime. `multi-tab.md` (proposal): a follower's attached mirror is a use in the leader, ended by its detach or its presence lock's grant; a new leader restores as L7 and waits for no one; follower uses need browser tests (stated limit) |
| A long upload | `put` is `InFlight`: the editor stays, its activities running, for the whole upload; a remove releases the lane (rule 60) |
| A never-resolving unknown | `Held`: does not keep the actor; it ends; the hold is in the Runtime, `unknown { Restored }` on return |
| A write that never settles | keeps the actor; the machine's own timeout schedule runs because the actor is live (rule 25); without one, a leak shown in `uses.busy` (section 8) |
| A reload mid-write | write-ahead (Persistence O6); at `ready` the record stays a record (L7); the next ensure gets `NotSent { Restored }` or `unknown { Restored }` |
| React Strict Mode | cleanup and setup in one commit, inside the grace |
| Suspense fallback, Activity hiding | uses end; after 100 ms a persisted actor ends and restores on reveal, a non-persisted one starts fresh (stated limit) |
| Headless host | `host.ts`'s bare `ensureActor` keeps nothing; an ensure, an `await` past 100 ms, then a send to a non-persisted actor drops `NoRecord`; a host keeps an actor with `snapshots` (decided) |

## 6. Recipe: commit the draft on the way out (improvement 2)

```ts
// EditorMachine, EDITING: Close commits a dirty draft, then leaves
Close: [
  { target: S.CLOSED, guard: [dirty, O.save.idle(ticketKey)], actions: [commitDraft] }, // existing: target, guard, idle; user-defined: dirty, ticketKey, commitDraft
  { target: S.CLOSED },                                                                 // existing
],
// The panel's close control sends it from the navigation itself:
<button onClick={() => editor.send(E.Close())}>Close</button>                          // existing: send; user-defined: E.Close
```

Added: nothing. Dropped: nothing. The commit is `InFlight`, so the editor stays until the ending returns (L3), and
the ending is handled where the machine handles late endings (rule 14). **Send it from the navigation (a close
button, a router's leave hook), never from an effect cleanup**: Strict Mode runs cleanups during development, and a
cleanup also runs on Suspense and Activity hiding, so `Close` would close a screen that is still shown (B6).

## 7. `flow check`: `ScheduleLeadsToWrite` (improvement 1) [P: the name]

Info, never a lifetime input. For each schedule, the compiler follows its `send` event's turn (handlers anywhere in
the machine, their raises, exits, entries and the host transitions they reach, rule 7) to a fixed point over every
arming path: entry, `armOn`, `restartOn`, keyed `keys`, `.each` copies and subroutine entry. If that turn can run a
write member (`commit`, `retry` or `cancel` of a transaction or domain write), the schedule is reported with the path,
and the message depends on the refs the app declares for the machine: no persisted ref, or used as a local actor: "lost
if the screen unmounts first"; persisted: "delayed until the next open: it fires once, late, against what the server
holds then". In the apps: the editor's `settle`, `autosave`, `resend` and `LOCKED.retry`, the body's settle and retry,
the upload's start and retry, Pay's `retry`. `flow explain` prints the same path per schedule.

## 8. Leaks considered

| Candidate | Outcome |
| --- | --- |
| Polls, re-arming schedules, stream reconnects, activities | end with the actor |
| `Held` lanes, never-resolving unknowns | the Runtime's lane, one per (identity, contract, key), listed by `unsettledWrites()`; no actor kept |
| A write whose adapter never settles, and no machine timeout | keeps the actor until Runtime disposal (Runtime O6); `uses.busy` names the lane. The app's bug, visible |
| A chain of immediate retries in ending turns | bounded by the machine's own budget (`retryable`), as on a live screen |
| A record that never encodes | the actor stays live (fix 7) with a diagnostic and `busy` reason; a leak only while the bug lasts |
| Records of ended persisted actors | Persistence O3's bounds; decision 13 drops the oldest clean ones |
| Unbound lanes of ended non-persisted actors | each a real unresolved write; as today |
| A `snapshots` subscription never unsubscribed | the caller's leak; Inspection names its owner |
| `dehydrate`'s subscriptions | released at capture, rejection or cleanup |
| Queued sends for an ending persisted actor | bounded by the 1,024 mailbox; dropped `NoRecord` by an explicit dispose |
| Grace timers | at most one per actor, generation-checked |
| Pending ensures from discarded renders | impossible: counted only from a commit effect |

## 9. Replacement text for MD

Thirteen entries, E1–E13. Each quotes the current text exactly (line breaks as in the file) and gives the replacement.
Merge order: after absorb-wiring (OD29) and identity (OD30). If identity merges first, its I13–I15 edits to 2.7.17 are
absorbed by E5 (the examples use value refs and the identity line is included), and its rule 74 anchor
("Local actors keep React O3. `retain` does not exist.") survives E3 unchanged.

**E1. Header revision.** Current:

```text
**Revision (actor lifetime, 2026-11-07).** `retain` is removed: a shared actor lives while it is used, and work in
progress is a use (rule 73, 2.7.17; decided, OD27). Proposal and evidence:
[../../proposals/actor-lifetime/proposal.md](../../proposals/actor-lifetime/proposal.md).
```

New:

```text
**Revision (actor lifetime, 2026-11-07).** `retain` is removed: a shared actor lives while something uses it, plus
until its writes already in flight have returned; its schedules belong to it and end with it (rule 73, 2.7.17;
decided, OD27, OD31). Proposal and evidence:
[../../proposals/actor-lifetime/proposal-v4.md](../../proposals/actor-lifetime/proposal-v4.md); earlier versions
beside it are prior art.
```

**E2. Rule 44, last sentence.** Current:

```text
    **unplaced** and parks its endings (rule 53). Implicit disposal never happens while a lane of the actor is
    `InFlight` or has waiting commits (rule 73); a `Held` lane is handed off by this rule.
```

New:

```text
    **unplaced** and parks its endings (rule 53). An actor never ends implicitly while a lane of the actor is
    `InFlight` (rule 73), so a sent write's ending reaches the incarnation that sent it; a `Held` lane, with or
    without waiting commits, is handed off by this rule. When a shared actor ends, endings parked for a path stay
    on the lane record, persisted or not, and the next incarnation that adopts the lane receives them.
```

**E3. Rule 73, in full.** Current:

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
73. **A shared actor lives while something uses it, plus until its writes in flight have returned** (decided, OD27,
    OD31; 2.7.17). A use is an attached consumer (counted from its commit effect, never from render), a live
    `snapshots` subscription (host code, or `dehydrate`'s during prepare), or a bound context consumer. The one
    exception: a write lane of the actor that is `InFlight` keeps it until the ending's turn has run, so a chained
    step is committed by the same incarnation; mail already queued is processed. Nothing else keeps it: not
    schedules, lookups, activities, stream sessions, `Held` lanes, parked endings or context. Free of all of these
    for the grace (100 ms on the Runtime Clock, internal), it ends. A persisted actor's record is encoded in the
    step that ends it, with its armed deadlines, which fire once if overdue when it returns; an ensure, a
    subscription or a send restores it. A non-persisted actor is gone; its lanes stay with the Runtime (rule 44).
    Its schedules belong to it and end with it. The grace is React O3's, shared by local actors.
    Local actors keep React O3. `retain` does not exist.
```

**E4. 2.7.13, the R9 H1 walk.** Current:

```text
(R7 H2), plus a rebind into a leaf with no handler (R8 H3), "Runtime disposal with an Attempt on the wire, reload, the write succeeds, ensure: the restored state
receives the ending" (R9 H1; retain expiry no longer exists, rule 73), "an adopted Attempt ends unknown in a leaf other than the
```

New:

```text
(R7 H2), plus a rebind into a leaf with no handler (R8 H3), "`reload` with an Attempt on the wire, the server applies it, ensure: the
restored state receives `unknown { Restored }`" (R9 H1; its Runtime-disposal form, where the ending parks, joins R9 H2 in the policy
suite; an implicit end never meets an `InFlight` lane, rule 73), "an adopted Attempt ends unknown in a leaf other than the
```

**E5. 2.7.17, the whole section.** Current: from the heading `#### 2.7.17 Actor lifetime: alive while used` through
the paragraph ending ``(rule 53), adoption by identity, `unknown { Restored }` and `runtime.unsettledWrites()`.``
(the line before `#### 2.7.18`). New: the heading `#### 2.7.17 Actor lifetime: alive while used, and until its writes
return`, then this paragraph, then this proposal's sections 1 (L1–L9), 3 (the table and its paragraph), 4 (the table
and its two paragraphs) and 7, verbatim, then the after-blocks of 5.1 and 5.3 and section 6's recipe:

```text
Rule 73 is normative (decided, OD27, OD31). It replaces Runtime O3's `retain`, a guessed duration per ref that
expired an actor whatever it was doing. It is the rule a React developer already expects (a component's state lives
while it is mounted), with one exception that prevents a dangerous bug: a write already on the wire keeps its actor
until its ending's turn has run, so a chained step (Pay's confirm, then `place`) is never left for the next visit.
Leaving is sometimes how a user cancels, so nothing else outlives the last use: schedules, lookups and sessions end
with the actor. Prior art: XState ties an actor to its owner (`useActorRef`'s effect cleanup); TanStack Query removes
a query only with no observers and an idle fetch (`query.ts:226-227`), and a mutation outlives its observers
(`mutation.ts:155-162`), as lanes already do (OD19). Uses count per actor identity (rule 74).
```

**E6–E9, E11, E12: exact substring swaps** (each `Current` occurs once in MD; a long line is one line in the file).

```text
E6  2.7.18 bullet. Current: - **Rule 73.** An ignored unknown leaves no `InFlight` lane, so it is not a use.
    New:                    - **Rule 73.** An ignored unknown leaves no `InFlight` lane, so it does not keep the actor.
E7  2.10.1 Story.app row. Current: | `ensure(ref)`, `dispose(ref, { how? })`, `send(target, …events)`,
    New:                           | `ensure(ref)`, `detach(ref)`, `dispose(ref, { how? })`, `send(target, …events)`,
E8  2.10.1 data forms. Current: | `ensure`, `dispose` | `{ ensure: [ref?, options?] }`, `{ dispose: [ref?, options?] }` |
    New: | `ensure`, `detach`, `dispose` | `{ ensure: [ref?, options?] }`, `{ detach: ref }`, `{ dispose: [ref?, options?] }` |
E9  2.10.2 steps. Current: | `ensure`, `dispose`, `openTab`, `closeTab`, `reload`, `enter`, `leave`, `reset`, `setContext` | the lifecycle command, as a host would issue it | settle |
    New: | `ensure`, `detach`, `dispose`, `openTab`, `closeTab`, `reload`, `enter`, `leave`, `reset`, `setContext` | the lifecycle command, as a host would issue it; `ensure` and `detach` as a screen mounting and unmounting (rule 73) | settle |
E11 2.10.15 (spans a line break after "(rule"). Current: (rule 73: no-use disposal never⏎meets a busy lane).
    New: (rule 73: an implicit end never⏎meets an `InFlight` lane).
E12 2.10 counts row. Current: | **43** new, 13 reused | Subjects, 2: `Story.app`, `Story.fragment`. Steps and options, 12: `together`, `dispose`, `how`,
    New:                      | **44** new, 13 reused | Subjects, 2: `Story.app`, `Story.fragment`. Steps and options, 13: `together`, `dispose`, `detach`, `how`,
    Section 4 "New, Stories" row. Current: `Fake.Closed`, `dispose` (`how`), `reload`
    New:                                   `Fake.Closed`, `dispose` (`how`), `detach`, `reload`
```

(⏎ is the file's line break: E11's `Current` ends one line of 2.10.15 and starts the next.)

**E10. 2.10.10.** Current:

```text
never persisted (brief C14), so `closeTab` and `reload` there are type errors. Rebind is `dispose()` then `ensure()`; no-use
disposal (rule 73) is `Story.release(ref)` then `advance` past the grace, and leaves a busy actor live; `dispose(ref, { how: "now" })` is `disposeActor` and
`{ how: "forget" }` is `forget` (STR9, STF43). Upgrades start from `storage: Fake.storage.from(oldStory)` (STR41).
```

New:

```text
never persisted (brief C14), so `closeTab` and `reload` there are type errors; its `dispose()` then `ensure()` is a rebind.
In an app Story, `ensure(ref)` attaches one use, as a mounted screen does, and `detach(ref)` ends one (with none held
by this Story it is `StoryInvalidCommand`); an `advance` past the grace then ends an actor that has no use and no
`InFlight` lane, and one kept by a write stays until its ending's turn has run (rule 73). `dispose(ref)` is
`disposeActor` and `{ how: "forget" }` is `forget` (STR9, STF43); no Story step ends an actor and keeps its record
while it writes. `openTab({ from })` and `reload` re-attach the uses this Story held in that tab's latest life, in
first-ensure order. Upgrades start from `storage: Fake.storage.from(oldStory)` (STR41).
```

**E13. Decision log and plan rows.** Append after OD30 (after OD28 if identity has not merged):

```text
- **OD31** The user, 2026-11-07, in the Claude Code session: actor lifetime, version 4 (the blunt rule;
  ../../proposals/actor-lifetime/proposal-v4.md). A shared actor lives while something uses it, plus until its
  writes in flight have returned; its schedules end with it. Uses are counted from commit effects; the grace is
  100 ms on the Runtime Clock for shared and local actors; restored records stay records until ensured; dehydrate
  subscribes at install; the record is encoded at the end, which waits while it cannot be; sends restore, queue for
  an ending persisted target or drop with `NoRecord` (replacing `NotPersisted`), `RecordUndecodable` or
  `NotAdopted`; a handle follows the identity; Stories' `detach(ref)` (renaming OD27 Q4's `release`), `ensure` as a
  use, `dispose` as `disposeActor` (amends W27: `{ how: "now" }` removed). Decisions 13 (records cliff), 14
  (`Restored` is a new incarnation), 15 (one `onContext` on restore). Amends OD27's use list and grace. (2026-11-07)
```

Plan rows: replace C104–C111 in place (same ids) and add C123–C127 after C122.

| ID | Plan | Change | Replaces or amends |
| --- | --- | --- | --- |
| C104 | Runtime O3 | Rule 73 (OD31): uses, the `InFlight` exception, the 100 ms grace, the end step, return; `actorRef` has no `retain`; `ConflictingActorRef` covers `persist` and `context`; the Reference line names editor.ref.ts without `retain` | "With retain (a Duration) … last use ended", "A provider with bound consumers never expires", "Without retain … Runtime disposal", "Retain expiry of a persisted actor …" |
| C105 | Runtime O4, LazyFeatures O2, React O3 | Section 4's send table for action and handle sends; reasons `NoRecord`, `RecordUndecodable`, `NotAdopted`; a send never creates and may restore | "Sends to a disposing or disposed actor are dropped", "If the target is absent or disposing the event is dropped", "never adopts or creates its target", "Sends through a handle whose actor is disposed are dropped as SendTargetAbsent" |
| C106 | Persistence O3, O4 | O3: the record of an actor that ended unused is encoded in the end step and kept; decision 13: over the bounds, drop the oldest ended actors whose record equals what is saved and whose identity has no non-`Idle` lane or parked ending **[P: the lane condition]**, with evidence, never a live actor or an unsaved delta. O4: restored records stay records until ensured, subscribed or sent to | "a persisted actor whose retain expired keeps its saved record", "Exceeding either bound rejects the whole capture without eviction", "Restored stable actors are active without another ensure", "Their retain clock starts at ready" |
| C107 | ServerRendering O1, O2, O5 | dehydrate subscribes to each shared actor at install, until capture or rejection; a hydrated actor starts the grace at activation (Q1) | "Shared actor retention starts at activation" |
| C108 | React O2, O3, V4 | Uses from commit effects; a pre-attach handle of a persisted identity reads the Runtime's copy; local actors keep the 100 ms grace; across hiding, persist or hold a use outside the hidden subtree | "Shared ensuring hooks count as uses until cleanup; retention follows @plan.Runtime.O3", "Shared refs with retain are the way to keep state across hiding", V4 "retention" |
| C109 | Runtime V4 | An unused actor ends after the grace; Strict Mode keeps it; an `InFlight` lane keeps it and its chained step runs in the same incarnation; schedules do not keep it | "retain expiry on the TestClock" |
| C110 | Testing O7 | `detach(ref)`; `ensure` attaches a use; `dispose` is `disposeActor`, `{ how: "forget" }` is `forget`; `openTab({ from })` and `reload` re-attach the Story's uses | replaces C110's `Story.release(ref)` |
| C111 | Inspection | `uses: { consumers, subscriptions, contexts, pendingEnsures, busy }` as L9; ends and returns as trace records | amends C111 |
| C123 | Machines O5 | "On restore or resume" includes a return within the Runtime after rule 73's end | amends |
| C124 | Diagnostics, CommandLine | `ScheduleLeadsToWrite` (info) and its `flow explain` path, section 7 | adds |
| C125 | Operations O3 | `unknown { Restored }` means a new incarnation: a reload or a return after an end (decision 14) | amends |
| C126 | `multi-tab.md` 4, 5.3, V-MT2 | "It releases that follower's attachments (retain)" → "its uses"; "`retain` counts attachments in every tab" → "a follower's attachments are uses in the leader"; "retain across tabs" → "uses across tabs"; a new leader waits for no one | replaces |
| C127 | References | drop `retain` in editor.ref.ts, roster.ref.ts, presence.ref.ts, assistant.ref.ts; `app/host.ts` keeps the editor by its `snapshots` subscription and says its bare ensures keep nothing; roster.story.ts and desk.story.ts as 5.7; upload.trait.ts maps `Restored` to a `retry`, letting the adapter's `FileGone` say whether the bytes are gone (decision 14); REWRITE-PLAN.md row 47 and line 160, REVIEW.md row 10 | replaces |

## 10. User-land bugs found that the brief does not state

- **B1. A hydrated actor ends before a later-hydrating consumer attaches.** React hydrates Suspense segments
  independently; a consumer under a boundary whose code chunk arrives later than 100 ms after `<Hydrate>`'s commit
  attaches after the actor ended. Non-persisted: its transferred state is gone, the hook creates fresh, the lookups
  run again, and the screen flashes from the server view to `Pending`. Q1.
- **B2. A local actor loses a chained step.** The exception covers shared actors only. A payment machine used with
  `useActor` is disposed 100 ms after unmount with the confirm on the wire; `Confirmed` reaches no incarnation and
  `place` never runs: the exact bug the exception exists for. Q2.
- **B3. A chained step that needs the user runs without them.** Pay commits `authenticate` on `requires_action` while
  kept by the confirm; Stripe.js mounts its challenge as a modal on the page body, so it can open over the shop page
  the shopper went back to. An OAuth popup or a file picker would do the same. Remedy (no API): send `Leave` from the
  navigation (section 6), or an adapter that fails when its frame is not mounted. Was also true before (Pay lived
  forever).
- **B4. A late write can overwrite newer server data.** "Late, not lost" means a persisted autosave fires at the next
  open, possibly days later, before the screen's fresh read lands. Without a version or precondition on the
  operation, it overwrites a colleague's edit. `ScheduleLeadsToWrite`'s message says so.
- **B5. A non-persisted debounce sometimes saves.** If another write happens to be in flight at the close and lasts
  longer than the debounce, the actor is still live and the schedule fires; otherwise it is lost. The outcome depends
  on timing, which users and testers will see as flakiness.
- **B6. The Close recipe misfires from an effect cleanup** (Strict Mode, Suspense, Activity). Section 6 says where to
  send it.
- **B7. `Restored` handlers run on every return, not once per reload.** A notice or toast in an `unknown { Restored }`
  handler repeats on each navigation back; side effects there must be idempotent (budgets already live on the lane).
- **B8. A chained step parked across a reload waits for the next open.** Persistence O4 used to start restored actors
  at `ready`; now Pay's parked `Confirmed` runs `place` only when the checkout page is next opened. `unsettledWrites()`
  still lists the lane.
- **B9. The records cliff can drop an unsent draft.** A draft saved to storage but never sent equals what is saved,
  so decision 13 may drop it after 4,096 records or 16 MiB. The lane condition in C106 protects pending writes only.
- **B10. The brief's reason "a send has no input" is false for value-named refs (OD30).** The rule stands; section 4
  gives the real reason.
- **B11. A lookup-only hook flips to `null`** 100 ms after the last ensuring screen unmounts, even for a restorable
  persisted identity (React O2: "missing or disposed means null"). A view that uses lookup to show "still open" must
  ensure instead.

## 11. Suite changes

**The 22 record-keeping-dispose cases** (27 `dispose(` steps in
`packages/flow-state-v3/prototypes/conformance/scenarios/{frag,round5,round7,round8,round9,round9b,stream}.scenario.ts`),
each rewritten by what it asserts, expected results derived from this text (test the spec):

| The case asserts | Becomes |
| --- | --- |
| the answer lands with no actor and is parked for the record | `reload` mid-write (persisted), or `dispose` (`disposeActor`) when it asserts evidence |
| a rebind adopts a held lane | `detach`, `advance` past the grace (a hold does not keep it), `ensure` |
| the screen leaves mid-write | `detach`; the actor stays, the ending reaches the same incarnation, then it ends |
| an explicit end | `dispose` |

**The harness.** `conformance/harness.ts`'s step union gains `{ detach: ActorRef }`; `{ ensure }` attaches a use;
`{ dispose }` is `disposeActor`. `conformance/drive.ts` tracks uses per actor; at a reload it re-ensures each ref ensured
and not detached or disposed in the closed life, as Stories' `reload` does. The faked re-attach of use counts goes. A
mechanical check: no implicit end while a use is held or a lane is `InFlight`.

**New cases** (each red on at least one wrong runtime):

| Case | Pins |
| --- | --- |
| in-flight exception | detach mid-confirm: `Confirmed` in the same incarnation, `place` committed, end after `Placed` |
| in-flight, unplaced | a lane whose copy was removed keeps the actor; its path-parked ending survives the end (fix 12) |
| schedules do not count | detach inside the debounce: ends after the grace; persisted record keeps the deadline, fires once on ensure; non-persisted lost |
| the grace | detach and ensure in one step (Strict Mode) keep the actor; at 99 ms kept, at 100 ms ended; a stale expiry after a re-use does nothing |
| `Held` does not count | an unknown, detach: ends; `unknown { Restored }` on return, once per incarnation |
| restore at ready | restored records do not start; first ensure starts one, overdue deadline fires once |
| hydration | grace from activation; a consumer in the same commit keeps it |
| dehydrate | `prepare` that awaits 200 ms between ensures loses nothing; subscription released at capture |
| record at the end | ended before its first capture: the next ensure reads the copy; pre-attach handle shows it (no `initial`) |
| unencodable record | the end waits; `busy` names it; ends after an encodable publication |
| every send row | section 4: live, in grace, ending persisted (queued; dropped by explicit dispose), ending non-persisted, ended decodes, undecodable, no record (four causes), not adopted |
| handle follows identity | after an end: `getSnapshot` shows the record, `send` restores, both agree; non-persisted: terminal snapshot and `NoRecord` |
| records cliff | over 4,096: the oldest clean ended records drop with evidence; live, unsaved and lane-holding ones never |
| context on restore | provider changed while away: one `onContext` after rule 44's deliveries; unchanged: none; reload: silent |
| `ScheduleLeadsToWrite` | every arming path (entry, `armOn`, `restartOn`, keyed, `.each`, subroutine), against `flow explain` |

## 12. `revisit.md` entry (improvement 4)

```text
- Actor lifetime: a "you are being let go" signal to the actor, the real fix for a debounced save on a route change
  (a machine could flush on it). New API; deferred by the user on 2026-11-07 (OD31, proposal-v4 section 12).
```

## 13. Issue by issue

| Issue | Answer |
| --- | --- |
| **brief-runtime-owned.md** | |
| The default flips | a shared actor lived forever without `retain`; now it ends after its last use (L4). Keep one by using it: a hook in a layout, a host `snapshots` subscription; persist it to keep memory |
| "After the React commit" undefined | not used: the grace is a Runtime Clock wait for every host (L4) |
| Restored and hydrated actors have no uses | records stay records until ensured; hydrated actors start the grace at activation (L7; Q1) |
| Pending ensure vs React O2 | counted from the commit effect only (L2) |
| Strict Mode, route changes, the 100 ms guess | 100 ms is React O3's, internal; Strict Mode and one-commit swaps are inside it |
| Gaps longer than the grace | stated limit (section 14) |
| Restore cost | one decode per return, unmeasured (limit) |
| Activities, streams, `Held`, every schedule | none counts (L3) |
| Never-resolving unknown; endless re-arming schedule | `Held` does not count; schedules end with the actor (section 8) |
| Debounce, autosave, re-sends, backoff | end with the actor; persisted fire late, non-persisted lost (limit; section 7) |
| Chained steps | the in-flight exception (5.2) |
| Reactions while away | in the ending's turn while kept; otherwise on return, or never (limit) |
| Finite lookups on a server page; `dehydrate` loses actors | dehydrate's subscription at install (L2, 5.4) |
| Send to an absent target; disposing target; handle vs action; never-created persisted | section 4 |
| Re-use shows `initial`; disposed before first capture | L8, L5.1 |
| Restored at ready with nothing pending | stays a record (L7) |
| Ensure over undecodable record; remount after quarantine | L6; quarantine as Runtime O6 |
| Parked endings of a non-persisted actor at its end | stay on the lane record (E2, fix 12) |
| Stories' record-keeping `dispose`; property tests; 22 cases | gone; `detach` plus `advance`; section 11. Property tests generate `detach` and `dispose` as authored steps |
| Harness re-attach | defined by `reload`'s re-ensure (section 11) |
| `release` collides with fakes' `release()` | `detach` |
| R9 H1 walk relies on Runtime disposal | Story form by `reload`; disposal form to the policy suite (E4) |
| Multi-tab race, waiting forever, untestable follower uses | a new leader waits for no one; browser tests (limit) |
| Places describing `retain` | C104–C111, C126, C127 |
| **v2 review 1** | |
| R1-H1, R1-H2, R1-H3, R1-H4, R1-H5 | default stated; Runtime Clock grace; Runtime copy and pre-attach reads; restore is not create (section 4); activities do not count |
| R1-M1/M2, R1-M3, R1-M4, R1-M5, R1-M6 | `Held` and schedules do not count; lanes are the Runtime's (rule 44); follower uses in the leader; local actors React O3 (Q2); hiding is a limit |
| **v2 prototype and review 2** | |
| P1, P2, P3, P4 | `NoRecord`; the ending window queues only for persisted targets; ensure over undecodable record; path-parked endings stay (fix 12) |
| P5, P6, P7, P8 | Strict Mode and grace cases; Stories' `dispose` is `disposeActor`; state hash carries uses and the grace generation; section 11 |
| R2-H1, R2-H2 | dehydrate's subscription; a debounce is not kept: late or lost, by the user's choice, with `ScheduleLeadsToWrite` |
| R2-H3, R2-H4, R2-H5 | commit-effect uses; record-keeping dispose gone; harness re-ensure |
| R2-M1, R2-M2, R2-M3 | a non-persisted ending target drops; one send path; record encoded at the end |
| R2-M4, R2-M5, R2-M6 | `detach`; E4; C127 |
| R2-L2, R2-L3, R2-L4, R2-F | no waiting; bounded by Persistence O3 and decision 13; `Held` with waiting commits does not keep; section 11 cases |
| **v3 reviews** (as the brief cites them) | |
| H3 host race | fix 1: a 100 ms Runtime Clock grace, not one task (L4) |
| H4 unencodable record | fix 7 (L5.1) |
| M1, M3, M4 | decision 14 (L6, C125, upload fixture), decision 15 (L6), decision 13 (C106) |
| M5, M6 | fix 9 (L8), fix 8 (section 4) |

## 14. Limits

Accepted: autosave inside its debounce fires on the next open or reload if persisted (late, not lost) and is lost if
not; reactions while away appear on return, or never for a non-persisted actor; a non-persisted actor hidden longer
than the grace (Suspense fallback, React Activity) starts fresh; multi-tab follower uses need browser tests; restore
cost is not measured. Found here: B1–B11 (section 10; B1 and B2 are Q1 and Q2). Also: a long write keeps an unused
actor's activities and sessions running for its whole duration (an upload keeps the editor's subscriptions open); a
handle's send after an end reaches whichever incarnation is live, fresh for a non-persisted identity (fix 9).

## 15. Open questions

**Q1. Hydrated actors and later-hydrating consumers (B1).** A: `<Hydrate>` holds a use (Flow-internal, like
dehydrate's subscription) on each actor its payload inserted, until the boundary unmounts; fix 3's "grace at
activation" applies only after that. B: keep fix 3 as accepted and state B1 as a limit (remedy: persist the ref).
Rec. **A**: no public API, no refetch or flash; the cost is that a transferred actor no component reads lives as
long as its page.

```tsx
<Hydrate payload={payload}><Suspense><LazyQueue /></Suspense></Hydrate> // B: queue ends before LazyQueue's chunk loads
<Hydrate payload={payload}><Suspense><LazyQueue /></Suspense></Hydrate> // A: queue kept while Hydrate is mounted
```

**Q2. The in-flight exception for local actors (B2).** A: React O3's expiry waits while a lane of the local actor is
`InFlight`, so its chained step runs (no other change to O3). B: keep React O3 as accepted. Rec. **A**: the
exception's reason (charged with no order) does not depend on how the actor was created. This reopens part of a
decided item, so B stands until the user says otherwise.

```tsx
const pay = useActor(PayMachine, { input }) // B: unmount mid-confirm → disposed at 100 ms → no `place`
const pay = useActor(PayMachine, { input }) // A: unmount mid-confirm → `place` committed → disposed after
```

**Q3. `detach` with no use held by the Story.** A: `StoryInvalidCommand { reason: "ActorAbsent" }`, its message
naming "this Story holds no use of North" (no new word). B: a new reason `NotAttached`. Rec. **A**, by the no-new-API
constraint; B reads better if the user prefers it.
