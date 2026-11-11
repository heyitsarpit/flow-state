# Entity store, from scratch

Status: **everything here is proposed**, except what the brief decided: per-field versions, a top-level entity table, entities optional and not up for cutting, client coherence not a sync engine, Flow not a network library. Nothing in `.plan` files or `machine-design.md` changed. No runtime code. Marks: **[ran]** on a throwaway model in the scratchpad, **[read]**, **[reasoning]**. The model is 110 lines of store and 300 of fake server, one record, not the runtime; section 6 says what it proves and what it does not.

## 1. The rule

> **An answer decides a field only if it carries that field and can be ordered after what the store holds for it. What it carries and cannot order, it cannot decide: the store keeps its value and marks a doubt. What it does not carry, it does not touch.**

Everything an answer can be reduces to three facts, and the judge reads only those:

| Fact | Meaning | Where it comes from |
| --- | --- | --- |
| **carries** | exactly which fields it speaks for, with values | the Schema it was declared with |
| **position** | a server version if it has one, and always a local window `[from, landed]`: the answer describes the server at some moment inside it | the wire; the moment the request truly started or the session was proven; the moment it landed |
| **rest** | what it says about the fields it does not carry: nothing is left over (`none`), they did not change (`unchanged`), or I do not know (`unknown`) | how it was declared |

```ts
// The whole judge. One function, once per carried field. Internal: authors never see it.
const order = (e: Evidence, c: Cell | undefined): "after" | "same" | "before" | "unknown" => {
  if (c === undefined) return "after"                                  // nothing held
  if (e.at !== undefined && c.at !== undefined) {
    if (c.exact) return cmp(e.at, c.at)                                // both versioned: the version decides; incomparable is "unknown"
    if (cmp(e.at, c.at) === "before" || cmp(e.at, c.at) === "same") return "before"   // c.at is only a floor: a claim made after that version
  }
  return e.from >= c.landed ? "after" : "unknown"                      // asked after we knew: it saw what we saw. Otherwise it overlaps
}
// after            take the value and the window
// same, equal      keep; the window moves forward
// same, different  keep; doubt
// before           keep; nothing
// unknown, equal   keep; the window moves forward
// unknown, differs keep; doubt
```

Every kind of answer is one row of the same three facts. This table is the constructors, not cases in the judge:

| Answer | carries | position | rest | How it is declared |
| --- | --- | --- | --- | --- |
| Whole record: a read's row, a write's full response, a repair | every field | its version; `from` = the request's start (a write: its first send) | `none` | `.one(Ticket)`, `.list(Ticket, select)` |
| Partial frame, a delta: "these changed" | its fields | its version; `from` = the session's proof, or the previous frame if the feed is ordered | `unchanged` while the session covers the record | `Ticket.patch(key, fields)` in `listen` |
| List row, a projection: "I only show these" | the pick | its version if picked; `from` = the read's start | `unknown`; `unchanged` while a live session covers the record | `.list(Ticket.pick("id", "title", "revision"), select)` |
| Partial write response | the pick | as above, `from` = first send | `unknown`, same exception | `.one(Ticket.pick("title", "revision"))` |
| Listen frame, whole | every field | as delta | `none` | `Ticket.row(row)` |
| Tombstone | every field, as absent, and `$present: false` | `{ version }` if given | `none` | `Ticket.delete(key, { version })`, `.gone("TicketNotFound")` |
| Success with no body | nothing. The prediction becomes a **claim**: the write's fields, marked `unconfirmed`, with no exact version | `[first send, now]`, floor = what the cell had | | a write with no `.one` |
| Unknown ending | nothing. An **open window** on the fields it touched | `[first send, ∞)` | | any write |
| Definite failure | nothing | | | any write |

So a tombstone is just a whole answer whose values are absent. A repair is just a read. Existence is a field (`$present`), so `A4` (tombstone, then a patch) is the same comparison as a title. Key fields have no cell: the key is the record's name, and it cannot be stale.

**Doubt and uncertainty are one thing: a window on a field that nothing has yet been proven after.**

```ts
type Doubt = { field: string; to: number | "open"; attempt?: string }
// Raised by: a conflict (`to` = when it landed), or an unknown ending (`to` = "open").
// Closed by: an answer that carries that field, is ordered "after" or equal, and has `from >= to`. "open" never satisfies that.
// An open window closes only when: a re-send of that Attempt succeeds (the server deduplicates, so the first cannot land too),
// or `landsWithin` has passed since its last send, which turns "open" into that moment, and one read is asked for.
```

That one sentence replaces "a read never clears `uncertain`" and "a repair clears a doubt": a read after a conflict does clear it, a read during a lost write does not, and neither is a special case. M12 is impossible by construction: an answer that does not carry a field cannot reach that field's doubt.

**The window is not an optimisation.** My first draft kept only `landed` on a cell. The model failed at once on `part read otherRemove otherBack hello answer.start answer.start`: a read started before a gap lands after it and looks fresh. A cell keeps the whole window it was proven in, and "stale since a gap" reads `since`, not `landed` [ran].

## 2. Where the data comes from

Flow calls nothing. The author's service calls `fetch` or an SDK, and the contract's Schema says what came back. Evidence is the value after that Schema, and the Schema's fields are what it carries.

```ts
// ticket-api.ts. user-defined: everything here. The real API, with its real partial answer.
export const saveTitle = (i: TicketKey & { title: string }, o: { idempotencyKey: string; signal: AbortSignal }) =>
  Effect.tryPromise({
    try: () => fetch(`/w/${i.workspaceId}/tickets/${i.ticketId}`, {
      method: "PATCH",
      headers: { "Idempotency-Key": o.idempotencyKey, "Content-Type": "application/json" },
      body: JSON.stringify({ title: i.title }),
      signal: o.signal,                                     // AbortController lives in the contract's lifetime, not in the store
    }).then((res) => res.json()),                           // { title: "new", revision: 2 }: the server answers two fields
    catch: () => new NoResponse(),
  }).pipe(Effect.flatMap(Schema.decodeUnknownEffect(TitleSaved)))

export const TitleSaved = Schema.Struct({ title: Schema.String, revision: Schema.Number })  // user-defined
```

```text
fetch → service → contract.commit (output: TitleSaved) → settlement → carries { title, revision } at 2, window [first send, now], rest unknown → judge, per field → one publication
socket → Feed.callback → stream contract → `listen.as` → carries, position, rest → judge, per field → one publication
```

A prediction never goes through the judge. It is an overlay in queue order, replayed over the cells, as it is today.

