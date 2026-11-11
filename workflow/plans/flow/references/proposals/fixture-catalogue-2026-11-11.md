# Fixture catalogue: a wide net of application shapes (proposed, 2026-11-11)

**Bottom line (proposed):** 26 small fixtures, each a different real application, cover all 35 Flow features listed
below. Each feature is hit by at least 2 shapes and most by 3 to 16, and any two shapes differ in at least 4
features. The weak spots are lazy features (2 shapes) and three features no runtime has yet: context waves, restartOn
and multi-step Schedules, and two tabs sharing one scope. 11 shapes can be built now on the production runtime
and on round-14. Production boots only `pay` and `cells` today, so these 11 take it from one application to
eleven, and from the `reject` column of Table B to all four policies. Each shape module is a production-API
machine plus a user model and a server model of about 20 lines. Seeded usual and stress profiles generate runs
from it, and fast-check shrinks failures into ordinary cases. The same module drives the P8 benchmarks:
a generated script is replayed with no oracles, and the benchmark must do the same work as the conformance run.
Nothing here is decided. Every section is a proposal for the user's audit before anything is built.

**Why now:** about 70 of the suite's 112 cases use Pay (@task.V3.T47). The user wants a wide net of flows,
transitions and network interactions, and wants to check the shapes really differ before building.

**Read first:** @task.V3.T47, @task.V3.T45, @phase.V3.P8, `advisor-answers-2026-11-11.md` Q5 and Q9,
`code:packages/flow-state-v3/conformance/world/network.ts`, `code:packages/flow-state-v3/conformance/port.ts`.

## 1. What the catalogue starts from

Facts from the checkout, with where they were read:

- Production boots two fixtures, `pay` and `cells` (`conformance/adapters/production.ts`, `productionFixtures`).
  Round-14 also boots `form`, `serialize`, `latest`, `cancel`, `keyed`, `held`, `rel`, `issues`, `stamp` and
  `latequeue`. Case counts by fixture: Pay 36 scenario files, Cells 5, all others 1 to 3.
- The production API (`src/core/compiled.ts`) has flat states, writes under `reject`, `latest`, `serialize` and
  `cancel`, keyed operations, `cancel`, `cancelAll`, `retry`, `retryable` and `idle`, resource `lookup`, `Fixed`
  and `Computed` schedule delays with `armOn` and `Flow.entry`, guards with `deny`, `persist` and `Flow.uncertain`.
  It has no traits, `.each`, compound states, `subscribe`, streams, entity domains, `onContext`, `restartOn`,
  keyed schedules or multi-step Schedules.
- Round-14 adds compound states and history, traits, `.each`, `.resumable()`, `subscribe`, feeds and stream
  sessions, and entity predicts (`prototypes/round-14/inc.ts`, `feed.ts`, `entities.ts`). Neither runtime has
  `onContext`, `restartOn` or paging; the not-yet list says the same for round-14 (`conformance/not-yet.ts`, T18 row).
- The fake world (`world/`) holds every request until a case answers it: `Ok`, `Fail`, `Lost`, `LostButLanded`,
  `FailButLanded`, `Never`, `Die`. It also has `answerLate`, `answerAtOnce`, and storage answers
  `ack | refuse | hang | landNoAck`. Pages can hide and show, and a reload is a kill and a new boot. It has no
  offline mode, no server push, no second page and no lazy loader.
- The lifecycle tables (`dsl/lifecycle-rules.ts`) judge write lanes only: Table A (11 rows by 8 Attempt phases),
  Table B (7 head rows by 8 member columns), Table C (11 rows by 9 ending lives). Reads, WriteAhead, Restore and
  most of Actors have no oracle yet (`not-yet.ts`: T9, T10, T11, T12).
- Round-11 typed fixtures are prior art for several shapes: `prototypes/conformance/typed/cart.ts`, `chat.ts`,
  `comments.ts`, `desk.ts`, `feed.ts`, `issues.ts`, `lifetime.ts`, `identity.ts`, `real.ts`.

## 2. Notation

**Feature codes** (the matrix's columns; each from the Plans' outcomes):

| Code | Feature                                   | Code | Feature                                         |
| ---- | ----------------------------------------- | ---- | ----------------------------------------------- |
| rj   | `reject` lane                             | lk   | resource `lookup` (one-off read lane)           |
| lt   | `latest` lane                             | sb   | `subscribe`, staleness, refetch                 |
| se   | `serialize` lane (W up to 64, Overloaded) | op   | optimistic values                               |
| ca   | `cancel` lane (newer commit interrupts)   | en   | entity domains, predicts, repair                |
| ky   | keyed lanes                               | st   | streams (sessions, reconnect, bookmark)         |
| cm   | `cancel` member                           | wa   | write-ahead: acknowledge before send, capture   |
| cA   | `cancelAll` member                        | rl   | restore and reload                              |
| rt   | `retry` member and `retryable`            | up   | release upgrade: versions, shape resets         |
| un   | unknown endings, `Flow.uncertain`         | sr   | storage refusal (refuse, hang, landNoAck)       |
| du   | Duration or Computed schedule, `armOn`    | dp   | disposal: actor, forget, Runtime                |
| ms   | multi-step Schedule (backoff, polling)    | ma   | several actors or identities                    |
| rs   | `restartOn` (debounce)                    | cx   | context providers, `onContext` waves            |
| ks   | keyed schedules                           | gr   | uses, grace, end and return                     |
| gd   | guards and `deny`                         | lr   | late results (owner test, late turns)           |
| cs   | compound states, history, subroutines     | of   | offline span (server unreachable, then back)    |
| fr   | traits, fragments, `whenAbandoned`        | ad   | admission bounds, bursts (1,024, 64 follow-ups) |
| ea   | `.each` copies                            | mt   | two tabs on one scope (Web Lock)                |
|      |                                           | lz   | lazy entries and adoption                       |

**Tiers:** **P** runs on production and round-14 now; **R** runs on round-14 only until production builds the
feature; **N** needs a runtime feature neither has, or a world or Port addition. A shape is built at the tier of its
P subset first. Its R and N parts are added when they can run.

**Cells:** `A[row·phase]`, `B[head·column]` and `C[row·life]` name lifecycle table cells.
`G[phase·perturbation]` names a cell of the advisor's Q9 pair grid: 8 phases by reload, actor disposal, forget,
release, disposal bound and storage refusal. An Invariant marked "(owed Tn)" has no oracle yet. A shape reaches it,
but generated runs judge it only after Tn lands.

**Sketches** use the production API as `conformance/machines/pay.ts` writes it, with two shorthands that expand to
it:

```ts
// tx(id, input, { key, concurrency }) = transaction({ id, input, key, concurrency, services: [Api], commit })
// rd(id, input, { key })              = resource({ id, input, key, services: [Api], staleTime, gcTime, lookup })
// Every commit and lookup calls the shape's own service; the conformance world backs it with world/network.ts.
// `// R14` marks API only round-14 runs; `// planned` marks API neither runtime has (the Plan is cited).
// S is effect's Schema; payload Schemas are shortened where they add nothing.
```

## 3. The catalogue

### S01 Autosave draft (document editor) — P

Models a document draft that saves 800 ms after the last keystroke and survives closing the tab.
**Features:** lt, un, du (re-armed on each edit as a debounce; rs when built), wa (plain-memory coalescing and the
flush on hide), rl, sr, gr, lr, mt (a second tab, N).
**Targets:** WriteLanes I8 (W at most 1), I11, I24; WriteAhead I12, I14 (owed T10); Restore I16, I17 (owed T11);
`B[OnWire·latest]`, `B[Unsent·latest]`, `A[Superseded·Queued]`, `G[OnWire·reload]`, `G[Queued·storage refusal]`.

```ts
const save = tx("Docs/save", { docId: S.String, text: S.String }, { key: ["docId"], concurrency: "latest" })
const Draft = definition({
  id: "Docs/Draft", persist: true, states: ["CLEAN", "DIRTY", "SAVING"],
  events: { Open: { docId: S.String }, Edited: { text: S.String } },
  internalEvents: { Due: {}, Saved: { rev: S.Number }, SaveFailed: {}, SaveUnsure: Flow.uncertain({}) },
  memory: { docId: Flow.initial(S.String, ""), text: Flow.initial(S.String, ""), rev: Flow.initial(S.Number, 0) },
  operations: ({ E }) => ({
    save: save.outcomes({ success: E.Saved, failure: { Conflict: E.SaveFailed, NotSent: E.SaveFailed },
      unknown: E.SaveUnsure }),
  }),
})
const DraftMachine = machine(Draft, ({ S, E, O }) => ({
  default: S.CLEAN,
  on: {
    Open: { updateMemory: ({ event }) => ({ docId: event.docId }) },
    Edited: { target: S.DIRTY, updateMemory: ({ event }) => ({ text: event.text }) },
  },
  states: {
    DIRTY: {
      schedules: { idle: { schedule: "800 millis", send: E.Due, armOn: [Flow.entry, "Edited"] } },
      on: { Due: { target: S.SAVING,
        actions: [O.save.commit(({ memory }) => ({ docId: memory.docId, text: memory.text }))] } },
    },
    SAVING: { on: { Saved: { target: S.CLEAN, updateMemory: ({ event }) => ({ rev: event.rev }) },
      SaveFailed: { target: S.DIRTY }, SaveUnsure: { target: S.DIRTY } } },
  },
}))
```

An edit during SAVING leaves SAVING, so `Saved` arrives late and falls to the owner test (Turn I26).

### S02 Search as you type (typeahead) — P

Models a search box that looks up results 250 ms after typing stops, ignores queries shorter than two letters, and
must never show the results of an older query.
**Features:** du, rs (when built), gd, lk, lr, ad (fast typists send bursts), gr (the box unmounts and remounts).
**Targets:** Reads I8, I9, I11, I20 (owed T12); Turn I20, I21, I23; Actors I10 (owed T9); `G[OnWire·release]`.

```ts
const search = rd("Find/search", { q: S.String }, { key: ["q"] })
const Box = definition({
  id: "Find/Box", persist: false, states: ["IDLE", "TYPING"],
  events: { Typed: { q: S.String }, Picked: { id: S.String } },
  internalEvents: { Due: {}, Results: { ids: S.Array(S.String) }, SearchFailed: {} },
  memory: { q: Flow.initial(S.String, ""), ids: Flow.initial(S.Array(S.String), []) },
  operations: ({ E }) => ({ search: search.outcomes({ success: E.Results,
    failure: { NoResponse: E.SearchFailed, ServerError: E.SearchFailed, Defect: E.SearchFailed,
      Interrupted: E.SearchFailed } }) }),
})
const BoxMachine = machine(Box, ({ S, E, O }) => ({
  default: S.IDLE,
  on: { Typed: { target: S.TYPING, updateMemory: ({ event }) => ({ q: event.q }) },
    Results: { updateMemory: ({ event }) => ({ ids: event.ids }) }, SearchFailed: {} },
  states: {
    TYPING: {
      schedules: { quiet: { schedule: "250 millis", send: E.Due, armOn: [Flow.entry, "Typed"] } },
      on: { Due: [{ guard: [({ memory }) => memory.q.length >= 2 || deny("TooShort")],
        actions: [O.search.lookup(({ memory }) => ({ q: memory.q }))] }, {}],
        Picked: { target: S.IDLE } },
    },
  },
}))
```

### S03 Upload manager (file sync client) — P

Models a list of file uploads, one lane per file. The user can cancel one file or clear the whole list, and an
unknown upload is retried twice before it is given up.
**Features:** rj, ky, cm, cA, rt, un, ea (each upload row is a `.each` copy, R14), lr, dp (the Runtime is disposed
while uploads are on the wire).
**Targets:** WriteLanes I9, I13, I14, I20, I21, I26, I27; Actors I35, I38; `B[OnWire·Cancel]`,
`B[Held·Retry]`, `B[Unsent·CancelAll]`, `A[DisposalStarts·OnWire]`, `G[OnWire·disposal bound]`.

```ts
const upload = tx("Files/upload", { fileId: S.String, bytes: S.Number }, { key: ["fileId"], concurrency: "reject" })
const Uploads = definition({
  id: "Files/Uploads", persist: true, states: ["LIST"],
  events: { Add: { fileId: S.String, bytes: S.Number }, Cancel: { fileId: S.String }, ClearAll: {} },
  internalEvents: { Uploaded: { fileId: S.String }, TooBig: {}, NotSent: { why: S.String },
    Unsure: Flow.uncertain({}) },
  memory: { files: Flow.initial(S.Array(S.String), []) },
  operations: ({ E }) => ({ upload: upload.outcomes({ success: E.Uploaded,
    failure: { TooBig: E.TooBig, NotSent: E.NotSent }, unknown: E.Unsure }) }),
})
const UploadsMachine = machine(Uploads, ({ S, O }) => ({
  default: S.LIST,
  on: {
    Add: { updateMemory: ({ memory, event }) => ({ files: [...memory.files, event.fileId] }),
      actions: [O.upload.commit(({ event }) => event)] },
    Cancel: { actions: [O.upload.cancel(({ event }) => ({ fileId: event.fileId }))] },
    ClearAll: { actions: [O.upload.cancelAll] },
    Unsure: [{ guard: [O.upload.retryable({ times: 2 })], actions: [O.upload.retry] }, {}],
    Uploaded: { updateMemory: ({ memory, event }) => ({ files: memory.files.filter((f) => f !== event.fileId) }) },
    TooBig: {}, NotSent: {},
  },
  states: { LIST: {} },
}))
```

The key-less `retry` in `Unsure` names only that ending's lane (WriteLanes I14).

### S04 Chat thread with two participants (team chat) — P, stream and optimism R14, context N

Models Alice's and Bob's thread actors in one Runtime over one server. Posts are serialized so order holds, a
pending message shows at once, and incoming messages arrive on a stream that may deliver one twice.
**Features:** se, un, rt, op (R14), st (R14, needs the world's push channel), wa, rl (the outbox survives a
reload), ma, cx (the composer reads the thread's participants, planned: Runtime O, context waves), lr.
**Targets:** WriteLanes I8, I11, I15, I26; Restore I5 (owed T11); WriteAhead I5, I15 (owed T10); Actors I19, I21,
I27 (owed T9); `B[OnWire·serialize]`, `C[Parked·Opens]`, `G[Queued·reload]`.

```ts
const post = tx("Chat/post", { threadId: S.String, clientId: S.String, text: S.String },
  { key: ["threadId"], concurrency: "serialize" })
const Thread = definition({
  id: "Chat/Thread", persist: true, states: ["OPEN"],                 // value-named: one identity per user
  events: { Join: { threadId: S.String }, Send: { clientId: S.String, text: S.String } },
  internalEvents: { Posted: { clientId: S.String, seq: S.Number }, PostFailed: {}, PostUnsure: Flow.uncertain({}),
    Arrived: { seq: S.Number, text: S.String } },
  memory: { threadId: Flow.initial(S.String, ""), log: Flow.initial(S.Array(Msg), []),
    pending: Flow.initial(S.Array(S.String), []) },
  operations: ({ E }) => ({
    post: post.outcomes({ success: E.Posted, failure: { NotSent: E.PostFailed }, unknown: E.PostUnsure }),
    messages: messages.outcomes({ value: E.Arrived }),                // R14: stream, delivers "every"
  }),
})
// on: Send → append to pending, O.post.commit(...) with { optimistic } (R14);
//     PostUnsure → [{ guard: [O.post.retryable({ times: 3 })], actions: [O.post.retry] }, {}];
//     Arrived → append unless seq already seen (at-least-once delivery); Posted → move pending to log.
// OPEN: activities: [O.messages.subscribe(({ memory }) => ({ threadId: memory.threadId }))]   // R14
```

### S05 Two tabs on one draft (multi-tab editor) — N

Models the S01 draft opened in two tabs. Tab A owns the scope through the Web Lock, so tab B runs without
persistence, and B's persisted commits end `NotSent { NoPersistence }`.
**Features:** lt, wa, rl, ma (one identity in two Runtimes), mt, dp (tab A closes; B's next Runtime gets the lock).
**Targets:** WriteAhead I2, I19 (owed T10); Actors I34 (owed T9); `G[Unsent·storage refusal]`.
**Needs:** a second page in the world that shares storage and network, a lock primitive, and a Port `Boot` that
names the tab (planned world addition, about 200 lines).

```ts
// The machine is S01's DraftMachine, unchanged: this shape changes the host, not the app.
// world: makeWorld({ pages: 2 }) shares Storage and Network; page.lock(scope) models navigator.locks
// Case: c.boot("B") boots a second Runtime; observations carry the tab
```

### S06 Quote wizard with back and forward (insurance onboarding) — R

Models a multi-step quote in which Back returns to the last sub-step through history. The address step looks up a
postcode, and submitting twice must not send twice.
**Features:** rj, gd, cs, fr (the address step is a trait whose `whenAbandoned` gives up its lookup), lk, wa, rl
(history survives reload), up (release 2 adds a step, so the saved shape resets), lz (the pricing explainer is a
lazy entry, N), lr.
**Targets:** Turn I1, I4, I5, I6, I11, I24 (owed T8 in part); Restore I12, I14, I19 (owed T11);
`B[OnWire·reject]`, `G[OnWire·release]`.

```ts
const quote = tx("Insure/quote", { quoteId: S.String, answers: Answers }, { key: ["quoteId"], concurrency: "reject" })
const postcode = rd("Insure/postcode", { postcode: S.String }, { key: ["postcode"] })
const Quote = definition({
  id: "Insure/Quote", persist: true,
  states: { ABOUT: {}, CAR: { DETAILS: {}, ADDRESS: AddressStep }, REVIEW: {}, SENT: {} },  // R14: compound
  events: { Next: {}, Back: {}, Edit: { field: S.String, value: S.String }, Submit: {} },
  internalEvents: { Quoted: { price: S.Number }, QuoteRefused: { reason: S.String }, QuoteUnsure: Flow.uncertain({}) },
  memory: { answers: Flow.initial(Answers, {}), price: Flow.initial(S.NullOr(S.Number), null) },
})
// ABOUT.on.Next:   { target: S.CAR.history, guard: [complete("about")] }   // deny("Incomplete"); R14: history
// CAR.ADDRESS:     AddressStep places O.postcode.lookup by the typed postcode; a new postcode releases the old
// REVIEW.on.Submit:{ target: S.SENT, actions: [O.quote.commit(...)] }      // a double submit ends NotSent Rejected
// on.Back:         { target: S.previous.history }                          // R14
```

### S07 Polling dashboard (operations dashboard) — R, multi-step Schedule N

Models a dashboard whose panels each poll their metric every 10 s. Polling waits while the tab is hidden, and one
overdue poll runs when the tab comes back.
**Features:** du, ms (planned: `Schedule.spaced`, Machines O), ks (one timer per panel, through `.each`), ea, lk,
gr (hiding ends the uses), rl, of (polls fail during an offline span), lr.
**Targets:** Turn I20, I22, I23, I33, I35 (I33 owed T18, I35 owed T8); Reads I9 (owed T12);
`G[OnWire·release]`.

```ts
const metric = rd("Ops/metric", { panelId: S.String }, { key: ["panelId"] })
const Panel = trait(declaration({                                   // R14: trait, placed per panel with .each
  internalEvents: { Tick: {}, Value: { v: S.Number }, Failed: {} },
  memory: { panelId: Flow.input(S.String), v: Flow.initial(S.NullOr(S.Number), null) },
}), ({ E, O }) => ({
  schedules: { poll: { schedule: "10 seconds", send: E.Tick, armOn: [Flow.entry, "Tick"] } },
  on: { Tick: { actions: [O.metric.lookup(({ memory }) => ({ panelId: memory.panelId }))] },
    Value: { updateMemory: ({ event }) => ({ v: event.v }) }, Failed: {} },
}))
const Board = definition({
  id: "Ops/Board", persist: true, states: ["LIVE"],
  events: { Show: { ids: S.Array(S.String) } },
  memory: { ids: Flow.initial(S.Array(S.String), []) },
  traits: { panels: Panel.each({ of: "ids", max: 24 }) },             // R14: .each
})
```

### S08 Offline outbox that drains (field-service app) — P, multi-step Schedule N

Models job reports submitted with no signal and sent in order once the connection is back. The queue holds at most
64 waiting reports, sending backs off, and the user can discard everything.
**Features:** se, cA, rt, un, ms (Computed doubling delay now; `Schedule.exponential` when built), wa, rl, sr, of,
ad (the 65th report ends `NotSent { Overloaded }`).
**Targets:** WriteLanes I8, I11, I12, I21, I26; Restore I5, I6, I8 (I5 and I8 owed T11); WriteAhead I15
(owed T10); Actors I38; `B[Held·serialize]`, `B[Held·CancelAll]`, `A[Reload·Queued]`, `A[BootSettles·Restoring]`,
`C[Parked·Opens]`, `G[Held·reload]`, `G[Queued·storage refusal]`.

```ts
const submit = tx("Field/submit", { jobId: S.String, report: Report }, { key: [], concurrency: "serialize" })
const Outbox = definition({
  id: "Field/Outbox", persist: true, states: ["SENDING", "BACKOFF"],
  events: { Submit: { jobId: S.String, report: Report }, DiscardAll: {} },
  internalEvents: { Sent: { jobId: S.String }, Refused: {}, NotSent: { why: S.String }, Unsure: Flow.uncertain({}),
    Wake: {} },
  memory: { delayMs: Flow.initial(S.Number, 1000) },
  operations: ({ E }) => ({ submit: submit.outcomes({ success: E.Sent,
    failure: { Invalid: E.Refused, NotSent: E.NotSent }, unknown: E.Unsure }) }),
})
const OutboxMachine = machine(Outbox, ({ S, E, O }) => ({
  default: S.SENDING,
  on: { Submit: { actions: [O.submit.commit(({ event }) => event)] }, DiscardAll: { actions: [O.submit.cancelAll] },
    Unsure: { target: S.BACKOFF, updateMemory: ({ memory }) => ({ delayMs: Math.min(memory.delayMs * 2, 60_000) }) },
    Sent: { target: S.SENDING, updateMemory: () => ({ delayMs: 1000 }) }, Refused: {}, NotSent: {} },
  states: {
    SENDING: {},
    BACKOFF: {
      schedules: { wake: { schedule: ({ memory }) => memory.delayMs, send: E.Wake } },
      on: { Wake: [{ guard: [O.submit.retryable({ times: 10 })], actions: [O.submit.retry] }, { target: S.SENDING }] },
    },
  },
}))
```

### S09 Optimistic like toggle (social feed) — R

Models a like button that flips at once and is corrected if the server disagrees. A second tap before the answer
replaces the first, and an unknown answer keeps the prediction until a repair.
**Features:** lt, ky, cm (undo before the answer), un, op, en, lr.
**Targets:** Reads I15, I16, I17 (owed T12); WriteLanes I8, I24; `B[OnWire·latest]`, `B[Unsent·Cancel]`.
**Prior art:** `prototypes/conformance/typed/issues.ts`.

```ts
const Social = domain("Social", {                                    // R14: entity domain
  post: read(entity({ id: "Post", fields: { liked: S.Boolean, likes: S.Number }, primaryKey: "id", version: "rev" })),
  like: write(tx("Social/like", { id: S.String, liked: S.Boolean }, { key: ["id"], concurrency: "latest" }), {
    predicts: ({ input }) => Entity.patch("Post", input.id,
      (p) => ({ liked: input.liked, likes: p.likes + (input.liked ? 1 : -1) })),
  }),
})
const Feed = definition({
  id: "Social/Feed", persist: false, states: ["READY"],
  events: { Toggle: { id: S.String, liked: S.Boolean }, Undo: { id: S.String } },
  internalEvents: { Liked: {}, LikeFailed: {}, LikeUnsure: Flow.uncertain({}) },
})
// on: Toggle → O.like.commit(({ event }) => event); Undo → O.like.cancel(({ event }) => ({ id: event.id }));
//     LikeUnsure → {} (the prediction stays until the forced repair; at most one refetch per entry)
```

### S10 Rate-limited sync client (repository sync) — P, multi-step Schedule N

Models syncing many repositories against an API that answers 429 with Retry-After. One sync runs per repository,
the client cools down for the server's delay, and it gives up after five strikes.
**Features:** rj, ky (one lane per repository, many at once), du (Computed from `Retry-After`), ms (exponential when
built), gd (`idle(k)` guard and the strike limit), un, ad (a webhook storm).
**Targets:** WriteLanes I8, I13, I14; Turn I21; Actors I20, I22 (owed T9); `B[OnWire·reject]` on many keys at once.

```ts
const sync = tx("Git/sync", { repo: S.String }, { key: ["repo"], concurrency: "reject" })
const Sync = definition({
  id: "Git/Sync", persist: false, states: ["READY", "COOLING"],
  events: { SyncRepo: { repo: S.String } },
  internalEvents: { Synced: { repo: S.String }, Limited: { retryAfterMs: S.Number }, Unsure: Flow.uncertain({}),
    NotSent: { why: S.String }, Cool: {} },
  memory: { waitMs: Flow.initial(S.Number, 0), strikes: Flow.initial(S.Number, 0) },
  operations: ({ E }) => ({ sync: sync.outcomes({ success: E.Synced,
    failure: { RateLimited: E.Limited, NotSent: E.NotSent }, unknown: E.Unsure }) }),
})
const SyncMachine = machine(Sync, ({ S, E, O }) => ({
  default: S.READY,
  on: { Synced: {}, Unsure: {}, NotSent: {},
    Limited: [{ target: S.COOLING, guard: [({ memory }) => memory.strikes < 5 || deny("GiveUp")],
      updateMemory: ({ memory, event }) => ({ strikes: memory.strikes + 1, waitMs: event.retryAfterMs }) },
      { target: S.READY }] },
  states: {
    READY: { on: { SyncRepo: [{ guard: [O.sync.idle(({ event }) => event)],
      actions: [O.sync.commit(({ event }) => event)] }, {}] } },
    COOLING: { schedules: { cool: { schedule: ({ memory }) => memory.waitMs, send: E.Cool } },
      on: { Cool: { target: S.READY } } },
  },
}))
```

### S11 Live ticker (market or scores) — R, needs the world's push channel

Models a watch on one symbol that shows the latest price. It reconnects after drops, resumes from its bookmark
after a reload, and releases the session soon after the user leaves.
**Features:** sb, st, rl (the bookmark persists; the feed reopens from restored input with no replay), of (drops,
then `Flapping` after 8 reconnects), gr (a session is released within 5 s of no use), dp, lr.
**Targets:** Turn I24 (owed T8); Operations stream rules (no Spec yet: the gap is listed in section 8);
`G[OnWire·release]`.
**Prior art:** `prototypes/conformance/typed/feed.ts`, `prototypes/round-14/feed.ts`.

```ts
const quotes = stream({ id: "Mkt/quotes", input: { symbol: S.String }, key: ["symbol"], delivers: "latest",
  open: ({ symbol }) => Feed.multiplex(socket, symbol) })              // R14; reconnect 500 ms doubling, cap 30 s
