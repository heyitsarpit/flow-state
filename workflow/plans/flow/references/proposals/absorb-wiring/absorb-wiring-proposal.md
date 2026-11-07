Prior art: revision 2, with the full reasoning, evidence, probes and rejected options, is [../../../../archive/flow-design-2026-11/absorb-wiring-proposal-r2.md](../../../../archive/flow-design-2026-11/absorb-wiring-proposal-r2.md). The survey is [absorb-wiring.md](absorb-wiring.md).

# Absorbing wiring: J, E step 2 and F (revision 3, merge-ready)

**Status: ACCEPTED by the user, 2026-11-07; MERGED into machine-design.md on 2026-11-07 as OD29.** B (`Flow.ignore`), P1, G and
E step 1 were accepted earlier the same day and are **already merged** as OD28 (2.7.18; rules 13, 17, 20, 40, 45;
2.8.6; C112, C113). This file merges the rest: **J**, **E step 2** and **F**, recorded as **OD29** with plan rows
**C114–C116**. Merge it before [../actor-identity/proposal.md](../actor-identity/proposal.md), which takes OD30 and
C117 onwards.

Code marks: **NEW**, **NEW MEANING**, **RENAMED**, existing, user-defined.

## 1. J: an entity key from a value carrying its fields

**What and why.** Eleven `patch` calls in the apps rebuild a key from the input's own fields, and three helpers
(`keyOf`, `ticketOf`, `techKey`) exist only for that. Rule 43 already lets write members take "any value carrying the
key's fields". J says the same for an entity's `patch`, `delete` and `fields` and a read's `.byKey`. The parameter is
the key type itself (`{ readonly [k in PK[number]]: Row[k] }`, or an array of it), never a type variable, so
TypeScript's excess-property check still catches a misspelled field in a fresh literal. At runtime Flow keeps only the
`primaryKey` fields, so the stored key equals the literal's under `Equal.equals`.

```ts
// BEFORE: comments.domain.ts
const keyOf = (input: { workspaceId: string; ticketId: string; commentId: string }) =>   // user-defined: keyOf
  ({ workspaceId: input.workspaceId, ticketId: input.ticketId, commentId: input.commentId });
edit: write(editComment).one(Comment).predicts(({ input }) => Comment.patch(keyOf(input), { text: input.text })),   // existing: patch
remove: write(removeComment).predicts(({ input }) => [Comment.delete(keyOf(input)),                                  // existing: delete
  Ticket.patch(ticketOf(input), { commentCount: (beneath) => beneath.commentCount - 1 })]),                         // user-defined: ticketOf

// AFTER
edit: write(editComment).one(Comment).predicts(({ input }) => Comment.patch(input, { text: input.text })),   // NEW MEANING: patch takes a value carrying the key
remove: write(removeComment).predicts(({ input }) => [Comment.delete(input),
  Ticket.patch(input, { commentCount: (beneath) => beneath.commentCount - 1 })]),   // the parent's key, read from the same input
```

**Added:** one sentence in 2.8.8. **Dropped:** 11 key literals and 3 helpers in the apps.

**Limits.** A missing, optional or nullable key field is a type error; so is a fresh literal with a field outside the
key (`ticketID`), and a union that carries the fields on one member only (a `listen` change) until narrowed. A spread
(`{ ...input }`) is not excess-checked. Where the input names the key differently (`mergedId` for `customerId`), the
literal stays. The generic form `<K extends Key>(key: K)` loses the literal check and must not be used. The predicts
recorder records `patch(input, …)` as reads of `input.workspaceId` and `input.ticketId`, so rule 34's warning still
works. Type-checked by a scratch spike against the plan's shapes (`tsc` 7.0.2, Effect 4.0.5); the prototype has no
typed entity API yet.

## 2. E step 2: no `signal` in Flow's contexts

