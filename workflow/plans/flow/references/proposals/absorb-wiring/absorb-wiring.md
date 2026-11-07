# Absorbing wiring: what authors repeat that Flow could own

**Status: PROPOSED. Nothing here is decided.** Exploration for open-items.md item 15, extending the 2.9.5 audit
(which covered fragments only). Report only: each candidate carries a verdict (absorb, offer as helper, leave), and
the owner decides. Streams' `cursor` work (v3) is settled and not listed again.

## 0. Method and how to read the counts

Counts come from grep and small scripts over the two reference apps (`dispatch-desk/`, `checkout/`), non-test
sources unless said (160 files; Stories and fakes counted separately). "Sites" are lines or call sites, not files.
Two limits, stated once: the regexes are line-based, so a handler written over several lines is counted by its key
line; and "same event" or "same name" claims were checked by script on the full set, then spot-read.
Evidence of real misuse is `dispatch-desk/REVIEW.md` (25 misuses, 43 gaps); a candidate that removes a REVIEW
misuse is marked **R**.

Words are marked **NEW**, **RENAMED**, existing, or user-defined, as in AGENTS.md.

## 1. Ranking

Value = failure prevented first, then repetition, then readability. "Words" is added / removed.

| #  | Candidate                                                            | Sites (desk + checkout)                     | Failure prevented                          | Words        | Verdict        |
| -- | -------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------ | ------------ | -------------- |
| 1  | Identity stated twice: the ref carries the input                     | 32 ensures + 14 views; 4 hand-ordered parts | ref and input disagree: wrong actor, silent | +0 / -1 form | absorb         |
| 2  | An operation's `scope`: the actor's identity completes every call    | 113 same-name copies, 13 key helpers        | wrong key part; lane read as plain row (R) | +1 / -13 helpers | absorb     |
| 3  | Hold policy: re-send, then release, declared on the operation        | 31 `retryable`, 10 release-only             | `Restored` re-sent (R, M4); forgotten release | +1 / 0 words, -22 handlers | absorb (owner call: reverses a 2.9.5 "keep") |
| 4  | `Flow` key: one entry for all of Flow's reasons                      | 4 unknown records, 9 read records (+6 streams) | omitted `StorageRefused`/`Restored` (R, M3) | +1 / -1 rule | absorb (fires item 14) |
| 5  | `Flow.ignore`: an ending that needs no reaction                      | about 27 events that exist to be ignored    | a missing late handler                     | +1 / -27 events | absorb      |
| 6  | `lost`: which error tags mean "it may have happened"                 | 40 of 44 commits; helper written twice      | classification invisible to static analysis | +1 / -1 helper | absorb (declaration) |
| 7  | Drop `signal` from lookup and commit                                 | 61 lines; 5 hand-made `AbortController`     | never-aborted signal (R, M7, S-M2)         | +0 / -1 field | absorb (a removal) |
| 8  | Leaving: warn on unload, refuse sign-out with unsettled writes       | 2 listeners, 1 sign-out check               | silent loss of an in-flight write          | +1 / -2 copies | absorb      |
| 9  | An absent subject: a `null` part means "not placed / not called"     | 9 `?? ""` sentinels, 5 `noTicket` guards    | post into ticket `""` (R, M8)              | +0 / -sentinels | absorb after a design round |
| 10 | The entity key of a one-record write comes from its input            | 11 literals, 4 key helpers                  | none (brevity)                             | +0 / -4 helpers | absorb as a rule, no word |
| 11 | A fragment's `input` as a list of same-named fields                  | 11 of about 20 fillings                     | none                                       | +0 form / 0  | offer         |
| 12 | A Story's id from its file and export name                           | 45 `Story.make`; ids restate names          | duplicate or drifting ids                  | -id string   | offer         |
| 13 | The app's fake as a default fixture                                  | 44 of 45 `Story.make` list the same one     | none                                       | +0 / 0       | offer         |

Rejected or left alone are in section 4, with why.

## 2. Candidates

### 1. The ref carries the identity, so `ensure` needs no input for it

