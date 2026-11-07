# Actor lifetime, version 2: used or busy, else evicted

Status: PROPOSED, 2026-11-07. One redesign from [brief.md](brief.md) (every finding at once). Nothing here is decided
except what the brief lists under "Decided by the user"; every other choice is proposed, and section 9 lists the
questions. MD = `workflow/plans/flow/references/explorations/machine-fragments/machine-design.md`. Prior art: MD's
rule 73, 2.7.17, OD27, C104-C111 and [proposal.md](proposal.md); section 7 says where this departs from them.

## 1. The rule in five lines

1. A shared actor is **used** while something with a defined end is looking at it: a mounted ensuring hook, a
   `snapshots` subscription, a bound context consumer, a Story's `ensure`, a `dehydrate`'s prepare.
2. It is **busy** while something it already started can still happen without an outside event: mail, a turn, a
   follow-up, a finite lookup, a write `InFlight`, and an armed schedule declared `busy` (Q1).
3. Once it is unused and not busy for the grace (internal, 100 ms on the Runtime Clock), it is **evicted**.
4. Evicting a persisted actor keeps its record in the scope (**dormant**): an ensure or a send **wakes** it with the
   same state and memory, so eviction is invisible. Evicting a non-persisted actor ends it; its lanes stay.
5. A send to an absent target wakes a dormant one, and otherwise is dropped with `SendTargetAbsent { reason }`.

## 2. The rule in full

**Rule 73 (proposed v2). A shared actor lives while it is used or busy; then it is evicted, and a persisted one stays
dormant.**

**The principle.** Implicit disposal happens only at quiescence: when nothing the actor started can still happen on its
own, and nothing with a defined end is looking at it. So eviction never changes what an actor does next; it only
frees what nobody can observe. For a persisted identity that is all of it (the record makes eviction invisible); for
a non-persisted one it is its memory, which is the decided contract ("lives while it is used", OD27).

**Uses.** Each is counted per actor, from a start to a defined end:

| Use | Starts | Ends |
| --- | --- | --- |
| an ensuring hook (`useActorByRef(ref, options)`) | its commit effect (never render, React O2), including while the attach waits for readiness, admission, lazy adoption or its `Hydrate` boundary (`pendingEnsures`) | its cleanup |
| a `snapshots` subscription | subscribe | the stream's end or interruption |
| a bound context consumer | binding at the consumer's admission | the consumer's disposal or eviction |
| a Story's `ensure(ref)` | that step | `detach(ref)` (Q4), `dispose(ref)` or the run's end |
| a `dehydrate` prepare's `ensureActor` | the call | dehydrate's own Runtime disposal |
| a follower tab's use of a mirror | its forwarded attach | its release, or the follower's death notice (multi-tab 4) |

Not uses: a host `ensureActor` (decided, OD27 Q2), a handle, a lookup (`useActorByRef(ref)`), `useView`,
`getSnapshot`, Inspection, a send, an activity or stream session, a `Held` lane, a parked ending, a schedule.

**Busy.** An actor is busy while any of these exists for it:

- an event in its mailbox, a turn, a follow-up (adoption deliveries, context updates, raises) or an ending settled
  but not yet admitted;
- a finite lookup in flight, chained reads and repairs included (the same work ServerRendering O2 settles);
- a write lane `InFlight` (an Attempt waiting to be invoked or on the wire). A `Held` lane is not busy, with or
  without waiting commits: it cannot move without a turn, and a turn needs an outside event;
- an armed schedule declared `busy: true` (proposed, Q1 A).

This is ServerRendering O2's "settled" plus busy schedules: one notion of finite work for both.

**The grace.** When a shared actor becomes unused and not busy, including at its activation (restore, hydration, a
wake), the Runtime arms its grace: an internal timer on the Runtime Clock, 100 ms, React O3's. Any use or work
disarms it. When it fires and the actor is still unused and not busy, the actor is evicted in that Runtime step. The
core returns the grace as data (`arm`, `disarm`); the host driver runs the timer; nothing in user code names a
duration. Searches hash the counts and the armed grace (stated cost, P7).

**Eviction.** One Runtime step, never a machine event. Activities stop, schedules cancel (none is busy), the terminal
snapshot publishes with lifecycle `disposed`, and then:

- **persisted**: the actor's current record is encoded into the scope in the same step and the actor becomes
  **dormant**. A record that cannot be encoded, or a capture the scope cannot take (bounds, `NonDurableContextProvider`),
  postpones eviction: the actor stays live and Inspection says why. The write to storage follows Persistence O3's
  ordinary coalescing; a dormant record exists in memory before its first write (R2-M3);
- **not persisted**: the actor ends. Its non-`Idle` lanes stay the Runtime's (rule 44), and so do its parked endings,
  for its identity's next incarnation (rule 54) or the Runtime's end;