const Watch = definition({
  id: "Mkt/Watch", persist: true, states: ["WATCHING", "AWAY"],
  events: { Watch: { symbol: S.String }, Away: {}, Back: {} },
  internalEvents: { Quote: { price: S.Number, at: S.Number } },
  memory: { symbol: Flow.initial(S.String, "ACME"), last: Flow.initial(S.NullOr(S.Number), null) },
  operations: ({ E }) => ({ quotes: quotes.outcomes({ value: E.Quote }) }),
})
// WATCHING: activities: [O.quotes.subscribe(({ memory }) => ({ symbol: memory.symbol }))]   // R14
//           on: Quote → last; Watch → new symbol (the old session is released once); Away → AWAY
// AWAY:     on: Back → WATCHING
```

### S12 Long export with progress (video or report export) — P

Models a long export the user can stop, or restart with new settings, which interrupts the running one. Status is
polled every 5 s, and the panel can close while the export runs.
**Features:** ca, cm, un, du, lk, gr (the in-flight lane keeps the actor; past the grace it moves to the Runtime
unbound), dp, lr.
**Targets:** WriteLanes I20, I23, I25; Actors I10, I12, I14 (owed T9); `B[OnWire·cancel]`,
`B[Interrupted·cancel]`, `A[EndUnknown·Interrupted]`, `G[OnWire·actor disposal]`.

```ts
const run = tx("Media/export", { projectId: S.String, preset: S.String }, { key: ["projectId"], concurrency: "cancel" })
const status = rd("Media/status", { projectId: S.String }, { key: ["projectId"] })
const Export = definition({
  id: "Media/Export", persist: true, states: ["IDLE", "RUNNING", "DONE"],
  events: { Start: { projectId: S.String, preset: S.String }, Stop: {} },
  internalEvents: { Exported: { url: S.String }, ExportFailed: {}, ExportUnsure: Flow.uncertain({}), Poll: {},
    Status: { pct: S.Number }, StatusFailed: {} },
  memory: { projectId: Flow.initial(S.String, ""), pct: Flow.initial(S.Number, 0) },
})
const ExportMachine = machine(Export, ({ S, E, O }) => ({
  default: S.IDLE,
  on: { Start: { target: S.RUNNING, updateMemory: ({ event }) => ({ projectId: event.projectId, pct: 0 }),
    actions: [O.run.commit(({ event }) => event)] },                     // a newer Start interrupts the older
    Exported: { target: S.DONE }, ExportFailed: { target: S.IDLE }, ExportUnsure: { target: S.IDLE } },
  states: {
    RUNNING: {
      schedules: { poll: { schedule: "5 seconds", send: E.Poll, armOn: [Flow.entry, "Status"] } },
      on: { Poll: { actions: [O.status.lookup(({ memory }) => ({ projectId: memory.projectId }))] },
        Status: { updateMemory: ({ event }) => ({ pct: event.pct }) }, StatusFailed: {},
        Stop: { target: S.IDLE, actions: [O.run.cancel(({ memory }) => ({ projectId: memory.projectId }))] } },
    },
  },
}))
```

### S13 Session with token refresh (OAuth client) — N

Models a session provider whose API-client consumers each receive one update when the token changes. Refresh is
single-flight, it runs one minute before expiry, and a 401 triggers it.
**Features:** rj, un, du (Computed from `expiresIn`), wa (a durable provider; a non-durable one blocks capture),
rl (a silent baseline at restore), ma, cx.
**Targets:** Actors I27, I28 (owed T9); Turn I28 (owed T18); WriteAhead I9 (owed T10); `B[OnWire·reject]`.
**Needs:** context slots and `onContext` in a runtime (Runtime O, Machines `onContext`).

```ts
const refresh = tx("Auth/refresh", { sessionId: S.String }, { key: [], concurrency: "reject" })
const Session = definition({
  id: "Auth/Session", persist: true, states: ["OUT", "LIVE", "REFRESHING"],
  events: { SignedIn: { token: S.String, expiresInMs: S.Number }, Got401: {} },
  internalEvents: { Refreshed: { token: S.String, expiresInMs: S.Number }, Denied: {}, Unsure: Flow.uncertain({}),
    Soon: {} },
  memory: { token: Flow.initial(S.String, ""), refreshInMs: Flow.initial(S.Number, 0) },
})
// LIVE:       schedules: { soon: { schedule: ({ memory }) => memory.refreshInMs, send: E.Soon } }
//             on: Soon, Got401 → REFRESHING with O.refresh.commit(...)  // a second 401 ends NotSent Rejected
// REFRESHING: on: Refreshed → LIVE; Denied → OUT; Unsure → OUT
const Client = definition({                                          // planned: context slots and onContext
  id: "Api/Client", context: { session: Session }, onContext: { select: ({ context }) => context.session.token,
    event: "TokenChanged" },
})
```

### S14 Shared cart (shop header and cart page) — P, trait and entity R14, context N

Models one cart identity used by the header badge and the cart page at once. Quantity writes are serialized per
line. The checkout reads the total from the cart, and the record is forgotten once the order is placed.
**Features:** se, ky (`cartId` and `sku`), fr (a stepper trait per line, R14), en (R14), wa, rl, up (release 2
adds `currency`), dp (forget after the order), ma, cx (checkout consumes the total, N), gr (two uses; end and
return within and past the grace).
**Targets:** Actors I7, I8, I10, I13, I25, I32, I37 (owed T9 except I32); WriteLanes I8, I13; Restore I1, I12
(owed T11); `B[OnWire·serialize]` on keyed lanes, `G[Queued·forget]`, `G[Held·actor disposal]`.
**Prior art:** `prototypes/conformance/typed/cart.ts`, `identity.ts`.

```ts
const setQty = tx("Shop/setQty", { cartId: S.String, sku: S.String, qty: S.Number },
  { key: ["cartId", "sku"], concurrency: "serialize" })
const Cart = definition({
  id: "Shop/Cart", persist: true, states: ["OPEN", "ORDERED"],         // value-named by cartId
  events: { Load: { cartId: S.String }, Inc: { sku: S.String }, Dec: { sku: S.String }, Ordered: {} },
  internalEvents: { QtySet: { sku: S.String, qty: S.Number }, QtyRefused: { sku: S.String },
    QtyUnsure: Flow.uncertain({}) },
  memory: { cartId: Flow.initial(S.String, ""), lines: Flow.initial(S.Record(S.String, S.Number), {}) },
})
const qty = (d: number) => ({
  updateMemory: ({ memory, event }) => ({ lines: { ...memory.lines,
    [event.sku]: Math.max(0, (memory.lines[event.sku] ?? 0) + d) } }),
  actions: [O.setQty.commit(({ memory, event }) => ({ cartId: memory.cartId, sku: event.sku,
    qty: memory.lines[event.sku] ?? 0 }))],                          // select reads the after memory
})
// OPEN: on: Inc → qty(1); Dec → qty(-1); QtyRefused → re-read; Ordered → ORDERED (the host then forgets)
```

### S15 Spreadsheet rows edited in place (database grid) — R

Models one `.each` copy per visible row, each with its own debounced save keyed by row. Deleting a row while its
save is on the wire releases that lane once, and the late answer must not touch another row.
**Features:** lt, ky, cm (`whenAbandoned` cancel), ks (one blur timer per copy), fr, ea, lr.
**Targets:** Turn I11, I24, I26, I27, I35 (I24 and I35 owed T8); WriteLanes I12, I15, I23; `B[OnWire·Release]`,
`B[Held·Release]`, `C[RecordedLetGo·Delivering]`.
**Prior art:** `prototypes/conformance/typed/desk.ts` (EachWrite, EachReset).

```ts
const saveCell = tx("Grid/save", { rowId: S.String, col: S.String, value: S.String },
  { key: ["rowId"], concurrency: "latest" })
const Row = trait(declaration({                                      // R14: trait under .each
  events: { Typed: { col: S.String, value: S.String }, Blur: {} },
  internalEvents: { Due: {}, Saved: {}, SaveFailed: {}, SaveUnsure: Flow.uncertain({}) },
  memory: { rowId: Flow.input(S.String), col: Flow.initial(S.String, ""), value: Flow.initial(S.String, "") },
}), ({ E, O }) => ({
  schedules: { blur: { schedule: "2 seconds", send: E.Due, armOn: ["Typed"] } },
  on: { Typed: { updateMemory: ({ event }) => event },
    Due: { actions: [O.saveCell.commit(({ memory }) => memory)] },
    Blur: { actions: [O.saveCell.commit(({ memory }) => memory)] },
    Saved: {}, SaveFailed: {}, SaveUnsure: {} },
  whenAbandoned: [O.saveCell.cancel],                                 // leaving releases the row's lane
}))
const Grid = definition({
  id: "Grid/Sheet", persist: true, states: ["VIEW"],
  events: { Rows: { ids: S.Array(S.String) } },
  memory: { rowIds: Flow.initial(S.Array(S.String), []) },
  traits: { rows: Row.each({ of: "rowIds", max: 200 }) },
})
```

### S16 Money transfers (banking app) — P, second tab N

Models many transfers in flight, each keyed by its own id. The app never resends one on its own: after a crash an
unknown transfer waits for the user. A refused acknowledgement or a second tab means it was never sent.
**Features:** rj, ky, rt (user-started only), un, gd, wa (each Attempt is acknowledged before its send, in the
same batch as the turn's capture), rl, sr, dp (forget keeps Held lanes), mt (N).
**Targets:** WriteAhead I11, I15, I17, I19 (owed T10); Restore I6, I8 (I8 owed T11); WriteLanes I3, I6, I7,
I15; Actors I32; `A[Reload·OnWire]`, `A[EndNotSent·Unsent]` (StorageRefused), `G[Unsent·storage refusal]`,
`G[Held·forget]`.

```ts
const transfer = tx("Bank/transfer", { transferId: S.String, iban: S.String, cents: S.Number },
  { key: ["transferId"], concurrency: "reject" })
const Transfers = definition({
  id: "Bank/Transfers", persist: true, states: ["READY"],
  events: { Send: { transferId: S.String, iban: S.String, cents: S.Number }, Resend: { transferId: S.String },
    Abandon: { transferId: S.String } },
  internalEvents: { Done: { transferId: S.String }, Declined: { code: S.String }, NotSent: { why: S.String },
    Unsure: Flow.uncertain({}) },
  memory: { unsure: Flow.initial(S.Array(S.String), []), notice: Flow.initial(S.String, "") },
  operations: ({ E }) => ({ transfer: transfer.outcomes({ success: E.Done,
    failure: { Declined: E.Declined, NotSent: E.NotSent }, unknown: E.Unsure }) }),
})
const TransfersMachine = machine(Transfers, ({ S, O }) => ({
  default: S.READY,
  on: {
    Send: { guard: [({ event }) => event.cents > 0 || deny("Zero")],
      actions: [O.transfer.commit(({ event }) => event)] },
    Resend: [{ guard: [O.transfer.retryable(({ event }) => event, { times: 1 })],
      actions: [O.transfer.retry(({ event }) => event)] }, {}],
    Abandon: { actions: [O.transfer.cancel(({ event }) => event)] },
    Unsure: { updateMemory: ({ memory }) => ({ notice: "Check your statement before sending again." }) },
    NotSent: { updateMemory: ({ event }) => ({ notice: event.why }) },   // StorageRefused, NoPersistence
    Done: {}, Declined: {},
  },
  states: { READY: {} },
}))
```

### S17 Live cursors (multiplayer canvas) — P, peer stream R14

Models my cursor sent as fast as I move it, where only the last position matters, plus one actor per peer fed by a
stream. Bursts reach the admission bounds.
**Features:** lt (W at most 1: a burst supersedes all but the last), st (R14), ma (one actor per peer), lr, ad
(2,000 moves at 0 ms gaps hit the 1,024 bound; `TurnStorm`).
**Targets:** Actors I19, I20, I21, I22, I23 (owed T9); WriteLanes I8, I11; `A[Superseded·Queued]`, `B[OnWire·latest]`.
**Prior art:** `prototypes/conformance/typed/chat.ts` (Presence), `prototypes/conformance/bench/burst.ts`.

```ts
const move = tx("Canvas/move", { x: S.Number, y: S.Number }, { key: [], concurrency: "latest" })
const Me = definition({
  id: "Canvas/Me", persist: false, states: ["ON"],
  events: { Moved: { x: S.Number, y: S.Number } },
  internalEvents: { Acked: {}, Dropped: {} },
  memory: { x: Flow.initial(S.Number, 0), y: Flow.initial(S.Number, 0) },
  operations: ({ E }) => ({ move: move.outcomes({ success: E.Acked, failure: { NotSent: E.Dropped },
    unknown: Flow.ignore }) }),                                        // existing in the Plans; check production
})
// on: Moved → { updateMemory: ({ event }) => event, actions: [O.move.commit(({ memory }) => memory)] }
const Peer = definition({ id: "Canvas/Peer", persist: false, states: ["ON"],   // value-named by peerId
  internalEvents: { Cursor: { x: S.Number, y: S.Number } } })
// ON: activities: [O.cursors.subscribe(({ memory }) => ({ peerId: memory.peerId }))]   // R14: stream "every"
```

### S18 Inbox with infinite scroll (mail client) — R, paging N

Models an inbox list that loads pages as the user scrolls. Opening a message marks it read at once, archiving
removes it at once, and the list repairs itself when the base changes.
**Features:** lt, ky, lk (the message body), sb (stale lists refetch on focus), op, en (list repair, tombstones;
`pagedBy`, planned in EntityDomains O, not in round-14), lr.
**Targets:** Reads I15, I16, I17, I19 (owed T12); EntityDomains O rules (no core Spec); `B[OnWire·latest]`.

```ts
const Mail = domain("Mail", {                                         // R14: domain list and predicts
  inbox: read(entity(Message)).list({ where: { folder: eq("inbox") }, orderBy: ["receivedAt", "id"],
    pagedBy: 50 }),                                                   // planned: pagedBy, entry.more
  markRead: write(tx("Mail/markRead", { id: S.String, read: S.Boolean }, { key: ["id"], concurrency: "latest" }),
    { predicts: ({ input }) => Entity.patch("Message", input.id, () => ({ read: input.read })) }),
  archive: write(tx("Mail/archive", { id: S.String }, { key: ["id"], concurrency: "latest" }),
    { predicts: ({ input }) => Entity.delete("Message", input.id) }),
})
const body = rd("Mail/body", { id: S.String }, { key: ["id"] })
const Inbox = definition({
  id: "Mail/Inbox", persist: false, states: ["LIST", "READING"],
  events: { Open: { id: S.String }, Back: {}, More: {}, Archive: { id: S.String } },
})
// LIST:    activities: [O.inbox.subscribe(...)]; on: Open → READING with O.markRead.commit + O.body.lookup
// READING: on: Back → LIST; Archive → O.archive.commit, then LIST
```

### S19 Lazy settings panel (feature-flagged billing panel) — N

Models a billing panel whose code loads only when first opened. A send before that is refused as `NotAdopted`, a
failed load can be retried, and a saved record waits dormant until adoption.
**Features:** gd, wa, rl (a dormant record restored at adoption, never at ready), lz, gr (pre-attach reads never
adopt), dp.
**Targets:** LazyFeatures O rules (no core Spec); Actors I25 (owed T9); Restore I1 (owed T11).
**Needs:** a lazy loader on the Port's `Boot` that the world can fail and delay (about 60 lines).

```ts
const Billing = definition({
  id: "Settings/Billing", persist: true, states: ["VIEW", "EDIT"],
  events: { Edit: {}, Choose: { plan: S.String }, Cancel: {} },
  memory: { plan: Flow.initial(S.String, "free"), locked: Flow.initial(S.Boolean, false) },
})
// EDIT.on.Choose: { target: S.VIEW, guard: [({ memory }) => !memory.locked || deny("Locked")], updateMemory: ... }
const Settings = app({ id: "Settings", machines: [ShellMachine,
  { id: "Settings/Billing", load: () => import("./billing.ts") }] })          // planned on the Port: lazy entries
