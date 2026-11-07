# Absorbing wiring: which amendments to keep

**Revision 2 (2026-11-07) replaces revision 1, which is in git at commit `acd37a57`.** Status: **PROPOSED**, except
B, P1, G and E step 1, which the user accepted on 2026-11-07 and which are merged into `machine-design.md` as OD28
(2.7.18, rules 13, 17, 20, 40, 45, 2.8.6, C112, C113). No plan changes because of this file. Evidence is
[absorb-wiring.md](absorb-wiring.md) (the survey; its regex counts give direction, not exact figures), checked against
`dispatch-desk/`, `checkout/`, `machine-design.md` (rules 13–47, 2.7.13, 2.7.14, 2.7.17, 2.11.6, OD1–OD27, S1–S16),
the prototype's `round-13/api-changes.md`, `FOR-ARPIT.md` and `convergence-12/13.md`, and installed Effect 4.0.5.
Item 15 in `open-items.md`.

**How to read it.** Each item has a state:

- **Accepted (user)**: the user said yes; still to be merged.
- **Recommended (coordinator)**: the coordinator advises yes; the user has not answered.
- **Explore**: worth a design round; nothing here is the answer.
- **Dropped**, **Superseded**: kept only so nobody proposes it again.

Code marks: **NEW**, **RENAMED**, existing, user-defined. "Before" is today's design, with rule 73 applied (no `retain`).

## 1. Every item, in one table

| | Item | State | One line |
| --- | --- | --- | --- |
| B | `Flow.ignore`: an ending that needs no reaction | **Accepted (user)** | Section 3 checks it against 2.7.13 and rule 30, cell by cell |
| G | Classify "lost" errors as unknown in one line | **Accepted (user, 2026-11-07)** | Use Effect's own `catchTag([...])`, not a new `Outcome.unknownOn` |
| J | An entity key taken from a value carrying its fields | **Recommended** (type-checked 2026-11-07) | One sentence in 2.8.8; no type puzzle: the parameter is the key type itself |
| A | One catch-all key for Flow's own reasons | **Dropped (user, 2026-11-07)** | It shortens code and fixes no silent failure; reasons stay listed |
| E | No `signal` in ports, then none in contexts | Step 1 **Accepted (user, 2026-11-07)**; step 2 **Recommended (coordinator)** | Step 2 reopens streams' "keep `signal`"; Effect 4.0.5's `Effect.abortSignal` covers the one case Flow's signal served |
| C | Identity fields: the ref carries them | **Explored**; the user answers Q1–Q8 in `../actor-identity/proposal.md` | Recommended there: fold, so an actor is its machine plus its input; a singleton keeps a literal name |
| D | An `identity` selector in the machine body | **Explored**, with C: **not recommended** | Rule 43 already covers keys; D prevents nothing (actor-identity Q7) |
| F | An absent placement instead of `""` | **Recommended (coordinator)** | An absent reset value means "not placed"; a host state is blocked by F4 and keeps the sentinel |
| P1 | An unretained unknown is `Released` to the store | **Accepted (user, 2026-11-07)** | Found while checking B; makes "bare" the all-ignored case |
| H | `hold: { resend }` | **Dropped** | A re-send outside any turn; saves about 20 lines |
| I | `forget: "dropUnsettled"` | **Dropped** | Renames a value, saves nothing |
| K | Fragment input lists, Story ids from file names, default fixture | **Dropped** | Brevity that hides a public name or the world a Story runs in |
| — | A's rename of streams' `Feed` key to `Flow` | **Superseded** | S16 keeps `Feed` |
| — | Every `retain` in v1's examples | **Superseded** | Rule 73, 2.7.17, OD27: a shared actor lives while it is used |

## 2. The filter every item passed or failed

From streams' `cursor` work, which removed a silent loss but added private state that three reviews each found a High in:

1. **Is there a silent failure today, with real evidence?** If not, the item is brevity, and brevity must be free.
2. **Does Flow run new state or behaviour by itself?** A declaration read at build time is cheap. New Runtime
   behaviour needs table cells, Stories and reviews.
3. **Count both sides.** A list on every operation is lines too.
4. **One fact stated twice, or two facts that look alike?** Only the first can be derived.

## 3. B, `Flow.ignore` (Accepted by the user)

**What it is.** A value that can stand wherever an operation's mapping takes one event. It means "no event and no
handler". The author still decides at the mapping, so rule 20's reason ("a person decides for each one") still holds.

```ts
// BEFORE: editor.definition.ts and editor.machine.ts (dispatch desk)
internalEvents: {
  FileRemoved: {},                                   // user-defined: exists only to be ignored
  FileKept: { uploadedBy: Schema.String },
  FileRemoveUnsure: Flow.uncertain({}),              // existing: Flow.uncertain
},
removeFile: AttachmentsDomain.remove.outcomes({      // existing: outcomes
  success: E.FileRemoved,
  failure: { RemoveRefused: E.FileKept.from((e) => ({ uploadedBy: e.uploadedBy })), NotSent: E.FileRemoved },
  unknown: E.FileRemoveUnsure,
}),
on: {
  FileRemoved: { target: "self" },                                       // existing: the explicit ignore
  FileKept: { target: "self", updateMemory: ({ event }) => ({ error: `Only ${event.uploadedBy} can remove that file` }) },
  FileRemoveUnsure: { target: "self", actions: [O.removeFile.cancel] },   // existing: key-less cancel
},

// AFTER
internalEvents: { FileKept: { uploadedBy: Schema.String } },
removeFile: AttachmentsDomain.remove.outcomes({
  success: Flow.ignore,                                                    // NEW: Flow.ignore
  failure: { RemoveRefused: E.FileKept.from((e) => ({ uploadedBy: e.uploadedBy })), NotSent: Flow.ignore },
  unknown: Flow.ignore,                                                    // releases at once, as the cancel did
}),
on: {
  FileKept: { target: "self", updateMemory: ({ event }) => ({ error: `Only ${event.uploadedBy} can remove that file` }) },
},
```

**Added:** one word, `Flow.ignore`; one evidence kind, `Ignored`. **Dropped:** two events, one `Flow.uncertain`
marker, two handlers.

### 3.1 What "ignored" means in the turn

An ignored ending is **admitted with no turn**. It takes its place in the mailbox as any ending does (so lanes still
change in order), applies its cell's lane effect, and publishes as a Runtime step (2.5). No event exists, so no
handler, no late route and no parking. This reuses OD20 F8's rule for an ending admitted in a `Denied` or
`Unhandled` turn: "its lane effect is kept". `Story.ending` and `flow trace` record `ignored` with the channel and
reason. `flow explain` prints `removeFile.unknown → ignored (released)`.

For **unknown**, "ignored" also releases the Attempt, as `cancel` does in `Held`. That is the meaning rule 40 already
gives a bare write ("its unknown is not retained, so it never holds"), applied to one channel or one tag.

### 3.2 The 2.7.13 table, cell by cell

Read "ignored" as defined above. Only rows whose ending is mapped to `Flow.ignore` change. **Unchanged rows:** `retry`,
`idle`, `retryable`, `invoked`, SSR hydration, and every "cannot occur" cell.

