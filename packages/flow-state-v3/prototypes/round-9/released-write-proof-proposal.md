# Released writes: what ends the doubt, and what Flow can see of the server

Status: **proposed**. Nothing here is decided, built or edited elsewhere. It is a convergence pass (`policy-convergence`) on
one problem, widened at the user's direction to the seam under it. It **amends an accepted answer**,
ENTITIES-QUESTIONS Q1 A (`guarded: true`), so it needs the user's yes before anything changes. Prior art kept as written:
`entity-proposal-2.md` section 5, ENTITIES-QUESTIONS Q1 and Q5, machine-design OD20 F1 and rules 18, 19, 29-32.

Keyword marks in code: **NEW**, **existing**, **user-defined**. "The store" is the Runtime's entity store.

## 0. Verdict first

- **Flow cannot see the server contract without owning the request.** A precondition, a dedupe key and which rows an
  update matched are all decided by code Flow neither builds nor runs. Seeing them would mean building or inspecting the
  request, and that is networking. Under the user's hard constraint, **I recommend abandoning the wider "make the server
  contract visible" exploration.**
- **The data-only answer is enough for the released write.** Flow can't see the *rule* the server enforces. It can see
  the rule's *state* in answers it already decodes, and it can catch a false claim from those same answers. So the contract
  declares the rule, typed against its own outcome mapping, and answers prove or falsify it.
- **One rule** (section 3) ends the doubt from data alone. It has two exits, which follow from what the doubt means: the
  request can no longer apply, or nothing it could do would go unheard. `guarded: true` becomes
  `precondition: { failure: "TicketChanged" }`, and the existing `idempotency` and `.covers` gain the consequences they
  already imply. No clock decides anything.

## 1. The problem

A write's outcome is unknown, because the connection dropped. The person gives up on it with `cancel`, an ignored unknown or
any unretained unknown (rule 40). The request may still be in flight, and it may land later, after a newer write (OD20 F1's
trace: commit, unknown, cancel, commit, the newer lands, the released one lands). Flow must not show the record's fields as
settled while that can happen, so it marks them: `uncertain` until one read, then `unconfirmed`, quiet (U10, Q7 A). The
question is how Flow learns, honestly, that the request can no longer change the server, so the doubt can end. Today
nothing ends it except the 4,096-per-entity eviction cap (`UnsettledEvicted`, built in phase 1 E round 2).

The user widened it. A commit is an opaque Effect that calls the app's service. Every property of the server request has
to be claimed by the author: whether it is version-checked, idempotent or safe to re-send, and what a zero-row answer
means. The same blindness shows up in four places:

| Where | What Flow can't see |
| --- | --- |
| A released write | whether the old request is conditional on something that has since changed |
| A re-send after unknown (rule 31) | whether the server dedupes it, or applies it twice |
| PostgREST's zero rows (`200`, `data: []`) | stale revision, a row hidden by row-level security, or a missing row (STATUS round 2 item 6) |
| A business-key dedupe (rule 19, OD33) | whether the server really dedupes on `orderId` |

