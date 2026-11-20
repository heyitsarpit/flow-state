# Entities: questions for the user

Status: **proposed**. Nothing here is decided or built. These are the public words that phase 1's entities rounds left for you. Each question has the
problem it solves, a small before/after, the options and a recommendation. Reply `Q1 A`. The data source in every example is supabase-js: an update
resolves to `{ data, error, status }` and never rejects, a version conflict is `data: []`, and a dropped connection is `error` with `status: 0`.

Keyword marks: **NEW**, **existing**, **user-defined**.

The shared app code below is the same in every question.

```ts
// tickets.api.ts. user-defined: everything here. The real call, through the app's own service.
export class TicketApi extends Context.Service<TicketApi, {
  readonly saveTitle: (i: { id: string; title: string }, basedOn: number) => Effect.Effect<PostgrestResponse<{ title: string; revision: number }[]>>
}>()("app/TicketApi") {
  static readonly layer = Layer.effect(TicketApi, Effect.map(Supabase, (sb) => ({
    saveTitle: (i, basedOn) => Effect.promise(() =>
      sb.from("tickets").update({ title: i.title }).eq("id", i.id).eq("revision", basedOn).select("title, revision")),
  })))
}
```

## Q1. `guarded`: a proof that a given-up write can no longer land

**Problem.** A save is lost, the person gives up, and its mark goes quiet (`unconfirmed`, U10). The mark has no exit, because nothing proves the lost
request can't still land later. A contract that sends `basedOn` as a version precondition does prove it. Once the store sees a version past that
`basedOn`, the old request can't change the row any more. Without a word for this, every unguarded mark lives until the 4,096 cap evicts it.

```ts
// BEFORE
export const saveTitle = transaction({                       // existing: transaction
  id: "Desk/save-title", input: { id: Schema.String, title: Schema.String }, key: ["id"], concurrency: "latest",   // existing
  output: TitleSaved,                                        // existing; user-defined: TitleSaved
  commit: (i, { basedOn }) => TicketApi.use((api) => api.saveTitle(i, basedOn)).pipe(Effect.flatMap(answerOf)),   // existing: commit, basedOn; user-defined: answerOf
})
// after give-up and one read: { data: { title: "A" }, uncertain: false, unconfirmed: ["title"] }, for as long as the store lives

// AFTER
export const saveTitle = transaction({
  id: "Desk/save-title", input: { id: Schema.String, title: Schema.String }, key: ["id"], concurrency: "latest",
  output: TitleSaved,
  guarded: true,                                             // NEW: guarded. This commit sends `basedOn` as its precondition, so a version past it ends the doubt
  commit: (i, { basedOn }) => TicketApi.use((api) => api.saveTitle(i, basedOn)).pipe(Effect.flatMap(answerOf)),
})
// a read shows revision 5, past the lost save's basedOn 3: { data: { title: "C" }, uncertain: false, unconfirmed: [] }
```

Machine and usage don't change: `useView(list, (s) => Ticket.get(s, { id }))` reads the row as before.

- **A.** Add `guarded: true` on the contract. The author claims the precondition, and `flow check` can't verify it.
- **B.** No word. Flow sees `basedOn` used in the commit, but it can't see the server honour it.
- **C.** No word, and keep the cap as the only exit.

**Recommendation: A.** It is a single claim on the contract, sitting next to the commit that makes it true. It is also the only exit that isn't a guess.

## Q2. `.gone`: this failure means "no such record"

**Problem.** A read that answers "not found" has to remove the row. Without a word, the read's failure is just a failure, and the row stays on screen.
It applies to PostgREST's `.single()`, which answers `PGRST116`. It also applies to a REST 404.

```ts
// BEFORE
ticketById: read(ticketById).one(Ticket).byKey(({ input }) => ({ id: input.id })),   // existing: read, one, byKey
// a 404 → failure { TicketNotFound }: the row stays, nothing marked

// AFTER
ticketById: read(ticketById).one(Ticket).byKey(({ input }) => ({ id: input.id }))
  .gone("TicketNotFound"),                                   // NEW: gone. user-defined: the tag. This failure is a tombstone for the key
// a 404 → the row is removed (a tombstone at the read's position); the machine still hears TicketNotFound
```

Usage: `Ticket.get(s, { id })` returns `undefined` after the read lands, so the detail view shows "deleted".

- **A.** `.gone(tag)` on the read.
- **B.** The author writes the tombstone in a `listen` or a handler.
- **C.** A read that answers `null` counts as gone, with no word for a failure.