**The holding table** (`reject`, `latest`, `serialize`):

| Row, state | Today | With `Flow.ignore` on that channel or tag |
| --- | --- | --- |
| success, failure; `InFlight` | delivered → promote, or `Idle` | ignored → promote, or `Idle`. The same lane effect |
| unknown, interrupt; `InFlight` | delivered → `Held` | ignored, then released (`Released`, with 2.8.6's store row) → promote, or `Idle`. This is today's unknown cell followed by `Held`'s `cancel` cell |
| `commit`; `InFlight` or `Held` | `reject`: `NotSent { Rejected }` delivered; `serialize` past 64: `NotSent { Overloaded }` delivered | ignored; the lane is unchanged |
| `cancel`; waiting, never sent | `NotSent { Cancelled }` delivered → promote | ignored → promote |
| storage refused; never sent | `NotSent { StorageRefused }` delivered → promote | ignored → promote |
| storage refused; a re-send | → `Held`, and the unknown is delivered again with `StorageRefused` | with `StorageRefused: Flow.ignore`: released → promote. Reachable only with a per-tag record, since a re-send needs a hold |
| rebind; `Held` | the hold is delivered once as `unknown { Restored }` | with `Restored: Flow.ignore`: released → promote |
| restore; `InFlight` | acknowledged: `unknown { Restored }` → `Held`; never acknowledged: `NotSent { Restored }` | the same ending, ignored; an ignored `Restored` releases → `Idle` (each `W` entry ends `NotSent { Restored }`, mapped as usual) |
| restore; `Held` | stays `Held`; `unknown { Restored }` delivered once | ignored `Restored`: released → `Idle` |
| an ending with no binding incarnation (dispose, unplaced, rules 44 and 53) | applied by the Runtime, and parked for the identity or path | applied by the Runtime; **not parked**, since there is nothing to deliver |
| Runtime disposal | `NotSent { Disposed }`, and endings that settle before the final capture, saved as pending mapped outcomes | an ignored one is evidence and is not saved |

**The table for `cancel` and `allow`** (`HeldThisTurn`):

| Row, state | Today | With `Flow.ignore` |
| --- | --- | --- |
| unknown, interrupt; `InFlight` | delivered → `HeldThisTurn`, then `Idle` at turn end; with no live actor and a persisted identity, parked as `Held` (parked) | ignored → `Idle` at once: the turn-end cell, with no turn. Never parked |
| restore; `InFlight`, acknowledged | `unknown { Restored }` → `HeldThisTurn` in its delivery turn | ignored → `Idle` |
| success, failure, every `NotSent` | delivered | ignored |

The `Held` (parked) table is never entered for an ignored tag.

### 3.3 The three questions the check had to answer

1. **Is `unknown: Flow.ignore` the same as `cancel` in the unknown's own handler, for a plain write?** For the lane,
   yes: the composition is the same two cells. There are three differences, each stated. (a) Today, if the handler's
   turn is `Denied` or `Unhandled`, its `cancel` is dropped and the lane stays `Held`. An ignore cannot be dropped, so
   it is safer. (b) Today, an unknown that lands with no binding incarnation is parked, and the hold waits for the next
   incarnation's handler. With an ignore, the Runtime releases it when it lands, unseen. This is the same as a bare
   write, and it is declared at the mapping, so it is not principle 3's "quiet release" (OD5, OD6), any more than
   rule 60's release on leave is. (c) The evidence is `Ignored` plus `Released`, not a turn.
2. **For a domain write (rule 30)?** Yes. Store effects are applied at settlement and never depend on routing (rule
   27). So the unknown's effects (live predictions kept until the forced repair, the record queue held until that
   repair settles, the record marked) apply as today. Then the release applies 2.8.6's `Released` row: the record
   queue learns the Attempt is given up, and the mark is kept until a later write's success clears it (rule 32).
   That is exactly what `FileRemoveUnsure`'s `cancel` does today, in the same publication.
3. **Is it the same as `HeldThisTurn` under `cancel` and `allow`?** For the lane, yes: the turn-end cell, with no
   turn. For the store, the design does not say whether `HeldThisTurn`'s turn end tells the store `Released`. Rule 29
   forbids `cancel` on a predicting write, so only an `allow` domain write is affected. P1 (section 6) closes this.

**One case keeps today's behaviour.** If the Runtime does not have the definition loaded (a dormant lazy record,
LazyFeatures), it cannot know the mapping when the ending lands. It parks the raw ending as today, and the ignore
applies at delivery, when OD22 maps parked endings through the current `outcomes`. Until then the lane stays `Held`,
which is safe.

### 3.4 Where it is forbidden

- **Every stream key** (`value`, `pages`, `missed`, `failure`) **and every `listen` entry.** Rule 40 already makes an
  `every` stream and a `listen` entry map. Ignoring `missed` breaks streams' safety rule: a gap must reach the
  consumer, exactly once per interruption (2.11.6). Ignoring `pages` moves the bookmark past data nobody stored
  (rule 71). Ignoring a stream's `failure` leaves a placement with no session that no handler sees, and Flow never
  re-opens one (rule 25). A stream already has the `Feed` key for the reasons nobody reacts to.
- **Nowhere else.** A read's `failure: { X: Flow.ignore }` is allowed because the row shows the error. A write's
  `Restored: Flow.ignore` is allowed, as a bare write is. `flow check` lists every ignored `unknown` as info, beside
  bare writes.

### 3.5 What the merge changes in machine-design.md

| Place | Change |
| --- | --- |
| Rule 13 | A mapping value may also be `Flow.ignore`. "Every `unknown:` target is a `Flow.uncertain` event" gains "or `Flow.ignore`". The prototype's `UnknownNotUncertain` check (D220) must accept it |
| Rule 17 | Its list of evidence-only endings gains "an ending mapped to `Flow.ignore`" |
| Rule 20 | An ignored ending produces no event, so it needs no current, late or adopted handler |
| Rule 40 and 2.7.3 (the "follows from OD5" paragraphs) | "Whether a write holds depends only on bare or not" becomes "on whether its `unknown`, or each tag of it, maps an event". A bare write is the case where every channel is ignored |
| Rule 45 and 2.7.14 case 1 | `unknown: Flow.ignore` counts as mapped. U is the set of events the `unknown` tags map, and ignored tags are not in it |
| OD5 principle 2 | "A sent Attempt's ending is always delivered" gains "or ignored by its declaration, as evidence" |
| 2.7.13 | The cells of section 3.2; the per-tag paragraph's "every target is a `Flow.uncertain` event" as in rule 13 |
| 2.8.6 | `Released`'s store row applies to an ignored unknown (and, with P1, to every unretained one) |
| 2.10.5, 2.10.14 | The ending record carries `ignored`; `flow explain` prints it |

## 4. The items still alive

### G. Classify "lost" errors as unknown in one line (Recommended, revised)

