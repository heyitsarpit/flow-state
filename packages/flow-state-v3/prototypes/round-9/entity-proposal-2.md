# Entity store, second proposal

Status: **everything here is proposed.** Nothing in `.plan` files or `machine-design.md` changed, and no runtime code. `entity-proposal.md` stays as prior art, and this does not patch it: section 1 gathers every finding, section 2 states one design for all of them. The owner delegated design calls while asleep; two of them are marked **FOR THE OWNER'S READ** (Q1, section 5; A9, section 9). Marks: **[ran]** on `entity-model-2/` or on TanStack DB's real source, **[read]**, **[reasoning]**. Nothing ran on Flow's runtime, because none exists for this design.

**What changed, in one paragraph.** The central rule survives, with one sharpening: the only *proof* of order is local (this was asked after we knew), and a server's version orders only what that cannot. Four things follow. Every Attempt writes one record ahead of its first send, whatever its lane. Every ending speaks for every field the Attempt touched. Every mark has a named exit or a named reason. And `rest`, `landsWithin`, the dropped-row doubt and `perField` are gone. No wall clock decides anything.

## 1. Everything gathered, by root cause

Five roots, not twenty findings. "Finding" is the review's name; `R` is the first proposal's own section 13.

| Root cause | What it broke | Findings it covers |
| --- | --- | --- |
| **A. A version was treated as the truth.** It is a claim by a server. Only "asked after we knew" is proof | A tie repairs for ever. A restart hides behind silent `before`. A versionless 404 sets a floor that blocks the truth. A no-bump 204 stays marked for good | H1, H2 (T2, T3, T4), M3's `before` |
| **B. The durable record followed the lane.** What must survive is the Attempt's footprint on the store, and many Attempts have no lane when it matters | A bare, `allow`, `cancel` or non-persisted write lands with no record at all | H3, M5 (fields lost across reload), M10 (one key per row) |
| **C. Only an unknown spoke for what a write touched.** A success spoke only for what it carried | A 204 leaves `.alsoChanges` totals clean and wrong. The version field's claim was a hand edit outside the judge | H4, M1's second half, I2's contradiction |
| **D. One mark answered two questions:** "should a person look?" and "can a read end this?" Marks had no required exit | Rule 32's replacement put a false `?` on screen for ten minutes, or for ever. `unconfirmed` refresh feeds itself. 1,264 walks ended stuck. The oracle could not see any of it | H5, Q1, M2, M3 |
| **E. Assumptions and absences were read as evidence.** | A query's absence became a delete. `order`, session completeness and re-send dedupe decide silently. One session's flap marks every record. A list's missing row raised a doubt in one section and carried nothing in another | H6, A9, M7, M8, M9, R4 |

And the smaller ones, each handled once below: `rest` (M1, section 2.3), equality (M4, 2.2), `Touch.fields` from closures (M5, 4.1), pick and patch (M6, 3.4), bulk (M10, 4.4), and the Low list (section 10).

## 2. The design

### 2.1 The rule

> **An answer decides a field only if it carries that field and can be ordered after what the store holds for it. What it carries and cannot order, it cannot decide: the store keeps its value and marks a doubt. What it does not carry, it does not touch.**

Unchanged, because every attack that kept its premises failed [the review, ran]. What changes is what "can be ordered" means:

> **Proof of order is local: this was asked after we knew. A version orders only what that cannot. When they disagree, nothing is decided.**

### 2.2 The judge

Two facts about an answer: **carries** (exactly which fields, from its Schema) and **position** (a server version if it has one, and always the moment it was truly asked, `from`). Three about a cell: `at`, `exact` (is `at` a real version, or only a floor because the value arrived without one), `landed`.

```ts
// Internal. Authors never see it. entity-model-2/store.ts, `position`, is this function.
const position = (e: Evidence, c: Cell | undefined): "after" | "before" | "overlap" | "backwards" => {
  if (c === undefined) return "after"
  const asked = e.from >= c.landed                       // asked after we knew. The only proof
  if (e.at === undefined || c.at === undefined) return asked ? "after" : "overlap"
  const k = cmp(e.at, c.at)                              // Effect `Order`. Incomparable: treated as a missing version
  if (c.exact) {
    if (k > 0) return "after"                            // a later version, whenever it was asked
    if (k === 0) return asked ? "after" : "overlap"      // H1: a tie goes to the read asked later
    return asked ? "backwards" : "before"                // H2: earlier and asked after: a contradiction, never silence
  }
  // `at` is a floor. The value came without a version, or a success claimed it
  if (k > 0) return asked ? "after" : "overlap"
  if (k === 0) {
    if (!asked) return "overlap"                         // a tie that overlaps cannot be ordered, claim or not: a version need not move
    return c.claim === "value" ? "backwards" : "after"   // T3: a 404's floor does not block the truth. T4b: a read against what we claimed does
  }
  return asked ? "backwards" : "before"
}
```

| Position | Value equal (`Schema.toEquivalence`, per field) | Value differs |
| --- | --- | --- |
| `after` | take the value and window | take the value and window |
| `before` | keep; older doubts close | keep; older doubts close |
| `overlap` | keep, window moves, claim ends (a *blank* claim stays) | keep; **conflict** |
| `backwards` | keep, window moves, claim ends (T4) | keep; **conflict, named `VersionWentBack`** |

Equality is `Schema.toEquivalence` on the field's Schema, derived at load, with nothing for an author to write. **[ran, effect 4.0.5]** `Schema.Date` and a struct of an array and a date compare by value. With `===`, the model raises a spurious doubt on every overlapping read of a struct (`identityEq` fails 13 of 13, on the `boxed` suite). A field whose Schema has no equivalence is a `flow check` error.

A tombstone is a whole answer whose values are absent. `$present` is a field, so `A4` is the same comparison as a title. Key fields have no cell.

### 2.3 `rest` is gone

`rest` was never a fact. `none` is "carries everything", and `unchanged` versus `unknown` is not declared by an answer: it is whether a live session covers this record when the answer lands. So:

```ts
// The whole of what `rest` did. Internal.
if (e.at !== undefined && perRecordVersion && !covered(record)) seen = max(seen, e.at)
// A cell reads `behind` when c.at < seen.
```

`covered` is computed at landing: a live session whose `.covers` includes the record, or, with no `.covers`, a session that has itself delivered this record (section 3.3). **[ran]** `noBehind` fails 7 of 13, so `behind` must stay. There is no `rest` in any public word or in `Compiled`.

### 2.4 Doubts have one shape and one closing rule

```ts
type Conflict = { f: string; to: number; asks: number; wentBack: boolean }       // two answers disagreed, or a contradiction
type Open     = { f: string; attempt: string; given: number | null; quiet: boolean; basedOn?: unknown }   // a request may still land
```

- **A conflict closes** when evidence carrying that field started after it (`from >= to`) and did not itself conflict. That includes a `before`: if a read asked after the doubt is older than the cell, the cell is newer than something that started after the doubt. This is the fix for the review's stuck walks. **[ran]** `beforeClosesNothing` fails 9 of 13.
- **A conflict asks** the entity's repair, one in flight per record, at most **3** times per doubt, with backoff for pacing only (a count, not a guess about a network). Then it is named: `VersionWentBack` if it was a contradiction, `RepairOverdue` otherwise. The mark stays, and a later version or a later answer still closes it. **[ran]** the longest walk asked for 12 repairs, across all its doubts.
- **An open doubt never closes by a read.** Section 5.
- A conflict is memory. A reload drops it, and every restored cell reads `unconfirmed` anyway. An open doubt is durable. Section 4.

### 2.5 Every mark has an exit

This table is the design's oracle, and the model enforces it.

| Mark | Cause | A person should look? | Asks? | Exit | No exit: named |
| --- | --- | --- | --- | --- | --- |
| `predicted` | an open write's overlay | no | no | that Attempt's end, or its forced repair | |
| `uncertain` | conflict | yes | repair, up to 3 | evidence after it | `RepairOverdue`, `VersionWentBack`, `NoRepair` |
| `uncertain` | Open, Held | yes | forced repair, once | the lane's end: re-send succeeds, or it is given up | none: OD19 |
| `uncertain` | Open, given up, no read since | yes | one read | **demotes**: a read asked after give-up, or a later write's success | `NoRepair` |
| `unconfirmed` | Open, given up, read since | **no** | **never** | re-send cannot happen, so: a `guarded` Attempt's version passes its base | `MayStillLand` |
| `unconfirmed` | claim: a success did not carry a touched field | no | refresh, live answers only | a read asked after | |
| `unconfirmed` | behind: `c.at < seen` | no | refresh, live answers only | a read asked after | |
| `unconfirmed` | gap: `c.since < staleBefore` of a covering session, or a boot | no | refresh, live answers only | a read asked after | |
| `missing` | no cell, or an absent one | no | one read, if a live view picks it and a repair exists [reasoning] | evidence carrying it | `NoRepair` |

A `.where` over any marked field is "maybe", as before. A `MayStillLand` field asks nothing, so "maybe" on it refetches the list once, not for ever [reasoning].

### 2.6 The refresh cannot feed itself