- activity finalizers run in the host after the step. An ensure or a wake during them starts the next incarnation
  after they finish (Runtime O3's "ensure while disposing").

**Dormant and wake.** A dormant actor costs its encoded record and lane records, held as the scope's capture already
holds dormant lazy records (LazyFeatures O3), within Persistence O3's bounds. It runs nothing. An ensure, a send or a
waking consumer's context binding **wakes** it: a restore from the in-memory record, synchronously, with no input, and
its dormant providers first. It receives what any restore receives, before the event that woke it: parked endings in
saved order, then per lane a held head's `unknown { Restored }` once (rule 44). A pre-attach handle of a dormant
identity reads its decoded record, not `initial(input)` (R1-H3). A record that no longer decodes: an ensure discards
it with `RecordUndecodable` and creates fresh from its input (lanes still adopt, rule 46); a send cannot create, so it
reports `RecordUndecodable` and keeps the record.

**Sends to an absent target.** Action sends and handle sends (Q2 A) take one path. The target is live: delivered (a
send is mail, so it disarms the grace). Dormant: woken, then delivered after its adoption deliveries. Otherwise the
event is dropped and reported on the sender as `SendTargetAbsent { reason }`, never thrown, never rolling back:

| reason | when |
| --- | --- |
| `NotPersisted` | no live incarnation, and the identity does not persist |
| `NoRecord` (proposed, Q3) | persisted, no record: never created, disposed or forgotten |
| `RecordUndecodable` | the dormant record fails to decode |
| `NotAdopted` | the machine is an inactive lazy entry (LazyFeatures O2: a send never adopts) |

A shared actor's handle names its identity across eviction (Q2 A): its `getSnapshot` and `snapshots` read the woken
incarnation, or the dormant record's snapshot while it sleeps; across `disposeActor` it does not (Runtime O3). A send
never creates, because a send has no input. During a non-persisted actor's eviction finalizers the identity is
absent: the event is dropped, never queued for a fresh incarnation from `initial` (R2-M1, P2). There is no separate
"disposing" queue: eviction is one step.

**Restore at `ready`.** A restored actor activates at `ready` only if it has work: pending mapped outcomes, a held
head to deliver, `NotSent { Restored }`, or an armed busy schedule. The rest stay dormant until ensured or woken, so a
page load opens no activities for actors nobody shows. Activated ones follow the grace from activation. Amends
Persistence O4's "restored stable actors are active without another ensure".

**Explicit disposal is unchanged.** `disposeActor` disposes for every user, whatever its uses; a provider with bound
consumers rejects (`BlockedByDependents`); a mounted ensuring hook re-ensures a fresh incarnation and its use moves
there. A persisted record is removed (Persistence O3); lane records and parked endings stay (rule 46). `forget` also
removes those. `dispose()` of the Runtime: Runtime O6.

**Local actors** (`createActor`, `useActor`) are not under this rule. A host's local actor lives until it is disposed;
a React local actor follows React O3 (decided). Q6 asks whether busy should also delay React O3's disposal.

**The default flips** (R1-H1). Without `retain`, a shared actor used to live until disposed. Now an actor that nobody
uses and that has no work goes after the grace. To keep one: use it from something that stays (a layout's hook, a
host `snapshots` subscription, a context consumer), or persist it so eviction is invisible. There is no keep-alive API
(decided, OD27 Q3).

**Costs.**

| What | Costs while gone |
| --- | --- |
| evicted, persisted (dormant) | its encoded record and lane records, inside Persistence O3's 4,096 records and 16 MiB |
| evicted, not persisted | nothing, except non-`Idle` lanes and parked endings until its next incarnation or the Runtime ends; Inspection and `unsettledWrites()` list them |
| explicitly disposed | as evicted, without the actor record |
| live and unused | at most the grace, or for as long as it is busy |

**Stated limits.** (1) A non-persisted actor whose uses have a gap longer than the grace starts fresh: a Suspense
fallback that waits on the network, React Activity hiding (R1-M6). The remedy is a use from an ancestor that stays
mounted, or `persist`. (2) A busy schedule that re-arms forever keeps its actor forever; Inspection's `uses.busy` names
it. (3) Activities stop at eviction by design: an actor that must react to a stream while nobody shows it must be
used (a host subscription).

## 3. Why this shape

- **One notion of quiescence, not a use list that grows.** Review 1 and the prototype kept adding kinds to "use"
  (schedules, holds, streams, pending ensures) and each made something immortal (R1-H5, R1-M1/M2). Splitting
  observers (uses) from finite work (busy) ends that: streams and holds wait on the outside world, so they are
  neither; mail, lookups and `InFlight` writes end on their own, so they keep the actor until they do.
- **Persistence makes eviction invisible, so behaviour cannot depend on it** (requirement 5). That needs the record in
  memory (R1-H3), a wake on send (R1-H4 is answered by "wake is not create": no input, no adoption), and eviction only
  after the record encodes (R2-M3).
- **The R8 H2 lane problem is already solved by Runtime-owned lanes** (R1-M3). Busy exists for the in-actor follow-up
  (a `Saved` toast, a resend armed by `unknown`), and in-memory parking covers non-persisted endings (P4).
- **Every use has a defined end**, so the rule needs no "after the React commit" (R1-H2): React's cleanup, a stream's
  end, a Story step, dehydrate's disposal. A host ensure has none, which is why it is not one (decided).
- **Prior art.** TanStack Query: observers keep a query, an unfinished mutation keeps itself, and `refetchInterval`
  stops without observers (`query.ts` `optionalRemove`, `removable.ts`, `mutation.ts`). Node: a ref'd timer keeps the
  process alive and `unref()` opts out, which is Q1's question. XState: actors live with their parent; no use count.

## 4. The cases

Markers: **NEW**, **RENAMED**, **DROPPED**, existing, user-defined. Q1 A is assumed where `busy` appears.

### 4.1 The editor (persisted, autosave)

Before:

```ts
export const editorRef = (ticket: TicketKey) =>
  actorRef(EditorMachine, [ticket.workspaceId, ticket.ticketId], { // existing: actorRef; user-defined: EditorMachine
    persist: true,                                                 // existing: persist
    retain: "10 minutes",                                          // existing: retain, a guessed timer
  });

EDITING: {                                                         // user-defined: EDITING
  schedules: {
    autosave: { schedule: "2 seconds", send: E.AutosaveDue, restartOn: ({ memory }) => memory.draft },
  },                                                               // user-defined: autosave, AutosaveDue
},
UNSURE: { schedules: { resend: { schedule: "3 seconds", send: E.ResendDue } } }, // user-defined: resend
```

After:

```ts
export const editorRef = (ticket: TicketKey) =>
  actorRef(EditorMachine, [ticket.workspaceId, ticket.ticketId], { // existing: actorRef
    persist: true,                         // existing: persist; eviction keeps the record, so it wakes unchanged
  });                                      // DROPPED: retain

EDITING: {
  schedules: {
    autosave: {
      schedule: "2 seconds",                   // existing
      send: E.AutosaveDue,                     // existing: send; user-defined: AutosaveDue
      restartOn: ({ memory }) => memory.draft, // existing: restartOn
      busy: true,                              // NEW (Q1 A): while armed, the editor is busy
    },
  },
},
UNSURE: { schedules: { resend: { schedule: "3 seconds", send: E.ResendDue, busy: true } } }, // NEW: busy
```

The panel is unchanged: `useActorByRef(editorRef(ticket), { input: ticket })` (existing) is a use from its commit
effect to its cleanup. The same `busy: true` goes on `settle` (the keyed per-field debounce), `LOCKED.retry` and
`Autosave.resend` in `autosave.trait.ts`. A walk: type at 0 s, close at 1 s (uses 0, `autosave` armed and busy);
`AutosaveDue` at 2 s in the same incarnation; the save is `InFlight` (busy); `Saved` at 2.3 s; idle; the grace; dormant
at 2.4 s. Reopening wakes it from the record with `saved` equal to the draft. Without `busy` (Q1 C), the record keeps
the deadline and the save goes when someone reopens the ticket (R2-H2), and `flow check` says so (`ScheduleNotBusy`,
info).

Added: `busy` on a schedule. Dropped: `retain`.

### 4.2 Presence (not persisted, streams)

Before:

```ts
export const presenceRef = (ticket: TicketKey) =>
  actorRef(PresenceMachine, [ticket.workspaceId, ticket.ticketId], { retain: "15 seconds" }); // existing: retain
```

After:

```ts
export const presenceRef = (ticket: TicketKey) =>
  actorRef(PresenceMachine, [ticket.workspaceId, ticket.ticketId]); // existing: actorRef; DROPPED: retain

// Viewers.tsx, unchanged: the hook is the use.
const watcher = useActorByRef(presenceRef(ticket), { input: ticket }); // existing: useActorByRef
```

`viewers` and `typing` are activities: no use, no work (R1-H5). When the last `Viewers` unmounts, the grace runs and
eviction releases both sessions, so other users see this one leave. A `Typed` ping on the wire is busy until it lands.
A move between two screens that both show `Viewers` in one commit keeps it; a gap longer than the grace leaves and
rejoins (limit 1). To span screens, put `Viewers` in their shared layout. Dropped: `retain`; 15 s of lingering.

### 4.3 The checkout in 3-D Secure (persisted)

Before and after, the ref is the same:

```ts
export const payRef = actorRef(PayMachine, "checkout", { persist: true }); // existing: actorRef, persist
```

In `CHALLENGE`, `authenticate` (Stripe.js `handleNextAction`) is an `InFlight` write, so the checkout is busy for the
whole challenge, used or not, in a background tab or after a route change: the countdown keeps its time in the same
incarnation, and `Passed` commits `place` (busy again) before `PAID` lets it go dormant. The two loops that hold a
write get `busy` (Q1 A):

```ts
UNSURE: {                                                    // user-defined: UNSURE, the reconcile
  schedules: {
    check: { schedule: "3 seconds", send: E.CheckTick, armOn: [Flow.entry, E.CheckTick], busy: true }, // NEW: busy
  },
},
WAITING: {
  schedules: {
    retry: { schedule: ({ memory }) => `${memory.retryInMs} millis`, send: E.RetryNow, busy: true }, // NEW: busy
  },
},
```

Without `busy`, an unused checkout in `UNSURE` goes dormant with `pay` `Held`; the next ensure delivers
`unknown { Restored }` and reconciles then. Safe either way (the hold is kept); only how soon differs. `PAYING.slow`
(a notice) stays plain. Added: `busy` on two schedules. Dropped: nothing.

### 4.4 The queue on a server page (not persisted, SSR)

The code is unchanged (`next/app/desk/[workspace]/page.tsx`):

```ts
const payload = await dehydrate(               // existing: dehydrate
  deskServerSetup(user),
  (runtime) => {
    runtime.ensureActor(SessionRef, { input: { userId: user.id } });        // existing; now a use until dehydrate ends
    runtime.ensureActor(queueRef(workspaceId), { input: { workspaceId } }); // existing; the same
  },
  { within: "1500 millis" },
);
```

What changes is the rule under it: prepare's ensures are uses held by dehydrate until it disposes its Runtime, so the
queue is never evicted between its chained reads and the capture (R2-H1). On the client, `Hydrate` activates the queue
in its commit effect; `QueueClient`'s ensuring hook is already a pending use beneath that boundary, so it is kept. A
hydrated actor with no consumer goes after the grace. Navigating to another workspace evicts it (not persisted); the
navigation payload brings it back. Added, dropped: nothing in code.

### 4.5 A toast (not persisted, sent to by other actors)

Before (`app/host.ts`):

```ts
runtime.ensureActor(ToastsRef);                                  // existing: kept it alive forever (no retain)
```

After:

```ts
// DROPPED from host.ts: a host ensure is not a use (decided), so it would be evicted after the grace.
// ToastStack.tsx, unchanged, in the root layout, is the use:
const toasts = useActorByRef(ToastsRef, {});                     // existing: an options object ensures
// A headless host that shows toasts keeps one with a subscription instead:
yield* Effect.forkScoped(Stream.runDrain(runtime.ensureActor(ToastsRef).snapshots)); // existing: snapshots
```

`send(ToastsRef, Toasts.E.Push(...))` from the editor reaches it while `ToastStack` is mounted. With none mounted it is
dropped and reported on the editor as `SendTargetAbsent { reason: "NotPersisted" }` (existing: `reason`, decided in OD27 Q1).
`expire` is not busy: an unused toast list is gone with its messages, which is what an unmounted stack means. The same
change applies to host.ts's queue, feed and editor ensures (R2-M6). Added: nothing. Dropped: host.ts's ensures.

### 4.6 A local actor

Unchanged:

```ts
const upload = useActor(UploadMachine, { input: file });              // existing: useActor; user-defined: UploadMachine
const scratch = runtime.createActor(EditorMachine, { input: T43 });   // existing: createActor
```

Rule 73 does not count them. React O3 disposes `upload` 100 ms after its cleanup (decided); its `InFlight` write
continues as a Runtime lane and its ending is evidence, since a local actor has no identity to adopt it. `scratch` lives
until `disposeActor` or Runtime disposal. Under Q6 B, `upload`'s disposal waits until it is not busy.

### 4.7 A Story

Before (MD 2.10.10's spelling; the plain `dispose` kept the record of a busy actor, which production cannot do):

```ts
Story.app(deskSetup, { id: "editor/closed-while-saving", world: [Desk.saveTitle.hold()] }) // existing
  .ensure(ref, { input: T42 })                       // existing
  .send(ref, E.TitleChanged({ title: "Foyer" }), E.SaveRequested())
  .dispose(ref)                                      // existing: record-keeping dispose; unreachable when busy
  .world(Desk.saveTitle.release())                   // existing: the fake answers
  .ensure(ref, { input: T42 })
  .checkpoint("rebound");
```

After:

```ts
Story.app(deskSetup, { id: "editor/closed-while-saving", world: [Desk.saveTitle.hold()] })
  .ensure(ref, { input: T42 })                         // existing: a use, like a mounted panel
  .send(ref, E.TitleChanged({ title: "Foyer" }), E.SaveRequested())
  .detach(ref)                                         // RENAMED (Q4): was Story.release(ref); disposes nothing
  .world(Desk.saveTitle.release())                     // existing: the same incarnation hears Saved (busy)
  .advance({ next: { actor: ref, timer: "grace" } })   // NEW timer name: grace; evicted, the record dormant
  .checkpoint("evicted")                               // cp.inspection lists it dormant
  .ensure(ref, { input: T42 })                         // existing: wakes it from the record, input ignored
  .checkpoint("reopened");
```

`dispose(ref)` is now `disposeActor` (Q5), and `dispose(ref, { how: "forget" })` is `forget`. A focused
`Story.machine`'s actor is a shared, non-persisted identity, so its `dispose()` then `ensure()` is a production
`disposeActor` then `ensureActor` (rule 44's in-Runtime adoption); it gains `detach()`. Added: `detach`, the `grace`
timer address. Dropped: the record-keeping `dispose`, `how: "now"`.

## 5. Replacement text for MD

Written assuming every recommendation in section 9; each Q's other option changes only the clause it names.

**Rule 73**, replacing the whole item:

```md
73. **A shared actor lives while it is used or busy** (OD27; 2.7.17). A use has a defined end: an ensuring hook
    from its commit effect to its cleanup (including while its attach waits for readiness, admission, lazy adoption
    or a `Hydrate` boundary), a `snapshots` subscription, a bound context consumer, a Story's `ensure` until
    `detach` or `dispose`, a `dehydrate` prepare's ensure until dehydrate disposes its Runtime, and a follower tab's
    use of a mirror. The actor is **busy** while it has mail, a turn, a follow-up or an ending not yet admitted, a
    finite lookup, a write lane `InFlight`, or an armed schedule declared `busy`. Unused and not busy for the grace
    (internal, React O3's, on the Runtime Clock), it is **evicted** in one Runtime step: a persisted actor's record
    is encoded into the scope and it is **dormant** (eviction waits while the record cannot be captured), and an
    ensure or a send **wakes** it from that record; a non-persisted actor ends, and its lanes and parked endings stay
    the Runtime's for its identity. A send never creates: a dormant target wakes, otherwise `SendTargetAbsent` with
    its reason. `Held`, unmarked schedules, activities and stream sessions are not work; a host `ensureActor`, a
    lookup and `useView` are not uses. Local actors keep React O3. `retain` does not exist.
```

**2.7.17**, replacing the whole section: the heading `#### 2.7.17 Actor lifetime: used or busy, else evicted`, then
this opening paragraph, then this proposal's section 2 from "**The principle.**" through "**Stated limits.**"
verbatim, then 4.1's and 4.2's after-blocks, then section 3's bullets as "Why":

```md
Rule 73 is normative (OD27, with the v2 addendum). It replaces Runtime O3's `retain`, a guessed duration per ref that
expired an actor whatever it was doing and served opposite needs with one number. Implicit disposal now happens only
at quiescence, and persistence makes it invisible.
```

**Rule 44**, two sentences. Replace "An ending with no live actor incarnation is parked raw on its lane record for
the identity's saved record, if one exists, and mapped through the current `outcomes` at delivery; otherwise it is
evidence." with:

```md
An ending with no live actor incarnation is parked raw on its lane record, which the Runtime keeps for the identity
(and saves with the identity's record when it persists), and is mapped through the current `outcomes` at delivery; a
local actor's is evidence, since no incarnation can adopt it.
```

and replace "Implicit disposal never happens while a lane of the actor is `InFlight` or has waiting commits (rule
73); a `Held` lane is handed off by this rule." with:

```md
Eviction (rule 73) never happens while a lane of the actor is `InFlight`; a `Held` lane, with or without waiting
commits, is not work and is handed off by this rule.
```

**2.7.13, "Walks kept as Stories"**: replace `"Runtime disposal with an Attempt on the wire, reload, the write
succeeds, ensure: the restored state receives the ending" (R9 H1; retain expiry no longer exists, rule 73)` with:

```md
"`detach` with an Attempt on the wire: the same incarnation receives the ending, goes dormant after the grace, and
`ensure` wakes it with that state" (R9 H1, rule 73); its Runtime-disposal form joins R9 H2 in the policy suite
```

**2.7.18, "Rule 73." bullet**: "An ignored unknown leaves no `InFlight` lane, so it is not a use." becomes "...,
so it does not keep the actor busy."

**2.10.1, constructor table**, the two cells:

```md
| `Story.app` | ... | `ensure(ref)`, `detach(ref)`, `dispose(ref, { how? })`, `send(target, …events)`, `openTab`, `closeTab`, `reload`, `dehydrate`, `hydrate` |
| `Story.machine` | ... | `send(…events)`, `setContext`, `detach()`, `dispose()`, `ensure()` (another incarnation of the same identity, a shared, non-persisted one) |
```

and the data-form row: `| \`ensure\`, \`detach\`, \`dispose\` | \`{ ensure: [ref?, options?] }\`, \`{ detach: ref? }\`,
\`{ dispose: [ref?, options?] }\` |`.

**2.10.3**: add to the list of Flow's own timer names: "`grace` (rule 73), addressed as `{ actor, timer: "grace" }`".

**2.10.10**, replace "Rebind is `dispose()` then `ensure()`; no-use disposal (rule 73) is `Story.release(ref)` then
`advance` past the grace, and leaves a busy actor live; `dispose(ref, { how: "now" })` is `disposeActor` and `{ how:
"forget" }` is `forget` (STR9, STF43)." with:

```md
A Story's `ensure` is a use, like a mounted screen. `detach(ref)` ends it and disposes nothing (with no use held it
is `StoryInvalidCommand`); eviction then follows
rule 73 (`advance({ next: { actor: ref, timer: "grace" } })`), and a busy actor stays. `dispose(ref)` is
`disposeActor` and `{ how: "forget" }` is `forget`, so a rebind is `dispose` then `ensure`, as in production; no
Story step disposes and keeps a record (STR9, STF43). A focused machine Story's actor is a shared, non-persisted
identity: its lanes are never persisted, and `closeTab` and `reload` stay type errors there.
```

**OD27, appended**:

```md
  Addendum, v2 (PROPOSED, ../../proposals/actor-lifetime/proposal-v2.md): uses and work split (a use has a defined
  end; busy is mail, turns, follow-ups, finite lookups, `InFlight` lanes and `busy` schedules); a `Held` lane is never
  work; pending ensures are commit-time; dehydrate's prepare ensures are uses; eviction makes a persisted actor
  dormant in the scope, waits until its record encodes, and an ensure or send wakes it; no "disposing" queue;
  non-persisted parked endings stay for the identity; restored actors without work stay dormant at ready; a new
  leader waits for no one. Q1-Q6 of v2 are open.
```

**C rows**, replacing C104-C111 and adding C112-C114:

| ID | Plan | Change | Replaces or amends |
| --- | --- | --- | --- |
| C104 | Runtime O3 | Rule 73 v2: uses, busy, the internal grace, eviction, dormant and wake; `ConflictingActorRef` covers `persist` and `context`; the Reference line drops `retain` | "With retain ... last use ended", "Without retain ... Runtime disposal" |
| C105 | Runtime O4, LazyFeatures O2, React O3 | One send path for action and handle sends: live delivers, dormant wakes, else `SendTargetAbsent { reason: NotPersisted \| NoRecord \| RecordUndecodable \| NotAdopted }`; no disposing queue | "If the target is absent or disposing ... dropped", "never adopts or creates", React O3's "Sends through a handle whose actor is disposed are dropped" |
| C106 | Persistence O2-O5 | Eviction encodes the record into the scope (dormant), postponed while it cannot; restored actors without work stay dormant at ready; an ensure over an undecodable record starts fresh with `RecordUndecodable` | "whose retain expired keeps its saved record", "Their retain clock starts at ready", "Restored stable actors are active without another ensure" |
| C107 | ServerRendering O1, O5 | Prepare's ensures are uses until dehydrate disposes its Runtime; the grace starts at activation | "Shared actor retention starts at activation" |
| C108 | React O2, O3 | Pending ensures are commit-time; a pre-attach handle of a dormant identity reads its record; across hiding, persist or use from outside the hidden subtree | "Shared refs with retain are the way to keep state across hiding", "retention follows @plan.Runtime.O3" |
| C109 | Runtime V4, V7; React V4 | Eviction on the TestClock: invariants L1-L4 (section 6) | "retain expiry", "retention" |
| C110 | Testing O1, O7 | `detach(ref)`; `dispose` is `disposeActor`; the `grace` timer address; a machine Story's identity is shared and non-persisted | Adds; replaces `Story.release(ref)` |
| C111 | Inspection | `uses: { consumers, subscriptions, contexts, pendingEnsures, busy }` per live actor; dormant identities listed with their record size | Adds |
| C112 | Machines O5, Diagnostics, CommandLine | `busy?: boolean` on a schedule; `flow check` info `ScheduleNotBusy` for an unmarked schedule whose firing can reach a commit or retry | Adds (Q1 A) |
| C113 | multi-tab.md 4, 5.3, V-MT2 | A follower's uses count in the leader until released or its death notice; a new leader restores and waits for no one | "releases that follower's attachments (retain)", "`retain` counts attachments in every tab", "retain across tabs" |
| C114 | References | Drop `retain` from `editor.ref.ts`, `presence.ref.ts`; drop host ensures in `app/host.ts` (or hold a `snapshots` subscription); `busy` on the editor's, Autosave's and Pay's write loops; fix `REWRITE-PLAN.md` row 47 and line 160, `REVIEW.md` row 10 | R2-M6 |

## 6. Suite changes

**The 22 busy-dispose cases** (P8; in `frag`, `round5`, `round7`, `round8`, `round9`, `round9b`, `stream`). Their
`dispose` kept the record of a busy actor in the same Runtime, which production cannot reach. Each is rewritten by
what it asserts, with expected results re-derived from the design text (test the spec):

| The case asserts | Becomes |
| --- | --- |
| a lane is adopted by a new incarnation in the same Runtime (rule 44, 54) | `dispose` = `disposeActor`: memory fresh from input; lanes, holds and parked endings adopted |
| the next incarnation reads memory the earlier one set | `reload`, if it is about restore; or `detach`, the work, `grace`, `ensure`, if it is about continuity |
| an ending lands while no actor lives | `disposeActor` with the Attempt on the wire (the ending parks), or `closeTab` (it restores) |

**What the harness stops doing** (R2-H5). It no longer re-attaches a use count onto an absent actor after a reload.
A reload does what Stories' `reload` and production remounts do: it re-ensures, with the same options and input, each
ref the suite ensured in that life and did not detach or dispose. That restores, creates fresh after
`RecordUndecodable`, or finds nothing absent. A ref the suite did not re-ensure is a restored actor with no use, so its
grace is exercised. `release` is renamed `detach`; `dispose` is `disposeActor`.

**Global invariants**, checked after every step of every case:

- **L1 no busy eviction**: an implicit disposal never happens while the actor has a use or is busy;
- **L2 invisible eviction**: for a persisted identity, the first publication after a wake or ensure of a dormant
  record equals the evicted incarnation's terminal snapshot in state, memory and context bindings;
- **L3 no fresh delivery**: an event sent to a non-persisted identity is never delivered to an incarnation that
  started after the send;
- **L4 no leak**: an actor unused and not busy for a full grace is not live.

**Cases to add** (LIFE-11 onward; each red on at least one wrong runtime):

| Case | Pins | Finding |
| --- | --- | --- |
| dehydrate with a chained load | prepare's ensures are uses until disposal | R2-H1 |
| detach within the debounce | a busy schedule fires in the same incarnation; unmarked, it is kept in the record | R2-H2 |
| `Held` head with waiting commits | not busy; a settled head awaiting admission is busy | R2-F, R2-L4 |
| wake after reload | delivers parked endings, then `unknown { Restored }`, then the send | R2-F |
| cross-actor action send to a dormant target | wakes and delivers in send order | R2-M2, R2-F |
| restored, not re-ensured | evicted a grace after `ready`; one with work stays until idle | R2-H5 |
| `disposeActor` and `forget` while used | uses move to the fresh incarnation; forget drops lanes | R2-F |
| contexts, subscriptions, pending attaches | each a use, each ended by its own end | R2-F, R2-H3 |
| send during non-persisted eviction finalizers | dropped as `NotPersisted`, never a fresh incarnation | R2-M1, P2 |
| unencodable record | eviction postponed, actor live, Inspection says why | R2-M3 |
| evicted before the first write | the wake reads the in-memory record | R2-M3 |
| non-persisted parked-for-path endings | survive eviction; the next incarnation hears them once | P4 |
| undecodable record after reload | ensure creates fresh with `RecordUndecodable`; send reports it | P3 |
| persisted, never created | `NoRecord` | P1 |
| SSR activation | the grace starts at `Hydrate`'s commit; the pending attach keeps it | R2-F |
| Inspection `uses` | counts per kind and `busy` | R2-F |
| `ConflictingActorRef` without `retain` | `persist` or `context` differ | R2-F |
| multi-tab (Stories tabs, browser V-MT2) | follower uses count in the leader; death releases; a new leader waits for no one | R1-M4, R2-L2 |

**P7.** The counts and the armed grace stay in the state hash; the ~23% growth is accepted (the counts change future
behaviour, so hashing a boolean would be unsound). **P5.** Strict Mode is pinned by a same-task release and attach;
the grace is pinned by a route change (release, then attach after 99 ms and after 101 ms).

## 7. Departures from the current rule 73 (read after this draft was written)

| Current (rule 73, 2.7.17, OD27) | v2 | Why |
| --- | --- | --- |
| mail and write lanes are "uses" | uses (observers with an end) and busy (finite work) are two lists | each kind added to "use" made something immortal; the split has one test: does it end on its own |
| a lane "`InFlight` or has waiting commits" | `InFlight` only; a `Held` head with waiting commits is not busy | the waiting commits sit behind the hold, which needs a turn: an unused actor would never go (R2-F, R2-L4) |
| a pending ensure is "a pre-attach handle" | an attach registered in the commit effect | render registers nothing (React O2; R2-H3) |
| read lookups are not uses | finite lookups are busy | the same work ServerRendering O2 settles; a load's result lands in the record before eviction |
| (none) | dehydrate's prepare ensures are uses until its disposal | a server actor was evicted mid-load (R2-H1) |
| armed schedules are not uses | open; recommended `busy: true` on the schedule | deferred autosave (R2-H2); no structural rule separates a resend from a lock renewal |
| "the Runtime's copy" | the dormant record in the scope's capture, encoded in the eviction step; eviction waits while it cannot be encoded | bounded by Persistence O3 (R2-L3); no record yet before the first write (R2-M3); an older record would make eviction visible |
| a send to a disposing target queues | removed: eviction is one step; a non-persisted identity is absent during finalizers | no window (P2); a queued event could reach a fresh `initial` (R2-M1) |
| handle sends drop (React O3, unchanged) | one path with action sends (Q2) | behaviour would depend on eviction timing (requirement 5; R2-M2) |
| three reasons | adds `NoRecord` (Q3) | P1 |
| `Story.release(ref)`; `dispose(ref)` keeps its meaning | `detach(ref)` (Q4); `dispose(ref)` is `disposeActor` (Q5) | collision with wire `release` (R2-M4); the record-keeping dispose is unreachable (R2-H4, P6, P8) |
| restored actors start the grace from ready | restored actors without work stay dormant; the rest start it at activation | a page load would open and close every restored actor's activities |
| a new leader waits one grace after followers re-attach | waits for no one | the wait never ends if a follower never re-attaches (R2-L2); persisted eviction is invisible, so the race is harmless |
| endings of a non-persisted identity with no actor are evidence | parked on the Runtime's lane record for the identity | P4; one rule for both kinds |
| (unspecified) | an ensure over an undecodable record starts fresh with `RecordUndecodable` | P3 |
| a machine Story's actor is a local identity | a shared, non-persisted identity | its `dispose` then `ensure` is then a production rebind (P6) |
| `disposeActor` "clears the identity's uses" | a mounted hook re-ensures and its use moves to the fresh incarnation | React O3 already says so; "clears" would leave a mounted hook without a use |

Kept from the current text: the internal grace (OD27 Q6), host ensure not a use (Q2), no keep-alive API (Q3),
Inspection's `uses` (Q5), the reasons (Q1), pre-attach reading the record, providers first on restore, local actors
on React O3, explicit disposal unchanged, `ConflictingActorRef` on `persist` and `context`.

## 8. Finding by finding

| Finding | Resolution | Where |
| --- | --- | --- |
| R1-H1 default flips | stated, with the ways to keep one (a use that stays, `persist`) | 2 "The default flips" |
| R1-H2 "after the commit" | every use has a defined end; the grace is on the Runtime Clock; restored and hydrated actors start it at activation | 2 Uses, The grace |
| R1-H3 `initial` after quick re-use | dormant record read by pre-attach handles and wakes | 2 Dormant and wake |
| R1-H4 restore-on-send vs LazyFeatures O2 | a wake is not a create: no input, no adoption (`NotAdopted`), `RecordUndecodable` keeps the record | 2 Sends |
| R1-H5 streams make presence immortal | activities are neither uses nor work | 2 Uses, 4.2 |
| R1-M1/M2 `Held`, schedules | `Held` is never work; schedules only if declared `busy` (Q1) | 2 Busy, Q1 |
| R1-M3 R8 H2 already closed | busy is for in-actor follow-up; non-persisted endings park | 3, rule 44 text |
| R1-M4 multi-tab race | follower uses counted in the leader; eviction of persisted actors is invisible, so a race is churn, not loss | 2 Uses, C113 |
| R1-M5 local actors | out of the rule, stated; Q6 asks about busy | 2 Local actors, 4.6, Q6 |
| R1-M6 Activity hiding | `persist`, or a use outside the hidden subtree; limit 1 | 2 Stated limits, C108 |
| P1 never-created target | `NoRecord` | 2 Sends, Q3 |
| P2 no disposing window | the queue clause is removed | 2 Sends, 7 |
| P3 remount over a quarantined record | an ensure starts fresh with `RecordUndecodable`; a pre-attach handle creates nothing | 2 Dormant and wake |
| P4 parked-for-path endings at disposal | kept on the Runtime's lane record for the identity | rule 44 text |
| P5 Strict Mode and the grace | the grace stays for route changes; both pinned | 6 |
| P6 Stories' dispose has no counterpart | `dispose` is `disposeActor`; machine Story identity is shared | 4.7, 2.10.10 text, Q5 |
| P7 state hash +23% | accepted; counts are behaviour | 6 |
| P8 22 busy-dispose cases | rewritten by what they assert | 6 |
| R2-H1 server dehydrate | prepare's ensures are uses; lookups are busy | 2 Uses, 4.4, C107 |
| R2-H2 debounce deferred | `busy: true` (Q1 A), `ScheduleNotBusy` info | 4.1, Q1, C112 |
| R2-H3 pending ensure in render | commit-time only | 2 Uses |
| R2-H4 Stories' dispose unreachable | removed; `detach` + eviction, or `disposeActor` | 4.7, 6 |
| R2-H5 harness re-attach | reload re-ensures as production remounts; restored grace exercised | 6 |
| R2-M1 send to disposing | no queue; non-persisted absent during finalizers | 2 Sends |
| R2-M2 handle vs action sends | one path (Q2); suite adds cross-actor action sends | 2 Sends, 6, Q2 |
| R2-M3 disposed before first capture | the record is encoded in the eviction step; held in memory | 2 Eviction |
| R2-M4 `release` collides | `detach` (Q4); `detach` with no use is `StoryInvalidCommand` | 4.7, Q4 |
| R2-M5 R9 H1 walk | a Story with `detach`; the Runtime-disposal form goes to the policy suite | 5 (2.7.13 text) |
| R2-M6 places saying `retain` | listed | C104, C108, C113, C114 |
| R2-L2 new leader waits forever | waits for no one | 7, C113 |
| R2-L3 the copy grows | it is the scope's capture, inside O3's bounds | 2 Costs |
| R2-L4 settled head counted busy | an ending settled but not admitted is mail; `Held` is not busy | 2 Busy |
| R2-F untested parts | one added case each | 6 |

## 9. Open questions

**Q1. Should a schedule keep its actor busy?**
A: a `busy: true` property on the schedule, default off, with `flow check` info `ScheduleNotBusy` on any unmarked
schedule whose firing can reach a commit or retry. B: every armed schedule is busy. C: none is (today's rule 73); the
record keeps the deadline, plus the same info. D: debounces (`restartOn`) fire at the grace's end; others are not busy.

```ts
// before (C)
autosave: { schedule: "2 seconds", send: E.AutosaveDue, restartOn: ({ memory }) => memory.draft },
// after (A)
autosave: { schedule: "2 seconds", send: E.AutosaveDue, restartOn: ({ memory }) => memory.draft, busy: true }, // NEW: busy
```

Rec. A. Correctness needs the save to go (R2-H2); B makes every poller, ticker and lock renewal immortal; D fires a
dwell timer early; and no structural rule tells a resend (finite, wanted) from a lock renewal (endless, must stop):
both are schedule, write, ending, re-arm. Only the author knows, at the schedule (locality), and the info finds every
candidate.

**Q2. A handle send (host code) to a gone incarnation?**
A: the same path as an action send: a dormant target wakes, otherwise `SendTargetAbsent { reason }`; the handle then
reads the woken incarnation. B: drop, as React O3 says today.

```ts
const editor = runtime.ensureActor(ref, { input });   // existing; not a use
// ... the actor is evicted ...
editor.send(Editor.E.Close());  // A: wakes it from the record and delivers   B: SendTargetAbsent
```

Rec. A. Under B, whether a host's event lands depends on whether 100 ms passed (requirement 5).

**Q3. A persisted target that was never created?**
A: a new reason `NoRecord` (also after `disposeActor` and `forget`). B: reuse `NotPersisted`.

```ts
// before: send(payRef, E.Start(...)) with no checkout yet → { reason: "NotPersisted" }   (untrue: it persists)
// after:  → { reason: "NoRecord" }   // NEW value
```

Rec. A. The reason says what to do: ensure it first.

**Q4. The Story step that ends a use?**
A: `detach(ref)`, a chained step with data form `{ detach: ref }`, the word React O3 uses. B: keep `Story.release(ref)`
(OD27 Q4).

```ts
// before
.release(editorRef(T42))   // reads like Desk.saveTitle.release(), the wire control
// after
.detach(editorRef(T42))    // RENAMED
```

Rec. A. `release` already means "deliver held items" in every fake (2.10.4).

**Q5. What is a Story's plain `dispose(ref)`?**
A: `disposeActor`; `{ how: "forget" }` is `forget`; `how: "now"` is dropped. B: `how` becomes required.

```ts
// before
.dispose(ref)                    // kept the record of a busy actor: unreachable
.dispose(ref, { how: "now" })    // disposeActor
// after (A)
.dispose(ref)                    // disposeActor
```

Rec. A. One spelling per production call; amends W27's two values.

**Q6. Should busy delay a React local actor's disposal?** (Reopens "local actors keep React O3".)
A: no; its `InFlight` write continues as a lane and its ending is evidence. B: yes, React O3's disposal waits until
the local actor is not busy, so its follow-up runs (a failure toast after a form unmounts mid-submit).

```ts
const form = useActor(SubmitMachine);          // existing
// unmount mid-submit, then the server refuses:
// A: Refused is evidence; no toast          B: the form hears Refused, sends the toast, then goes
```

Rec. B. The same quiescence principle, and nothing else changes: a revealed Activity reattaches the live one.

## 10. Not resolved, or limits

- **Wake cost** is a decode per wake, unmeasured; a hot persisted actor that is evicted and woken repeatedly pays it
  each time. If measured too slow, keep the decoded value beside the encoded record (no behaviour change).
- **A `busy` schedule that re-arms forever** (Pay's `UNSURE.check` until the intent resolves) keeps its actor; that is
  what `busy` says. No check proves termination.
- **Gaps longer than the grace** for non-persisted actors (limit 1). The 100 ms is a guess about one commit plus a
  frame; only route-change tests can tune it.
- **Multi-tab** follower uses cannot be a Story today: Stories' tabs share only storage (Testing O7). They are browser
  tests (V-MT2) until the tab-coordination test Layer exists.
- **A host handle after eviction under Q2 B** would show `disposed` while the identity is dormant; only A makes host
  handles follow the identity.