**Repeated code.** Every actor's identity is written twice: once as the ref's argument and once as `{ input }`.
`ensureActor`/`.ensure` with `input`: 48 sites, 32 of them identity (the other 16 are `SessionRef`'s `userId`).
`useActorByRef(ref, { input })`: 14 identity views of the 15 (`ResolveWizard.tsx:15` adds `assignee`). Four refs
build a hand-ordered parts array (`editor.ref.ts`, `assistant.ref.ts`, `presence.ref.ts`, `visit.ref.ts`).
Today's rule: "the first accepted input wins" and a differing later input is `InputIgnored` (Runtime.plan O3); but
`ensureActor(editorRef(T42), { input: T43 })` on the first ensure names actor T-42 with T-43's memory, and nothing
reports it.

```ts
// BEFORE: editor.ref.ts, host.ts, QueueList.tsx
export const editorRef = (ticket: TicketKey) =>                       // user-defined: editorRef
  actorRef(EditorMachine, [ticket.workspaceId, ticket.ticketId], {    // existing: actorRef; parts array
    persist: true, retain: "10 minutes" });
const editor = runtime.ensureActor(editorRef({ workspaceId: "north", ticketId: "T-42" }), {
  input: { workspaceId: "north", ticketId: "T-42" },                  // the same two values again
});
const editorV = useActorByRef(editorRef(ticket), { input: ticket });  // existing: useActorByRef

// AFTER
export const editorRef = (ticket: TicketKey) =>
  actorRef(EditorMachine, ticket, {                                   // RENAMED arg 2: parts array becomes an identity record
    persist: true, retain: "10 minutes" });
const editor = runtime.ensureActor(editorRef({ workspaceId: "north", ticketId: "T-42" }));   // no input
const editorV = useActorByRef(editorRef(ticket));
const visit = useActorByRef(visitRef(ticket), { input: { assignee } });   // input = the non-identity fields only
```

**What Flow owns.** Encoding the record into the persisted id (sorted by field name, each value encoded by the
field's Schema, so the "a/b","c" ambiguity stays impossible and the author-chosen order disappears); merging
identity with `{ input }`; a type error when a field is in both. A string id stays for singletons
(`actorRef(PayMachine, "checkout")`, `SessionRef`).

**What goes wrong, tried on different cases.**
- Singleton with per-run input (Session `userId`): unchanged; string id plus `{ input }`.
- Identity is a subset of input (visit: ticket identity, `assignee` extra): the extra goes in `{ input }`; a later
  ensure with a different `assignee` is still `InputIgnored`.
- An identity field is writable memory (input fields are ordinary memory, 2.2.2): identity is the creation record, not
  the current memory. `flow check` should warn when a handler writes an identity field; no such check exists yet.
- Persisted records written under array ids: the id changes shape once, so `persistence.version` bumps, as for any
  identity change today.
- Inspection and `flow inspect` get better: they print `editor{workspaceId, ticketId}` instead of an opaque joined id.

**Failure prevented.** Ref and input naming different things. **Words:** +0 new; the array-parts form is removed;
`{ input }` leaves 46 call sites. **Verdict: absorb.**

### 2. An operation's `scope`: the actor's identity completes every call

**Repeated code.** The line `workspaceId: memory.workspaceId` appears 56 times in 17 files (plus 8 as
`s.memory.`); with `ticketId` 20+3, `cartId` 12, `intentId` 7, `ref` 7: **113** same-name copies of "my identity" into
a call's input or key (36 files; Pay and Cart carry it too, so it is not a desk habit). By enclosing call, a script
puts 31 in `commit` selectors, 31 in `subscribe`/`get`/`refetch`/`more`, 4 in `idle`/`retry`/`cancel`/`retryable`, 46
elsewhere (helpers, fragment fillings). Every machine file writes its own key helper: 13 consts
(`ticketKey` in `editor.machine.ts`, `comments.trait.ts`, `queue.machine.ts`; `workspace` in roster and queue;
`ticket` in visit and history; `intent` and `cart` in pay; `own` in upload and assistant; `channel` in presence;
`technician` in roster), and `ticketKey` is passed as an argument 20 times in 3 files. Views repeat it again:
`O.save.get(s, { workspaceId: s.memory.workspaceId, ticketId: s.memory.ticketId })` three times in `TicketPanel.tsx`.
REVIEW S-H3 and M9/M10 are views that wrote the key wrong or read a keyed lane as a plain row.

```ts
// BEFORE: editor.machine.ts (extract)
const ticketKey = ({ memory }) => ({ workspaceId: memory.workspaceId, ticketId: memory.ticketId });   // user-defined
const commitDraft = O.save.commit(({ memory }) => ({ ...ticketKey({ memory }), title: memory.draft }));
const withinBudget = O.save.retryable(ticketKey, { times: MAX_RESENDS });
activities: [O.ticket.subscribe(ticketKey), O.files.subscribe(ticketKey), O.details.subscribe(ticketKey)],
guard: [canSave, O.save.idle(ticketKey)],                       // six times
actions: [O.save.cancel(ticketKey)],
// TicketPanel.tsx
const lane = useView(editor, (s) => O.save.get(s, { workspaceId: s.memory.workspaceId, ticketId: s.memory.ticketId }));

// AFTER: editor.definition.ts declares it once, beside the lane it describes
save: TicketsDomain.saveTitle.outcomes({
  scope: ["workspaceId", "ticketId"],                           // NEW: memory fields that complete every call of this operation
  success: E.Saved.from((ticket) => ({ ticket })), failure: { /* unchanged */ }, unknown: { /* unchanged */ },
}),
ticket: ticketById.outcomes({ scope: ["workspaceId", "ticketId"], value: E.TicketLoaded.from(/* … */) }),
// editor.machine.ts
const commitDraft = O.save.commit(({ memory }) => ({ title: memory.draft }));   // only what is not scope
const withinBudget = O.save.retryable({ times: MAX_RESENDS });
activities: [O.ticket.subscribe, O.files.subscribe, O.details.subscribe],
guard: [canSave, O.save.idle],
actions: [O.save.cancel],
// TicketPanel.tsx
const lane = useView(editor, (s) => O.save.get(s));
// roster: scope is the workspace; the event supplies the rest
move: moveTechnician.outcomes({ scope: ["workspaceId"], /* … */ }),
guard: [isAdmin, O.move.idle(({ event }) => ({ technicianId: event.technicianId }))],
```

**What Flow owns.** Completing the input and the key from the named memory fields at call time (same "before"
snapshot as today's selects, rule 22); typing a selector as the contract's input minus the scope fields; the member
forms (`idle`, `retry`, `cancel`, `retryable`, `get`, `subscribe`) taking no key when scope covers the contract's whole
key, and a partial key (as `idle` accepts today, OD23 Q34) otherwise.

**What goes wrong, tried on different cases.**
- Roster, per technician: scope `["workspaceId"]`, the event adds `technicianId`. Works; the `technician` helper shrinks.
- Queue toggles and the editor's `uploads` copies key by `item`/`key`, not by memory: no scope (or workspace only);
  nothing changes there.
- Pay: `place` scopes `cartId`, `pay`/`void` scope `intentId`, `authenticate` both; scope is per operation, so one actor
  can hold several.
- Merge: two customers under one workspace: scope `workspaceId`; the second customer stays in the selector.
- A scope field that is `null` or optional (`previewId`, `skillsFor`): rejected at the declaration as a type error. This
  pushes straight into candidate 9, which is the real fix.
- A scope field renamed in memory: one compile error at the declaration instead of 6 to 10 call sites.
- Reading at a glance (priority 2): the commit no longer shows `workspaceId`. The call shows only what this send adds,
  and the lane's identity is on the declaration, where `flow explain` can print it (`actor × {workspaceId, ticketId}`).
- Naming: `scope` is near "subject path" (rules 51 to 53). Candidates `by`, `for`, `of` are as short; the owner's call.
- Implicit alternative, rejected: bind by identity without naming (needs candidate 1, then every same-named field
  binds). It saves one more line per operation and costs the explicit list; accidental binding of an unrelated
  `ticketId` is the failure.

**Failure prevented.** A wrong or incomplete key part; a view reading a lane under the wrong key (R: S-H3, M9, M10).
**Words:** +1 (`scope`); removes 13 key helpers, about 66 call-site lines (31+31+4), 16 `...ticketKey({ memory })`
spreads. **Verdict: absorb.** It is the largest single repeat in both apps.

### 3. Hold policy: re-send, then release, declared on the operation

**Repeated code.** After an unknown ending the author writes the same handler: `retryable({ times: N })` then `retry`,
else a notice and `cancel`. 31 `retryable` sites in 14 files. Budgets: 13 are `times: 1`, 6 are 2, 12 are 3 (4 of them
the same `MAX_RESENDS = 3`, declared four times). 22 are the one-shot form (a handler on the unknown event itself:
Cart ×2, Refunds, Visit ×2, Roster ×6, Comments ×2, Technicians ×2, history pin, toggle, queue ×2, Pay place and void);
9 are the timer form (a state, a `ResendDue` event, a `resend` schedule with an `armOn`/`disarmOn` list of 1 to 6
events, then the same trio). A further 10 handlers are release-only (`X: { target: "self", actions: [O.x.cancel] }`).
In all 30 give-up branches but 7 the answer to "what about the hold" is `cancel`; the 7 that keep it (Rename chip,
Resolve, editor SaveUnsure, Pay UNSURE, upload and body status) have an owner who is a UI element. REVIEW M4 is this
wiring wrong: `Restored` mapped to the re-sending event, so a re-send's `FileGone` came back `StillUnknown` and the
copy re-sent three times, then `GaveUp`.

2.9.5 kept this ("the shape, not the budget, delay or give-up reaction"; "a generic reconcile fragment cannot be
written"). The counts argue for splitting it: the budget has three values, the delay (4 of 4 timer sites) is
`"3 seconds"`, and the only real decision is the give-up reaction, which stays a handler here. This is a declared
policy, not a generic reconcile fragment.

```ts
// BEFORE: roster.machine.ts (unchanged definition says `unknown: E.MoveUnsure`)
MoveUnsure: [
  { target: "self", guard: [O.move.retryable({ times: 1 })], actions: [O.move.retry] },
  { target: "self", updateMemory: () => ({ notice: "We couldn't confirm that move" }), actions: [O.move.cancel] },
],
ArchiveUnsure: { target: "self", actions: [O.archive.cancel] },      // release-only, queue.machine.ts:337

// AFTER: roster.definition.ts
move: moveTechnician.outcomes({
  scope: ["workspaceId"],
  success: E.Changed, failure: { /* unchanged */ },
  unknown: E.MoveUnsure,
  hold: { resend: 1 },                    // NEW: `hold`. Flow re-sends the same Attempt once; the release follows delivery.
}),
archive: archiveTicket.outcomes({ success: Flow.ignore, failure: { /* … */ }, unknown: Flow.ignore, hold: { resend: 0 } }),
// roster.machine.ts: only the reaction is left
MoveUnsure: { target: "self", updateMemory: () => ({ notice: "We couldn't confirm that move" }) },   // delivered once, after the re-send also ended unknown
// owner-held ones keep the lane: `hold: { resend: 1, then: "keep" }` (NEW: then) and write RetryRename/DismissRename as today.
```

**Meaning.** `hold` is absent by default, so today's behaviour is the default (the lane stays `Held` until the author
acts, rule 45). With `hold`, Flow re-sends the same Attempt up to `resend` times; a re-send that ends in success or
failure is delivered as today; one that ends unknown again is not delivered. When the budget is spent, the mapped
`unknown` event is delivered once and (default `then: "release"`) the lane is released. `retryCount` on the row counts
the re-sends, so a view reads "trying again (1 of 3)" from the lane, not from memory.

**What Flow would have to own.** The re-send inside admission (it already does this for `HeldThisTurn`, 2.7.13); the
count; the release on delivery; `Story.ending` evidence `Resent`; `flow check` treats `hold` with `then: "release"` as
satisfying rule 45's owner (`UnresolvedHold`).

**What goes wrong, tried on different cases.**
- Pay's confirm: "never re-send blindly; reconcile first". Omit `hold`: unchanged. No new way to re-send a charge.
- A non-idempotent API: the same; `hold` is opt-in, and the server's dedup on `attempt.id` (rule 19) is the author's claim.
- `Restored` after a reload, `Cancelled`: `hold` covers only the unknown reasons that map to the policy's event; an
  entry mapped elsewhere (upload's `Lost`, `Stopped`) is not re-sent. This needs the tag record of candidate 4 to say
  which; a single `unknown: E.X` covers everything but `Cancelled`.
- `StillUnknown { failure }`: a re-send that met a definite answer after an earlier unknown. Re-sending again meets the
  same answer; the policy should stop and deliver at once. Not verified against the 2.7.13 table.
- `serialize` lanes (comments post, bulk close): the head's re-send blocks the queue exactly as today.
- Persisted lanes: a re-send whose lane-record capture fails ends `StorageRefused` (as today); treat as unknown.
- The timer form (9 sites: editor UNSURE, upload, autosave, body, comments post) keeps a visible mode and a countdown;
  not covered. A later `every: Duration` could cover the 4 plain ones; not proposed (UNSURE is a UI state, not plumbing).

**Failure prevented.** Mapping a reason to the re-sending event that should not re-send (R: M4); a forgotten `cancel`
that leaves a lane `Held` on a key (a `flow check` finding today); the `disarmOn` list missing a terminal ending.
**Words:** +1 (`hold`, with `resend` and `then`); removes 22 one-shot handlers' guard, `retry` and `cancel`, and 10
release-only handlers, which also drop their events. **Verdict: absorb, as an owner call**, because it reverses a
recorded "keep". If refused, candidate 5 still removes the release-only half of this.

### 4. One `Flow` key for all of Flow's reasons (item 14, now with counts)

**Repeated code.** Per-tag `unknown` records list Flow's five or six reasons by hand: 4 records (editor `save`, upload
`put`, body `save`, assistant `suggest`), each 8 to 9 entries of which 6 to 8 go to the same event. A read's failure
record lists `Defect` and `Interrupted`: 9 read records in the apps, and in all of them both go to the same event as
each other (and as `NoResponse` in 6). 6 more are stream records (roster, feed, presence). The streams v3 spec already
gives streams a `Feed` key for exactly this ("`Feed` covers Flow's reasons; a reason may be named, and it beats
`Feed`", proposal-v3 section 2.3); the desk's stream files still list them one by one.
**R:** M3 (`StorageRefused` omitted in two records) and M4 are omissions from these lists, and `flow check` has a rule
to catch them ("each Flow reason where it can occur", 2.7.13).

```ts
// BEFORE: editor.definition.ts
unknown: {
  Cancelled: E.SaveStopped, NoResponse: E.SaveUnsure, ServerError: E.SaveUnsure, Restored: E.SaveUnsure,
  Interrupted: E.SaveUnsure, Defect: E.SaveUnsure, StillUnknown: E.SaveUnsure, StorageRefused: E.SaveUnsure,
},
failure: { TicketNotFound: E.TicketGone, NoResponse: E.TicketLoadFailed, Defect: E.TicketLoadFailed, Interrupted: E.TicketLoadFailed },

// AFTER
unknown: { Cancelled: E.SaveStopped, NoResponse: E.SaveUnsure, ServerError: E.SaveUnsure, Flow: E.SaveUnsure },
failure: { TicketNotFound: E.TicketGone, NoResponse: E.TicketLoadFailed, Flow: E.TicketLoadFailed },
// `Flow` is NEW as a key: every Flow reason not named in the record. A named reason beats it (as `Feed` does).
```

**What Flow owns.** The set of Flow reasons per channel and kind (write unknown: `Cancelled`, `Restored`,
`Interrupted`, `Defect`, `StillUnknown`, `StorageRefused`; read failure: `Defect`, `Interrupted`; writes' `NotSent` stays
explicit because rule 20 ties it to where it can occur).

**What goes wrong.** (a) The author's own tags are not covered, deliberately: a new `Throttled` tag on the commit still
fails exhaustiveness. A broader `otherwise` would lose that, so it is rejected. (b) A reason that later gains meaning
(a new Flow reason) lands in the catch-all silently: it is added to Flow's reasons only in a release, and `flow check`
can list which reasons a `Flow:` entry swallowed. (c) With candidate 3, the entry decides re-sends. (d) The `Feed` and
`Flow` keys should be one concept across streams, reads and writes (one word, one rule); `Feed` is then a
spelling of it for streams, or is renamed.

**Failure prevented.** Omitted reasons (R: M3, M4). **Words:** +1 (`Flow` key); removes the "where it can occur" part
of rule 13/20 for these reasons and one `flow check` finding. **Verdict: absorb.** It is the cheap half and independent
of the rest.

### 5. `Flow.ignore`: an ending that needs no reaction

**Repeated code.** Rule 20 requires every ending handled, `{ target: "self" }` being "the explicit ignore". 39 bare
ignore handlers exist; 36 sit at the root. Of those, about 27 are for events handled nowhere else (declared in the
definition, mapped in `outcomes`, then ignored: Cart `QuantitySet`, `LineGone`, `Removed`; Roster `Changed`,
`EmailSent`, `IndexRebuilt`; Visit `Reserved`; Technicians `BreakSet`, `Dispatched`; queue `Archived`; the `NotSent` of
four traits). About 9 are late-only ignores of events a state handles for real (Pay's `Declined`, `Busy`, `PayRefused`,
`PayNotSent`, `AuthFailed`, `IntentRead`, `OrderSeen`, `CheckTick`; the editor's `SaveNotSent`). Pay's root `on:` alone is
a block of 11 events written twice (root and state); the editor has 5.

```ts
// BEFORE: cart.definition.ts + cart.machine.ts
internalEvents: { QuantitySet: {}, LineGone: {}, Removed: {}, /* … */ },                 // three events
setQuantity: setQuantityLine.outcomes({ success: E.QuantitySet, failure: { LineGone: E.LineGone }, unknown: E.QuantityUnsure }),
on: { QuantitySet: { target: "self" }, LineGone: { target: "self" }, Removed: { target: "self" } },

// AFTER
setQuantity: setQuantityLine.outcomes({ success: Flow.ignore, failure: { LineGone: Flow.ignore }, unknown: E.QuantityUnsure }),   // Flow.ignore is NEW
// no event, no handler
```

**What Flow owns.** Treating an ignored ending as satisfying rule 20 in every arrival (current, late, adopted); a
record `ignored` in `Story.ending` evidence and in `flow explain` ("save → ignored"), so Stories and the CLI still see it.

**What goes wrong, tried on different cases.**
- Sign-in's late `WrongCode` is a strike: the author maps it to a real event; nothing changes. Ignoring is a visible word
  at the mapping, so the person decides there, as rule 20 wants.
- A success that must act late (Pay's `Confirmed`): not ignored; the late-only half (9 sites) is **not** covered.
  Absorbing it would mean a default "late is ignored when exactly one state handles it", which contradicts rule 20's
  "Flow cannot know which late failures matter". Left alone.
- `unknown: Flow.ignore` is legal only with a `hold` that releases (candidate 3); otherwise it is an `UnresolvedHold`.
- Stories that assert on an ignored event by name (e.g. an expectation naming `Removed`) would change to the evidence
  record; not measured.

**Failure prevented.** A missing handler for an event nobody cares about (a `flow check` error today).
**Words:** +1 (`Flow.ignore`); removes about 27 event declarations and 27 handlers; the explicit-ignore handler
remains for the other uses. **Verdict: absorb.**

### 6. `lost`: which error tags mean "it may have happened"

**Repeated code.** `unknownWhenLost` is piped at the end of 40 of 44 commits (desk 32 of 35, checkout 8 of 9). The
helper is written twice, byte for byte (`dispatch-desk/features/shared/outcomes.ts`,
`checkout/features/Cart/cart.contracts.ts`; REVIEW listed it three times before the desk shared it), and `NoResponse`
and `ServerError` are declared in both apps (`Tickets/types.ts:156`, `adapters/types.ts:152`). The classification is
inside the commit's Effect, so `flow check`, Inspection and the Fakes cannot list which tags are unknown, and a Story
fake that must produce one has to know the tag by name. The four exceptions are real decisions: `authenticate` (only
`NoResponse`), `suggestReply`, `typingPing`, `pay`'s own branches.

```ts
// BEFORE: ticket.contracts.ts
commit: (input, { attempt, signal }) =>
  TicketApi.use((api) => api.saveTitle(input, { idempotencyKey: attempt.id, signal })).pipe(unknownWhenLost),

// AFTER
lost: ["NoResponse", "ServerError"],     // NEW on a transaction: error tags that end `unknown`
commit: (input, { attempt }) => TicketApi.use((api) => api.saveTitle(input, { idempotencyKey: attempt.id })),
// authenticate: lost: ["NoResponse"]; an explicit Outcome.unknown / Outcome.failure inside a commit still wins
```

**What Flow owns.** Classifying a commit's error as unknown when its `_tag` is in `lost`, before the classifier of
2.7.1; the type split (`failure` tags exclude `lost`, `unknown` tags include them).

**What goes wrong.** An API whose 5xx are definite: omit `ServerError`. GraphQL or tRPC with differently named
errors: list those. A tag in `lost` that the commit cannot fail with: a type error. Per-call exceptions: `Outcome.failure`
inside the commit wins, as today. A helper `Outcome.unknownWhen([...])` would be the "offer as helper" form; it leaves
the classification opaque to the CLI, so the declaration is preferred.

**Failure prevented.** None silent; it makes a hidden decision visible to `flow check` and the Fakes.
**Words:** +1 (`lost`); removes the helper (2 copies) and 40 pipes. **Verdict: absorb as a declaration.** The name clashes
with the `unknown:` option of `outcomes`, which is why it is not `unknown`.

### 7. Drop `signal` from lookup and commit

**Repeated code.** `{ signal }` appears on 61 lines in 13 files; the port types declare `options: { signal }` on every
method (239 mentions in ports and adapters). Most adapters ignore it (`technicians-api.ts`, `ticket-api.ts`'s HTTP
layer), and `roster-api.ts:211` turns it back into an interruption with `Effect.raceFirst(abortOf(signal))`. Five
hand-made `AbortController`s exist: three throwaway (`host.ts:71`, `http-api.ts:138`, `roster-api.ts:285`) and two
`acquireUseRelease` contraptions rebuilding what Effect gives (`feed.contracts.ts:65`, `roster.contracts.ts:207`).
**R:** REVIEW M7 and S-M2 name two of them, and S-M2's fix is "the port takes no signal; `Effect.tryPromise((signal) => …)`".

```ts
// BEFORE: ticket.contracts.ts, ticket-api.ts
lookup: (key, { signal }) => TicketApi.use((api) => api.load(key, { signal })),
load: (key: TicketKey, options: { signal: AbortSignal }) => Effect<TicketRow, TicketNotFound | NoResponse>;

// AFTER
lookup: (key) => TicketApi.use((api) => api.load(key)),
load: (key: TicketKey) => Effect<TicketRow, TicketNotFound | NoResponse>;
// the adapter, as http-api.ts:192 already does: Effect.tryPromise((signal) => fetch(url, { signal }))
```

**What Flow owns.** Nothing new: the commit's fiber is interrupted on cancel (rule 24) and Effect hands every
`tryPromise` and `Effect.callback` its signal.

**What goes wrong.** A Promise-only SDK with its own cancel token: `Effect.tryPromise((signal) => sdk.call(x, { signal }))`,
the same line. Streaming bodies (assistant): the stream's scope closes the body on interruption. Upload with progress
through XHR (resolve): `Effect.callback((resume, signal) => …)`. Code running outside any fiber (the `host.ts` demo): it
calls the port through `runtime.runPromise`, which already owns a fiber.

**Failure prevented.** A signal nobody aborts (R: M7, S-M2) and the contraption that reconstructs it. **Words:** removes
`signal` from the lookup and commit contexts. **Verdict: absorb, a removal.** `attempt.id` is the other half of
the options bag; it stays (section 4, ambient attempt).

### 8. Leaving: warn on unload, and refuse sign-out with unsettled writes

**Repeated code.** The `beforeunload` handler is written twice, with the same five lines (`app/host.ts:36-44`,
`checkout/features/Pay/Pay.tsx:43-55`), and sign-out checks `unsettledWrites()` by hand before `dispose({ forget: true })`
(`host.ts:104-114`). `forget: true` then drops the lane records that let the next sign-in learn how a write ended
(rule 44). Flow knows the lanes; the author only has to remember.

```ts
// BEFORE: Pay.tsx
const warn = (event: BeforeUnloadEvent) => { if (runtime.unsettledWrites().length === 0) return; event.preventDefault(); };
addEventListener("beforeunload", warn);  /* … */  removeEventListener("beforeunload", warn);
// host.ts signOut: if (runtime.unsettledWrites().length > 0) { if (!(await confirmDiscard(lost))) return "Refused"; }
//                  await runtime.dispose({ forget: true });

// AFTER
const setup = runtimeSetup({ app, services, persistence, onUnload: "warn" });    // NEW: onUnload; default "warn" in a browser setup
await runtime.dispose({ forget: true });             // fails UnsettledWrites { lanes } while any lane is unsettled
await runtime.dispose({ forget: true, discard: true });   // NEW: discard. The author's own confirmDiscard decides to pass it
```

**What goes wrong.** A non-browser or server runtime: the option is inert. An app that wants no prompt (a kiosk):
`onUnload: "silent"`. A persisted lane may survive a reload safely (it restores `Held`), but an in-flight request is
still lost on unload, so warning is right for any `InFlight` lane; a `Held` persisted lane could be exempt (open question).
`dispose({ forget: true })` today never fails; adding a failure to it is a behaviour change for the 1 site.

**Failure prevented.** Silent loss of an in-flight write on tab close or sign-out. **Words:** +1 (`onUnload`), +1
(`discard`); removes 2 listener copies and the hand-written sign-out check. **Verdict: absorb.** The count is small; the
failure is data loss, and it is correctness-first.

### 9. An absent subject: a `null` part means "not placed" or "not called"

**Repeated code.** To satisfy `Schema.String` an absent id is spelled `""`: 9 `?? ""` in machine inputs (queue
`previewId` twice, cart `removing`, roster `skillsFor`, resolve `signatureRef`, pay `paymentMethodId` and
`clientSecret`, order-summary slot, queue draft title). Roster's `SaveSkills` guards `skillsFor !== null` and then still
writes `skillsFor ?? ""` in the commit, because TypeScript cannot carry the guard to the select. Comments guards the
sentinel with `noTicket` at 5 call sites (`comments.trait.ts:206, 252, 278, 338, 376`) because the queue's preview trait
is always placed (rule 59) with `ticketId: ""`. **R:** M8 is the post that still got through (`Post` into ticket `""`,
path `[""]`), and M11 the belief that nothing is placed while `previewId` is null.

```ts
// BEFORE: queue.machine.ts
preview: { input: ({ memory }) => ({ workspaceId: memory.workspaceId, ticketId: memory.previewId ?? "" }),
           resetOn: ({ memory }) => memory.previewId ?? "", /* … */ },
// comments.trait.ts: five guards `noTicket`

// AFTER
preview: { input: ({ memory }) => memory.previewId === null ? undefined : { ticketId: memory.previewId },   // undefined: not placed (NEW meaning)
           resetOn: ({ memory }) => memory.previewId, /* … */ },
// a commit or lookup selector returning undefined: no call, and `check()` denies `NoSubject` (NEW code)
```

**What goes wrong.** Rule 56: ending a placement that holds a write must park or release it; an unplaced preview with a
post on the wire is the A, B, A case the queue already tests. Rule 59 says a root trait is always placed, which this
changes. The ending of an `idle`/`retry` on an unplaced fragment needs a defined answer. This is why it is "after a design
round", not "now". A `null` in a scope field (candidate 2) becomes the same meaning, so the two belong together.

**Failure prevented.** Calls with a sentinel key (R: M8). **Words:** +0 words, +1 meaning (`undefined` from a select);
removes 9 sentinels and 5 guards. **Verdict: absorb after a design round** (rules 56, 59, 22).

### 10. The entity key of a one-record write comes from its input

**Repeated code.** `domain.ts` files: 29 `patch`/`delete` calls, 11 with a literal key of the input's same-named fields
(`Ticket.patch({ workspaceId: input.workspaceId, ticketId: input.ticketId }, …)`), 3 `.byKey` of the same shape, and 4
local key helpers (`ticketOf`, `keyOf`, `techKey`, `team`).

```ts
// BEFORE: ticket.domain.ts
saveTitle: write(saveTitle).one(Ticket).predicts(({ input }) =>
  Ticket.patch({ workspaceId: input.workspaceId, ticketId: input.ticketId }, { title: input.title })),
// AFTER (no new word): passing `input` is the key; Flow picks the primary-key fields and ignores the rest
saveTitle: write(saveTitle).one(Ticket).predicts(({ input }) => Ticket.patch(input, { title: input.title })),
```

**What goes wrong.** The input names a differently named key (`id` for `ticketId`): then the literal stays, as for the
roster's `Team.patch(team(…))` on another entity. Types: the rule "extra fields are ignored" is stated for contract keys
(design 2.7.3); it must be stated for entity keys as well. Branded keys (item 11) would tighten both and stay deferred.
**Failure prevented:** none (brevity). **Words:** +0, -4 helpers. **Verdict: absorb as a stated rule**; no new API.

### 11. A fragment's `input` as a list of same-named fields

**Repeated code.** 11 of about 20 trait and subroutine fillings are pure same-name picks from the host's memory
(`editor.machine.ts` `comments`, `body`; `panels.machine.ts` three; `pay.machine.ts` `cartId`, `intentId`; the editor's
`fields` and `uploads` plus `item`).

```ts
// BEFORE
comments: { input: ({ memory }) => ({ workspaceId: memory.workspaceId, ticketId: memory.ticketId }), callbacks: { /* … */ } },
// AFTER (a second form of `input`, no new word)
comments: { input: ["workspaceId", "ticketId"], callbacks: { /* … */ } },     // data, not a function: `flow explain` can draw the edge
```

**What goes wrong.** Reading is fine, and as data it improves static analysis (the host→fragment edge is visible
without running a function). Two forms of `input` is a cost. Renamed fields keep the function form. Name-matching with
no list at all is rejected (accidental binding).
**Verdict: offer**, if candidate 2's `scope` list is accepted; the two share a spelling. Else leave.

### 12. A Story's id from its file and export name

**Repeated code.** 45 `Story.make` calls; ids are authored strings, "unique across the configuration" (2.10.1). A rough
regex pass found 191 exported Stories, 174 of whose ids equal the directory plus the kebab-cased export name. REVIEW
cross-batch checks and the conversion notes (74 of 190 share a name with a checkpoint) show ids and names drifting.
**After:** `id` optional, defaulting to `<module path>#<export name>`; an explicit id overrides.
**What goes wrong.** Renaming an export changes the id used in saved traces and `flow story run <id>`; keep the explicit
form for ids that outlive refactors. Helper-built Stories (`editor("editor/saved")`) lose the id argument. **Words:**
removes the id string. **Verdict: offer**; low value, and ids are public names.

### 13. The app's fake as a default fixture

**Repeated code.** 44 of 45 `Story.make` list `fixtures: [DeskClient]` or `[StripeFake]`: the app has one fake client
half. `defineConfig({ apps: [{ app, stories, fixtures }] })` could default it; a Story overrides. A missing fake stays a
type error because `fixtures` must still meet the subject's `R` (2.10.1). **Verdict: offer**; modest, and it hides which
fake a Story runs under.

## 3. Candidates that extend, not repeat, the earlier audit

The 2.9.5 table and item 15's list, answered with this evidence:

| Item 15 lead                                    | Now                                                                                           |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Retry-budget trio                               | Candidate 3 (31 sites, three budgets, one delay): split policy from reaction                  |
| Releasing a held write in toast-only handlers   | 10 release-only handlers: candidates 3 and 5                                                  |
| Key selectors in user events                    | Candidate 2 (113 copies, 13 helpers); candidate 1 for the ref half                            |
| Mirroring lane state into memory                | Section 4: 7 fields, 14 writes of `sending`/`unsure`; no API change needed                    |
| Policy as one value, #10                        | Candidate 3 is its smallest honest part; the backoff half is left (section 4)                 |
| A catch-all for `unknown` (item 14)             | Candidate 4, narrowed to Flow's own reasons so exhaustiveness over the author's tags is kept  |
| `Feed.Missed`, feeds as tables                  | Streams v3, settled; not repeated                                                             |

## 4. Rejected, left alone, or not an API change

| What                                               | Counts                                                    | Why not                                                                                                   |
| -------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `idle` implied on every `commit` of a `reject` lane | 30 `reject` operations; 25 `idle` guard lines against 56 commit lines, so many commits go without it (several are `target: "self"` or not behind a button) | Rule 16 makes a decline an ending that refuses only the write; some transitions want it. `flow check` already warns on a state-changing transition without it. A default would hide a decision some sites really make |
| Order tail from the primary key (`orderBy`)         | 12 `orderBy`, 20 key-tail lines                           | The tail must match the server's own tiebreak; it is a contract with the server, not wiring. Gap 33's real fix is typing a shared order (4 identical orders in `ticket.domain.ts`) |
| Backoff retry of a definite failure                 | 2 sites (editor `LOCKED` + `lockRetries`; Pay `WAITING` + `busyTries`) | Two sites, different hints (exponential vs server `retryAfter`), different give-up, and both states are visible UI modes. Revisit at a third site |
| Drafts-in-memory pattern (`creating`, `inviting`, comment drafts) | 3 `editDraft`/`editInvite` helpers, 3 prune-against-list copies | The status vocabulary differs per app; 2.9.5 already kept it |
| `notice`/`error` memory plus a dismiss event        | 7 notice fields, 59 writes, 15 files, 3 `DismissNotice`    | The text is the author's. Toasts exist for the rest. A helper would hide a decision |
| Client-minted ids (`crypto.randomUUID()`)           | 5 mint sites in views; 4 key fields (`draftId` ×2, `clientId`, `ref`) | Needs a turn id source (open item 12) and Stories determinism. `attempt.id` could key a create lane; not enough evidence to design |
| HTTP adapters and fake route tables                 | 20 `new NoResponse()`, 19 `new ServerError(`, 34 `encodeURIComponent`, 9 fakes parse the URLs the adapters build | Flow is not a network library (owner). This is items 13 and 28; a separate package, not Flow |
| `idempotencyKey: attempt.id` as an ambient service  | 41 lines                                                  | Types already require it; forgetting is a compile error. The cost is brevity and one `R`; not worth a service |
| `isAdmin` guard on 8 roster handlers                | 8 in one file                                             | An app decision, visible per handler; a group guard is a concept for one file                              |
| Lane status mirrored in memory (`sending`, `unsure`) | 7 fields, 14 writes                                       | Not an API change: `O.x.get(s, key).pending/.uncertain` and `O.x.get(operations, k)` in guards already exist. Recommend deleting the two literals from those schemas. The definite ones (`failed`, `stored`) are not lane facts |
| Schedules that arm a handler only to commit on entry | 0 ms entry schedules (upload `start`, queue `firstMinute`) | Open item 1                                                                                               |
| Server and client both `ensure` the page's actors   | 2 sites (`page.tsx`, `QueueClient`)                       | Not derivable without running the tree                                                                    |
| Late-only ignores (Pay's 8, the editor's 1)         | 9                                                         | Rule 20: Flow cannot know which late endings matter                                                       |

## 5. Not verified

- The line counts are by regex; handlers over several lines and renamed imports can hide or double a site. The
  directions are firm, the exact figures are not.
- Candidate 3's `StillUnknown` stop and `hold` over `Restored` need the 2.7.13 table read against them.
- Candidate 5: Stories and tests that name an ignored event were not counted.
- Candidate 12's 174 of 191 is a rough regex and likely overstates.
- None of this was type-checked or run.
