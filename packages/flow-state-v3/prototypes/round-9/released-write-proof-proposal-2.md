# Released writes: what ends the doubt (revision 2)

Status: **proposed**. Nothing here is decided, built or edited elsewhere. This is convergence step 8: one revision of
[released-write-proof-proposal.md](released-write-proof-proposal.md) (proposal 1, kept as prior art), made from every
finding of its adversarial review together. It **amends an accepted answer**, ENTITIES-QUESTIONS Q1 A (`guarded: true`),
and changes what U10 shows in one case (section 4.4), so both need the user's yes.

Keyword marks in code: **NEW**, **existing**, **user-defined**. "The store" is the Runtime's entity store.

## 0. Verdict first

- **The hard constraint stands, and it decides the wider question.** Flow touches data only. It never builds, sends,
  holds or retries a request. So the server's rules (a precondition, a dedupe key, which rows an update matched) can't be
  made visible to the runtime. Making them visible means owning the request. **Abandoning runtime visibility is right**,
  and the review agreed.
- **The released write still gets an honest exit.** The contract *declares* what the server enforces. Answers Flow already
  decodes *prove* it, record by record. One rule (section 3) says which answers count. Everything proposal 1 got wrong came
  from proving more than the declared fence covers: other records, a refusal, a cover the write can move, and a
  contradiction check that claimed too much. The revision proves exactly what the fence covers and nothing else.

## 1. The problem (unchanged from proposal 1, section 1)

A write's outcome is unknown, because the connection dropped. The person gives up on it with `cancel`, an ignored unknown
or any unretained unknown. The request may still land later, after a newer write (OD20 F1). The store marks the touched
fields: `uncertain` until one read, then `unconfirmed`, quiet (U10, Q7 A). The question is what data, and nothing else,
can end that mark. Today only the 4,096-per-entity cap (`UnsettledEvicted`) ends it.

## 2. Findings and root causes

The evidence is in proposal 1, section 2 (F1-F8, P1-P7). The review added nine findings (R1-R9, section 11). Grouped by
root cause, each written as what was assumed and is false:

- **RC1. "Flow can see what the server enforces"** (proposal 1). It can't without owning the request. The only option is
  to declare the rule and prove its state from data.
- **RC2. "A proof is a fact about the old request."** It is a fact about the server's present state. The declared rule
  turns that fact into "that request cannot apply".
- **RC6 (new). "A fence covers the whole request."** A precondition fences only the records whose base the server checks.
  `moveTicket` checks the ticket's revision, not the two queues' counts. An `.alsoChanges` record is never fenced (R1).
- **RC7 (new). "Hearing a change is the same everywhere a session covers."** A cover is a predicate over fields. A write
  that changes those fields can carry its record out of the cover. Its landing is then unheard (R2).
- **RC8 (new). "A refusal means the version moved."** On PostgREST, zero rows also means row-level security hides the row,
  perhaps only for a while. A refusal shows the state at one moment and fences nothing (R3).
- **RC9 (new). "A check that can fire is a check that verifies."** `PreconditionContradicted` fires only on a send whose
  base Flow already knows is stale. It misses a commit that ignores a fresh base, and it fired falsely on a replayed
  business-key success (R4).

RC6-RC9 are one class: **proof was taken from data the declared fence doesn't cover.** The revision fixes the class with
one rule (section 3), not four patches. The rest are corrections: R5 (preconditions on the claim), R6 (a warning that
said too much), R7 (a probe to name), R8 (wrong examples), R9 (missing tests).

## 3. Requirements, together

1. Correct under every source shape: version-checked, last-writer-wins, keyed by Attempt, keyed by business key, engines,
   and sources that can't say. Where a shape can't prove an exit, the mark stays.
2. Data only (the hard constraint).
3. No clock decides. The count cap is the one named guess.
4. Locality: a claim about the request sits on the contract, next to `commit` and `idempotency`.
5. Typed against the mapping: the precondition names its refusal tag, so a refusal maps to a definite failure.
6. **Proof per record, from data the fence covers** (RC6-RC8).
7. A check that can fail, stated for exactly what it catches (RC9).
8. One rule. `Compiled` holds the claims, `flow check` checks their shape, and `flow explain` prints each write's exits
   and trusts.
9. Machines, lanes, `retry` and `cancel` are untouched.
10. Holds together with the narrowed rebase (Q5 A), bulk `many`, restore, rule 18 and proposal 2's conflicts.

## 4. The design

### 4.1 The one rule

> **A given-up write's doubt on a record means: the server may still change it without the store hearing. It ends only on
> an answer showing the request can no longer apply to that record, under what the contract declares the server enforces:
> a version past the base the server fences on, for a record whose base it fences; or a success under the same dedupe key.
> A record the fence does not cover ends with a fenced one only if the contract states the request applies all or nothing.
> While a live session that covers the record, through fields the write does not change, would hear it apply, the doubt is
> hidden, not ended. No clock, no refusal and no claim alone ends it. Past the cap it is evicted, with evidence.**

### 4.2 What the contract declares, and what proves it

