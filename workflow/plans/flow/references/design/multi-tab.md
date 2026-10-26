# Multi-tab shared persistence

Status: **deferred** (not in version 1; see [Persistence.plan](../../Persistence.plan) O7). Kept as the future design for multi-tab shared persistence.
Inputs read: FlowState.plan O3, O5 to O9, D12 to D16, D27, D41, D50; minimal-library.md section 10;
entity-domain.md sections 1 and 5; references/dispatch-desk (app/app.ts, app/host.ts,
app/persistence.ts, editor, session, toasts, queue, ticket.domain.ts, fixtures); the archived
Persistence.plan (O1 to O5, C1) and explorations/reference-review.md P10; Effect 4.0.5 as installed
(`effect/persistence` KeyValueStore, `Scheduler.ts`, `eventlog/EventJournal.ts`).

## 0. Summary

One sentence: **a persistence scope has one writer tab; a persisted ref names one actor per scope,
mirrored into every other tab; everything else stays per tab, and between tabs values travel only
with versions while everything else travels as invalidation.**

| #   | Decision                                                         | In short                                                                                                                                                                                 |
| --- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | The unit of ownership is the persistence scope                   | One Web Lock per (app, scope). Its holder (the _leader_) runs every persisted actor and is the only tab that writes the scope's record.                                                  |
| M2  | A follower's persisted refs are mirrors                          | `ensureActor` on a persisted ref in a non-leader tab returns an ordinary handle whose snapshots are the leader's and whose `send` forwards to the leader. No new type or hook.           |
| M3  | Non-persisted refs and local actors stay per tab                 | As today: one Runtime, one actor. A send from a scope actor to a per-tab ref fans out to that ref in every tab.                                                                          |
| M4  | Handover is a restore                                            | When the leader goes, the oldest waiting tab takes the lock and runs the normal O8 restore of the last good record. Nothing new is invented for recovery.                                |
| M5  | Confirmed entity records travel between tabs as peer deltas      | Versioned fields apply by the store's ordering rule; unversioned changes, plain-transaction writes and uncertain writes travel as invalidation. Predictions never travel.                |
| M6  | Sharing is keyed by scope                                        | No scope, no sharing (scope is the principal, O8). Logout is `runtime.dispose({ forget: true })`, which removes the record from whichever tab writes it and ends the scope in every tab. |
| M7  | Incompatible or unsafe tabs degrade to the existing O8 rule      | Different compiled app, no Web Locks, unresponsive leader: the tab runs without persistence or sharing and reports a diagnostic. This is the safe direction (D5).                        |
| M8  | Coordination is an internal Effect service chosen by environment | `TabCoordination` with a browser, a solo and a test Layer. Authors write nothing; Stories use the test Layer to run several tabs deterministically in one process.                       |

The author-facing surface grows by one option (`dispose({ forget })`), two Story commands
(`openTab`, `closeTab`), one Story option (`tab`), one checkpoint field (`tabs`), an optional
`result` Schema on `stream` (symmetry with `resource`), and six diagnostic codes. Dispatch Desk's
app code does not change.

## 1. Starting point

- **Persistence.plan O7 and minimal-library section 10:** "A second tab on the same scope runs without
  persistence and reports a diagnostic." V6 lists "the second-tab rule" as a gate. It prevents
  corruption but gives tabs divergent truth: a logout in one tab is invisible to another, and a
  draft typed in the second tab is lost on reload.
- **Archived Persistence.plan:** one logical record per Runtime and scope (O1); writes serialised
  per scope, an older write never replaces a newer one, a failed write keeps the last good record,
  disposal finalises the latest accepted write before releasing provider ownership (O5); restore
  validates detached data, installs providers before consumers, never replays, and restores pending
  remote commits as unknown (O2, O4); capture is one consistent actor and store cut with a closed
  durable context graph (O3). C1 explicitly excluded "cross-tab synchronization, same-scope writer
  protocol, conflict resolution". This design lifts exactly that exclusion and keeps every other
  rule, because the leader is a single Runtime to which those rules already apply.
- **reference-review.md P10** named the defect: "two tabs on one scope silently overwrite each
  other", with "same-scope writer lock or refusal" as the fix.
- **Effect 4.0.5:** `KeyValueStore` has get, set, remove, clear, modify and no compare-and-swap,
  transaction or change notification. Coordination therefore cannot live in storage; it needs its
  own service. Effect's own `EventJournal` browser store already serialises writers with
  `navigator.locks.request(key, { signal }, ...)` and falls back to an in-process semaphore
  (`node_modules/effect/src/eventlog/EventJournal.ts`, `makeBrowserWithLock`), which is the
  pattern adopted here.
- **Nothing exists in code:** neither packages/flow-state-rewrite nor the frozen package implements
  persistence or any tab coordination (O13: "builds no ... persistence").

Note found in passing: `app/persistence.ts` imports `effect/unstable/persistence`; installed 4.0.5
exports it as `effect/persistence`. Fix it in the reference.

## 2. Why the scope, and why mirrors

**Ownership per scope, not per actor.** Per-actor ownership (tab A owns the session, tab B owns
editor T-42) would split one durable context graph across Runtimes. The archived capture rule (one
cut, providers' observed revisions no newer than the captured store) cannot hold across two writers
without a distributed snapshot, and entity records persisted with persisted answers belong to one
store. With one leader per scope, capture, ordering, last-good writes and restore are unchanged
single-Runtime rules. Firestore's multi-tab persistence makes the same choice (one primary tab owns
the network and the shared IndexedDB lease; secondaries follow).

**Mirrors, not copies, refusals or read-only replicas.**