**Why.** 40 of 44 commits pipe the same helper, `unknownWhenLost`. It is written twice in the apps and twice more in
the prototype (`conformance/typed/lab.ts`, `pay.ts`). Effect 4.0.5's `catchTag` already takes a non-empty array of
tags (`Effect.d.ts`, `catchTag`'s first overload). So the helper becomes one line in Effect's own words, and Flow needs
no new word.

```ts
// BEFORE: shared/outcomes.ts (12 lines, written again in cart.contracts.ts)
export const unknownWhenLost = <A, E extends { readonly _tag: string }, R>(write: Effect.Effect<A, E, R>) =>  // user-defined
  write.pipe(Effect.catch((e) => Effect.gen(function* () {
    if (e._tag === "NoResponse" || e._tag === "ServerError") return yield* Outcome.unknown(e);              // existing: Outcome.unknown
    return yield* Effect.fail(e);
  })));

// AFTER: one line, existing words only
export const unknownWhenLost = Effect.catchTag(["NoResponse", "ServerError"], Outcome.unknown);  // existing: Effect.catchTag
// the commit is unchanged
commit: (input, { attempt }) =>
  TicketApi.use((api) => api.saveTitle(input, { idempotencyKey: attempt.id })).pipe(unknownWhenLost),
```

**Added:** nothing. **Dropped:** two helpers of 12 lines each, in the apps. v1's `Outcome.unknownOn` would add a word
for what Effect already spells. The declaration form (`lost: [...]` on the transaction) stays dropped. The one argument
for it is still owed to `revisit.md`: forgetting the pipe makes a 5xx a definite failure, and a retry then sends a new
Attempt, which may duplicate the write. D213 put a contract's services into data for the same reason (Inspection can
print them). If that argument wins later, the declaration is the place for it.

### J. An entity key from a value carrying its fields (Recommended; type-checked 2026-11-07)

**Why.** 11 `Ticket.patch` calls rebuild a key from the input's own fields. Rule 43 already says members "take any
value carrying the key's fields". Saying the same for an entity's `patch`, `delete`, `fields` and a read's `byKey` is
one sentence.

```ts
// BEFORE: comments.domain.ts
const keyOf = (input: { workspaceId: string; ticketId: string; commentId: string }) =>   // user-defined: keyOf
  ({ workspaceId: input.workspaceId, ticketId: input.ticketId, commentId: input.commentId });
edit: write(editComment).one(Comment).predicts(({ input }) => Comment.patch(keyOf(input), { text: input.text })),  // existing
remove: write(removeComment).predicts(({ input }) => [Comment.delete(keyOf(input)),
  Ticket.patch(ticketOf(input), { commentCount: (beneath) => beneath.commentCount - 1 })]),   // user-defined: ticketOf

// AFTER: no new word, no helper
edit: write(editComment).one(Comment).predicts(({ input }) => Comment.patch(input, { text: input.text })),
remove: write(removeComment).predicts(({ input }) => [Comment.delete(input),
  Ticket.patch(input, { commentCount: (beneath) => beneath.commentCount - 1 })]),   // the parent's key, from the same input
```

**The open condition is settled: no type puzzle.** A scratch check (`j-entity-key.ts`, `tsc` 7.0.2,
`exactOptionalPropertyTypes` as in `tsconfig.base.json`, Effect 4.0.5 `Schema.Struct` fields) copies the plan's
shapes (`EntityDomains.plan` O2; the prototype has no typed entity API, `round-13/entities.ts` uses string refs). The
parameter is the key type itself (`{ readonly [k in PK[number]]: Row[k] }`, or an array of it), **not a type variable**.