// steps: send before adoption → NotAdopted; ensure adopts; the load fails once → EntryLoadFailed, then retries
```

### S20 Music player (streaming app) — R

Models a player in which a new Play on the same device interrupts the previous request. Queue edits are applied in
order, the progress tick runs only while playing, and Resume returns to the last sub-state.
**Features:** ca, se, du, rs (the tick restarts on a new track, planned), gd, cs, lk (track metadata: a new track
releases the old lookup once), gr (ticks wait while hidden), lr.
**Targets:** Turn I4, I5, I6, I23, I24, I34 (owed T8 and T18 in part); WriteLanes I20, I23; Reads I9 (owed T12);
`B[OnWire·cancel]`, `B[OnWire·serialize]`.

```ts
const play = tx("Music/play", { device: S.String, trackId: S.String }, { key: ["device"], concurrency: "cancel" })
const edit = tx("Music/queue", { op: QueueOp }, { key: [], concurrency: "serialize" })
const track = rd("Music/track", { trackId: S.String }, { key: ["trackId"] })
const Player = definition({
  id: "Music/Player", persist: false,
  states: { OFF: {}, ON: { BUFFERING: {}, PLAYING: {}, PAUSED: {} } },  // R14: compound with history
  events: { Play: { trackId: S.String }, Pause: {}, Resume: {}, Skip: {}, Enqueue: { trackId: S.String } },
  internalEvents: { Started: {}, PlayFailed: {}, PlayUnsure: Flow.uncertain({}), Tick: {}, Meta: { title: S.String } },
  memory: { trackId: Flow.initial(S.String, ""), queue: Flow.initial(S.Array(S.String), []),
    pos: Flow.initial(S.Number, 0) },
})
// on.Play:  { target: S.ON.BUFFERING, actions: [O.play.commit(...), O.track.lookup(...)] }
// ON.PLAYING: schedules: { tick: { schedule: "1 second", send: E.Tick, armOn: [Flow.entry, "Tick"] } }
// on.Skip:  { guard: [({ memory }) => memory.queue.length > 0 || deny("QueueEmpty")], ... }
// on.Resume:{ target: S.ON.history }                                 // R14
```

### S21 Sign-in with a one-time code (auth screen) — P flattened, compound R14

Models email, then a code, with a resend cooldown and a lockout after five wrong codes. The actor is local and
never persisted, and React Strict Mode remounts it.
**Features:** rj, un (an unknown verify is never retried), du (a 30 s cooldown; a lockout Computed from tries),
gd, cs (CODE has ENTER and COOLDOWN sub-states, R14; flat for production), gr, dp.
**Targets:** WriteAhead I3 (owed T10); Actors I10, I37 (owed T9); Turn I21, I23; `B[OnWire·reject]`.

```ts
const begin = tx("Auth/begin", { email: S.String }, { key: [], concurrency: "reject" })
const verify = tx("Auth/verify", { email: S.String, code: S.String }, { key: [], concurrency: "reject" })
const SignIn = definition({
  id: "Auth/SignIn", persist: false,                                 // local: never a record or a lane record
  states: ["EMAIL", "CODE", "COOLDOWN", "LOCKED", "DONE"],           // R14: CODE { ENTER, COOLDOWN }
  events: { Email: { email: S.String }, Code: { code: S.String }, Resend: {} },
  internalEvents: { Sent: {}, Verified: {}, Wrong: {}, Unsure: Flow.uncertain({}), Cooled: {}, Unlock: {} },
  memory: { email: Flow.initial(S.String, ""), tries: Flow.initial(S.Number, 0) },
})
// EMAIL:    on: Email → CODE with O.begin.commit(...)
// CODE:     on: Code → [{ guard: [tries < 5 || deny("Locked")], actions: [O.verify.commit(...)] },
//                        { target: S.LOCKED }]
//           on: Resend → COOLDOWN with O.begin.commit(...); Verified → DONE; Wrong → tries + 1; Unsure → EMAIL
// COOLDOWN: schedules: { cd: { schedule: "30 seconds", send: E.Cooled } }; on: Resend → deny("CoolingDown")
// LOCKED:   schedules: { unlock: { schedule: ({ memory }) => 60_000 * memory.tries, send: E.Unlock } }
```

### S22 Kanban drag and drop (task board) — P, prediction R14

Models card moves serialized per board and shown at once. A conflict (409) removes the prediction, Undo all
cancels the moves still waiting, and two boards' answers arrive in either order.
**Features:** se, ky (per board), cA, un, op, en (R14), lr.
**Targets:** WriteLanes I8, I11, I21; Reads I15 (owed T12); `B[OnWire·CancelAll]`, `B[Unsent·CancelAll]`,
`A[EndNotSent·Queued]`.

```ts
const move = tx("Board/move", { boardId: S.String, cardId: S.String, col: S.String, index: S.Number },
  { key: ["boardId"], concurrency: "serialize" })
const Board = definition({
  id: "Board/View", persist: true, states: ["VIEW"],                  // value-named by boardId; two boards open
  events: { Drag: { cardId: S.String, col: S.String, index: S.Number }, UndoAll: {} },
  internalEvents: { Moved: {}, Conflict: {}, NotSent: { why: S.String }, MoveUnsure: Flow.uncertain({}) },
  memory: { boardId: Flow.initial(S.String, ""), toast: Flow.initial(S.String, "") },
  operations: ({ E }) => ({ move: move.outcomes({ success: E.Moved,
    failure: { Conflict: E.Conflict, NotSent: E.NotSent }, unknown: E.MoveUnsure }) }),
})
const BoardMachine = machine(Board, ({ S, O }) => ({
  default: S.VIEW,
  on: { Drag: { actions: [O.move.commit(({ memory, event }) => ({ boardId: memory.boardId, ...event }))] },
    UndoAll: { actions: [O.move.cancelAll] },
    Conflict: { updateMemory: () => ({ toast: "Someone moved this card first." }) },
    Moved: {}, NotSent: {}, MoveUnsure: {} },
  states: { VIEW: {} },
}))
// R14: Card entity with predicts reordering the column; a definite failure drops the prediction, no repair
```

### S23 Thermostat control (smart home) — P, keyed schedules and readings R14

Models a setpoint per device in which a newer setpoint interrupts the older request. A per-device check fires
15 s later, devices go offline, and readings arrive on a stream.
**Features:** ca, ky, ks (one confirm timer per device with a pending setpoint, R14 through `.each`; `keys`
planned, Machines O), un (an interrupted call ends unknown `Cancelled`; a `cancel` row has no `uncertain`), st (R14),
rl, of (a device goes offline: NoResponse, Never), lr (an answer after the interruption).
**Targets:** WriteLanes I3, I20, I23, I25; Turn I35 (owed T8); `B[OnWire·cancel]` on many keys,
`B[Interrupted·cancel]`, `A[EndUnknown·Interrupted]`, `G[Interrupted·reload]`.

```ts
const setpoint = tx("Home/setpoint", { deviceId: S.String, celsius: S.Number },
  { key: ["deviceId"], concurrency: "cancel" })
const Climate = definition({
  id: "Home/Climate", persist: true, states: ["READY"],
  events: { Set: { deviceId: S.String, celsius: S.Number } },
  internalEvents: { Applied: { deviceId: S.String }, Rejected: { deviceId: S.String }, Unsure: Flow.uncertain({}),
    NotSent: { why: S.String }, Reading: { deviceId: S.String, celsius: S.Number } },
  memory: { wanted: Flow.initial(S.Record(S.String, S.Number), {}) },
  operations: ({ E }) => ({ setpoint: setpoint.outcomes({ success: E.Applied,
    failure: { OutOfRange: E.Rejected, NotSent: E.NotSent }, unknown: E.Unsure }) }),
})
const ClimateMachine = machine(Climate, ({ S, O }) => ({
  default: S.READY,
  on: { Set: { updateMemory: ({ memory, event }) => ({ wanted: { ...memory.wanted, [event.deviceId]: event.celsius } }),
    actions: [O.setpoint.commit(({ event }) => event)] },
    Applied: {}, Rejected: {}, Unsure: {}, NotSent: {}, Reading: {} },
  states: { READY: {} },
}))
// R14: Device trait .each over devices: confirm schedule "15 seconds" armOn ["Set"]; readings stream per device
```

### S24 Timed exam (online assessment) — P

Models an exam with a fixed deadline that survives reloads. Answers are queued in order and saved as the candidate
goes, the overdue deadline fires exactly once on return, and the record is forgotten after submission.
**Features:** se, du (a Computed deadline from memory), wa (coalescing, the hide flush), rl, sr, dp (forget), gr
(a hidden tab keeps the deadline waiting).
**Targets:** Turn I21, I22, I23; WriteAhead I12, I13 (owed T10); Restore I14 (owed T11); `A[Reload·OnWire]`,
`G[Queued·reload]`, `G[OnWire·forget]`.

```ts
const answer = tx("Exam/answer", { examId: S.String, q: S.Number, choice: S.String },
  { key: [], concurrency: "serialize" })
const Sitting = definition({
  id: "Exam/Sitting", persist: true, states: ["WAITING", "SITTING", "SUBMITTED"],
  events: { Begin: { examId: S.String, minutes: S.Number }, Answer: { q: S.Number, choice: S.String }, Submit: {} },
  internalEvents: { TimeUp: {}, Saved: {}, Refused: {}, Unsure: Flow.uncertain({}) },
  memory: { examId: Flow.initial(S.String, ""), durationMs: Flow.initial(S.Number, 0),
    answers: Flow.initial(S.Record(S.String, S.String), {}) },
  operations: ({ E }) => ({ answer: answer.outcomes({ success: E.Saved, failure: { NotSent: E.Refused },
    unknown: E.Unsure }) }),
})
const SittingMachine = machine(Sitting, ({ S, E, O }) => ({
  default: S.WAITING,
  on: { Saved: {}, Refused: {}, Unsure: {} },
  states: {
    WAITING: { on: { Begin: { target: S.SITTING,
      updateMemory: ({ event }) => ({ examId: event.examId, durationMs: event.minutes * 60_000 }) } } },
    SITTING: {
      schedules: { end: { schedule: ({ memory }) => memory.durationMs, send: E.TimeUp } },   // dueAt survives reload
      on: { Answer: {
        updateMemory: ({ memory, event }) => ({ answers: { ...memory.answers, [event.q]: event.choice } }),
        actions: [O.answer.commit(({ memory, event }) => ({ examId: memory.examId, ...event }))] },
        TimeUp: { target: S.SUBMITTED }, Submit: { target: S.SUBMITTED } },
    },
    SUBMITTED: {},
  },
}))
```

### S25 Delivery tracking upgraded mid-flight (courier app) — P partial, versions owed

Models release 2 shipping while a release-1 delivery confirmation is still unsure. The old lane's hold ends
`NotSent { OldVersion }`, the saved shape resets, and a dropped field is reported.
**Features:** rt, un, lk, wa, rl, up (`c.upgrade(2)` exists in the Case), dp.
**Targets:** Restore I11, I12, I13, I14, I15 (owed T11); WriteLanes I17; Actors I39 (owed T9);
`A[Reload·Held]`, `G[Held·reload]`.
**Prior art:** `prototypes/conformance/typed/identity.ts` (release 2 and 3).

```ts
const confirm = tx("Ship/confirm", { orderId: S.String }, { key: ["orderId"], concurrency: "reject" })
const track = rd("Ship/track", { orderId: S.String }, { key: ["orderId"] })
const Delivery = definition({
  id: "Ship/Delivery", persist: true, states: ["TRACKING", "CONFIRMING", "DONE"],
  events: { Open: { orderId: S.String }, Refresh: {}, Received: {} },
  internalEvents: { Where: { stop: S.Number }, WhereFailed: {}, Confirmed: {}, NotSent: { why: S.String },
    Unsure: Flow.uncertain({}) },
  memory: { orderId: Flow.initial(S.String, ""), stop: Flow.initial(S.Number, 0) },   // release 2 adds `eta`
})
// TRACKING:   on: Refresh → O.track.lookup(...); Received → CONFIRMING with O.confirm.commit(...)
// CONFIRMING: on: Unsure → [{ guard: [O.confirm.retryable({ times: 2 })], actions: [O.confirm.retry] }, {}]
//             on: Confirmed → DONE; NotSent → TRACKING (OldVersion after the upgrade)
// release 2:  confirm's input gains `signature` and its key encoding changes: the old Held lane is an old-version hold
```

### S26 Fare search fan-out (travel search) — R

Models fares requested from three providers per route. A second search actor asks for the same entries and joins
the requests in flight, stale entries refetch, and entries are collected after the last hold.
**Features:** ky, lk, sb (`subscribe.each` over providers, R14), ma (two actors share entries), lr (a slow
provider answers after the user changed route), ad (40 routes in one burst).
**Targets:** Reads I2, I3, I4, I5, I8, I11 (owed T12); Turn I24 (owed T8).

```ts
const fares = rd("Trip/fares", { provider: S.String, route: S.String }, { key: ["provider", "route"] })
const Search = definition({
  id: "Trip/Search", persist: false, states: ["IDLE", "SEARCHING"],  // two identities: "list" and "compare"
  events: { Search: { route: S.String }, Clear: {} },
  internalEvents: { Fare: { provider: S.String, cents: S.Number }, FareFailed: { provider: S.String } },
  memory: { route: Flow.initial(S.String, ""), providers: Flow.initial(S.Array(S.String), ["a", "b", "c"]),
    best: Flow.initial(S.NullOr(S.Number), null) },
})
// SEARCHING: activities: [O.fares.subscribe.each(({ memory }) =>                // R14: subscribe.each
//              memory.providers.map((provider) => ({ provider, route: memory.route })))]
//            on: Fare → best = min; Search → new route (each old entry released once); Clear → IDLE
```

## 4. Diversity matrix

`x` marks a feature the shape exercises. The last row counts shapes per feature. No shape's set is contained in
another's, and the closest pair (S02 and S20) differs in 4 features. This was checked by a script over the table,
not by eye.

```text
shape          rj lt se ca ky cm cA rt un du ms rs ks gd cs fr ea lk sb op en st wa rl up sr dp ma cx gr lr of ad mt lz
S01 autosave   .  x  .  .  .  .  .  .  x  x  .  x  .  .  .  .  .  .  .  .  .  .  x  x  .  x  .  .  .  x  x  .  .  x  .
S02 typeahead  .  .  .  .  .  .  .  .  .  x  .  x  .  x  .  .  .  x  .  .  .  .  .  .  .  .  .  .  .  x  x  .  x  .  .
S03 uploads    x  .  .  .  x  x  x  x  x  .  .  .  .  .  .  .  x  .  .  .  .  .  .  .  .  .  x  .  .  .  x  .  .  .  .
S04 chat       .  .  x  .  .  .  .  x  x  .  .  .  .  .  .  .  .  .  .  x  .  x  x  x  .  .  .  x  x  .  x  .  .  .  .
S05 two-tabs   .  x  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  x  x  .  .  x  x  .  .  .  .  .  x  .
S06 wizard     x  .  .  .  .  .  .  .  .  .  .  .  .  x  x  x  .  x  .  .  .  .  x  x  x  .  .  .  .  .  x  .  .  .  x
S07 dashboard  .  .  .  .  .  .  .  .  .  x  x  .  x  .  .  .  x  x  .  .  .  .  .  x  .  .  .  .  .  x  x  x  .  .  .
S08 outbox     .  .  x  .  .  .  x  x  x  .  x  .  .  .  .  .  .  .  .  .  .  .  x  x  .  x  .  .  .  .  .  x  x  .  .
S09 like       .  x  .  .  x  x  .  .  x  .  .  .  .  .  .  .  .  .  .  x  x  .  .  .  .  .  .  .  .  .  x  .  .  .  .
S10 rate-limit x  .  .  .  x  .  .  .  x  x  x  .  .  x  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  x  .  .
S11 ticker     .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  x  .  .  x  .  x  .  .  x  .  .  x  x  x  .  .  .
S12 long-job   .  .  .  x  .  x  .  .  x  x  .  .  .  .  .  .  .  x  .  .  .  .  .  .  .  .  x  .  .  x  x  .  .  .  .
S13 session    x  .  .  .  .  .  .  .  x  x  .  .  .  .  .  .  .  .  .  .  .  .  x  x  .  .  .  x  x  .  .  .  .  .  .
S14 cart       .  .  x  .  x  .  .  .  .  .  .  .  .  .  .  x  .  .  .  .  x  .  x  x  x  .  x  x  x  x  .  .  .  .  .
S15 grid-rows  .  x  .  .  x  x  .  .  .  .  .  .  x  .  .  x  x  .  .  .  .  .  .  .  .  .  .  .  .  .  x  .  .  .  .
S16 transfers  x  .  .  .  x  .  .  x  x  .  .  .  .  x  .  .  .  .  .  .  .  .  x  x  .  x  x  .  .  .  .  .  .  x  .
S17 presence   .  x  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  x  .  .  .  .  .  x  .  .  x  .  x  .  .
S18 inbox      .  x  .  .  x  .  .  .  .  .  .  .  .  .  .  .  .  x  x  x  x  .  .  .  .  .  .  .  .  .  x  .  .  .  .
S19 lazy-panel .  .  .  .  .  .  .  .  .  .  .  .  .  x  .  .  .  .  .  .  .  .  x  x  .  .  x  .  .  x  .  .  .  .  x
S20 player     .  .  x  x  .  .  .  .  .  x  .  x  .  x  x  .  .  x  .  .  .  .  .  .  .  .  .  .  .  x  x  .  .  .  .
S21 sign-in    x  .  .  .  .  .  .  .  x  x  .  .  .  x  x  .  .  .  .  .  .  .  .  .  .  .  x  .  .  x  .  .  .  .  .
S22 kanban     .  .  x  .  x  .  x  .  x  .  .  .  .  .  .  .  .  .  .  x  x  .  .  .  .  .  .  .  .  .  x  .  .  .  .
S23 thermostat .  .  .  x  x  .  .  .  x  .  .  .  x  .  .  .  .  .  .  .  .  x  .  x  .  .  .  .  .  .  x  x  .  .  .
S24 exam       .  .  x  .  .  .  .  .  .  x  .  .  .  .  .  .  .  .  .  .  .  .  x  x  .  x  x  .  .  x  .  .  .  .  .
S25 upgrade    .  .  .  .  .  .  .  x  x  .  .  .  .  .  .  .  .  x  .  .  .  .  x  x  x  .  x  .  .  .  .  .  .  .  .
S26 fan-out    .  .  .  .  x  .  .  .  .  .  .  .  .  .  .  .  .  x  x  .  .  .  .  .  .  .  .  x  .  .  x  .  x  .  .
shapes         6  6  6  3  10 4  3  5  13 9  3  3  3  7  3  3  3  8  3  4  4  4  11 14 3  4  10 6  3  10 16 4  5  3  2
```

**Every feature is reached; the thin and hard ones:**

- **lz** (lazy entries): 2 shapes (S06, S19), and both need a lazy loader on the Port. This is the thinnest
  column. Proposed: accept it, since lazy adoption is mostly static and LazyFeatures has no core Spec yet.
- **cx** (context waves), **rs** (restartOn), **ms** (multi-step Schedule): 3 shapes each, but no runtime has the
  feature. Their shapes run the rest of their features now, and these columns stay empty until production builds
  them. Today S01, S02 and S20 use `armOn` re-arming as a debounce, and S08 and S10 use a doubling Computed delay.
- **mt** (two tabs): 3 shapes, all needing a second page in the world and a Port `Boot` per tab.
- **st** and **of**: 4 shapes each. Both need world additions: a push channel for streams, and an offline span in
  `network.ts`.
- **up** on production: Restore and identity versions are owed (T11, T20). S25 runs its upgrade on round-14 first.
- **Duplicated answers** cannot be literal. In the world, a request is answered once (`Effect.callback` resumes
  once). Duplication is modelled as re-sends of one Attempt landing twice at the server (WriteLanes I6: same id;
  the server dedups by idempotency key), as `answerLate` after the caller stopped waiting, and as repeated stream
  frames (stream delivery is at least once).
- **Not in the net at all:** server rendering and hydration, and the React hooks. They are outside the Port's
  scope, and their own Plans test them (ServerRendering, React).

### Features found by the Plan check (proposed, 2026-11-11)

**Bottom line (proposed):** the Plan check (`plan-task-coverage-2026-11-11.md`) found 18 runtime features that
conformance should exercise and that the 35 codes above leave out. The most important is actor identity by value:
`Flow.input` appears in S07 and S15 only as a trait's input, so no shape names a shared actor by
`actorRef(machine, value)`. One new shape (S27) and additions to 19 existing shapes cover them, each code by at
least 2 shapes. Production has none of the 18 today. Each one's tier is set when a runtime builds it, as for the
planned columns above.

**Feature codes added** (`Machines.O1` is @plan.Machines.O1; the row ids are the coverage report's):

| Code | Feature                                                                    | Plan                         | Rows              |
| ---- | -------------------------------------------------------------------------- | ---------------------------- | ----------------- |
| in   | `Flow.input`; shared actor named by value; ConflictingActorRef             | Machines.O1, Runtime.O3      | M08, M15, R13-R16 |
| ci   | computed `Flow.initial`; creation pure and once per incarnation            | Machines.O1                  | M09, M14          |
| pv   | `Flow.private`: kept in records, omitted from outside snapshots            | Machines.O1, Machines.O8     | M10               |
| lc   | `createActor`: local identity by Equal.equals, lanes adopted on remount    | Runtime.O3                   | R17               |
| ck   | `check(snapshot, event)`: Allowed, Denied with reasons, Unhandled          | Machines.O4                  | M58               |
| hs   | `S.X.history` targets and `history.child` (Turn R4 has no Invariant)       | Machines.O2                  | M45               |
| rn   | `raise` and `notify` parts inside one turn                                 | Machines.O2, Machines.O3     | M46, M50          |
| sd   | action `send(ref, event)` and the send table (SendTargetAbsent, restore)   | Runtime.O4                   | R29               |
| sn   | `snapshots` subscription; `getSnapshot` from a record or terminal snapshot | Runtime.O3, Runtime.O4       | R19, R30          |
| dm   | `disarmOn`; schedule metadata (`E.X.from`, `dueAt` in the snapshot)        | Machines.O5                  | M59               |
| fz   | staleTime, gcTime, trailing refetch, focus and reconnect                   | Operations.O1, Operations.O2 | P12, P20-P23, P28 |
| sw   | `setData`, `invalidate`, `clear`, write batches (256 bound)                | Operations.O5                | P16, P44, P45     |
| ph   | `placeholder({ previous, input })` and `contract.get`                      | Operations.O6                | P50               |
| kb   | key bounds and InvalidKey; canonical key text (bigint `"$1n"`)             | Operations.O1                | P14, P15          |
| os   | optimistic stacking; uncertain look after a failed refetch                 | Operations.O5                | P47               |
| pg   | transaction `progress`; `previous: [{ key }]` holds                        | Operations.O1, Operations.O3 | P03, P06          |
| fg   | `forget` and `dispose({ forget: true })`                                   | Runtime.O6, Persistence.O5   | R32, Q20          |
| is   | issues by source: set, cleared only by their own source, none inherited    | Machines.O8                  | M74               |

**Matrix extension.** This block extends the matrix above with the new columns. The original block stays as it
was, and its script check (no shape contained in another) still holds, since adding columns only adds differences.

```text
shape          in ci pv lc ck hs rn sd sn dm fz sw ph kb os pg fg is
S02 typeahead  .  .  .  x  .  .  .  .  .  .  x  .  x  .  .  .  .  .
S03 uploads    .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  x
S04 chat       x  .  .  .  .  .  .  x  x  .  .  .  .  .  .  .  .  .
S06 wizard     .  x  .  .  x  x  x  .  .  .  .  .  .  .  .  .  .  .
S07 dashboard  .  .  .  .  .  .  .  .  .  .  x  .  .  .  .  .  .  .
S09 like       .  .  .  .  .  .  .  .  .  .  .  x  .  .  x  .  .  .
S10 rate-limit .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  x
S11 ticker     .  .  .  .  .  .  .  .  x  .  .  .  .  .  .  .  .  .
S12 long-job   .  .  .  .  .  .  .  .  .  x  .  .  .  .  .  x  .  .
S13 session    .  .  x  .  .  .  .  .  .  .  .  .  .  .  .  .  x  .
S14 cart       x  .  .  .  .  .  .  x  .  .  .  .  .  .  .  .  .  .
S15 grid-rows  .  .  .  .  .  .  .  .  .  .  .  x  .  x  .  .  .  .
S16 transfers  x  .  .  .  x  .  .  .  .  .  .  .  .  .  .  .  .  .
S18 inbox      .  .  .  .  .  .  .  .  .  .  x  x  x  .  .  .  .  .
S20 player     .  .  .  .  .  x  .  .  .  .  .  .  .  .  .  .  .  .
S21 sign-in    .  .  .  x  .  .  x  .  .  .  .  .  .  .  .  .  .  .
S22 kanban     .  .  .  .  .  .  .  .  .  .  .  .  .  .  x  .  .  .
S24 exam       .  x  .  .  x  .  .  .  .  x  .  .  .  .  .  .  .  .
S25 upgrade    .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  x  .  .
S26 fan-out    .  .  .  .  .  .  .  .  .  .  x  .  x  x  .  .  .  .
S27 workspaces x  x  x  x  x  .  .  x  x  .  .  .  .  .  .  .  x  x
shapes         4  3  2  3  4  2  2  3  3  2  4  3  3  2  2  2  2  3
```

What each addition does, in one line per shape:

- **S02** keeps one local typeahead per field (`createActor`), and shows the previous results as a placeholder
  while the next lookup runs. Freshness comes from staleTime.
- **S03** raises an issue on a failed upload and clears it only when that upload is retried.
- **S04** names each thread by value, `actorRef(Thread, { threadId })`. A send to a closed thread exercises the send
  table. The thread list subscribes to `snapshots`.
- **S06** computes the quote's expiry from input, enables Next with `check()`, returns by history, and raises
  `Validate` into the address step.
- **S07** gives the panels a staleTime and a gcTime, and refetches when the page regains focus.
- **S09** stacks two optimistic toggles and invalidates the counts after a success.
- **S10** raises an issue for a 429 and clears it on the next success.
- **S11** reads the ticker through `snapshots`, and through `getSnapshot` from the terminal snapshot after
  disposal.
- **S12** shows the export's `progress` row, and disarms the timeout when the export ends.
- **S13** keeps the token in `Flow.private`, and signs out with `dispose({ forget: true })`.
- **S14** names the cart by `{ userId }`, and the header sends `ItemAdded` to it.
- **S15** writes cell edits by `setData`, and keys rows by a composite key, including a bigint id at the key
  bounds.
- **S16** names the account actor by `{ accountId }`, and checks "can transfer" with `check()`.
- **S18** pages behind a placeholder, invalidates on new mail, refetches with a trailing request, and clears the
  folder on sign-out.
- **S20** resumes playback by `S.ON.history`.
- **S21** shows the code entry as a local actor, and raises `Resend` and notifies `Verified` within one turn.
- **S22** stacks moves optimistically, and keeps the look uncertain after a failed refetch.
- **S24** computes the deadline from input, disarms the timer on submit (its `dueAt` is in the snapshot), and
  checks Submit with `check()`.
- **S25** keeps the old key fingerprint's lanes as `previous: [{ key }]` holds, and retries through
  `O.x.previous[0]`.
- **S26** fans out across keys at the key bounds (InvalidKey is refused before any request), shows placeholders,
  and stops refetching after staleTime.

#### S27 Workspace switcher (multi-account work app) — N

Models a user who switches between workspaces. Each workspace document is a shared actor named by
`{ workspaceId, docId }`. Signing out of one account forgets its scope.
**Features:** in, ci, pv, lc, ck, sd, sn, fg, is; also lt, wa, rl, dp, ma, gr.
**Targets:** Actors I7, I8, I9, I25, I32 (owed T9); Compile I5, I7, I9; Restore I18 (owed T11); Turn I18, I31
(owed T18).
**Needs:** `Flow.input` with `actorRef` by value, `createActor`, `check()`, `snapshots`, `Flow.private` and
`dispose({ forget: true })` in a runtime. Production has none of these (coverage report rows M08, R13 to R19,
M58, R32).

```ts
const save = tx("Work/save", { workspaceId: S.String, docId: S.String, body: S.String },
  { key: ["workspaceId", "docId"], concurrency: "latest" })