**A refresh's answer can mark, but cannot ask.** Only news asks: a write's settlement, a gap, an answer that was not itself a refresh. Each live answer refreshes at most once per such event, one in flight.

**[ran, `sim.ts`, two live answers with disjoint picks, 1,000 RTTs, a write every RTT]**

```text
refresh does not feed; per-record version     2 requests
MUTANT refresh feeds                          1000 requests   (the review's number)
per-collection version, this record unwritten 0 requests
MUTANT per-collection, behind on, feeds       1000 requests
```

The mark on the other answer stays, honestly, until something else reads it. The cost is real: an open detail view can read `unconfirmed` after a list refetch it did not cause, with no refetch of its own. I think that's right, and it's the first thing a real app should check.

## 3. Source of the data, then the code

### 3.1 Where it comes from

Flow calls nothing. The author's service calls `fetch` or an SDK, the contract's Schema says what came back, and evidence is the value after that Schema.

```ts
// ticket-api.ts. user-defined: everything here. The real API, with its real partial answer.
export const TitleSaved = Schema.Struct({ title: Schema.String, revision: Schema.Number })

export const saveTitle = (i: TicketKey & { title: string }, o: { idempotencyKey: string; ifMatch?: number; signal: AbortSignal }) =>
  Effect.tryPromise({
    try: () => fetch(`/w/${i.workspaceId}/tickets/${i.ticketId}`, {
      method: "PATCH",
      headers: {
        "Idempotency-Key": o.idempotencyKey,
        ...(o.ifMatch === undefined ? {} : { "If-Match": String(o.ifMatch) }),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title: i.title }),
      signal: o.signal,                                     // AbortController lives in the contract's lifetime, not in the store
    }).then((res) => (res.status === 412 ? Promise.reject(new TicketChanged()) : res.json())),   // { title: "new", revision: 2 }
    catch: (e) => (e instanceof TicketChanged ? e : new NoResponse()),
  }).pipe(Effect.flatMap(Schema.decodeUnknownEffect(TitleSaved)))
```

```text
fetch  → service → contract.commit (output: TitleSaved) → settlement → carries { title, revision }, at 2, from = first send → judge, per field → one publication
                                                                     → touched and not carried → a claim, per field           ↗
socket → Feed.callback → stream contract → listen.as → carries, at, from = session proof → judge, per field → one publication
```

A prediction never goes through the judge. It is an overlay in queue order, replayed over the cells, as today. `from` is taken with `cx.pos()` when a request truly starts, so pacing cannot reach the judge (I7).

### 3.2 Before and after, complete

The server answers `PATCH` with two fields, and its socket sends patches. **Before** is the first proposal's section 3, the last draft. The trait, definition and machine **do not change**, and they're written out so that can be checked.

```ts
// ticket-api.contracts.ts. BEFORE
export const saveTitle = transaction({
  id: "DispatchDesk/save-title",
  input: { workspaceId: Schema.String, ticketId: Schema.String, title: Schema.String },
  output: TitleSaved,
  key: ["workspaceId", "ticketId"],
  concurrency: "reject",
  landsWithin: "10 minutes",                 // first proposal's word. A guess about a network that every author made by default
  commit: (input, { attempt, signal }) => TicketApi.use((api) => api.saveTitle(input, { idempotencyKey: attempt.id, signal })).pipe(unknownWhenLost),
})
```

```ts
// ticket-api.contracts.ts. AFTER
export const saveTitle = transaction({            // existing: transaction
  id: "DispatchDesk/save-title",                  // existing: id; user-defined value
  input: { workspaceId: Schema.String, ticketId: Schema.String, title: Schema.String },   // existing: input
  output: TitleSaved,                             // existing: output; user-defined: TitleSaved
  key: ["workspaceId", "ticketId"],               // existing: key
  concurrency: "reject",                          // existing: concurrency
  guarded: true,                                  // NEW: guarded. Says: this contract sends `basedOn` as If-Match and maps 412 to a failure. Optional. It is the only thing that lets a given-up mark end
  commit: (input, { attempt, basedOn, signal }) =>   // existing: commit, attempt, basedOn, signal
    TicketApi.use((api) => api.saveTitle(input, { idempotencyKey: attempt.id, ifMatch: basedOn, signal })).pipe(unknownWhenLost),   // user-defined: TicketApi, unknownWhenLost
})
// DROPPED: landsWithin
```

```ts
// ticket.domain.ts. BEFORE
export const Ticket = entity({
  id: "DispatchDesk/Ticket",
  fields: TicketRow.fields,
  primaryKey: ["workspaceId", "ticketId"],
  version: "revision",
})
export const TicketsDomain = domain("tickets", {
  ticketById: read(ticketById).one(Ticket).byKey(({ input }) => ({ workspaceId: input.workspaceId, ticketId: input.ticketId })).gone("TicketNotFound"),
  saveTitle: write(saveTitle)
    .one(Ticket.pick("title", "revision"))     // where its key came from was unsaid; section 7 of the first draft called this a type error
    .predicts(({ input }) => Ticket.patch({ workspaceId: input.workspaceId, ticketId: input.ticketId }, { title: input.title })),
})
// feed.domain.ts. BEFORE
export const TicketFeed = domain("ticket-feed", {
  changes: listen(ticketChanges).as([Ticket], (event) => {
    if (event._tag === "TicketRemoved") return Ticket.delete({ workspaceId: event.workspaceId, ticketId: event.ticketId }, { version: event.revision })
    if (event._tag === "TicketPatched") {
      const { workspaceId, ticketId, ...fields } = event.patch
      return Ticket.patch({ workspaceId, ticketId }, fields)    // one word with two meanings: here a delta needing `revision`, in `.predicts` not
    }
    return Ticket.row(event.ticket)
  }),
})
```

```ts
// ticket.domain.ts. AFTER
export const Ticket = entity({                   // existing: entity
  id: "DispatchDesk/Ticket",                     // existing: id; user-defined value
  fields: TicketRow.fields,                      // existing: fields; user-defined: TicketRow
  primaryKey: ["workspaceId", "ticketId"],       // existing: primaryKey. Compiles to keyFields with their Schemas
  version: "revision",                           // existing word, meaning as first proposed: which field says what version an answer speaks from. Must be monotonic across a key's re-creations; if it restarts, leave it out
})
export const TicketsDomain = domain("tickets", {   // existing: domain
  ticketById: read(ticketById)                   // existing: read
    .one(Ticket)                                 // existing: one. Whole
    .byKey(({ input }) => ({ workspaceId: input.workspaceId, ticketId: input.ticketId }))   // existing: byKey. Also the entity's repair
    .gone("TicketNotFound"),                     // NEW: gone. This error means "no such record". user-defined: the tag
  saveTitle: write(saveTitle)                    // existing: write
    .one(Ticket.pick("title", "revision"))       // existing: one, pick. NEW: pick as a target. Type error unless the output has exactly these. The key is the input's, by name
    .predicts(({ input }) =>                     // existing: predicts
      Ticket.patch({ workspaceId: input.workspaceId, ticketId: input.ticketId }, { title: input.title })),   // existing: patch. A prediction, and only that
})
// feed.domain.ts. AFTER
export const TicketFeed = domain("ticket-feed", {
  changes: listen(ticketChanges)                 // existing: listen
    .covers(({ input, record }) => eq(record.workspaceId, input.workspaceId))   // NEW: covers. What this session promises to tell us about. existing: eq
    .as([Ticket], (event) => {                   // existing: as
      if (event._tag === "TicketRemoved")
        return Ticket.delete({ workspaceId: event.workspaceId, ticketId: event.ticketId }, { version: event.revision })   // existing: delete, version
      if (event._tag === "TicketPatched") {
        const { workspaceId, ticketId, ...fields } = event.patch
        return Ticket.delta({ workspaceId, ticketId }, fields)   // NEW: delta (`patch` split in two). In `listen` only. `fields` must include `revision`, by type
      }
      return Ticket.row(event.ticket)            // NEW: row. A whole row, in a frame
    }),
})
```

```ts
// title-editor.trait.ts. Unchanged, before and after
export const TitleEditor = trait(                                             // existing: trait; user-defined: TitleEditor
  {
    id: "TitleEditor",
    events: { Save: { title: Schema.String } },                                // existing: events; user-defined: Save
    internalEvents: { Saved: {}, Refused: {}, Unsure: Flow.uncertain({}) },   // existing: internalEvents, Flow.uncertain
    memory: {                                                                  // existing: memory, Flow.input
      workspaceId: Flow.input(Schema.String),
      ticketId: Flow.input(Schema.String),
    },
    operations: ({ E }) => ({                                                  // existing: operations, outcomes
      save: TicketsDomain.saveTitle.outcomes({
        success: E.Saved,
        failure: { TicketNotFound: E.Refused, TicketLocked: E.Refused, TitleRejected: E.Refused, TicketChanged: E.Refused, NotSent: E.Refused },   // user-defined: the tags
        unknown: E.Unsure,
      }),
    }),
  },
  ({ E, O }) => {
    const own = ({ memory }: { memory: { workspaceId: string; ticketId: string } }) => ({ workspaceId: memory.workspaceId, ticketId: memory.ticketId })   // user-defined
    return {
      on: {                                                                    // existing: on, target, actions, guard
        Save: { target: "self", actions: [O.save.commit(({ memory, event }) => ({ workspaceId: memory.workspaceId, ticketId: memory.ticketId, title: event.title }))] },   // existing: commit
        Saved: { target: "self" },
        Refused: { target: "self" },
        Unsure: [
          { target: "self", guard: [O.save.retryable(own, { times: 3 })], actions: [O.save.retry(own)] },   // existing: retryable, retry
          { target: "self", actions: [O.save.cancel(own)] },                   // existing: cancel. Gives up. One read later `?` becomes quiet; the mark ends when a version passes `basedOn`
        ],
      },
    }
  },
)
```