| Case | Result |
| --- | --- |
| exact key literal (today's form) | passes |
| the contract's input, with extra fields | passes (`patch`, `delete`, `fields`) |
| compound key of three fields (`Comment`), and a parent's key from the child's input (`Ticket` from `editComment`) | passes |
| a missing field (`Comment.patch(saveTitleInput)`) | **error**: "Property 'commentId' is missing" |
| another name (`{ id }` against `ticketId`) | **error**; the same value passes against `Issue`, keyed by `id` |
| an optional field (`ticketId?: string`) | **error**: "optional … but required" (D221) |
| a nullable field (`string \| null`) | **error** |
| literal and template subtypes (`"north" \| "south"`, `` `T-${number}` ``) | passes |
| a fresh literal with an extra field | **error** (TypeScript's excess-property check, kept because the parameter is not generic; it catches `ticketID`) |
| `{ ...input }` | passes (spread members are not excess-checked) |
| an array of values with extras (`input.tickets`) | passes |
| a union carrying the fields on one member only (a feed event) | **error** until narrowed |
| `.byKey(({ input }) => input)` | passes |
| the generic form `<K extends Key>(key: K)` | the literal check is **lost**: the form not to use |

At runtime the change keeps only the `primaryKey` fields. With extras kept, `Equal.equals` on the stored key would
differ from the literal's (`j-runtime.ts`, run on 4.0.5). The predicts recorder (EntityDomains O2: "a position is
one expression of property reads") records `Ticket.patch(input, …)` as `input.workspaceId`, `input.ticketId`, so
2.8.8's `flow check` warning (key fields against the input fields the predicted record's key reads) still works.

**The sentence for 2.8.8:** "`Entity.patch`, `Entity.delete`, `Entity.fields` and a read's `.byKey` take any value
carrying the key's fields, or an array of such values, as rule 43's members do. Flow reads only the `primaryKey`
fields, and the recorder records each as that value's field. A missing, optional or nullable key field is a type
error (D221). A fresh object literal with a field outside the key is a type error too."

**Added:** that sentence. **Dropped:** 11 literals and 3 key helpers (`ticketOf`, `keyOf`, `techKey`). `team(ws, id)`
stays, and so does every literal where the input names the key differently (`mergedId` for `customerId`, `from` and
`to` for `teamId`). The type error says so. This supersedes section 10's "`Entity.patch` accepting extra fields" for J.

### A. One catch-all key for Flow's own reasons (Dropped by the user, 2026-11-07)

**Why.** A read's tag record must list `Defect` and `Interrupted`, and in all 9 read records of the apps both map to
the same event. A write's per-tag `unknown` record must list Flow's reasons where they can occur (`Restored`,
`Interrupted`, `Defect`, `StillUnknown`, `StorageRefused`). One key covers what nobody reacts to differently.

**Correction to v1.** v1 said A removes a silent failure (REVIEW M3, `StorageRefused` left out of two records). It does
not: 2.7.13 makes `flow check` require each Flow reason where it can occur, so M3 is a check error today. The
reference app never ran the check. So A only makes code shorter, and that must be free.

```ts
// BEFORE: editor.definition.ts
ticket: TicketsDomain.ticketById.outcomes({
  value: E.TicketLoaded.from((ticket) => ({ title: ticket.title })),
  failure: { TicketNotFound: E.TicketGone, NoResponse: E.TicketLoadFailed,
             Defect: E.TicketLoadFailed, Interrupted: E.TicketLoadFailed },          // existing: Flow's two (rule 37)
}),

// AFTER
ticket: TicketsDomain.ticketById.outcomes({
  value: E.TicketLoaded.from((ticket) => ({ title: ticket.title })),
  failure: { TicketNotFound: E.TicketGone, NoResponse: E.TicketLoadFailed,
             Flow: E.TicketLoadFailed },                                              // NEW key: Flow
}),
```

**Meaning, proposed.** `Flow` covers each of Flow's reasons the record does not name. A named reason beats it, as on
streams. `Cancelled` (the user's stop) and `Restored` (a reload) are never covered: they stay named wherever they can
occur, because an author does react to them differently (REVIEW M4 was `Restored` mapped by hand to a re-sending
event). `NotSent` stays named too. The author's own tags stay exhaustive, so this is not an `otherwise`.

**Added:** one key and one rule ("a named reason beats `Flow`; `Cancelled`, `Restored` and `NotSent` are never
covered"). **Dropped:** `flow check`'s "where it can occur" requirement for four reasons; 1 line in each of 9 read
records and about 3 in each of 4 write records.

**Q1, the naming (for the user).** Streams keep `Feed` (S16), and `Feed` there already covers `Defect` and
`Interrupted` as well as its own reasons (2.11.6). So:

- **Option a:** `Flow` on reads and writes, `Feed` on streams. Two words for one idea, and the stream's key covers two
  of the same reasons. An author who moves a read to a stream renames the key.
- **Option b:** one word everywhere. Since `Feed` stays (S16), that would mean `Feed` on reads and writes, which names
  the wrong thing.
- **Option c:** no catch-all on reads and writes. Keep listing reasons; `flow check` already catches omissions.

**Recommendation: c, for now.** A only shortens code, and both a and b leave an agent with a naming rule to remember.
Revisit if S16's spelling is ever reopened; S16 itself says "the `Flow` rename … stay[s] in that exploration", so it
deferred the question rather than rejecting it.

### E. No `signal` in ports, then none in contexts

**Why.** Interruption already reaches the request. Effect hands every `tryPromise` and `callback` its own signal, and
the commit's fiber is interrupted on `cancel` (rule 24). `{ signal }` is on 61 lines; 5 hand-made `AbortController`s
exist, and two of them are real bugs (REVIEW M7, S-M2).

```ts
// BEFORE: ticket.contracts.ts and ticket-api.ts
lookup: (key, { signal }) => TicketApi.use((api) => api.load(key, { signal })),            // existing: signal
load: (key: TicketKey, options: { signal: AbortSignal }) => Effect<TicketRow, TicketNotFound | NoResponse>;
Effect.tryPromise({ try: (lifetime) => fetch(url, { signal: AbortSignal.any([options.signal, lifetime]) }), catch: () => new NoResponse() });

// AFTER, step 1 (app code; Flow's context still offers signal, and nothing reads it)
lookup: (key) => TicketApi.use((api) => api.load(key)),
load: (key: TicketKey) => Effect<TicketRow, TicketNotFound | NoResponse>;
Effect.tryPromise({ try: (signal) => fetch(url, { signal }), catch: () => new NoResponse() });  // existing: Effect's signal

// AFTER, step 2 (design): the lookup, commit, subscribe and catchUp contexts lose `signal`
commit: (input, { attempt }) => /* … */                                                       // dropped: signal
```

- **Step 1: Accepted (user).** No design change. **Dropped:** 61 shortened lines, 239 port mentions, 5 controllers.
  **Correction to step 1's after, found here.** `dispatch-desk/next/http-api.ts:80-93` and
  `checkout/adapters/shop-api.ts:120-132` call `fetch` in one `tryPromise` and `response.json()` in a second. Today
  Flow's signal, passed to `fetch`, also aborts the body. With `tryPromise`'s own signal it does not, because that
  signal is spent once `fetch` resolves (probe 1 below). Those two adapters should either read the body inside the
  same `tryPromise` or take one `Effect.abortSignal` per request.
- **Step 2: Recommended (coordinator).** Remove `signal` from the `lookup`, `commit`, `subscribe` and `catchUp`
  contexts. Flow already interrupts the fiber in every case where it would abort its own signal (rule 24, Streams T1's
  `abandon`, Operations O7's planned release). Effect hands each step a signal, and since 4.0.0 it also has
  `Effect.abortSignal` (`Effect.d.ts:14268`, `Effect<AbortSignal, never, Scope>`, aborted when its scope closes). That
  covers the one thing Flow's signal gave for free: one signal across several steps. Keeping both is the trap that
  made REVIEW M7 and S-M2 (`AbortSignal.any` and dummy controllers). The prototype never built `signal`.

**Verified on Effect 4.0.5** (`e-signal-probe.ts`, run with bun 1.4.2; a fake `fetch` whose body takes 200 ms):

| Probe | Result |
| --- | --- |
| 1. `fetch` in one `tryPromise`, body in a second; interrupt during the body | first signal **not** aborted (the gap) |
| 2. `Effect.scoped` + `yield* Effect.abortSignal`, passed to both steps | fetch and body aborted |
| 3. both steps inside one `tryPromise` | aborted |
| 4. `Effect.callback`'s second parameter (XHR) | aborted, `xhr.abort()` runs |
| 5. `Stream.unwrap` + `Effect.abortSignal`, then `Stream.fromReadableStream` | open while streaming; on interrupt the body is cancelled and the signal aborted (`unwrap` excludes `Scope`, `Stream.d.ts:1430`) |
| 6. `Stream.callback`'s register (the shape `Feed.callback` copies) + `Effect.abortSignal` | aborted on interrupt |

**Every real API case, without Flow's signal:**

| Source | Replacement |
| --- | --- |
| `fetch`, one step | `Effect.tryPromise({ try: (signal) => fetch(url, { signal }) })` |
| `fetch` then the body (JSON) | read the body inside the same `tryPromise`, or `Effect.scoped` + `Effect.abortSignal` |
| an SDK taking a signal (Stripe-style `api.confirm(…, { signal })`, OpenAI) | `tryPromise`'s signal |
| XHR (2.11.12.6 Upload) | `Effect.callback((resume, signal) => …)`: `signal.addEventListener("abort", () => xhr.abort())` |
| NDJSON or an LLM body (2.11.12.5, the streaming `fetch` recipe) | `tryPromise`'s signal for the headers; `Stream.fromReadableStream` cancels the body |
| SSE (`EventSource`), WebSocket, a callback SDK (Supabase, Ably, Socket.IO) | `Feed.callback`'s scoped register with `Effect.addFinalizer(() => close())`; they take no signal |
| an SDK that takes a signal for a long-lived stream (Electric's `ShapeStream`) | `const signal = yield* Effect.abortSignal` in the register (it replaces the recipe's hand-made controller and finalizer) |
| a multi-step adapter wanting one signal | `Effect.scoped(Effect.gen(function* () { const signal = yield* Effect.abortSignal; … }))` |
| a `catchUp` page | `tryPromise`'s signal |

```ts
// BEFORE: 2.11.12.8 Electric (the recipe's own controller) and the chat's catchUp
subscribe: ({ where }) => Feed.callback<Rows, ElectricDown>((emit) => Effect.gen(function* () {   // existing: Feed.callback
  const ctl = new AbortController()
  const stream = new ShapeStream({ url, params: { table: "tickets", where }, signal: ctl.signal })
  yield* Effect.addFinalizer(() => Effect.sync(() => ctl.abort()))
  /* … */ })),
catchUp: ({ roomId }, { from, next, signal }) => fetchPage(roomId, next ?? from, signal).pipe(/* … */),  // existing: signal

// AFTER
subscribe: ({ where }) => Feed.callback<Rows, ElectricDown>((emit) => Effect.gen(function* () {
  const signal = yield* Effect.abortSignal                                                  // existing (Effect 4.0): Effect.abortSignal
  const stream = new ShapeStream({ url, params: { table: "tickets", where }, signal })
  /* … */ })),
catchUp: ({ roomId }, { from, next }) => fetchPage(roomId, next ?? from).pipe(/* … */),   // dropped: signal; fetchPage uses tryPromise's
```

**What reopening streams' "`signal`: Keep" costs.** It is one row of proposal-v3's word table ([P], approved with the
proposal as a whole, S16). No Streams table cell depends on it. Only T1's `abandon` wording ("interrupt the read,
aborting `signal`") becomes "interrupt the read". The text edits: 2.11.3's contract (`subscribe`, `catchUp`), the
recipes in 2.11.2, 2.11.5, 2.11.12.5, 2.11.12.6 and 2.11.12.8 (Ably, Electric, streaming `fetch`), 2.7.3's two
commits, 2.8.2's `send` and its five uses, the two "Cancel" table rows (2.7.2, 2.9.1), the prose at 2.9.6 and
2.10.18.3, and `Operations.plan` O1 and O7. **Added:** nothing. **Dropped:** `signal` from four contexts, and the
Runtime's controller per call and session.

**Stated cost.** An author who splits `fetch` and its body into two `tryPromise`s with no shared signal gets an
unaborted download. That costs bandwidth, not correctness: rule 24's ending comes from the fiber. The recipe and the
two adapters above show the one-line fix.

### C. Identity fields (Explore, the user, 2026-11-07)

**Why.** An actor's identity is written twice: as the ref's parts and again as `{ input }` (46 sites). On a first
ensure, `ensureActor(editorRef(T42), { input: T43 })` names T-42 with T-43's memory, and nothing reports it. No real
instance was found, so this is a correctness guard, not a fixed bug.

```ts
// BEFORE: editor.definition.ts, editor.ref.ts, useEditor.ts (rule 73: no retain)
memory: { workspaceId: Flow.input(Schema.String), ticketId: Flow.input(Schema.String), draft: Flow.initial(Schema.String, "") },
export const editorRef = (ticket: TicketKey) =>                                 // user-defined: editorRef, TicketKey
  actorRef(EditorMachine, [ticket.workspaceId, ticket.ticketId], { persist: true });   // existing: actorRef, parts
const editor = useActorByRef(editorRef(ticket), { input: ticket });              // the same two values again

// AFTER, as a sketch for the exploration
memory: { workspaceId: Flow.identity(Schema.String), ticketId: Flow.identity(Schema.String),   // NEW: Flow.identity
          draft: Flow.initial(Schema.String, "") },
export const editorRef = (ticket: TicketKey) => actorRef(EditorMachine, ticket, { persist: true });  // RENAMED arg 2: parts to a value carrying the fields
const editor = useActorByRef(editorRef(ticket));                                  // dropped: input
```

**Why it belongs with rule 73.** Both ask what makes two actors the same one. These questions must be answered
together:

- **Local actors.** 2.7.13 defines a local actor's identity as (machine id, whole input by `Equal.equals`), and lane
  adoption uses it. With identity fields, either local identity becomes those fields (a remount with a different
  `assignee` would then adopt the lanes) or there are two definitions of identity.
- **Releases.** D221 makes an operation's key fields part of its version. Changing a machine's identity fields would
  likewise change every persisted actor id. That is the same problem, and it needs the same upfront rule.
- **Defaults.** An identity field must be required and have no default, as D221 says for key fields; D222's single
  default must refuse one.
- **Uses (rule 73)** count per identity. Inspection's `uses` and `flow trace` would print `editor{workspaceId,ticketId}`.
- **Small open points:** one-field refs (`actorRef(QueueMachine, { workspaceId })` or the string form), and whether a
  trait's input may carry the marker.

**Added:** one word; one argument form changed. **Dropped:** 46 `{ input }` sites, 4 hand-ordered parts arrays.

### D. An `identity` selector (Explore, with C)

**Why.** 13 machine files each write a key helper (`ticketKey`) and pass it to `commit`, `subscribe`, `idle`,
`cancel` and `retryable`. If C declares identity, Flow can hand the machine body that helper.

```ts
// BEFORE: editor.machine.ts
const ticketKey = ({ memory }: { memory: Memory }) => ({ workspaceId: memory.workspaceId, ticketId: memory.ticketId }); // user-defined
const commitDraft = O.save.commit(({ memory }) => ({ ...ticketKey({ memory }), title: memory.draft }));
guard: [canSave, O.save.idle(ticketKey)],

// AFTER: the same calls, with Flow's helper
machine(Editor, ({ S, E, O, identity }) => {                                      // NEW: identity in the machine body
  const commitDraft = O.save.commit(({ memory }) => ({ ...identity({ memory }), title: memory.draft }));
  // guard: [canSave, O.save.idle(identity)],
});
```

**Added:** one name. **Dropped:** 13 helpers, about 45 lines. It prevents nothing. Because it is tagged, summaries can
print `save × identity`, which a closure cannot. `scope` on the operation and name matching stay rejected (v1 D: the
keyless form would mean two things; the commit would stop showing its key; name matching binds by accident).

### F. An absent placement instead of `""` (Recommended, coordinator)

**Why.** The queue's preview trait is always placed (rule 59, REVIEW M11), so it runs with `ticketId: ""`. Comments
then guards that sentinel with `noTicket` (4 guards) and three `when`s, and REVIEW M8 is the post that still got
through (into ticket `""`, path `[""]`). `Edit`, `Delete`, `Pin` and `React` have no guard at all. D221 says "an
absent value is never a key value", but `""` is a value, so D221 does not catch it. `panels.definition.ts` has the
same sentinel (`ticketId: Flow.initial(Schema.String, "")` before the first `ShowTicket`).

**Version S, a host state that places the trait only while previewing.** It does not work:

```ts
// queue.definition.ts: the queue's states are HEALTHY and DEGRADED (two poll schedules), with no parallel regions
states: [
  { HEALTHY: Flow.state({ states: ["CLOSED", { PREVIEWING: Flow.state({ traits: { preview: Comments.resumable() } }) }] }) },  // existing words
  { DEGRADED: Flow.state({ states: ["CLOSED", { PREVIEWING: Flow.state({ traits: { preview: Comments.resumable() } }) }] }) },
],
// queue.machine.ts, under each PREVIEWING
traits: { preview: {
  input: ({ memory }) => ({ workspaceId: memory.workspaceId, ticketId: memory.previewId ?? "" }),   // still `?? ""`: previewId is string | null here too
  resetOn: ({ memory }) => memory.previewId ?? "",                                                  // still needed: A to B stays in PREVIEWING
} },
```

- **F4** allows mapped writes only in a root trait, an `.each` copy or a `.resumable()` trait. Comments maps six
  writes, so the node trait must be `.resumable()`. A plain node trait's path would be `[]` for every ticket.
- **Rule 51** (last bullet): two placements of one writing fragment (under HEALTHY and DEGRADED) are a
  `SharedContract` error. The only way out is to flatten health into memory, which moves the two poll schedules out of
  states.
- **Rule 52:** closing the drawer freezes the trait and ends its thread lookups with `failure { Interrupted }`, parked
  in the slice, so every reopen delivers `ThreadFailed` first.
- **Rule 56** (node): every transition out of PREVIEWING is an `UnresolvedHold` arrival. It passes, because
  `PreviewOpened` is reachable.
- **The sentinel stays in the types**, since nothing narrows `previewId` inside a state. S removes the guards and
  keeps both `?? ""`.

**Version F, an absent reset value means "not placed".**

```ts
// BEFORE: queue.machine.ts, comments.trait.ts
preview: {
  input: ({ memory }) => ({ workspaceId: memory.workspaceId, ticketId: memory.previewId ?? "" }),
  resetOn: ({ memory }) => memory.previewId ?? "",                                     // existing: resetOn
},
memory: { workspaceId: Flow.input(Schema.String), ticketId: Flow.input(Schema.String) /* "" while previewing nothing */ },
const noTicket = ({ memory }) => memory.ticketId !== "" || deny("NoTicket");            // user-defined
O.thread.subscribe(ticketKey, { when: ({ memory }) => memory.ticketId !== "" }),        // existing: when, three times
Post: { target: "self", guard: [noTicket, notEmpty, notDuplicate], /* … */ },           // and Resend, MarkRead, LoadOlder

// AFTER
preview: {
  resetOn: ({ memory }) => memory.previewId,                                           // NEW MEANING: null or undefined is "not placed"
  input: ({ memory, key }) => ({ workspaceId: memory.workspaceId, ticketId: key }),    // existing word `key` (rule 9's copy key), NEW in a resetOn filling: the present reset value
},
memory: { workspaceId: Flow.input(Schema.String), ticketId: Flow.input(Schema.String) },
O.thread.subscribe(ticketKey),                                                         // dropped: when
Post: { target: "self", guard: [notEmpty, notDuplicate], /* … */ },                    // dropped: noTicket, its 4 uses and its definition
```

`key` is typed as `resetOn`'s return without `null` and `undefined`. A scratch check (`f-reset-key.ts`, `tsc` 7.0.2)
passes in either property order, because a writing placement's `resetOn` is already constrained to a string. A
number is still an error. `memory.previewId!` is not needed. Today's `?? ""` form still type-checks, which is how M8
got through.

**F against the rules.**

| Rule | With F |
| --- | --- |
| 51 | An absent reset value is never a subject part: no incarnation and no path, instead of `[""]`. This is D221's sentence, applied to subject parts |
| 56 (`resetOn`) | Unchanged: reachability is vacuous; the documented default guard (`Fragment.O.x.idle` for the current subject) covers "to absent" as it covers "to B". Story walk "A, none, A adopts A's post" |
| 59 | Unchanged: the rows are `undefined` while the trait is inactive. Absent is inactive, so M11's "the trait still lives" is gone |
| 60 | "When: removal, leaving, reset" gains "or its reset value becoming absent". `whenAbandoned` runs then |
| 53, 54 | A lane of path `["A"]` is unplaced while absent, and its endings park for `["A"]`. A's next incarnation adopts them, as after `B` |
| 2.9.4 | A restore whose re-taken value is absent ends the trait (rule 51's "differs" bullet). A recorded path's adoption by key equality is unchanged |
| An event to it | `E.preview.Post` while absent is refused as at an inactive node trait (`Unhandled`). That is the view's mistake, shown by `check()`. **To confirm**: the design states this for absent `.each` keys (rule 9), not for inactive instances |

**The exact design change, if accepted.** Rule 1's `resetOn` bullet (2.4, "returns a **reset value**") adds: "An
absent value (`null` or `undefined`) is not a reset value. While `resetOn` returns one, the trait is not placed.
Becoming absent ends the incarnation, as removal does, and becoming present starts one. The filling's parts receive
`key`, the present reset value." Rule 51's `resetOn` bullet and rule 60's "When" take the rows above. 2.9.5's typing
line: "a writing placement's `resetOn` returns a string, `null` or `undefined`". `Machines.plan`: the same sentence
where `resetOn` is defined.

**Generality.** Every case where a root trait has "a thing, or none" passes the same way: a drawer for the selected
ticket (queue), panels before the first ticket (`panels.definition.ts`), a composer for the selected chat room, a
details pane for the selected map pin, an avatar upload for the signed-in user. **One behaviour changes:** a
non-writing trait whose `resetOn` returns `null` as an ordinary value (say, a "new item" form keyed by
`editingId: null`) is no longer placed. It writes `editingId ?? "new"`. No trait in the apps or the design's examples
returns `null` from `resetOn`, and the prototype writes `?? "same"` where it needs a constant. Two of its cases read
an `unknown`-typed value (`conformance/typed/real.ts:251`, `comments.ts:163`) and would need checking.

**Counted.** F removes 2 sentinels, `noTicket` and its 4 uses, 3 `when`s and M8 (and the unguarded `Edit`, `Delete`,
`Pin` and `React` into ticket `""`), and in panels one `""` initial. It adds one meaning (absent) and `key` in one more
filling. S adds a state level, `.resumable()` and a `SharedContract` restructure, and keeps both sentinels.
**Recommendation: F.** `.each` of at most one was not compared again: it retraces F8, as the first revision noted.

## 5. Dropped and superseded, one line each

- **H, `hold: { resend }`.** A re-send outside any turn would need new 2.7.13 cells and a Story record, and it would
  re-send `Restored` unseen, to save about 20 lines. B already removes the release-only handlers.
- **I, `forget: "dropUnsettled"`.** It renames a value and saves nothing. `beforeunload` stays the app's (`Pay.tsx`
  warns only for two operations).
- **K.** Fragment input lists (a second form of `input`), Story ids from file names (ids are public names in traces),
  and a default fixture (it hides which world a Story runs in).
- **A's rename of `Feed`** (S16) and **`retain`** (OD27) are superseded.

## 6. More simplifications: what passed and what did not

### Proposed

**P1. Every unknown that is not retained is `Released` to the store** (new; found while checking B). Rule 40 says a
bare write's unknown "is not retained", but nothing says what the store hears. Rule 32 clears a mark only when its
Attempt is "resolved or released", so a bare domain write's unknown mark is never cleared, and E18 keeps its record
alive. That is a silent leak in the design as written (correction, review 2: P1 makes the mark clearable; a later write's
success still clears it, rule 32, so E18 keeps the record until then). The same gap exists at `HeldThisTurn`'s turn end for an `allow`
domain write.

```ts
// BEFORE (design text): rule 40, "a bare write's endings are evidence and its unknown is not retained"
// AFTER (design text): "an unknown that is not retained (a bare write, an ignored unknown, HeldThisTurn's turn end)
//                       is released: 2.8.6's Released row applies"
```

**Gain:** one rule where there were two unspoken ones, and a bare write becomes "every channel `Flow.ignore`" with no
separate meaning. **Adds:** no word, no state. It passes every step of the filter.

**App-level, no design change** (step 1 of the order):
- `O.save.get(s, s.memory)` in place of the three long key literals in `TicketPanel.tsx` (rule 43 already allows it).
- Remove the `sending` and `unsure` mirrors from memory schemas; guards and views read the lane (survey section 4).

### Looked at and rejected

| Candidate | Count | Why not |
| --- | --- | --- |
| An omitted `target` means "stay" | 334 `target: "self"` lines (survey) | A forgotten target would stay silently. But see cohesion item 4: the prototype already allows it |
| A payload taken as is: `success: E.Saved` when the payload Schema fits the value | 8 identity mappers, 24 single-field picks, of 160 `.from` | A bare event is payload-free (rule 13). The same spelling would then mean two things, chosen by structural match |
| The editor's `saved` derived from the `ticket` read row | 1 field, 3 writes | Two facts: `saved` is persisted ("what I last saw confirmed"), and the row is live and not persisted. After a reload the row is empty until it loads |
| A `held` guard token beside `idle` | 1 hand-written `.uncertain` guard | One site. It would close one stated `UnresolvedHold` false negative; not worth a word |
| Required handling of read reasons defaulting to the row | 9 records | Rule 37 and prototype D147 chose "required"; A or listing covers it |
| D213's `services: [ShopApi]` beside the commit's `R` | every contract | One fact twice, but types erase at runtime and the boot check needs data. It is type-checked, so it cannot drift |
| Key Schemas repeated across contract input and memory | most contracts | The app can spread `TicketKey.fields` today; not Flow's |
| `MAX_RESENDS = 3` four times; `isAdmin` on 8 handlers | app | App constants and app decisions |
| Late-only ignores (Pay's 8, the editor's 1) | 9 | Rule 20: Flow cannot know which late endings matter |
| `idempotencyKey: attempt.id` as an ambient service | 41 lines | Types already require it |

Prior art checked: Effect's `catchTag` array form (G); TanStack Query's mutation cache (lanes outlive observers, as
OD19 says); XState (`useActorRef`'s cleanup as lifetime, for C with rule 73). None of them has an "ignore this
result" declaration. XState drops events that no transition takes, which is the silent default rule 20 exists to
refuse, so `Flow.ignore` stays explicit.

## 7. Cohesion: how the survivors fit the rest

**1. One word per idea, mostly.** Today "ignore" is spelled four ways: a bare operation (every channel, by omission);
`Flow.ignore` (one channel or tag, at the mapping); `{ target: "self" }` (one arrival of an event, in a handler); and
`{}` (the prototype, see item 4). The first two are now one fact: bare means "all ignored" (P1 makes the meanings
equal). The handler form is a different fact (this arrival, not every arrival), so it stays. An agent must remember
one rule: **ignore at the mapping when no arrival needs the event; ignore in a handler when only some arrivals do.**

**2. Outcomes and channels.** `Flow.ignore` is a value, so it composes with per-tag records:
`unknown: { Cancelled: Flow.ignore, NoResponse: E.SaveUnsure, ... }` releases the user's stop at once. This answers
2.9.5's deferred "release on user cancel" without its own rule. If A is ever taken, `Flow: Flow.ignore` would be legal
and blunt; `flow check` lists it as info.

**3. Streams and `Feed`.** B is forbidden on streams, and streams keep `Feed`. If A is taken (Q1 a), reads and writes
say `Flow` where streams say `Feed`, for overlapping reasons. That is the one place two features would say the same
thing two ways, and it is why section 4 recommends c.

**4. A drift in the prototype, unrelated to this file but found here.** `Machines.plan` says "target is required".
The prototype's `conformance/compile/body.ts:119` makes it optional, an omitted target meaning `"self"`, and
`FOR-ARPIT.md`'s Pay example writes `IntentReadFailed: {}`. `round-13/api-changes.md` does not list it. It should be
logged as an API change or removed. It also bears on the "omitted target" row of section 6.

**5. Lifetime and identity (rule 73).** B changes nothing in lifetime: an ignored unknown leaves no `InFlight` lane, so
it is not a use, and nothing is parked. C and D wait for the identity exploration (section 4).

**6. Stories and Fakes.** Ignored endings appear as `ending … ignored` records, as the prototype already prints
`ending pay unknown Restored att-1-1`. A Story that asserted on a removed event name (`FileRemoved`) asserts on the
record instead. Fakes are unaffected: they produce endings at the wire, and the mapping decides afterwards.

**7. `flow check` and `flow explain`.** Fewer nodes and fewer "unhandled late event" findings. `flow check` gains one
info line (ignored unknowns), and `flow explain` prints `→ ignored`. Rule 45's search loses arrivals for ignored tags.

**8. Persistence.** Ignored endings are never parked, so lane records hold fewer pending outcomes. The lazy-record case
(section 3.3) keeps today's behaviour.

**New rules an agent must remember:** B's forbidden places (streams, `listen`); "bare is all-ignored" (none, once P1
lands); A's exclusions (`Cancelled`, `Restored`, `NotSent`), only if A is taken. G and J add none.

### The editor's save, with the whole set at once

Accepted and recommended items only (B, G revised, E step 1; A left out, per Q1's recommendation c). C, D and F are
not applied.

```ts
// BEFORE
// ticket.contracts.ts
export const saveTitle = transaction({                                          // existing
  id: "DispatchDesk/save-title",
  input: { workspaceId: Schema.String, ticketId: Schema.String, title: Schema.String },
  output: TicketRow,
  key: ["workspaceId", "ticketId"],
  concurrency: "reject",
  services: [TicketApi],                                                        // existing in the prototype (D213, proposed)
  commit: (input, { attempt, signal }) =>                                       // existing: signal
    TicketApi.use((api) => api.saveTitle(input, { idempotencyKey: attempt.id, signal })).pipe(unknownWhenLost),
});
// shared/outcomes.ts: unknownWhenLost, 12 lines (as in G's before)
// editor.definition.ts
internalEvents: {
  Saved: { ticket: TicketRow }, SaveFailed: { reason: Schema.String }, SaveLocked: { lockedBy: Schema.String },
  SaveNotSent: {},
  SaveStopped: Flow.uncertain({}),                                              // user-defined: the user's own stop
  SaveUnsure: Flow.uncertain({}),
},
save: TicketsDomain.saveTitle.outcomes({
  success: E.Saved.from((ticket) => ({ ticket })),
  failure: {
    TitleRejected: E.SaveFailed.from((e) => ({ reason: e.reason })),
    TicketNotFound: E.SaveFailed.from(() => ({ reason: "This ticket no longer exists" })),
    TicketLocked: E.SaveLocked.from((e) => ({ lockedBy: e.lockedBy })),
    NotSent: E.SaveNotSent,                                                     // SAVING handles it for real: kept
  },
  unknown: {
    Cancelled: E.SaveStopped, NoResponse: E.SaveUnsure, ServerError: E.SaveUnsure, Restored: E.SaveUnsure,
    Interrupted: E.SaveUnsure, Defect: E.SaveUnsure, StillUnknown: E.SaveUnsure, StorageRefused: E.SaveUnsure,
  },
}),
// editor.machine.ts, root `on`
SaveNotSent: { target: "self" },                                                // late: kept
SaveStopped: { target: "self", actions: [O.save.cancel] },                      // release the user's stop
SaveUnsure: { target: "self" },                                                 // late hold: kept, Reopen reconciles

// AFTER
// ticket.contracts.ts
export const saveTitle = transaction({
  id: "DispatchDesk/save-title",
  input: { workspaceId: Schema.String, ticketId: Schema.String, title: Schema.String },
  output: TicketRow,
  key: ["workspaceId", "ticketId"],
  concurrency: "reject",
  services: [TicketApi],
  commit: (input, { attempt }) =>                                               // dropped: signal (E step 1)
    TicketApi.use((api) => api.saveTitle(input, { idempotencyKey: attempt.id })).pipe(unknownWhenLost),
});
// shared/outcomes.ts
export const unknownWhenLost = Effect.catchTag(["NoResponse", "ServerError"], Outcome.unknown);  // existing words (G)
// editor.definition.ts
internalEvents: {
  Saved: { ticket: TicketRow }, SaveFailed: { reason: Schema.String }, SaveLocked: { lockedBy: Schema.String },
  SaveNotSent: {},
  SaveUnsure: Flow.uncertain({}),                                               // dropped: SaveStopped
},
save: TicketsDomain.saveTitle.outcomes({
  success: E.Saved.from((ticket) => ({ ticket })),
  failure: {
    TitleRejected: E.SaveFailed.from((e) => ({ reason: e.reason })),
    TicketNotFound: E.SaveFailed.from(() => ({ reason: "This ticket no longer exists" })),
    TicketLocked: E.SaveLocked.from((e) => ({ lockedBy: e.lockedBy })),
    NotSent: E.SaveNotSent,
  },
  unknown: {
    Cancelled: Flow.ignore,                                                     // NEW: Flow.ignore; released at once
    NoResponse: E.SaveUnsure, ServerError: E.SaveUnsure, Restored: E.SaveUnsure,
    Interrupted: E.SaveUnsure, Defect: E.SaveUnsure, StillUnknown: E.SaveUnsure, StorageRefused: E.SaveUnsure,
  },
}),
// editor.machine.ts, root `on`
SaveNotSent: { target: "self" },
SaveUnsure: { target: "self" },                                                 // dropped: the SaveStopped handler
```

**What the save shows.** It shrinks by one event, one marker, one handler and 12 helper lines. A correction to v1:
v1's combined example ignored `NotSent` here, but `SAVING` handles `SaveNotSent` for real (it returns to `EDITING`
with a message), so it must stay an event. The bigger gains are elsewhere: Cart's `QuantitySet`, `LineGone` and
`Removed`, the editor's `removeFile`, and the roster's `Changed`, `EmailSent` and `IndexRebuilt`.

## 8. Simplicity gained, counted honestly

Counts are from the survey and this revision's greps over `dispatch-desk/` and `checkout/` (tests excluded where
noted). They are directions.

| Item | Removes | Adds | Smaller API, or shorter code? |
| --- | --- | --- | --- |
| B | About 27 events declared only to be ignored, and their 27 handlers; 10 to 22 release-only `cancel` handlers (two regexes disagree) and their `Flow.uncertain` events; many of 61 `NotSent` lines | 1 word, 1 evidence kind, about 20 reworded cells, 0 states | **Both.** Graphs lose nodes that say nothing; "bare" stops being a separate meaning |
| G (revised) | 2 helpers in the apps (12 lines each), 2 in the prototype | nothing | Shorter code |
| J | 11 key literals, 4 helpers | 1 sentence | Shorter code |
| A (if taken) | About 9 + 12 lines; one `flow check` requirement for four reasons | 1 key, 1 rule with three exclusions | Shorter code; the API is the same size (one rule swapped for another) |
| E step 1 | 61 lines shortened, 239 port mentions, 5 controllers (2 bugs) | nothing | Shorter code, 2 bugs fixed |
| E step 2 | `signal` from four contexts; the Runtime's controller | nothing | **Smaller API** |
| C (if taken) | 46 `{ input }` sites, 4 parts arrays | 1 word, 1 changed form | Same size; one guard against a mismatched ref |
| D (if taken) | 13 helpers, about 45 lines | 1 name | Shorter code |
| F (if taken) | 5 guards, 2 `when`s, 2 or 3 sentinels; M8 | 1 meaning | Same size; a real bug gone |
| P1 | an unstated case and a mark leak | 1 sentence | **Smaller**: one meaning for "not retained" |

Only B, E step 2 and P1 make the API smaller. The rest make code shorter. Total code shrinks by perhaps 1% of about
25,000 lines. As with streams, the value is what can no longer go wrong.

## 9. Order of work

Each step stands if the next one is refused.

1. **App code, no design change:** E step 1; G's one-liner in both apps; `get(s, s.memory)`; remove the mirrored lane
   fields. Then grep for anything still reading `signal`.
2. **Merge B with P1** into `machine-design.md`: the cells of 3.2, the places of 3.5, P1's sentence in rule 40 and
   2.8.6. Change list first, for the user's yes.
3. **J**, if `Entity.patch`'s types take it in one sentence.
4. **Q1** (A's naming), then A or nothing.
5. **E step 2**, with streams' Q9 reopened in the same pass.
6. **C, then D**, inside the actor-identity exploration with rule 73, D221 and local identity.
7. **F**: compare with a host state, then decide.
8. Log the prototype's optional `target` (cohesion item 4) in `round-13/api-changes.md` or remove it; `revisit.md`
   gets G's `lost` argument, H and K.

## 10. Not verified

- No **after** was type-checked. In particular: `Outcome.unknown` used point-free as `catchTag`'s handler;
  `Entity.patch` accepting extra fields; `Flow.identity` and `identity`'s types; `memory.previewId!`.
- Section 3.2's cells come from reading 2.7.13, rules 27, 30, 32 and 40 and 2.8.6. The executable lane model was not
  run with an ignored channel, and the policy suite has no such case.
- Whether `HeldThisTurn`'s turn end, or a bare unknown, already tells the store `Released` somewhere outside 2.8.6 and
  rules 30 to 32 (P1 assumes it does not).
- The lazy-record case (3.3) assumes the Runtime cannot map an ending without the definition loaded.
- Counts are regex counts; release-only handlers came out as 10 (survey) and 22 (this revision's one-line regex).
- The Effect signal probe ran on 4.0.5 without a real `fetch`.
- `machine-design.md` is being edited by other merges, so rule and line anchors may move.
- No review of revision 2 has run.