const Doc = definition({                                              // planned: Flow.input, Flow.private
  id: "Work/Doc", persist: true, states: ["CLEAN", "DIRTY"],
  events: { Edit: { body: S.String }, Save: {} },
  internalEvents: { Saved: {}, Refused: { reason: S.String }, Unsure: Flow.uncertain({}) },
  memory: {
    workspaceId: Flow.input(S.String), docId: Flow.input(S.String),   // identity: read-only, required
    body: Flow.initial(S.String, ""),
    title: Flow.initial(S.String, ({ docId }) => `Untitled ${docId}`), // planned: computed initial
    draftKey: Flow.private(S.String),           // planned: private; how it takes a start is the Plan's
  },
})
// DIRTY.on.Save: { actions: [O.save.commit(...)] }; an unmapped failure leaves an issue; the next success clears it
// app: const doc = actorRef(DocMachine, { workspaceId: "north", docId: "d-1" })   // planned: value form
//      runtime.ensureActor(doc); a second ref with other context → ConflictingActorRef
//      a local preview: runtime.createActor(PreviewMachine, { input: { docId: "d-1" } })
//      check(snapshot, E.Save()) enables the button; runtime.dispose({ forget: true }) on sign-out
```

## 5. Usual and stress runs

### One fixture module

The module holds the machine and about 20 lines that describe people and the server. Profiles are suite-wide, so
a shape never describes faults.

```ts
// NEW: shape(), drive(), think()   // existing: DraftMachine (S01), Answer (world/network.ts)
export const Autosave = shape({
  machine: DraftMachine,                          // the production public API; the reference is derived from it
  actors: [{ id: "doc-1", setup: [drive("Open", () => ({ docId: "doc-1" }))] }],
  user: {                                         // per leaf: what a person does next, with weights
    CLEAN: [[9, drive("Edited", (r) => ({ text: r.words(1, 6) }), think(150, 400))], [1, hide()]],
    DIRTY: [[8, drive("Edited", (r) => ({ text: r.words(1, 6) }), think(80, 250))], [2, idle(1_000, 20_000)]],
    SAVING: [[5, drive("Edited", (r) => ({ text: r.words(1, 6) }), think(80, 250))], [5, idle(200, 2_000)]],
  },
  server: { "Docs/save": ({ input, landed }) => Answer.Ok({ value: { rev: landed.length } }) },
  property: (end) => end.landedLast("Docs/save")?.input.text === end.memory("doc-1").text,   // optional, plain
})
```

- The `Fixture` reference (events, states, handlers, rows) is derived from the machine's `Compiled` data, not
  written by hand, as T47 asks. `fixtures/rows.test.ts` stays as the change detector for the hand fixtures.
- `property` is optional: zero to two plain functions over the end state, as Testing O6's properties are. Generated
  runs carry no case expectations (advisor Q5), so a property is the only app-level check. It must be anchored to a
  suite fact (the server's landed log), never to a runtime report alone.

### What "usual" means

Realistic people on a healthy network, with no faults (T47).

- **Timing:** think times come from the shape's `think`/`idle` ranges, sampled log-uniformly: typing 80 to 250 ms
  per key, reading 1 to 20 s, form fields 2 to 10 s. Server latency is 50 to 800 ms, log-uniform, with a 2% tail
  of 2 to 5 s.
- **Mix:** the shape's weighted user model per leaf state. People also hide and show the tab (2% of steps), and
  navigate away and back (`release`/`ensure`, 2%), since that is behaviour, not a fault.
- **Server:** the shape's `server` answers `Ok` or its domain failures (a 409, a declined card) at the shape's
  realistic rates, at most 5%.
- **Length:** 40 to 150 steps, a virtual horizon of 30 minutes, then the quiet phase.

### What "stress" means

Everything at once, at rates people never reach.

- **Rates:** gaps of 0 to 20 ms, bursts of 50 to 2,000 events in one step (S02, S17, S26 reach the 1,024 bound).
- **Answers per request,** drawn independently: `Ok` 35%, `Fail` (the shape's tags) 10%, `Lost` 10%,
  `LostButLanded` 10%, `FailButLanded` 5%, `Never` 5% (left to time out), slow (advance 1 to 90 s first, so commit
  deadlines can pass) 10%, reordered (`answerTo` a newer request first) 10%, late (`answerLate` after the caller's
  end) 5%.
- **Storage per held batch:** `ack` 75%, `refuse` 15%, `hang` 5%, `landNoAck` 5%.
- **Spans and lifetimes per run:** one offline span of 5 to 120 s (every answer in it is `Lost` or `Never`; needs
  the world addition). Per step: reload 3%, `disposeRuntime` 1%, `dispose` or `forget` 1%, `upgrade` once in S25.
- **Combinations,** in three layers:
  1. **Random mix:** the draws above, independent per step.
  2. **Pair sweep:** for each Q9 grid cell (8 phases by 6 perturbations), drive with the usual user model until the
     lifecycle model reports an Attempt in that phase, then apply the perturbation. This is deterministic and
     small: at most 48 runs per shape, fewer where a phase is unreachable.
  3. **Crash at every step:** T44's crash generator, run over each shape's generated usual scripts and not only
     the hand cases.
- **Length:** 100 to 300 steps, a virtual horizon of 10 minutes, then the quiet phase.

### Generation from one fixture with seeds

- One integer seed per run fixes everything random: the fast-check seed, the world seed (store load order) and
  the session seeds (Attempt ids).
- Generation uses fast-check's model-based commands (`fc.commands` from `effect/testing/FastCheck`, already
  installed; advisor Q5). Each command is one Case step. Its precondition is read from the world (an open request
  to answer, a held batch, a due timer) and the lifecycle model, never from the runtime (Q5).
- The profile and the shape together give the command weights: `usual` takes the user model and the healthy
  server, and `stress` adds the fault commands. Nothing else differs, so a stress failure replays in the usual
  vocabulary.
- An invalid step is skipped and left out of the emitted case, as in Testing O6. Examples: an answer with nothing
  open, or a send to an absent actor (unless the step is a deliberate negative input, Q5).

### Shrinking to small cases

- fast-check shrinks the command list: chunks first, then single steps, then payloads toward earlier samples. Each
  candidate runs on a fresh world, and it is kept only if the **same oracle fails under the same Invariant**.
- Shrinking stops at 1,000 candidates or when nothing smaller fails, and reports which bound it hit (Testing O6).
- The result is printed as an ordinary scenario, with literal steps, the seed and `cites` from the failing oracle.
  It goes to `conformance/regressions/<shape>-<seed>.scenarios.ts` and runs in every later suite (T47:
  "every failure found shrinks to a kept regression case, or is logged as a runtime limit").

### Determinism and bounds

- The world is a synchronous simulator, so a seed replays exactly. Shapes may not read the clock or randomness;
  the lint rules already forbid it in the core.
- **Per run:** a step cap, a virtual horizon, and then the quiet phase: answer everything open with `Ok`, `ack`
  every batch, advance past the 5 s disposal bound and the longest schedule, then end with `playCase`'s judged
  disposal. The existing 10 s wall bound (`runner/run.ts`, `CASE_SECONDS`) stops a runaway run. Work still pending
  at the horizon is **inconclusive**, counted and never a pass (Testing O6).
- **Per gate:** a fixed seed list per shape: 10 usual and 20 stress seeds, plus the pair sweep. That is about
  26 × 80 ≈ 2,000 runs per runtime. If a run takes about 0.1 s, this is roughly 4 minutes in sequence and about 1
  minute in 4 slices. A `soak` command runs more seeds outside the gate, and every red seed it finds becomes a
  regression.
- **Prerequisite:** T44 found the lifecycle model does not roll a lane back to its last landed capture at a kill
  (Restore R3, WriteAhead R10). Reload-heavy stress gates wait for that model fix, or every reload in stress is a
  false red.

### What tells shapes apart in fact

The matrix shows intent. The run measures it: per shape, which cells of Tables A, B and C and of the Q9 pair grid
it reached, and which mutants it killed (round-14's 147 and production's). A shape whose reached cells are a subset
of earlier shapes' cells, and which kills no new mutant, is cut from the gate (T47's false-pass guard). It stays
available for benchmarks.

## 5A. Combinations (proposed, 2026-11-11)

**Bottom line (proposed):** test features together, not one shape at a time, and measure it. Merge the 27 sketches
into 9 denser composite shapes, add an "app mix" profile that runs several composites in one runtime, and judge
combinations by three measures: feature-pair coverage (the combination gate), 3-way coverage (reported) and
cell-pair reach. The sketches in section 3 stay as the parts the composites are built from. All counts below come
from a script over the matrix in section 4 and are estimates until the reach recorder measures them.

### Why combinations matter

Most bugs found so far were interactions: a cancel during a send, a reload while a lane is held, disposal with a
queued commit. A shape that exercises one feature at a time cannot find them, and a pile of such shapes finds only
what each one finds. Pairwise combinatorial testing makes the same point with data: in the NIST failure studies
most faults needed two or three interacting factors, and nearly all needed six or fewer (Kuhn, Kacker and Lei,
"Practical Combinatorial Testing", NIST SP 800-142, 2010). So two-way coverage is the floor, three-way is the
measure to watch, and the few known deep stacks are named and tracked by hand.

### Feature pairs: which interact

There are 53 feature codes (the 35 of section 2 and the 18 found by the Plan check), so 1,378 pairs. A pair
**interacts** when both features touch one of these channels, and a script reads the channel list, so a new feature
only needs its channels:

| Channel | Meaning                                                   | Features that touch it                    |
| ------- | --------------------------------------------------------- | ----------------------------------------- |
| W       | write lanes and their endings                             | rj lt se ca ky cm cA rt un op en wa sr dp |
| R       | reads, entries, streams                                   | ky lk sb op en st fz sw ph kb os pg gr    |
| T       | timers                                                    | du ms rs ks dm fz of                      |
| I       | actor identity and sharing                                | ks fr ea ma cx in ci pv lc sd sn dp gr    |
| P       | persistence (records, write-ahead, restore, shapes)       | un wa rl up sr cs hs fr ea pv sd mt lz fg |
| L       | lifecycle: reload, disposal, release, grace, forget, tabs | owners rl up dp gr fg mt lz wa sr ma of   |

A lifecycle owner interacts with every feature that keeps state past one event (everything but the pure-turn
features). Everything else interacts only through a shared channel. Result: **777 interacting pairs and 601
non-interacting**. The 601 are listed by rule, each with its reason, and the gate may not waive a pair that is
interacting:

| Rule                                                                                | Pairs |
| ----------------------------------------------------------------------------------- | ----- |
| Alternative policies of one operation (rj, lt, se, ca); other lanes are independent | 6     |
| Pure-turn features (gd, ck, rn) read memory and the event only                      | 153   |
| Timers (du ms rs ks dm) enter as ordinary turns, so they add nothing to lanes etc.  | 146   |
| Reads and streams against write-lane members: separate operation kinds              | 48    |
| Identity-only features against lanes and reads: they name actors, not lanes         | 130   |
| Structure (cs fr ea hs) and issues (is) against lanes, reads and each other         | 118   |

Pairs that need a feature no runtime has yet (cx, rs, ms, mt, lz and most of the 18) are interacting, and wait on
the runtime before they can be reached. They are waived with a reason and a date until then.

### The technique

- **Pairwise (all 2-way)** is the combination gate: every interacting pair appears together in some generated run's
  executed steps, not only in the shape's feature list. The recorder marks a feature as exercised when its code
  path is reached, as the reach recorder does for table cells.
- **3-way** is reported. A triple counts when all three of its pairs interact: 6,728 triples. Report the share
  reached, per composite and in total. It is not a gate, since many triples cannot be reached together.
- **Higher orders** matter where the runtime keeps several things in flight at once. Name them and track them by
  hand, as a short list of stacks the generator must reach, each in an ordinary shrinkable case: reload + cancel +
  retry + storage refusal; disposal + `serialize` queue + write-ahead batch + storage refusal; late answer +
  `cancel` + reload; upgrade + Held lane + reload + retry. Today only composite C (below) holds the first stack
  and A the second.

### Cell-pair reach

Section 5 measures cells one at a time. Add **cell pairs**: an ordered pair of lifecycle table cells (A, B, C and
the Q9 grid G) that one run reaches in sequence, such as `A[Reload·OnWire]` then `B[Held·retry]`. The recorder
derives the denominator from the lifecycle model: the pairs the model says can follow each other on one lane or one
actor. It is not hand-listed. Report pairs reached, per composite.

### The app-mix profile

A third profile beside usual and stress. It boots one runtime and runs several composites at once, sharing storage,
the network and the clock, with one seed. A composite is a different application, so they do not share lanes by
accident: they share what a real page shares.

- **Run together:** B (outbox), C (control and money), A (editor), D (cart and workspaces) and F (reads) at
  minimum, since they span all four lane policies, write-ahead, restore, actors and reads. E, G, H and I join as
  runtimes build their features.
- **Shared:** one fake storage (so one write-ahead batch can hold records of several machines), one network (a
  server fault hits several shapes' requests), one virtual clock, one reload and one disposal.
- **Targets (cross-feature interactions no single shape reaches):**
  - write-ahead batching across actors: two machines' commits land in one batch, and the batch is refused;
  - a storage refusal mid-commit of another machine's capture, which must not leave that machine's lane unsent;
  - disposal while others run: some lanes on the wire, some queued, one actor in grace;
  - two composites contending for a lane through a shared actor identity (`actorRef` by value, S27);
  - a reload while one lane is Held and another is Queued;
  - an offline span that hits polling in one shape and a retry in another.
- **How pairs count:** a pair of features from two different composites counts only if one of them is a shared
  resource feature (wa, sr, rl, up, dp, fg, of, ad, ma, mt). Timers or lanes of unrelated shapes do not interact.
- **Cost:** about 80 lines on top of the generator: a mix picks composites, merges their user models and fault
  draws, and a failing run shrinks by dropping whole composites first, then steps.

### Consolidation: fewer, denser shapes

Complex fixtures reach more combinations per file and need fewer files. Proposed: merge by affinity, keeping each
source sketch as a named part of its composite (its events, memory and user model stay readable on their own).

| Composite    | Parts           | Features | What it combines                                                        |
| ------------ | --------------- | -------- | ----------------------------------------------------------------------- |
| A Editor     | S01 S05 S24 S25 | 20       | drafts, deadlines, tabs, upgrade; `latest` and `serialize`, restore     |
| B Outbox     | S08 S03 S22     | 20       | `reject` and `serialize` with cancel, cancelAll, retry; offline; boards |
| C Control    | S12 S23 S20 S16 | 27       | `cancel`, money transfers, polling, history; storage refusal, retry     |
| D Cart       | S14 S27         | 21       | shared actors by value, traits, context, forget, issues                 |
| E Chat       | S04 S13 S17     | 19       | thread actors, token context, bursts, streams, optimism                 |
| F Reads      | S02 S26 S18 S11 | 23       | lookups, subscribe, streams, staleness, entities, fan-out               |
| G Optimistic | S09 S15         | 13       | optimistic toggles, per-row copies, keyed `latest`, cancel              |
| H Forms      | S06 S21 S19     | 19       | wizard, sign-in, lazy panel; guards, history, compound states           |
| I Dashboard  | S10 S07         | 16       | rate limits, multi-step schedules, per-panel timers, offline            |
| J Visit      | S28 (5B)        | 34       | proposed: a subroutine with nested fragments, in a lazy entry           |
| K Panels     | S29 (5B)        | 34       | proposed: resumable and reset traits, keyed timers, stream catch-up     |

**Before and after (estimates from the script):**

| Measure                            | 27 sketches | 9 composites | 9 composites + app mix | 13 sketches in a mix |
| ---------------------------------- | ----------- | ------------ | ---------------------- | -------------------- |
| Interacting pairs reached (of 777) | 445         | 595          | 693                    | 611                  |
| Interacting pairs unreached        | 332         | 182          | 84                     | 166                  |
| 3-way triples reached (of 6,728)   | 1,327       | 3,252        | not computed           | not computed         |

**Updated by 5B (proposed):** J and K join the composites, and 22 parts gain additions. 5B recomputes these
estimates with a stated rule and gives the combination gate's before and after figures there.

Nothing is lost: a composite's feature set is the union of its parts, so every pair a part reached is still
reached, and 150 more become reachable in one run. What the merge changes: six features keep one composite host
(ca in C; cA in B; sb and ph in F; lz and rn in H). The "at least 2 shapes" rule stays on the parts, and the
composite list flags those six. The fix is to move one part when the shape is built, decided then.

**What limits a composite's size:** a failure must shrink to a case a person can read, so a composite has at most
5 operations, about 80 lines, and its parts keep separate user models. If shrinking often stops at its 1,000
candidates, or a shrunk case needs more than about 15 steps, split the composite back into its parts. C is the
largest at 27 features and the first to split.

### Feeding unreached pairs back

1. The reach recorder lists interacting pairs with no run. 2. For each: if a composite already has both features,
raise the weight of the command that puts them together (for example, a `cancel` command while a batch is held, to
reach ca with wa). 3. If no composite has both, add an operation or part to the nearest composite, or a pair-sweep
cell (section 5, layer 2). 4. If a runtime lacks a feature, waive the pair with a reason and a date, and list it
in `revisit.md`.
The **combination gate fails on an interacting pair that no run exercised and no waiver covers**. 3-way and cell-pair
numbers are recorded, never gating.

### What covers the riskiest pairs now, and what nothing reaches

Covered by shapes (sketch level; composites in brackets):
- cancel + unknown ending: S12, S23 [C]. Reload + unknown: S01, S04, S08, S13, S16, S23, S25 [A, B, C, E, H, I].
- Reload + retry: S04, S08, S16, S25. Disposal + write-ahead: S05, S14, S16, S19, S24, S25, S27.
- Disposal + `serialize`: S14, S24 only [A, B, C, D]. Reload + `cancel`: S23 only [C].
- `serialize` + storage refusal: S08, S24. Several actors + `latest`: covered; `cancel` + disposal: S12.

Covered by **no sketch** and by composite C or A only: cancel + write-ahead (`cm`, `wa`), cancel + storage refusal
(`ca`, `sr`, `cm`, `sr`), storage refusal + several actors (`sr`, `ma`) and the four-way reload + cancel + retry +
storage refusal. In the sketches nothing combines them, which is the argument for C.

Unreached after 9 composites and the app mix: **84 interacting pairs**. Grouped:
- **Need a feature a runtime lacks, or round-14 only (80):** lz with nearly every feature, pg, os, kb, ph, sw and fz
  with reads and optimism, ks with context and identity, ms with rs and dm, and en and op with lanes. Waived with a
  reason and a date until a runtime builds the feature.
- **Buildable now (4):** `lt` with `cA`, `ca` with `cA`, `cA` with `gr`, and `cs` with `ea`. Add a cancelAll to a
  `latest` lane and to a `cancel` lane in B and C, and a cancelAll held through grace.
  5B closes all four (proposed): S01+, S12+, S03+, and S28 and S29.

## 5B. Feature families in depth (proposed, 2026-11-11)

**Bottom line (proposed):** the Plans define 251 runtime variations across 14 feature families, and the catalogue
above exercised 85 of them, so 166 were missing. Fragments were the thinnest: none of 22 subroutine variations had
a step, and 20 of 25 trait variations had none. Two new parts close most of the gap: S28 (a field visit built
around a subroutine) and S29 (ticket panels built from resumable and resetting traits). Each becomes a composite of
its own, J and K, because no existing composite has room under the 5-operation limit. One-line additions to 22
existing parts cover streams, entities, schedules, context and restore. After this, 250 of the 251 variations
have a named step. One stays unplaced: a lazy entry with a domain write. Interacting pairs left unreached drop from
69 to 26 over the 53 codes. The 9 new codes bring the total to 62, and over them the drop is from 348 to 70.
Everything in this section is proposed.

**Why now:** the user found the catalogue thin. Subroutines appear once against twelve mentions in Machines.plan,
fragments once, and traits, `.each` and streams were named without their variations.

**Read first:** @plan.Machines.O1 to O8, @plan.Operations.O3, O4 and O7, @plan.EntityDomains.O1 to O6,
@plan.Runtime.O3 to O6, @plan.Persistence.O2 to O7, @plan.LazyFeatures.O1 to O5, `@spec.Turn` R4, R6, R18, R21 to
R23; prior art `references/dispatch-desk/features/Resolve/` (visit and wizard) and `features/Tickets/panels/`.

### Method

- **Inventory.** Each family lists the variations its Plan defines: options, modes, error cases and lifecycle edges.
  Four read-only sidecars drafted the lists. Each row below was checked against the Plan text it cites.
- **Runtime only.** Construction and type errors are excluded. They belong to the Compile and StaticCli cases, not to
  generated runs. Examples: UnknownNotUncertain, TwoDefaults, ReservedStateName, DuplicatePlacement, VerbMismatch,
  unfilled ports, a raise into a fragment the turn exits, a mapped write outside the fragment write scope,
  SharedContract and KeyRequired.
- **Columns.** *Before* names the parts in sections 3 and 4 that already exercise the row; `—` means missing.
  *Now* names the step that exercises it: `S28.4` is step 4 of S28 below, and `S04+` is the 5B addition to S04.
  "kept" means the earlier parts still cover it. *Plan* abbreviates: M Machines, Op Operations, ED EntityDomains,
  Rt Runtime, Ps Persistence, LF LazyFeatures; `T.`, `WL.` and `C.` are the Turn, WriteLanes and Compile Specs.
- **Families.** Lanes and policies are folded into "reads and writes". History is folded into "states and
  history". Several actors and tabs share one family.
- **A correction to the brief's example.** A subroutine cannot sit inside a trait: traits have no states. The
  deepest stack the Plans allow is a `.each` trait inside a subroutine inside a compound state. S28 builds that
  stack inside a lazy entry and reloads it (S28.11).
- **A reading of S06.** S06 places `AddressStep` as `{ ADDRESS: AddressStep }`. That is a state placement, so
  AddressStep is a subroutine, not the trait its feature line names. 5B reads it as a subroutine (S06+).

### Family summary

| Family                        | Plan                                | Variations | Reached before | Missing before |
| ----------------------------- | ----------------------------------- | ---------- | -------------- | -------------- |
| Subroutines                   | Machines.O1, O2, O6                 | 22         | 0              | 22             |
| Traits                        | Machines.O1, O3, O5, O6, O8         | 25         | 5              | 20             |
| `.each` copies                | Machines.O1, O3, O6; Persistence.O2 | 19         | 8              | 11             |
| Context slots and `onContext` | Machines.O7; Runtime.O5             | 13         | 5              | 8              |
| Streams                       | Operations.O4; Machines.O6          | 35         | 11             | 24             |
| Entities and domains          | EntityDomains.O1 to O6              | 26         | 7              | 19             |
| Reads, writes and lanes       | Operations.O1 to O7                 | 20         | 7              | 13             |
| Schedules                     | Machines.O5                         | 22         | 12             | 10             |
| States and history            | Machines.O2, O6                     | 15         | 7              | 8              |
| `raise` and `notify`          | Machines.O1, O3                     | 12         | 2              | 10             |
| Persistence and write-ahead   | Persistence.O2, O3, O6, O7          | 16         | 8              | 8              |
| Restore                       | Persistence.O4, O5                  | 13         | 8              | 5              |
| Lazy features                 | LazyFeatures.O1 to O5               | 10         | 4              | 6              |
| Several actors and tabs       | Runtime.O3, O4                      | 3          | 1              | 2              |
| **Total**                     |                                     | **251**    | **85**         | **166**        |

A row counts as reached before when a part's sketch or feature line exercises it, even partly. After 5B, every row
has a step except Lazy row 7 (see the Lazy table).

### Inventory by family

**Subroutines.**

| #   | Variation                                                              | Plan        | Before | Now          |
| --- | ---------------------------------------------------------------------- | ----------- | ------ | ------------ |
| 1   | Placed as `{ NAME: Sub }`, entered at its default                      | M.O1, O2    | —      | S28.1        |
| 2   | A leaf subroutine (no states), left only by its exits                  | M.O2        | —      | S28.6        |
| 3   | Input from the host's filling; computed initial fields read it         | M.O1        | —      | S28.1        |
| 4   | Exit with a payload that the host commits in the same turn             | M.O2        | —      | S28.5        |
| 5   | A second exit with its own payload (a compensating commit)             | M.O2        | —      | S28.6        |
| 6   | An exit taken from a subroutine's own timer                            | M.O2, O5    | —      | S28.7        |
| 7   | Abandoned by a host transition; `whenAbandoned` fused into that turn   | M.O2, O3    | —      | S28.8        |
| 8   | `whenAbandoned` hands the draft back; the next entry resumes it        | M.O1        | —      | S28.8, S28.9 |
| 9   | Its own exit runs no `whenAbandoned`                                   | M.O1        | —      | S28.5        |
| 10  | An ancestor's `"self"` does not abandon it                             | M.O2        | —      | S28.3        |
| 11  | Host events it does not handle fall through to the host's ancestors    | M.O2        | —      | S28.3        |
| 12  | `hostEvents` raised by the direct host; its own guards choose          | M.O1        | —      | S28.2        |
| 13  | Compound states and `history` inside it                                | M.O2        | —      | S28.6        |
| 14  | Nested subroutine: exits to the outer `history` and to an outer exit   | M.O2        | —      | S28.6        |
| 15  | Owns a read but no mapped write; the host owns the writes              | M.O1        | —      | S28.4        |
| 16  | A bare write in a trait inside it: its endings are evidence            | M.O1; Op.O3 | —      | S28.7        |
| 17  | `LateMayNotLeave`: a late alternative that would leave it is denied    | M.O6; T.R21 | —      | S28.10       |
| 18  | Reload inside it: leaf path, slice, copies and history child come back | Ps.O2       | —      | S28.11       |
| 19  | Release 2 changes its memory shape: the record resets                  | Ps.O5       | —      | S28.12       |
| 20  | A context wave's `onContext` event abandons it                         | M.O7        | —      | S28.9        |
| 21  | In a lazy entry, adopted after a reload with the leaf inside it        | LF.O3       | —      | S28.11       |
| 22  | Its slice sits under the state name, undefined when not active         | M.O8; T.R23 | —      | S28.5        |

S06 names a subroutine but runs none of these rows, so all 22 count as missing.

**Traits.**

| #   | Variation                                                               | Plan        | Before  | Now          |
| --- | ----------------------------------------------------------------------- | ----------- | ------- | ------------ |
| 1   | Root placement                                                          | M.O1        | —       | S29.1        |
| 2   | Placed on a node through `Flow.state(…, { traits })`                    | M.O1        | —       | S29.2        |
| 3   | Placed on a subroutine's state                                          | M.O1        | —       | S28.7        |
| 4   | A child trait filled by its parent trait                                | M.O1        | —       | S29.6        |
| 5   | Input per incarnation; trait input fields stay writable                 | M.O1        | S07 S15 | kept         |
| 6   | `.resumable()`: leaving its node freezes it, returning thaws it         | M.O1        | —       | S29.3        |
| 7   | A freeze releases its placements; a thaw places them again              | M.O6; T.R18 | —       | S29.3        |
| 8   | A frozen schedule keeps `dueAt`, fires once on thaw if overdue          | M.O5        | —       | S29.7        |
| 9   | `Flow.entry` arms on creation or reset, never on a thaw                 | M.O5        | —       | S29.3        |
| 10  | Writes outlive a freeze; their endings park for the frozen slice        | M.O1; Op.O3 | —       | S29.7        |
| 11  | `resetOn` changed: the pending reset runs as its own turn first         | M.O3; T.I10 | —       | S29.4        |
| 12  | `resetOn` null: not placed; becoming present starts an incarnation      | M.O1        | —       | S29.1, S29.5 |
| 13  | A frozen trait whose reset value changed resets on return               | M.O1 (ref.) | —       | S29.4        |
| 14  | `whenAbandoned` on reset or removal, never on own exit or freeze        | M.O1; T.I11 | S15     | S29.3, S29.4 |
| 15  | Release on leave: the wire Attempt interrupted, queued commits evidence | WL.R16      | S15     | S15+         |
| 16  | Later endings of a releasing lane apply to the lane, undelivered        | Op.O7       | —       | S15+         |
| 17  | A release wins over `cancelAll` in the same transition                  | Op.O7       | —       | S15+         |
| 18  | Mapped writes in a copy and in a resumable trait (string `resetOn`)     | M.O1; C.I12 | S15     | S29.6        |
| 19  | Host guards read `Fragment.O` (`idle`, `retryable`, `get`)              | M.O1        | —       | S29.8        |
| 20  | A required guard port filled by the host, reading context               | M.O1        | —       | S28.5        |
| 21  | Callback ports: the host updates memory, commits or targets a state     | M.O1        | —       | S28.4, S29.8 |
| 22  | A `Flow.optional` callback left unfilled is ignored                     | M.O1        | —       | S29.6        |
| 23  | `Flow.private` in a trait slice: absent outside, kept in the record     | M.O1, O8    | S13     | S29.2        |
| 24  | A frozen slice is in the snapshot; an inactive one is undefined         | M.O8; T.R23 | —       | S29.3        |
| 25  | A new incarnation inherits no issue                                     | M.O8        | —       | S29.4        |

Row 13 follows the dispatch-desk panels (`panels.machine.ts`). The Plan does not say when a frozen trait's
`resetOn` is evaluated (see "Plan gaps").

**`.each` copies.**

| #   | Variation                                                        | Plan     | Before          | Now          |
| --- | ---------------------------------------------------------------- | -------- | --------------- | ------------ |
| 1   | A copy is added when its key appears; `Flow.entry` schedules arm | M.O3     | S03 S07 S15 S23 | kept         |
| 2   | A copy is removed: `whenAbandoned` runs in the leaving turn      | M.O3     | S15             | kept         |
| 3   | Reordered keys keep each copy; snapshots list them in key order  | M.O8     | —               | S15+         |
| 4   | A key removed and re-added gets a new incarnation                | M.O3     | —               | S15+         |
| 5   | A duplicate key: repair keeps the first (`listRepair` evidence)  | M.O3, O5 | —               | S07+         |
| 6   | `by` names the key of record items                               | M.O1     | —               | S28.4, S29.5 |
| 7   | `max`: the list at its bound                                     | M.O1     | S07 S15         | kept         |
| 8   | Per-copy schedules                                               | M.O5     | S07 S15         | kept         |
| 9   | Per-copy write lanes by subject path                             | Op.O3    | S15             | kept         |
| 10  | Per-copy reads; a removed copy's lookup ending is evidence       | Op.O3    | S07             | S07+         |
| 11  | The host raises into one keyed copy                              | M.O3     | —               | S29.5        |
| 12  | A copy notifies a host callback that carries its key             | M.O1     | —               | S15+, S28.4  |
| 13  | `.each` inside a subroutine                                      | M.O1     | —               | S28.4        |
| 14  | `.each` placed on a compound node rather than the root           | M.O1     | —               | S29.5        |
| 15  | A copy whose trait has a child trait                             | M.O1     | —               | S29.6        |
| 16  | Copies persist with incarnation counters; reload restores them   | Ps.O2    | —               | S15+, S28.11 |
| 17  | `subscribe.each`: a session per key; a removed key released once | M.O6     | S26             | kept, S17+   |
| 18  | Many copies added and removed in one burst                       | M.O3     | S15             | kept         |
| 19  | A stream placed inside a copy; removing the copy releases it     | M.O6     | —               | S23+         |

Going over `max` has no rule in the Plan, so no step drives past it (see "Plan gaps").

**Context slots and `onContext`.**

| #   | Variation                                                           | Plan      | Before  | Now          |
| --- | ------------------------------------------------------------------- | --------- | ------- | ------------ |
| 1   | A slot bound by `Provider.select`; guards read it                   | M.O1      | S13 S14 | S28.5        |
| 2   | Silent baseline at admission                                        | M.O7      | S13     | kept         |
| 3   | Silent baseline at restore and at lazy adoption                     | M.O7      | S13     | S28.11       |
| 4   | A changed selection enqueues the event after the context turn       | M.O7      | S13     | kept         |
| 5   | An equal selection is silent                                        | M.O7      | —       | S13+         |
| 6   | `when` declines: no event, but the baseline moves                   | M.O7      | —       | S13+         |
| 7   | A returning incarnation gets one wave if the selection differs      | Rt.O3, O5 | —       | S14+         |
| 8   | Diamond: one update per consumer per wave, never mixed values       | Rt.O5     | —       | S13+         |
| 9   | A throwing selector keeps the old context, one issue, retries later | Rt.O5     | —       | S13+         |
| 10  | A bound consumer is a use; provider disposal: `BlockedByDependents` | Rt.O5, O6 | —       | S13+         |
| 11  | Capture waits for a wave to settle                                  | Ps.O3     | —       | S13+         |
| 12  | An `onContext` event leaves a state that holds fragments            | M.O7      | —       | S28.9, S29.8 |
| 13  | A non-durable provider rejects the whole capture                    | Ps.O3     | S13     | kept         |

**Streams.**

| #   | Variation                                                          | Plan         | Before      | Now         |
| --- | ------------------------------------------------------------------ | ------------ | ----------- | ----------- |
| 1   | `subscribe`: one session per (incarnation, path, operation, key)   | Op.O4        | S04 S11 S17 | kept        |
| 2   | `subscribe.each` over a stream: one session per distinct key       | Op.O4        | —           | S17+        |
| 3   | `delivers: "every"`, at least once; the handler stores by id       | Op.O4        | S04         | kept        |
| 4   | `delivers: "latest"`, newest wins                                  | Op.O4        | S11         | kept        |
| 5   | `position`, `catchUp`: `Feed.more` pages, `Feed.done` with proof   | Op.O4        | —           | S04+, S29.3 |
| 6   | `catchUp` answers `Feed.gone`                                      | Op.O4        | —           | S04+, S29.8 |
| 7   | `missed`: `Unproven`, `Lost`, `Reset`, one notice per interruption | Op.O4        | —           | S04+        |
| 8   | `fills`: emptied while placed stays cleared; unplaced is wiped     | Op.O4        | —           | S04+, S29.4 |
| 9   | A handler changing the placed key empties `fills` that turn        | Op.O4        | —           | S29.4       |
| 10  | `Feed.live` with `proof`, `head` or `restartAt`                    | Op.O4        | —           | S04+, S11+  |
| 11  | `Feed.down`, then reconnect from 500 ms, jittered, capped at 30 s  | Op.O4        | S11         | kept        |
| 12  | `reconnect.while` and a custom reconnect schedule                  | Op.O4        | —           | S11+        |
| 13  | `Flapping` after 8 flaps                                           | Op.O4        | S11         | kept        |
| 14  | `idleTime`, `Feed.ping`: silence ends `Silent`; `"Infinity"` off   | Op.O4        | —           | S11+        |
| 15  | `Overflow` at 1,024 items queued in `Feed.callback`                | Op.O4        | —           | S17+        |
| 16  | `Closed`, `Defect` (undecodable position), `Interrupted`           | Op.O4        | —           | S04+, S23+  |
| 17  | The bookmark moves on admission, holds through Denied, Unhandled   | Op.O4        | —           | S04+        |
| 18  | A denied value moves the bookmark with `DeliveryDenied`            | Op.O4        | —           | S04+        |
| 19  | Bookmark cap of 256 per operation; the oldest is dropped           | Op.O4        | —           | S17+        |
| 20  | `refetch` forgets the bookmark and reads now                       | Op.O4        | —           | S11+        |
| 21  | Bookmark persisted; reopens from it with no replay                 | Ps.O2, O5    | S11         | kept        |
| 22  | `latest` restores its last value and baseline                      | Ps.O5        | S11         | kept        |
| 23  | A changed key releases the old session exactly once                | Op.O4; T.I24 | S11         | kept        |
| 24  | A non-key input change does not restart the session                | Op.O4        | —           | S11+        |
| 25  | `select` returns undefined: released (`SelectedNoKey`)             | Op.O4        | —           | S17+        |
| 26  | A new session for a key waits for the releasing predecessor        | Op.O4        | —           | S17+        |
| 27  | Release bounded at 5 s, then `ReleaseOverdue`                      | Op.O4; Rt.O6 | S11         | S17+        |
| 28  | `Feed.multiplex`: `emit.to`, `emit.all`, `emit.fail(e[, key])`     | Op.O4        | S11         | S11+        |
| 29  | A joiner of a registered key hears `Feed.live` at once             | Op.O4        | —           | S11+        |
| 30  | A freeze releases the session; the frozen slice keeps the bookmark | Op.O4; M.O6  | —           | S29.3       |
| 31  | A stream in a `.each` copy; removing the copy releases it          | M.O6         | —           | S23+        |
| 32  | A released session discards undelivered items (evidence)           | Op.O4; Rt.O4 | —           | S17+        |
| 33  | A value fires only on a changed confirmed value                    | M.O6         | S11         | kept        |
| 34  | `listen` entries: deltas, `covers`, unproven registration          | ED.O3        | —           | S18+, S22+  |
| 35  | `select` throws: placement kept, a `UserClosure` issue each turn   | Op.O4        | —           | S04+        |

**Entities and domains.**

| #   | Variation                                                                       | Plan      | Before | Now  |
| --- | ------------------------------------------------------------------------------- | --------- | ------ | ---- |
| 1   | A patch predict on a versioned entity                                           | ED.O2     | S09    | kept |
| 2   | A delete predict; a failed delete restores the record                           | ED.O2, O4 | S18    | S18+ |
| 3   | A field function in a patch                                                     | ED.O2     | —      | S14+ |
| 4   | `alsoChanges` with `Entity.fields`: unconfirmed until a confirming read         | ED.O2, O4 | —      | S14+ |
| 5   | Many keys in one write; each record predicted once                              | ED.O2     | —      | S18+ |
| 6   | A multi-record write runs only when first in every record queue                 | ED.O4     | —      | S22+ |
| 7   | A definite failure removes predictions with no repair                           | ED.O4     | S22    | kept |
| 8   | An unknown keeps predictions until the forced repair lands                      | ED.O4     | S09    | kept |
| 9   | A forced repair asked 3 times without an answer: `RepairOverdue`; news re-asks  | ED.O4     | —      | S09+ |
| 10  | A given-up mark (a released unknown) asks one read, then goes quiet             | ED.O4     | —      | S09+ |
| 11  | `guarded: true` ends a quiet mark on a version past its base                    | ED.O4     | —      | S22+ |
| 12  | Predicting writes queue per record across actors                                | ED.O4     | —      | S14+ |
| 13  | Record queue: 64 waiting, the 65th `Overloaded`                                 | ED.O6     | —      | S14+ |
| 14  | A never-sent queued write rebases over an earlier same-base write               | ED.O4     | —      | S22+ |
| 15  | A predicted move keeps list membership until repair                             | ED.O4     | —      | S22+ |
| 16  | No optimistic insert: a created record joins a list on refetch                  | ED.O4     | —      | S18+ |
| 17  | A list with `where` and `orderBy` repairs on enter, leave or order change       | ED.O1, O3 | S18    | kept |
| 18  | A server-ranked list with `unaffectedBy`                                        | ED.O1, O3 | —      | S18+ |
| 19  | A `derivedFrom` answer repairs on a relevant field change                       | ED.O1, O3 | —      | S18+ |
| 20  | `pagedBy`: repair from page one; a failed page keeps the old chain              | ED.O1     | S18    | S18+ |
| 21  | `HiddenOrder` on a misordered response                                          | ED.O1     | —      | S18+ |
| 22  | A lower-version answer is `Stale`; a higher version applies                     | ED.O3     | —      | S09+ |
| 23  | An unorderable field that differs is contested and refetched                    | ED.O3     | —      | S14+ |
| 24  | A confirmed delete tombstones; a lower version cannot resurrect it              | ED.O4     | S18    | S18+ |
| 25  | `.gone(tag)` on a `byKey` read removes the row as a tombstone                   | ED.O1, O4 | —      | S18+ |
| 26  | A domain write on a `cancel` lane: the interrupted unknown keeps the prediction | ED.O4     | —      | S23+ |

A 27th row, a restored uncertain write forcing a repair at boot, is placed on S22+.

**Reads, writes and lanes.**

| #   | Variation                                                         | Plan         | Before          | Now   |
| --- | ----------------------------------------------------------------- | ------------ | --------------- | ----- |
| 1   | `reject` declines a busy lane                                     | Op.O3        | S03 S06 S10 S16 | kept  |
| 2   | `latest` supersedes the queued head                               | Op.O3        | S01 S09 S15 S17 | kept  |
| 3   | `serialize`: first in, first out up to 64, then `Overloaded`      | Op.O3        | S08 S04 S22     | kept  |
| 4   | `cancel`: a newer commit interrupts                               | Op.O3        | S12 S20 S23     | kept  |
| 5   | `cancel` and `cancelAll` by phase (wire, waiting, Held, Idle)     | Op.O7        | S03 S08 S12 S22 | kept  |
| 6   | `cancelAll` on a `latest` lane                                    | Op.O7        | —               | S01+  |
| 7   | `cancelAll` on a `cancel` lane                                    | Op.O7        | —               | S12+  |
| 8   | `cancelAll`, then an unmount and a remount within the grace       | Op.O7; Rt.O3 | —               | S03+  |
| 9   | `retry` keeps the Attempt; `InFlight`, `NothingToResend` evidence | Op.O3        | S03 S08 S16     | kept  |
| 10  | Definite failure after an unknown, one Attempt: `StillUnknown`    | Op.O3        | —               | S08+  |
| 11  | A kept ending (refused twice) blocks its key until `cancel`       | Op.O3; Rt.O4 | —               | S10+  |
| 12  | A throwing outcome mapper: redelivered once, then final           | Op.O3; Rt.O4 | —               | S03+  |
| 13  | A late handler starts a commit                                    | Op.O3        | —               | S28.6 |
| 14  | Unencodable input: `NotSent { Unencodable }`, the transition runs | Op.O3        | —               | S15+  |
| 15  | `writes` on success (`invalidate`); `InvalidWrite` succeeds       | Op.O1        | —               | S28.5 |
| 16  | One-off read row undefined before a lookup and after `cancel`     | Op.O2, O7    | —               | S02+  |
| 17  | Failure tags keep data; `Refreshing` always has data              | Op.O6        | —               | S07+  |
| 18  | A one-off read on a state that is left parks `Interrupted`        | Op.O2        | —               | S28.8 |
| 19  | `progress` row; `previous: [{ key }]` holds                       | Op.O1, O3    | S12 S25         | kept  |
| 20  | An unknown on a bare operation is released (`Released` evidence)  | Op.O3        | —               | S28.7 |

**Schedules.**

| #   | Variation                                                            | Plan | Before          | Now         |
| --- | -------------------------------------------------------------------- | ---- | --------------- | ----------- |
| 1   | A Duration fires once                                                | M.O5 | S01 S02 S12 S21 | kept        |
| 2   | Computed from the arming turn's after memory                         | M.O5 | S08 S10 S13 S24 | kept        |
| 3   | An Effect Schedule fires each step until it completes                | M.O5 | S07 S08 S10     | S07+        |
| 4   | `Schedule.min` of a jittered exponential and a spaced Schedule       | M.O5 | —               | S10+        |
| 5   | A multi-step Schedule restarts at step one on restore                | M.O5 | —               | S07+        |
| 6   | `armOn` re-arms; `Flow.entry` also arms on entry                     | M.O5 | S01 S02 S07 S20 | kept        |
| 7   | `armOn` without `Flow.entry`: idle on entry                          | M.O5 | S15             | kept        |
| 8   | Implicit `"self"` for an `armOn` or `disarmOn` event with no handler | M.O3 | —               | S29.6       |
| 9   | `disarmOn`; stopping an idle schedule does nothing                   | M.O5 | S12 S24         | S29.6       |
| 10  | `restartOn`: silent baseline, restart on change, idle after          | M.O5 | S01 S02 S20     | S07+, S29.2 |
| 11  | Keyed (`keys`): a timer per key, armed and cancelled with it         | M.O5 | —               | S29.2       |
| 12  | Keyed `restartOn` evaluated per key                                  | M.O5 | —               | S29.2       |
| 13  | Keyed timers persist by key; restored memory keys win                | M.O5 | —               | S29.10      |
| 14  | Metadata through `E.X.from`: `attempt`, `dueAt`, `key`               | M.O5 | S12 S24         | S08+, S29.2 |
| 15  | Equal deadlines: separate turns (admission, outermost, declaration)  | M.O5 | —               | S07+        |
| 16  | An overdue step fires once; the next delay starts from it            | M.O5 | S07             | kept        |
| 17  | An unused actor's deadlines wait; only the latest arming waits       | M.O5 | S07 S24         | kept        |
| 18  | On restore a Duration keeps its deadline, fires once if overdue      | M.O5 | S24             | kept        |
| 19  | Stale firings after a re-arm and dead activations' firings dropped   | M.O3 | S01             | S20+        |
| 20  | An invalid duration rejects the arming turn                          | M.O5 | —               | S10+        |
| 21  | A resumable trait's frozen schedule                                  | M.O5 | —               | S29.7       |
| 22  | A schedule inside a subroutine that leads to an exit                 | M.O5 | —               | S28.7       |

**States and history.**

| #   | Variation                                                             | Plan       | Before      | Now    |
| --- | --------------------------------------------------------------------- | ---------- | ----------- | ------ |
| 1   | Compound defaults reach a leaf in one publication                     | M.O2       | S06 S20 S21 | kept   |
| 2   | The leaf's handler first, then ancestors; declines fall through       | M.O2       | S06         | S28.3  |
| 3   | A child part's refusal never falls through; the whole turn is refused | M.O2; T.I3 | —           | S29.5  |
| 4   | `"self"` keeps the activation                                         | M.O2       | many        | kept   |
| 5   | An explicit target re-enters anew; its owned call becomes late        | M.O2       | —           | S20+   |
| 6   | Work at and above the boundary survives                               | M.O2       | S20         | kept   |
| 7   | Exits deepest first, entries outermost first, with activities         | M.O2; T.I6 | —           | S29.8  |
| 8   | `S.X.history` returns to the last active child                        | M.O2       | S06 S20     | kept   |
| 9   | `S.X.history` before any visit returns to the default child           | M.O2       | —           | S20+   |
| 10  | `S.X.history.child(s)` read in a view                                 | M.O2       | —           | S29.9  |
| 11  | The history child persists across a reload                            | Ps.O2      | S06         | S28.11 |
| 12  | History returns control only; data comes back through `.resumable()`  | M.O2       | —           | S29.9  |
| 13  | History as the target of a nested subroutine's exit                   | M.O2       | —           | S28.6  |
| 14  | A late ending routes from the owner's nearest surviving ancestor      | M.O6       | S01         | S28.10 |
| 15  | `unknown { Restored }`, adopted endings: current from the leaf        | M.O6       | —           | S28.11 |

**`raise` and `notify`.**

| #   | Variation                                                      | Plan       | Before | Now   |
| --- | -------------------------------------------------------------- | ---------- | ------ | ----- |
| 1   | A raise into a fragment's event                                | M.O3       | S06    | S29.2 |
| 2   | A raise into a subroutine's `hostEvents`                       | M.O1       | —      | S28.2 |
| 3   | A raise into one keyed `.each` copy                            | M.O3       | —      | S29.5 |
| 4   | A raise into a nested trait that arms its schedule             | M.O3       | —      | S29.6 |
| 5   | A raise's payload reads pre-turn memory                        | M.O3       | —      | S29.5 |
| 6   | Several raises and notifies run depth first, in written order  | M.O3       | —      | S29.6 |
| 7   | An addressed part with no passing alternative refuses the turn | M.O3; T.I3 | —      | S29.5 |
| 8   | A notify whose callback the host fills with `updateMemory`     | M.O1       | S21    | S28.4 |
| 9   | A callback whose filling commits a host write                  | M.O1       | —      | S28.4 |
| 10  | A callback whose filling targets a host state                  | M.O1       | —      | S29.8 |
| 11  | `whenAbandoned` notifies a callback                            | M.O1       | —      | S28.8 |
| 12  | A copy's notify carries its key to the host                    | M.O1       | —      | S15+  |

**Persistence and write-ahead.**

| #   | Variation                                                       | Plan      | Before          | Now           |
| --- | --------------------------------------------------------------- | --------- | --------------- | ------------- |
| 1   | Acknowledged before send, in the turn's capture batch           | Ps.O6     | S16             | kept          |
| 2   | Plain memory coalesces for 5 s; flush on hide and on `pagehide` | Ps.O3     | S01 S24         | kept          |
| 3   | Storage `refuse`, `hang` and `landNoAck`                        | Ps.O3, O6 | S01 S08 S16 S24 | kept          |
| 4   | Refused ack: `NotSent`; refused re-send capture: Held, unknown  | Ps.O6     | S16             | kept          |
| 5   | A hanging write reports `StorageSilent` after 10 s              | Ps.O3     | —               | S08+          |
| 6   | A local actor writes no record and loses its lane at reload     | Ps.O2, O6 | S21             | kept          |
| 7   | Resumable slices, frozen schedules and parked endings persist   | Ps.O2     | —               | S29.10        |
| 8   | `.each` copies persist with their incarnation counters          | Ps.O2     | —               | S15+          |
| 9   | A writing placement's reset value persists; changes reset first | Ps.O5     | —               | S29.10        |
| 10  | `restartOn` baselines and the history child persist             | Ps.O2     | —               | S29.10 S28.11 |
| 11  | Scope bounds 4,096 records, 16 MiB; oldest ended go first       | Ps.O3     | —               | S14+          |
| 12  | An encoding failure keeps the last good capture                 | Ps.O5     | —               | S15+          |
| 13  | A second tab runs unpersisted: `NotSent { NoPersistence }`      | Ps.O7     | S05 S16         | kept          |
| 14  | No `navigator.locks`: no check; a failed lock: unpersisted      | Ps.O7     | —               | S05+          |
| 15  | `forget` and `dispose({ forget: true })`                        | Ps.O5     | S13 S27         | kept          |
| 16  | A capture is rejected for a non-durable provider                | Ps.O3     | S13             | kept          |

**Restore.**

| #   | Variation                                                                | Plan      | Before  | Now           |
| --- | ------------------------------------------------------------------------ | --------- | ------- | ------------- |
| 1   | Lanes in creation order, endings in saved order, queued `Restored` first | Ps.O5     | S08     | kept          |
| 2   | An acknowledged Attempt: `unknown { Restored }` once                     | Ps.O5     | S16 S25 | kept          |
| 3   | A kill before the first send's batch lands: pre-turn state, no lane      | Ps.O5     | S16     | kept          |
| 4   | Restored resource data starts stale; a live placement refetches          | Ps.O5     | S07     | kept          |
| 5   | An `every` feed restores its bookmark, `latest` its last value           | Ps.O5     | S11     | kept          |
| 6   | An older record format is stepped; a newer one is quarantined            | Ps.O5     | —       | S25+          |
| 7   | An undecodable record is quarantined; `ensure` starts fresh              | Ps.O5     | —       | S25+          |
| 8   | `RecordShapeChanged` and `FieldDropped`                                  | Ps.O5     | S25     | S28.12        |
| 9   | `HoldWithoutRecord`: a held head whose record was reset                  | Ps.O5     | —       | S25+, S28.12  |
| 10  | An old-version lane is re-keyed; `OldVersion` declines                   | Ps.O5     | S25     | kept          |
| 11  | A failed storage read disables persistence, flushes the boot queue       | Ps.O5     | —       | S08+          |
| 12  | Restore never reruns creation; computed initials stay as saved           | Ps.O5     | S27     | kept          |
| 13  | A restored subroutine leaf, `.each` copies and resumable slices          | Ps.O2, O5 | —       | S28.11 S29.10 |

**Lazy features.**

| #   | Variation                                                            | Plan  | Before | Now           |
| --- | -------------------------------------------------------------------- | ----- | ------ | ------------- |
| 1   | A send before adoption is dropped `NotAdopted`                       | LF.O2 | S19    | kept          |
| 2   | `ensure` adopts; a failed load (`EntryLoadFailed`) retries next call | LF.O1 | S19    | kept          |
| 3   | A dormant record restores at adoption, never at ready                | LF.O3 | S19    | kept          |
| 4   | A loader returning another id or object: `EntryMismatch`             | LF.O2 | —      | S19+          |
| 5   | A dormant record undecodable at adoption: fresh start                | LF.O3 | —      | S19+          |
| 6   | A lazy entry that carries fragments                                  | LF.O1 | —      | S28.11 S29.10 |
| 7   | A dormant uncertain write marks entities and repairs before adoption | LF.O3 | —      | not placed    |
| 8   | Reads, `getSnapshot` and capture never adopt                         | LF.O2 | S19    | kept          |
| 9   | A lazy entry's context; a restored consumer takes it silently        | LF.O3 | —      | S28.11        |
| 10  | An adopted actor receives `unknown { Restored }`                     | LF.O3 | —      | S28.11        |

Row 7 needs a lazy entry that owns a domain write, and no realistic part here has one. It stays open and is listed
with the unreached pairs below.

**Several actors and tabs** (the rest of this family is in section 4's `in`, `lc`, `sd`, `sn`, `ma`, `mt` columns).

| #   | Variation                                                            | Plan  | Before | Now     |
| --- | -------------------------------------------------------------------- | ----- | ------ | ------- |
| 1   | An `ensure` during an ending binds the next incarnation              | Rt.O3 | —      | S14+    |
| 2   | The send table's live, queued and dropped rows reach a fragment host | Rt.O4 | S04    | S28.3   |
| 3   | Rotation: bulk work on one actor does not starve another             | Rt.O4 | —      | app mix |

### New parts

#### S28 Field visit with a resolve wizard (field-service app) — R, context and lazy N

Models a technician who resolves a ticket on site through a wizard: reason, parts and sign-off. The wizard is a
subroutine. Its parts are `.each` copies, its sign-off pad is a resumable trait, and a nested dialog confirms a
discard. The host owns every write, the wizard owns one read, and leaving the wizard any other way hands its draft
back.
**Features:** rj, se, ky, cm, rt, un, gd, du, ks, cs, fr, ea, lk, wa, rl, up, cx, gr, lr, lz, in, ci, pv, ck, hs,
rn, sd, sn, is, su, nf, rz, ro, po.
**Targets:** Turn I3, I5, I10, I11, I26, I27 (owed T8 in part); Restore I1, I6 (owed T11); `B[Held·serialize]`,
`G[Held·reload]`, `G[Held·release]`.
**Prior art:** `references/dispatch-desk/features/Resolve/` (`visit.machine.ts`, `resolve-wizard.subroutine.ts`).

```ts
const resolve = tx("Visit/resolve", { ticketId: S.String, resolution: Resolution }, { key: ["ticketId"],
  concurrency: "reject" })                                            // success writes: invalidate the history
