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
