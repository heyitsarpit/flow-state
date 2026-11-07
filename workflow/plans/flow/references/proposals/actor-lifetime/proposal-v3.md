# Actor lifetime, version 3: alive while used or busy

Status: **PROPOSED**, 2026-11-07. Written from scratch against
[brief-runtime-owned.md](brief-runtime-owned.md); nothing here is decided except what the brief marks decided. Paths
are from the repository root; MD = `workflow/plans/flow/references/explorations/machine-fragments/machine-design.md`.
Code marks: **NEW**, **NEW MEANING**, **RENAMED**, **REMOVED**, existing, user-defined. **[P]** marks a call made here.

## 0. The rule in five lines

1. A shared actor lives while it is **used** or **busy**; once it is neither at the end of the current host task, it ends.
2. **Used**: an attached consumer, a `snapshots` subscription, a bound context consumer, or an attach in progress.
3. **Busy**: it has queued events, an `InFlight` write of its own, or an armed deadline whose event leads to work.
   **Work** is a write member (`commit`, `retry`, `cancel`) or a send to another actor, in that event's turn.
4. Ending keeps everything the Runtime already owns: write lanes, holds and parked endings (rule 44), and, for a
   persisted actor, its record, from which the next ensure or send restores it.
5. Which events lead to work is computed from the graph at compile time and shown by `flow explain`, Inspection
   (`uses.busy`) and Stories; the Runtime runs nothing for an absent actor that it did not already run.

**Public API added: none.** Removed: `retain` (decided). Changed meaning: `uses.busy` (decided field, content fixed
here) and Stories' plain `dispose(ref)`. Two names go to the user (Q1, Q2). Section 3 lists each change with the no-API
alternative.

## 1. Broad consequences first

**What is actually lost when an actor ends.** An actor is state, memory, activations, deadlines, activities, a mailbox
and the lanes it binds. Lanes are already the Runtime's (OD19): they outlive the actor, are persisted, and park their
endings (OD21, OD22). Activities are reads: a fresh session or lookup on return gives the same truth, and nobody is
looking meanwhile. State and memory of a persisted actor survive in its record. So the only things an early end can
lose are **inputs already on their way**: a deadline that will commit or retry (autosave, debounce, backoff), the
ending of a write already sent (which may start another write, Pay's chained steps, or send the Saved toast), and
events already queued. Endings and queued events are already finite and visible (lanes, mailbox). Deadlines are the
only part that needs a test, and the test is derivable from the graph, because every way a turn can touch the
outside is a declared member: `commit`, `retry`, `cancel` or `send` (rules 13, 21, 47; Runtime O4). A deadline whose
turn can do none of these (a poll's lookup, a toast's expiry) loses nothing when dropped: reads are obtained again
on return, and an overdue memory timer fires once when a record restores (Machines O5).

**Every in-flight write keeps its actor, not only those whose endings lead to work.** A filter by ending would let
a persisted actor end with a write on the wire, park its ending (OD21) and deliver it to the next incarnation as
adopted, current from its active leaf, where the live actor would have routed it current or late from its owner
(rule 14). Behaviour would depend on whether the actor ended (requirement 5). Waiting the few hundred milliseconds a
write takes costs less than a second routing path.

**Two ways to protect that class.** (a) Keep the actor until the class is empty. (b) End it and have the Runtime hold
its deadlines and wake it (restore it) when one falls due. (a) adds no state: an actor is alive or gone, the work is
done by the actor in ordinary turns, and traces show exactly that. (b) adds a third actor state (a record with live
deadlines), a Runtime timer table, a wake that is a **new incarnation** (so a held lane's `unknown { Restored }` is
delivered again and re-entering `UNSURE` restarts its 3 s resend, which a live actor would not do: behaviour would
depend on whether the actor was gone, against requirement 5), and it has no answer for non-persisted actors, which
have no record. (a) is taken. Its cost, an unused actor staying alive while busy, is bounded by the work itself:
in the apps the longest working deadline is the lock backoff (5 s doubling, five tries: 155 s in all), and writes end when their
adapters answer. (b) is kept as Q4 for long deadlines.

**Why "end of the current host task" is the grace.** React's Strict Mode cleanup and setup, and a route change that
swaps two screens on one actor, happen inside one commit, so a check after the task sees the new use. Gaps longer
than a task (a Suspense fallback on the network, Activity hiding) are not bridged by 100 ms either; the 100 ms caught
only gaps shorter than itself. A task boundary is a yield, which Stories already settle (MD 2.10.3: "a sleep of zero
or less is a yield... not a deadline"), so no Story ever advances time to see an actor end, and the core stays
clock-free: the check is a Runtime step the driver delivers after a yield. Q3 offers 100 ms instead.

**What changes for the rest of the system.** Nothing in machines, contracts or the turn. The compiler gains one derived
fact per event (`leadsToWork`), which tools read. The Runtime gains one step (`endCheck`), one disposal cause
(`Unused`) and, at ready, starts only restored actors that are busy (the rest stay records). Sends and handle sends
address the identity, so an ended persisted actor is restored by them. Hosts that ensured without subscribing now see
their actor end; that is the decided OD27 contract.

## 2. The rule in full (normative; becomes MD rule 73 and 2.7.17)

**R1. Scope.** Applies to shared actors (`actorRef`). Local actors follow React O3 (Q5 proposes the same rule for them).
Explicit `disposeActor`, `forget` and Runtime disposal are unchanged and ignore uses and busyness.

**R2. Uses.** A use is: an attached React consumer; a live `snapshots` subscription (host code, Flow's own `dehydrate`,
a multi-tab follower's mirror); a bound context consumer, live or busy; an attach in progress (a hook whose commit
effect has run and waits for readiness, lazy adoption or a disposing predecessor). Render registers nothing (React O2);
`ensureActor`, lookup, `getSnapshot` and sends are not uses.

**R3. Leads to work** (compiled). For each event `E` a definition or fragment declares: `E` **leads to work** if some
transition that handles `E`, anywhere in the machine, has in its turn (its actions, raises, notifies and exits, and the
host transitions those reach, rule 7) a write member (`commit`, `retry` or `cancel` of a transaction or domain write)
or an action `send`, or enters a node that declares a **working schedule**. A schedule is **working** if its `send`
event leads to work. The relation is a least fixed point over the compiled graph; it over-approximates (any branch
counts), which can only keep an actor longer, never lose work. Lookups, reads and stream deliveries are never work:
their answers are obtained again on return. **Schedules are owed work; activities are not**: a write that must go on
while the actor is shown (a lease renewal, a heartbeat) belongs in an activity's session, which ends with the actor,
and a schedule that writes is something the actor owes.

**R4. Busy.** A live actor is busy while any of these holds:
1. its mailbox or follow-up deliveries are not empty, or a turn is running;
2. a working schedule has an armed deadline (per key for a keyed schedule), overdue included;
3. a write lane bound to a live incarnation of it (rule 53) is `InFlight` (waiting to be invoked or on the wire).

A `Held` lane (with or without waiting commits: it moves only in a turn), a parked ending for an unplaced path, an
armed non-working schedule, a running activity and a one-off lookup do not make it busy. `uses.busy` (Inspection)
lists the items above by address (rule 65).

**R5. The end check.** Whenever a shared actor becomes unused, is installed with no use (host ensure, restore,
hydration, a restore by send), or finishes a turn or lane step while unused, the core returns an `endCheck` effect
carrying the actor's use generation. The driver delivers it as a Runtime step after a yield (the end of the current
host task). If the generation is unchanged and the actor is live, unused and not busy, it **ends**: a disposal with
cause `Unused`, through Runtime O6's sequence (non-working schedules cancel, activities stop, the terminal snapshot is
published). A use or send in between bumps the generation or makes it busy, and the check does nothing.