**Hard constraint (the user's):** Flow never makes requests, builds requests, holds clients, retries transport, or ships
transport code. A design passes only if Flow touches data: the commit's input, the answer the app's own code returns,
Schemas and mapped outcomes.

## 2. Findings and root causes

### 2.1 What was gathered

From the design and prototypes, read directly:

- **F1.** OD20 F1 (machine-design.md:2884-2891) names the remedy for a released write as "a version precondition,
  `basedOn` sent as `If-Match`", "a contract-level choice". The wording is HTTP-specific. PostgREST has no `If-Match` and
  no 412: its check is a filter, and a conflict is `200` with `data: []` (STATUS.md:909, :954-955; `typed/phase1e.ts:52-70`).
- **F2.** `guarded: true` (entity-proposal-2.md:184, :429; Q1) is a boolean claim. `flow check` can't verify it. It isn't
  tied to the outcome mapping, so the author can claim it and map the conflict to `unknown`. Its trust-list row says
  "no server test" (entity-proposal-2.md:644).
- **F3.** The proof `guarded` uses is "a version past `basedOn` is seen", and equality proves nothing (`proofAtEqual`
  fails 7 of 13, entity-proposal-2.md:429). This part is sound, and section 3 keeps it.
- **F4.** Rule 19 already carries a server-semantics claim on the contract, `idempotency: "attempt" | fields` (C129,
  OD33 Q6 A; not built). A second claim shaped differently would be a second mechanism for one kind of fact.
- **F5.** A re-send to a source that doesn't dedupe applies again. On PostgREST, a retry of a landed write gets `[]`, and
  rule 18 makes that `StillUnknown` (STATUS round 2 item 6). The app settles it with a read, but no rule lets that read end
  the store's doubt, because "an open doubt never closes by a read" (entity-proposal-2.md:89).
- **F6.** A sourced entity (an engine such as TanStack DB or Zero) already has a mark that ends "by the engine's next
  statement about that key" (entity-proposal-2.md:717). That is a second exit with a different shape: the engine would
  *hear* a late landing.
- **F7.** The restore loses `basedOn`, because the lane record keeps only refs (STATUS round 2 finding 2). Any proof that
  depends on the sent base needs the base on the durable row.
- **F8.** The narrowed rebase (Q5 A) means the base a write is *sent* with can differ from the base it was minted over.

From prior art (sidecars, each verified by me unless marked):

- **P1. Zero and Replicache fence by a per-client sequence, confirmed in data.** The server bumps `lastMutationID` in the
  same transaction as the mutator (`codebases/mono/packages/zero-server/src/zql-database.ts:78-95`). It refuses a lower id
  as already processed and a higher id as out of order (`process-mutations.ts:794-816`). The client drops every pending
  mutation with id <= the confirmed id (`zero-client/src/client/mutation-tracker.ts:282-310`;
  `replicache/src/sync/pull.ts:359-377`). An invalid mutation must still advance the id
  (`replicache-doc/docs/reference/server-push.md:166-170`). The client never abandons a push. It only rejects the app's
  promise (sidecar, `mutator-proxy.ts:95`, not verified). **The proof is a monotone value the server sends back. The
  fence is the server's in-order rule.**
- **P2. TanStack DB has the released-write hole.** `rollback()` on a persisting transaction removes the overlay, and the
  in-flight `mutationFn` is not cancelled; when it returns, `commit()` sees the state changed and returns
  (`codebases/db/packages/db/src/transactions.ts:766`, :795). Offline transactions mint an `idempotencyKey` once per
  transaction (`offline-transactions/src/api/OfflineTransaction.ts:31`). Electric's `awaitTxId` waits on a **15 s timer**
  (`electric-db-collection/src/electric.ts:1011`). That is a clock deciding, which this design rejects.
- **P3. HTTP.** RFC 9110 says the server "MUST evaluate the If-Match condition ... prior to performing the method"
  (§13.1.1, `rfc9110.txt:5817`), and 412 means the method was not applied (§15.5.13). It requires no atomicity, so the
  server must check and write in one step. **A strong validator may be "a collision-resistant hash function applied to
  the representation data" (§8.8.1, `rfc9110.txt:3417-3430`).** Such an ETag repeats when the content returns, A→B→A, so
  an old `If-Match` can match again. That is ABA, and a fence on it is unsound. The Idempotency-Key draft sets no
  retention. Stripe prunes keys after 24 hours, and a result is saved only once execution begins
  (docs.stripe.com/api/idempotent_requests, sidecar).
- **P4. Effect HttpClient** aborts the fetch on interrupt (`codebases/effect-v4/.../unstable/http/HttpClient.ts:639`,
  :665) and calls a lost response `TransportError` (`HttpClientError.ts:91`). WHATWG Fetch sends an HTTP/2 `RST_STREAM` on
  abort and says nothing about server-side processing (sidecar, fetch spec §4.7). **An abort is not a proof.**
- **P5. supabase-js** resolves and never rejects. A dropped connection is `status: 0`. It has no idempotency header, and
  it supports `.abortSignal(signal)` (sidecar, postgrest-js source URLs; consistent with STATUS.md:909). PostgREST
  documents no `If-Match` (sidecar, absence not verified).
- **P6. Apollo and Relay roll the optimistic layer back on any error.** ElectricSQL's write guide removes the local write
  when a request fails (sidecar, docs). All three treat "no answer" as "didn't happen", the bug this design exists to
  avoid. Electric's sync stream does show a late landing when one happens, which is the visibility exit (P7).
- **P7. Through-the-database sync** (Electric, Zero pokes, Supabase realtime) delivers every committed change. A late
  landing is then *heard*, not prevented.

### 2.2 Root causes, one sentence each

- **RC1. "Flow can verify what the server enforces" is false.** The rule lives in code one level below Flow. Only owning
  the request could make it visible. Every answer to the wider question either claims the rule or owns the request.
- **RC2. "The proof is a fact about the old request" is false.** The released request never answers. A proof can only be a
  fact about the *server's present state* that the declared rule turns into "that request cannot apply": a version past
  its base, a key already taken, a sequence past its id (P1, F3).
- **RC3. "One source shape" was assumed.** `guarded`'s wording is HTTP (`If-Match`, 412). Real sources fence with a
  filter (PostgREST), a header (REST), a key (Stripe) or a sequence (Zero), and some can't fence at all (plain
  last-writer-wins).
- **RC4. "Impossible" was the only exit considered.** The doubt exists because a late landing would go *unheard*. A
  source that would hear it (a sourced engine, a covering live session) answers the same worry, a different way (F6, P7).
- **RC5. A claim with no consequence in data can't be caught.** `guarded: true` is never contradicted by anything Flow
  sees, so a wrong claim ends marks silently for good.

These explain F1-F8. F5 is RC2: the retry's refusal *is* a fact about the present state. F7 and F8 follow from RC2 too:
the proof needs the base actually sent.

## 3. Requirements, together

1. **Correct under every source shape:** version-checked (PostgREST filter, `If-Match`/412, compare-and-swap),
   last-writer-wins, idempotency-keyed by Attempt, business-keyed, server mutation ids, and sources that can't say.
   Wherever the shape can't prove an exit, the mark stays.
2. **Data only.** Flow reads the commit's input, its decoded answer, mapped outcomes and Schemas. It builds, sends and
   retries nothing.