| Declared | The fence covers | Proof (data) | Ends the doubt on |
| --- | --- | --- | --- |
| `precondition: { failure: Tag }` (**NEW**) | the write's **target** records: the `.one` record, or each `many` key, whose base Flow hands the commit as `basedOn` | an answer carrying that record's version v > the base it was **sent** with (a read, a feed frame, any write's success). Equality proves nothing | that target record only |
| `precondition: { failure: Tag, allOrNothing: true }` (**NEW**: `allOrNothing`) | as above, and the author states the request applies all or nothing | as above | every record the Attempt touched: other predicted records, `.alsoChanges` records and other `many` keys |
| `idempotency: "attempt"` (existing, C129) | the whole request, by key | a success of a re-send of the same Attempt (rule 32 today) | every record the Attempt touched |
| `idempotency: ["orderId"]` (existing, C129) | the whole request, by business key | a success of any later Attempt of the same contract with the same key values | every record the Attempt touched |
| `.covers(...)` on a `listen` (existing, Q3 A) | nothing is fenced: the change would be **heard** | a live, covering session with no open gap, whose cover reads no field the Attempt touched | hides the doubt on that record while it lasts; ends nothing |
| `sourced: true` entity (existing) | the engine's own | the engine's next statement about the key | that record |
| nothing | nothing | nothing | the cap: `UnsettledEvicted` |

**Why a version past the base proves it, for a fenced record.** The request applies only if `version = b`. Versions grow
and never repeat, and the bump happens in the write's own transaction. A seen v > b is durable server state. So once any
answer shows v > b, the condition is false for good. The trust rows are in section 4.5. A non-target record's version
proves nothing, because the server never checked that record's base (RC6).

**Why `allOrNothing` is a separate claim.** If the request applies in one transaction and can no longer apply to its
target, it can't apply to anything else either. That is a fact about the server's handler, which Flow can't see. So the
author states it, and it becomes a trust row. Without it, the queues in `moveTicket` keep their doubt until the cap.

**Why a same-key success proves the whole request.** The server has recorded the key. A late copy is replayed or refused
as a whole. A key-mismatch refusal (the draft's 422, Stripe's error) is not taken as proof.

**What a refusal does now (R3).** The precondition's tag maps the refusal to a **definite failure**, which is why it is
typed. It ends nothing in the store. After an unknown send, rule 18 makes a refused retry `StillUnknown`. That ending
forces the repair (rule 30), and the repair's read proves by version > base whenever the row is visible. When row-level
security hides the row, nothing is proven and the cap applies. Dropping the refusal costs at most one read, which the
unknown already forces.

**After a proof.** The record's Open doubt becomes proposal 2's conflict. It is closed per field by the answer that proved
it, or by one read.

### 4.3 `precondition` is the server's, not Flow's

The **doc comment** on `precondition` must say this first:

> `precondition` states a check **the server enforces** on this commit's request: it applies only while the target's
> version equals `basedOn`. Flow does not and cannot check it, unlike `guard:`, which Flow evaluates in the turn. It
> changes what the store may conclude after a write is given up. When to use: your commit sends `basedOn` as a version
> condition, such as PostgREST `.eq("revision", basedOn)`, `If-Match` with a revision ETag, or a compare-and-swap.
> Gotchas: not a timestamp, not a client-side transaction, not a read-then-write in your server, not a content-hash
> ETag (section 4.5).

### 4.4 The `.covers` mask, narrowed (R2) and marked for the user's yes

A cover is a predicate over the record's fields, such as `eq(record.boardId, input.boardId)`. Its fields are known
statically, because `.covers` is built from the query expressions (`eq` and the rest), not a closure. An Attempt's touched
fields are known as follows:

- at the lower bound, statically: the `.one` pick, `.alsoChanges` and the version (`Touch.fields` in `Compiled`);
- exactly, at runtime: the durable row's `fields`, recorded when `.predicts` ran.

**The mask applies only when the row's touched fields and the cover's fields don't overlap.** A write that changes
`boardId` can carry the note off the board, and the board's feed would then not hear it land (RC7). `flow explain` prints,
for each write and each cover on its entity, whether the mask can apply. It works from the static lower bound, which a
runtime overlap can only narrow further.

**This changes what U10 shows, with no proof.** A given-up mark under a live, non-overlapping cover reads
`unconfirmed: []`, although nothing proves the request can't land. The value shown is the feed's: if the request lands, a
frame shows it. When the session ends or gaps, the durable row's mark shows again. **This is for the user's yes**
(question 3). Without the mask, last-writer-wins plus realtime sits at `unconfirmed` until the cap.

### 4.5 Preconditions on the claim: checks and trust rows (R5)

**`flow check` errors:**

| Error | When |
| --- | --- |
| `PreconditionWithoutVersion` | the bound entity has no `version`, or its version is not per record (`version: { field, per: "collection" }`); only the string form or `per: "record"` passes |
| `PreconditionWithoutTarget` | the write has no `.one` or `many` target, so no record's base is fenced |
| `PreconditionUnbound` | the contract is not bound as a domain write (a plain transaction has no `basedOn`) |
| `PreconditionOnSourced` | the entity is sourced: the engine owns order |
| type error | `failure`'s tag is not a tag of the commit's error channel |

**Trust rows** (`flow explain` prints them per write; they replace proposal 1's precondition rows and `guarded`'s row):

| Claim | Who | If false |
| --- | --- | --- |
| the server applies the commit only while the target's version equals `basedOn` | author, server | a doubt ends and the request lands. Partly caught by `PreconditionContradicted` (section 4.6) |
| the server bumps the version in the same transaction as the write it guards | server | a write can apply without moving the version, and the version proves nothing |
| the version never repeats, across re-creations too | server | ABA: an old request matches again |
| a seen version is durable: committed, and not lost by a failover | server | a proof from a version the server later loses |
| `allOrNothing`: the request applies in one transaction | author, server | a non-target record's doubt ends while part of the request can still land |
| a business key is deduped for longer than any request can be in flight | server | a late first request applies after the key was pruned (Stripe prunes at 24 h) |
| a covering session is complete while live | server | a landing goes unheard under the mask |

**Not preconditions** (docs, beside the doc comment):

- **Timestamps** (`.eq("updated_at", basedOn)`) can tie within their precision and can go back with clock skew, so they
  can repeat.
- **Client-side transactions** (Firestore `runTransaction`, an SDK that retries the function with fresh reads) re-read the
  base on each retry, so the base Flow sent is not the base checked.
- **A read-then-write in the app's own server**, with no lock or conditional write, races.
- **A content-hash ETag** (RFC 9110 §8.8.1 allows one, `rfc9110.txt:3417-3430`) repeats when the content returns, A→B→A.
  A revision ETag (`"r12"`) or a revision field in the body is a precondition.

### 4.6 `PreconditionContradicted`: what it catches, exactly (R4)

The check is store behaviour, recorded as **NEW** evidence. It fires when all of these hold:

- a precondition contract's **first** send (a re-send may replay a stored success);
- the contract declares **no business-key `idempotency`** (a new Attempt with the same business key may replay a stored
  success over a stale base);
- the send carried base b for target r, and before it began the store held a version for r from an answer, **known > b**;
- the send ends in success for r.

The effect:

- evidence `PreconditionContradicted { contract, attempt, record, basedOn, known }`;
- the precondition is void for the Runtime, so its marks fall back to the cap;
- marks it already ended stay ended;
- **the void is memory only:** a reload trusts the claim again until the next contradiction.

**What it catches, plainly.** It fires only on a **stale-base send**. Those are rare but real:

- a draft overtaken by another actor, sent stale under Q5's narrowed rebase;
- a send after a read or frame showed a newer version than the one the write was minted over.

On such a send it catches a commit that ignores `basedOn`, a filter on the wrong column, and a server that ignores the
condition. It can't see any of those on the usual send, whose base is fresh. **It is a tripwire, not a verification.** The
check that verifies is the probe in section 7, owed.

## 5. Before and after, across five very different sources

The trait, the view and the machines don't change between before and after.

```ts
// title-editor.trait.ts. Unchanged in examples 1 and 2, before and after
export const TitleEditor = trait(                                             // existing: trait; user-defined: TitleEditor
  {
    id: "TitleEditor",                                                         // existing: id
    events: { Save: { title: Schema.String } },                                // existing: events; user-defined: Save
    internalEvents: { Saved: {}, Refused: {}, Unsure: Flow.uncertain({}) },   // existing: internalEvents, Flow.uncertain
    memory: { id: Flow.input(Schema.String) },                                 // existing: memory, Flow.input
    operations: ({ E }) => ({                                                  // existing: operations, outcomes
      save: TicketsDomain.saveTitle.outcomes({
        success: E.Saved,                                                      // existing: success
        failure: { TicketChanged: E.Refused, Refused: E.Refused, NotSent: E.Refused },   // existing: failure, NotSent; user-defined: the tags
        unknown: E.Unsure,                                                     // existing: unknown
      }),
    }),
  },
  ({ O }) => {
    const own = ({ memory }: { memory: { id: string } }) => ({ id: memory.id })   // user-defined
    return {
      on: {                                                                    // existing: on, target, actions, guard
        Save: { target: "self", actions: [O.save.commit(({ memory, event }) => ({ id: memory.id, title: event.title }))] },   // existing: commit
        Saved: { target: "self" },
        Refused: { target: "self" },
        Unsure: [
          { target: "self", guard: [O.save.retryable(own, { times: 3 })], actions: [O.save.retry(own)] },   // existing: retryable, retry
          { target: "self", actions: [O.save.cancel(own)] },                   // existing: cancel. The give-up
        ],
      },
    }
  },
)
```

```tsx
// TicketTitle.tsx. Unchanged everywhere
const t = useView(desk, (s) => Ticket.get(s, { id }, Ticket.pick("title")))   // existing: useView, get, pick
<h1 className={t.predicted ? "grey" : ""}>{t.data?.title}{t.uncertain ? " ?" : ""}{t.unconfirmed.length ? " ·" : ""}</h1>   // existing: the marks
```

### Example 1. supabase-js PostgREST, a `revision` column, no key, and a two-record write

The data comes from `sb.from("tickets").update(...).eq("revision", basedOn).select(...)`, which resolves to
`{ data, error, status }`. A conflict is `200` with `data: []`, and a lost connection is `status: 0`. The move is a
Postgres function, `move_ticket`, called over RPC. It updates the ticket under its revision and both queues' `open_count`
in one SQL transaction.

```ts
// tickets.api.ts. user-defined: everything here. The same before and after
export const TitleSaved = Schema.Struct({ title: Schema.String, revision: Schema.Number })
export const Moved = Schema.Struct({ queueId: Schema.String, revision: Schema.Number })
export class TicketApi extends Context.Service<TicketApi, {
  readonly saveTitle: (i: { id: string; title: string }, basedOn: number) => Effect.Effect<PostgrestResponse<unknown[]>>
  readonly move: (i: { id: string; from: string; to: string }, basedOn: number) => Effect.Effect<PostgrestResponse<unknown[]>>
}>()("app/TicketApi") {
  static readonly layer = Layer.effect(TicketApi, Effect.map(Supabase, (sb) => ({
    saveTitle: (i, basedOn) => Effect.promise((signal) =>
      sb.from("tickets").update({ title: i.title })
        .eq("id", i.id).eq("revision", basedOn)              // the precondition, in the app's own query. Flow never sees this line
        .select("title, revision").abortSignal(signal)),
    move: (i, basedOn) => Effect.promise((signal) =>
      sb.rpc("move_ticket", { p_id: i.id, p_to: i.to, p_revision: basedOn })   // checks the ticket's revision; bumps both queues in the same transaction
        .select("queue_id, revision").abortSignal(signal)),
  })))
}
const unknownOrRefused = (res: PostgrestResponse<unknown>) =>
  res.status === 0 || res.status >= 500 ? Outcome.unknown({ _tag: "NoResponse" as const }) : Effect.fail({ _tag: "Refused" as const })   // existing: Outcome.unknown
const landed = <A, I>(s: Schema.Codec<A, I>, row: unknown) =>
  Schema.decodeUnknownEffect(s)(row).pipe(Effect.mapError(() => new OutcomeUnknown({ reason: { _tag: "Undecodable" as const } })))   // existing: OutcomeUnknown
export const answerOf = <A, I>(s: Schema.Codec<A, I>) => (res: PostgrestResponse<unknown[]>) =>
  res.error !== null ? unknownOrRefused(res)
    : res.data === null || res.data.length === 0 ? Effect.fail({ _tag: "TicketChanged" as const })   // zero rows: applied nothing, for whatever reason
    : landed(s, res.data[0])
```

```ts
// tickets.domain.ts. The same before and after
export const Ticket = entity({                                // existing: entity
  id: "Desk/Ticket", fields: TicketRow.fields, primaryKey: ["id"],   // existing: id, fields, primaryKey; user-defined: TicketRow
  version: "revision",                                        // existing: version. Per record, a counter that never repeats
})
export const Queue = entity({ id: "Desk/Queue", fields: QueueRow.fields, primaryKey: ["id"], version: "revision" })   // user-defined: QueueRow
export const TicketsDomain = domain("tickets", {              // existing: domain
  ticketById: read(ticketById).one(Ticket).byKey(({ input }) => ({ id: input.id })).gone("TicketNotFound"),   // existing (gone: Q2 A)
  saveTitle: write(saveTitle).one(Ticket.pick("title", "revision"))   // existing: write, one, pick. The target: the fenced record
    .predicts(({ input }) => Ticket.patch({ id: input.id }, { title: input.title })),   // existing: predicts, patch
  moveTicket: write(moveTicket).one(Ticket.pick("queueId", "revision"))
    .predicts(({ input }) => Ticket.patch({ id: input.id }, { queueId: input.to }))
    .alsoChanges(({ input }) => [                             // existing: alsoChanges. Touched, never fenced
      Queue.fields({ id: input.from }, ({ record }) => [record.openCount]),
      Queue.fields({ id: input.to }, ({ record }) => [record.openCount]),
    ]),
})
```

```ts
// tickets.contracts.ts. BEFORE (Q1 A)
export const saveTitle = transaction({                        // existing: transaction
  id: "Desk/save-title", input: { id: Schema.String, title: Schema.String }, output: TitleSaved,   // existing: id, input, output
  key: ["id"], concurrency: "latest",                         // existing: key, concurrency
  guarded: true,                                              // Q1 A's word: an untyped claim
  commit: (i, { basedOn }) => TicketApi.use((api) => api.saveTitle(i, basedOn)).pipe(Effect.flatMap(answerOf(TitleSaved))),   // existing: commit, basedOn
})
export const moveTicket = transaction({
  id: "Desk/move-ticket", input: { id: Schema.String, from: Schema.String, to: Schema.String }, output: Moved,
  key: ["id"], concurrency: "latest",
  guarded: true,                                              // said nothing about the queues
  commit: (i, { basedOn }) => TicketApi.use((api) => api.move(i, basedOn)).pipe(Effect.flatMap(answerOf(Moved))),
})

// tickets.contracts.ts. AFTER
export const saveTitle = transaction({
  id: "Desk/save-title", input: { id: Schema.String, title: Schema.String }, output: TitleSaved,
  key: ["id"], concurrency: "latest",
  precondition: { failure: "TicketChanged" },                 // NEW: precondition, failure. The server applies this only while the ticket's
                                                              //   version equals basedOn; its refusal is this definite failure. Enforced by the
                                                              //   server, never by Flow (unlike guard:). Type error unless the tag is in the error channel
  commit: (i, { basedOn }) => TicketApi.use((api) => api.saveTitle(i, basedOn)).pipe(Effect.flatMap(answerOf(TitleSaved))),
})
export const moveTicket = transaction({
  id: "Desk/move-ticket", input: { id: Schema.String, from: Schema.String, to: Schema.String }, output: Moved,
  key: ["id"], concurrency: "latest",
  precondition: { failure: "TicketChanged", allOrNothing: true },   // NEW: allOrNothing. move_ticket is one SQL transaction, so the queues end with the ticket
  commit: (i, { basedOn }) => TicketApi.use((api) => api.move(i, basedOn)).pipe(Effect.flatMap(answerOf(Moved))),
})
// DROPPED: guarded
```

Save B over revision 3, lost and given up:

```ts
// B never landed; they save C:      C's answer carries revision 4 > 3    → proof   { data: { title: "C" }, uncertain: false, unconfirmed: [] }
// B had landed; the give-up's read: the read carries revision 4 > 3      → proof   { data: { title: "B" }, uncertain: false, unconfirmed: [] }
// they retried first, got []:       TicketChanged → StillUnknown (rule 18) → forced repair; its read shows revision 4 → proof
// the row is hidden by RLS:         the repair finds nothing             → no proof; the cap. A refusal is never taken as proof
// B never landed, nobody writes:    revision stays 3                      → no proof { data: { title: "A" }, uncertain: false, unconfirmed: ["title"] }, until the cap. Honest
```

Move ticket t1 from q1 to q2 over revision 3, lost and given up. Then a read shows t1 at revision 4:

```ts
// with allOrNothing:     t1 proven; q1.openCount, q2.openCount end with it      → each a conflict, closed by a read
// without allOrNothing:  t1 proven; q1.openCount, q2.openCount keep `unconfirmed` until the cap   // q's own revision moving proves nothing
```

```text
$ flow explain Desk/move-ticket
given-up doubt ends on:  Ticket (target): a version past the sent basedOn
                         Queue (alsoChanges): with the target (allOrNothing, trusted)
trusts:                  server enforces the precondition; bumps the version in the write's transaction; version never repeats;
                         a seen version is durable; applies all or nothing
re-send:                 fenced (precondition)
```

### Example 2. A REST API with `If-Match` (a revision ETag), 412 and `Idempotency-Key`, through Effect's HttpClient

The data comes from `PATCH /tickets/:id` with `If-Match: "r3"` and `Idempotency-Key: <attempt>`. The answers are:

- `200` with `{ title, revision }`;
- `412` on a stale base;
- `400` or `422` when the server rejects the title: a definite refusal, since the server answered;
- `5xx`, or a `TransportError` when no answer came: unknown.

```ts
// tickets.api.ts. user-defined: everything here. The same before and after
export class TicketApi extends Context.Service<TicketApi, {
  readonly saveTitle: (i: { id: string; title: string }, o: { key: string; basedOn: number }) => Effect.Effect<
    typeof TitleSaved.Type,
    { readonly _tag: "TicketChanged" } | { readonly _tag: "Refused" } | OutcomeUnknown<{ readonly _tag: "NoResponse" } | { readonly _tag: "Undecodable" }>
  >
}>()("app/TicketApi") {
  static readonly layer = Layer.effect(TicketApi, Effect.map(HttpClient.HttpClient, (client) => ({
    saveTitle: (i, o) =>
      HttpClientRequest.patch(`/tickets/${i.id}`).pipe(
        HttpClientRequest.setHeaders({ "If-Match": `"r${o.basedOn}"`, "Idempotency-Key": o.key }),   // a revision ETag, never a content hash
        HttpClientRequest.bodyJsonUnsafe({ title: i.title }),
        client.execute,
        Effect.flatMap(HttpClientResponse.matchStatus({
          412: () => Effect.fail({ _tag: "TicketChanged" as const }),             // the precondition's refusal
          "2xx": (r) => HttpClientResponse.schemaBodyJson(TitleSaved)(r).pipe(
            Effect.mapError(() => new OutcomeUnknown({ reason: { _tag: "Undecodable" as const } }))),   // it landed; what it did is unread
          "4xx": () => Effect.fail({ _tag: "Refused" as const }),                 // 400, 422, 409 and the rest: the server answered no
          orElse: () => Outcome.unknown({ _tag: "NoResponse" as const }),         // 5xx and anything else
        })),
        Effect.catchTag("HttpClientError", () => Outcome.unknown({ _tag: "NoResponse" as const })),   // TransportError: no answer
      ),
  })))
}
```

```ts
// tickets.contracts.ts. BEFORE (Q1 A)
export const saveTitle = transaction({
  id: "Desk/save-title", input: { id: Schema.String, title: Schema.String }, output: TitleSaved, key: ["id"], concurrency: "latest",   // existing
  guarded: true,
  commit: (i, { attempt, basedOn }) => TicketApi.use((api) => api.saveTitle(i, { key: attempt.id, basedOn })),   // existing: attempt
})

// tickets.contracts.ts. AFTER
export const saveTitle = transaction({
  id: "Desk/save-title", input: { id: Schema.String, title: Schema.String }, output: TitleSaved, key: ["id"], concurrency: "latest",
  idempotency: "attempt",                                     // existing (C129, rule 19): the server dedupes on attempt.id
  precondition: { failure: "TicketChanged" },                 // NEW: the 412, mapped
  commit: (i, { attempt, basedOn }) => TicketApi.use((api) => api.saveTitle(i, { key: attempt.id, basedOn })),
})
```

The domain is example 1's `saveTitle` part. The traces are example 1's, with one more:

```ts
// lost, retried while Held, the server replays the stored 200: the same Attempt's re-send succeeded → its doubt ends (same key; rule 32)
//   no PreconditionContradicted: only a first send is checked
```

### Example 3. Payments with a business key and no version (Stripe behind the app's server)

The data comes from `POST /orders/:orderId/pay`. The app's server calls Stripe with `idempotencyKey: orderId` and answers
`{ status: "paid", chargeId }`. There is no version, so no precondition can be declared. The person may press Pay again
after a reload lost the hold (OD33).

```ts
// orders.contracts.ts. BEFORE
export const pay = transaction({                              // existing: transaction
  id: "Shop/pay", input: { orderId: Schema.String, amountCents: Schema.Number },
  output: Schema.Struct({ status: Schema.Literal("paid"), chargeId: Schema.String }),
  key: ["orderId"], concurrency: "reject",
  commit: (i) => OrdersApi.use((api) => api.pay(i)),          // user-defined: OrdersApi; puts orderId on the wire as Stripe's key
})
// a lost, given-up pay: Order.status stays `unconfirmed` until the cap, even after a second press succeeds

// orders.contracts.ts. AFTER
export const pay = transaction({
  id: "Shop/pay", input: { orderId: Schema.String, amountCents: Schema.Number },
  output: Schema.Struct({ status: Schema.Literal("paid"), chargeId: Schema.String }),
  key: ["orderId"], concurrency: "reject",
  idempotency: ["orderId"],                                   // existing (C129, OD33): the server dedupes on orderId. No new word
  commit: (i) => OrdersApi.use((api) => api.pay(i)),
})
```

```ts
// orders.domain.ts. The same before and after
export const Order = entity({ id: "Shop/Order", fields: OrderRow.fields, primaryKey: ["orderId"] })   // existing: entity; user-defined: OrderRow. No version
export const OrdersDomain = domain("orders", {
  pay: write(pay).one(Order.pick("status")).predicts(({ input }) => Order.patch({ orderId: input.orderId }, { status: "paying" })),   // existing
})
// checkout.machine.ts. The same before and after
export const Checkout = definition({                          // existing: definition
  id: "Shop/Checkout", states: ["READY", "PAID"], events: { Pay: {} },
  internalEvents: { Paid: {}, Declined: {}, Unsure: Flow.uncertain({}) },
  memory: { orderId: Flow.input(Schema.String), amountCents: Flow.input(Schema.Number) },
  operations: ({ E }) => ({ pay: OrdersDomain.pay.outcomes({ success: E.Paid, failure: { Declined: E.Declined, NotSent: E.Declined }, unknown: E.Unsure }) }),
})
export const CheckoutMachine = machine(Checkout, ({ S, O }) => {   // existing: machine
  const own = ({ memory }: { memory: { orderId: string } }) => ({ orderId: memory.orderId })
  return {
    default: S.READY,
    states: {
      READY: {
        on: {
          Pay: { actions: [O.pay.commit(({ memory }) => ({ orderId: memory.orderId, amountCents: memory.amountCents }))] },
          Paid: S.PAID,
          Declined: {},
          Unsure: [
            { guard: [O.pay.retryable(own, { times: 3 })], actions: [O.pay.retry(own)] },
            { actions: [O.pay.cancel(own)] },                 // gives up; a later Pay is a new Attempt with the same orderId
          ],
        },
      },
      PAID: {},
    },
  }
})
```

```ts
// pay lost, given up, Pay pressed again, success: same orderId → proof → the first pay's doubt ends. Stripe replayed or applied once
//   if that success was Stripe replaying the first's stored answer: still proof, and never PreconditionContradicted (business key, section 4.6)
// pay lost, given up, never pressed again: no proof → `unconfirmed` until the cap. Honest: the first request may still charge
```

### Example 4. Last-writer-wins PostgREST with no version, with and without Supabase realtime

The data comes from the `notes` table, which has no version column: `update({ body }).eq("id", id)`. Zero rows means the
row is missing or hidden. Either way nothing applied, a definite failure. Supabase realtime's `postgres_changes` on
`notes` is the app's own channel.

```ts
// notes.api.ts. user-defined: everything here. The same before and after
export const BodySaved = Schema.Struct({ body: Schema.String })
export class NotesApi extends Context.Service<NotesApi, {
  readonly saveBody: (i: { id: string; body: string }) => Effect.Effect<PostgrestResponse<unknown[]>>
  readonly move: (i: { id: string; boardId: string }) => Effect.Effect<PostgrestResponse<unknown[]>>
}>()("app/NotesApi") {
  static readonly layer = Layer.effect(NotesApi, Effect.map(Supabase, (sb) => ({
    saveBody: (i) => Effect.promise((signal) => sb.from("notes").update({ body: i.body }).eq("id", i.id).select("body").abortSignal(signal)),
    move: (i) => Effect.promise((signal) => sb.from("notes").update({ board_id: i.boardId }).eq("id", i.id).select("board_id").abortSignal(signal)),
  })))
}
export const noteAnswer = <A, I>(s: Schema.Codec<A, I>) => (res: PostgrestResponse<unknown[]>) =>
  res.error !== null
    ? res.status === 0 || res.status >= 500 ? Outcome.unknown({ _tag: "NoResponse" as const }) : Effect.fail({ _tag: "Refused" as const })
    : res.data === null || res.data.length === 0 ? Effect.fail({ _tag: "NoteGone" as const })   // missing or hidden: nothing applied
    : Schema.decodeUnknownEffect(s)(res.data[0]).pipe(Effect.mapError(() => new OutcomeUnknown({ reason: { _tag: "Undecodable" as const } })))
```

```ts
// notes.contracts.ts. The same before and after: no version, no key, so neither claim can be declared
export const saveBody = transaction({
  id: "Board/save-body", input: { id: Schema.String, body: Schema.String }, output: BodySaved, key: ["id"], concurrency: "latest",   // existing
  commit: (i) => NotesApi.use((api) => api.saveBody(i)).pipe(Effect.flatMap(noteAnswer(BodySaved))),
})
export const moveNote = transaction({
  id: "Board/move-note", input: { id: Schema.String, boardId: Schema.String }, output: Schema.Struct({ board_id: Schema.String }),
  key: ["id"], concurrency: "latest",
  commit: (i) => NotesApi.use((api) => api.move(i)).pipe(Effect.flatMap(noteAnswer(Schema.Struct({ board_id: Schema.String })))),
})
// notes.domain.ts
export const Note = entity({ id: "Board/Note", fields: NoteRow.fields, primaryKey: ["id"] })   // existing: entity; user-defined: NoteRow. No version
export const NotesDomain = domain("notes", {
  saveBody: write(saveBody).one(Note.pick("body")).predicts(({ input }) => Note.patch({ id: input.id }, { body: input.body })),
  moveNote: write(moveNote).one(Note.pick("boardId")).predicts(({ input }) => Note.patch({ id: input.id }, { boardId: input.boardId })),
})
```

```ts
// feed.contracts.ts. user-defined body; the same before and after
export const noteChanges = stream({                           // existing: stream
  id: "Board/note-changes", input: { boardId: Schema.String }, output: NoteChange, key: ["boardId"], delivers: "every",   // existing
  subscribe: (i) => Stream.unwrap(Effect.map(Supabase, (sb) =>
    Feed.callback<NoteChange, never>((emit) => Effect.gen(function* () {     // existing: Feed.callback
      const ch = sb.channel(`notes:${i.boardId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "notes", filter: `board_id=eq.${i.boardId}` },
          (p) => emit(p.eventType === "DELETE" ? { _tag: "Removed", id: p.old.id } : { _tag: "Row", row: p.new }))
        .subscribe((status) => { if (status === "SUBSCRIBED") emit(Feed.live({ proof: "realtime subscribed" })) })   // existing: Feed.live
      yield* Effect.addFinalizer(() => Effect.promise(() => sb.removeChannel(ch)))
    })))),
})
// feed.domain.ts
export const NoteFeed = domain("note-feed", {
  changes: listen(noteChanges)                                // existing: listen
    .covers(({ input, record }) => eq(record.boardId, input.boardId))   // existing (Q3 A): the cover reads boardId
    .as([Note], (e) => (e._tag === "Removed" ? Note.delete({ id: e.id }) : Note.row(e.row))),   // existing (Q4 A)
})
```

```ts
// note-editor.trait.ts. The same before and after
export const NoteEditor = trait(
  {
    id: "NoteEditor",
    events: { Save: { body: Schema.String } },
    internalEvents: { Saved: {}, Refused: {}, Unsure: Flow.uncertain({}) },
    memory: { id: Flow.input(Schema.String) },
    operations: ({ E }) => ({
      save: NotesDomain.saveBody.outcomes({ success: E.Saved, failure: { NoteGone: E.Refused, Refused: E.Refused, NotSent: E.Refused }, unknown: E.Unsure }),
    }),
  },
  ({ O }) => {
    const own = ({ memory }: { memory: { id: string } }) => ({ id: memory.id })
    return {
      on: {
        Save: { target: "self", actions: [O.save.commit(({ memory, event }) => ({ id: memory.id, body: event.body }))] },
        Saved: { target: "self" },
        Refused: { target: "self" },
        Unsure: { target: "self", actions: [O.save.cancel(own)] },   // gives up at once: a body edit is cheap to redo
      },
    }
  },
)
```

```ts
// BEFORE, any feed: saveBody lost, given up, read:  { body: "A", unconfirmed: ["body"] } until the cap, feed or not
// AFTER, feed live:  saveBody (touches body; the cover reads boardId):  { body: "A", unconfirmed: [] }   masked (section 4.4, for the user's yes)
// AFTER, feed live:  moveNote (touches boardId, which the cover reads): { boardId: "b1", unconfirmed: ["boardId"] }   not masked: landing moves it out of the feed
// AFTER, the feed ends or gaps:                       the durable row's mark shows again; the cap still applies
// AFTER, no feed in the app:                          same as BEFORE
```

```text
$ flow explain Board/save-body
given-up doubt ends on:  nothing (no precondition, no idempotency): the cap
hidden while:            Board/note-changes is live (its cover reads boardId; this write touches body)
re-send:                 unfenced: a re-send may apply twice
$ flow explain Board/move-note
hidden while:            never: touches boardId, which Board/note-changes' cover reads
```

### Example 5. An engine: Zero, or TanStack DB over Electric (sourced)

No change and no new word (proposal 2, section 9). Zero never abandons a push and confirms by `lastMutationID`
(proposal 1, P1). TanStack DB's rollback can leave the request running (P2), but the sourced entity reads the engine's sync
stream, so a late landing arrives as a frame. `precondition` on a sourced write is `PreconditionOnSourced`.

## 6. What changed from proposal 1, and what it adds and drops compared with `guarded: true`

**From proposal 1:**

| Change | Why |
| --- | --- |
| proof is per record, from the target's version only; other touched records need `allOrNothing` (**NEW**) or keep the cap | R1, RC6 |
| the `.covers` mask applies only when the touched fields and the cover's fields don't overlap; the U10 change is marked for the user's yes | R2, RC7 |
| the refusal proof is gone; the typed tag stays, as a definite failure | R3, RC8 |
| `PreconditionContradicted` skips business-key contracts, tests `known > b`, is described as a tripwire on stale-base sends, and is void in memory only | R4, RC9 |
| `flow check` requires a per-record version and a target; four trust rows and a "not a precondition" list added | R5 |
| `ResendUnfenced` dropped; `flow explain` prints "re-send unfenced" | R6 |
| a data-only CI probe named as a future check (section 7) | R7 |
| examples 1, 2 and 4 corrected; a two-record write added | R8 |
| three tests added (section 9) | R9 |

**Compared with `guarded: true`:**

| | Item |
| --- | --- |
| **Added** | `precondition: { failure }`, typed against the commit's error channel, and a doc comment saying the server enforces it, unlike `guard:` |
| **Added** | `allOrNothing`, a stated trust for non-target records |
| **Added** | the proof from a same-key success, via the existing `idempotency` |
| **Added** | the narrowed `.covers` mask, via the existing word |
| **Added** | the `PreconditionContradicted` tripwire |
| **Added** | `flow check` errors: `PreconditionWithoutVersion`, `PreconditionWithoutTarget`, `PreconditionUnbound`, `PreconditionOnSourced` |
| **Added** | the base as actually sent, kept on the durable row (F7, F8) |
| **Kept** | a version past the base as proof, and equality proving nothing; no clock; the cap with `UnsettledEvicted` |
| **Dropped** | the word `guarded`; the `If-Match`/412-only wording; any proof from a refusal; any proof for records the fence doesn't cover |

## 7. The wider seam, and the probe owed (R7)

Proposal 1's section 7 table stands. **Every option that makes the server contract visible to the runtime crosses the
line:** an adapter that adds to the query, an adapter that holds the client, or a request description an adapter runs.
Data shims (a response Schema plus a mapper) cross no line, but they make nothing visible. **Recommendation: abandon
runtime visibility.**

**A possible future check, owed to `revisit.md`: the contract probe.** It is a CI command that runs **the app's own
`commit`** against **the app's own test layer** (a local Supabase, the app's staging service layer). It runs three
scripted cases and reads only the mapped outcomes:

| Case | Expected, if the claim holds |
| --- | --- |
| a first send with a base one behind the record's version | the precondition's `failure` tag (`precondition` true) |
| the same Attempt sent twice | the second answers the first's result, and the record changed once (`idempotency: "attempt"`) |
| two Attempts with the same business key | one effect on the record (`idempotency: fields`) |

It stays data-only. Flow builds no request and holds no client. It runs the app's Effect with the app's layer, and the
transport is the app's. It is **outside Stories**, because rule 62 makes a Story's world fakes, and a fake can't test
what a real server enforces. It is the only check that verifies the claims, rather than catching them on a stale send.
It is not proposed for v1.

## 8. Consequences for the rest of the system

- **Marks table** (entity-proposal-2.md:102). The `unconfirmed` row "Open, given up, read since" takes the exits in section
  4.2, per record. `MayStillLand` stays the name when there is none.
- **Held marks are unchanged** (OD19 word for word). A proof seen before the give-up is kept on the row and applied at the
  give-up.
- **Conflicts.** A proven record's Open doubt becomes proposal 2's conflict.
- **Rule 18.** A refused retry after an unknown stays `StillUnknown` for the lane. Its forced repair is the read that can
  prove.
- **The narrowed rebase (Q5 A).** The fence uses the base as sent. Overtaken drafts are the sends the tripwire sees.
- **Bulk `many`.** Each key is a target with its own base, and proof is per key. Other keys end with one only under
  `allOrNothing`.
- **Restore.** The row keeps the sent base per target and the business-key values. A void is not kept.
- **`Compiled`.** `precondition?: { failure: string; allOrNothing?: true }` sits next to `idempotency`. The cover's field
  set and `Touch.fields` are already there.
- **`flow explain`, per write:** what ends a given-up doubt, per touched entity; whether each cover can hide it, and why
  not; "re-send unfenced" or "fenced"; the trust rows.
- **Stories.** Proofs, masks and the tripwire run on the given answers. A fake that answers success over a stale base
  shows `PreconditionContradicted`, a standing lie. Real enforcement is the probe's job (section 7).
- **Machines, lanes, `retry`, `cancel`:** untouched. **Cost:** one comparison per answer per given-up row on that record,
  with rows bounded by the cap.

## 9. Proving it (owed, not run)

Each item is a test that can fail, with the mutant that must turn it red.

| Test | Mutant |
| --- | --- |
| `p1e.version-past-base-ends-given-up`: a read at revision 4 ends a base-3 doubt | equality proves |
| `p1e.two-record-fence`: `moveTicket` without `allOrNothing`, a read at t1 revision 4 ends t1 only, and q1, q2 keep the cap; with it, all three end | a non-target record's own version proves; or the target's proof spreads without `allOrNothing` |
| `p1e.refusal-proves-nothing`: a retry's `[]` with the row hidden ends nothing; the forced repair's read, once visible at revision 4, does | a refusal proves |
| `p1e.cover-moving-write-not-masked`: `moveNote` under a live board feed stays `unconfirmed`, and `saveBody` is masked | the mask ignores the overlap |
| `p1e.replayed-new-attempt-success`: under `idempotency: ["orderId"]`, a new Attempt's success that replays the first's stored answer over a stale base ends the first's doubt and raises no `PreconditionContradicted` | the tripwire ignores business keys |
| `p1e.contradiction-on-stale-send`: an overtaken draft's first send succeeds with known > b, so the evidence fires and the claim is void until reload | it tests `≠`; or a re-send's replay fires it; or the void survives a restore |
| `p1e.restore-keeps-sent-base`: after a reload, a version past the restored base ends the doubt | the base is not kept on the row |
| standing: OD20 F1's counterexample, `proofAtEqual`, `rule32Clears`, `landAfterWindow` | as in proposal 2 |

## 10. Questions for the user, each with my recommendation

1. **The word.** A: `precondition: { failure: "TicketChanged" }`. B: keep `guarded: true` (Q1 A as accepted).
   **Recommend A.** It is typed, names the refusal, uses RFC 9110's term, and its doc comment says the server enforces
   it, unlike `guard:`.
2. **`allOrNothing`.** A: add it, so a stated one-transaction request ends non-target records with the target. B: no word;
   non-target records keep the cap. **Recommend A.** Multi-record writes such as a move or a cart line with totals are
   common, and the one-transaction RPC is the usual shape. It is a trust row, printed by `flow explain`.
3. **The narrowed `.covers` mask** shows `unconfirmed: []` with no proof while a non-overlapping cover is live. A: accept
   that change to U10. B: no mask; only proofs end or quiet a doubt. **Recommend A.** It is honest, because a landing
   would be heard. Without it, last-writer-wins plus realtime sits at `unconfirmed` until the cap.
4. **Held marks.** A: unchanged; a proof is kept and applied at the give-up. B: a proof turns a Held mark into a conflict
   at once. **Recommend A** (OD19 stands).
5. **Runtime visibility.** **Recommend abandoning it** (section 7).
6. **The contract probe.** A: owe it to `revisit.md`, not v1. B: build it now. **Recommend A.** It is the only real
   verification, but it is tooling around the app's test layer, not the runtime.

## 11. Each review finding, and where it is answered

| Finding | What it said | Answered in |
| --- | --- | --- |
| R1 | multi-record writes: proof only from a fenced record; others under an all-or-nothing trust, or the cap | 2 (RC6), 4.1, 4.2, example 1 (`moveTicket`), 6, 9 (`two-record-fence`), 10 Q2 |
| R2 | the `.covers` mask only when touched fields don't overlap the cover's fields; it changes U10 | 2 (RC7), 4.1, 4.4, example 4, 9 (`cover-moving-write-not-masked`), 10 Q3 |
| R3 | drop the refusal proof; keep the typed tag | 2 (RC8), 4.2 ("What a refusal does now"), example 1 traces, 9 (`refusal-proves-nothing`) |
| R4 | the tripwire skips business keys, tests `known > b`, claims less, and is lost on restore | 2 (RC9), 4.6, example 3 traces, 8 (Restore), 9 (`replayed-new-attempt-success`, `contradiction-on-stale-send`) |
| R5 | per-record version required; trust rows; things that are not preconditions | 4.3, 4.5 |
| R6 | drop `ResendUnfenced`; explain may print "re-send unfenced" | 4.5 (no warning), examples 1 and 4 (`flow explain`), 8 |
| R7 | name the data-only CI probe, owed, outside Stories | 7, 10 Q6 |
| R8 | fix example 2 (4xx definite), example 4 (no version words), example 1 ("for good") | examples 1, 2, 4 |
| R9 | tests: two-record fence, cover-moving write, replayed new-Attempt success | 9 |
| doc-comment note | `precondition` is enforced by the server, unlike `guard:` | 4.3, example 1 (AFTER comment), 10 Q1 |