const reserve = tx("Visit/reserve", { ticketId: S.String, part: S.String }, { key: ["ticketId", "part"],
  concurrency: "serialize" })
const release = tx("Visit/release", { ticketId: S.String, parts: S.Array(S.String) }, { key: ["ticketId"],
  concurrency: "serialize" })                                         // compensation for an abandoned wizard
const stock = rd("Visit/stock", { part: S.String }, { key: ["part"] })
const upload = tx("Visit/signature", { ticketId: S.String, png: S.String }, { key: ["ticketId"],
  concurrency: "latest" })                                            // bare: a write under a subroutine
const PartLine = trait(declaration({                                  // R14: trait; planned: under a subroutine
  events: { Remove: {} }, internalEvents: { Recheck: {}, Stock: { n: S.Number }, StockFailed: {} },
  callbacks: { onRemove: Flow.Callback({ part: S.String }) },
  memory: { part: Flow.input(S.String), n: Flow.initial(S.NullOr(S.Number), null) },
  operations: ({ E }) => ({ stock: stock.outcomes({ success: E.Stock, failure: E.StockFailed }) }),
}), ({ E, O, callbacks }) => ({
  schedules: { recheck: { schedule: "30 seconds", send: E.Recheck, armOn: [Flow.entry, "Recheck"] } },
  on: { Recheck: { actions: [O.stock.lookup(({ memory }) => ({ part: memory.part }))] },
    Stock: { updateMemory: ({ event }) => ({ n: event.n }) }, StockFailed: {},
    Remove: { notify: [callbacks.onRemove.from(({ memory }) => ({ part: memory.part }))] } },
}))
const Signature = trait(declaration({ events: { Signed: { png: S.String } },
  callbacks: { onSigned: Flow.Callback({ png: S.String }) }, operations: () => ({ upload }) }),   // bare form
  ({ O, callbacks }) => ({ on: { Signed: { actions: [O.upload.commit(/* ticketId, png */)],
    notify: [callbacks.onSigned.from(({ event }) => event)] } } }))