```ts
// desk.definition.ts. Unchanged
export const Desk = definition({                                               // existing: definition
  id: "DispatchDesk/Desk",
  states: ["OPEN", "FEED_ENDED"],
  events: { Pick: { ticketId: Schema.String } },
  internalEvents: { FeedEnded: {} },
  memory: { workspaceId: Flow.input(Schema.String), ticketId: Flow.initial(Schema.String, "t1") },
  traits: { editor: TitleEditor },                                             // existing: traits
  operations: ({ E }) => ({ feed: TicketFeed.changes.outcomes({ failure: { Feed: E.FeedEnded } }) }),   // existing: outcomes
})
// desk.machine.ts. Unchanged
export const DeskMachine = machine(Desk, ({ S, O }) => ({                      // existing: machine
  default: S.OPEN,
  traits: { editor: { input: ({ memory }) => ({ workspaceId: memory.workspaceId, ticketId: memory.ticketId }) } },
  states: {
    OPEN: {
      activities: [O.feed.subscribe(({ memory }) => ({ workspaceId: memory.workspaceId }))],   // existing: activities, subscribe
      on: {
        Pick: { target: "self", updateMemory: ({ event }) => ({ ticketId: event.ticketId }) },
        FeedEnded: S.FEED_ENDED,
      },
    },
    FEED_ENDED: {},
  },
}))
```

```tsx
// TicketTitle.tsx. Unchanged from the first proposal
const key = { workspaceId, ticketId }                                      // user-defined
const t = useView(desk, (s) => Ticket.get(s, key, Ticket.pick("title")))   // existing: get, pick. Handed a key, so the pick needs none
// { data: { title }, predicted, uncertain, unconfirmed, missing }         // existing: the first four, about `title` alone. NEW: missing
<h1 className={t.predicted ? "grey" : ""}>{t.data?.title}{t.uncertain ? " ?" : ""}</h1>
```

### 3.3 `.covers`: one word, two uses, both defaults over-mark

```ts
// M8. No `.covers`: a gap marks every record of the entity (safe, loud). A partial answer trusts only a record this session has itself delivered.
// `.covers(...)` narrows the gap to those records, and lets a partial answer trust any record in them. It is a claim, so it is on the trust list.
```

A gap is `staleBefore` per session, read through `.covers`, plus one integer per entity for a boot. **[ran]** `gapEntityWide` fails on a session whose `.covers` excludes the record; `helloNoGap` and `dropNoGap` fail 8 of 13 each. One record, so this tests one covered or uncovered record, never two side by side.

**First load, decided:** a read and a `listen` starting together fetch twice for a live view. The first hello must mark what was read before it, and nothing else can know what fell between the read's snapshot and the proof. The read still shows at once, marked `unconfirmed`, with one refresh at hello. A machine that wants one fetch starts the read after `live`, which it can already do. Stated, not hidden. This is subscribe-then-snapshot, and I see no cheaper correct form [reasoning].

### 3.4 Pick and patch, settled **[ran, `types-spike.ts`, tsc 7.0.2: 7 expected errors, all real]**

| Question | Answer | Marked |
| --- | --- | --- |
| Where does a write's key come from? | The output, else the input by name, else `.byKey`. Otherwise a type error naming `.byKey` | `.byKey` on a write: **new use** of an existing word |
| Must a pick include the key? | Only as a `.list` target, since a list row has no input to borrow from. Not in `.one` on a write, not in `get` | |
| `patch` | A prediction only. In `listen`, a type error | existing, **narrowed** |
| `delta` | Evidence, in `listen` only. Must include the version field. In `.predicts`, a type error | **new** |
| `.one(Ticket)` over a partial output | A type error | new error |
| A pick without the version field | Compiles, and `flow check` warns `NoFloor`: it silently drops the floor and `behind` | new warning |

The spike types a shape, not the implementation. Whether `Schema` inference keeps these errors readable is still open.

## 4. The Attempt's record

### 4.1 One record, one life

**Every write that touches an entity gets one row, in the batch that captures its first send.** Not when its lane goes away. This is H3's whole fix, it replaces rule 38's predicted keys, and M5 and M10 land in the same place.

```ts
// store/unsettled/<attempt>. Written by the store's module, ahead of the first send.
type Unsettled = {
  attempt: string
  contract: string
  entity: string
  keys: readonly unknown[]        // M10: a bulk write is one row
  fields: readonly string[]       // M5: what the predicts closure actually returned when it ran at start, plus .alsoChanges, plus the version field
  basedOn?: unknown               // per key if many. Present only on a `guarded` contract
  given: number | null            // null while a lane can still re-send
}
// Removed on a known ending, in the batch that removes the lane. `given` set in the batch that releases it.
```

| Path | Before: was there a record? | Now |
| --- | --- | --- |
| A persisted, holding write | lane and keys | row, in the lane's batch |
| Bare (rule 40) | **none after the ending** | row. `given` at the ending |
| `allow`, non-predicting `cancel` | **none after the ending** | row. `given` at the ending |
| Non-persisted machine, persisted entity | **never** | row, written ahead alone. `given` at boot |
| Neither persisted | memory only | memory only. Page death forgets it, and the store it could have marked is gone too. Trust list |
| Sourced (engine) write | not applicable | no row (section 9) |

**I reject the review's (b), a `flow check` error on a non-persisted machine writing a persisted entity.** It would force a whole small machine, a like button, to persist in order to send one write, just because another machine reads that entity with `persist: true`. A row ahead of the send costs what a persisted lane's capture costs and asks nothing of the author. Advice taken as a direction, not a rule.

**[ran]** `noRowFree` and `noRowVolatile` each fail 13 of 13, on the review's trace shape: `… reload … answer.now landLate`. The search now has `landLate` after `reload` for all three kinds.

### 4.2 Static fields are for `flow explain` only

`.predicts` is a closure, and its fields can depend on input. `Touch.fields` in `Compiled` holds only what is statically known (`.alsoChanges`, the version field). The real set is recorded on the row when the closure runs. `flow explain` says "at least these, plus what `.predicts` returns".

### 4.3 Every ending speaks for every touched field

```ts
// One constructor: `store.claim`. M1's "the claim hand-edits the version cell" is gone, and I2 holds as written.
for (const f of touchedFields(attempt)) {
  if (f in carried) continue                                   // judged, normally
  store.claim(f, f in predicted ? { value: predicted[f] } : undefined, firstSend)
}
```

| Ending | Touched, carried | Touched, predicted, not carried | Touched, not predicted (`.alsoChanges`, version) |
| --- | --- | --- | --- |
| success | judged | **value claim:** the prediction, `unconfirmed`, a floor | **blank claim:** the value stays, `unconfirmed`, a floor |
| definite failure | nothing | overlay removed | nothing |
| unknown | | Open doubt | Open doubt |