| Option for the second tab's persisted ref              | Verdict                                                                                                                                    |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Independent unpersisted copy (today's O8)              | Divergent truth; logout and permission changes do not reach other tabs; drafts in tab B are lost. Kept only as the degraded fallback (M7). |
| Read-only replica                                      | The user cannot type in tab B; every persisted editor becomes useless outside one tab.                                                     |
| Refusal (FlowError)                                    | Breaks the app on Ctrl+click.                                                                                                              |
| **Mirror: snapshots from the leader, sends forwarded** | One truth per scope, matching what a ref already means ("names a shared actor"), with no new authoring. Chosen.                            |

Persisted actors are an app's durable truth (session, preferences, drafts). That is precisely the
state users expect every tab to agree on.

## 3. Surface

### 3.1 Apps: nothing to write

```ts
// app/persistence.ts: unchanged. In a browser, tabs on one scope coordinate by default.
import { KeyValueStore } from "effect/persistence";
export const browserSetup = (userId: string) =>
  runtimeSetup({
    app: DeskApp,
    services: Layer.mergeAll(
      DemoTicketApi,
      KeyValueStore.layerStorage(() => localStorage),
    ),
    persistence: { scope: `dispatch-desk:${userId}`, version: "1" },
  });
```

What the dispatcher sees with the desk open in tabs A (opened first) and B:

- Both tabs `ensureActor(SessionRef)` and `editorRef(T42)`. A runs them; B holds mirrors. Typing a
  title in B sends `TitleChanged` to A's editor; both tabs render the same draft from the same
  snapshot. The autosave schedule runs once, in A. The save commits once, from A, with one
  `attempt.id`.
- `queueRef("north")` is not persisted, so each tab runs its own queue. When the save settles in A,
  A broadcasts the confirmed Ticket record (revision 9); B's store applies it because 9 is newer,
  and B's queue row shows the new title without a refetch. B's `openCount` is unaffected because
  `title` is not among its derived fields.
- The editor's `Saved` handler sends `Toasts.E.Push` to `ToastsRef` (non-persisted, per tab): the
  toast appears in every tab that has a Toasts actor (M3).
- Closing A while the save is in flight: B takes the lock, restores the last good record, and the
  pending save restores as unknown, so the editor's existing `unknown: E.SaveUncertain` handler sets
  `maybeSaved` (O8, unchanged rule). B now runs the editor and persists it.
- Reloading B while A is open: B starts as a follower, warms its store read-only from the record,
  and mirrors A's live editor.

### 3.2 Logout and principal change

```ts
// The one new option. Forgetting a scope is only safe through the writer, so Flow routes it there.
await runtime.dispose({ forget: true });
```

`dispose({ forget: true })` disposes this Runtime as `dispose()` does (in-flight commits settle) and
then ends the scope everywhere:

1. It broadcasts `Forget` on the scope's channel. Every Runtime on the scope stops persisting and
   sharing for the rest of its life, disposes its persisted actors and mirrors (lifecycle
   `disposed`), and reports `ScopeForgotten`.
2. The record is removed by the lock holder: the leader if it is alive (it receives `Forget` after
   its own pending writes, so no write can follow the removal), otherwise this Runtime after it
   acquires the lock.
3. The returned promise resolves when the removal has happened.

The documented recipe (replacing minimal-library's "a different user means a new Runtime" note,
which stays true):

```ts
// features/Session: model sign-out as session truth, so every tab's mirror sees it first.
session.send(Session.E.SignedOut()); // all tabs re-render from the mirrored SIGNED_OUT state
await runtime.dispose({ forget: true }); // removes dispatch-desk:<user> data in whichever tab writes it
// <FlowProvider key={scope}> in each tab switches to the anonymous Runtime on SIGNED_OUT.
```

Ordering makes the recipe work: the leader publishes the `SIGNED_OUT` snapshot before it processes
`Forget`, and a channel delivers one sender's messages in order, so every follower renders the
signed-out state before its mirrors are disposed. If an app skips the first line, the forget still
ends the scope in every tab (fail-safe); the other tabs' hosts then see disposed actors and a
`ScopeForgotten` diagnostic.

Without `forget`, `dispose()` keeps today's meaning: the record stays, and the lock passes to the
next tab.

### 3.3 Stories

```ts
export const savedInOtherTab = story
  .app(DeskSetup, { id: "ticket-two-tabs", fixtures: [SlowSave] }) // tab "main" opens first
  .ensure(SessionRef)
  .ensure(ToastsRef)
  .ensure(Editor42, { input: T42 })
  .openTab("b") // a second Runtime of DeskSetup
  .ensure(SessionRef, { tab: "b" })
  .ensure(ToastsRef, { tab: "b" })
  .ensure(Editor42, { input: T42, tab: "b" }) // a mirror of main's editor
  .process()
  .send(Editor42, E.TitleChanged({ title: "Replace foyer light" }), { tab: "b" })
  .send(Editor42, E.SaveRequested(), { tab: "b" })
  .process()
  .checkpoint("saving") // cp.tabs.main and cp.tabs.b hold equal editor snapshots
  .closeTab("main") // abrupt, like a closed tab: no final write, adapter in flight
  .process()
  .checkpoint("b-leads"); // b restored the record; the save is unknown; maybeSaved is true

export const reloaded = desk("ticket-reload")
  .closeTab("main")
  .openTab("main")
  .process()
  .checkpoint("restored");
export const newerDeploy = desk("ticket-mixed-versions")
  .openTab("next", DeskSetupV2)
  .process()
  .checkpoint("degraded"); // tab "next" runs unpersisted with TabVersionMismatch
```