## 3. Before and after, complete

The server here answers `PATCH` with two fields, and its socket sends patches. Machine, definition and fragment **do not change**, and that is a result: the store's redesign does not reach the author's workflow code. They are written out so that can be checked.

**Before, the domain and the feed** (from `dispatch-desk/features/Tickets/`, trimmed to these entries; a partial answer has no spelling, so it was wrong):

```ts
// ticket.domain.ts. BEFORE
export const Ticket = entity({          // existing: entity
  id: "DispatchDesk/Ticket",
  fields: TicketRow.fields,
  primaryKey: ["workspaceId", "ticketId"],
  version: "revision",                  // meant: "the record as a whole is at v"
})
export const TicketsDomain = domain("tickets", {
  ticketById: read(ticketById).one(Ticket).byKey(({ input }) => ({ workspaceId: input.workspaceId, ticketId: input.ticketId })),
  saveTitle: write(saveTitle).one(Ticket).predicts(({ input }) =>   // `.one(Ticket)` over a two-field answer: H2's A1
    Ticket.patch({ workspaceId: input.workspaceId, ticketId: input.ticketId }, { title: input.title })),
})
// feed.domain.ts. BEFORE
export const TicketFeed = domain("ticket-feed", {
  changes: listen(ticketChanges).as([Ticket], (event) => {
    if (event._tag === "TicketRemoved") return Ticket.delete({ workspaceId: event.workspaceId, ticketId: event.ticketId }, { version: event.revision })
    const { workspaceId, ticketId, ...fields } = event.ticket
    return Ticket.patch({ workspaceId, ticketId }, fields)          // a whole row and a patch had one spelling: H2's A2, A4
  }),
})
```

**After:**

```ts
// ticket.domain.ts. AFTER
export const Ticket = entity({          // existing: entity
  id: "DispatchDesk/Ticket",            // user-defined value
  fields: TicketRow.fields,             // existing: fields
  primaryKey: ["workspaceId", "ticketId"],   // existing: primaryKey. Compiles to `keyFields` with their Schemas (section 7)
  version: "revision",                  // existing word, NEW meaning: "this field says which version an answer speaks from". One per record is the common case
})
export const TicketsDomain = domain("tickets", {     // existing: domain
  ticketById: read(ticketById)                       // existing: read
    .one(Ticket)                                     // existing: one. Whole
    .byKey(({ input }) => ({ workspaceId: input.workspaceId, ticketId: input.ticketId }))   // existing: byKey. The entity's repair, so nobody wires one
    .gone("TicketNotFound"),                         // NEW: gone. This error means "no such record": a tombstone. user-defined: the tag
  saveTitle: write(saveTitle)                        // existing: write
    .one(Ticket.pick("title", "revision"))           // existing: one, pick. NEW: pick as a target. Type error unless the output has exactly these
    .predicts(({ input }) =>                         // existing: predicts
      Ticket.patch({ workspaceId: input.workspaceId, ticketId: input.ticketId }, { title: input.title })),   // existing: patch
})
// feed.domain.ts. AFTER
export const TicketFeed = domain("ticket-feed", {
  changes: listen(ticketChanges).as([Ticket], (event) => {   // existing: listen, as
    if (event._tag === "TicketRemoved")
      return Ticket.delete({ workspaceId: event.workspaceId, ticketId: event.ticketId }, { version: event.revision })   // existing: delete, version
    if (event._tag === "TicketPatched") {
      const { workspaceId, ticketId, ...fields } = event.patch
      return Ticket.patch({ workspaceId, ticketId }, fields)  // existing: patch. Now means a delta, and in `listen` only. `fields` must include `revision`, by type
    }
    return Ticket.row(event.ticket)                           // NEW: row. A whole row, in a frame
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
        failure: { TicketNotFound: E.Refused, TicketLocked: E.Refused, TitleRejected: E.Refused, NotSent: E.Refused },
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
          { target: "self", actions: [O.save.cancel(own)] },                   // existing: cancel. Gives up; the mark stays, durably, until `landsWithin` (section 4)
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
// TicketTitle.tsx. One word differs: the read now answers for what it picked
const key = { workspaceId, ticketId }                                      // user-defined
const t = useView(desk, (s) => Ticket.get(s, key, Ticket.pick("title")))   // existing: get, pick
// { data: { title }, predicted, uncertain, unconfirmed, missing }         // existing: the first four, each now about `title` alone. NEW: missing
<h1 className={t.predicted ? "grey" : ""}>{t.data?.title}{t.uncertain ? " ?" : ""}</h1>
```

**No-version servers: nothing to write.** Leave `version` out and the local window does all the work. A feed the author knows is in order says so:

```ts
// messages.domain.ts. A socket with no version, from one server process, in order
export const Message = entity({ id: "Chat/Message", fields: MessageRow.fields, primaryKey: ["id"] })   // no version
export const MessageFeed = domain("message-feed", {
  changes: listen(messageChanges, { order: "arrival" })                        // NEW: order. Without it, a frame cannot be ordered against another frame
    .as([Message], (m) => (m.deleted ? Message.delete({ id: m.id }) : Message.row(m.message))),
})
```

**Per-field versions on the wire** (a server with a clock per field):

```ts
export const Doc = entity({
  id: "Notes/Doc",
  fields: DocRow.fields,
  primaryKey: ["id"],
  version: { perField: "clocks" },     // NEW form. `clocks` is the field name, user-defined. It holds { title: 3, body: 7 }, is never a cell, and `rest` stops mattering
  versionOrder: Order.BigInt,          // existing: versionOrder. NEW: takes an Effect `Order`. Numbers and bigints need nothing; a string needs it
})
```

## 4. Life of a field

```text
              commit                       success, carried                    later evidence
 known ───────────────▶ predicted ─────────────────────────────▶ known (judge decides, may lose to newer)
                          │  │  └─ success, not carried ───────▶ unconfirmed (a claim) ──▶ known, by a read started after it
                          │  └──── definite failure ───────────▶ whatever is beneath, unmarked
                          └─────── unknown ──▶ predicted + uncertain ──▶ repair lands ──▶ uncertain, shows the server
                                                                          │
                     re-send succeeds, or `landsWithin` passes then a read ┘──▶ known
```

What a view reads, for the fields it picked and only those:

| Mark | Means | Who clears it | Does it ask? |
| --- | --- | --- | --- |
| `predicted` | an open write's overlay is showing | that Attempt's end | no |
| `uncertain` | evidence conflicted, or a lost write may still land | section 1's doubt rule | **the entity's repair, once per doubt, one in flight per record** |
| `unconfirmed` | probably fine, unproven: a claim; a field behind a version we have seen; a field not re-proven since a gap or a boot | any read carrying it, started after | **refreshes live answers that carry it**, never a by-key read |
| `missing` | no value yet (a stub, or just after a tombstone) | any evidence carrying it | no |

`unconfirmed` is derived from a cell, not stored: `c.claim || c.at < rec.seen || c.since < entity.staleBefore`. A gap is a single integer per entity, and a boot is a gap, so M10's forgotten record costs nothing per record.

**Repair stays bounded (M5).** A versioned frame never conflicts, so a hot feed raises no doubts and a repair is never restarted by one [ran: 10 patch frames during a repair, 1 repair, no doubt left]. Only unversioned, undeclared frames conflict; those ask at most once per second per record, and `flow check` warns on such a feed (section 7). A failed repair backs off like storage and names `RepairOverdue` once; the mark stays, so nothing is silently wrong while waiting.

**`landsWithin` is new, and it replaces clearing by a later write.** Rule 32 lets a later write's success clear a released Attempt's mark. **The model breaks that:** `write write.lost part answer write release answer reload answer retry.ok read answer landLate` shows the second write's value, unmarked, with the first write's on the server [ran, `none-nofeed`; a record-versioned config fails the same way on `rev`]. A later success cannot prove an earlier request will not land, and the brief's rule says what cannot be proven cannot decide. So a mark ends by the Attempt's own re-send, or by time:

```ts
export const saveTitle = transaction({
  id: "DispatchDesk/save-title",
  input: { workspaceId: Schema.String, ticketId: Schema.String, title: Schema.String },
  output: TitleSaved,
  key: ["workspaceId", "ticketId"],
  concurrency: "reject",
  landsWithin: "10 minutes",                 // NEW, optional, default 10 minutes. A background-sync service worker says "Infinity"
  commit: (input, { attempt, signal }) => TicketApi.use((api) => api.saveTitle(input, { idempotencyKey: attempt.id, signal })).pipe(unknownWhenLost),
})
```

**Durability, and what "two actors are not one cut" becomes.** Rule 38 already restores an Attempt's keys from its lane. The only hole is a lane that is gone while its request may still land, which is Released. So:

```text
store/unsettled       { attempt, entity, key, fields, lastSentAt, landsWithin }   written in the SAME batch that removes the lane. Awaited, as the lane was
store/<entity>        cells and stamps, only if a `persist: true` read holds the entity. Plain memory: coalesced at 5 s, flushed on hide. May be older than anything
```

Every remaining parting of table and lane is in the safe direction, and I state that as the invariant rather than trying to make them one cut:

- **Lane newer than table** (kill after a success): restored cells are older, and every restored cell reads `unconfirmed`, because a boot is a gap.
- **Table newer than lane** (kill before the lane's ending was captured): the lane restores as a hold, so one more doubt and one more read, never less.
- **Neither:** a wipe. Chrome deletes the origin: lanes, `unsettled` and cells go together. The store then holds nothing, so it can show nothing false. A lost request may still land; that is `REV8-WIPE`'s stated limit, and a business key is still the rule for money.

Pacing cannot make it wrong, because **evidence is never behind a pace.** D115 delays a turn. A store effect lands at settlement, and `from` is taken when a request truly starts, so a paced read has no window until it runs. A bulk close is one Attempt, one evidence batch, one publication; past 4,096 keys it ends `Overloaded`, out loud. A thousand unknown rows ask a thousand repairs through one queue per entity, capped at 8 in flight (a guess), never dropped, and each row stays marked while it waits; a `RequestResolver` in the author's service batches them on the wire, as `ticket-api.ts` already imports.

## 5. Seven very different cases

The machine does not change in any of them, so these show the source and the domain. Keywords as in section 3; only the new ones are marked.

**1. A chat list with projections.** Conversations come from `GET /conversations`, projected; opening one loads it whole; a socket sends new messages whole and conversation changes as deltas.

```ts
export const Conversation = entity({ id: "Chat/Conversation", fields: ConversationRow.fields, primaryKey: ["id"], version: "seq" })
export const Message = entity({ id: "Chat/Message", fields: MessageRow.fields, primaryKey: ["conversationId", "id"] })   // immutable, no version
export const ChatDomain = domain("chat", {
  inbox: read(inbox).list(Conversation.pick("id", "title", "preview", "unread", "seq"), ({ output }) => output.rows),   // NEW: pick as a target
  conversation: read(conversationById).one(Conversation).byKey(({ input }) => ({ id: input.id })).gone("NotFound"),     // NEW: gone
  changes: listen(chatFeed, { order: "arrival" }).as([Conversation, Message], (f) =>                                    // NEW: order
    f._tag === "Message" ? Message.row(f.message) : Conversation.patch({ id: f.id }, { preview: f.preview, unread: f.unread, seq: f.seq })),   // NEW: row
})
```

Result: the list refreshes at `seq: 9` and `members`, loaded at 7 when someone opened it, is **behind**. No by-key read fires, so a hundred rows cost nothing. If that conversation is open, its answer carries `members`, so that one answer refreshes. While the feed is live a projection says `rest: unchanged` and nothing is behind. Streaming an assistant's text per token belongs in machine memory, not here: a store publication per token is the wrong tool, and the design does not try to make it cheap.

**2. A checkout cart.** One answer, many records, a server that re-prices (`checkout/features/Cart/cart.domain.ts`, unchanged except that `.alsoChanges` now says which fields are marked on an unknown).

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

Result: the answer's records and the overlay's removal publish as one cut. A price frame beneath a pending change moves `unitPriceCents`; the line total replays. An unknown marks `quantity`, `lineTotalCents`, `subtotalCents`, `totalCents` and each `revision`, and leaves `couponCode` unmarked, where it used to mark the whole cart. Money is untouched: the lane holds, a business key is the rule, and the store's mark is only what the screen says.

**3. A dispatch desk with listen frames.** Section 3. `TicketPatched` is a delta and `TicketUpdated` is a whole row. **Frames out of order** are safe per field: `v5 {title}` then `v4 {slug}` both apply, and `v4 {title}` is dropped [ran, `rec-delta-shuffle`]. Assigning predicts `assignee` and `status`, so `unassigned` removes the ticket at once, and `triage`, whose condition reads a doubted field after an unknown, sees "maybe" and refetches: **a condition over a marked field is "maybe"**, one rule that merge 5's three values already have room for.

**4. A paginated table with partial rows.**

```ts
export const Invoice = entity({ id: "Billing/Invoice", fields: InvoiceRow.fields, primaryKey: ["orgId", "number"], version: "updatedAt", versionOrder: Order.Date })   // NEW: versionOrder takes an Effect Order
export const Billing = domain("billing", {
  page: read(invoicesPage)
    .list(Invoice.pick("orgId", "number", "status", "totalCents", "updatedAt"), ({ output }) => output.rows)   // NEW: pick as a target
    .where(({ input, record }) => eq(record.orgId, input.orgId))
    .orderBy(({ record }) => [desc(record.updatedAt), asc(record.orgId), asc(record.number)])
    .pagedBy(({ input }) => input.page, ({ output }) => output.next),
  invoice: read(invoiceById).one(Invoice).byKey(({ input }) => ({ orgId: input.orgId, number: input.number })),
})
```

`number` is a `Schema.BigInt` and works (section 7). A row that moved to page 2 and left page 1 proves nothing about the record, because an absence is not carried. A page answer that dropped a row a detail view still holds raises one doubt on `$present`, and the by-key read settles it. That covers M10's deleted record without treating a page as complete, which is the sharp edge `sync-engine-adapter.md` section 11 records for TanStack's Query collection. A timestamp version with ties is handled: `same` with different values is a doubt.

**5. An offline-queued edit.** This is the honest case for what Flow is not.

```ts
export const saveNote = transaction({
  id: "Notes/save",
  input: { id: Schema.String, body: Schema.String },
  output: NoteRow,
  key: ["id"],
  concurrency: "latest",
  landsWithin: "Infinity",        // NEW. A service worker may send it tomorrow, so nothing but this Attempt's own answer ends the mark
  commit: (i, { attempt, signal }) => NotesApi.use((api) => api.put(i, { idempotencyKey: attempt.id, signal })).pipe(unknownWhenLost),
})
```

Result while offline: `NoResponse` is unknown, the lane holds, the schedule re-sends, `row.uncertain` shows, the overlay ends at the forced repair (which also fails, so it does not end). Close the tab: the lane restores, the mark comes back with its keys, the **prediction does not**, so the screen shows the server's old body and a `?`, and the user's text lives on only if the machine kept it as a draft in memory. That is rule 38, and it is right for client coherence. An app that needs local-first edits across reloads, offline queries or conflict merging needs a real engine behind case 6 (`offline-transactions/src/outbox/OutboxManager`). **The store says so instead of faking it.**

**6. A TanStack DB collection behind the seam.** Section 8, code in full, run against its real source.

**7. A server with no versions at all, read through a CDN.** `GET /settings`, no version, no feed. A read after a read: `from >= landed`, so `after`. Overlapping reads that differ: one doubt, one more read. A write's whole response: taken if nothing landed since it was sent. **The one thing it cannot do is L6:** a lagging replica answering a read started after a write looks `after`. With a version the floor catches it (`v <= floor` is `before`). Without one it is stated: `after` assumes read-your-writes. See section 13.

## 6. The problems, one at a time

**[ran]** means the model, not the runtime. It runs nine configurations of version, feed and ack shape, with reads that answer from their start or from now, lost writes that land late, retries, releases, expiry, reloads, gaps, removals and returns. **27,000,000 walks, 0 failures; oracle: at quiescence, every field unmarked equals the server.** It has one record and one write at a time, and no field functions, no lagging replica, no per-field clocks. Its eight mutants each fail: field scope (6 of 9 configurations), `unknown` taking (5), no behind (4), no floor (1), a read clearing a lost write (7), doubts forgotten at reload (2), no gap (6), an equal answer not moving the window (3). The output is in the scratchpad, `model/`, and nothing there is meant to be kept.

| Problem | Trace | Under this design |
| --- | --- | --- |
| H2 A1 | retitle ok `{ title, v2 }`, list row v1 | `title: new`, the rest from the row, all present, the rest `unconfirmed` (behind v2) [ran] |
| H2 A2 | 204, frame `{ title, v3 }`, row v1 | `archived: true`, `slug` present. `unconfirmed` if a base was held; `uncertain` if not, since then a claim has no floor [ran] |
| H2 A3 | frame `{ readAt, v5 }`, rename ok whole v4 | `title: mine`, `readAt` from v5, unmarked, right. Field by field, the response is not Stale [ran] |
| H2 A4 | tombstone v2, frame `{ title, v3 }` | `$present` true at 3, `title` known, the rest `missing`. Not a silent partial: `get` returns no `data` for a pick with a missing field. Older evidence after a tombstone stays `before` because absent cells keep their version [ran] |
| M12 | doubt on `archived`, projection of `title` | still `uncertain` on `archived`, nothing on `title` [ran] |
| M5 | 10 frames during a repair | 1 repair, no doubt left [ran] |
| M10 | feed dies, refetch fails | every cell `unconfirmed` the moment the session drops. The drop must mark at once: a mark only at re-entry failed the model [ran]. Deleted meanwhile: by-key `gone` if read; otherwise marked, not wrong |
| L5 | number, string, older number | the version field's Schema refuses a string on an entity declared with numbers. `flow check` errors on a non-numeric version with no `versionOrder`. Incomparable is `unknown` [reasoning] |
| L6 | no version, lagging read after a write | stated limit; with a version it is `before` [ran for the version half] |
| L8 | two tabs | one store per Runtime, no change. The store never claims across tabs |
| L9 | stale `OLD-RULE` flags | `REV6-H2`, `REV6-H4`, `REV6-L3` and the rule-32 rows need re-citing. The builder's first chore |
| `an-actor-disposed...` | archive 204 lands after the actor died; `revision` 1 against 2 | A success with no body is a claim on the fields it predicted **and on the version field**, which it just proved old. Unconfirmed, not silent. Repair belongs to the store, so disposal cannot stop it. Not run on the real harness [reasoning, the claim itself ran] |
| `listen.load` | `hello other frame.now frame.was` | **The search's name misleads.** `which.split(".")[1]` is `load`, not `version`, so it is the no-version fixture with D74's excuse off (`listen.search.ts:89,122`); `listen.none` is the same fixture, excused, and passes. It is a real failure of "arrival order is good enough". Now: `frame.was` cannot be ordered against `frame.now` (`from` = the proof), differs, so `title: other1 [uncertain]`, a repair, truth, no mark [ran]. **It passes with the excuse removed, and the excuse can go** |
| `fragstore.row` | `Go ack put.lost GiveUp reload Fetch fetch.truth landLate` | `GiveUp` writes `store/unsettled` in the lane's removal batch, so the reload keeps the mark, `Fetch` shows the old value still `uncertain`, `landLate` is excused by the mark, and the window's end asks one read [ran, by hand on the store; the batch is section 7's core change] |
| M6 | a real engine | Section 8 |
| Wipe, pacing | section 4 | Section 4 |

What the model changed in this design, so nobody thinks the rule came out right first time:

1. A cell keeps `since` as well as `landed` (a read from before a gap landed after it).
2. Later-write clearing is gone (section 4).
3. A claim on the version field must move that cell's window, or a read from before the write takes it.
4. **I had a third partial verb, `Ticket.changed`, for a write's response meaning "only these changed". It is unsound, so it is cut:** `write read answer otherRemove otherBack write.ok` shows a stale field unmarked [ran]. "Unchanged" can only be promised by a session that is watching. So `patch` is `listen`-only, and a projection or a partial response gets `rest: unchanged` only while such a session covers the record.
5. A session's drop marks at once, not at the next hello.
6. An open doubt asks for a repair once, or it asks for ever.

## 7. `Compiled`: where the data goes

`DomainSpec` goes. Everything that is data stays data, and every closure is a Slot, so the typed path compiles to it and `flow check` reads it without running anything.

```ts
// NEW, on Compiled. Top level by entity id. Each machine lists the entities it touches; the Runtime merges them by id,
// and two different specs under one id is `EntityConflict`, from `flow check` and at start.
export type Compiled = { /* existing fields, minus `domain` */ readonly entities?: Readonly<Record<string, EntitySpec>> };

export type EntitySpec = {
  readonly id: string;
  readonly fields: Readonly<Record<string, Schema.Top>>;                           // data. `flow explain` and persistence read it
  readonly keyFields: ReadonlyArray<{ readonly name: string; readonly schema: Schema.Top }>;   // order is primaryKey's
  readonly version?: {
    readonly per: "record" | "field";
    readonly field: string;                                                        // data
    readonly order: "number" | "bigint" | Slot<(a: unknown, b: unknown) => number>;// an Effect `Order`, compiled to a Slot. A string or a Date needs one
  };
  readonly repair?: string;                                                        // an Op's id: the `.byKey` read. Data, not a closure
  readonly persisted: boolean;                                                     // derived: a `persist: true` read holds it
  readonly sourced: boolean;                                                       // written only by one `listen` (section 8)
};

export type Carry = {
  readonly entity: string;
  readonly shape: "whole" | "part" | "patch" | "delete";
  readonly fields: readonly string[] | "all";                                      // data: `Ticket.pick(...)`'s list
  readonly take: Slot<(value: unknown, input: unknown) => ReadonlyArray<Said>>;    // select: the rows inside an answer
};
export type Said = { readonly key: unknown; readonly row?: Readonly<Record<string, unknown>>; readonly version?: unknown; readonly pending?: boolean };

export type Touch = {
  readonly entity: string;
  readonly fields: readonly string[];                                              // data: what an unknown marks. `.predicts`' fields, recorded at construction, plus `.alsoChanges`
  readonly key: Slot<(input: unknown) => unknown>;                                 // a key, or an array of them
  readonly many: boolean;
  readonly predict?: Slot<(input: unknown) => ReadonlyArray<{ readonly key: unknown; readonly patch?: Readonly<Record<string, Slot<(beneath: unknown, input: unknown) => unknown> | { readonly value: unknown }>>; readonly remove?: true }>>;
};
// Op gains:         carries?: readonly Carry[]; touches?: readonly Touch[]; gone?: { entity: string; tag: string; key: Slot<(input: unknown) => unknown> }; landsWithinMs?: number;
// StreamSpec gains: carries?: readonly Carry[]; order?: "arrival"; covers?: { entity: string; when?: Slot<(input: unknown, record: unknown) => boolean> };
// StreamSpec loses: nothing. Sessions keep `gap`, `live`, `down`.
```

**Typed keys.** `primaryKey: ["orgId", "number"]` names fields, whose Schemas are already in `fields`. Nothing new for an author, and `keyFields` is what it compiles to. A key's name in the table is built by Flow from the JSON codec of those Schemas, in that order, and no author ever sees it:

```ts
const codec = Schema.toCodecJson(Schema.Struct(keyFieldsAsRecord))   // Effect's own. Today: `1n` as a key restores as "$1n" (round 9, item 7)
JSON.stringify(order.map((f) => Schema.encodeSync(codec)(key)[f]))   // ["w","12345678901234567890","1970-01-01T00:00:00.000Z"]
```

**[ran, effect 4.0.5]:** `Schema.BigInt` and `Schema.Date` round-trip through this, and `12345678901234567890n` comes back a `bigint`, equal. `flow check` errors on a key field with no JSON codec. So `ticketRef`, `Entity|key` strings and `version(ref)` leave the format, and a harness reads `h.read.record(Ticket, key)`.

**What `flow check` gains.** Listen on an unversioned entity with no `order`: warn, with the cost, one read per conflict. A string version with no `versionOrder`: error. A predicted field no answer carries and with no repair: warn `NeverConfirmed`. Two `.byKey` reads of one entity: error, the second says `.repair(false)`. A `sourced` entity with a `.predicts`, or two sources: error. A `pick` that leaves out a key field: type error.

**The module seam, `round-9/seam.ts`, is close, and needs three things:** `Ended.sentAt` splits into first and last send; `pushed` carries the session's `from` (and `gap` its moment, which `onGap` already computes); and **one real core change, a module's durable slice:** `store/unsettled` must join the batch that removes the lane. `Module.save(s, attempt)` only writes with an Attempt, and M6 already named this gap.

## 8. The seam: a real engine behind it

**The shape.** An engine has one ordered output, whole rows, and owns its own optimistic layer. In the three facts that is: carries every field, `from` = its previous batch, rest `none`. **So an engine is a `listen` with `order: "arrival"`, and it needs no second path:** every comparison says `after`, and the judge is a pass-through.

```ts
// tickets.db.ts. user-defined. Real TanStack DB
export class TicketsDb extends Context.Service<TicketsDb, { readonly tickets: Collection<TicketRowType, string> }>()("app/TicketsDb") {}

// tickets.contracts.ts
export const ticketRows = stream({                                 // existing: stream
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
        gone: m.type === "delete",
        pending: db.tickets.get(m.key)?.$hasPendingWrites ?? false,    // TanStack's own flag
        row: m.value,
      }))), { includeInitialState: true })
      yield* Effect.addFinalizer(() => Effect.sync(() => sub.unsubscribe()))
    })))),
})
export const retitle = transaction({
  id: "Tickets/retitle",
  input: { id: Schema.String, title: Schema.String },
  key: ["id"],
  concurrency: "serialize",
  landsWithin: "0 seconds",                                        // NEW. The engine owns the outbox; the next batch is the truth
  commit: (input, { attempt }) => Effect.gen(function* () {
    const db = yield* TicketsDb
    const api = yield* TicketApi
    const tx = createTransaction({
      id: attempt.id,
      autoCommit: false,
      mutationFn: async () => {
        const { txid } = await api.retitle(input, attempt.id)
        await db.tickets.utils.awaitTxId(txid, 10_000)             // Electric: confirmed when the row is in the stream
      },
    })
    tx.mutate(() => db.tickets.update(input.id, (draft) => { draft.title = input.title }))   // the engine's overlay, not ours
    yield* Effect.tryPromise({ try: () => tx.commit().then(() => undefined), catch: classifyTanstack })
  }),
})
// tickets.domain.ts
export const Ticket = entity({ id: "Tickets/Ticket", fields: TicketRow.fields, primaryKey: ["id"], sourced: true })   // NEW: sourced. Exactly one writer
export const TicketsDomain = domain("tickets", {
  rows: listen(ticketRows, { order: "arrival" }).as([Ticket], (batch) =>   // NEW: order
    batch.map((c) => (c.gone ? Ticket.delete({ id: c.row.id }) : Ticket.row(c.row, { pending: c.pending })))),   // NEW: row, pending. `pending` reads as `predicted`
  retitle: write(retitle).alsoChanges(({ input }) => Ticket.fields({ id: input.id }, ({ record }) => [record.title])),   // what an unknown marks. No `.predicts`: a type error here
})
```

The machine is the same as for a plain entity, and a view is still `Ticket.get(s, key, Ticket.pick("title"))`. Live queries stay what `references/design/sync-engine-adapter.md` says, a `stream` whose `latest` the machine reads; this adds `get` by key beside them, so a record moves between tiers without touching a screen.

**[ran, against TanStack DB's real source, a copy of `codebases/db` at `15d2d2d`, with one store model behind `subscribeChanges`:**

```text
start                    title first, n 1                    pending false
predicted                title mine (engine's overlay)       pending true
frame while persisting   held by the engine: no batch        pending true     (types.ts: commit visible when the transaction settles)
settled                  title mine, n 2                     pending false
refused, rolled back     title mine (the batch reverts)      pending false
deleted by source        $present false, cells absent
doubts raised: 0, on 6 batches.
```

That ran the read path, the overlay flag and the rollback, through the judge. It did not run Flow's runtime, Electric, `Feed.callback` or a machine. M6 asked for "one real integration, in a day". This is a small part of it.

**M6's four, answered:**

| M6 | Answer |
| --- | --- |
| **Protocol:** `lastMutationIDChanges` is a counter; `att-uuid` cannot map to it | It need not. The commit awaits the engine's own promise and Flow never sees the number: `MutatorResult = { client, server }` (`mono/packages/zero-client/src/client/custom.ts:72`), and `lmidAdvanced` is inside `mutation-tracker.ts:282`. No seam for issuing ids |
| **Durability:** two outboxes tear | There is one: the engine's. `landsWithin: "0 seconds"` means Flow keeps no doubt across a reload for it. The engine's overlay is not ours to persist |
| **Reads by query over a mutable store** ("the real blocker") | Not copied per poke and not read through. The world holds a per-key table of **held** rows, fed by batches that are recorded inputs, so replay stays pure. TanStack gives stable row objects, shared by reference. **Zero says its data is "valid until next time listener is called" (`zql/src/query/typed-view.ts`), so Zero's binding must copy.** Stated cost. Needs the table per key rather than a spread: round 6's S4 |
| **Bounds:** a success and no poke for an hour | `awaitTxId(txid, 10_000)`: the commit times out, unknown, marked. An engine's confirmation has to have a timeout, as the adapter doc already requires |

**Zero**, the same shape from a different engine, read and not run:

```ts
// user-defined. `z` is a Zero client from a Layer. Row patches are `put`, `update { merge }`, `del`, `clear`
// (mono/packages/zero-protocol/src/row-patch.ts:6-36), ordered by cookie in `mergePokes`, which throws on a gap (zero-poke-handler.ts:301-317).
// We never see those: a materialized view gives whole rows plus a ResultType ('unknown' | 'cached' | 'complete' | 'error', typed-view.ts:5).
subscribe: ({ projectId }) => Stream.unwrap(Effect.map(ZeroClient, (z) =>
  Feed.callback<ReadonlyArray<IssueChange>, never>((emit) => Effect.gen(function* () {
    const view = z.materialize(z.query.issue.where("projectId", projectId))
    let last = new Map<string, IssueRowType>()
    let proven = false
    const off = view.addListener((rows, resultType) => {
      if (!proven && (resultType === "complete" || resultType === "cached")) {
        proven = true
        emit(Feed.live({ proof: resultType }))
      }
      const next = new Map(rows.map((r) => [r.id, { ...r }]))       // valid only until the next call, so copied
      emit(diffRows(last, next))                                    // user-defined: gone or changed, by id
      last = next
    })
    yield* Effect.addFinalizer(() => Effect.sync(() => { off(); view.destroy() }))
  })))),
commit: (input) => Effect.flatMap(ZeroClient, (z) => Effect.tryPromise({
  try: () => z.mutate.issue.retitle(input).server,                  // the server's verdict, not the local one
  catch: classifyZero,
})),
```

**If an engine wanted Flow's overlay instead,** a Query collection with no handlers is a plain read and a socket is `listen`: then it is a normal entity and needs none of this.

## 9. Consequences for the rest of the system

- **Rules.** 26-29, 31, 33-37 keep their meaning. **30:** same effects, expressed on fields. **32 is replaced** (section 4). **38 gains** `store/unsettled`. **Proposed; no plan is edited until accepted.**
- **Lanes and the core:** nothing, except the module's durable slice. `pending`, `Held`, retry, cancel and the queue do not change. `O.like.get(s, k).uncertain` stays the lane's; `row.uncertain` stays the store's, and is now about the fields you picked.
- **The record queue stays per record.** Per-field queues would look natural here and are wrong: `If-Match` compares the record's version, and a server serializes the record. `basedOn` reads the version field's cell.
- **Reads, `value`, `success:`** (rule 37): answers stay what the server said. Overlays never reach them.
- **Lists.** `.where` three-valued: a marked or missing condition field is "maybe", so the list refetches. A predicted field's value still drives `.where` at once, as now. Answers hold keys and order, so a projection and a whole row share one record.
- **Persistence.** One small record (`unsettled`). Cells are plain and coalesced, so they add no awaited writes, and fewer writes is the direction H3 asks for. Decode per field by Schema; a field that fails is `missing`, not a lost record (M9's direction).
- **Stories.** Fakes must answer in partial shapes: `Fake.answer("retitle", { fields: { title: "new", revision: 2 } })`. `cp.entity(Ticket, key)` returns the same read a view gets, plus `.cells` for a test: value, version, window, marks. A timeline step names evidence and verdict. **Fake servers must send patches; `server.ts`'s whole rows are how H2 hid (M4, H6).**
- **CLI.** No new command. `flow explain` answers "what can move `Ticket.title`": from `carries`, `touches`, per field. `flow graph` gets field-level edges. `flow trace` prints the judge: `retitle.ok title kept: v4 before v5`. `flow check` as in section 7. A `listen`'s `.as` is a closure, so static explain says "any field of Ticket" unless its target is a pick, the same limit guards have.
- **Single graph and runtime:** one table, one store, one judge, and engines arrive through `listen`, so there is no second path. `check()` predicts nothing, as today.
- **SSR.** A server render's answer is evidence with a window from before the page: `from` is the boot floor, so any read after it is `after`.
- **Memory** [ran]: 10,000 records of 10 fields. Rows alone 1.9 MB; rows plus one shared stamp 2.5 MB; a cell object per field 8.3 MB. So **a record holds its values and one stamp, and splits per field only when evidence diverges them.** Whole-row records pay 30%, a diverged record pays what it uses. Internal; the judge does not know.
- **Size.** `entities.ts` is 841 lines. A rewrite should be well under half [reasoning]. Lanes and queues stay at their size.

## 10. Prior art, checked

| Source | What it does | What I took, or did not |
| --- | --- | --- |
| TanStack DB, `db/src/collection/state.ts:580` | `recomputeOptimisticState`: replay transactions over synced data | Took: overlay replay. The same as today |
| `db/src/types.ts:446-520`, `:551` | `begin`, `write`, `commit`; `rowUpdateMode: "partial" \| "full"` | **The same split as `rest`**, there per collection. Took per answer, because one REST API mixes them |
| `db/src/types.ts` `commit`, tested | Holds synced data while a transaction persists | Not taken: it would make a store effect wait on a write, against rule 27. Field functions replay instead |
| `db/src/transactions.ts:113-127` | A rollback rolls back others on the same key | Not taken: a failure removes its own overlay only (rule 30). But the engine's own behaviour stands behind the seam, classified `unknown` in `sync-engine-adapter.md` 4.4 |
| `db/src/virtual-props.ts`, tested | `$hasPendingWrites`, `$origin` on a row. Attribution is inferred, and it documents that a peer's write can read `local` | Took `pending`. Did not take attribution: no answer here carries who wrote it |
| Zero, `zero-protocol/src/row-patch.ts:6-36` | `put`, `update { merge, constrain }`, `del`, `clear` | The same as whole, delta, tombstone. **Their total order per client is why they need none of this; Flow's judge exists because REST has no such order** |
| `zql/src/query/typed-view.ts:5` | `'unknown' \| 'cached' \| 'complete' \| 'error'` | Answer-level, as `current(r)` is. Kept at that level |
| Replicache `pending-mutations.ts`, `offline-transactions/src/executor/KeyScheduler.ts` | One in flight per key, blocked by the first unresolved | The record queue, kept |
| TanStack Query | Invalidate after a mutation | The `unconfirmed` refresh of live answers |
| Effect 4.0.5 | `Schema.toCodecJson`, `Order.Number/BigInt/String/Date` | Keys; `versionOrder` takes an `Order` |
| Own, D58 (read afterwards) | An answer is an interval | **I arrived at the same thing from the traces.** D58 was right, and the record-level `version` and claim beside it were the problem |

## 11. Added and dropped

**Added, for authors:** `.one(Ticket.pick(...))` and `.list(Ticket.pick(...), select)`, pick as a target; `Ticket.row`; `listen(x, { order: "arrival" })`; `.gone(tag)`; `landsWithin`; `version: { perField }`; `sourced: true`; `{ pending }` on `row`; `.repair(false)`; `missing` on a read. `versionOrder` takes an Effect `Order`.

**Changed meaning:** `Ticket.patch` in `listen` is a delta. `version: "revision"` names a position, not a state of the record. `uncertain`, `predicted`, `unconfirmed` answer for the picked fields. **`.one(Ticket)` over a partial output is now a type error**, where it used to compile and lose data.

**Added, internal:** cells with windows, `seen`, `staleBefore`, `store/unsettled`, the per-entity repair queue.

**Dropped, read from `round-9/entities.ts` after the design was drafted:**

| Old | Why it is not needed |
| --- | --- |
| `Rec.version`, `Rec.gone` | H2's root. A cell has a version; a tombstone is absent cells |
| `Rec.claim`, `againstClaim`, `echoes`, `pastClaim` | A claim is a cell with a floor |
| `Rec.early`, `Early`, `foldEarly`, `keepEarly`, `EARLY_BOUND`, `earlyOrder` | A frame on an unheld record makes a stub, which is just missing cells. Unbounded by itself, so the table's GC applies (section 13) |
| `Rec.doubt`, `Rec.marks`, `withoutDoubtIf`, `clearMarks` | One `Doubt` per field |
| `place`, `dispose`'s verbs, `heldDiffers`, `admit`'s `fill` | `order` plus six lines |
| `again`, and repair restarts | M5 |
| The stated limit D74 (b): an out-of-order unversioned frame applies | It now raises a doubt. **Costs one read per conflict** |
| `DomainSpec`, `version(ref)`, `versionOrder` per machine, `ref` strings, `Carried.evidence` | Section 7 |
| Rule 32's "a later write clears" | The model breaks it |

**Kept from old, because it was right:** the record queue, `blocks`, answers and `onGap`'s re-reads, forced repair for an unknown, overlays replayed in mint order, field functions, `basedOn`'s rebase.

## 12. Invariants and oracles for a test-first builder

Start here, in this order. **Write the fakes first:** partial answers, patch frames, no-version frames, late landings. Then the whole-record oracle, then the runtime.

**Invariants:**

1. **I1, carried only.** Evidence changes a cell or a doubt only for a field it carries.
2. **I2, no version moves by proxy.** A field's version is only ever set by evidence that carried that field.
3. **I3, nothing silent.** At quiescence, every field not marked `predicted`, `uncertain`, `unconfirmed` or `missing` equals the server.
4. **I4, monotonic.** A cell's version never goes down, and a window's `since` never goes down.
5. **I5, open means open.** While a request may land, its fields stay `uncertain`, whatever any read says, and across a reload.
6. **I6, one direction.** Table and lane may part only towards more doubt: `lane on disk ⇒ its keys marked after restore`; `lane gone, Attempt unresolved ⇒ store/unsettled in the same batch`.
7. **I7, truth is not paced.** `from` is when a request truly starts. A store effect lands at settlement. No pace or chain delays either.
8. **I8, repairs end.** At most one per record in flight; a versioned frame never starts one; every doubt asks at most once until it is closed or a new conflict arrives.
9. **I9, one cut.** One answer's evidence and overlay removal are one publication, across every record and entity it names.
10. **I10, predictions are not evidence.** A prediction never sets a cell, a version or a window.
11. **I11, an engine is a pass-through.** A `sourced` entity's store equals the engine's visible rows after each batch, with zero doubts.

**Oracles, in the harness:**

- **(a) Whole-record, field by field, first.** Replaces `honest`'s two fields, the `r.uncertain` gate in `listen.search.ts`, and `fragstore.search.ts`'s `v`. Every field of `server` against every field's marks. `known-failing-h2.ts` becomes the first red test.
- **(b) `listen.load` with no excuse.** Delete `afterWas`. Rename the search, and pass both shapes by name.
- **(c) `fragstore.row` to depth 9,** and `landLate` after `reload` for every kind of ending.
- **(d) The model's nine configurations as a search,** on the real runtime: `(version | none) × (delta | whole | none) × (fifo | shuffle)`, acks `whole | part | none`.
- **(e) Repair count.** `requests ≤ doubts raised + 1` for each record; hot versioned feed: 0.
- **(f) Field scope.** Mutant `e-partial-clears-all`, which the model kills.
- **(g) Differential on writes:** no pick equals whole; a pick of every field equals whole.
- **(h) Wipe.** `wipe` in this search's alphabet: after it, no field unmarked and wrong except by a request the wipe forgot, which `REV8-WIPE`'s oracle names.
- **(i) Bulk.** 4,096 keys, one `many`, unknown: 4,096 marks, repairs capped at 8 in flight, every row marked until its own answer. A chain past `endingChain` (64) of successes: the store at the last settlement equals the end, before any paced turn runs. **N = 1,000 real answers, and no ending dropped.**
- **(j) Reality:** a real server that sends patches and no-version frames, not `server.ts`'s whole rows. `an-actor-disposed...` must then report the claim. Real kill: a lane removal and `store/unsettled` never part.
- **(k) Engine.** `I11` against TanStack DB's real source, the spike made a test, plus one Electric-shaped fixture.
- **(l) Types.** `.one(Ticket)` over a partial output fails to compile; a `pick` with no key field fails; `Schema.BigInt` key round-trips through a reload as a `bigint`.

**Mutants to write before the code:** field scope off; `from` taken at landing; `from` taken at a paced ask; floor ignored; `unknown` takes; open doubt cleared by a read; `unsettled` written in a later batch; a gap only at re-entry; a claim not moving the version field's window; a delta's `rest` honoured with no session; `$present` not carried by a partial.

## 13. What I am unsure of

1. **Rule 32 (my largest call, and it changes OD19).** With `landsWithin` a user who gives up and then re-saves sees `?` for up to ten minutes, for a request that almost never lands. I chose correctness, by your order of priority, and because it is bounded. **Ten minutes is a guess.** A shorter default trades truth for calm.
2. **`rest: unchanged` under cover.** It trusts a session's completeness. A feed that silently drops frames, with no gap, leaves behind fields unmarked. Rule 72's "proof" has the same exposure, so it is not new, but this leans on it harder. And `covers`' scope per input is reused from answers without a run.
3. **`unconfirmed` refreshes live answers.** It is bounded in my reasoning; the model does not exercise answers at all. A write-heavy page with partial acks could refetch a list on every save. That is what most TanStack Query apps do on purpose, and it may still surprise someone. This is the first thing a real app should test.
4. **Doubts on `$present` from a dropped row.** Page shifts raise a by-key read when the record is held elsewhere. Reasoned, not modelled. If a table loses rows often, it could be chatty.
5. **Evidence evicting a tombstone.** Tombstones and stubs are only needed against evidence whose `from` predates them. I would drop one when no read that started before it is outstanding, and cap at 4,096 per entity for long sessions; an evicted one can let a very late frame resurrect a record. Nothing ran here.
6. **`Order: "arrival"` as an author's claim.** A wrong claim is silent wrongness, unlike the rest of the design. `flow check` cannot see it. The alternative, no such option, costs one read per conflict for every unversioned feed.
7. **L6, the lagging replica without versions.** Stated, not solved. `readsLagBy: "2 seconds"` would be one more knob, and I left it out.
8. **`sourced` and `Ticket.row(row, { pending })`.** A flag on evidence is the one place a prediction enters a cell, and I10 needs that exception. The engine's overlay is not Flow's, so I accept it. It is the least clean part.
9. **`landsWithin: "0 seconds"` on an engine write,** and whether `O.x.retry` should simply be refused there. TanStack's and Zero's retries are their own. I have not designed that refusal.
10. **Per-field clocks:** not in the model. The judge does not change; `seen` becomes unused [reasoning].
11. **Wall clock:** `landsWithin` across a reload reads `Date.now`. A clock moved forward closes a window early.
12. **The spike is a model behind a real collection,** not Flow's runtime. M6's Durability answer is a claim about how Replicache behaves on reload, read, not run.
13. **Field functions and `unconfirmed`:** a retry's claim replays over a base that may already include the write, so a count can be off by one, marked. Fine for a badge, and exactly why a counter should use a response.
14. **`.gone(tag)`** could be a store-level rule on `byKey` instead of a keyword. I kept it because a 404 is not always "no such record".
15. **None of this code has been compiled.** The public examples target an API that does not exist yet, so the type claims (`pick`, `.one`, `patch` requiring `revision`) are design, not checked. A type spike is the next cheap test.
16. **The stamp split** (section 9) was measured for memory, not for time per evidence on a hot feed. The judge is per field, so a 40-field record costs 40 comparisons per frame.