3. **No clock decides.** No `landsWithin` or `assumeGoneAfter`. The count cap stays the one guess, and it is named.
4. **Locality.** A claim about the request sits on the contract, next to `commit` and `idempotency`.
5. **Typed against the mapping.** A claim names the outcome it produces, so it can't be declared with no path to its
   refusal.
6. **Falsifiable.** A wrong claim shows up in data at runtime and in Stories, with evidence.
7. **One rule**, not a case per source.
8. **Static analysis stays.** The claim is data in `Compiled`. `flow check` checks its shape, and `flow explain` prints
   what ends each write's doubt and what it trusts.
9. **No machine change.** Lanes, `retry`, `cancel` and handlers are untouched. This is the store's business (rule 26).
10. **Holds with the rest:** the narrowed rebase (Q5 A), bulk `many`, restore, `StillUnknown` (rule 18) and the
    conflict mechanics of proposal 2.

Conflicts, side by side. Requirement 1 against requirement 2: full correctness for every shape would need Flow to see the
request, and requirement 2 forbids it. **Resolved by RC1:** declare the rule, prove its state from data and catch
contradictions. Where a source can't fence, the mark stays.

## 4. The design

### 4.1 The one rule

> **A given-up write's doubt means one thing: the server may still change this field without the store hearing it. It
> lasts while both hold: no answer has shown the request can no longer apply under what the contract declares the server
> enforces, and no live session that covers the record would hear it apply. Answers are the only evidence. No clock, and
> no claim on its own, ends it. Past the cap it is evicted, with evidence.**

The two halves aren't two cases. They are the two ways "may change … without hearing it" stops being true.

### 4.2 Where the proof comes from

The contract declares what the server enforces. That part is existing or **NEW**, and it is the author's claim. The proof
is always an answer the store already decodes.