const ConfirmDiscard = subroutine(declaration({ events: { Keep: {}, Discard: {} },     // a leaf subroutine
  exits: { Kept: Flow.Exit({}), Discarded: Flow.Exit({}) } }), ({ exits }) => ({
  on: { Keep: exits.Kept, Discard: exits.Discarded } }))
const Wizard = subroutine(declaration({                                // R14: compound; planned: exits, ports
  states: [{ STEPS: ["REASON", "PARTS", { SIGNOFF: Flow.state({ traits: { sig: Signature.resumable() } }) }] },
    { DISCARD: ConfirmDiscard }], default: "STEPS",
  events: { Reason: { text: S.String }, AddPart: { part: S.String }, Next: {}, Back: {}, Cancel: {}, Submit: {} },
  hostEvents: { JumpTo: { step: Step } }, internalEvents: { Idle: {} },
  guards: { canResolve: Flow.Guard }, callbacks: { onPartAdded: Flow.Callback({ part: S.String }),
    onDraft: Flow.optional(Flow.Callback({ draft: Draft })) },
  exits: { Resolved: Flow.Exit({ resolution: Resolution }), Abandoned: Flow.Exit({ parts: S.Array(S.String) }) },
  memory: { draft: Flow.input(Draft), parts: Flow.initial(S.Array(Line), ({ draft }) => draft.parts),
    signed: Flow.initial(S.NullOr(S.String), null), steps: Flow.private(Flow.initial(S.Number, 0)) },
  traits: { lines: PartLine.each({ of: "parts", by: "part", max: 20 }) },
}), wizardBody)
// wizardBody: PARTS.AddPart → "self", parts + 1, notify onPartAdded; lines.onRemove → drop the part
//   SIGNOFF: schedules { idle: "10 minutes" → Idle }; Idle → exits.Abandoned; sig.resetOn: parts joined by ","
//   SIGNOFF.Submit → guard [guards.canResolve, signed !== null || deny("NotSigned")], target exits.Resolved.from(…)
//   DISCARD exits: Kept → S.STEPS.history; Discarded → exits.Abandoned.from(({ memory }) => parts)
//   on.Cancel → S.DISCARD; on.JumpTo → alternatives per step, the last unguarded; whenAbandoned: [onDraft.from(…)]
const Visit = definition({                                           // value-named by { ticketId, assignee }
  id: "Field/Visit", persist: true, states: ["ON_SITE", { RESOLVING: Wizard }, "RESOLVED", "RELEASING"],
  events: { Start: {}, Step: { step: Step }, CalledAway: {}, Note: { text: S.String }, Ping: {}, Done: {} },
  context: { me: Session.select(({ memory }) => memory.userId) },     // planned: context slots, onContext
  memory: { ticketId: Flow.input(S.String), assignee: Flow.input(S.String), draft: Flow.initial(Draft, empty),
    notes: Flow.initial(S.Array(S.String), []) },
})
// RESOLVING filling: input draft; canResolve: context.me === assignee || deny("NotAssignedToYou");
//   onPartAdded → O.reserve.commit; onDraft → draft; on.Step → "self", raise E.RESOLVING.JumpTo.from(event)
//   exits: Resolved → RESOLVED with O.resolve.commit; Abandoned → RELEASING with O.release.commit(parts)
// ON_SITE.on.Start → S.RESOLVING; RESOLVING.on.CalledAway → S.ON_SITE with O.release.commit(held parts)
// root: on.Ping "self"; on.Note "self" (append); Reserved and ReserveRefused [{ target: S.ON_SITE }, "self"]
// onContext: [{ select: ({ context }) => context.me, when: ({ value }) => value !== assignee, event: E.CalledAway }]
// app: { id: "Field/Visit", load: () => import("./visit.ts"), context: { me: SessionRef } }   // planned: lazy
```

**Steps** (each a user-model command; numbers are cited in the tables above):

1. `Start` enters RESOLVING at STEPS.REASON with the draft as input; `parts` is computed from it; the snapshot
   gains the `RESOLVING` slice.
2. `Step("parts")` raises `JumpTo`; the wizard's alternatives choose the step; `check()` explains a denied jump.
3. `Note` is unhandled in the wizard and falls through to the root; `Ping` is the root's `"self"` and abandons
   nothing; a dispatcher actor's action `send(visit, CalledAway)` meets the live row of the send table.
4. `AddPart` three times adds copies keyed `by: "part"`; each copy's `recheck` arms on entry and looks up stock;
   `onPartAdded` commits `reserve`, and a second add of one part queues on its lane; a copy's `Remove` notifies
   `onRemove` with its key and the host's list drops it.
5. `Submit` runs the `canResolve` port, which reads `context.me`; the exit `Resolved` carries the resolution, the
   host commits `resolve` with an `invalidate` write, no `whenAbandoned` runs, and the slice becomes undefined.
6. `Cancel` enters DISCARD; `Keep` exits to `S.STEPS.history`, back at PARTS; `Cancel`, then `Discard`, takes the
   wizard's `Abandoned` exit, and the host commits `release`; a `reserve` success that lands after this is late and
   its handler starts no move.
7. At SIGNOFF, `Signed` commits the bare `upload`: its endings are evidence, and an unknown is released; `Back`
   freezes `sig` while the upload continues; returning thaws it; adding a part changes its `resetOn`, so it
   resets; ten idle minutes fire `Idle` and take the `Abandoned` exit.
8. `CalledAway` at PARTS abandons the wizard: `whenAbandoned` hands back the draft in that turn, every copy ends,
   a copy's stock lookup parks `Interrupted`, and `release` is committed.
9. `Start` again resumes from the handed-back draft; then the session changes user, and the `onContext` event
   `CalledAway` abandons the wizard a second time.
10. A `reserve` committed in an earlier RESOLVING activation answers `OutOfStock` after the re-entry: the ending is
    late, routed to the root, and the alternative that targets ON_SITE is denied `LateMayNotLeave`, so `"self"`
    runs.
11. Reload at PARTS with `sig` frozen, three copies and a Held `reserve`: the Visit is a lazy entry, so its dormant
    record restores at adoption on the next `ensure`. The leaf path, the wizard slice, the copies with their
    incarnation counters, the frozen `sig` slice and the STEPS history child come back. The context baseline is
    silent, and `unknown { Restored }` is delivered once, current from the active leaf.
12. Release 2 adds `photos` to `Draft`: the saved shape changes, the record resets (`RecordShapeChanged`), and the
    Held `reserve` head reports `HoldWithoutRecord`.

#### S29 Ticket panels with field autosave (help-desk ticket view) — R, keyed schedules and catch-up N

Models one ticket view per workspace window: History and Parts tabs whose traits freeze when the tab is left and
reset when the ticket changes, field autosave copies keyed by field with a per-field debounce, a parts hold with a
nested 15-minute timer, and a root flash trait that exists only after a save.
**Features:** lt, se, ky, cm, cA, rt, un, du, rs, ks, cs, fr, ea, st, wa, rl, cx, gr, lr, lz, in, pv, hs, rn, sd,
sn, dm, is, nf, rz, ro, po, sc, sf.
**Targets:** Turn I3, I6, I10, I11, I22, I24 (owed T8 in part); WriteLanes I12, I15; `B[OnWire·Release]`,
`B[Held·latest]`, `C[RecordedLetGo·Delivering]`, `G[OnWire·reload]`.
**Prior art:** `references/dispatch-desk/features/Tickets/panels/`, `features/Tickets/editor/editor.machine.ts`.

```ts
const history = stream({ id: "Desk/history", input: { ticketId: S.String }, key: ["ticketId"], delivers: "every",
  position: "seq", catchUp: ({ ticketId }, at) => Api.history(ticketId, at), reconnect: {}, idleTime: "45 seconds",
  open: ({ ticketId }) => Feed.multiplex(socket, ticketId) })        // R14: sessions; planned: catchUp, idleTime