- **openTab(name, setup?)** constructs and readies another Runtime (default: the Story's setup).
  Reopening a closed name is a reload.
- **closeTab(name)** ends a tab abruptly: its locks are released, already-posted messages are
  still delivered, unissued writes and unforwarded events are lost, adapters in flight are
  abandoned. Graceful exit is ordinary disposal and needs no command.
- **{ tab }** on `ensure` and `send` picks the tab; omitted, it is `"main"`. An unknown name throws
  FlowError `StoryTabUnknown` when the Story is built.
- **cp.tabs** is a record of per-tab checkpoints. The checkpoint's own fields are tab main's, so
  single-tab Stories and their reads (`descriptor.get`, `Domain.entry.get`, `Note.get`) are
  unchanged.
- `process()` drains every tab's mailboxes, the channel and the lock queue to quiescence.

### 3.4 Smaller additions

- `stream({ ..., result? })`: the value Schema, spelled as on `resource`. Needed when a persisted
  machine's activity lane must cross tabs (section 5.2). Otherwise optional.
- Diagnostic codes: `TabCoordinationUnavailable`, `TabVersionMismatch`, `TabOwnerUnresponsive`,
  `TabOwnerLost`, `ScopeForgotten`, `MirrorUnencodable` (section 13), and the Story code
  `StoryTabUnknown`.

## 4. Roles and election

Every Runtime with `persistence` resolves a role during `runtime.ready()` (construction stays
synchronous and inert, O3):

| Role         | When                                                                  | Runs persisted actors                             | Writes the record | Shares records |
| ------------ | --------------------------------------------------------------------- | ------------------------------------------------- | ----------------- | -------------- |
| **leader**   | holds the scope lock                                                  | yes                                               | yes               | yes            |
| **follower** | another compatible Runtime holds it                                   | mirrors                                           | no                | yes            |
| **solo**     | no tab coordination in this environment (server, React Native, jsdom) | yes                                               | yes               | no             |
| **degraded** | coordination unsafe or incompatible (section 10)                      | fresh, unpersisted local actors (today's O8 rule) | no                | no             |

**Names.** Lock and channel names are `flow-state/1/<appId>/<digest(scope)>`, where the digest is
SHA-256 over the length-prefixed scope (D9 composite identity), so names are bounded and the scope
string never appears in `navigator.locks.query()`. `persistence.version` is deliberately not in the
name: tabs of two deployed versions must contend for the same lock, or both would write.

**Bootstrap, after the archived detached validation step and before services are built:**

1. Request the scope lock with `ifAvailable: true`.
2. Granted: become leader, then run the O8 restore. Hold the lock until disposal or page death.
3. Not granted: open the channel, send `Hello { fingerprint }`, and queue an ordinary lock request
   (FIFO in the browser's lock manager). The leader answers `Welcome { fingerprint, actors }` with
   the current snapshots of its live persisted actors, once its own `ready()` has finished.
4. Matching fingerprint: become follower. Read the record's store part read-only (section 7.3).
   Mismatch: drop the queued lock request and become degraded with `TabVersionMismatch`. No
   `Welcome` within the handshake bound (5 seconds wall time; fixed, not an option): degraded with
   `TabOwnerUnresponsive`.

**Fingerprint.** SHA-256 of the canonical JSON of `inspect(app)` (the internal representation,
O11), `persistence.version` and the tab protocol version. Truth is a compilation target, so two
tabs agree exactly when their compiled apps agree. It is internal; the archived ban on a public
fingerprint API (Persistence C1) stands.

**Presence.** Each follower also holds a lock `.../peer/<tabId>` for its life. The leader requests
that lock for each follower it has seen; the grant is the follower's death notice, with no
heartbeat. It releases that follower's attachments (retain) and drops its pending replies.

**Degraded is for life.** A degraded Runtime never takes the lock later, because it would have to
reconcile its own independent actors with the record. Its persisted refs carry an issue naming the
cause, so a view can say "Reload this tab: a newer version is open".

## 5. Persisted actors across tabs

### 5.1 Identity and ensure

A persisted ref names one actor per scope. In a follower:

- `ensureActor(ref, { input })` returns synchronously, as today. The handle is a mirror. If
  `Welcome` listed the actor, its snapshot is the leader's. Otherwise the follower sends
  `Ensure { ref, input }` (input encoded with the definition's Input Schema), and until the
  leader's first snapshot arrives the handle shows the fresh snapshot its own input would produce
  (`initial` is a pure function of input, O1). "The first accepted input wins" now holds across
  tabs: the leader accepts `Ensure` messages in arrival order, so if two tabs race with different
  inputs, the loser's provisional snapshot is replaced within one round trip.
- Lookup without options (`useActorByRef(ref)`, D51) finds the mirror if the leader has the actor.
- Admission validation (O3: provenance, wiring, cycles, headroom) runs in the leader. A refusal
  returns to the follower as the same FlowError diagnostics on the mirror's issues.

### 5.2 Snapshots

- The leader posts a persisted actor's snapshot after each of its publications, coalesced to the
  latest per actor per task, stamped with a per-actor sequence number. A follower applies a
  snapshot only if its sequence is newer, so it never shows an older snapshot after a newer one.
  Like `snapshots`, this is current truth, not history: no replay.
- Each arrival is one publication into the follower's versioned store, so several `useView` calls
  in one render still read one version (O7).
- **Encoding.** State as its path; memory with the Memory Schema; activity lanes with their
  operation's `result` Schema; issues with the Diagnostic schema; context, and lanes without a
  Schema, must be plain data (primitives, arrays, plain objects, `Uint8Array`). The leader checks
  this as it encodes. A value that fails is not posted: the follower keeps the last snapshot, gains
  `MirrorUnencodable` naming the path, and the leader reports it once per actor and path.
  `flow check` warns statically when a persisted machine's activity uses an operation without
  `result`. Persisted machines cannot carry opaque event payloads (minimal-library section 4), so
  every forwarded event encodes.
- Lanes in a mirror come from the leader's store, so they show the leader's predictions marked
  `pending`. The follower's own reads (its queue) show only confirmed data until the write settles
  (section 8.3). That gap is the price of not sharing predictions; see Q3.

### 5.3 Sends, dispose and retain

- `handle.send(event)` on a mirror is synchronous admission into the follower's bounded forward
  queue (the actor's mailbox capacity); overflow rejects with `AdmissionOverloaded` and changes
  nothing, as for a local actor. The leader admits forwarded events in the order one follower sent
  them. Events from different tabs interleave in arrival order, each as one turn (O2).
- The leader may still refuse after `send` returned (its mailbox is full, the actor was disposed).
  It replies `Nack`, and the follower reports `AdmissionOverloaded` or `SendTargetAbsent` with the
  event tag. This is the same honesty D27 already gives actor sends.
- `check(snapshot, event)` runs locally on the mirrored snapshot. The leader decides the turn on its
  own current snapshot, so a check that was Allowed in B may be Denied by the time the event lands;
  the turn then declines silently, exactly as with two quick sends in one tab.
- `disposeActor(mirror)` forwards: the actor is gone in every tab. The leader settles in-flight
  commits first (D12).
- `retain` counts attachments in every tab. A follower's attachments end when it detaches or when
  its presence lock is granted to the leader.

### 5.4 Actor sends, context, schedules, activities

- **Per-tab to scope.** `send(PersistedRef, ...)` from a local or non-persisted actor in a follower
  is forwarded like `handle.send`.
- **Scope to per-tab.** `send(ToastsRef, ...)` from a persisted actor reaches `ToastsRef`'s actor in
  every tab of the scope that has one, as a later FIFO turn in each (D27 semantics per tab). It
  reports `SendTargetAbsent` only if no tab has the actor. The leader posts the event once on the
  channel; each tab's delivery is ordered after the snapshot of the turn that sent it. Rationale:
  the sender is one actor shared by all tabs, so it addresses the per-tab actor everywhere; the
  alternative (only the leader's tab) shows the reference's Saved toast in a tab the user is not
  looking at. See Q2.
- **Context.** A persisted consumer can only read persisted providers (capture already fails
  `NonDurableContextProvider`, and `flow check` reports it), so the durable graph lives entirely in
  the leader. A per-tab consumer may read a mirror as a provider (B's queue reads `userId` from the
  mirrored session); mirror arrivals are provider revisions, and O4's wave rules apply in B.
- **Schedules, activities, onContext, operations** of persisted actors run only in the leader.
  Mirrors run nothing.

## 6. Handover

The leader stops being leader in one of three ways:

| How                                                   | What happens before the lock is released                                                                                |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `runtime.dispose()`                                   | Admission closes; in-flight commits settle; the latest accepted write is finalised (archived O5); `Retiring` is posted. |
| `dispose({ forget: true })`                           | As above, but the record is removed instead of written (section 3.2). No successor restores it.                         |
| The page dies (closed, crashed, navigated, discarded) | Nothing. The browser releases the lock when the document is destroyed.                                                  |

The next tab in the lock queue (the oldest waiting follower, since Web Locks grant in request
order) becomes leader by running **the O8 restore of the last good record**: detached validation,
install, providers before consumers, silent context baselines, no replay of input, initial, events
or finite work, pending remote commits restored as unknown, streams starting a fresh generation.
Its mirror handles become local handles in place (same objects; `snapshots` continues). Other
followers receive `LeaderChanged`, re-send `Ensure` for their mirrors (idempotent), and continue.

What a handover can lose is exactly what a reload loses, plus forwarded events not yet admitted:

- **Turns after the last completed write.** The leader schedules a write after each publication
  and keeps at most one in flight with the latest cut waiting (archived "may coalesce"), so the
  window is one write. It also writes the latest prepared cut on `visibilitychange` to hidden and on
  `pagehide`, synchronously when the store is synchronous (localStorage). That is best effort; the
  guarantee stays "last good record". The new leader's snapshots may therefore step back to the
  record; mirrors show that, since the record is the only consistent cut.
- **Forwarded events without an admission ack.** The follower drops them and reports
  `TabOwnerLost` with their count and tags. Events are never re-sent: the old leader may have run
  them, and a re-sent `SaveRequested` could commit twice. At most once, honestly reported.
- **Commits in flight in the dead leader** become unknown in the new leader, which owns their
  reconciliation and their `attempt.id` (D33 reuse). No other tab restores them.

## 7. Storage

### 7.1 One writer

Only the leader or a solo Runtime writes the scope's keys, and only while it holds the lock (solo:
by construction). Writes are serialised per scope, an older write never replaces a newer one, and a
failed write keeps the last good record without failing the committed turn (archived O5, kept
verbatim). A follower, a degraded tab and a forgotten scope never write.

**Requirement on the store:** a write must not outlive its page. localStorage writes are
synchronous; IndexedDB aborts the transactions of a destroyed document. A remote or
process-external KeyValueStore whose writes can complete after the page dies is not safe for
multi-tab and is documented as such (Q6).

### 7.2 Record layout

S6 owns the layout. Multi-tab adds one requirement: **a reader must see one complete cut without
taking the lock**, because followers read while the leader writes. Either one value per scope (one
`set` is atomic in both browser stores), or entries written first under a generation and a manifest
written last, with the previous generation's entries kept until the next manifest lands. A reader
that finds a manifest pointing to missing entries re-reads the manifest, at most twice, then treats
the record as absent (`MalformedData`).

### 7.3 Followers read

A follower reads the record once at bootstrap and installs **only its store part** (confirmed entity
records and persisted resource entries) read-only, at position 0 with every restored answer's
frontier lowered, so live data wins (entity-domain 5.5 Persistence). It does not restore actors
(they are mirrors) or commits. This gives a newly opened tab the same instant data a reload gets.
A follower's own cache is never persisted.

### 7.4 Versions and migrations

- Tabs cooperate only with equal fingerprints. A tab whose compiled app or `persistence.version`
  differs from the leader's is degraded, whichever is newer.
- A degraded newer tab cannot take over later, so after the old tab closes, persistence resumes
  with the next tab that loads; that tab's restore meets the old record and applies O8's version
  rule (`IdentityVersionMismatch`; see Q5).
- Restore after handover validates the record against the new leader's compiled app, as any
  restore does. Equal fingerprints make that a formality.

## 8. Entity domains and operations across tabs

### 8.1 Peer deltas

Each follower and leader is a separate Runtime with its own record store (followers run per-tab
domain reads such as the queue). After each turn, a tab posts the **base deltas it accepted from a
non-peer source**: responses to its own lookups, its pushes and its write settlements. They are
consolidated per record (5.4) and encoded with the entity's field Schemas, each with the fields'
versions and the origin kind (machine request, repair response, push, settlement). A receiving tab
treats them as a new source, **peer**:

| Peer change                                       | Receiver's store                                                                           | Receiver's repair                                                                        |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| versioned field, version strictly greater         | replaces the field                                                                         | joins its answers (5.2) as a push would; may start repair lookups                        |
| versioned field, equal version, equal value       | nothing                                                                                    | nothing (deduplicates a push both tabs received)                                         |
| versioned field, equal version, different value   | nothing; the field is contested (evidence)                                                 | refetch, as for a contested field                                                        |
| versioned field, lower version                    | rejected                                                                                   | derived answers marked stale only                                                        |
| versioned delete (tombstone with version)         | as a versioned delete (5.5 Deletes)                                                        | as a push delete                                                                         |
| unversioned field or delete                       | **base unchanged** (positions are per Runtime, so request order across tabs means nothing) | joins its answers using the carried old and new values; matching answers are invalidated |
| any change whose origin was a **repair response** | as above for values                                                                        | marks matching answers stale; **starts no lookup**                                       |

The last row extends the one-hop rule (5.2) across tabs. A machine request in tab A can start at
most one repair wave in each other tab, and those repair responses, broadcast again, only mark
stale. There is no loop and no loop guard, and the Runtime-wide repair bound (5.6) still applies in
each tab.

This amends entity-domain.md section 5: one more source kind in the 5.1 table, and "a peer tab"
added to the closed list of causes in 5.2.

### 8.2 What never crosses

- **Predictions.** They belong to the writing tab's per-record queue and are retracted by its
  settlement. Crossing them would need a cross-tab queue and retraction on tab death. The leader's
  predictions are visible only through mirrored lanes (5.2).
- **Plain resource values** (`setData`, lookups of operations outside a domain). They carry no
  versions, so any order could regress a newer value.
- **Record queues and attempts.** Two tabs writing one record are two clients. The server orders
  them; versions (and `basedOn`, sent as If-Match) decide what each tab keeps.

### 8.3 Invalidation is the fallback carrier

Changes that cannot travel as values travel as invalidation, which is order-insensitive and so
always safe:

- A settled plain transaction's `writes` (`setData`, `invalidate`, `clear`) become `invalidate` of
  the same family and partial key in every other tab (one validated batch, at most 256 identities,
  O5).
- An uncertain domain write invalidates, in every other tab, the answers holding the records it
  predicted. Only the writing tab marks them `uncertain` and runs the forced repair.
- An unversioned entity change (above).

`flow explain <domain>` states per entity "across tabs: values (versioned)" or "across tabs:
invalidation only (unversioned)", so an agent can see why tab B refetched.

### 8.4 Commits, attempts and idempotency

- Persisted actors' commits run only in the leader, so one per-record queue orders every tab's edits
  to a persisted editor.
- `attempt.id` is random per attempt in production (crypto random, unique across tabs). In Stories
  it is seeded per tab from (Story seed, tab name, tab incarnation), so a reopened tab never reuses
  an id.
- An attempt is reconciled by exactly one Runtime: the one that started it, or the leader that
  restores it as unknown. Degraded tabs restore nothing.

## 9. Scope, principal and security

- **Sharing is keyed by scope**, and scope is the principal (O8, entity-domain 5.5). Lock and
  channel names include it, so two users' tabs on one origin (multi-account apps) never see each
  other's messages. A Runtime without `persistence` has no scope and shares nothing, because Flow
  cannot know whose data it holds.
- **Messages are untrusted input.** Every message is decoded with Flow's Schemas, carries the
  protocol version and fingerprint, is bounded (1 MiB per message, mailbox capacity per forward
  queue, 256 identities per invalidation batch), and is dropped with a diagnostic when malformed.
  A peer can deliver only public events (internal events do not decode, D19) and confirmed
  versioned data, which the store's ordering rule checks. BroadcastChannel is same-origin, so the
  trust boundary is the origin, as for localStorage.
- **Logout** is `dispose({ forget: true })` (3.2). It removes the data from storage on shared
  computers, and it cannot be undone by a tab still writing, because only the lock holder removes.
- **Not handled, documented:** a cookie that changes user under a tab still running the old scope
  makes that tab fetch the new user's data into the old scope. That is an auth bug the app must
  prevent by moving principal truth into a persisted session actor (3.2). Flow does not end other
  scopes when a new one starts, because multi-account apps run several (Q4).
- **Server isolation:** see 10.2.

## 10. Environments

### 10.1 Choosing the coordination Layer

`TabCoordination` is resolved once, in `ready()`, unless a Story provides it:

| Environment                                                  | Detected by                                                | Layer   | Result                                                                                                                 |
| ------------------------------------------------------------ | ---------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------- |
| Browser window, secure context                               | `document`, `navigator.locks` and `BroadcastChannel` exist | browser | leader or follower                                                                                                     |
| Browser worker (dedicated or shared)                         | `WorkerGlobalScope`, `navigator.locks`, `BroadcastChannel` | browser | locks are origin-wide, so this is correct                                                                              |
| Browser without Web Locks (insecure http origin, old engine) | `document` but no `navigator.locks`                        | none    | degraded with `TabCoordinationUnavailable` ("serve over HTTPS"); no election on BroadcastChannel alone, since it races |
| Node, SSR, Bun, Deno, edge workers                           | no `document`, no `WorkerGlobalScope`                      | solo    | per-request Runtimes stay isolated                                                                                     |
| React Native, jsdom, happy-dom                               | no `navigator.locks` (RN: no `document`)                   | solo    | one JS context; correct                                                                                                |
| Electron windows                                             | as a browser                                               | browser | same-session windows share locks                                                                                       |

### 10.2 The server hazard

Node exposes a global `BroadcastChannel` and is gaining `navigator.locks`. Choosing coordination by
API presence would let two per-request Runtimes for the same user mirror each other's actors, a
cross-request leak. The rule is therefore **a browsing context or browser worker, never API
presence alone**, and that rule gets its own test (V-MT8). Next.js server components never
construct a coordinated Runtime; client components construct inertly and coordinate only in
`ready()`, after hydration.

### 10.3 Background tabs

A leader tab may be hidden while the user types in a follower. Two browser behaviours matter:

- **Timer throttling.** Chrome checks timers in hidden pages about once per second, and once per
  minute for chained timers after five minutes hidden (developer.chrome.com/blog/timer-throttling-in-chrome-88).
  Effect 4.0.5's default scheduler yields with `setTimeout(f, 0)` where `setImmediate` is absent
  (`Scheduler.ts`), so a hidden leader would process each forwarded event in about a second.
  **Requirement:** in browsers the Runtime installs an Effect Scheduler whose `setImmediate` posts
  to a `MessageChannel`, which is not timer-throttled. This also helps single-tab apps. Schedules
  (autosave) still use real timers and may fire up to about a second late in a hidden leader, and
  chained backoffs later. Measured by V-MT9; see Q1.
- **Freezing and bfcache.** A frozen leader answers nothing. Chromium avoids freezing and
  back/forward-caching pages that hold Web Locks, but this must be measured per engine (V-MT9). The
  follower's safety net: a forwarded event with no ack within the handshake bound marks the mirror
  with the issue `TabOwnerUnresponsive`. The issue clears when the leader answers. The follower
  never steals the lock: without compare-and-swap storage, a stolen lock lets a waking leader write
  once more.

### 10.4 Development

Hot reload that builds a new Runtime without disposing the old one makes the new one a follower of
the old one, and after an edit a degraded one (different fingerprint). The docs say to dispose in
`import.meta.hot.dispose`. Tests that run several Runtimes on one scope in one origin (Vitest
browser mode) are several tabs: use distinct scopes, or Stories.

## 11. Effect services and Layers (internal)

```ts
// Internal to flow-state; not exported (D4: no author writes it).
interface TabCoordination {
  readonly tabId: string                          // random; seeded in Stories
  // Scoped: the lock is held until the Scope closes or the page dies.
  readonly lock: (name: string, options: { ifAvailable: boolean }) =>
    Effect.Effect<Option.Option<Lease>, never, Scope.Scope>
  readonly awaitRelease: (name: string) => Effect.Effect<void>   // grant of another tab's presence lock
  readonly channel: (name: string) =>
    Effect.Effect<{ post: (m: Uint8Array) => Effect.Effect<void>; messages: Stream.Stream<Uint8Array> }, never, Scope.Scope>
  readonly lifecycle: Stream.Stream<"hidden" | "pagehide">        // final-write triggers
}
const layerBrowser: Layer.Layer<TabCoordination>  // navigator.locks + BroadcastChannel + document events
const layerSolo: Layer.Layer<TabCoordination>     // lock always granted, channel with no peers
const layerTest: (hub: TabHub) => Layer.Layer<TabCoordination> // Stories
```

- The Runtime's persistence component depends on `TabCoordination` and `KeyValueStore`. Role
  resolution, mirroring, forwarding and peer deltas are one internal module above it, so the role
  logic is the same code in browsers and in Stories.
- **layerTest:** one `TabHub` per Story holds FIFO lock queues and one global message queue in post
  order. Delivery is a Story-scheduled task that `process()` drains in canonical order (post order;
  ties by tab open order). All tabs share the Story's TestClock and one in-memory KeyValueStore that
  the Story installs in place of the setup's storage (archived rule: Stories inherit no browser
  storage). Each tab has its own seeded Random and ids. `closeTab` closes that tab's Scope without
  running finalisers: locks are released, posted messages remain queued, nothing else of the tab
  runs.
- Production code never branches on "is this a test": the test Layer is the only difference.

## 12. Stories and models

- Determinism (O9, principles): identical runs give identical traces across all tabs; every
  cross-tab input (open, close, message delivery, lock grant) happens at an exact step.
- Trace events carry the tab name; checkpoints carry `tabs` and each tab's role.
- `model()` stays single-tab. Interleavings belong in the property test.
- **propertyTest** gains a `tabs: 2` mode: random operations across two Runtimes, peer messages
  delayed by a random but seeded number of steps, and random tab closes. Oracle: at quiescence,
  every versioned record field held in either tab equals the server's, no peer delta lowered a
  version, and no prediction appears in a tab that did not write it.

## 13. Inspection, traces, CLI and diagnostics

**Static representation (inspect, flow graph).** Nothing new is structural except two derived
facts: per persisted machine, whether every activity lane has a Schema; per entity, "values" or
"invalidation only" across tabs. Both appear in `flow explain`.

**flow check.**

- warning: a persisted machine's activity uses an operation without `result` (MirrorUnencodable
  possible at runtime).
- warning (existing rule, wider reason): `listen` over an unversioned entity; now also "tabs share
  it as invalidation only".
- info: a persisted machine sends to a non-persisted ref ("delivered in every tab", 5.4).

**Trace and inspector events** (attachInspector, trace artifacts, InspectionAndArtifacts bounds):
`TabRole { role, cause }`, `LeaderChanged { from, to }`, `MirrorApplied { ref, seq }`,
`ForwardDropped { ref, tags, cause }`, `PeerDelta { records, origin }` and `PeerInvalidate`, with
entity-domain 7.4's repair evidence gaining cause `peer`. `flow trace summarize` groups by tab.

**Diagnostics** (closed vocabulary, O10; all classification Failure):

| Code                         | Raised when                                                           | Effect                                                     | Remediation (help)                                                                                |
| ---------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `TabCoordinationUnavailable` | browser with persistence but no Web Locks                             | degraded tab                                               | serve over HTTPS; Web Locks need a secure context                                                 |
| `TabVersionMismatch`         | fingerprints differ (details: own and leader's `persistence.version`) | degraded tab; issue on its persisted refs                  | reload the older tab; bump `persistence.version` when stored data changes shape                   |
| `TabOwnerUnresponsive`       | no `Welcome` or ack within 5 s                                        | degraded at bootstrap; issue on the mirror later           | usually a frozen tab; focus the other tab                                                         |
| `TabOwnerLost`               | handover dropped forwarded events (details: count, tags)              | events not delivered                                       | resend if the user intent still holds; machines should not rely on exactly-once sends across tabs |
| `ScopeForgotten`             | another tab forgot this scope                                         | persisted actors disposed; persistence and sharing stopped | switch the host to the new principal's Runtime                                                    |
| `MirrorUnencodable`          | a persisted actor's snapshot has a non-encodable value (path)         | follower keeps the last snapshot                           | declare `result` on the operation, or select plain data in context                                |
| `StoryTabUnknown`            | a Story names an unopened tab                                         | Story construction throws FlowError                        | add `openTab(name)` before it                                                                     |

`describeHostFailure` and the reference's diagnostics tool need no change.

## 14. Binding guarantees

1. **Single writer.** At any instant at most one Runtime writes a scope's keys (given Web Locks and
   page-bound writes).
2. **Writer order and last good record** are the archived O5 rules, unchanged.
3. **One actor per persisted ref per scope** for compatible tabs, with one mailbox: turns are
   ordered and atomic in the leader; forwarded events from one tab keep their order.
4. **Mirrors are monotonic.** A follower never shows an older snapshot of an actor after a newer
   one, except across a handover, when it shows the restored record.
5. **Handover loses no more than a reload**, plus unacknowledged forwards, which are reported, never
   replayed.
6. **No replay across tabs.** No event, input, initial, commit or stream value is re-run because of
   another tab.
7. **Peer data never regresses a versioned field** and never writes an unversioned base. Peer
   repair is one hop.
8. **Nothing persisted or shared is a prediction.**
9. **No sharing without a scope; no sharing across scopes; no coordination on servers.**
10. **Stories are deterministic** across tabs.

## 15. Reuse

| From                                       | Reuse                                                                                                                      |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Archived Persistence O2 to O5              | the whole restore path, capture cut, ordered last-good writes and unknown restore; handover calls it unchanged             |
| Archived Persistence V4                    | the delayed-write crash scenario, rerun with "crash" = `closeTab` of the leader and restore in tab b                       |
| Persistence.plan O7 second-tab rule and V6 | kept as the degraded role, with its diagnostic split into three causes                                                     |
| D27 actor send                             | async FIFO delivery and `SendTargetAbsent` honesty, reused for forwarding and fan-out                                      |
| D47 derived Schemas                        | event, input, memory encoding over the channel                                                                             |
| entity-domain 5.2, 5.3, 5.5                | ordering rule, one-hop rule, contested fields, versioned tombstones, restore-at-position-0, all applied to the peer source |
| Effect `EventJournal.makeBrowserWithLock`  | the `navigator.locks.request(name, { signal }, ...)` bracket inside `Effect.callback`, and the solo fallback               |
| runtime-next evidence journal (O13 port)   | the new trace events go through it                                                                                         |

## 16. Verification

Planned gate V6 (Persistence) gains these, all on the test Layer unless marked browser:

- **V-MT1 single writer:** two to four tabs, random opens and closes; the KeyValueStore's write log
  shows one writer per lock epoch, and no write after its writer's close.
- **V-MT2 mirrors:** ensure from both tabs with racing inputs (first wins, provisional replaced);
  forwarded FIFO; Nack paths; monotonic sequence under reordering; check on mirrors; dispose
  forwarding; retain across tabs, including follower death by presence lock.
- **V-MT3 handover:** graceful dispose (final write, then lock release), abrupt close mid-commit
  (unknown in the new leader, attempt id preserved, forced repair runs once), abrupt close with a
  queued write (regression to last good record, at most one write behind), `TabOwnerLost` with
  counts. Archived V4's delayed-write crash scenario across tabs.
- **V-MT4 fan-out and context:** the reference's Saved toast reaches Toasts in every tab after the
  editor's snapshot; per-tab queue context waves from a mirrored session.
- **V-MT5 entity peers:** every row of the 8.1 table; one-hop (no lookup started by a peer delta of
  repair origin); the property test in `tabs: 2` mode with its mutations (applying an equal-version
  peer value, letting a peer start lookups from repair responses, sharing a prediction) all caught.
- **V-MT6 scope:** forget from leader and from follower; removal ordered after the leader's last
  write; no tab writes the scope again; two scopes in one origin exchange no message.
- **V-MT7 versions:** a tab with a different compiled app or `persistence.version` degrades, never
  writes, and the older tab keeps leading.
- **V-MT8 environments:** Node with a global BroadcastChannel (and a stub `navigator.locks`) runs
  two same-scope per-request Runtimes in solo, isolated; an insecure-context browser degrades.
- **V-MT9 browser (Playwright: Chromium, Firefox, WebKit):** two real pages, close and crash the
  leader, verify handover and storage; bfcache and freezing with a held lock; forward latency
  through a hidden leader with the MessageChannel scheduler (target: under 50 ms at p95) and
  autosave delay (recorded, not gated).
- **V-MT10 determinism:** identical traces from two runs of every multi-tab Story.
- **flow check fixtures** for the three new findings; **V1 type spike** additions: `{ tab }`
  options, `openTab(name, setup?)`, `cp.tabs`, `dispose({ forget })`.

## 17. Plan amendments

- D50: remove "multi-tab shared persistence".
- O8: replace the second-tab sentence with "Tabs on one scope elect one writer with Web Locks; a
  persisted ref names one actor per scope, mirrored into other tabs; confirmed versioned entity
  records travel between tabs, and other changes travel as invalidation; incompatible tabs run
  without persistence and report why. `dispose({ forget: true })` ends a scope everywhere."
- New decisions M1 to M8 above; entity-domain section 5 amendments (8.1); O9 Story commands; O10
  codes; O11 events and check rules; stream `result` in O5.
- minimal-library section 10 and the reference's `app/persistence.ts` comment updated.

## 18. Open questions, with recommendations

- **Q1 Should leadership follow the visible tab?** Firestore lets a foreground tab take the primary
  lease. Here every move is a full handover (dispose, write, restore, streams restart, refetch), and
  a user flipping tabs would cause churn and visible pending states. _Recommend: no in version 1._
  Ship the MessageChannel scheduler, measure V-MT9, and revisit only if hidden-leader schedules
  hurt (then: move after five minutes hidden, only when no commit is in flight).
- **Q2 Where do scope-to-per-tab sends go?** Every tab (chosen), only the leader's tab, or the tab
  whose event caused the turn (needs causal tagging through commits). _Recommend: every tab_ for
  version 1; it is simple, deterministic and right for toasts and notices. Causal routing can be
  added later without breaking authored code.
- **Q3 Should predictions cross tabs?** Without them, a follower's own lists show a persisted
  editor's save only when it settles, while the mirrored editor shows it at once. Sharing needs a
  cross-tab record queue and retraction on tab death. _Recommend: no._ The gap lasts one request.
  If needed, add predictions as leader-owned overlays retracted on `LeaderChanged`.
- **Q4 Should a new scope end other scopes of the same app?** It would make single-account logout
  automatic but break multi-account apps. _Recommend: no_; principal truth lives in a persisted
  session actor, plus `forget`.
- **Q5 What does a version-mismatched record do on restore?** O8 does not say. _Recommend: discard
  with `IdentityVersionMismatch`_, as TanStack persistQueryClient's `buster` does. A migration hook
  is a later, separate feature.
- **Q6 Non-browser shared stores** (Electron main-process store, a file store shared by processes).
  _Recommend: out of scope_; document that solo assumes an unshared store, and let a future
  public `TabCoordination` Layer serve those hosts.
- **Q7 Should followers forward their persisted-resource entries to the leader** so a follower's
  cache survives reload? _Recommend: no_; entity records already reach the leader as peer deltas.
- **Q8 Should one tab hold `listen` streams for all** (leader subscribes, followers get peer
  deltas)? It saves server connections. _Recommend: later_, as an optimisation behind the same
  rules: versioned peer pushes are already safe.
- **Q9 SharedWorker as the owner** (LiveStore-style) would avoid hidden-tab throttling, but moves
  services and adapters into a worker and is unavailable on some mobile browsers. _Recommend: not
  in version 1_; the internal `TabCoordination` boundary keeps it possible.

Riskiest: **Q1 together with 10.3.** The mirror design is only good if a hidden leader stays
responsive. The MessageChannel scheduler addresses event processing, but timer throttling and
engine-specific freezing of lock-holding pages are measured facts, not yet established.

## 19. Prior art

- Web Locks API (secure context, `ifAvailable`, `steal`, FIFO grants, release on document
  destruction): https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API
- BroadcastChannel (same-origin, ordered per sender): https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel
- Node's global BroadcastChannel (the server hazard): https://nodejs.org/api/worker_threads.html#class-broadcastchannel-extends-eventtarget
- Firestore multi-tab persistence, one primary tab: https://firebase.google.com/docs/firestore/manage-data/enable-offline
- TanStack Query broadcastQueryClient (shares cache events without versions, experimental): https://tanstack.com/query/latest/docs/framework/react/plugins/broadcastQueryClient
- TanStack Query persistQueryClient and `buster`: https://tanstack.com/query/latest/docs/framework/react/plugins/persistQueryClient
- RxDB leader election: https://rxdb.info/leader-election.html
- Replicache client groups (tabs share one IndexedDB-backed group and poke each other): https://doc.replicache.dev/concepts/how-it-works
- LiveStore (leader tab or SharedWorker owns the database): https://docs.livestore.dev/
- TinyBase BroadcastChannel synchronizer (CRDT-merged, no leader): https://tinybase.org/api/synchronizer-broadcast-channel/
- Zustand persist (rehydrate on `storage` events; last writer wins): https://zustand.docs.pmnd.rs/integrations/persisting-store-data
- Chrome timer throttling: https://developer.chrome.com/blog/timer-throttling-in-chrome-88
- Page Lifecycle (freeze, discard): https://developer.chrome.com/docs/web-platform/page-lifecycle-api
- bfcache eligibility: https://web.dev/articles/bfcache
- Effect 4.0.5 `EventJournal` browser lock and `Scheduler` timer fallback (installed sources).

What this design takes: Firestore's single primary per persisted store; RxDB's and Effect's Web
Locks election; Replicache's "tabs are one client group for durable state, peers are poked"; and
from TanStack's broadcast plugin, the lesson to avoid: unversioned cache values broadcast in
arrival order can regress, which is why only versioned values travel here.