**Recommendation: A.** C does not cover the real APIs that answer with an error. PostgREST still cannot tell an RLS-hidden row from a missing one, so
`gone` claims what the author knows about their policy.

## Q3. `.covers`: what a session promises to tell us about

**Problem.** A `listen` session (Supabase Realtime) tells us about the rows it watches. After a gap, only the rows it covers are behind; everything else is
untouched. Without a word, Flow either marks every record after any session flap or marks nothing.

```ts
// BEFORE
changes: listen(ticketChanges).as([Ticket], toChange),      // existing: listen, as; user-defined: toChange
// a channel flap → every Ticket in the store reads `unconfirmed`

// AFTER
changes: listen(ticketChanges)
  .covers(({ input, record }) => eq(record.queueId, input.queueId))   // NEW: covers. existing: eq. What this session's filter (`queue_id=eq.…`) watches
  .as([Ticket], toChange),
// a flap → only the queue's tickets read `unconfirmed`; a ticket of another queue is untouched
```

Machine: `QUEUE: { activities: [O.changes.subscribe(({ memory }) => ({ queueId: memory.queueId }))] }`, as in the design (2.11.12.7).

- **A.** `.covers` on `listen`, a predicate in `eq` terms that `flow explain` can print.
- **B.** No word: a session covers the records it has itself delivered (proposal 3.3's default).
- **C.** No word: a session covers every record of its entities.

**Recommendation: A, with B as the default when `.covers` is absent.** Both defaults over-mark, and that is the safe direction.

## Q4. `delta` and `row`: `patch` split in two

**Problem.** `Ticket.patch` means a prediction in `.predicts`, and in `listen` it means a partial change from the server. A server delta has to carry the
version to be ordered, but a prediction never does. One word with two meanings can't type that difference.

```ts
// BEFORE
.as([Ticket], (e) => e.eventType === "UPDATE" ? Ticket.patch({ id: e.new.id }, e.new) : Ticket.delete({ id: e.old.id }, { version: e.old.revision }))   // existing: patch, delete

// AFTER
.as([Ticket], (e) =>
  e.eventType === "UPDATE" && e.columns === "partial"
    ? Ticket.delta({ id: e.new.id }, e.new)                 // NEW: delta. In `listen` only; a type error unless the fields include `revision`
    : e.eventType === "DELETE"
      ? Ticket.delete({ id: e.old.id }, { version: e.old.revision })   // existing: delete, version
      : Ticket.row(e.new))                                  // NEW: row. A whole row; what it omits is absent, not unknown
// `Ticket.patch` stays, in `.predicts` only
```

- **A.** Split into `delta` (partial, versioned, `listen` only) and `row` (whole), and keep `patch` for predictions.
- **B.** Keep `patch` everywhere, with a runtime check for the version in `listen`.
- **C.** Keep `patch`, and say in its docs that a `listen` patch must carry the version.

**Recommendation: A.** It is a type error at the call site instead of a doubt at runtime. `row` also answers "is an omitted field absent or unknown",
which today's `patch` leaves open.

## Q5. `basedOn` rebase, narrowed (OD19 Q32 A): the runner's call, for your yes

**Problem.** A person saves twice in a row. Both saves were minted over revision 3, and the second waits behind the first. Without a rebase, the second is
sent with `basedOn: 3`, after the first made the row revision 4, so it conflicts with itself. D3, as you directed it, lets another actor's later save go
ahead of a waiting draft. If the draft were rebased across that save, it would silently overwrite a change the person never saw.

```ts
// usage, the same before and after. existing: send
list.send({ _tag: "Save", id: "t1", title: "A" })   // minted over revision 3
list.send({ _tag: "Save", id: "t1", title: "AB" })  // waits; minted over revision 3

// BEFORE (D18, rebase cut): the second is sent with basedOn 3 → `data: []` → Changed: a conflict with its own first save
// AFTER (built in phase 1 E, round 2): the first returns revision 4; the second was minted after it, over the same base, so it is sent with basedOn 4 → saved
// and when another tab's actor's save B (minted after "AB") goes first: "AB" is not rebased past B → `data: []` → Changed, an ordinary conflict
```

There is no new word. `basedOn` in the commit's context already exists (2.8.1). What changes is the rule: a write rebases across a write ahead of it only
if that write was minted earlier, because the person saw its prediction.

- **A.** The narrowed rebase, as built.
- **B.** No rebase (D18). Every double-save to a version-checked source conflicts with itself.
- **C.** Rebase across every write ahead (OD19 Q32 A as written). Under D3 as directed, an overtaken draft would overwrite a change unseen.

**Recommendation: A.**