**[ran]** `alsoChangesClean` fails 13 of 13 (`t shows 0, server 101`, the review's trace). `claimNoRev` fails 13 of 13. A blank claim stays through an overlapping answer that happens to agree, since it has no value to agree with: `blankAgrees` fails 10 of 13, a failure the model found, not the review. So did "a claim whose value could not be taken is blank": a read cannot contradict a value we do not hold.

**Stated limit, next to the cart, not buried:** Flow knows only what `.alsoChanges` says. A feed that moves `CartLine` and sends nothing for `Cart` leaves `Cart.total` stale and unmarked. A delta that omits a derived field does the same. **[ran]** `trust.feedOmitsDerived` fails 6 of 13. **Money reads a response or holds a lane.**

### 4.4 Bulk

A bulk close is one Attempt, one row with `keys`, one evidence batch, one publication; past 4,096 keys it ends `Overloaded`, as before. M10's queue hold: **a record's queue releases when that record's own repair lands or fails**, per row, not per Attempt, and never by a timer. A row with a write waiting behind it goes to the front of the entity's repair queue, so a person re-saving row 4,000 does not wait out the other 3,999. 8 in flight stays a guess, and a `RequestResolver` in the author's service batches on the wire. [reasoning; the model has one record. Oracle (i) owes this.]

### 4.5 One direction, restated

I6: **every Attempt that may still land has a record, and that record parts from the table only towards more marks.**

- Row present, table older: every restored cell reads `unconfirmed` (a boot is a gap), and the row marks its fields. **[ran]** on realistic reload as the model's only reload: cells rolled back to a coalesced snapshot, conflicts lost, rows kept, `landed` normalised to the boot floor.
- Row present, Attempt had in fact succeeded (killed before the removal flushed): one extra mark, quiet after one read, with no exit if unguarded. Rare and safe.
- Wipe: everything goes together, so the store holds nothing to be wrong about. `REV8-WIPE`'s limit is unchanged.

A lane's removal has no ticket (`durable.ts` `put`), so "awaited, as the lane was" in the first proposal was wrong. Atomicity is what matters, and a `store/` prefix joins the actor's batch [the review, read].

## 5. Q1: two levels, no clock. **FOR THE OWNER'S READ: changes rule 32, and leaves OD19's clause standing**

**Decision (delegated, overturn freely):** a later success can't clear a mark, and neither can time. After give-up a mark has two levels, `uncertain` until the next read, then `unconfirmed`, quiet, until proof. `landsWithin` is cut, and no clock replaces it.

I went one step past the review's option B, which kept "until the window ends and one read asks". You asked for no wall-clock guess unless nothing else is correct. Something else is: a mark that stays, quiet and honest. **A clock can't be correct** because it is the one case where a guess decides, and the review's `landAfterWindow` trace shows it. So I removed it.

**Why not A (ten minutes of `?`)?** A `?` that is usually false teaches authors to hide `uncertain`, which also hides the real ones. **Why not C (keep rule 32)?** The trace: `write write.lost part answer write release answer reload answer retry.ok read answer landLate` ends unmarked and wrong [the first proposal, ran; here `rule32Clears` fails 13 of 13].

**Why quiet is enough.** `uncertain` means a person should look, and after a read asked after give-up the screen shows what the server said. There is nothing to look at. `unconfirmed` means "not proven", which is exactly true.

**The exit that isn't a guess: `guarded`.** OD20 already says the remedy for a released write is a version precondition. So once a version past `basedOn` is seen, that request can no longer change the server: a real proof, and the mark turns into a conflict, closed by that same answer per field, or by one read. **[ran]** `proofAtEqual` fails 7 of 13.

**Before and after.** The user saves B, it is lost, the machine gives up, they save C, and it succeeds. The machine doesn't change.

```ts
// BEFORE, rule 32 (machine-design 2.8.6)
// give up, re-save ok:                { data: { title: "C" }, uncertain: false, unconfirmed: false }   // clean
// B lands at minute 20:               { data: { title: "C" }, uncertain: false, unconfirmed: false }   // server says B. Wrong, silent. OD20 F1's stated limit

// BEFORE, first proposal (landsWithin: "10 minutes")
// give up, re-save ok, read agrees:   { data: { title: "C" }, uncertain: true,  unconfirmed: false }   // `?` for ten minutes, usually false
// minute 11, one read:                { data: { title: "C" }, uncertain: false, unconfirmed: false }
// B lands at minute 20:               { data: { title: "C" }, uncertain: false, unconfirmed: false }   // still wrong, silent. Now every author claimed otherwise, by default

// AFTER, unguarded
// lost, Held:                         { data: { title: "A" }, uncertain: true,  unconfirmed: false }   // OD19, unchanged
// give up, before any read:           { data: { title: "A" }, uncertain: true,  unconfirmed: false }   // one read is asked
// that read lands, or C succeeds:     { data: { title: "A" }, uncertain: false, unconfirmed: true  }   // existing marks. No `?`. Asks nothing
// B lands at minute 20, a read:       { data: { title: "B" }, uncertain: false, unconfirmed: true  }   // right, and still marked: nothing proves B was the last
// next week, after a reload:          { data: { title: "B" }, uncertain: false, unconfirmed: true  }   // the row is durable

// AFTER, guarded: true
// a version past basedOn is seen:     { data: { title: "C" }, uncertain: false, unconfirmed: false }   // proven: B can no longer land
```

**[ran, traces.ts]** all of the above except the view shape, which is `Store.status`. **[ran]** `noDemote` fails 13 of 13: the oracle now tells the two levels apart, and the review's "the oracle can't tell these marks apart" no longer holds. `readClearsQuiet` and `readClearsOpen` fail 13 of 13.

**What this costs, plainly:**

1. On an unguarded write, a lost and given-up save leaves its fields `unconfirmed` **until the row is evicted**. A screen rendering `unconfirmed` shows that for a long time. It is one lost-and-abandoned request per field, not a steady state, and authors who render nothing see nothing.
2. Rows have a count cap, not a clock: 4,096 per entity, oldest out, naming `UnsettledEvicted`. A very old request evicted and then landing is unmarked and wrong. **That is the one remaining guess, and it's about count** (a guess in the number, too).
3. If you want an escape, the smallest is an author's explicit claim, a contract-level `assumeGoneAfter`, off by default, on the trust list. **Not added.** Section 12.

**What it changes in the plans, for your yes (nothing edited):**

| Place | Change |
| --- | --- |
| Rule 32, `machine-design.md:767` | "A later write's success clears" goes. A mark is per field and Attempt. Its own re-send's success ends it. While its Attempt is unresolved it stays `uncertain` (OD19, kept word for word). Given up, it demotes as above |
| 2.8.6 rule table | Success row's last cell: this Attempt's mark only. `Released` row: "kept until a later write's success" becomes "demotes on a read after, or a later success" |
| 2.8.6 "Facts the record queue owns" | Same. The `Released` store effect and the unbound-lane clause stay |
| E3 comment, C25, C30, line 8075 | Same |
| Rule 38 | Lanes keep their record; predicted keys move to the row, with fields |
| Rule 40's bare write | "Not retained" stays true for the lane. The row is new |
| OD20 F1 | The stated limit "may still land later, unseen" becomes "may still land, marked". The remedy is unchanged |
| Rule 31 | **No change.** The review's "a re-send re-opens the window" isn't needed: no window. A Held Attempt is `uncertain` throughout |

## 6. Retest: seven very different cases, then the review's

The machine doesn't change in any of them, so these show the source and the domain. Keywords as in section 3; only new ones are marked.

**1. A chat list with projections.** `GET /conversations` projected; opening one loads it whole; a socket sends messages whole and conversation changes as deltas.

```ts
export const Conversation = entity({ id: "Chat/Conversation", fields: ConversationRow.fields, primaryKey: ["id"], version: "seq" })
export const Message = entity({ id: "Chat/Message", fields: MessageRow.fields, primaryKey: ["conversationId", "id"] })   // immutable, no version
export const ChatDomain = domain("chat", {
  inbox: read(inbox).list(Conversation.pick("id", "title", "preview", "unread", "seq"), ({ output }) => output.rows),   // NEW: pick as a target
  conversation: read(conversationById).one(Conversation).byKey(({ input }) => ({ id: input.id })).gone("NotFound"),     // NEW: gone
  changes: listen(chatFeed, { order: "arrival" }).as([Conversation, Message], (f) =>    // NEW: order. Applies to Message; refused if every entity here is versioned
    f._tag === "Message" ? Message.row(f.message) : Conversation.delta({ id: f.id }, { preview: f.preview, unread: f.unread, seq: f.seq })),   // NEW: row, delta
})
```

The list refreshes at `seq: 9`; `members`, loaded at 7, reads `behind`; no by-key read fires, so a hundred rows cost nothing. If that conversation is open, its answer refreshes once, and that refresh asks nothing further [ran, `sim.ts`]. While the feed is live and has delivered the record, nothing is behind. Tokens stay in machine memory.

**2. A checkout cart.** One answer, many records, a server that re-prices.

```ts
setQuantity: write(setQuantity)
  .one(Cart)
  .list(CartLine, ({ output }) => output.lines)
  .alsoChanges(({ input }) => Cart.fields({ cartId: input.cartId }, ({ record }) => [record.subtotalCents, record.totalCents]))
  .predicts(({ input }) => CartLine.patch({ cartId: input.cartId, lineId: input.lineId }, {
    quantity: input.quantity,
    lineTotalCents: (beneath, input) => beneath.unitPriceCents * input.quantity,   // replays when a re-price moves the base, as today
  })),
```

The answer's records and the overlay's removal are one cut. **A 204 on the same write now marks `subtotalCents` and `totalCents` `unconfirmed` (H4) [ran]**, and an unknown marks them Open. `couponCode` stays clean. **A price feed that moves lines and says nothing for the cart leaves the total stale and unmarked [ran]. Money reads a response or holds a lane.**

**3. A dispatch desk.** Section 3. Out-of-order frames are safe per field: `v5 {title}` then `v4 {slug}` both apply, and `v4 {title}` is dropped [ran, `rec-delta-shuffle`]. `triage`, whose condition reads a doubted field, sees "maybe" and refetches.

**4. A paginated table with partial rows.**

```ts
export const Invoice = entity({ id: "Billing/Invoice", fields: InvoiceRow.fields, primaryKey: ["orgId", "number"], version: "updatedAt", versionOrder: Order.Date })   // versionOrder takes an Effect Order
export const Billing = domain("billing", {
  page: read(invoicesPage)
    .list(Invoice.pick("orgId", "number", "status", "totalCents", "updatedAt"), ({ output }) => output.rows)   // NEW: pick as a target
    .where(({ input, record }) => eq(record.orgId, input.orgId))
    .orderBy(({ record }) => [desc(record.updatedAt), asc(record.orgId), asc(record.number)])
    .pagedBy(({ input }) => input.page, ({ output }) => output.next),
  invoice: read(invoiceById).one(Invoice).byKey(({ input }) => ({ orgId: input.orgId, number: input.number })),
})
```

**H1, now actually handled.** `updatedAt` ties are this case: a read asked after takes [ran, 1 read, no doubt; the `ties` suite]. An overlapping read at a tie with a different value is a doubt, one read. `updatedAt` is a `Date`, so equality matters [ran]. **A row missing from a page proves nothing**, and that now holds throughout: the first proposal's "raises one doubt on `$present`" contradicted its own rule and is cut (section 12).

**5. An offline-queued edit.**

```ts
export const saveNote = transaction({
  id: "Notes/save",
  input: { id: Schema.String, body: Schema.String },
  output: NoteRow,
  key: ["id"],
  concurrency: "latest",
  commit: (i, { attempt, signal }) => NotesApi.use((api) => api.put(i, { idempotencyKey: attempt.id, signal })).pipe(unknownWhenLost),
})
```

The first proposal needed `landsWithin: "Infinity"` here. Now it is what everything does, with nothing to write. Offline: `NoResponse` is unknown, the lane holds, `row.uncertain` shows, and the overlay stays until the forced repair lands, which also fails. Close the tab: the lane and row restore, the mark returns, the prediction doesn't, so the screen shows the old body and a `?`. Local-first editing still needs a real engine behind case 6. **The store says so instead of faking it.**

**6. A TanStack DB collection behind the seam.** Section 9. **[ran]** 0 doubts across 2 sessions, and a quiet stream's unknown has an exit.

**7. A server with no versions, through a CDN.** `GET /settings`. A read after a read is `after`; overlapping reads that differ raise one doubt and one more read. A write's whole response is taken if nothing landed since it was sent. **It cannot catch a lagging replica.** `after` assumes read-your-writes, on the trust list, stated [ran: `trust.lag`].

**The review's extra cases:**

| Case | Result |
| --- | --- |
| **Collaborative text** | Not this tool. A field is a last-writer value, each keystroke an awaited capture, and a `serialize` lane overflows at 64. It belongs in a CRDT behind memory or an engine. Same place as tokens [reasoning] |
| **Money totals from rows** | Case 2. Marked when the write said so, silent when only a feed moved them. Stated [ran] |
| **Version per collection** | NEW `version: { field: "seq", per: "collection" }`. Ordering works; `behind` is off, because a collection's version says nothing about this record's other fields. Same as no-version for those. [ran: `coll-*` configurations; `perCollectionBehind` fails; sim 0 requests.] Envelope versions not in the row: section 12 |
| **Temp ids, then rekey** | Plain path: refused by rule 33. Engine: `delete:temp-1, insert:srv-42` [the review, ran]; a view pinned to the temp key goes gone. Stated. Client ids are the answer, as TanStack's own docs say |
| **Lost create with a server id** | No key, so no row, no mark. **I3 is about held records' fields. A list's membership is outside it**, stated (section 12) |
| **Delete, then re-create** | Monotonic revision: fine [ran]. Restarted revision, reads: `VersionWentBack`, marked, three asks, exits at a later version [ran, T2, `restart` suite]. 404 with no version, then exists: taken at once, no doubt [ran, T3]. Restarted revision on an unordered feed: **silent, cannot be told from a stale frame** [ran: `trust.restartFeed`]. So: if it restarts, leave `version` out. Partial resurrect: `missing` asks once under a live view [reasoning] |
| **Real TanStack DB** | Case 6 |
| **Zero** | Read only. Its whole-rows shape fits; its query-diff doesn't. **The first proposal's snippet is withdrawn** (section 9) |

**The first proposal's named problems, on the new judge [ran, `traces.ts`]:**

| Problem | Result |
| --- | --- |
| H2 A1 | `title: new`, the rest `unconfirmed` (behind v2) |
| H2 A2 | `archived: true [uncertain]`, one repair, `title: x`, nothing else marked under a covering session. Louder than the first proposal's `unconfirmed`: section 7's cost |
| H2 A3 | `title: mine`, `archived` from v5, unmarked, right |
| H2 A4 | `$present` true at 3, `title` known, the rest `missing` |
| M12 | `archived` still `uncertain`, `title` clean |
| M5 | 10 versioned frames during a repair: 1 repair, no doubt, `wantsRepair` false |
| M10 | every field `unconfirmed` the moment the session drops |
| `listen.load` | `title: other1 [uncertain]`, a repair, truth, no mark. D74's excuse can go |
| H1 | 1 read, title `y`, no doubt |
| T2, T3, T4, T4b | Above, section 2.2 |
| L5 | A string on a numeric version is refused by Schema; a string version with no `versionOrder` is a `flow check` error [reasoning] |
| L8 | One store per Runtime [reasoning] |
| `an-actor-disposed...`, `fragstore.row` | Row, not lane, carries it across disposal and reload [ran on the store, not the harness] |

## 7. What ran

**The oracle came first.** Before touching the judge I changed only the oracle and ran the old judge, as `entity-model-2/oracle-first.txt` records. **At 200,000 walks: 9 of 9 configurations fail, on `stuck` (a doubt, asked, with nothing in flight), and `markEverything` fails 9 of 9 at seed 1.** So the oracle could now fail in both directions before anything was fixed, and the review's 1,264 stuck walks have a second cause beside the `before` it named: a reload dropped a repair and left the doubt `asked` for ever. That's why conflicts are memory now.

**Six oracles, at quiescence (`run.ts`):**

| | Oracle | Catches |
| --- | --- | --- |
| a | Every unmarked field equals the server. An excuse is per field and by name: others changed it, nobody told us, not re-read, and no version told us otherwise. A new session ends the excuse | under-marking. Replaces the 34% whole-walk skip |
| b | No conflict left with nothing in flight, unless named | stuck |
| c | One whole read, asked now, ends every mark that doesn't name a reason. A given-up Attempt reads `unconfirmed` after it, never `uncertain` | over-marking, Q1's levels |
| d | A field nothing touched is never `uncertain`. A collection's version never marks `behind`. A session's flap never marks what its `.covers` excludes | scope |
| e | No doubt between equal values | equality |
| f | After (c), a lost write lands: its fields must still be marked | the thing marks exist for |

**The alphabet added:** three write kinds (held, free, volatile), `guarded` writes, `alsoChanges` with a derived field, realistic reload always, a failing read, an unchanged version (`ties`), a restarting one (`restart`), per-collection versions, boxed values, live answers with refresh, a session that doesn't cover the record, no `.covers`.

**The final model, `entity-model-2/results.txt`, `run-all.sh 600000`, 33,600,000 walks: 0 failures.**

| Suite | World | Walks | Fails | Repairs | Fields marked at quiet |
| --- | --- | --- | --- | --- | --- |
| `base` | 13 configurations of version, feed, order, ack, `.covers` | 7,800,000 | 0 of 13 | 5,329,563 | 35.4% |
| `ties` | half of all changes leave the version alone | 7,800,000 | 0 of 13 | 5,778,958 | 35.2% |
| `restart` | a re-created row restarts its version; reads only, what H2 promises | 2,400,000 | 0 of 4 | 1,680,759 | 34.7% |
| `answers` | two live answers with refresh | 7,800,000 | 0 of 13 | 6,017,615 | 14.8% |
| `boxed` | values are structs, compared by equivalence | 7,800,000 | 0 of 13 | 5,329,563 | 35.4% |

The longest walk asked for 12 repairs. "Marked at quiet" is high because these walks are hostile by construction, so don't read it as a rate for an app. `run.ts` has one record, so a configuration is 13 runs, not 13 records. **Budget:** an earlier draft failed `ties` only past 350,000 walks a configuration, so 600,000 clean says less than it sounds.

**Mutants, 100,000 walks a configuration. 30 of 31 fail. Configurations failed:**

| Fails | Mutants |
| --- | --- |
| 13 of 13 | `alsoChangesClean`, `claimNoRev`, `conflictsNeverClose`, `fromAtLanding`, `identityEq` (boxed), `markEverything`, `noDemote`, `noGap`, `noReask`, `noRowFree`, `noRowVolatile`, `noUnknown`, `readClearsOpen`, `readClearsQuiet`, `recordScopeMarks`, `reloadNoGap`, `rule32Clears`, `volatileDoubts` |
| 12 of 13 | `sameKeepsLanded` |
| 10 of 13 | `blankAgrees`, `noFieldScope` |
| 9 of 13 | `beforeClosesNothing`, `noTie` (ties) |
| 8 of 13 | `dropNoGap`, `helloNoGap` |
| 7 of 13 | `noBehind`, `proofAtEqual` |
| 2 of 13 | `perCollectionBehind` |
| 2 of 4 | `silentBefore` (restart) |
| 1 of 13 | `gapEntityWide` (only one configuration can see it) |
| **0 of 13** | **`noPresent` survives.** As the review found: `behind` and the feed cover it in this model. I kept a partial carrying `$present` because of A4's trace, not because a search needs it. Don't count it |

**Over-marking mutants now fail:** `markEverything`, `recordScopeMarks`, `conflictsNeverClose`, `noDemote`, `noReask`, `beforeClosesNothing`, `sameKeepsLanded`, `gapEntityWide`, `perCollectionBehind`, `identityEq`. The first model could fail on none of them.

**Also ran:** `traces.ts` and `sim.ts` (in `results.txt`), `types-spike.ts` (tsc, 7 expected errors), `seam-output.txt` (TanStack, the spike's source kept as `seam-spike.txt`). The stuck-walk count is now zero by oracle, not by measure: any unnamed stuck conflict fails the walk.

**What the model doesn't prove.** One record, one store, no actors, no field functions, no real answers beyond two picks, no list membership, no bulk. Sections 3.3's first load, 4.4 and 9's mapping are reasoning. It says nothing about Flow's runtime.

**What the model refused in my own drafts, all in the tie world and all at high budgets, so the review's budget note is right:** `store.proof` pushed a duplicate conflict (73,000 walks). A blank claim at a floor read `before`, and dropped a write's own response (150,000). A value claim at a floor also read `before`, and dropped a newer overlapping read (350,000). All three are fixed, and the last two are now one line in section 2.2: **a tie that overlaps cannot be ordered, claim or not.**

**That line has a cost on ordinary servers.** A read in flight while a 204 lands, on a field it disagrees with, now raises a doubt: a brief `?` and one extra read, where a version-bumping server didn't need it. H2 A2 shows it. I chose it because timestamps tie, and the rule says what cannot be ordered cannot decide.

## 8. The trust list (M7)

**Every claim the design takes from an author or a server, in one place. `flow explain` prints this per entity, so "what is this entity trusting?" has an answer.** Each one was made false, and fails as predicted. These are stated, not fixed.

| Claim | Who makes it | Made false | If false |
| --- | --- | --- | --- |
| `order: "arrival"`: frames arrive in order | author | `trust.arrival`, 8 of 13 [ran] | a stale frame taken, unmarked |
| A live session is complete: no frame lost without a gap | server | `trust.lossy`, 8 of 13 [ran] | a stale field, unmarked |
| A re-send of one Attempt is deduplicated | server | `trust.dedupe`, 13 of 13 [ran] | the mark ends, then the first send lands |
| Read-your-writes: a read asked after a write sees it | server | `trust.lag`, 6 of 6 [ran] | an old value taken. A held value claim still catches it (T4b, [ran]); nothing else does |
| A version is monotonic across a key's re-creations | server | reads: `restart`, 0 failures, marked. Unordered feed: `trust.restartFeed`, 3 of 3 [ran] | feed frames dropped silently. Leave `version` out |
| `.alsoChanges` is complete, and a delta includes derived fields | author, server | `trust.noAlsoChanges`, 13 of 13; `trust.feedOmitsDerived`, 6 of 13 [ran] | a total stale and unmarked. Money reads a response or holds a lane |
| `.covers` says what the session really tells | author | [reasoning] | a partial answer trusts what nobody is watching |
| `guarded`: the server enforces `If-Match` | author, server | `proofAtEqual` is the nearest [ran]; no server test | the mark ends and the request lands |
| `sourced`: one unfiltered subscription, so `gone` means gone | author | a filtered subscription reports `delete` [ran, real TanStack] | a false tombstone |
| Neither machine nor entity persisted: a page's requests die with it | none | [reasoning] | a late landing after a reload is an ordinary stale read |
| A row evicted past the cap will not land | none | [reasoning] | unmarked and wrong; `UnsettledEvicted` names it |

`landsWithin` was on the review's list, and it's gone. `order` is refused on an entity with a version, since it does nothing there.

## 9. The seam: a real engine behind it

**Decided. A9 FOR THE OWNER'S READ.** The adapter doc's A9 says "the entity store touches only operations that bind an entity; engine rows stay outside it, and one Schema cannot be both." I keep the first half and "one Schema cannot be both". **"Engine rows stay outside it" is reversed for an entity that declares `sourced: true`, and only for that:** you asked that entities be the seam for TanStack DB and Zero, and a `get` by key that survives moving a record between tiers needs the rows in. "Tier 1 never claims data it was not given" still holds: it was given them. Nothing edited.

**A sourced entity skips the judge.** An engine has one ordered output and owns its overlay. Every batch is `after`, a statement by the engine, whichever session delivered it. Two sessions of one engine are one truth, so `from` is not per session, and T6 (a doubt with no repair) can't occur. **[ran]**

```ts
// tickets.db.ts. user-defined. Real TanStack DB
export class TicketsDb extends Context.Service<TicketsDb, { readonly tickets: Collection<TicketRowType, string> }>()("app/TicketsDb") {}

// tickets.contracts.ts
export const ticketRows = stream({                 // existing: stream
  id: "Tickets/rows",
  input: {},
  output: Schema.Array(Schema.Struct({ gone: Schema.Boolean, pending: Schema.Boolean, row: TicketRow })),
  key: [],
  delivers: "every",
  idleTime: "Infinity",
  subscribe: () => Stream.unwrap(Effect.map(TicketsDb, (db) =>
    Feed.callback<ReadonlyArray<{ gone: boolean; pending: boolean; row: TicketRowType }>, never>((emit) => Effect.gen(function* () {
      emit(Feed.live({ proof: "the collection's own subscription" }))
      const sub = db.tickets.subscribeChanges((changes) => emit(changes.map((m) => ({
        gone: m.type === "delete",                 // ONLY unfiltered: a `where` here reports leaving the query as a delete
        pending: db.tickets.get(m.key)?.$hasPendingWrites ?? false,
        row: m.value,
      }))), { includeInitialState: true })
      yield* Effect.addFinalizer(() => Effect.sync(() => sub.unsubscribe()))
    })))),
})
export const retitle = transaction({
  id: "Tickets/retitle",
  input: { id: Schema.String, title: Schema.String },
  key: ["id"],
  concurrency: "serialize",                        // DROPPED: landsWithin: "0 seconds". `sourced` implies it
  commit: (input, { attempt }) => Effect.gen(function* () {
    const db = yield* TicketsDb
    const api = yield* TicketApi
    const tx = createTransaction({
      id: attempt.id,
      autoCommit: false,
      mutationFn: async () => {
        const { txid } = await api.retitle(input, attempt.id)
        await db.tickets.utils.awaitTxId(txid, 10_000)
      },
    })
    tx.mutate(() => db.tickets.update(input.id, (draft) => { draft.title = input.title }))
    yield* Effect.tryPromise({ try: () => tx.commit().then(() => undefined), catch: classifyTanstack })
  }),
})
// tickets.domain.ts
export const Ticket = entity({ id: "Tickets/Ticket", fields: TicketRow.fields, primaryKey: ["id"], sourced: true })   // NEW: sourced. One `listen` writes it
export const TicketsDomain = domain("tickets", {
  rows: listen(ticketRows).as([Ticket], (batch) =>   // `order` is not needed: sourced is stronger
    batch.map((c) => (c.gone ? Ticket.delete({ id: c.row.id }) : Ticket.row(c.row, { pending: c.pending })))),   // NEW: row, pending. `pending` reads as `predicted`
  retitle: write(retitle).alsoChanges(({ input }) => Ticket.fields({ id: input.id }, ({ record }) => [record.title])),   // what an unknown marks. `.predicts` is a type error here. `.one` too: nothing but the listen writes it
})
```

**The rules, which are `flow check` errors where they can be:**

| Rule | Why |
| --- | --- |
| A sourced entity has one `listen` entry, and no other evidence writes it | "One Schema cannot be both" |
| `input: {}`, `key: []` on that stream | One unfiltered subscription. A `where` is invisible to `flow check`, so it's also on the trust list |
| No `.predicts`, no `.one`, no `.byKey`, no row | The engine owns all four |
| `O.x.retry` refused on a sourced write: `RetryOnSourced` | TanStack's and Zero's retries are their own. An unknown ending means the commit's own wait gave up |
| On an unknown: a mark **outside the judge**, ended by the engine's next statement about that key or the lane's end | T5b's exit. I11 ("zero doubts") is now true, not contradicted by section 8's Bounds row |
| No durable mark | One outbox: the engine's |

**[ran, against TanStack DB's real source, a copy of `codebases/db` at `15d2d2d`, run from the scratchpad, `r9e2/seam.ts`, on `entity-model-2/store.ts`, with two sessions on one collection:]**

```text
start, two sessions            title first, n 1     pending false
predicted                      title mine           pending true    (engine's overlay)
frame while persisting         title mine, n 1      pending true    (held by the engine)
settled                        title mine, n 2      pending false
commit timed out: unknown      title mine, n 2      mark true
  exit 1, lane ended           mark false
  exit 2, next statement       n 3, mark false
refused: rolled back           title mine, n 3      pending false
moved to p2, unfiltered        title mine, present true
a FILTERED subscription, same move: insert:t1 | delete:t1    <- why a sourced listen must not filter
deleted by source              present false
doubts raised on one engine, two sessions: 0
```

That ran the read path, the overlay flag, rollback, the mark's two exits and the false delete. It did not run Flow's runtime, Electric, `Feed.callback`, or a machine. The mark's exits are driven by hand in the script; only the batch side is the engine.

**Zero is deferred, and the first proposal's snippet is withdrawn.** `diffRows(last, next)` says `gone` when a row leaves the *query*. Zero exposes query views, not a whole-table subscription, so a sourced Zero entity needs a per-query membership that is not a deletion: a real design, not a patch. Its `row-patch` `del` is internal. Section 12.

## 10. `Compiled`, and where this touches the runtime

```ts
export type Compiled = { /* existing fields, minus `domain` */ readonly entities?: Readonly<Record<string, EntitySpec>> };

export type EntitySpec = {
  readonly id: string;
  readonly fields: Readonly<Record<string, Schema.Top>>;      // data. Equivalence and codec are derived from these at load: nothing else compiled
  readonly keyFields: ReadonlyArray<{ readonly name: string; readonly schema: Schema.Top }>;
  readonly version?: {
    readonly per: "record" | "collection";                    // CHANGED: "field" is out (section 12), "collection" in
    readonly field: string;
    readonly order: "number" | "bigint" | Slot<(a: unknown, b: unknown) => number>;
  };
  readonly repair?: string;                                   // an Op's id: the `.byKey` read
  readonly persisted: boolean;                                // derived
  readonly sourced: boolean;
};

export type Carry = {
  readonly entity: string;
  readonly shape: "whole" | "part" | "delta" | "delete";      // CHANGED: "patch" renamed, a prediction is not a carry
  readonly fields: readonly string[] | "all";
  readonly key: "row" | "input" | Slot<(input: unknown) => unknown>;   // NEW: section 3.4. Where it comes from, and `flow check` can read it
  readonly take: Slot<(value: unknown, input: unknown) => ReadonlyArray<Said>>;
};
export type Said = { readonly key: unknown; readonly row?: Readonly<Record<string, unknown>>; readonly version?: unknown; readonly pending?: boolean };

export type Touch = {
  readonly entity: string;
  readonly fields: readonly string[];                         // CHANGED: only what is static: `.alsoChanges`, the version field. For `flow explain`. The real set is on the row
  readonly key: Slot<(input: unknown) => unknown>;
  readonly many: boolean;
  readonly predict?: Slot<(input: unknown) => ReadonlyArray<{ readonly key: unknown; readonly patch?: Readonly<Record<string, Slot<(beneath: unknown, input: unknown) => unknown> | { readonly value: unknown }>>; readonly remove?: true }>>;
};
// Op gains:         carries?, touches?, gone?: { entity, tag, key }. guarded?: boolean. DROPPED: landsWithinMs
// StreamSpec gains: carries?, order?: "arrival", covers?: { entity, when: Slot<(input: unknown, record: unknown) => boolean> }
```

`flow check` gains, beyond the first proposal's: any entity that can raise a doubt with no repair warns `NoRepair`, not only a predicted field. A pick without the version field warns `NoFloor`. `order` on an entirely versioned `listen` errors. A field with no equivalence errors. The sourced rules above. `EntityConflict` compares ids, field names, key and version, not Schema identity, which would misfire under HMR. `flow explain` prints section 8's list. `flow trace` names `before`, `backwards` and `VersionWentBack`.

**The runtime, `round-9/`, by file. [read, except where marked]**

| File | Change | Why |
| --- | --- | --- |
| `entities.ts` | Replaced by the judge, `store.claim`, the mark table. Well under half its 841 lines [reasoning] | |
| `seam.ts:96` `Ended` | `sentAt` splits into first and last send. `how` stays | `from` is the first send |
| `seam.ts:113` `Module.save` | Becomes a **durable slice**: a module writes into a `store/` scope, with an Attempt's batch or on its own. Expiry's `Module.save` can't; eviction's removal needs the same door | The door was the missing piece (M6, H3) |
| `seam.ts` `start` | Gets the fields `predicts` returned, into the row | M5 |
| `seam.ts` `pushed`, `onGap` | Carry the session's `from` and identity, and the gap's moment | `.covers` |
| `durable.ts:33` `requestDurable` | `persisted ‖ touches a persisted entity` asks for capture. Today it returns `ready` at once for a non-persisted machine | H3's third path |
| `durable.ts:164` `flush` | A non-persisted machine's row is flushed though its lane is not | Same |
| `durable.ts` restore | Boot scans `store/unsettled`, restores Open doubts with `given`, and sets `given` to the boot for a row whose lane did not return | I6 |
| `world.ts:259` `persist` | No shape change. A `store/` prefix joins the actor's scope | [the review, read] |
| `turn.ts`, `lane.ts`, `step.ts` | **Nothing expected** [reasoning; I didn't trace every call]. `pending`, `Held`, retry, cancel and the queue stay. Another builder is there | |

`from` and `landed` are `cx.pos()`, never a wall clock. A restored `landed` normalises to the boot floor [ran]. **No part of this design reads `Date.now`**, so the virtual clock, Stories and replay have nothing new to arm.

**Stories.** A fake must send ties, restarted versions, derived fields, partial acks and 204s, or H1, H2 and H4 hide as H2's A1 did behind whole rows. `cp.entity(Ticket, key).cells` shows windows, for tests only. **CLI:** no new command.

## 11. Added and dropped

**Added, for authors:** `.one(Ticket.pick(...))`, `.list(Ticket.pick(...), select)`; `Ticket.row`; `Ticket.delta`; `.gone(tag)`; `.covers(...)`; `listen(x, { order: "arrival" })`; `version: { field, per: "collection" }`; `guarded: true`; `sourced: true`; `{ pending }` on `row`; `.repair(false)`; `missing`; `.byKey` on a write. `versionOrder` takes an Effect `Order`. 13 words.

**Changed meaning:** `Ticket.patch` is a prediction only. `uncertain`, `predicted`, `unconfirmed` answer for picked fields. `uncertain` now means a person should look; `unconfirmed` means not proven. `.one(Ticket)` over a partial output is a type error.

**Added, internal:** cells with windows, `seen`, per-session `staleBefore`, the one `store.claim`, Open and Conflict, `store/unsettled` rows, the repair queue with a front for waiting writes.

**Dropped from the first proposal:**

| Dropped | Why |
| --- | --- |
| `rest`, the "three facts" | A runtime check (`covered`). M1 |
| `landsWithin`, all three meanings | Q1. `"0 seconds"` is `sourced`; `"Infinity"` is the default |
| `version: { perField }`, per-field clocks | Not needed first, not modelled. Section 12 |
| A dropped row raising a doubt on `$present` | Contradicted the rule. An absence carries nothing |
| "`store/unsettled` when a lane goes away" | Ahead of the first send, always |
| Zero's snippet | H6 |
| `sourced` as a judged pass-through, with doubts | Skips the judge |
| Two meanings of `patch` | `delta` |
| Repair "asks once" | Up to 3, then named |

**Dropped from the current design, as the first proposal lists:** `Rec.version`, `Rec.gone`, `Rec.claim`, `againstClaim`, `echoes`, `pastClaim`, `Rec.early`, `Early`, `foldEarly`, `keepEarly`, `EARLY_BOUND`, `earlyOrder`, `Rec.doubt`, `Rec.marks`, `withoutDoubtIf`, `clearMarks`, `place`, `dispose`'s verbs, `heldDiffers`, `admit`'s `fill`, `again` and repair restarts, D74 (b), `DomainSpec`, `version(ref)`, `versionOrder` per machine, `ref` strings, `Carried.evidence`, rule 32's "a later write clears".

**Kept, because it was right:** the record queue, `blocks`, answers, `onGap`'s re-reads, forced repair for an unknown, overlays replayed in mint order, field functions, `basedOn`'s rebase, typed keys through `Schema.toCodecJson` [first proposal, ran].

**Rules (proposed):** 26-29, 33-37 keep their meaning. 30: same effects, on fields; queue release per row. 31: unchanged. 32: section 5. 38: the row. 40: the row.

## 12. Revisit

For `revisit.md` if you accept this. Each is a case that can wait, and why that's safe.

| Item | Why it can wait | What it costs meanwhile |
| --- | --- | --- |
| **List membership** (M9): a lost create with a server id, a lost bulk delete in a list that isn't re-read | Rule 33's draft covers the screen while the machine holds it. Letting the row name a contract's answers looks like one field, but what marks a list? Needs its own design | I3 is about held records' fields. A list can miss a row, unmarked. Stated |
| **Client-id predicted create:** `$present` as a field is one rule away | E18 shows nothing today | Same as today |
| **`assumeGoneAfter`**, an author's explicit claim, off by default | Q1's quiet mark may be enough. Add it if a real screen needs it | Long-lived `unconfirmed` on unguarded given-up fields |
| **Per-field clocks** on the wire | Nothing needs it first. Not in the model | None |
| **Envelope versions** not in a row (`Said.version` has room) | `per: "collection"` handles a version in the row | Such a server is treated as no-version |
| **A dropped row** as a `$present` signal (13.4) | Absence carries nothing. Try on a real table first | A deleted record held elsewhere stays until read. Same as any stale read |
| **Zero's binding** | TanStack first. Needs per-query membership | No Zero |
| **Tombstone and stub eviction** (13.5) | A cap and a note. Nothing ran | Long sessions hold tombstones |
| **Memory: the stamp split** (13.16) | Start simple, measure a hot feed | Rows plus a cell object per field: 8.3 MB per 10,000 × 10 [first proposal, ran] |
| **`readsLagBy`** (13.7) | Stays out. Trust list | L6 |
| **Query-result `.where` over `MayStillLand`** | Bounded in reasoning: one refetch | Unmodelled |

## 13. Invariants, oracles, and where a test-first builder starts

**Invariants:**

1. **I1, carried only.** Evidence changes a cell or a conflict only for a field it carries.
2. **I2, one door for versions.** A field's version moves only through the judge or `store.claim`, and a claim only lowers exactness. A proxy never moves it.
3. **I3, nothing silent.** At quiescence, every field of a held record not marked `predicted`, `uncertain`, `unconfirmed` or `missing` equals the server, unless a trust-list claim is false. **List membership is outside this.**
4. **I4, monotonic.** A cell's version never goes down; `since` and `landed` never go down within a boot.
5. **I5, stays marked.** While a request may land, its touched fields stay marked, whatever any read says, across a reload. `uncertain` while its lane holds it (OD19), at most `unconfirmed` once given up and read.
6. **I6, one record.** Every Attempt that may still land, of any concurrency, binding or persistence, has a row from before its first send. Row and table part only towards more marks.
7. **I7, truth is not paced.** `from` is when a request truly starts. A store effect lands at settlement.
8. **I8, repairs end.** One per record in flight, a versioned frame never starts one, at most 3 per doubt.
9. **I9, one cut.** One answer's evidence, claims and overlay removal are one publication, across every record.
10. **I10, predictions are not evidence**, except a sourced `pending`, which reads `predicted` and is the engine's.
11. **I11, an engine is a statement.** A sourced entity's store equals the engine's visible rows after each batch, with zero doubts.
12. **I12, every mark has an exit or a name.** Section 2.5's table is total.
13. **I13, a refresh cannot ask.** Requests from refresh are bounded by non-refresh events × live answers.
14. **I14, no wall clock decides.** `Date.now` is not read by the judge, the marks or the row.

**Oracles for the harness, in order:**

- **(a) Two-sided, field by field, first.** `run.ts`'s six, ported. Replaces `honest`'s two fields, the `r.uncertain` gate in `listen.search.ts`, and `fragstore.search.ts`'s `v`. `known-failing-h2.ts` is the first red test. **A mark-everything mutant in the harness from day one.**
- **(b)** `listen.load` with no excuse. Delete `afterWas`, rename the search.
- **(c)** `fragstore.row` to depth 9, and `landLate` after `reload` **for every concurrency, binding and persistence**, not every ending.
- **(d)** The model's suites as searches on the real runtime: `base`, `ties`, `restart`, `answers`, `boxed`. 600,000 walks a configuration if the budget allows; one bug here needed over 350,000.
- **(e) Repair and refresh count.** I8, I13. Hot versioned feed: 0.
- **(f) Field scope.** `recordScopeMarks`, `noFieldScope`.
- **(g) Differential on writes.** No pick equals whole; a pick of every field equals whole.
- **(h) Wipe.** As before.
- **(i) Bulk.** 4,096 keys, one `many`, unknown: one row, 4,096 marks, repairs capped, every row marked until its own answer, each record's queue released by its own repair, a waiting write's row first. N = 1,000 real answers, no ending dropped.
- **(j) Reality.** A real server that sends patches, ties and 204s. `an-actor-disposed...` must report the claim. Real kill: a lane and its row never part.
- **(k) Engine.** I11 against TanStack's real source, the spike made a test, plus one Electric-shaped fixture.
- **(l) Types.** `types-spike.ts`, against the real API, with real Schemas.
- **(m) Trust.** Section 8's table as tests that are meant to fail, so a claim no one tests can't creep in.

**Ordered scenarios. Each starts red. Write the fakes first:** partial answers, deltas, no-version frames, ties, restarted versions, derived fields, 204s, late landings.

| # | Scenario | Touches |
| --- | --- | --- |
| 1 | `.one(Ticket.pick("title","revision"))`; a partial ack. Title moves, the rest stay and read `behind` | `Compiled`: `EntitySpec`, `Carry`. Runtime: judge in the entity module, `seam.ts` `ended` |
| 2 | A list row v1 after that ack (H2 A1). Whole row v1 after a v5 delta (A3), under a covering session | `Carry.shape`, `covers` |
| 3 | Tombstone, then a delta (A4). `$present` is a field | |
| 4 | Tie: read asked after takes, overlapping read doubts, one repair (H1) | `Order`; `Compiled.version.order` |
| 5 | Version goes back on a read asked after: `VersionWentBack`, 3 asks, a later version exits (H2 T2). 404 then exists at floor (T3). 204 no bump (T4, T4b) | `gone`; `flow trace` names |
| 6 | Doubt asked and overtaken: a `before` closes it. No reload leaves a doubt `asked` (M3) | repair queue |
| 7 | Equal `Date` and struct fields: no doubt (M4) | derive from `EntitySpec.fields` |
| 8 | Success with no body: value claim, blank claim on `.alsoChanges` and version (H4). Read after ends them | `Touch`; `store.claim` |
| 9 | An unknown marks exactly the fields `predicts` returned, read from the row across a reload (M5) | `seam.ts` `start`, the durable slice |
| 10 | **`landLate` after reload for held, bare, `allow`, `cancel`, non-persisted (H3).** | `durable.ts:33`, `:164`, restore; `seam.ts:113` |
| 11 | **Q1:** Held `uncertain` through a read. Give up: `uncertain`, one read, `unconfirmed`, no more asks, `landLate` still marked. Later success: same | mark table; `seam.ts` `ended` `how: "released"` |
| 12 | `guarded`: a version past `basedOn` ends the mark, per field | `Op.guarded`; proof in the judge |
| 13 | Session gap by `.covers`: a flap marks covered only. No `.covers`: marks all, partial trusts only delivered. First load: read, hello, one refresh | `StreamSpec.covers`; `pushed`, `onGap` |
| 14 | Two live answers, disjoint picks, a write every RTT: refresh does not feed (M2). `per: "collection"`: no `behind` | answers; `Compiled.version.per` |
| 15 | No-version: `listen.load` passes with D74's excuse removed. `order: "arrival"` | `StreamSpec.order` |
| 16 | Bulk: oracle (i) | queue release, repair front |
| 17 | Kill between lane and row on a real browser | `reality/` |
| 18 | Sourced: oracle (k). Unknown's two exits. `RetryOnSourced` | `EntitySpec.sourced`; `flow check` |
| 19 | `flow explain` prints the trust list; `flow check` errors and warnings of section 10 | CLI on `Compiled` |

**Mutants to write before the code:** the 31 in `run-mutants.sh`, plus `refreshFeeds` in `sim.ts`, plus `from` at a paced ask, plus a row written with the lane's removal instead of ahead, plus a sourced batch going through the judge.

## 14. What I still doubt

1. **A long-lived quiet mark (section 5).** It's correct, and it's what you asked for over a clock, but an author rendering `unconfirmed` on a field whose save was lost once sees it for weeks. If that shows up on a real screen, `assumeGoneAfter` is ready to add, as a claim, and this is the call you are most likely to change.
2. **A detail view left `unconfirmed` by a refresh that can't ask (2.6).** The honest mark stays with nothing going to clear it until the next real event. Is that fine in an app? The sim says bounded, and nothing says it feels right.
3. **`.covers` as one word for two uses.** It narrows gap marks (harmless if wrong) and widens trust (silent if wrong). I joined them because one session promises one thing, but a wrong `.covers` is silently wrong and only the trust list says so.
4. **3 asks and 4,096 rows are guesses,** though not about time.
5. **Row written ahead for a non-persisted machine (4.1), against the review's advice.** It adds an awaited capture to a machine that opted out of persistence. If storage is refused, that write ends `StorageRefused`, for a machine that never asked for storage. I think that's still better than forcing `persist`. It's a real surprise, though, and nothing ran on it.
6. **`restart` on an unordered feed is silent.** I stated it and did not solve it. It's the one way a plausible server stays wrong and unmarked with a live feed and no trust-list warning at runtime.
7. **The trust list's "read-your-writes" is wider than the first proposal said.** "With a version the floor catches it" holds on the direct trace (T4b) but not in general: `trust.lag` fails on all versioned configurations, for example a blank claim taken at a floor tie, or lag after a reload. So I no longer claim L6 is half solved.
8. **`guarded` is a claim that the server enforces `If-Match`.** A server that ignores it ends a mark falsely. On the trust list, and untested on a real server.
9. **A sourced mark's "next statement" exit.** A batch about that key does not prove the timed-out commit is finished, only that the engine has spoken. Fine for a client-coherence mark, and I'd check it with Electric before trusting it.
10. **A row left behind by a kill just after a success** (4.5) marks a field with no exit if unguarded. Rare, safe, unmodelled.
11. **The model is one record.** Field functions, answers beyond two picks, list `.where`, bulk and actors are reasoning, and the first proposal's 13.13 (a claim over a replayed field function) is unchanged.
12. **None of the public API compiles against real Schemas yet.** The spike typed shapes with plain types.