| Declared on the contract | The fence | Proof seen in data (any of) | Ends for |
| --- | --- | --- | --- |
| `precondition: { failure: Tag }` (**NEW**) | the request applies only if record r's version equals the base it was **sent** with, b | an answer carrying r's version v > b: a read, a feed frame, or any write's success (equality proves nothing); **or** the `Tag` failure to any send fenced on (r, b), the Attempt's own re-send included | r |
| `idempotency: "attempt"` (existing, C129) | the server takes a key once | a success of a re-send of the same Attempt (already rule 32's "its own re-send's success") | the Attempt's records |
| `idempotency: ["orderId"]` (existing, C129) | the server takes a business key once | a success of any later Attempt of the same contract with the same key values | the Attempt's records |
| `.covers(...)` on a `listen` (existing, Q3 A) | none: the change would be **heard** | a live session covering r, with no open gap | masks r's mark while it lasts; ends nothing |
| `sourced: true` entity (existing, proposal 2 section 9) | the engine's own (Zero's sequence, TanStack's transaction) | the engine's next statement about the key (unchanged) | r |
| nothing | none | none | the cap: `UnsettledEvicted` |

**Why a version past b proves it.** The request's condition is `version = b`. If the version only grows and never
repeats, then once any answer shows v > b, the condition is false from then on. If the request already ran, it may be what
moved the version. Either way it can't change the server again. A lagging replica can only show an older version, so it
can fail to prove but can't prove falsely.

**Why the refusal proves it.** A send carrying b was refused because the condition was false then. Monotone versions keep
it false. This is F5's fix: on PostgREST, a retry's `[]` mapped to `TicketChanged` ends "may still land", while rule 18
still makes the *lane's* ending `StillUnknown`. The lane's question is whether the first send landed, which is different.

**Why a same-key success proves it.** The server has recorded the key. A late copy is deduped: it replays the stored
answer or is refused. A key-mismatch refusal (the draft's 422, Stripe's error) is not taken as proof (section 8, Q3).

**After a proof.** The Open mark for r ends. Its fields become a conflict, closed per field by the answer that proved it
or by one read. That is proposal 2's existing conflict, and `guarded` used the same path (entity-proposal-2.md:429).

### 4.3 The claim is checked by data: `PreconditionContradicted`

The check is new store behaviour. Its evidence name is **NEW**, and there is no public word. Say a first send of a
precondition contract carries base b for r, and before it began the store already held, from an answer, a version
v ≠ b for r. If that send ends in **success** for r, the claim is false: a request conditional on `version = b` succeeded
while the version was not b.

- Evidence `PreconditionContradicted { contract, attempt, record, basedOn, known }`, also listed in Inspection.
- The contract's precondition is void for the rest of the Runtime's life. Its marks then fall back to the cap, and marks
  it already ended stay ended (stated).
- Only a **first** send counts. A re-send can legitimately replay a stored success under a dedupe key.
- The narrowed rebase (Q5 A) makes this reachable on ordinary paths. An overtaken draft is sent with its stale base. A
  fenced server must refuse it, and a success there is the contradiction.
- In Stories, a fake that answers success over a stale base shows the evidence. That gives a test author a way to fail
  the claim, which `guarded` never had (RC5).

This doesn't verify the claim. It catches the commonest ways it is false: the commit forgot to pass `basedOn`, used
another column, or the server ignores the filter.

### 4.4 Preconditions on the claim (stated, checked where data allows)

- The precondition is **equality on the entity's `version` field**, with Flow's `basedOn`, so the entity must declare
  `version` (`flow check` error otherwise).
- The version **never repeats**. That is already the entity's contract ("monotonic across a key's re-creations; if it
  restarts, leave it out"). **A content-hash ETag is not one** (§8.8.1 allows it, and it repeats on A→B→A). A REST source
  whose ETag is a hash sends its revision in the body and fences on that, or declares no precondition.
- The `Tag` is returned only when the send applied nothing. Zero rows under row-level security count. Trust-list row:
  "the precondition's failure means the version moved, or the row is gone for this caller for good".
- The row keeps the base **as sent**, per record, written at the send (the `sent` seam hook, phase 1 E round 2). That
  fixes F7 and gives F8 the right base.

### 4.5 What Flow sees, and what it doesn't

| Flow sees (data) | Flow does not see (claim) |
| --- | --- |
| `basedOn` it handed the commit, per record, as sent | whether the commit put it on the wire |
| the decoded answer: versions, rows, the mapped failure tag | whether the server checked it atomically |
| a later answer's version for the record | whether the server dedupes keys, and for how long |
| a success over a base it knew was stale (`PreconditionContradicted`) | why zero rows matched (stale, hidden, missing: a read decides, `.gone` Q2) |

## 5. Before and after, across five very different sources

The trait and machine are the same in every case except example 3, and they don't change between before and after. They
are written out once here so that can be checked.

```ts
// title-editor.trait.ts. Unchanged in examples 1, 2 and 4, before and after
export const TitleEditor = trait(                                             // existing: trait; user-defined: TitleEditor
  {
    id: "TitleEditor",                                                         // existing: id; user-defined value
    events: { Save: { title: Schema.String } },                                // existing: events; user-defined: Save
    internalEvents: { Saved: {}, Refused: {}, Unsure: Flow.uncertain({}) },   // existing: internalEvents, Flow.uncertain; user-defined: the names
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
          { target: "self", actions: [O.save.cancel(own)] },                   // existing: cancel. The give-up this proposal is about
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

### Example 1. supabase-js PostgREST, a `revision` column, no idempotency key

The data comes from `sb.from("tickets").update(...).eq("revision", basedOn).select(...)`, which resolves to
`{ data, error, status }`. A conflict is `200` with `data: []`, and a lost connection is `status: 0` (P5).

```ts
// tickets.api.ts. user-defined: everything here. The same before and after
export const TitleSaved = Schema.Struct({ title: Schema.String, revision: Schema.Number })
export class TicketApi extends Context.Service<TicketApi, {
  readonly saveTitle: (i: { id: string; title: string }, basedOn: number) => Effect.Effect<PostgrestResponse<unknown[]>>
}>()("app/TicketApi") {
  static readonly layer = Layer.effect(TicketApi, Effect.map(Supabase, (sb) => ({
    saveTitle: (i, basedOn) => Effect.promise((signal) =>
      sb.from("tickets").update({ title: i.title })
        .eq("id", i.id).eq("revision", basedOn)              // the precondition, in the app's own query. Flow never sees this line
        .select("title, revision").abortSignal(signal)),
  })))
}
export const answerOf = (res: PostgrestResponse<unknown[]>) =>
  res.error !== null
    ? res.status === 0 || res.status >= 500
      ? Outcome.unknown({ _tag: "NoResponse" as const })     // existing: Outcome.unknown
      : Effect.fail({ _tag: "Refused" as const })
    : res.data === null || res.data.length === 0
      ? Effect.fail({ _tag: "TicketChanged" as const })     // zero rows: applied nothing (stale, hidden or gone)
      : Schema.decodeUnknownEffect(TitleSaved)(res.data[0]).pipe(
          Effect.mapError(() => new OutcomeUnknown({ reason: { _tag: "Undecodable" as const } })))   // existing: OutcomeUnknown
```

```ts
// tickets.domain.ts. The same before and after
export const Ticket = entity({                                // existing: entity
  id: "Desk/Ticket", fields: TicketRow.fields, primaryKey: ["id"],   // existing: id, fields, primaryKey; user-defined: TicketRow
  version: "revision",                                        // existing: version. A revision counter: it never repeats
})
export const TicketsDomain = domain("tickets", {              // existing: domain
  ticketById: read(ticketById).one(Ticket).byKey(({ input }) => ({ id: input.id })).gone("TicketNotFound"),   // existing (gone: Q2 A)
  saveTitle: write(saveTitle).one(Ticket.pick("title", "revision"))   // existing: write, one, pick
    .predicts(({ input }) => Ticket.patch({ id: input.id }, { title: input.title })),   // existing: predicts, patch
})
```

```ts
// tickets.contracts.ts. BEFORE (Q1 A)
export const saveTitle = transaction({                        // existing: transaction
  id: "Desk/save-title",                                      // existing: id
  input: { id: Schema.String, title: Schema.String },         // existing: input
  output: TitleSaved,                                         // existing: output
  key: ["id"],                                                // existing: key
  concurrency: "latest",                                      // existing: concurrency
  guarded: true,                                              // Q1 A's word: an untyped claim
  commit: (i, { basedOn }) => TicketApi.use((api) => api.saveTitle(i, basedOn)).pipe(Effect.flatMap(answerOf)),   // existing: commit, basedOn
})

// tickets.contracts.ts. AFTER
export const saveTitle = transaction({
  id: "Desk/save-title",
  input: { id: Schema.String, title: Schema.String },
  output: TitleSaved,
  key: ["id"],
  concurrency: "latest",
  precondition: { failure: "TicketChanged" },                 // NEW: precondition. The commit sends basedOn as a version check; a refusal ends as this tag.
                                                              //   Type error unless "TicketChanged" is a tag of the commit's error channel
  commit: (i, { basedOn }) => TicketApi.use((api) => api.saveTitle(i, basedOn)).pipe(Effect.flatMap(answerOf)),
})
// DROPPED: guarded
```

What the person sees. They save B over revision 3, it is lost and given up, and then:

```ts
// B never landed; they save C:      C's answer carries revision 4 > 3   → proof   { data: { title: "C" }, uncertain: false, unconfirmed: [] }
// B had landed; the give-up's read: the read carries revision 4 > 3     → proof   { data: { title: "B" }, uncertain: false, unconfirmed: [] }
// they retried first (Held), got []: TicketChanged on base 3            → proof for the store; the lane still ends StillUnknown (rule 18); a read shows the value
// B never landed, nobody writes:    revision stays 3                     → no proof { data: { title: "A" }, uncertain: false, unconfirmed: ["title"] }, until the cap. Honest: B could land
// commit forgot .eq("revision"):    C's first send over a known-stale base succeeds → PreconditionContradicted; precondition void for this Runtime
```

### Example 2. A REST API with `If-Match`, 412 and `Idempotency-Key`, through Effect's HttpClient

The data comes from `PATCH /tickets/:id` with `If-Match: "r3"` and `Idempotency-Key: <attempt>`. The answer is `200`
with `{ title, revision }`, `412` on a stale base, or a `TransportError` when no answer arrives (P4). The ETag is
`"r<revision>"`, a revision rather than a content hash (section 4.4).

```ts
// tickets.api.ts. user-defined: everything here. The same before and after
export class TicketApi extends Context.Service<TicketApi, {
  readonly saveTitle: (i: { id: string; title: string }, o: { key: string; basedOn: number }) =>
    Effect.Effect<typeof TitleSaved.Type, { readonly _tag: "TicketChanged" } | OutcomeUnknown<{ readonly _tag: "NoResponse" }>>
}>()("app/TicketApi") {
  static readonly layer = Layer.effect(TicketApi, Effect.map(HttpClient.HttpClient, (client) => ({
    saveTitle: (i, o) =>
      HttpClientRequest.patch(`/tickets/${i.id}`).pipe(
        HttpClientRequest.setHeaders({ "If-Match": `"r${o.basedOn}"`, "Idempotency-Key": o.key }),   // the precondition and the key
        HttpClientRequest.bodyJsonUnsafe({ title: i.title }),
        client.execute,
        Effect.flatMap(HttpClientResponse.matchStatus({
          412: () => Effect.fail({ _tag: "TicketChanged" as const }),
          "2xx": HttpClientResponse.schemaBodyJson(TitleSaved),
          orElse: () => Outcome.unknown({ _tag: "NoResponse" as const }),
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

The domain is example 1's. The traces are example 1's, with one more:

```ts
// lost, retried while Held, the server replays the stored 200: the Attempt's own re-send succeeded → its mark ends (rule 32, unchanged)
//   and no PreconditionContradicted: only a first send is checked, since a re-send may replay
```

### Example 3. Payments with a business key and no version (Stripe behind the app's server)

The data comes from `POST /orders/:orderId/pay`. The app's server calls Stripe with `idempotencyKey: orderId` and
answers `{ status: "paid", chargeId }`. There is no version. A browser can lose its holds (OD33), so the person may press
Pay again as a new Attempt.

```ts
// orders.contracts.ts. BEFORE
export const pay = transaction({                              // existing: transaction
  id: "Shop/pay",
  input: { orderId: Schema.String, amountCents: Schema.Number },
  output: Schema.Struct({ status: Schema.Literal("paid"), chargeId: Schema.String }),
  key: ["orderId"],
  concurrency: "reject",
  commit: (i) => OrdersApi.use((api) => api.pay(i)),          // user-defined: OrdersApi; puts orderId on the wire as Stripe's key
})
// a lost, given-up pay: Order.status stays `unconfirmed` until the cap, even after a second press succeeds

// orders.contracts.ts. AFTER
export const pay = transaction({
  id: "Shop/pay",
  input: { orderId: Schema.String, amountCents: Schema.Number },
  output: Schema.Struct({ status: Schema.Literal("paid"), chargeId: Schema.String }),
  key: ["orderId"],
  concurrency: "reject",
  idempotency: ["orderId"],                                   // existing (C129, OD33): the server dedupes on orderId. No new word
  commit: (i) => OrdersApi.use((api) => api.pay(i)),
})
```

```ts
// orders.domain.ts. The same before and after. No version: a precondition can't be declared here
export const Order = entity({ id: "Shop/Order", fields: OrderRow.fields, primaryKey: ["orderId"] })   // existing: entity; user-defined: OrderRow
export const OrdersDomain = domain("orders", {                // existing: domain
  pay: write(pay).one(Order.pick("status"))                   // existing: write, one, pick
    .predicts(({ input }) => Order.patch({ orderId: input.orderId }, { status: "paying" })),   // existing: predicts, patch
})
```

```ts
// checkout.machine.ts. The same before and after
export const Checkout = definition({                          // existing: definition
  id: "Shop/Checkout",
  states: ["READY", "PAID"],
  events: { Pay: {} },
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
            { actions: [O.pay.cancel(own)] },                 // gives up; the person can press Pay again, which is a new Attempt with the same orderId
          ],
        },
      },
      PAID: {},
    },
  }
})
```

```ts
// pay lost, given up, Pay pressed again, success: same orderId → proof → the first pay's mark on Order.status ends. Stripe replayed or applied once
// pay lost, given up, never pressed again: no proof → `unconfirmed` until the cap. Honest: the first request may still charge
```

### Example 4. Last-writer-wins PostgREST with no version column, with and without Supabase realtime

The data comes from `update({ title }).eq("id", id)`. There is no fence of any kind. Supabase realtime's
`postgres_changes` on `tickets` is the app's own channel.

```ts
// tickets.contracts.ts. The same before and after: no precondition can be declared (no version), no key
export const saveTitle = transaction({
  id: "Desk/save-title", input: { id: Schema.String, title: Schema.String }, output: TitleRow, key: ["id"], concurrency: "latest",   // existing
  commit: (i) => TicketApi.use((api) => api.saveTitle(i)).pipe(Effect.flatMap(answerOf)),
})
// flow check, AFTER: warning ResendUnfenced (NEW) at TitleEditor's `O.save.retry`: a re-send may apply twice; neither idempotency nor precondition is declared
```

```ts
// feed.contracts.ts. user-defined body; the same before and after
export const ticketChanges = stream({                         // existing: stream
  id: "Desk/ticket-changes", input: { workspaceId: Schema.String }, output: TicketChange, key: ["workspaceId"], delivers: "every",   // existing
  subscribe: (i) => Stream.unwrap(Effect.map(Supabase, (sb) =>
    Feed.callback<TicketChange, never>((emit) => Effect.gen(function* () {   // existing: Feed.callback
      const ch = sb.channel(`tickets:${i.workspaceId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "tickets", filter: `workspace_id=eq.${i.workspaceId}` },
          (p) => emit(p.eventType === "DELETE" ? { _tag: "Removed", id: p.old.id } : { _tag: "Row", row: p.new }))
        .subscribe((status) => { if (status === "SUBSCRIBED") emit(Feed.live({ proof: "realtime subscribed" })) })   // existing: Feed.live
      yield* Effect.addFinalizer(() => Effect.promise(() => sb.removeChannel(ch)))
    })))),
})
// feed.domain.ts
export const TicketFeed = domain("ticket-feed", {
  changes: listen(ticketChanges)                              // existing: listen
    .covers(({ input, record }) => eq(record.workspaceId, input.workspaceId))   // existing (Q3 A): what this session promises to tell
    .as([Ticket], (e) => (e._tag === "Removed" ? Ticket.delete({ id: e.id }) : Ticket.row(e.row))),   // existing (Q4 A): delete, row
})
```

```ts
// BEFORE, any feed: lost, given up, read:  { title: "A", unconfirmed: ["title"] } until the cap, live feed or not
// AFTER, feed live and covering:            { title: "A", unconfirmed: [] }          masked: if B lands, its frame arrives and shows B
// AFTER, the feed ends (gap or unsubscribe): { title: "A", unconfirmed: ["title"] }    the durable row's mark shows again; the cap still applies
// AFTER, no feed in the app:                 same as BEFORE. Nothing Flow can see would end it, and it says so
```

### Example 5. An engine: Zero, or TanStack DB over Electric (sourced)

The data comes from the engine's own push and sync. The entity declares `sourced: true` (proposal 2 section 9). **No
change and no new word.** Zero never abandons a push and confirms by `lastMutationID` (P1). TanStack DB's rollback can
leave the request running (P2), but a sourced entity reads the engine's sync stream, so a late landing arrives as a frame.
Both exits of the rule hold by construction: the engine fences, the stream hears, or both. `precondition` on a sourced
write is a `flow check` error (`PreconditionOnSourced`, **NEW**), because the engine owns order.

## 6. What it adds and drops compared with `guarded: true`

| | Item | Why |
| --- | --- | --- |
| **Added** | `precondition: { failure: Tag }` on the contract | the claim names its refusal outcome, so it is typed against the commit's error channel (requirement 5) |
| **Added** | proof by the precondition's refusal to any send on the same base | F5: on PostgREST, a retry's `[]` ends the doubt the read could not |
| **Added** | `PreconditionContradicted` evidence, which voids the claim for the Runtime | RC5: a wrong claim now shows in data and in Stories |
| **Added** | proof by a same-key success, from the existing `idempotency` | RC2 and RC3: one rule covers keys as well as versions, with no new word |
| **Added** | the masking exit, from the existing `.covers` | RC4: last-writer-wins with realtime needs no cap while it is live |
| **Added** | `flow check`: `PreconditionWithoutVersion`, `PreconditionOnSourced` (errors), `ResendUnfenced` (warning) | requirement 8, and the user's re-send blindness |
| **Added** | the base as sent, kept on the durable row | F7 and F8 |
| **Kept** | a version past the base as proof, and equality proving nothing | F3, `proofAtEqual` |
| **Kept** | no clock; the 4,096 cap with `UnsettledEvicted` as the one named guess | requirement 3 |
| **Dropped** | the word `guarded` | it says "this is protected" without saying by what, or what the refusal maps to |
| **Dropped** | "`basedOn` as `If-Match`, 412 mapped to a failure" as the only spelling (OD20 F1, Q1) | RC3: PostgREST's filter and `[]` are the same fence |
| **Dropped** | the reading that a precondition can't be checked at all | section 4.3 checks it from data, partly, and says which part |
| **Rejected** | first-party source adapters that build queries or hold clients; a typed request description an adapter runs | they own networking (section 7) |
| **Rejected** | a receipt the commit returns saying what it sent | a lost send returns nothing, so the receipt is missing exactly when it is needed; and it is still the author's claim |
| **Rejected** | a branded `BasedOn` type in the app's service signature | it couples the app's service layer to Flow and still proves nothing about the query |
| **Rejected** | `assumeGoneAfter`, or an Electric-style wait timer | a clock deciding (P2's 15 s) |
| **Rejected** | ordered per-client Attempt ids, so a custom server can fence by sequence as Zero does | it is a Runtime change for a server that should use an engine; open question 6 |

## 7. The wider seam: each option against the line

| Option | Crosses "Flow owns networking"? | Makes the server contract visible? | Verdict |
| --- | --- | --- | --- |
| 1. Proof carried in answers (versions, a mapped refusal, a same-key success) | **no**: it reads decoded answers | the rule's *state*, yes; the rule itself, no | **adopted**, with a declared rule |
| 2a. Source adapter that adds the precondition to the app's query builder (`.fenced(basedOn)`) | **yes**: it builds part of a request | the precondition, yes | out |
| 2b. Source adapter that holds the Supabase or REST client | **yes** | yes | out |
| 2c. Data shim: a Schema for `PostgrestResponse` plus an outcome mapper the app's code calls | no | **no**: the `.eq("revision", …)` is still the app's | not part of the seam. It is a convenience at most (open question 5) |
| 2d. Engines (Zero, TanStack DB) behind `sourced` | no: the engine is the app's dependency | the engine states order itself | already the design (example 5) |
| 3. A typed request description the commit returns and an adapter executes | **yes** | fully | out, by the user's constraint |
| Hand-written service (the fallback) | no | no | **the default**: declare on the contract, prove from answers |

**Plainly:** the only full resolution of "Flow can't look into the commit" is options 2a, 2b or 3, and each owns
networking. **Recommendation: abandon the wider exploration**, and take this proposal as the data-only answer. It solves
the released write's exit for every shape that has a fence or a feed, catches the commonest false claims, and states the
remainder.

| What the user named | The data-only answer here |
| --- | --- |
| A released write's exit | the one rule (section 4.1) |
| Re-sends after unknown | `ResendUnfenced` where a `retry` is reachable on a contract with neither claim; a precondition makes a re-send a compare-and-swap, so it can't apply twice |
| PostgREST's zero rows | for "did it apply": definite, nothing applied, in all three causes. For "why": a read decides (`.gone`, Q2 A). Flow does not need to split them |
| Business-key dedupe | already declared (`idempotency: fields`). A same-key success is now proof. Whether the server really dedupes stays a trust-list row |

## 8. Consequences for the rest of the system

- **Marks table** (entity-proposal-2.md:102). The `unconfirmed` row "Open, given up, read since" takes this exit: "a fence
  seen satisfied (section 4.2), or masked while a covering session is live". `MayStillLand` stays the name when there is
  neither. `UnsettledEvicted` stays.
- **Held marks are unchanged.** While a lane can still re-send, the mark stays `uncertain` (OD19 word for word). A fence
  proof before the give-up is remembered on the row, so the give-up ends the mark at once (open question 4).
- **Conflicts.** A proven Open mark becomes proposal 2's conflict. It is closed per field by the proving answer or one
  read, and asks the repair at most 3 times.
- **Rule 18 and `StillUnknown`** are unchanged for the lane. The store separates "did it land" (still unknown) from "can it
  land later" (no, once fenced).
- **The narrowed rebase (Q5 A).** The fence uses the base as sent, so a rebased write fences on its rebased base. A draft
  overtaken by another actor is sent stale and refused, an ordinary conflict, and a success there is
  `PreconditionContradicted`.
- **Bulk `many`.** The base is kept per key, and proof is per record. This is sound whether the server applies the bulk
  atomically or row by row.
- **Restore.** The durable row carries the sent base and, for `idempotency: fields`, the key values. A restored given-up
  mark can be proven after a reload.
- **Plain transactions** (no entity) have no `basedOn` and no marks, so `precondition` is a `flow check` error there.
  OD20 F1's stated limit stays for them.
- **`Compiled`.** A contract gains `precondition?: { failure: string }` next to `idempotency` (C129). Nothing else in it
  changes.
- **`flow check`.** Errors: `PreconditionWithoutVersion`, `PreconditionOnSourced`, and a precondition on a contract not
  bound as a domain write. The tag is also a type error when it is not in the commit's error channel. Warning:
  `ResendUnfenced`.
- **`flow explain`**, per write, prints what ends a given-up doubt ("a version past its base; the refusal
  `TicketChanged`; a covering live session"), or "nothing: the cap". It also prints the trust-list rows, which change:
  `guarded`'s row is replaced by "the server enforces the precondition (checked by `PreconditionContradicted`)" and "the
  precondition's failure means nothing applied, for good". A new row: "a business key is deduped for longer than any
  request can be in flight".
- **Stories.** Proofs, masks and contradictions come from the given answers, so a Story shows a mark ending at "a read
  shows revision 4". A fake that ignores the precondition shows `PreconditionContradicted`, which is a standing lie for
  the conformance harness.
- **Machines, lanes, `retry`, `cancel`** are untouched (requirement 9).
- **Cost.** One comparison per answer per held, given-up row on that record. Rows are bounded by the cap.

## 9. Open questions, each with my recommendation

1. **The word.** A: `precondition: { failure: "TicketChanged" }`. B: keep `guarded: true` (Q1 A as accepted).
   C: `precondition: true`. **Recommend A.** It reads at a glance as "a precondition, refused as `TicketChanged`". It
   uses RFC 9110's term and the existing word `failure`, and its tag is typed.
2. **The masking exit (covering live session).** A: include it. B: only fences end or quiet a doubt.
   **Recommend A.** It is the honest answer for the commonest Supabase shape, last-writer-wins plus realtime, and it adds
   no word. Its trust ("a live session is complete") is already on the list.
3. **What counts as proof.** A: a version past the base, the precondition's refusal on the same base, and a same-key
   success. B: as A, plus a key-mismatch refusal. C: versions only, as `guarded` had. **Recommend A.** B would add a tag
   meaning nobody maps consistently. C loses F5's fix.
4. **Held marks and an early proof.** A: Held stays `uncertain`; the proof is kept and applied at the give-up.
   B: a proof turns a Held mark into a conflict at once. **Recommend A**, to keep OD19's rule word for word. B is a
   later, separate question.
5. **A Supabase response shim** (a Schema plus `answerOf`, data only). A: none in Flow, but a docs recipe. B: a small
   first-party package. **Recommend A.** It crosses no line, but it is SDK-coupled maintenance for ten lines every app
   can copy, and it makes nothing visible.
6. **Ordered per-client Attempt ids**, for custom servers that fence by sequence. **Recommend no.** Such a server should
   sit behind an engine (`sourced`). Put it in `revisit.md` if a real app needs it.
7. **The wider exploration.** **Recommend abandoning it** (section 7): full visibility needs Flow to own the request.

## 10. Proving it (convergence step 9, owed and not run)

Each item is a check that can fail. The prototype has none of them yet.

- `p1e.version-past-base-ends-given-up`: a read at revision 4 ends a base-3 given-up mark. Mutant: equality proves.
- `p1e.refusal-on-same-base-ends`: a retry's `[]` ends the store's doubt while the lane ends `StillUnknown`. Mutant: a
  refusal on a different base proves.
- `p1e.same-key-success-ends`: a second `pay` with the same `orderId` ends the first's mark. Mutant: an attempt-key
  contract lets another Attempt's success prove.
- `p1e.precondition-contradicted`: a first send over a known-stale base that succeeds voids the claim. Mutant: a re-send's
  replay voids it.
- `p1e.covering-session-masks`: a live covering session masks the mark, and it returns when the feed ends. Mutant: the
  mask ends the mark.
- `p1e.restore-keeps-sent-base`: after a reload, a version past the restored base ends the mark (F7).
- The old traces stay as standing tests: OD20 F1's counterexample, `proofAtEqual`, `rule32Clears` and `landAfterWindow`.

## 11. Sidecars: used and rejected

Four Haiku sidecars ran read-only, at effort high, one per prior-art cluster. I verified each finding I used against the
source (file:line above) unless it is marked "sidecar".

- **Replicache and Zero.** Used: the LMID bump in the mutator's transaction, the in-order check, the ≤ resolution, the
  pull replay, and the doc's "must still mark processed" (all verified). Used with a mark: the client never abandons a
  push. Ignored: its closing summary, which was a verdict.
- **TanStack DB.** Used, all verified: rollback while persisting doesn't cancel, the idempotency key per offline
  transaction, and `awaitTxId`'s 15 s default. Not used: the doc-versus-code note on txid timeouts and the outbox-waiter
  inference. They are unverified and off the question.
- **HTTP and Effect.** Used: RFC 9110 §13.1.1, §15.5.13 and §9.2.2, the Effect abort and `TransportError` (verified), and
  Stripe's 24 h pruning and the draft's lack of retention (sidecar, URLs). Its saved RFC text let me find §8.8.1's
  hash-ETag allowance, the ABA finding, which it hadn't reported. Used with a mark: the Fetch spec says nothing about
  server cancellation.
- **Supabase, Apollo and Electric.** Used: postgrest-js `status: 0`, no idempotency, and `.abortSignal`, which agree with
  STATUS.md:909. Also used: Apollo and Relay rollback on error, and Electric's sync-stream confirmation (docs, sidecar).
  Rejected as irrelevant: `Prefer: tx=rollback` and the `count` parsing. Rejected as unverified: its inference that
  Electric's pattern removes a committed write on a lost response. Not used: PostgREST's lack of `If-Match` beyond "not
  documented".