**What and why.** Flow already interrupts the function's fiber whenever it would abort its own signal (rule 24's
cancel, Streams T1's `abandon`, a planned release). Effect hands every `tryPromise` and `callback` its own signal, and
since 4.0 `Effect.abortSignal` gives one signal for a scope. Keeping Flow's signal beside Effect's is the trap behind
two real bugs in the apps (REVIEW M7, S-M2: `AbortSignal.any` and dummy controllers). So the `lookup`, `commit`,
`subscribe` and `catchUp` contexts lose `signal`. This reopens streams' word-table row "`signal`: Keep"
(proposal-v3's [P] word list, approved under S14).

```ts
// BEFORE: a commit, and the Electric recipe's own controller
commit: (input, { attempt, signal }) =>                                                     // existing: signal in the context
  TicketApi.use((api) => api.saveTitle(input, { idempotencyKey: attempt.id, signal })),
subscribe: ({ where }) => Feed.callback<Rows, ElectricDown>((emit) => Effect.gen(function* () {
  const ctl = new AbortController()                                                         // user-defined: a hand-made controller
  const stream = new ShapeStream({ url, params: { table: "tickets", where }, signal: ctl.signal })
  yield* Effect.addFinalizer(() => Effect.sync(() => ctl.abort()))
  /* … */ })),

// AFTER
commit: (input, { attempt }) =>                                                             // dropped: signal
  TicketApi.use((api) => api.saveTitle(input, { idempotencyKey: attempt.id })),             // the adapter uses tryPromise's signal
subscribe: ({ where }) => Feed.callback<Rows, ElectricDown>((emit) => Effect.gen(function* () {
  const signal = yield* Effect.abortSignal                                                  // existing (Effect 4.0): aborted when the register's scope closes
  const stream = new ShapeStream({ url, params: { table: "tickets", where }, signal })
  /* … */ })),
```

**Added:** nothing. **Dropped:** `signal` from four contexts, and the Runtime's controller per call and per session.

**Where an adapter gets its signal** (verified on Effect 4.0.5 with a fake `fetch`):

| Source | Signal |
| --- | --- |
| `fetch`, one step; an SDK taking a signal; a `catchUp` page | `Effect.tryPromise({ try: (signal) => fetch(url, { signal }) })` |
| `fetch`, then its body in a second step | read the body in the same `tryPromise`, or `Effect.scoped` with one `yield* Effect.abortSignal` for both |
| XHR | `Effect.callback((resume, signal) => …)` with `signal.addEventListener("abort", () => xhr.abort())` |
| a streaming body (NDJSON, an LLM) | `tryPromise`'s signal for the headers; `Stream.fromReadableStream` cancels the body on interrupt |
| SSE, WebSocket, a callback SDK | none: `Feed.callback`'s scoped register closes it with `Effect.addFinalizer` |
| an SDK holding a long-lived stream (Electric's `ShapeStream`) | `yield* Effect.abortSignal` in the register |

**Limits.** An adapter that calls `fetch` in one `tryPromise` and reads the body in a second, with no shared signal,
leaves the download running after an interrupt. That costs bandwidth, not correctness: the ending comes from the
fiber (rule 24). Two reference adapters do exactly this today and must change (section 5).

## 3. F: `resetOn` returning nothing means "not placed"

**What and why.** The queue's preview trait is always placed, so with no preview it runs on `ticketId: ""`. Comments
then guards the sentinel in four guards and three `when`s, and REVIEW M8 is the post that still got through, into
ticket `""` on path `[""]` (`Edit`, `Delete`, `Pin` and `React` have no guard at all). F makes the absence a fact Flow
understands: while `resetOn` returns `null` or `undefined`, the trait has no incarnation and no subject path. The
filling's parts receive `key`, the present reset value, so no part writes `?? ""`. A host state that places the trait
only while previewing was checked and fails: F4 makes the trait `.resumable()`, rule 51 makes its two placements a
`SharedContract` error, and the sentinel stays in the types.

```ts
// BEFORE: queue.machine.ts and comments.trait.ts
preview: {
  input: ({ memory }) => ({ workspaceId: memory.workspaceId, ticketId: memory.previewId ?? "" }),
  resetOn: ({ memory }) => memory.previewId ?? "",                                       // existing: resetOn
},
const noTicket = ({ memory }) => memory.ticketId !== "" || deny("NoTicket");              // user-defined
O.thread.subscribe(ticketKey, { when: ({ memory }) => memory.ticketId !== "" }),          // existing: when, three times
Post: { target: "self", guard: [noTicket, notEmpty, notDuplicate], /* … */ },             // and Resend, MarkRead, LoadOlder

// AFTER
preview: {
  resetOn: ({ memory }) => memory.previewId,                                             // NEW MEANING: null or undefined is "not placed"
  input: ({ memory, key }) => ({ workspaceId: memory.workspaceId, ticketId: key }),      // existing word `key` (rule 9); NEW in a resetOn filling: the present reset value
},
O.thread.subscribe(ticketKey),                                                           // dropped: when
Post: { target: "self", guard: [notEmpty, notDuplicate], /* … */ },                      // dropped: noTicket, its 4 uses and its definition
```

**Added:** one meaning (absent) and `key` in one more filling. **Dropped:** 2 sentinels, `noTicket` and its 4 uses, 3
`when`s, the `""` initial in panels, and bug M8.

**Limits.** `key` is typed as `resetOn`'s return without `null` and `undefined` (scratch spike, `tsc` 7.0.2; a
number is still an error for a writing placement). On an `.each` placement with `resetOn`, `key` stays the copy key
(rule 9), and the parts read the reset value from memory as today. **One behaviour changes:** a trait whose `resetOn`
returns `null` as an ordinary value is no longer placed; it writes `editingId ?? "new"`. No trait in the apps or the
design does this; two prototype cases read an `unknown`-typed value (`conformance/typed/real.ts:251`,
`comments.ts:163`) and need checking. An event a view sends to the unplaced trait is refused as at any inactive
trait (`Unhandled`), and a host raise into it follows rule 9's absent-key rule.

## 4. The merge change list

All anchors are in `workflow/plans/flow/references/explorations/machine-fragments/machine-design.md` as it stands on
2026-11-07 (8,674 lines). Each "Current" phrase occurs exactly once (checked with `grep -cF`). Apply in this order.

### Header and decision log

**W1. Header, after the `Flow.ignore` revision note** (anchor: "sections 3 and 6.", the end of that note). Insert a new paragraph after it:

```text
**Revision (absorb-wiring J, E step 2, F, 2026-11-07).** An entity key may be any value carrying its fields (2.8.8);
the `lookup`, `commit`, `subscribe` and `catchUp` contexts carry no `signal`, and an adapter takes Effect's own (rule
39); a `resetOn` returning `null` or `undefined` means the trait is not placed, and the filling's parts receive `key`,
the present reset value (rule 1). Decided, OD29. Evidence:
[../../proposals/absorb-wiring/absorb-wiring-proposal.md](../../proposals/absorb-wiring/absorb-wiring-proposal.md).
```

**W2. Decision log, after OD28** (anchor: "A catch-all `Flow` key was dropped. (2026-11-07)"). Insert after that line:

```text
- **OD29** The user, 2026-11-07: accepted from the absorb-wiring proposal (revision 3): J, an entity's `patch`,
  `delete`, `fields` and a read's `.byKey` take any value carrying the key's fields (2.8.8; the parameter is the key
  type itself, never a type variable; Flow keeps only the `primaryKey` fields); E step 2, the `lookup`, `commit`,
  `subscribe` and `catchUp` contexts carry no `signal` (rule 39), which overturns proposal-v3's word-table row
  "`signal`: Keep" (S14), and an adapter that reads a body after `fetch` does it in the same `tryPromise` or shares one
  `Effect.abortSignal`; F, a `resetOn` returning `null` or `undefined` means "not placed", and the filling's parts
  receive `key`, the present reset value (rules 1, 9, 48, 51, 60). (2026-11-07)
```

**W3. S14, annotated, not rewritten** (anchor: "The owner delegates the resulting word choices to the main session. (2026-11-01)").
Current: ``The owner delegates the resulting word choices to the main session. (2026-11-01)``
New: ``The owner delegates the resulting word choices to the main session. (2026-11-01) *The word table's "`signal`: Keep" is overturned by OD29: contexts carry no `signal`.*``

### J

**W4. 2.8.8** (anchor: "`.each` spelling (strings, rule 9) is unchanged.").
Current: `` `.each` spelling (strings, rule 9) is unchanged. `` (the start of a line)
New, appended after it as a new paragraph:

```text
**A key from a value carrying its fields** (decided, OD29 J). `Entity.patch`, `Entity.delete`, `Entity.fields` and a
read's `.byKey` take any value carrying the key's fields, or an array of such values, as rule 43's members do:
`Comment.patch(input, { text: input.text })`. The parameter is the key type itself, never a type variable, so a
fresh object literal with a field outside the key is a type error, as are a missing, optional or nullable key field.
Flow keeps only the `primaryKey` fields, so the stored key equals the literal's under `Equal.equals`, and the
predicts recorder records each as that value's field, so rule 34's warning is unchanged. Where the input names the
key differently, write the literal.
```

### E step 2

**W5. Rule 39** (anchor: "which calls services whose Layer is the swap point.").
Current: ``which calls services whose Layer is the swap point.``
New: ``which calls services whose Layer is the swap point. Their contexts carry no `signal` (OD29 E): Flow interrupts the function's fiber (rule 24, Streams T1's `abandon`), and an adapter that needs an `AbortSignal` takes Effect's own, `Effect.tryPromise`'s or `Effect.callback`'s, or one `Effect.abortSignal` under `Effect.scoped` when several steps (a `fetch`, then its body) must share it.``