const hold = tx("Desk/hold", { ticketId: S.String, part: S.String }, { key: ["ticketId", "part"],
  concurrency: "serialize" })
const saveField = tx("Desk/saveField", { ticketId: S.String, field: S.String, value: S.String },
  { key: ["ticketId", "field"], concurrency: "latest" })
const Flash = trait(declaration({ internalEvents: { Fade: {} }, memory: { field: Flow.input(S.String) } }),
  ({ E }) => ({ schedules: { fade: { schedule: "2 seconds", send: E.Fade, armOn: [Flow.entry] } } }))
const History = trait(declaration({ hostEvents: { Highlight: { seq: S.Number } },
  internalEvents: { Line: Line, Missed: {}, Gone: {} }, callbacks: { onGone: Flow.Callback({}) },
  memory: { ticketId: Flow.input(S.String), lines: Flow.initial(S.Array(Line), []),
    anchor: Flow.private(Flow.initial(S.Number, 0)) },
  operations: ({ E }) => ({ history: history.outcomes({ value: E.Line, missed: E.Missed, fills: "lines",
    failure: { Gone: E.Gone, Silent: E.Missed /* …every Feed reason */ } }) }),
}), ({ O, callbacks }) => ({ activities: [O.history.subscribe(({ memory }) => ({ ticketId: memory.ticketId }))],
  on: { Highlight: { updateMemory: ({ event }) => ({ anchor: event.seq }) }, Gone: { notify: [callbacks.onGone] } } }))
const Timer = trait(declaration({ hostEvents: { Start: {}, Stop: {} }, internalEvents: { Expired: {} },
  callbacks: { onExpired: Flow.Callback({}) } }), ({ E, callbacks }) => ({   // no Start or Stop handler: implicit
  schedules: { expire: { schedule: "15 minutes", send: E.Expired, armOn: [E.Start], disarmOn: [E.Stop] } },
  on: { Expired: { notify: [callbacks.onExpired] } } }))
const Parts = trait(declaration({ events: { Reserve: { part: S.String }, ReleaseAll: {} },
  internalEvents: { Held: {}, NotHeld: {}, HoldUnsure: Flow.uncertain({}) }, traits: { timer: Timer },
  memory: { ticketId: Flow.input(S.String) }, operations: ({ E }) => ({ hold: hold.outcomes({ success: E.Held,
    failure: { NotSent: E.NotHeld }, unknown: E.HoldUnsure }) }) }), ({ E, O }) => ({
  traits: { timer: { callbacks: { onExpired: { actions: [O.hold.cancelAll] } } } },
  on: { Reserve: { actions: [O.hold.commit(/* ticketId, part */)], raise: [E.timer.Start] },
    ReleaseAll: { actions: [O.hold.cancelAll], raise: [E.timer.Stop] }, Held: {}, NotHeld: {},
    HoldUnsure: [{ guard: [O.hold.retryable({ times: 1 })], actions: [O.hold.retry] }, {}] } }))
const Check = trait(declaration({ callbacks: { onInvalid: Flow.optional(Flow.Callback({})) } }), checkBody)
const Autosave = trait(declaration({ hostEvents: { Flush: {} }, internalEvents: { Saved: {}, SaveFailed: {},
  SaveUnsure: Flow.uncertain({}) }, callbacks: { onSaved: Flow.Callback({ field: S.String }) },
  memory: { field: Flow.input(S.String), value: Flow.input(S.String), saved: Flow.initial(S.String, "") },
  traits: { check: Check }, operations: ({ E }) => ({ saveField: saveField.outcomes({ success: E.Saved,
    failure: { NotSent: E.SaveFailed }, unknown: E.SaveUnsure }) }) }), ({ O, callbacks }) => ({
  on: { Flush: { guard: [({ memory }) => memory.value !== memory.saved || deny("Clean")],
      actions: [O.saveField.commit(/* ticketId, field, value */)] },
    Saved: { notify: [callbacks.onSaved.from(({ memory }) => ({ field: memory.field }))] },
    SaveFailed: {}, SaveUnsure: {} },
  whenAbandoned: [O.saveField.cancel] }))                              // check fills no onInvalid: ignored
const Ticket = definition({                                          // value-named by { workspaceId }
  id: "Desk/Ticket", persist: true,
  states: ["CLOSED", { OPEN: Flow.state([{ TABS: [
    { HISTORY: Flow.state({ traits: { history: History.resumable() } }) },
    { PARTS: Flow.state({ traits: { parts: Parts.resumable() } }) }] }],
    { traits: { fields: Autosave.each({ of: "dirty", by: "field", max: 3 }) } }) }],
  events: { Open: { ticketId: S.String }, Close: {}, Tab: { tab: Tab }, Edit: { field: S.String, value: S.String },
    Show: { seq: S.Number } },
  internalEvents: { Settled: { field: S.String } },
  context: { canEdit: Session.select(({ memory }) => memory.canEdit) },
  memory: { workspaceId: Flow.input(S.String), ticketId: Flow.initial(S.String, ""),
    dirty: Flow.initial(S.Array(Dirty), []), lastSaved: Flow.initial(S.NullOr(S.String), null) },
  traits: { flash: Flash },
})
// root: flash.resetOn: ({ memory }) => memory.lastSaved (null: not placed); onContext canEdit false → Close
// OPEN.schedules.settle: { keys: dirty fields, restartOn: ({ key, memory }) => value of that key,
//   schedule: "800 millis", send: E.Settled.from(({ key }) => key) }; on.Settled raise E.fields.Flush (key)
// fields filling: input from item; onSaved → lastSaved = field, drop it from dirty
// OPEN.on.Close: guard [Autosave.O.saveField.idle(({ memory }) => ({ ticketId: memory.ticketId }))] → CLOSED
// TABS.on.Tab → HISTORY | PARTS; history and parts: resetOn ({ memory }) => memory.ticketId; history.onGone → CLOSED
// HISTORY.on.Show raise E.history.Highlight; CLOSED.on.Open → S.OPEN.TABS.history
// app: { id: "Desk/Ticket", load: () => import("./ticket.ts"), context: { canEdit: SessionRef } }   // planned
```

**Steps:**

1. `Open(t1)` enters OPEN at TABS.HISTORY. The root `flash` is not placed (`lastSaved` is null). History is
   placed, and its session opens with no bookmark.
2. `Edit` on two fields: copies are added `by: "field"`, `settle` arms one timer per key, and `restartOn` restarts
   only the edited key's timer. `Settled` carries the key from its metadata. `Show` raises `Highlight` into
   History; the private `anchor` stays out of outside snapshots.
3. `Tab(PARTS)` freezes History: its session is released, the bookmark stays in the frozen slice, and the slice
   stays in the snapshot. `Tab(HISTORY)` thaws it: the session reopens from the bookmark through `catchUp` pages
   to `Feed.done`, and no `Flow.entry` schedule re-arms.
4. `Open(t2)` while on PARTS changes both `resetOn` values. The pending resets run as their own turns before the
   next event. Parts and the frozen History get new incarnations, and `whenAbandoned` runs for the old ones.
   History's key changes, so `fills` is emptied in that turn, and t1's issue is not inherited.
5. `Settled(summary)` raises `Flush` into the `summary` copy, which commits `saveField`. A `Flush` into a clean
   copy is denied (`Clean`), so the whole turn is refused and nothing is published. `Saved` notifies `onSaved`
   with the field. The root `flash` becomes present and `fade` arms. A second save resets `flash`.
6. `Reserve(p1)` commits `hold` and raises `timer.Start` into the nested trait; `Start` has no handler, so the
   implicit `"self"` arms `expire`. `ReleaseAll` runs `cancelAll` and raises `Stop`. `check`'s unfilled optional
   `onInvalid` is ignored. Raises and notifies run depth first in written order.
7. `Reserve(p2)`, then `Tab(HISTORY)`: Parts freezes while the `hold` Attempt stays on the wire, and its ending
   parks for the frozen slice. `expire` keeps its `dueAt`. After 20 minutes, `Tab(PARTS)` thaws Parts, the
   overdue `expire` fires once, and `onExpired` cancels every hold.
8. `Close` is denied while a field save is in flight (`Autosave.O.saveField.idle`), then accepted. Leaving OPEN
   stops the copies and panels deepest first. The copies' `whenAbandoned` releases their lanes; Parts and History
   freeze. A `catchUp` that answers `Feed.gone` makes History notify `onGone`, whose filling targets CLOSED. An
   `onContext` wave with `canEdit` false closes the view the same way.
9. `Open(t2)` from CLOSED targets `S.OPEN.TABS.history`. It returns to the last tab and thaws that tab's slice,
   because data comes back only through `.resumable()`. A view reads `S.OPEN.TABS.history.child`.
10. Reload with OPEN active, Parts frozen and two dirty fields. The Ticket is a lazy entry, adopted on the next
    `ensure`. These come back: the frozen slices with their schedules and parked endings, the copies with their
    incarnation counters, the `settle` timers by key (restored memory keys win), silent `restartOn` baselines, the
    history child and the bookmark. A saved reset value is compared with the restored one, and a difference runs
    the reset first.

### Additions to existing parts

One line per part, as in the Plan-check section. Codes in brackets are new to that part.

- **S01** `DiscardDraft` runs `O.save.cancelAll` on the `latest` lane. [cA]
- **S02** The one-off read row is undefined before the first lookup and after `cancel`, and `cancel` releases only
  the wait, never the shared request.
- **S03** `ClearAll`, then an unmount and a remount within the grace. An outcome mapper that throws is redelivered
  once, and the second refusal is final. [gr]
- **S04** `messages` becomes `delivers: "every"` with `position: "seq"` and `catchUp`. It maps `missed`
  (`Unproven`, `Lost`, `Reset`), `fills: "log"` and pages, and opens with `Feed.live { proof }`. A malformed `seq`
  ends `Defect`. An `Arrived` from a blocked sender is denied, and the bookmark moves with `DeliveryDenied`. A
  `select` that throws leaves a `UserClosure` issue. [sc, sf]
- **S05** Without `navigator.locks` there is no ownership check. A failed lock request runs the tab unpersisted
  with `StorageFailure`.
- **S06** Read `AddressStep` as a subroutine. Its exit `Done { address }` feeds the quote, and `whenAbandoned`
  gives up its postcode lookup. [su, po]
- **S07** A `Show` with a duplicate id keeps the first copy (`listRepair`), and a reordered list keeps every copy.
  Removing a panel mid-poll makes its lookup ending evidence. A `Failure` keeps the last value. `poll` becomes
  `Schedule.spaced("10 seconds")`, which restarts at step one after a reload. Ten panels on one deadline fire as
  separate turns in admission and declaration order. A filter box debounces with `restartOn`, and `Tick` reads
  `attempt`. [rs, dm]
- **S08** `Wake` reads `attempt` through `E.Wake.from`. A definite failure after an unknown of one Attempt ends
  `StillUnknown`. A hanging write reports `StorageSilent` after 10 s. A failed storage read at boot disables
  persistence and flushes the boot queue. [dm]
- **S09** A forced repair that fails three times gives `RepairOverdue`, and news re-asks. A lower-version answer is
  `Stale`. A released unknown leaves a given-up mark that asks one read. [er]
- **S10** A negative `Retry-After` rejects the arming turn. The cooling schedule becomes `Schedule.min` of a
  jittered exponential and a spaced one. An ending refused twice is kept and blocks its key until a cancel.
- **S11** `Feed.ping` with `idleTime` ends `Silent`, and `"Infinity"` disables it. `reconnect.while` and a custom
  schedule replace the default. The multiplex uses `emit.all` and `emit.fail(e, key)`, and a joiner hears
  `Feed.live` at once. `Feed.live { restartAt }` restarts the log, and `refetch` forgets the bookmark. A non-key
  input change keeps the session. [sf]
- **S12** `StopAll` runs `cancelAll` on the `cancel` lane. [cA]
- **S13** A diamond: Session feeds Client and Profile, and the Composer consumes both, getting one update per wave.
  An equal token is silent. A `when` that declines still moves the baseline. A throwing selector keeps the last
  context. Disposing the Session while bound is `BlockedByDependents`. A capture waits for the wave. [dp]
- **S14** The line total is a field function, and `alsoChanges: Entity.fields(cart, ["total"])` stays unconfirmed
  until a confirming read. The header's mini-cart and the cart page write one line through one record queue, and
  the 65th waiting write is `Overloaded`. An unversioned line note that differs between answers is contested. A
  cart that ended returns to one context wave. An `ensure` during its ending binds the next incarnation. 5,000
  ended carts reach the scope bound. [er]
- **S15** Rows are reordered and keep their copies. A row deleted and re-added gets a new incarnation. A row's
  `Discard` runs `cancelAll` and notifies `onRemove` with its key, and the release wins. A row is removed with one
  Attempt on the wire and one queued. A value outside its encodable Schema ends `NotSent { Unencodable }` and keeps
  the last good capture. A reload restores copies with their counters. [po, rl]
- **S17** Peers are read through `subscribe.each`. A peer that leaves releases its key (`SelectedNoKey`). A rejoin
  within 5 s waits for the releasing predecessor, and a held release reports `ReleaseOverdue`. Over 1,024 queued
  frames is `Overflow`. Over 256 peer keys drops the oldest bookmark. Undelivered frames of a released session are
  evidence. [sc, sf]
- **S18** An unread count `derivedFrom` the list. Paged repair starts from page one, and a failed page keeps the
  chain. A misordered page reports `HiddenOrder`. The search list is server-ranked with `unaffectedBy`. `archive`
  takes many ids; a failed delete restores the record. A body 404 is `.gone("NotFound")`. `listen(changes)` deltas
  cannot resurrect a tombstone. A sent mail joins the list only on refetch. [er, ls]
- **S19** A loader that returns another id is `EntryMismatch`. A dormant record undecodable at adoption starts
  fresh with `RecordUndecodable`.
- **S20** `Play` while BUFFERING re-enters it as a new activation, so the old track lookup is late. `Resume`
  before any play returns to the default child. A tick of an ended activation is dropped.
- **S22** Moving a card across boards patches two records and waits to be first in both queues. `guarded: true`
  ends a quiet mark. A never-sent move rebases over an earlier same-base move. A predicted move keeps the card in
  its old column until repair. `listen(boardChanges)` applies peers' moves. A restored uncertain move forces a
  repair at boot. [er, ls]
- **S23** Each device is a `Device` trait copy with its own readings stream, released once when the device is
  removed (`Interrupted`). `setpoint` becomes a domain write that predicts `Device.setpoint`, so an interrupted
  Attempt keeps the prediction until the forced repair. [fr, ea, en, er]
- **S25** A newer record format is quarantined while its lane holds. An undecodable record makes `ensure` start
  fresh. A head whose record was reset reports `HoldWithoutRecord`.

### Composites and the matrix

**Two new composites (proposed).** Each holds one part, because each part already uses its operation budget or its
80 lines:

| Composite       | Parts | Operations | Features | What it combines                                                  |
| --------------- | ----- | ---------- | -------- | ----------------------------------------------------------------- |
| J Field visit   | S28   | 5          | 34       | nested subroutines; a copy and a resumable trait inside; lazy     |
| K Ticket panels | S29   | 3          | 34       | resumable and reset traits, nested traits, keyed timers, catch-up |

J and K are larger in features than C (27). If shrinking stops at its bound or a shrunk case passes about 15
steps, J splits into the host and the wizard, and K into the panels and the fields. The 5A composites keep their
parts. Their feature counts become A 21, B 22, C 31, D 20, E 20, F 23, G 14, H 19 and I 18 over the 53 codes. The
counts rise because of the additions above.

**New feature codes** (each with its interaction channels, used by the estimates below):

| Code | Feature                                                                  | Channels      |
| ---- | ------------------------------------------------------------------------ | ------------- |
| su   | subroutine exits, results, `hostEvents`, abandonment, `LateMayNotLeave`  | W, I, P       |
| nf   | nested fragments: trait in trait, `.each` or a trait inside a subroutine | I, P          |
| rz   | `.resumable()` freeze and thaw                                           | W, R, T, I, P |
| ro   | `resetOn` and pending resets                                             | W, I, P       |
| po   | guard and callback ports, `Flow.optional`                                | pure-turn     |
| sc   | stream catch-up and bookmarks: `position`, `catchUp`, `missed`, `fills`  | R, P          |
| sf   | stream signals and failures: `Feed.live`, `ping`, `idleTime`, release    | R, T          |
| er   | entity repair depth: `alsoChanges`, `derivedFrom`, queues, marks, paging | W, R, P       |
| ls   | `listen` entries: deltas, `covers`, tombstones                           | R             |

**Matrix extension.** This block extends both blocks in section 4. Those blocks stay as they were.

```text
shape          rj lt se ca ky cm cA rt un du ms rs ks gd cs fr ea lk sb op en st wa rl up sr dp ma cx gr lr of ad mt lz
S28 visit      x  .  x  .  x  x  .  x  x  x  .  .  x  x  x  x  x  x  .  .  .  .  x  x  x  .  .  .  x  x  x  .  .  .  x
S29 panels     .  x  x  .  x  x  x  x  x  x  .  x  x  .  x  x  x  .  .  .  .  x  x  x  .  .  .  .  x  x  x  .  .  .  x