**R6. What ending keeps.** The actor's write lanes stay the Runtime's (rule 44): sent, held and queued writes go on,
their endings apply to the lane. For a persisted actor, the record is encoded into the Runtime's copy at the end
step, before cleanup (so an actor that ends before its first 5 s capture loses nothing within the Runtime), and
any ending that reaches the identity afterwards parks on it (OD21; within a Runtime only an unplaced path's lane can
still produce one, since an `InFlight` lane keeps its actor). If the record cannot be encoded, the last good record stays and the
codec's diagnostic is published (Persistence O5). For a non-persisted actor, nothing of its memory is kept; endings
for it are evidence, including endings parked for an unplaced path at the end step (closes rule 44's silence).

**R7. Return.** `ensureActor`, an attaching hook, an action `send` and a handle `send` address the identity. If the
actor is live they reach it. If it ended and has a Runtime record, the Runtime restores a new incarnation from that
record (never from storage, R10 M5), with rule 44's deliveries, then the ensure returns it or the event is queued
after those deliveries. An ensure with no record creates from input. A send with no record, or with a record that no
longer decodes, is dropped as `SendTargetAbsent` with its reason (section 6). An ensure over a record that no longer
decodes discards that record with `RestoreDiscarded`, adopts the identity's lanes (they decode alone, rule 46) and
creates from input. A quarantined ref reports its failure (Runtime O6), as today.

**R8. Restore at ready.** Restored records are validated as today (Persistence O5). A restored actor **starts live**
only if it would be busy: an armed working deadline, or a pending delivery (a parked ending, a `NotSent { Restored }`
or a held lane's `unknown { Restored }`) whose event leads to work. The others stay records until their first ensure or
send. Each started actor is then checked by R5 like any other.

**R9. Pre-attach reads.** Before attachment, an ensuring hook's handle reads the live actor if there is one, else the
Runtime's record for the identity (decoded once per record revision, pure, no registration), else `initial(input)`
(React O2). So a quick return to an ended persisted actor shows its memory, not `initial`.

**R10. Visibility.** Every transition of this rule is evidence: `actorEnded { cause: "Unused", uses, busy: [] }`,
`actorRestored { by: "ensure" | "send" | "ready" }`, and each `endCheck` that found the actor busy names what. The
compiled `leadsToWork` and working flags are printed by `flow explain` per event and schedule ("autosave keeps the
actor busy: AutosaveDue commits save"). A Story's checkpoint shows `uses` and `busy`.

## 3. Public API changes

| Change | Kind | Why it survives | Rejected no-API alternative |
| --- | --- | --- | --- |
| `retain` on `actorRef` | **REMOVED** (decided, OD27) | guessed number in user code | n/a |
| `uses.busy` in Inspection | decided field, **content fixed**: a list of addresses (R4) | tools must show why an unused actor lives | a boolean: hides which deadline or write; rejected for requirement 8 |
| `SendTargetAbsent` reasons | decided three; Q2 proposes `NoRecord` **in place of** `NotPersisted` (no count change) | a persisted ref never created, or explicitly disposed, has no record; `NotPersisted` would lie | keep `NotPersisted` for both: misleading for a persisted ref |
| Stories `ensure(ref)` | **NEW MEANING**: attaches one use, as a mounted screen does | Stories must reach "unused" the way production does | ensure not a use: then nothing in a Story could end an actor except `dispose`, which skips the busy test |
| Stories end-a-use step | decided as `Story.release(ref)`; Q1 proposes **RENAMED** `detach(ref)` | the only way to model an unmount | reuse `dispose(ref)`: it would mean "maybe disposed", against its name |
| Stories `dispose(ref)` plain form | **NEW MEANING**: `disposeActor` (was the record-keeping dispose; reopens 2.7.17's "`dispose(ref)` keeps its meaning", Q1); `{ how: "now" }` **REMOVED** as redundant; `{ how: "forget" }` kept | the record-keeping dispose of a busy actor is unreachable in production | keep it: Stories would reach states production cannot (requirement 8) |

Not added, each considered: a keep-alive option or hook (an app keeps an actor by using it: hold the hook in a layout,
or subscribe from host code); a "wake" option on schedules (R3 derives it); a per-schedule `background: true` flag
(the graph already knows; a flag can disagree with it); a `NoRecord` sixth word beside `NotPersisted` (Q2 replaces
instead of adding); a Testing step to advance the grace (the grace is a yield).

## 4. Actor states, what each holds, what frees it

| State | Holds in memory | Left by |
| --- | --- | --- |
| **Live, used** | the whole actor: state, memory, activations, deadlines, activities, mailbox, subscriptions; its lanes are the Runtime's | the last use ending (R5 check queued) |
| **Live, unused, busy** | the same; `uses.busy` non-empty | the last busy item clearing; then R5 |
| **Live, unused, checking** | the same plus one queued `endCheck` (one yield) | a use or send (stays live), or the check (ends) |
| **Disposing (cause `Unused`)** | terminal snapshot; activities and sessions stopping | cleanup done; a failure quarantines (Runtime O6) |
| **Ended, persisted** | the Runtime's encoded record copy, its lane records and parked endings; the stored record | ensure or send (restore); `disposeActor` (record removed, lanes kept, rule 46); `forget`; scope dispose; version change |
| **Ended, non-persisted** | nothing of the actor; its non-`Idle` lanes, unbound, until they resolve (rule 44) | lanes resolve or Runtime disposal |
| **Record at ready, not started** (R8) | as ended, persisted | as ended, persisted |
| **Quarantined** | the ref's failure and Cause | Runtime disposal |
| Never ensured | nothing | — |

Freed memory per ended actor: everything but the record copy (bounded by Persistence O3: 4,096 records, 16 MiB per
scope, dormant records included) and its unresolved lanes (each a real write the UI may show, rule 21, no cap).
A pre-attach handle's decoded record (R9) lives on the handle and goes with the component.

## 5. Leaks considered

| Candidate | Outcome |
| --- | --- |
| Presence, feeds, rosters: activities and stream reconnects | not busy (R4): they end at the task's end and release their sessions |
| Polls and endless re-arming schedules (`Schedule.spaced` polls, Pay's 3 s check) | non-working: not busy; dropped at the end, fired once if overdue on restore |
| `Held` lanes, a never-resolving unknown | not busy: the hold is the Runtime's (rule 44) and listed by `unsettledWrites()` |
| UI timers (toasts, fades, badges, countdowns, 3-D Secure's give-up) | non-working unless their turn writes or sends |
| A pending ensure from a discarded render | impossible: only a commit effect registers an attach (R2) |
| A working schedule that re-arms forever (an unbudgeted retry) | busy forever, exactly as a used actor retries forever; visible in `uses.busy` and traces. Limit, section 13 |
| A write whose adapter never settles | busy until it settles, as a live screen would wait; Runtime disposal bounds it (Runtime O6); adapters own timeouts (rule 25) |
| A follower that never re-attaches after a handover | nothing waits for it (section 8) |
| Records of ended persisted actors | bounded by Persistence O3 |
| Unbound lanes of ended non-persisted actors | each a real unresolved write, listed by Inspection; already so today |
| Context providers | used while a consumer is bound; a busy consumer stays bound, so its provider stays |

## 6. Sends to absent actors

| Target, at the send | Action `send(ref, e)` and handle `send(e)` |
| --- | --- |
| live, or disposing explicitly | as Runtime O4 (delivered; explicitly disposing drops `SendTargetAbsent`) |
| ending implicitly (R5 passed, cleanup running), persisted | queued for the next incarnation, which is restored after cleanup, as an ensure during disposal (Runtime O3) |
| ended, persisted, record decodes | restored from the Runtime record (R7), event queued after rule 44's deliveries; the restored actor is unused and checked by R5 after its turns |
| ended, record does not decode | dropped, `SendTargetAbsent { reason: "RecordUndecodable" }`; the record stays for an ensure to discard |
| absent, no record (non-persisted, never created, explicitly disposed or forgotten) | dropped, `SendTargetAbsent { reason: "NoRecord" }` (Q2; decided text says `NotPersisted`) |
| lazy entry not adopted | dropped, `SendTargetAbsent { reason: "NotAdopted" }` (LazyFeatures O2 unchanged: a send never adopts) |

A send never creates (it carries no input). Restoring from a record is not creating: it is the same rule an ensure
follows, and the record already holds memory and state. This amends LazyFeatures O2's phrase "never adopts or creates
its target" to "never adopts a lazy entry or creates an actor; it may restore one from its record". A handle send
addresses the identity, not the incarnation, so a host's stale handle after an implicit end behaves as an action send;
after an explicit `disposeActor` the record is gone and the send drops `NoRecord`, which is React O3's "dropped as
`SendTargetAbsent`" with a reason.

## 7. The cases

### 7.1 The editor's autosave (persisted, per ticket)

```ts
// BEFORE: features/Tickets/editor/editor.ref.ts
export const editorRef = (ticket: TicketKey) =>                     // user-defined: editorRef, TicketKey
  actorRef(EditorMachine, ticket, {                                 // existing: actorRef (value-named, OD30)
    persist: true,                                                  // existing
    retain: "10 minutes",                                           // REMOVED: retain
  });

// AFTER
export const editorRef = (ticket: TicketKey) =>
  actorRef(EditorMachine, ticket, { persist: true });
```

The user types, closes the panel 1 s later. Uses drop to 0. R4: `EDITING.autosave` is working (`AutosaveDue` commits
`save`), its deadline is armed, so the editor is **busy**. At 2 s it fires; the turn commits; the lane is `InFlight`,
so it stays busy. `Saved` lands in the same incarnation, routed from its owner as if the panel were open, and sends
`toastSaved`; no working deadline is armed: R5 ends it, the record is encoded. The per-field `settle` (800 ms, raises `Flush` into
the `Autosave` copy, which commits) and `Autosave.resend` (2 s, armed by `Unsure`, retries) are working too, so an
unsure field save re-sends its three times and then cancels before the editor ends. `LOCKED.retry` (backoff) keeps it
for at most 155 s (`MAX_LOCK_RETRIES` is 5). Reopening the ticket within the Runtime restores from the record (R7), shows it before
attach (R9). Trace: `actorDetached`, `endCheck { busy: [{ schedule: "autosave" }] }`, the turns, `actorEnded { cause:
"Unused" }`. Nothing is lost or repeated and no number is in user code.

### 7.2 Checkout in 3-D Secure (persisted singleton)

```ts
// BEFORE and AFTER: checkout/features/Pay/pay.ref.ts, unchanged
export const payRef = actorRef(PayMachine, "checkout", { persist: true });   // existing; never had retain
```

Before, `payRef` had no `retain`, so it lived forever. After: the checkout page in a background tab is still mounted,
so Pay is used and nothing changes. If the shopper navigates away while the confirm is on the wire, the lane is
`InFlight`, so Pay stays busy until the confirm ends, runs the chained step (`Confirmed` commits `place`), stays
busy while `place` is on the wire, then ends. If the confirm comes back unknown, `PayUnsure` enters `UNSURE`, whose `check` schedule only
looks up (non-working): Pay ends with the hold in the Runtime. On the shopper's return (or a reload) the record
restores, `unknown { Restored }` re-enters `UNSURE`, the overdue check fires once, and the reconcile resumes. Nobody
polls Stripe for an absent page. Note: `Confirmed` with `requires_action` commits `authenticate` while unused; an
adapter that needs a mounted bank frame must fail it, and Pay models a shopper who leaves with `LEFT` (limit, 13).

### 7.3 Presence (not persisted)

```ts
// BEFORE: features/Presence/presence.ref.ts
export const presenceRef = (ticket: TicketKey) =>
  actorRef(PresenceMachine, ticket, { retain: "15 seconds" });      // REMOVED: retain
// AFTER
export const presenceRef = (ticket: TicketKey) => actorRef(PresenceMachine, ticket);
```

Presence has no schedules; its only write, `ping`, keeps it for one round trip at most. The panel closes: at the end
of the task (or of a `ping` on the wire) Presence ends and its two sessions release, so other users stop seeing a viewer who left
(the 15 s lie is gone). Two screens of one ticket swapped in one commit keep it. A loading gap between them (separate
commits) leaves and rejoins: lift the hook into the ticket's layout to keep it (section 13).

### 7.4 The queue on a server page

```tsx
// BEFORE and AFTER: dispatch-desk/next/app/desk/[workspace]/page.tsx, unchanged
const payload = await dehydrate(
  deskServerSetup(user),                                                       // user-defined
  (runtime) => {
    runtime.ensureActor(SessionRef, { input: { userId: user.id } });          // existing: a literal-named singleton
    runtime.ensureActor(queueRef({ workspaceId }));                           // existing (OD30 value ref)
  },
  { within: "1500 millis" },                                                   // existing: dehydrate's bound, not a lifetime
);
```

`dehydrate` is host code: it holds a `snapshots` subscription on each shared actor present after `prepare` until it
captures (R2), so the queue's lookups finish under ServerRendering O2 and nothing ends mid-load. Inspection shows the
subscription as dehydrate's. On the client, `Hydrate` installs the queue; `QueueClient`'s hook attach is in progress
(a use) before the payload applies, so it is kept. When the user leaves the desk, the 30 s poll (non-working) does
not keep it: the queue ends.

### 7.5 A toast

```ts
// BEFORE and AFTER: features/Toasts/toasts.ref.ts and ToastStack.tsx, unchanged
export const ToastsRef = actorRef(ToastsMachine, "toasts");                   // existing
const toasts = useActorByRef(ToastsRef, {});                                  // existing: the stack is always mounted: a use
```

`SHOWING.expire` changes memory only: non-working. The editor's `toastSaved` (a send) is work, so the editor waits
for `Saved` to send it even after its panel closed (7.1). If no stack is mounted, the toasts actor ends at the task's
end and a send to it drops `NoRecord` (non-persisted), on the sender, never rolling back its turn (Runtime O4).

### 7.6 A local actor (React O3; Q5)

```tsx
// a dialog's local draft with an autosave schedule
const draft = useActor(DraftMachine);                     // existing: one local actor per component incarnation
// TODAY (React O3): unmount → 100 ms grace → disposed, even with `autosave` armed: the save is lost.
// Q5 A: unmount → R4/R5 as for shared actors → the armed autosave fires and its write's endings run, then it ends.
```

Local actors cannot be sent to or persisted; their lanes are adopted by (machine, input) on remount (2.7.13), so a
reopened dialog sees the held save as `unknown { Restored }` either way. Q5 decides only whether the debounce fires.

### 7.7 A Story

```ts
// BEFORE: features/Roster/roster.story.ts, mergeOutlivesScreen
  .send(North, E.MERGING.Pick({ survivorId: "acme" }), E.MERGING.Confirm())
  .dispose(North)                                    // existing: record-keeping dispose of a busy actor
  .advance("2 minutes")                              // the retain expires
  .checkpoint("leftMidMerge")
  .world(Desk.mergeCustomers.release())              // existing: the fake's wire release
  .ensure(North)
  .checkpoint("mergeAdopted");

// AFTER
  .send(North, E.MERGING.Pick({ survivorId: "acme" }), E.MERGING.Confirm())
  .detach(North)                                     // NEW (decided as `release`, Q1 renames): the screen unmounts
  .checkpoint("leftMidMerge")                        // North is live, unused, busy: [{ lane: { operation: "merge" } }]
  .world(Desk.mergeCustomers.release())              // unchanged; no collision with `detach`. The answer reaches the
                                                     // live North, which sets its notice and ends in this step's settle
  .checkpoint("mergeDone")                           // user-defined: North ended, record encoded with the notice
  .ensure(North)                                     // NEW MEANING: attaches a use; restores the record
  .checkpoint("mergeShown");

// "the answer lands with no actor" (parked for the identity, OD21) is now a reload, as in production:
  .detach(North)
  .reload()                                          // existing: the tab dies with the merge on the wire
  .world(Desk.mergeCustomers.release())              // the server applied it; the client sees unknown { Restored }
```

The old Story ended a busy actor and kept its record, which production cannot do. In production a screen that
leaves mid-merge leaves the merge's answer to the live actor; only a reload or Runtime disposal parks it.

### 7.8 The other cases

| Case | What happens |
| --- | --- |
| Multi-tab, Persistence O7 (current plan) | the second tab runs without persistence; uses are per Runtime; nothing new |
| Multi-tab, `multi-tab.md` (proposal) | a follower's attached mirror is a use in the leader (its forwarded subscription), ended by detach or by its presence lock's grant; at handover the new leader restores as R8 (busy ones live), followers re-send `Ensure` (an attach in progress); no one waits for a follower |
| A long upload | `put` is `InFlight`, and its `Unsure` arms the working `resend`: the editor stays busy, activities included, for the upload and its re-sends, then ends; removing the copy releases the lane (rule 60) and ends that |
| A chained write | 7.2: the first write is `InFlight` (R4.3), so its successor is committed by the same incarnation before the end |
| A never-resolving unknown | `Held`: not busy; the actor ends; the hold waits in the Runtime and is redelivered as `unknown { Restored }` on return |
| Restore at reload | a dirty field's overdue `settle` is working: the editor starts live (R8), flushes, waits for `Saved`, ends; editors with nothing owed stay records |
| Strict Mode | cleanup then setup in one commit: the check after the task sees the use |
| Activity hiding, Suspense fallback | uses end; persisted actors restore from the record on reveal; non-persisted restart (section 13) |
| Host code | `host.ts`'s bare `ensureActor` calls now end at the task's end unless busy; the host keeps one with `snapshots` (decided) |

## 8. Persistence and restore, issue by issue

- **Quick re-use** of an ended persisted actor restores from the Runtime copy synchronously (decode only); R9 shows
  the record before attach. A non-persisted one starts from `initial` (section 13).
- **Ended before the first capture**: R6 encodes into the Runtime copy at the end step; storage gets it at the next
  write; a crash before that loses at most what any crash loses (Persistence O3).
- **Restored at ready with nothing owed**: stays a record (R8). Restored schedules fire once if overdue when the
  record starts (Machines O5, unchanged).
- **Undecodable record**: ensure discards it and creates (R7); send drops `RecordUndecodable`.
- **Endings parked for a path of a non-persisted shared actor at its end**: evidence (R6), as rule 44 says for "no
  record"; a persisted actor keeps them on the lane record.
- **Restore cost**: one Schema decode per return, synchronous; not measured (section 13).

## 9. Stories, suite and tools

- **Steps.** `ensure(ref)` attaches one Story use; `detach(ref)` ends it (`ActorNotUsed` if this Story holds no use
  of it, a Story-level read error); both settle, and the settle includes the yield, so an actor that is not busy has
  ended by the step's cut. `dispose(ref)` is `disposeActor`; `{ how: "forget" }` stays. `openTab(name, { from })` and
  `reload` re-attach the uses the closed tab's Story held, in first-ensure order (2.10.10's list, now "ensured and not
  detached or disposed"): a defined model of the screens mounting again, replacing the prototype harness's ad hoc
  re-attach.
- **Reachability.** Every Story lifecycle now goes through R5, so a Story cannot end a busy actor and keep its record.
  The R9 H1 walk's Runtime disposal stays the policy suite's `disposeRuntime` (unchanged).
- **Property tests** generate `detach` and `dispose` instead of the record-keeping `dispose`; a `detach` of a ref the
  candidate does not hold shrinks away (it is a Flow read error, MD 2.10.16).
- **The 22 suite cases** that use the record-keeping `dispose(ref)`, each rewritten by what its scenario needs:
  (a) "the answer lands with no actor, parked for the record" → `reload` mid-write (persisted), or `dispose(ref)`
  when the case asserts evidence; (b) "rebind adopts a held lane" → `detach(ref)` then `ensure(ref)` (a hold is not
  busy, so the actor ends); (c) "the screen leaves mid-write" → `detach(ref)`, asserting the actor stays busy and the
  ending reaches the same incarnation (7.7); (d) "explicit end" → `dispose(ref)`. A new mechanical check in the suite: no Story ends an actor
  whose last checkpoint `busy` was non-empty.
- **New suite cases**: autosave survives close (7.1); chained write after close (7.2); presence ends at once (7.3);
  dehydrate keeps prepared actors (7.4); reload starts only busy records (R8); send restores an ended persisted
  target and drops `NoRecord` for a non-persisted one; a use and detach in one task (Strict Mode) keeps the actor;
  `leadsToWork` fixed point over raises, exits and keyed schedules, compared against `flow explain`.
- **`flow check`**: no new finding. **`flow explain`** prints each event's `leadsToWork` and each schedule's
  working flag with the path that makes it so. **Inspection**: `uses` as decided, `busy` per R4.

## 10. Replacement text for MD

**Rule 73**, replace in full:

```text
73. **A shared actor lives while it is used or busy** (OD27, amended by OD31; 2.7.17). A use is an attached
    consumer, a live `snapshots` subscription (host code, `dehydrate`, a follower's mirror), a bound context
    consumer, or an attach in progress; render, `ensureActor`, lookups and sends are not uses. An actor is busy while
    its mailbox is not empty, a write lane it binds is `InFlight`, or a working schedule has an armed deadline. An
    event leads to work when a transition handling it commits, retries, cancels or sends to another actor in its
    turn, or enters a node with a working schedule; a schedule is working when its event leads to work (computed at
    compile time, shown by `flow explain`). `Held` lanes, activities, lookups and other schedules never make an actor
    busy. Once an actor is unused and not busy at the end of the current host task, it ends with
    cause `Unused`. Ending keeps the Runtime's lanes (rule 44) and, for a persisted actor, its record, encoded at the
    end; an ensure or send restores from that record. A send with no record drops `SendTargetAbsent` with its reason.
    At ready only restored actors that would be busy start live. Local actors follow React O3.
```

**2.7.17**, replace the section body with sections 1 (two paragraphs: what is lost, why (a)), 2 (R1–R10), 4 (the
table) and 6 (the send table) of this proposal, under the heading `#### 2.7.17 Actor lifetime: alive while used or
busy`.

**Rule 44**, replace the sentence "Implicit disposal never happens while a lane of the actor is `InFlight` or has
waiting commits (rule 73); a `Held` lane is handed off by this rule." with:

```text
An actor ends implicitly only when it is not busy (rule 73): an `InFlight` lane keeps it, so a sent write's ending
reaches the incarnation that sent it; a `Held` lane, with or without waiting commits, is handed off by this rule. At an implicit end, endings parked for an
unplaced path stay on the lane record of a persisted identity and are evidence otherwise.
```

**2.10.10**, replace from "Rebind is `dispose()` then `ensure()`;" to the end of that sentence about `forget` with:

```text
A Story's `ensure(ref)` attaches one use, as a mounted screen does, and `detach(ref)` ends it; the step's settle
includes the end-of-task check, so an actor that is not busy has ended at the step's cut, and a busy one stays
until its work is done (rule 73). Rebind is `detach(ref)` then `ensure(ref)`; `dispose(ref)` is `disposeActor`, and
`{ how: "forget" }` is `forget` (STR9, STF43). `openTab({ from })` re-attaches the uses the Story held there.
```

**2.10.1 table** (`Story.app` row): `dispose(ref, { how? })` → `detach(ref)`, `dispose(ref, { how? })`; the steps
table's `ensure`, `dispose` row adds `detach`. **2.10.2** line "the lifecycle command, as a host would issue it": add
"`ensure` and `detach` as a mounting and unmounting screen".

**Decision entry**, after OD30:

```text
- **OD31** Actor lifetime, version 3 (proposal-v3.md): a shared actor lives while used or busy; busy is derived from
  the graph (an event leads to work when its turn commits, retries, cancels or sends); the grace is the end of the
  current host task; ending keeps lanes and the persisted record; sends and handle sends restore from a record; at
  ready only busy records start. Answers to Q1–Q5 recorded here. (PROPOSED)
```

**C rows** (section 5): replace OD27's C104–C111 in place, and add C123–C124 after C122:

| Row | Plan | Change |
| --- | --- | --- |
| C104 | Runtime O3 | replace the `retain` paragraph with rule 73's text; drop `retain` from `actorRef`'s options; `ConflictingActorRef` covers `persist` and `context` |
| C105 | Runtime O4, O6, LazyFeatures O2 | sends (action and handle) address the identity and may restore from a record, never create; a disposing persisted target queues; reasons per section 6; disposal cause `Unused`; LazyFeatures O2's "never adopts or creates its target" → section 6's wording |
| C106 | Persistence O3, O4 | "a persisted actor whose retain expired keeps its saved record" → "an actor that ended unused keeps its record, encoded at the end"; O4 "Their retain clock starts at ready" and "restored stable actors are active" → R8 |
| C107 | ServerRendering O1, O5 | `dehydrate` holds a `snapshots` subscription on each shared actor present after `prepare` until capture; a hydrated actor with no attach in progress ends at the task's end unless busy |
| C108 | React O2, O3 | pre-attach reads per R9; "retention follows Runtime O3" and "Shared refs with retain are the way to keep state across hiding" → "a persisted ref keeps memory across hiding; a use higher in the tree keeps the actor"; V4 drops "retention" |
| C109 | Runtime V4 | "retain expiry on the TestClock" → "an unused actor ends at the task's end unless busy; Strict Mode in one task keeps it; a working deadline and an `InFlight` lane keep it" |
| C110 | Testing O7 (Stories) | `ensure` attaches a use; `detach(ref)` ends it (Q1); `dispose(ref)` is `disposeActor`; `openTab({ from })` re-attaches the Story's uses |
| C111 | Inspection | `uses: { consumers, subscriptions, contexts, pendingEnsures, busy }`, `busy` a list of addresses (R4); evidence `actorEnded`, `actorRestored`, `endCheck` |
| C123 | Machines, CommandLine | the compiled `leadsToWork` relation and working schedules (R3) in the internal representation; `flow explain` prints them |
| C124 | `multi-tab.md` 5.3, V-MT2 | "`retain` counts attachments in every tab" → "a follower's attachment is a use in the leader"; a new leader waits for no follower (7.8) |

Reference apps (after acceptance): drop `retain` in `editor.ref.ts`, `roster.ref.ts`, `presence.ref.ts`,
`assistant.ref.ts`; `app/host.ts` keeps its editor with the `snapshots` subscription it already has and stops relying
on bare ensures; `roster.story.ts` and `desk.story.ts` as 7.7; `REWRITE-PLAN.md` lines on `retain`.

## 11. Issue by issue

| Issue (brief) | Answer |
| --- | --- |
| The default flips | a shared actor lived forever without `retain`; now it lives while used or busy (R5). An app keeps one by using it (a hook in a layout, a host `snapshots` subscription); a persisted one keeps its memory regardless |
| "After the React commit" undefined | not used: the check is a Runtime step after a yield, the same in React, headless hosts and Stories (R5) |
| Restored and hydrated actors have no uses | R8 starts only busy records; hydrated actors are kept by attaches in progress (R2) or end |
| Pending ensure as a use vs React O2 | only an attach registered by a commit effect counts (R2); discarded renders register nothing |
| Strict Mode, route changes, the 100 ms guess | one-commit swaps survive a yield; the guess is gone (Q3) |
| Gaps longer than the grace | stated limit; persisted actors restore, non-persisted restart (13) |
| Restore cost | one decode per return, unmeasured (13) |
| Presence alive forever via activities | activities never make an actor busy (R4) |
| Counting `Held` or every schedule | neither counts; only working schedules (R3) |
| Never-resolving unknown | `Held`: not busy (5) |
| Endless re-arming schedule | non-working: not busy; working: busy as a live actor would be, visible (5, 13) |
| Debounce and autosave within their delay; timed re-sends; lock backoff | working schedules (7.1) |
| Chained steps | R4.3 (7.2) |
| Reactions while away | a send is work (7.5) |
| Finite lookups in progress (server page) | `dehydrate` holds a use (7.4); on the client, lookups are reads |
| `dehydrate` loses actors | 7.4 |
| Send to an absent target: restore or drop | restore from a record, never create; drop with a reason (6) |
| Send to a disposing target; handle vs action sends; never-created persisted target | 6: implicit ending queues for the next incarnation; both send kinds address the identity; `NoRecord` (Q2) |
| Re-use shows `initial` | R7 restores at once, R9 reads the record before attach |
| Disposed before first capture | R6 encodes at the end |
| Restored at `ready` with nothing pending | stays a record (R8) |
| Ensure over an undecodable record; remount after quarantine | R7 |
| Parked endings of a non-persisted actor at its end | evidence (R6), rule 44 text (10) |
| Stories' record-keeping `dispose` | gone; `detach` + R5; 22 cases by category (9) |
| Harness re-attaching uses after reload | `openTab({ from })` re-attaches the Story's uses, defined (9) |
| `Story.release` collides with fakes' `release()` | Q1: `detach` |
| R9 H1 walk relies on Runtime disposal | unchanged, policy suite (9) |
| Remote uses and a new leader race; waiting forever; untestable follower uses | no waiting (7.8); under the current plan there are no follower uses; `multi-tab.md`'s test Layer covers them if it lands |
| Places still describing `retain` | C104–C111, C123, C124 and the app list (10) |

## 12. Where this differs from the prior art (read after the draft above was written)

Prior art read: MD rule 73, 2.7.17 and OD27 as they stand; [proposal.md](proposal.md); [proposal-v2.md](proposal-v2.md).
One change was made after reading: the first draft counted an `InFlight` lane as busy only if its operation's
endings led to work; it now counts every `InFlight` lane, as rule 73 and v2 do, for the routing reason in section 1
(found on re-reading rule 14 beside rule 73, not taken on authority). Everything else below is a comparison.

| Topic | Current rule 73 / 2.7.17 (OD27) | proposal.md | proposal-v2.md | This proposal | Why |
| --- | --- | --- | --- | --- | --- |
| Shape | uses include mail and lanes | everything is a use, schedules and `Held` included | uses vs busy | uses vs busy (as v2) | an observer and owed work end differently |
| Schedules | not uses; the record keeps deadlines | every armed schedule is a use | `busy: true` per schedule (**new API**, Q1 A) plus `ScheduleNotBusy` info | **derived**: a schedule whose event leads to a write or send is working | the user's constraint; the graph already knows; a flag can disagree with the code it sits on. v2's objection (a resend and a lease renewal look the same) is answered by the line schedules owe, activities do not: a renewal belongs in a session (R3) |
| `InFlight` lanes | a use, and waiting commits too | a use | busy; `Held` with waiting commits is not | busy; `Held` with waiting commits is not (as v2) | a held head moves only in a turn |
| Finite lookups | not uses | uses | busy | **not busy**; `dehydrate` holds a subscription | reads are obtained again on return; v2's reason (the result lands in the record) is a cache benefit, not lost work, and a hung lookup would keep v2's actor |
| Pending ensure | a pre-attach handle (render) | — | commit-time attach | commit-time attach (as v2) | React O2 |
| Grace | React O3's 100 ms, Runtime Clock | "after the React commit" | 100 ms, Runtime Clock | **end of the current task** (a yield; Q3) | no constant, no Story `advance`, the core needs no deadline; 100 ms bridges only shorter gaps |
| `dehydrate` | (gap) | — | prepare's ensures are uses until disposal | dehydrate is host code holding `snapshots` subscriptions until capture | the same effect through a decided use kind, no new kind |
| Restore at ready | restored actors start the grace at ready | — | activate only with work | activate only if busy, where a pending delivery counts only if its event leads to work | a held lane whose `unknown` handler only sets a notice need not open activities at page load |
| Dormant / ended | "the Runtime's copy" | record kept | dormant record in the capture; eviction **postponed** while it cannot encode | record encoded at the end; if it cannot encode, the last good record stays and the actor ends | a bad value should not make an actor immortal; a reload would see the same last good record |
| Handle reads after end | — | — | the handle follows the identity (reads the dormant record) | the handle reads its terminal snapshot; sends follow the identity | one snapshot stream per incarnation (Runtime O4's "completes only at disposal" stays true) |
| Send to a disposing target | queues for the next incarnation | — | no window; dropped | persisted: queued (the record is encoded before cleanup); non-persisted: `NoRecord` | v2's worry (a queued event reaching `initial`) applies only to non-persisted, which drops |
| Non-persisted endings with no actor | evidence | — | parked on the Runtime's lane record for the next incarnation (P4) | evidence (rule 44 unchanged) | an `InFlight` lane keeps its actor, so only unplaced-path endings reach this; their memory effect is gone with the actor anyway, and the hold itself stays on the lane |
| Reasons | three, with `NotPersisted` | — | four, adds `NoRecord` | three, `NoRecord` **replaces** `NotPersisted` (Q2) | fewer words; the reason is "nothing to restore from" in all four cases |
| Stories | `Story.release(ref)`; `dispose(ref)` keeps its meaning | — | `detach`; `dispose` = `disposeActor` | the same as v2 (Q1), plus `reload` as the production path to parked endings | requirement 8 |
| Local actors | React O3 | — | Q6, rec. busy delays disposal | Q5, rec. the same rule | one rule |
| Multi-tab | a new leader waits one grace after followers re-attach | — | waits for no one | waits for no one (as v2) | a wait with no end |
| Wake | — | — | dormant records "wake": restore on ensure, send, or a waking consumer's binding | restore on ensure or send; a consumer binding is an ensure of its provider | same mechanism; no new word |

Where the brief's suggested idea (the Runtime keeps a persisted actor's armed schedules and wakes it at the deadline)
went: section 1 (b) and Q4. It is the only design that frees memory during a long owed deadline, and it costs a
third actor state, a new-incarnation firing (behaviour that depends on the end) and no answer for non-persisted
actors. No app needs it today.

## 13. Limits

- **A gap longer than one task restarts a non-persisted actor** (Suspense fallback on the network, Activity hiding,
  `loading ? <Spinner/> : <Panel/>`): fresh memory and a fresh read (resource data stays in the store under its
  `gcTime`). Remedy: persist the ref, or hold the hook in a component that stays mounted.
- **A busy actor keeps its activities running** while unused (the editor's ticket subscriptions during a long upload).
  One meaning of "live" is kept on purpose; presence-like signals belong in their own actor, as the apps do (Q4 notes
  the alternative).
- **A working schedule with no budget, or a working deadline far away, keeps its actor alive** until it fires or stops.
  No app has one beyond the editor's 155 s of lock backoff. `uses.busy` and `flow explain` show it.
- **Over-approximation**: an event that leads to work on one branch counts on all, so an actor may stay a little longer
  than strictly needed (Pay's `PayUnsure` from `LEFT` only sets a notice, but the event leads to work elsewhere).
- **A write that needs the user's eyes** (3-D Secure's challenge) can be committed by an unused, busy actor; its adapter
  must fail when no frame is mounted, or the machine must model leaving (Pay's `LEFT`).
- **Stream deliveries are never work**: a stream message that must cause a write while nobody watches is the server's job.
- **Non-persisted endings at the end** (parked for an unplaced path, or landing later) are evidence; a persisted identity
  is the remedy, as rule 44's G4 says for local actors.
- **Restore cost** (one decode per return) is unmeasured; the prototype's record codec is the place to measure it.
- **The grace as a yield** relies on React running Strict Mode's and a one-commit swap's cleanup and setup in one task;
  React 18 and 19 do. If a router splits them, Q3 B is the fallback.

## 14. Open questions

**Q1. The Story step that ends a use.** A: `detach(ref)` (React O3's own word: hooks attach and detach). B: keep the
decided `release(ref)` beside the fakes' `release()`. Rec. **A**: one word, no collision, matches attach.

```ts
.release(North).world(Desk.mergeCustomers.release())   // B: two meanings of release in two lines
.detach(North).world(Desk.mergeCustomers.release())    // A
```

**Q2. The reason for a send with nothing to restore.** A: `NoRecord` replaces `NotPersisted` (covers non-persisted,
never created, disposed, forgotten). B: keep `NotPersisted` and add `NoRecord` (four reasons). C: keep the decided three
and report a never-created persisted target as `NotPersisted`. Rec. **A**: same count, says what is true.

```ts
SendTargetAbsent { reason: "NotPersisted" }   // C: for payRef before checkout ever opened: false
SendTargetAbsent { reason: "NoRecord" }       // A
```

**Q3. The grace.** A: the end of the current host task (a yield). B: 100 ms on the Runtime Clock (Stories `advance` past
it). Rec. **A**: no constant, no Story timing, and 100 ms bridges only gaps shorter than itself.

```ts
.detach(North).checkpoint("gone")                          // A
.detach(North).advance("100 millis").checkpoint("gone")    // B: a hidden number in every Story
```

**Q4. Long working deadlines.** A: a busy actor stays alive until they fire (this proposal). B: a persisted actor whose
only busy items are future deadlines ends, and the Runtime restores it when the earliest falls due. Rec. **A**: B makes
the deadline fire in a new incarnation (held lanes redelivered, re-entered states restart their timers), so behaviour
would depend on whether the actor ended; revisit if an app needs deadlines of minutes. Into `revisit.md` if A.

**Q5. Local actors.** A: the same rule (used or busy, end of task) replaces React O3's 100 ms grace for local actors.
B: keep React O3 (decided). Rec. **A**: a dialog's autosave is lost today on close; one rule for every actor; React O3's
"work continues during grace" becomes "work continues while busy". This reopens a decided item, so B is the default.

```tsx
const draft = useActor(DraftMachine)   // B: unmount → 100 ms → disposed, armed autosave dropped
const draft = useActor(DraftMachine)   // A: unmount → autosave fires, Saved lands → ends
```