**W6. 2.7.2, the Cancel row.**
Current: ``| Cancel | the machine's `O.pay.cancel(k?)` action | `Fiber.interrupt` on the commit, which aborts the `AbortSignal` it handed the adapter; the browser drops the request **only if the adapter passed it to `fetch`/XHR** |``
New: ``| Cancel | the machine's `O.pay.cancel(k?)` action | `Fiber.interrupt` on the commit, which aborts the signal Effect handed the adapter (`tryPromise`'s, `callback`'s, or a scoped `Effect.abortSignal`; rule 39); the browser drops the request **only if the adapter passed that signal to `fetch`/XHR**, and the body only if the same signal reaches it |``

**W7. 2.7.3, the Stripe commit, two lines.**
Current: ``    commit: (input, { attempt, signal }) => Effect.gen(function* () {``
New: ``    commit: (input, { attempt }) => Effect.gen(function* () {``
Current: ``      const res = yield* api.confirm(input, { idempotencyKey: attempt.id, signal }).pipe(   // the author puts Flow's id on the wire (rule 19)``
New: ``      const res = yield* api.confirm(input, { idempotencyKey: attempt.id }).pipe(   // the author puts Flow's id on the wire (rule 19); the adapter passes tryPromise's signal to fetch (rule 39)``

**W8. 2.7.3, `saveField`.**
Current: ``  commit: (i, { attempt, signal }) => SettingsApi.use((api) => api.patch(i, { idempotencyKey: attempt.id, signal })),``
New: ``  commit: (i, { attempt }) => SettingsApi.use((api) => api.patch(i, { idempotencyKey: attempt.id })),``

**W9. 2.8.2, `send`, `issuesInProject` and the four commits.**

```text
Current:
const send = (method: "PUT" | "PATCH" | "DELETE" | "POST", path: string, body: unknown, attemptId: string, signal: AbortSignal) =>
  IssuesApi.use((api) => api.send(method, path, body, { idempotencyKey: attemptId, signal })).pipe(Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)))
New:
const send = (method: "PUT" | "PATCH" | "DELETE" | "POST", path: string, body: unknown, attemptId: string) =>
  IssuesApi.use((api) => api.send(method, path, body, { idempotencyKey: attemptId })).pipe(Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)))
```

Current: ``  lookup: (i, { signal }) => Effect.gen(function* () {`` New: ``  lookup: (i) => Effect.gen(function* () {``
Current: ``    const res = yield* (yield* IssuesApi).list(i, { signal }).pipe(`` (phrase) New: ``    const res = yield* (yield* IssuesApi).list(i).pipe(``
In `setLike`, `renameIssue`, `removeIssue` and `createIssue` (the only four occurrences in the file): every
``commit: (i, { attempt, signal }) => Effect.gen(function* () {`` becomes ``commit: (i, { attempt }) => Effect.gen(function* () {``,
and every ``attempt.id, signal)`` becomes ``attempt.id)``.

**W10. 2.9.1, the Cancel row.**
Current: ``| Cancel | `AbortController`: Flow interrupts the commit's fiber, which aborts the `signal` the adapter passed to `fetch` | the contract's function | no |``
New: ``| Cancel | Flow interrupts the commit's fiber, which aborts the signal Effect handed the adapter and it passed to `fetch` (rule 39) | the contract's function | no |``

**W11. 2.11.2, chat's `catchUp`.**
Current: ``  catchUp: ({ roomId }, { from, next, signal }) =>`` New: ``  catchUp: ({ roomId }, { from, next }) =>``
Current: ``    fetchPage(roomId, next ?? from, signal).pipe(Effect.map((p) =>        // user-defined: fetchPage``
New: ``    fetchPage(roomId, next ?? from).pipe(Effect.map((p) =>        // user-defined: fetchPage, which passes tryPromise's signal``

**W12. 2.11.3, the contract shape.**
Current: ``  subscribe: (input, { from, signal }) => Stream<A | Signal, E, R>,   // from: when position is set``
New: ``  subscribe: (input, { from }) => Stream<A | Signal, E, R>,   // from: when position is set``
Current: ``  catchUp?: (input, { from, next, signal }) => Effect<Feed.more | Feed.done | Feed.gone, E, R>,   // requires position``
New: ``  catchUp?: (input, { from, next }) => Effect<Feed.more | Feed.done | Feed.gone, E, R>,   // requires position``

**W13. 2.11.5, the limit-style recipe.**
Current: ``catchUp: ({ roomId }, { from, signal }) => latest50(roomId, signal).pipe(Effect.map((p) =>   // user-defined``
New: ``catchUp: ({ roomId }, { from }) => latest50(roomId).pipe(Effect.map((p) =>   // user-defined``

**W14. Streams T1, `abandon`.**
Current: ``- `abandon`: interrupt the read, aborting `signal`; `buf = []`; `lastRead = none`.``
New: ``- `abandon`: interrupt the read; `buf = []`; `lastRead = none`.``

**W15. 2.11.12.5, LLM tokens.**
Current: ``  commit: (input, { attempt, signal, progress }) => Effect.gen(function* () {``
New: ``  commit: (input, { attempt, progress }) => Effect.gen(function* () {``
Current: ``      try: () => http("/api/ask", { method: "POST", body: JSON.stringify(input), headers: { "Idempotency-Key": attempt.id }, signal }),``
New: ``      try: (signal) => http("/api/ask", { method: "POST", body: JSON.stringify(input), headers: { "Idempotency-Key": attempt.id }, signal }),   // tryPromise's signal; fromReadableStream below cancels the body``

**W16. 2.11.12.6, Upload** (the `signal.addEventListener` line stays; its `signal` is now `callback`'s).
Current: ``  commit: ({ ref, file }, { attempt, signal, progress }) => Effect.callback<Stored, Outcome.Unknown<UploadLost> | Outcome.Failure<TooLarge>>((resume) => {``
New: ``  commit: ({ ref, file }, { attempt, progress }) => Effect.callback<Stored, Outcome.Unknown<UploadLost> | Outcome.Failure<TooLarge>>((resume, signal) => {``

**W17. 2.11.12.8, Ably.**
Current: ``catchUp: ({ name }, { from, next, signal }: { from: Serial | undefined; next: Walk | undefined; signal: AbortSignal }) =>   // annotated: a richer token. user-defined: Walk``
New: ``catchUp: ({ name }, { from, next }: { from: Serial | undefined; next: Walk | undefined }) =>   // annotated: a richer token. user-defined: Walk``
Current: ``  history(name, from, next?.page, signal).pipe(Effect.map((p) => {        // newest first``
New: ``  history(name, from, next?.page).pipe(Effect.map((p) => {        // newest first; history uses tryPromise's signal``

**W18. 2.11.12.8, Electric.** Current (three lines, not adjacent):

```text
  const ctl = new AbortController()
  const stream = new ShapeStream({ url, params: { table: "tickets", where }, signal: ctl.signal })
  yield* Effect.addFinalizer(() => Effect.sync(() => ctl.abort()))
New (the finalizer line is deleted):
  const signal = yield* Effect.abortSignal   // aborted when the register's scope closes
  const stream = new ShapeStream({ url, params: { table: "tickets", where }, signal })
```

**W19. 2.11.12.8, streaming `fetch`.**
Current: ``subscribe: ({ feedId }, { from, signal }) => Stream.unwrap(Effect.gen(function* () {``
New: ``subscribe: ({ feedId }, { from }) => Stream.unwrap(Effect.gen(function* () {``
Current: ``try: () => http(feedUrl(feedId, from), { signal })`` (phrase) New: ``try: (signal) => http(feedUrl(feedId, from), { signal })``

### F

**W20. 2.1, the "Lives" row.** Current (phrase): ``while its node is active (the root: the actor's life)``
New: ``while its node is active and its `resetOn` value is present (the root: the actor's life)``. Re-pad the row.

**W21. Rule 1, the `resetOn` bullet.**
Current: ``   - **`resetOn`** returns a **reset value**, compared with `Equal.equals` as `restartOn` is.``
New:

```text
   - **`resetOn`** returns a **reset value**, compared with `Equal.equals` as `restartOn` is. `null` and `undefined`
     are not reset values (decided, OD29 F): while `resetOn` returns one, the trait is **not placed**: no incarnation,
     its slice `undefined`, no subject part. Becoming absent ends the incarnation as removal does (`whenAbandoned`
     runs); becoming present starts one; a pending reset to absent ends it in its follow-up turn. The filling's parts
     receive `key`, the present reset value, typed as `resetOn`'s return without `null` and `undefined`; on an `.each`
     placement `key` stays the copy key (rule 9). A view's event to an unplaced trait is `Unhandled`, as at any
     inactive trait.
```

**W22. Rule 9, fillings.** Current: ``One filling serves every copy, and each part of it receives `key` and`` (phrase)
New: ``One filling serves every copy (a `resetOn` filling also receives `key`, its reset value, rule 1; under `.each` it is the copy key), and each part of it receives `key` and``

**W23. Rule 12.** Current: ``      - a non-string `resetOn` on a placement that owns a mapped write (rule 48).``
New: ``      - a `resetOn` returning anything but a string, `null` or `undefined` on a placement that owns a mapped write (rule 48).``

**W24. Rule 48.** Current: ``must return a string, so it can be recorded and persisted: a non-string reset value is a``
New: ``must return a string, `null` or `undefined` (absent: not placed, rule 1), so it can be recorded and persisted: any other reset value is a``

**W25. Rule 51, subject path.** Current: ``(that copy's key) and one for each `resetOn` (its reset value), in order``
New: ``(that copy's key) and one for each `resetOn` (its reset value, always present: an absent one places nothing, rule 1), in order``

**W26. Rule 51, restore.** Current: ``the trait is **reset** (its `whenAbandoned` runs), not silently``
New: ``the trait is **reset**, or ended if the re-taken value is absent (its `whenAbandoned` runs either way), not silently``

**W27. Rule 56, `resetOn`.** Current: ``Story walk: "A, B, A adopts A's save".`` New: ``Story walks: "A, B, A adopts A's save" and "A, none, A adopts A's save" (OD29 F).``

**W28. Rule 60, When.** Current: ``the incarnation ends by removal, leaving or reset.``
New: ``the incarnation ends by removal, leaving, reset, or its reset value becoming absent (rule 1).``

**W29. 2.5 step 3, resets.** Current: ``changed trait gets a new incarnation. Raises into it reach the fresh incarnation.``
New: ``changed trait gets a new incarnation, or ends if its value became absent (rule 1). Raises into it reach the fresh incarnation.``

**W30. 2.7.16, fragments typing.** Current: ``a writing placement's `resetOn` returns `string`.``
New: ``a writing placement's `resetOn` returns `string`, `null` or `undefined`, and its filling's `key` is the `string` (OD29 F; scratch spike).``

**W31. 2.9.2, a new row after the `resetOn` row** (anchor: ``| `resetOn` reset (F8) |``). Insert after that row:
``| `resetOn` value becomes absent (OD29 F) | released | runs | held, unplaced | the incarnation with the old value, when it returns (rule 54); with rule 60, released |``

**W32. 2.9.5.** Current: ``a non-string `resetOn` on a writing placement`` New: ``a `resetOn` on a writing placement returning anything but a string, `null` or `undefined` ``

**W33. 3.6, "New, fragments".** Current: ``a string `resetOn` on a writing trait`` New: ``a string `resetOn` on a writing trait (absent: not placed, with `key` in its filling, OD29 F)``

**W34. Section 7, item 20.** Current: ``string-only `resetOn`;`` New: `` `resetOn` returning a string or absent (the `key` type spiked, OD29 F); ``

### Plan amendments (append after C113, in the same table)

**W35.**

```text
| C114 | Machines O1 | A `resetOn` returning `null` or `undefined` means the trait is not placed; becoming absent ends the incarnation (`whenAbandoned` runs, and a key-less `cancel` there releases, rule 60), becoming present starts one; the filling's parts receive `key`, the present reset value (the copy key under `.each`); a writing placement's `resetOn` returns a string, `null` or `undefined` (rules 1, 9, 48, 51; OD29 F) | Amends C54's "any with a string `resetOn`" |
| C115 | EntityDomains O1 | `Entity.patch`, `Entity.delete`, `Entity.fields` and `.byKey` take any value carrying the key's fields, or an array of them; the parameter is the key type, so a fresh literal with an extra field is a type error; Flow keeps only the `primaryKey` fields (2.8.8; OD29 J) | Amends "predicts returns Entity.patch(key, fields) or Entity.delete(key, { version? })" and "Entity.fields(key, fields)" |
| C116 | Operations O1, O7 | Contexts carry no `signal`: Flow interrupts the fiber, and adapters take `Effect.tryPromise`'s or `Effect.callback`'s signal, or a scoped `Effect.abortSignal` (rule 39; OD29 E) | Replaces "lookup(params, { signal }) and commit(params, { signal, attempt, basedOn }) return Effects; subscribe(params, { signal }) returns a Stream." with the same contexts without `signal`, and O7's "Planned release aborts the signal and runs finalizers once" with "Planned release interrupts the fiber and runs finalizers once" |
```

### Hits searched and left unchanged

Searched: `signal`, `abort`, `AbortController`, `resetOn`, `reset value`, `.patch(`, `.delete(`, `byKey`,
`inactive`, `key` in fillings.

- `signal` at 3885, 3891, 3943, 7514, 7700, 7706, 8631 (W43): Stories' `run({ signal })`, already removed.
  At 2.11.4, 4661, 4693, 4847, 4851, 6216–6228, 8662 (S12): `Feed` signals, a different word.
- 2.9.6 and 2.10.18.3 (`fetch("PUT /docs/:id", { …, signal })` behind `DocsApi.put`): the adapter's own signal,
  which under rule 39 is `tryPromise`'s. Still true.
- 1330 ("When Flow aborts the call (a cancel)") and 1851 ("Abort a hung request"): describe interruption, still true.
- OD28's "E step 1, apps stop passing `signal` to ports": a dated record.
- 2.8.2's `Issue.patch({ id: input.id }, …)` and 1982, 3122: literals stay valid under J; rewriting them buys nothing.
- 6447's `listen` mapping, `Ticket.patch({ id: c.id }, c.fields)`: a union, which J requires to stay a literal.
- Rule 34 and rule 43: J makes 2.8.8 match rule 43; rule 34's warning reads the recorder, which records input fields.
- Rule 59 and N3 ("`undefined` while the incarnation is inactive"): an unplaced trait is inactive. Still true.
- 2.9.4's "for `resetOn`, the reset value is that field's value": only present values make paths. Still true.
- 2.10.12's stand-in (`subject` default `""`, `reset(subject)`): a present string; ending is `leave()`. Unchanged.
- Rule 1's restore sentence ("there the reset value is a string and a subject part"): W26 covers the absent case.
- 3.4's `resetOn: ({ memory }) => [memory.appliedSearch, …]` and 6790's `challengeId`: non-writing, never absent.

## 5. Reference-app changes the merge implies (not applied)

**J**
1. `dispatch-desk/features/Comments/comments.domain.ts`: drop `keyOf` and `ticketOf`; pass the input.
2. `dispatch-desk/features/Tickets/technicians/technicians.domain.ts`: drop `techKey`; keep `team(ws, id)`.
3. `dispatch-desk/features/Tickets/ticket.domain.ts`, `features/Attachments/attachments.domain.ts`,
   `features/Roster/roster.domain.ts`, `checkout/features/Cart/cart.domain.ts`, `checkout/features/Refunds/refunds.domain.ts`:
   replace key literals that copy the input's own fields; keep `mergedId`, `from` and `to` literals.

**E step 2** (step 1's app edits are not yet applied either; do both together)
4. Every contract: drop `signal` from `commit`, `lookup`, `subscribe` and `catchUp` contexts in
   `dispatch-desk/features/**/*.contracts.ts` (Assistant, Comments, technicians, feed, ticket, editor `fields`,
   Resolve, Roster, Find, Attachments) and `checkout/features/{Pay,Cart,Refunds}/*.contracts.ts`.
5. Every port: drop `{ signal }` from `*-api.ts` signatures (Assistant, Comments, technicians, ticket, editor
   `details`, Resolve, Roster, Find, Attachments) and from `checkout/adapters/stripe.ts`, `checkout/testing/stripe.fake.ts`.
6. `dispatch-desk/next/http-api.ts:80-93` and `checkout/adapters/shop-api.ts:120-132`: read the body in the same
   `tryPromise` as `fetch`, or share one `Effect.abortSignal` under `Effect.scoped`.
7. `dispatch-desk/features/Tickets/feed/feed.socket.ts`, `features/Presence/presence.channel.ts`,
   `features/Tickets/editor/autosave.trait.ts`, `app/host.ts`, `tools/findings/unproven-values.ts`: replace hand-made
   controllers and `AbortSignal.any` with Effect's signal or a finalizer; then grep for `signal` again.

**F**
8. `dispatch-desk/features/Tickets/queue/queue.machine.ts`: the preview filling's `resetOn` returns `memory.previewId`;
   `input` uses `key`.
9. `dispatch-desk/features/Comments/comments.trait.ts`: drop `noTicket`, its 4 uses and the 3 `when`s;
   `comments.story.ts` and `comments.test.ts`: replace the `""` cases with an unplaced-trait walk ("A, none, A").
10. `dispatch-desk/features/Tickets/panels/panels.definition.ts` and `panels.machine.ts`: replace the `ticketId: ""`
    initial with an absent value and a `resetOn` on it, if its traits are placed per ticket; check
    `testing/desk.fake.ts` and `testing/desk.details.fake.ts` for `""` tickets.

## 5a. Also decided by the user (2026-11-07)

**Optional handler `target` (decision 3 B), an API change to merge.** A handler's `target` may be omitted; omitted
means `"self"`. This accepts what the prototype already does (`packages/flow-state-v3/prototypes/conformance/compile/body.ts:119`,
`readonly target?`) and `FOR-ARPIT.md`'s `IntentReadFailed: {}`; `round-13/api-changes.md` never listed it.

```ts
// before: Machines O1
FileRemoved: { target: "self" },                                   // existing: the explicit ignore
SaveFailed: { target: "self", updateMemory: ({ event }) => ({ error: event.reason }) },
// after
FileRemoved: {},                                                   // target omitted: stays, changes nothing
SaveFailed: { updateMemory: ({ event }) => ({ error: event.reason }) },
```

Stated limit: a forgotten target now stays silently; `flow explain` prints the handler as `→ self`. Merge entries:

| # | Anchor | Current | Replacement |
| --- | --- | --- | --- |
| W36 | MD rule 20, "`{ target: "self" }` is the explicit ignore" | `` `{ target: "self" }` is the explicit ignore `` | `` `{}` (or `{ target: "self" }`; an omitted target means `"self"`) is the explicit ignore `` |
| W37 | MD section 5, append after the last C row | (none) | `\| C123 \| Machines O1 \| A handler's target may be omitted; omitted means "self" (OD29, decision 3 B) \| Replaces "target is required and is this machine's token or "self"" \|` |
| W38 | MD OD29 (W2), append | (W2's text) | "Also (decision 3 B): a handler's `target` may be omitted and means `"self"`, as the prototype already allows." |

**App and Story changes, no design change** (decisions 1, 2, 4, 10, 11), added to section 5's list:
11. Views pass memory as the key: `O.save.get(s, s.memory)` (rule 43), for example `dispatch-desk/features/Tickets/editor/TicketPanel.tsx`'s three key literals.
12. Memory stops mirroring lane state: drop `sending` and `unsure` style fields from memory schemas; guards and views read `O.x.get(s, key).pending` and `.uncertain`.
13. Apps spread shared key Schemas (`TicketKey.fields`) instead of repeating key fields in contract inputs and memory.
14. Apps name policy constants once (`MAX_RESENDS`, written four times today).
15. The `overloaded` Story (design 2.10.18.4): its machine's input gains a `seat` field so its 64 actors stay distinct under identity's fold (OD30). This is the actor-identity proposal's I18, now decided A.

**Rejected ideas kept rejected** (decisions 5-13): a payload taken as is; `saved` derived from the read row; a `held`
guard; read reasons defaulting to the row; dropping the `services` list; shared key Schemas as a Flow feature; app
constants as Flow's; automatic late-only ignores; `idempotencyKey` as an ambient service.

## 6. Dropped and superseded

- **A**, one catch-all `Flow` key for Flow's reasons: dropped by the user; it shortens code and fixes no silent failure.
- **H**, `hold: { resend }`: dropped; a re-send outside any turn, to save about 20 lines.
- **I**, `forget: "dropUnsettled"`: dropped; it renames a value.
- **K**, fragment input lists, Story ids from file names, a default fixture: dropped; each hides a public name or a world.
- **A's rename of `Feed` to `Flow`**: superseded by S16. **Every `retain`** in revision 1: superseded by rule 73 (OD27).
- **C and D** (identity fields, an `identity` selector): moved to [../actor-identity/proposal.md](../actor-identity/proposal.md); D is dropped there (Q7).

## 7. Not verified

- J's and F's types come from scratch spikes against the plan's shapes; the prototype has no typed entity API, and
  the `resetOn` spike did not cover `.each` with `resetOn`.
- The Effect signal probes ran on 4.0.5 with a fake `fetch`, not a browser.
- That an event to an unplaced trait is `Unhandled`: the design states it for absent `.each` keys (rule 9), not for
  inactive instances; W21 states it.
- The two prototype cases that read an `unknown`-typed reset value (section 3).
- No Story or lane-model run covers "A, none, A" yet.
- Line anchors move as other merges land; the quoted phrases were unique on 2026-11-07.