shape          in ci pv lc ck hs rn sd sn dm fz sw ph kb os pg fg is
S28 visit      x  x  x  .  x  x  x  x  x  .  .  .  .  .  .  .  .  x
S29 panels     x  .  x  .  .  x  x  x  x  x  .  .  .  .  .  .  .  x

shape          su nf rz ro po sc sf er ls
S04 chat       .  .  .  .  .  x  x  .  .
S06 wizard     x  .  .  .  x  .  .  .  .
S09 like       .  .  .  .  .  .  .  x  .
S11 ticker     .  .  .  .  .  .  x  .  .
S14 cart       .  .  .  .  .  .  .  x  .
S15 grid-rows  .  .  .  .  x  .  .  .  .
S17 presence   .  .  .  .  .  x  x  .  .
S18 inbox      .  .  .  .  .  .  .  x  x
S22 kanban     .  .  .  .  .  .  .  x  x
S23 thermostat .  .  .  .  .  .  x  x  .
S28 visit      x  x  x  x  x  .  .  .  .
S29 panels     .  x  x  x  x  x  x  .  .
shapes         2  2  2  2  4  3  5  5  2
```

Existing codes added to earlier parts: S01 cA, S03 gr, S07 rs and dm, S08 dm, S12 cA, S13 dp, S15 rl, and S23 fr,
ea and en. Every new code is reached by at least 2 parts.

### Pair and triple estimates, recomputed

5A's script is not in the checkout, so these figures come from a new script over the section 4 matrices and the
channel table in 5A. In this script a pair interacts when both features touch one channel, or when one is a
lifecycle owner and the other is not pure-turn (gd, ck, rn, po); the four policies never interact with each other.
This rule gives 671 interacting pairs over the 53 codes, where 5A reports 777. The before and after columns below
both use the new rule, so they compare like with like. 5A's own figures stay as written. Pairs are what the
combination gate enforces; triples are reported, never gating.

| Measure (app mix = all composites in one runtime) | 53 before | 53 after | 62 before | 62 after |
| ------------------------------------------------- | --------- | -------- | --------- | -------- |
| Interacting pairs                                 | 671       | 671      | 950       | 950      |
| Reached by composites alone                       | 510       | 564      | 510       | 768      |
| Reached by composites and app mix                 | 602       | 645      | 602       | 880      |
| Unreached                                         | 69        | 26       | 348       | 70       |
| Triples reached by composites                     | 2,321     | 2,873    | 2,321     | 4,546    |

The 4 pairs 5A lists as buildable now are closed: `lt`+`cA` (S01+), `ca`+`cA` (S12+), `cA`+`gr` (S03+) and
`cs`+`ea` (S28, S29). The 70 still unreached over 62 codes:

- **Lazy entries (13):** `lz` with `ca ms sb op en fz sw ph kb os pg er ls`. They are waived until a runtime builds
  lazy entries. `lz`+`er` is the Lazy table's row 7.
- **Reads extras (26):** `os`, `pg`, `ph`, `sw`, `kb` and `fz` with each other and with `rz`, `sc` and `sf`. They are
  waived as in 5A until reads reach a runtime.
- **Local actors with fragments (5):** `lc` with `ks ea nf rz ro`. These are buildable: give S21's local sign-in a
  trait. Not added, because no real sign-in screen needs one.
- **Fragments with entities, streams or other lanes (26):** for example `su`+`sc`, `su`+`er`, `ca`+`su`,
  `ca`+`rz`, `en`+`rz`, `rz`+`er` and `sc`+`er`. These are waived until a real app shape wants them. The nearest
  fix is a domain write in K's Parts trait.

### Combinations that matter most, per family

Each combination names the step that reaches it. These join 5A's hand-tracked stacks.

- **Subroutines:** a reload with the leaf inside the wizard, three `.each` copies, a frozen resumable trait and a
  Held `reserve`, inside a lazy entry (S28.11). A context wave that abandons the wizard while copies hold lookups
  and `reserve` has a queue (S28.9). A late ending after an abandon and a re-entry, met by `LateMayNotLeave`
  (S28.10). A release that resets a record whose head is Held (S28.12).
- **Traits:** a resumable trait frozen with a write on the wire and a nested timer armed, then thawed after the
  deadline (S29.7). A ticket change that resets a frozen trait whose stream is in catch-up (S29.4). A release on
  leave and a `cancelAll` in one transition (S15+).
- **`.each`:** a keyed `restartOn`, a raise into a copy, and removal of that copy while its save is queued
  (S29.5, S29.8). A duplicate-key repair, then a reload (S07+, S15+).
- **Context:** a diamond wave, a throwing selector and a capture that waits (S13+). A wave that leaves OPEN,
  freezing panels and ending copies (S29.8).
- **Streams:** a thaw that reopens from the bookmark through `catchUp` with `fills` (S29.3). `SelectedNoKey`, then
  a rejoin that waits on a release past `ReleaseOverdue` (S17+). `DeliveryDenied`, then a reload (S04+).
- **Entities:** a domain write on a `cancel` lane whose unknown holds the prediction and the record queue while
  the forced repair goes overdue (S23+, S09+). A multi-record move with a never-sent rebase (S22+). The 65th write
  across two actors (S14+).
- **Reads, writes and lanes:** `cancelAll` on `latest` and on `cancel` (S01+, S12+). `cancelAll` held through the
  grace (S03+). `StillUnknown` after a retry (S08+).
- **Schedules:** keyed timers restored by key against restored memory (S29.10). A multi-step Schedule restarting at
  step one after an overdue reload (S07+). A frozen schedule overdue on thaw (S29.7).
- **States and history:** history into a node whose resumable trait thaws, after a reload (S29.9, S29.10). A
  nested subroutine's exit to the outer `history` (S28.6).
- **Raise and notify:** a refused raise into a copy that refuses the whole turn (S29.5). A copy's notify that leads
  to a host commit (S28.4).
- **Persistence and restore:** `HoldWithoutRecord` after a shape reset (S28.12). A newer format quarantined with a
  Held lane (S25+). `StorageSilent` during a forced flush (S08+).
- **Lazy:** a dormant record with a subroutine leaf adopted after a reload, with `unknown { Restored }` delivered
  at adoption (S28.11).
- **Several actors and tabs:** rotation under a bulk sender in the app mix. An `ensure` during an ending (S14+).

Added hand-tracked stacks (5A, Higher orders): reload + subroutine leaf + `.each` copies + lazy adoption + unknown
Restored (J); freeze + write on the wire + nested timer overdue + thaw (K); context wave + subroutine abandon +
`serialize` queue + late ending (J); reset of a frozen trait + stream catch-up + `fills` (K).

### Plan gaps found (proposed for `revisit.md`; no Plan edited)

1. `.each` `max`: Machines.O1 names it, but going over it has no rule.
2. `.each` `by`: Machines.O1 names it, but its meaning is not stated. The reference apps use it as the item's key
   field.
3. A frozen trait's `resetOn`: the Plan does not say whether it runs while frozen or at thaw. The dispatch-desk
   panels assume a reset at return.
4. A raise into a trait that the same transition enters or thaws is undecided. The dispatch-desk panels comment
   says so.
5. A raise into a `.each` copy that the same turn removes is not covered by the rule on raises into exited
   fragments.

## 6. Benchmark reuse (P8)

**Verdict (proposed):** yes, the same module serves both suites, with one rule. A benchmark replays a script that
the conformance generator emitted, and it must do the same work, counted by the same fixture, as the judged run of
that script. No benchmark framework, no second fixture.

| Consumer       | Runtime                   | World                                   | Judged by                |
| -------------- | ------------------------- | --------------------------------------- | ------------------------ |
| Conformance    | round-14, production      | fake world, held answers, virtual clock | oracles, properties      |
| Core benchmark | production                | fake world, answers at once or sampled  | time; work must match    |
| Host benchmark | production, real host     | real timers, IndexedDB, local responder | time; work must match    |
| Browser suite  | production in the P6 apps | real browser (Chrome, Safari, iOS sim)  | not this catalogue's job |

- **One script:** `generate(shape, "usual", seed)` writes the step list as JSON once. Conformance replays it under
  oracles and records a **work fingerprint**: turns, publications, commits invoked by operation, requests by
  operation, batches landed and bytes written. A benchmark replays the same JSON with no observer and no oracles,
  and fails if its fingerprint differs. That is skill:check-benchmark's "compare the work done", and it catches
  P8's false pass: a benchmark that measures less work than the real path.
- **What differs:** no `observe` callback and no adapter decoding, so no Port overhead is timed. There is no
  settle-and-judge between steps. Network answers come at once (core cost) or after sampled latency (host). The
  host benchmark gets the shape's service as a real Effect Layer backed by the same `server` function behind
  `setTimeout`, and real IndexedDB through the production host (`src/host/browser.ts`). Faults are off, except in
  one degradation profile that times stress scripts with no oracles.
- **What it measures** (each tied to a shape, so a regression names an application):
  - turn cost per shape, median and p99, against the core's 0.2 ms per turn (AGENTS);
  - burst linearity: 10,000 against 100,000 events in S17 and S02, with a ratio under 30, as
    `prototypes/conformance/bench/burst.ts` judged;
  - capture: encode time, bytes per capture and batches per minute in S01, S08 and S24 (the 5 s coalescing);
  - restore: `ready()` time with N records and lanes (S08 with 64 queued, S16 with 500 keyed lanes, S14 with
    1,000 carts);
  - memory: retained heap after a long usual run, and after disposal as a leak check (S17 peers, S26 entries);
  - disposal: time to `RuntimeDisposed` with calls on the wire (S03, S12);
  - bundle size per feature set: each shape's import graph is a feature set (S21 needs no reads, S11 needs
    streams), so each shape's bundle is a tree-shaking probe;
  - on a real host: IndexedDB batch latency, the flush on `pagehide`, and timer drift (S07, S24).
- **Rules carried over:** benchmarks run alone, never beside other suites, per the parallel-runs memory. P8's
  slowed build per budget uses these scripts as its workload. The P6 apps remain the browser suite's subject:
  shapes are micro and meso benchmarks, not a replacement for real apps.
- **Cost:** a `bench` runner of about 150 lines that loads a script, boots the production runtime, times the
  replay and compares fingerprints. Fingerprints come from the observations that conformance already records.

## 7. Build order and costs

All estimates are proposed. Reach is estimated from the matrix and the tables, and must be measured once the
reach recorder exists.

**One-time infrastructure, before shapes:**

| Item                                                                    | Size         | Cost          |
| ----------------------------------------------------------------------- | ------------ | ------------- |
| `shape()` and the reference derived from `Compiled` (no hand rows)      | ~150 lines   | 0.5 day       |
| Spike: one shape source compiled by production and round-14's typed API | ~100 lines   | 0.5 day       |
| Generator, profiles and fault commands over the Case alphabet           | ~300 lines   | 1 day         |
| Shrinker output as scenario files; regressions folder in the suite      | ~120 lines   | 0.5 day       |
| Reach recorder: table cells, pair grid, mutants per shape               | ~100 lines   | 0.5 day       |
| Lifecycle model: roll back to the last landed capture at a kill (T44)   | owner's call | blocks stress |

**Wave 1: P shapes, on production and round-14, judged by today's oracles.** About 1 to 2 hours each.

| Order | Shape          | What it adds over Pay, Cells and the lab fixtures                                |
| ----- | -------------- | -------------------------------------------------------------------------------- |
| 1     | S08 outbox     | `serialize` and `cancelAll` on production; Held head with a queue; restore order |
| 2     | S23 thermostat | the `cancel` column on many keys; Interrupted then late answers                  |
| 3     | S03 uploads    | keyed `reject` with cancel, cancelAll and retry on one operation                 |
| 4     | S16 transfers  | refused acknowledgements; crash after acknowledgement; forget with Held lanes    |
| 5     | S01 autosave   | the `latest` column; Superseded; coalescing and hide; storage refusal            |
| 6     | S12 long job   | the `cancel` policy with polling; end with work in flight                        |
| 7     | S24 exam       | a persisted Computed deadline across reloads; forget                             |
| 8     | S22 kanban     | keyed `serialize` across two actors; reordered answers (flat; no predictions)    |
| 9     | S10 rate limit | many keyed `reject` lanes at once; `idle(k)`; webhook bursts                     |
| 10    | S02 typeahead  | one-off read lane supersession; the debounce; bursts                             |
| 11    | S21 sign-in    | a non-persisted actor; guards and cooldowns (flat)                               |

Wave 1 takes production from 2 fixtures to 13, and its Table B reach from `reject` plus Pay's members to every
column. For production, these 11 are most of the new reach this catalogue offers.

**Wave 2: R shapes, round-14 only until production builds traits, reads and streams (P4 onward).** About 2 to 3
hours each, plus the push channel (~150 lines) and the offline span (~40 lines) in the world. Order: S15 grid
rows, S06 wizard, S14 cart, S09 like, S04 chat, S20 player, S07 dashboard, S26 fan-out, S11 ticker, S18 inbox,
S17 presence, S25 upgrade (versions on production after T20). Their oracles are mostly owed (T8, T12), so until
those land they count for cell reach and mutants only. This wave becomes production reach as each runtime feature
lands.

**Wave 3: N shapes, blocked on a runtime feature or a world or Port addition.** S13 session (onContext), S05 two
tabs (a second page, about 200 lines), S19 lazy panel (a lazy loader, about 60 lines). It also fills the planned
columns of earlier shapes: rs in S01, S02 and S20; ms in S07, S08 and S10; ks in S23.

**Stop rule (T47):** add shapes while each one raises cell reach or mutation score. 15 is a floor, and 26 is a
catalogue to draw from, not a quota.

**Added by the Plan check and the combinations work (proposed, 2026-11-11):**

- **S27 workspaces and the 19 shapes changed by the Plan check** (S02, S03, S04, S06, S07, S09 to S16, S18, S20 to
  S22, S24 to S26: the matrix extension in section 4) are built with their parts. S27 is wave 3, N: it needs
  `Flow.input` with `actorRef` by value, `createActor`, `check()`, `snapshots`, `Flow.private` and
  `dispose({ forget: true })`. Each Plan-check addition lands in its shape as the runtime feature lands, wave by
  wave: P additions in wave 1, round-14 ones in wave 2.
- **Composites (section 5A).** Build each part in the wave order above, then compose: A and B after their wave-1
  parts (S01, S24, S08, S03, S22), C after S12, S23 and S16 and S20 (wave 1 and 2), then D to I with wave 2 and 3.
  A composite is a new module that imports its parts and adds no machine of its own beyond the glue.
- **App-mix profile:** built after the generator and before wave 2, with the 80-line mix runner. It first mixes the
  wave-1 composites (A, B, C), and gains D, E, F and the rest as they land. Pair coverage, 3-way and cell-pair
  reach come from the reach recorder, whose scope grows by about 60 lines.
- **Order:** infrastructure, wave 1 parts, A, B, C, app mix over them, wave 2 parts and D to I, wave 3. The
  combination gate starts as a report and becomes a gate once the interacting-pair list is generated from the matrix.

## 8. Open points for the user (proposed answers)

1. **One source on two runtimes.** Q: author each shape once in the production API and compile it with
   round-14's typed API too (round-11's typed fixtures show the APIs are close)? Proposed: yes, after the
   half-day spike. If the spike fails, wave-1 shapes run on production only, and round-14 stays the mutant host
   for the hand cases.
2. **A reference derived from `Compiled`.** It removes hand rows, but the selection oracle would then read the
   handler table that the compiler under test produced. Proposed: accept it. Round-14 compiles the same source
   independently, so a compiler misreading shows up as a difference between runtimes, and the Compile static
   cases check the compiler. Keep the hand fixtures as they are.
3. **App properties.** Proposed: allow zero to two per shape, anchored to the server's landed log. Without them,
   generated runs judge only the Invariants that have oracles. That is 72 of 183, and none in Reads, WriteAhead or
   most of Restore.
4. **Specs missing for features that shapes reach:** streams (S04, S11, S17, S23), entity domains (S09, S18, S22),
   lazy features (S06, S19). These are Plans outcomes with no core Spec, so no oracle can cite them. Proposed:
   note them in `revisit.md` and add no Spec now (Specs just in time).
5. **Gate size.** Proposed: 10 usual and 20 stress seeds per shape in the gate, and more in `soak`. Raise the
   count only if a soak seed finds what the gate seeds missed.
