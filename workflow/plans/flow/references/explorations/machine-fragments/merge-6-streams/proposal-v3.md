# Streams: proposal (merge 6, v3)

Status: **everything here is proposed; nothing is accepted or built.** Only S11 and S12 of [decisions-v2.md](decisions-v2.md) are owner input. Requirement ids (G11, R4, ...) are rows of [requirements-v3.md](requirements-v3.md). Prior art: [proposal-v2.md](proposal-v2.md) (v2), [from-scratch-2/proposal.md](from-scratch-2/proposal.md) (blind), [prior-art-v2-assessment.md](prior-art-v2-assessment.md). Reviews: [RV1](reviews/v3-round-1.md), [RV2](reviews/v3-round-2.md), [RV3](reviews/v3-round-3.md). Trials: [agent trial](trials/agent-trial.md) (AT), [desk trial](trials/desk/RESULTS.md) (DT).

Marks in code are against v2: `// NEW`, `// RENAMED`, `// existing`, `// user-defined`, `// Effect`.

## 1. For the owner

**What this is.** A live feed in Flow, such as chat or a price. Your adapter says three things: a value arrived, the server is listening, the connection dropped. Flow does the rest. A Wi-Fi blip costs no machine state. A view cannot show an old price as current by accident. If messages may be missing the machine must handle it or the code does not compile, unless your adapter or memory shape breaks a rule in the table below.

**What changed from v2.** The behaviour you walked stays, with the same words.

1. **Flow keeps your place.** No `cursor` in memory or `input`. A bookmark is saved with the memory it describes.
2. **One line, `fills: "messages"`, names where the feed's data lives.** Flow then tells "never had anything" and "you cleared it" from "this memory was wiped". `fresh`, `initial` and the handler guard go.
3. **Reconnecting and the history read are declared on the contract**, and Flow runs them.
4. **`errors: [ChatDropped, SignedOut]`** types the rest.
5. **`Feed.done` needs a `proof`**, the same word as on `Feed.live`, since it claims nothing was missed.

**Cost.** 32 words against v2's 24. Desk trial, code lines: feed 382 to 303 (minus 21 percent), Presence 301 to 307, Assistant unchanged, `desk.fake.ts` about +22.

**Look at these first.**

1. **Rule 25 changes.** Flow re-runs a *connection* and fails a silent one when the contract declares it. It still never re-opens a session or a call. Why: the desk's hand-written deadlines were wrong (S-H1). Cost: F9's words, and streaming writes keep their own timeout, so one idea has two spellings. If you say no, Q5 falls back to v2's combinator.
2. **The default retries forever while offline,** and ends only after 8 connections in a row that register and die within a minute. A machine no longer learns of an outage by the session ending; it reads `connection`.
3. **F9, C8, F10, C2** need your reading (section 7).
4. **The agent got 2 of 8 cases right first time** from the doc. This document's recipes answer each miss; no agent has re-run on them.

**Decisions overturned** (S12 left them open): S3 repair in the adapter, now the contract. S4 position in memory, now Flow. S5 Q12's default. S6 Q15 page step, now `Feed.more`, `Feed.done`. S7 Q19 `Feed.CannotRepair`, now `Feed.gone`; Q21. S8 H1, H3. S9 H1. S10 `registered`, `initial`. M6-D3 the combinator. K2/OD12 position in `input`. O8/rule 25, in part. O5's spelling `lost`.

**Where loss stays silent.** One rule covers most: *the named field holds only this feed's items, in this slice.*

| Case | Who breaks it | Same in trimmed v2? |
| --- | --- | --- |
| Two feeds into one field; `subscribe.each` over a plain list (both have findings) | Memory shape | No |
| `fills: false` where a list exists | Memory shape | No |
| A wipe leaving a residue, such as a joined banner | Memory shape | No |
| `[]` by accident in a handler that stays placed: read as a clear | App bug | Yes: the cursor stays too |
| A list shortened by your own bug | App bug | Yes |
| A read with `from` set that is not a change log, or `Feed.done` whose `proof` is false; a lagging replica; a wrong `through` | Adapter | Yes |
| A first read that does not reach back to registration, then a reload | Adapter | Yes |
| An empty read with no head, outside `catchUp`; a from-now feed with no head (the desk's log today) | Source shape | Yes |
| A from-now log that drops between its first read's end and that `settle`'s admission | One queue turn | Yes |

In exchange, trimmed v2 has a silent case this does not: a forgotten `cursor: undefined` on any wipe line. RV3 and the coordinator judged the agent trial's findings **not a fourth High**: the accidental `[]`, a counter's duplicates and host-kept lists are the same or worse in v2, or stated limits.

**Unproven.**
- No Flow code, Story, vendor SDK or browser has run.
- **Trial evidence is limited:** the desk code type-checks against stand-ins written from this spec, which shows the spec's words agree, not that Flow can type them. 11 "compile error" claims fire there. The agent's code was not compiled.
- No agent has re-run on this text.
- Ably's resume event, Phoenix's rejoin and Firestore's `fromCache` are unconfirmed.
- Freeze, SSR payloads and the Persistence amendments are reasoned.
- The model is small, and mine (section 12).
- **Three review rounds each found a High in how the bookmark ties to memory. If a fourth turns up in code, RV3's advice is to fall back to trimmed v2, not to add more private state.** The clear mark in T3 is a third private value, added because the trial showed cleared items returning; it is the first place to look.

## 2. The answer in short

**Three ideas.**

**One: a bookmark, saved inside the memory it describes.** "This consumer was offered everything up to here." A Flow-private part of the slice's saved record: not a memory field, no patch, no guard reads it. Fresh memory is a fresh bookmark (`resetOn`, `.each` re-adds, subroutines, dispose then `ensure`). Flow moves it when a value's turn is admitted. Delivery is **at least once**.

**Two: `fills`, data.** Names the memory field this feed fills. A person writes only that. Flow tells three things apart:

| What happened to the field | Next connection |
| --- | --- |
| Never filled | Continues from the bookmark. On a first open, reads history, no notice |
| Emptied in a turn while the session stayed placed: **cleared** | Stays cleared, across reconnects, reloads, a later message and a room switch |
| Empty because a turn that released the session, or one while not placed, emptied it: **wiped** | Reads with `catchUp`, from the last clear if any, no notice. Without `catchUp`: `missed` |

**Three: contract data.** `reconnect`, `idle`, `catchUp`, `errors` are declared, and Flow runs one session table. A `latest` contract cannot type-check with `catchUp`, `position` or `restartAt` (F6).

## 3. The API

### 3.1 Chat in full

**Source.** A WebSocket: a greeting `hello`, then messages, a `ping` every 20 s, close 4401 on an expired token. A history endpoint whose pages say `complete` and `truncated`, and `head`, the newest position.

v2's lines:

```ts
// chat.contracts.ts
messages: stream({
  id: "Chat.messages",
  input: { roomId: Schema.String, after: Schema.optional(Cursor) },       // the author carries the position
  output: Message, key: ["roomId"], delivers: "facts",
  subscribe: ({ roomId, after }) => Stream.unwrap(Effect.map(ChatSocket, (chat) =>
    Feed.reconnect((from) => chat.room(roomId, from), {                   // a 22-line ChatSocket holds deadlines and classification
      from: after, position: (m) => m.cursor,
      while: (e) => e._tag === "ChatDropped",
      schedule: Schedule.exponential("500 millis").pipe(Schedule.jittered, Schedule.upTo({ times: 8 })),
      catchUp: (cursor) => fetchPage(roomId, cursor).pipe(
        Effect.mapError(() => new ChatDropped({ why: "History" })),
        Effect.flatMap((p) => p.truncated
          ? Effect.fail(new Feed.CannotRepair({ reason: "history starts later", continueAt: p.beforeOldest }))
          : Effect.succeed([p.messages, p.complete ? Option.none() : Option.some(p.next)] as const))),
    }))),
}),
// chat.definition.ts
memory: { roomId: Schema.String, messages: Schema.Array(Message), cursor: Schema.optional(Cursor), notice: Schema.optional(Schema.String), reopenInMs: Schema.Int },
internalEvents: { Loaded: { messages: Schema.Array(Message), head: Cursor }, LoadFailed: {}, Message: { message: Message },
  MayHaveMissed: { why: Schema.Literals(["Unproven", "Lost", "Reset"]), restartAt: Schema.optional(Cursor) },
  FeedEnded: {}, SignedOut: {}, Reopen: {}, Healthy: {} },
operations: ({ E }) => ({
  history: Chat.history.outcomes({ success: E.Loaded, failure: { HistoryFailed: E.LoadFailed, Defect: E.LoadFailed, Interrupted: E.LoadFailed } }),
  messages: Chat.messages.outcomes({
    value: E.Message.from((message) => ({ message })),
    missed: E.MayHaveMissed.from((m) => ({ why: m.why, restartAt: m.restartAt })),
    failure: { SignedOut: E.SignedOut, ChatDropped: E.FeedEnded, Closed: E.FeedEnded, Overflow: E.FeedEnded, Defect: E.FeedEnded, Interrupted: E.FeedEnded },
  }),
}),
// chat.machine.ts
LOADING: { entry: [O.history.lookup(({ memory }) => ({ roomId: memory.roomId }))],
  on: { Loaded: { target: S.LIVE, updateMemory: ({ event }) => ({ messages: event.messages, cursor: event.messages.at(-1)?.cursor ?? event.head }) },
        LoadFailed: { target: S.RETRY_WAIT } } },
LIVE: { activities: [O.messages.subscribe(({ memory }) => ({ roomId: memory.roomId, after: memory.cursor }))],
  on: { Message: { target: "self", updateMemory: ({ memory, event }) => ({ messages: upsert(memory.messages, event.message), cursor: event.message.cursor }) },
        MayHaveMissed: { target: "self", updateMemory: ({ memory, event }) => ({ notice: "Some messages could not be recovered.", cursor: event.restartAt ?? memory.cursor }) },
        FeedEnded: { target: S.RETRY_WAIT } } },
RETRY_WAIT: { schedules: { reopen: { schedule: ({ memory }) => Duration.millis(memory.reopenInMs), send: E.Reopen } }, on: { Reopen: S.LIVE } },
```

This design:

```ts
// chat.contracts.ts
messages: stream({                                                        // existing: stream
  id: "Chat.messages",                                                    // existing: id
  input: { roomId: Schema.String },                                       // existing: input. `after` is gone
  output: Message,                                                        // existing: output   // user-defined: Message
  key: ["roomId"],                                                        // existing: key
  delivers: "every",                                                      // RENAMED value: "facts" → "every" (S11)
  position: "cursor",                                                     // RENAMED shape: the NAME of a field of `output`. Its Schema comes with it
  errors: [ChatDropped, SignedOut],                                       // NEW: errors. Everything below is typed from this list
  idle: "45 seconds",                                                     // NEW: idle. This server pings every 20 s. No ping from your server: "never"
  reconnect: { while: ["ChatDropped"] },                                  // RENAMED: Feed.reconnect → reconnect, data. RENAMED shape: while, the tags Flow retries
  subscribe: ({ roomId }, { from, callback }) => callback((emit) =>       // existing: subscribe, from. RENAMED: Feed.callback → callback, in the context
    Effect.gen(function* () {
      const open = yield* Socket.WebSocketConstructor                     // Effect: the seam Stories replace. `new WebSocket` reaches no fake
      const ws = open(roomUrl(roomId, from))                              // user-defined: roomUrl
      ws.addEventListener("message", (e) => {
        const f = frameOf(e)                                              // user-defined: decodes WebSocketEvent
        if (f.t === "hello") emit(f.replayedFrom && sameCursor(f.replayedFrom, from)   // user-defined: sameCursor
          ? Feed.live({ proof: `server replayed from ${show(from)}` })    // existing: Feed.live, proof. Only on the server's echo of this from
          : Feed.live({ head: f.head }))                                  // NEW option: head. The server's newest position now
        else if (f.t === "reset") emit(Feed.live({ restartAt: f.start })) // existing: restartAt. `lost` is cut
        else if (f.t === "ping") emit(Feed.ping)                          // NEW: Feed.ping. Sign of life, no value
        else emit(f.message)
      })
      ws.addEventListener("close", (e) => {                               // user-defined classification (C5)
        const code = closeCode(e)                                         // user-defined: reads WebSocketEvent
        emit.fail(code === 4401 ? new SignedOut() : new ChatDropped({ code }))
      })
      yield* Effect.addFinalizer(() => Effect.sync(() => ws.close()))     // Effect
    })),
  catchUp: ({ roomId }, { from, next, signal }) =>                        // existing: catchUp, moved here. NEW in its context: next. existing: from, signal
    fetchPage(roomId, next ?? from, signal).pipe(Effect.map((p) =>        // user-defined: fetchPage
      p.truncated ? Feed.gone(`history starts at ${show(p.oldest)}`, { items: p.messages, next: p.next })   // RENAMED: Feed.CannotRepair, continueAt → Feed.gone
      : p.complete ? Feed.done(p.messages, { proof: "server: page.complete", through: p.head })   // NEW: Feed.done, through. existing word: proof, required
      : Feed.more(p.messages, p.next, { through: p.next }))),             // NEW: Feed.more. p.next is the page token and, on this server, also a position
}),
// chat.definition.ts
memory: { roomId: Schema.String, messages: Schema.Array(Message), notice: Schema.optional(Schema.String) },   // cursor and reopenInMs are gone
internalEvents: { Message: { message: Message }, Page: { messages: Schema.Array(Message) }, MayHaveMissed: {}, FeedEnded: {}, SignedOut: {}, Retry: {} },   // user-defined
operations: ({ E }) => ({
  messages: Chat.messages.outcomes({                                      // existing: outcomes
    value: E.Message.from((message) => ({ message })),                    // existing: value. At least once: store by id
    pages: E.Page.from((messages) => ({ messages })),                     // NEW: pages. Optional. A read's page is one turn
    missed: E.MayHaveMissed,                                              // existing: missed. Type-required
    fills: "messages",                                                    // NEW: fills. A field of THIS memory; a wrong name does not compile here
    failure: { SignedOut: E.SignedOut, Feed: E.FeedEnded },               // NEW key: Feed. ChatDropped is retried by the default, so the type does not ask for it
  }),
}),
// chat.machine.ts
LIVE: {
  activities: [O.messages.subscribe(({ memory }) => ({ roomId: memory.roomId }))],   // existing. First load is catchUp, so LOADING is gone
  on: {
    Message: { target: "self", updateMemory: ({ memory, event }) => ({ messages: upsert(memory.messages, event.message) }) },   // user-defined: upsert. Required: a replay repeats
    Page: { target: "self", updateMemory: ({ memory, event }) => ({ messages: upsertAll(memory.messages, event.messages) }) },  // user-defined
    MayHaveMissed: { target: "self", updateMemory: () => ({ notice: "Some messages may be missing." }) },   // no restartAt line
    SwitchRoom: { target: S.LIVE, updateMemory: ({ event }) => ({ roomId: event.roomId, messages: [] }) },  // releases the session: wiped. Re-read on return
    ClearChat: { target: "self", updateMemory: () => ({ messages: [] }) },   // stays placed: cleared. No flag
    Refresh: { target: "self", updateMemory: () => ({ messages: [] }),       // user-defined
      actions: [O.messages.bookmark(({ memory }) => ({ roomId: memory.roomId, at: undefined }))] },   // NEW: bookmark. Forget, and read now
    FeedEnded: { target: S.ENDED },                                          // user-defined. Only a flapping server or a defect gets here
    SignedOut: { target: S.SIGNED_OUT },
  },
},
ENDED: { on: { Retry: S.LIVE } },                                            // a bad deploy can reach it in every open tab: show a Retry
// view
const row = useView(chat, (s) => s.operations.messages)                      // existing
row?.connection === "Live"                                                   // existing
row?.catchingUp                                                              // NEW: catchingUp. Listening, older items still arriving (G8)
```

### 3.2 The contract

```ts
stream({
  id, input, output, key,                           // existing
  delivers: "every" | "latest",                     // RENAMED values (S11)
  errors?: [ClassA, ClassB],                        // NEW; absent means none, and a stray error is rejected
  subscribe: (input, { from, signal, callback }) => Stream<A | Signal, E, R>,   // from: when position is set
  reconnect?: { while: ["TagA"], schedule?: Schedule },   // with:
  idle?: Duration | "never",                        // required exactly when reconnect is present
  bufferSize?: number,                              // rare. Default 1,024
  // every only (type error on latest):
  position?: keyof A,                               // the NAME of a field of output. Struct, Class, checked Struct; a Union by a walk. A decodeTo output is a type error
  catchUp?: (input, { from, next, signal }) => Effect<Feed.more | Feed.done | Feed.gone, E, R>,   // requires position
})
```

**Field rules, in plain words.**

| Word | Rule |
| --- | --- |
| `position` | A field name of `output`. `position: "cursor"` means "each message's `cursor` says where it is" |
| `from` | Where to continue: the bookmark. In `subscribe` and `catchUp` |
| `errors` | The adapter's typed failures. `callback`'s `emit.fail` and `while` are typed from it |
| `reconnect` | **Your connection ends on failure (`emit.fail`, or a stream that fails): declare it. An SDK that re-opens by itself and you report `Feed.down`: omit it.** Omitted: one failure, including `Overflow`, is terminal, and the machine must re-open. So EventSource and Supabase's per-channel error declare it, because the adapter closes on error. Socket.IO, Ably, Phoenix omit it |
| `idle` | **Your server must send something within this window: a value, or a heartbeat you pass as `Feed.ping`. No heartbeat: write `"never"`, and a half-open connection is not detected.** `idle` runs from connect. **Until a connection registers, a ping does not extend it**, so a server that pings and never greets ends `Silent` and retries. A source whose only registration is its first value has no time to give: `"never"`, or a server first event |
| `bufferSize` | Rare. The callback queue and the repair buffer. For a source with big bursts, or a low bound in a test (the desk's 256) |

**Samples follow one rule:** `next` defaults to the position type; a richer token annotates `catchUp`'s second parameter. Otherwise no explicit generics.

**Honest typing costs** (DT):
- A helper returning a mixed array of values and signals needs an annotation naming `Feed.Signal<P>`; `Stream.map` inline does not. A feed with no position has `P = never`, so it cannot share a helper that emits `restartAt` with a positioned one.
- A mapper hoisted out of `outcomes` annotates its parameter. Inline infers.

### 3.3 Signals

| Signal | Means |
| --- | --- |
| `Feed.live()` | Registered: anything said from now reaches me. Nothing proven |
| `Feed.live({ proof })` | Registered, and nothing was missed. A required string. **On `every`:** at a connection's first registration, the server replays everything after `from`; later, nothing was missed since the last value delivered. **On `latest`:** the value this session confirmed is still current |
| `Feed.live({ head })` | Registered, and the server's newest position is `head`. Used only when there is no position yet, so a quiet feed still has a place. Every only |
| `Feed.live({ restartAt })` | The server's log restarted; continue here. One `missed`. Every only |
| `Feed.down(reason)` | An SDK lost its connection and is healing itself |
| `Feed.ping` | A sign of life, no value |

Each `head`, `through`, `restartAt`, `at` is typed `P` and **decoded against the position's Schema at intake; a failure is `Defect`**, so one bad frame cannot stop saving (Persistence O5, O2). Undefined means no change.

**`callback(register)`:** `emit`, `emit.fail`, `emit.end`; bounded; `emit` resolves when there is room (S7 Q20). A parameter, not a service, so the bounded bridge is the one in hand (M5). A helper takes it as an argument.

### 3.4 A read's answer

| Answer | Means |
| --- | --- |
| `Feed.more(items, next, { through? })` | More to read. `through`: oldest first, nothing before it unread. It moves the bookmark, so a long repair keeps its progress |
| `Feed.done(items, { proof, through? })` | **The server said this read reached `from`.** A required string, like `Feed.live`'s, greppable and shown by Inspection. `through`: where the read ends, even in an empty room. Newest first: the walk's first head |
| `Feed.gone(reason, { items?, next?, through? })` | The history does not reach `from`: one `missed`, then what is kept. No budget spent |

**A limit-style or snapshot endpoint must not answer `Feed.done` with `from` set** unless it can prove overlap. This is the most natural silent mistake (AT). The recipe:

```ts
// GET /messages?limit=50: the newest 50, no cursor parameter
catchUp: ({ roomId }, { from, signal }) => latest50(roomId, signal).pipe(Effect.map((p) =>   // user-defined
  from === undefined ? Feed.done(p.messages, { proof: "first load: newest 50", through: p.head })
  : p.messages.some((m) => sameCursor(m.cursor, from)) ? Feed.done(p.messages, { proof: "page overlaps the bookmark", through: p.head })
  : Feed.gone("more than 50 since the bookmark", { items: p.messages, through: p.head }))),   // a notice, never a silent gap
```

**A short page or an empty page is not a proof.** A feed that wants nothing from before now: `from === undefined ? Effect.succeed(Feed.done([], { proof: "nothing before now" }))`, with the greeting's `Feed.live({ head })`.

**Preconditions, unsafe if broken, unchecked.** With `from` defined, the read is a change log, including deletes (R20). A read sees the log up to registration (no lagging replica). A read with `from` undefined reaches back to registration. A `catchUp` given a position from another log answers `gone`.

### 3.5 Outcomes

| Kind | `value` | `pages` | `missed` | `fills` | `failure` |
| --- | --- | --- | --- | --- | --- |
| `every`, machine | required | optional, needs `catchUp` | required | required: a field or `false` | required |
| `latest` | optional | — | type error | — | required when anything is mapped |
| `listen` | the domain's | — | the domain's | — | required |

**Delivery is at least once.** A replay, a reload or a repair repeats items. A handler stores by id (`upsert`). **A counter keys by id, with a seen set, or accepts drift:** `unread + 1` over-counts. Do not give a counter `catchUp`: a wipe would re-read and re-count.

**`failure`:** author tags exhaustive, except tags in `while` under the default schedule, which cannot end a session. `Feed` covers Flow's reasons `Closed`, `Overflow`, `Silent`, `Flapping`, `Defect`, `Interrupted`. A reason may be named, and it beats `Feed`. `Feed.Reason` is tagged. With a written `schedule`, tags in `while` are required too.

**`missed`:** an event, or `.from((m) => ({ why: m.why }))` for `Unproven`, `Lost`, `Reset`. A consumer that does not care writes one handler (V9: 2 lines). Exactly one notice per interruption.

### 3.6 `fills`

**`fills` names a field of the operation's own memory: an array, a `Record` or a number.** A boolean or a closed struct's emptiness is not offered. Checked in the definition, where memory's Schema is known: a misspelling or wrong kind **does not compile**. A wrong field of the right kind still compiles; Inspection's `FillsUntouched` reports a value handled whose turn left the field unchanged.

| Consumer | Line | Note |
| --- | --- | --- |
| A list | `fills: "messages"` | The field holds only this feed's items. **Banners and drafts go in another field** |
| A count | `fills: "unread"` | 0 means empty |
| Per-key list under `subscribe.each` | `fills: "byRoom"` | A `Record`, indexed by a single-field key. Otherwise `FillsNotPerKey` |
| Stores nothing, or a short-lived list such as toasts | `fills: false` | Never wiped. Continues from the bookmark |
| **The list lives in a parent, or a fragment wants a parent's field** | **Not nameable: a compile error.** | **One answer: place the operation in the machine that owns the list, or keep the list in the fragment and expose it.** `fills: false` compiles and is the stated silent limit |
| Nested in a struct | Lift the list to a top-level field | |

**When is memory saved?** Only for a persisted actor. Not persisted: a reload is a new slice, and the feed starts fresh.

### 3.7 Clear, wipe, refresh

| You write | Flow reads | Result |
| --- | --- | --- |
| `messages: []`, session stays placed | **Cleared** | **Stays cleared** across reconnects, reloads, later messages and room switches: a re-read starts after the clear |
| `messages: []` with a target that re-enters, or a switch | **Wiped** | Re-reads, no notice. Without `catchUp`, one `missed` |
| Sign-out clears in another state; back later | Wiped | As above |
| `messages: []` on a root or parent handler, wanting a reload | Cleared | Stays empty. **The one recipe for reload:** `O.messages.bookmark(({ memory }) => ({ roomId: memory.roomId, at: undefined }))` |

**Exactly when cleared items return:**
1. Clear and leave in **one** turn (`ClearAndClose`): read as a wipe. **Recipe for "stays cleared": clear in one turn, leave in the next, or write the action `O.x.bookmark({ at: position })` with the newest position you hold in that turn.**
2. Clear during the wait for a releasing predecessor.
3. Clear before any position is known (no `head`, no value yet): there is nothing to read after.
4. A frame or page already on its way lands after the clear (one read's worth).
5. A stale duplicate moved the bookmark back just before the clear: one item (model confirms).
6. After `O.x.bookmark({ at: undefined })`, on purpose.

**An accidental `[]` is permanent, and silent.** Flow cannot tell a bug from Clear. An `onError: messages: []` is the worst form. In v2 the cursor stays too: the same result.

**`O.x.bookmark(select)`**, always a selector, returning the key fields and `at`: states a position (a read outside `catchUp`), or forgets with `at: undefined`.

### 3.8 The row

`latest`: `key`, `connection`, `drop`, `failure`, `value`, `last { value, at }`. `value` is empty unless current; to show stale data you write `last`. `every`: `key`, `connection`, `drop`, `failure`, `catchingUp`. `connection` exists on every phase. A fact row has no `value` and no `last`. The bookmark is in `session` records and Inspection, not on the row.

## 4. Decisions, with options and evidence

Each is proposed.

### Q1. Who owns the position, and what is it attached to?

**Options.** A author's memory (v2). B Flow's bookmark (blind). C a memory field Flow moves. D a separate Flow record (lane mechanics). E v2 made explicit, "trimmed v2". **F, recommended: a Flow-private partition of the slice's record, plus `fills`.**

**Who moves it: Flow.** C needs three exceptions to MD 2.5: a patch outside the expansion order, surviving `Denied`, and a write with no turn. So a step-1 cell moves it, into a partition no guard reads. "Memory changes only through `updateMemory`" stays true.

**Where: the slice.** D gave old bookmarks to new memory on `resetOn` A→B→A, `.each` re-adds, subroutines and decode failure (RV1 H1). **Persistence O3:** a capture "sees only whole publications, never part of a turn", so partition and memory land together.

**Tie to memory.** A partition alone leaves a silent empty list on a room switch (RV1 H2). A required predicate `holds: (memory) => …` misfired on clear, dismiss and count, and could not tell never-filled from erased (RV2 H1). So: `fills` as data, with private state.

**`fills` against predicate.** Data wins: `flow explain` prints it; `SharedFills`, `FillsNotPerKey` become checkable; `() => true` cannot be written; a wrong name does not compile. It loses only a test across fields.

| Scenario | F | E, trimmed v2 |
| --- | --- | --- |
| Room switch, natural line | Right | Right with `cursor: undefined`; **silent if forgotten** |
| Clear, dismiss, count | Right, and survives a later message | Right |
| Quiet room, from-now | Right, with a head | Right, if a head reaches memory |
| Reset | Flow | Author line; forgotten, asks the old log forever |
| In-session position | One | Two: memory's and the session's (A7) |
| No position | One partition | **Still a Flow-private saved fact** (assessment 7) |
| Read outside `catchUp`, late | Right | Same hole, and Flow cannot see a handler's write |
| Shared or host-kept list; residue | **Silent: a limit** | **Right**: E's real win |
| Persistence, SSR, Schema | Amendments (section 8) | None for positioned feeds |
| Reads at a glance | One `fills` | Four cursor fragments |

**Is this the clever hybrid the owner dislikes?** One data line for the author; private state for Flow. Three rounds each found a High here, each smaller. RV3: accept with its edits, trimmed v2 does not win; a fourth High means fallback.

**A list shortened by mistake** is not the silent loss this design exists to prevent: the value was offered, and the consumer's own line dropped it (RV3).

### Q2. First registration

One record. With no record and an empty field: first open, no notice (G10, G13, G14). **A read that can be `catchUp` belongs there**: it starts after registration, so no race. A **non-empty read outside it** (a parent, another actor, a resource, `Flow.input`) is found: no record and a filled field owes one notice. **An empty read with no head, outside `catchUp`,** is silent for what was posted before registration.

**SSR is where it must be outside:** an `every` session never opens on a server (RV2 Med7). The server reads a resource; `Loaded` writes `O.messages.bookmark(({ memory, event }) => ({ roomId: memory.roomId, at: event.head }))`; the partition transfers; the client's `catchUp` reads from `head`.

**A read landing after `hello`:** T1's cell. Without `catchUp`, a notice at the queue's head. With it, nothing extra: every registration already read (RV2 H2, RV3 Low2). In every state, queued values stop moving the bookmark and queued `settle`s drop (model).

**A from-now feed with a head** has it settled at `complete`, not registration (RV3 H1): a drop between `complete` and that `settle`'s admission, then a reconnect, loses what was posted since the first greeting. One queue turn; a 500 ms backoff outlasts it unless a turn is very slow. **With no head (the desk's `hello` today, DT 3.1):** `{ at: undefined }`, one notice per reconnect until the first entry, and the first window's loss. The fix is a protocol field, not Flow's.

### Q3. Repair

**`catchUp` on the contract**, requiring `position` (RV1 Low2); `latest` is a compile error.

| Piece | Verdict | Evidence |
| --- | --- | --- |
| Start after registration | Keep | R8 |
| Buffer live items, flush after pages | **Keep** | R4, V4. Model: `passThrough` killed. Assessment: `nobuf` fails |
| Discard on a drop | Keep | Model: `flushOnAbandon` killed |
| Bookmark frozen until a read says | From blind | Model: `moveDuringRepair` killed. Replaces P0 |
| `seen`, `tail`, P1, P3 | Cut | Assessment: only I13 fails. Duplicates per repair bounded by the buffer |
| `meet` | Cut | Ends a newest-first read early: a hole |
| `Feed.done`'s `proof` | **New** | AT: a `done` over a limit endpoint hides a gap. Types cannot stop it; a required claim makes it visible, as G5 asks |
| `through` | **New** | RV1 H4: a read needs to say where it ends. RV1 Med1: a long repair needs progress. RV2 Med6: a snapshot's false notice |
| One page at a time | Keep | M1 (RV1 Med5) |
| Pages retried, socket open | Keep (S6 Q18) | R9 |
| Overflow refund | **Cut** | RV2 Med4: ignored a written budget, had no delay |

**Convergence, RV2's stepped figures, not a table run.** Gap 20,000, 100 msg/s, 500 reads/s, oldest first with `through`: 3 connections, 50 s. 150/s: 20 connections. 90/s with budget 8: ends by budget. Newest first, frozen, default: never ended. So: **3 repairs in a row that overflow with no bookmark move give up:** the next registration is one `missed Lost`, then `Live`; live values move past what was accepted (M8).

**Newest first (R16).** Older pages are never lost. Limits: V4's exception, and a windowed store (`.slice(-100)`) can evict newest entries when an older page lands: sort and trim after the read. **Reset:** with `catchUp`, after `missed Reset`, read from `restartAt`.

**A first load is not one turn per item:** `pages` maps a read's page to one event (RV1 Med6). A guard on its handler loses the whole page, with evidence.

### Q4. Is a gap handler required?

**Type-required, always.** Options: required (v2); on the row with a warning (blind); required or a whole-feed `"accept"`. Blind's row makes no one read it. `"accept"` was cut: it is V9 only, a should, costs one line against two, and failed G15. G15 is clean: no first-load noise to filter.

### Q5. Who runs reconnect?

| | Combinator (v2) | Contract (recommended) |
| --- | --- | --- |
| Rule 25 | Untouched in letter | **Changes** |
| No hidden machine (T4) | 70 cells outside | One table |
| `flow explain`, `flow check` | Cannot read a closure | Prints it; `while` is tags |
| Stories' timers | Tagging inside a combinator | Flow's own |
| `from` | A second position | The bookmark |
| SDK that heals itself | "Wrap, or not?" | Omit |

**Rule 25, new text:** "Flow never re-opens a session or a call. Within a session, it re-runs a connection only by the contract's declared `reconnect`, and fails it by the declared `idle`."

**`idle`** is armed by Machines O5's rule, "fires once if overdue", compared on the Clock at resume, while a pull is outstanding.

**Default `schedule`.** `exponential("500 millis")`, jittered, then capped at 30 s, in that order, with `Schedule.modifyDelay`. **8 connections in a row that register and die within `healthy` (1 minute) end `Flapping`.** A connection that never registers spends and restores nothing, so offline waits forever at one try per 30 s. **A connection ended by `Silent` is not a flap:** a server with no heartbeat under a duration reconnects each `idle`, flagged `IdleWithoutPing`, and does not end (AT 9's trap). `pageSched` is a copy of it, so a 503 forever reads `catchingUp` forever: visible. `healthy` of exactly 1 minute sits on common proxy idle timeouts: docs.

**Escalating re-open stays a machine recipe (DT 3.11).** After `Ended`, re-open is states and a schedule, with its delay in memory so a reload keeps the deadline:

```ts
ENDED: {                                                                  // user-defined
  schedules: { reopen: { schedule: ({ memory }) => Duration.millis(memory.reopenInMs), send: E.Reopen } },   // existing
  on: { Reopen: S.LIVE, Retry: S.LIVE },
},
LIVE: { schedules: { healthy: { schedule: "1 minute", send: E.Healthy } },
        on: { Healthy: { target: "self", guard: [live], updateMemory: () => ({ reopenInMs: 1000 }) },   // never reset on a value (C3)
              FeedEnded: { target: S.ENDED, updateMemory: ({ memory }) => ({ reopenInMs: Math.min(30_000, memory.reopenInMs * 2) }) } } },
```

### Q6. `failure` maps

Options: exhaustive six keys; `rest:` over everything; **author tags exhaustive, one `Feed` key.** Add `Banned` to `errors`: compile error (spike, DT). `rest:` would hide it.

### Q7. Words

`at` meant four things (AT). **Now:** `head` on `Feed.live`, `through` on a read's answer, `at` only the bookmark's own place, in `O.x.bookmark` and `session` records. **`held` and `void` are internal, renamed `filled` and `wiped`, and absent from author docs**, which say cleared and wiped.

### Q8. What the desk lost

| Lost | Answer |
| --- | --- |
| Author-set buffer | **`bufferSize` returns, rare**: the desk's 256 test, Supabase's 2,048 |
| Escalating re-open delay | A machine recipe, Q5 |
| Reading the cursor in tests | `session` records; section 8's sample replaces the five weakened assertions |
| A loop in a Flapping Story | Plain construction; section 8 |
| `NoHello` | `idle` runs from connect; a ping does not extend it |
| `pushes` on a fake | **Stays out.** The desk's 11 sites are one line each with a 6-line `pushed` helper in the fake's own file. DT saw cost, not a forgotten push, which was revisit.md's condition to reopen |
| `lost` on a feed with no position | `Feed.live()`; `listen` refetches what a start cannot prove. Unverified |

## 5. Normative tables

`—` means it cannot occur; a model must check it. Timers on Effect's `Clock`, tagged `backoff`, `page`, `healthy`, `idle`. `Flow` compares no positions; only `Equal` on `next`.

**Rules 67–72.**

| Rule | Statement |
| --- | --- |
| 67 Kinds | `delivers` is the data's meaning. `every`: never skipped or silenced, one per turn, or one page per turn from a read. `latest`: newest wins, current only while this connection confirmed it |
| 68 One session table | T1. Flow runs connections by `reconnect` and `idle`, sessions only by placement |
| 69 Delivery | T4. Outside the mailbox cap |
| 70 Ownership | A session belongs to its placement's activation. Identity per placement path; the wait per (actor, operation, key) at any path |
| 71 The bookmark | A Flow-private partition of the slice's saved record, per (operation, key), holding `at`, `filled`, `clearedAt`. It says what the consumer was offered: a Denied value moves it, with `DeliveryDenied` |
| 72 `listen` | T7 |

**One interruption, one answer** and **freshness is a function of the present** are the principles.

### T1. The session

**Variables.** `st`; `drop`, `dropAt`; `regInConn`; `owed`; `noted`; `claim`; `wiped`; `greeted`; `n`; `flaps`; `stalls`; `liveSince`; `seen`. In `Repairing`: `buf`, `cursor`, `prevNext`, `emptyRun`, `pageSched`, `movedHere`.

**Procedures.**
- `connect`: clear `wiped`, `greeted`, `noted`. If `b` exists, `filled`, and the field is empty: `wiped = true`, `b = { at: clearedAt, filled: false, clearedAt }` **at once**, so leaving before registering stays owed. `claim = b.at`; `subscribe(input, { from: claim })`; `Connecting`.
- `register(a)`: `regInConn` read then set; `owed = false`; `noted = false`; `liveSince = now`; T2. `latest`: T5.
- `notice(why)`: if not `noted`: queue `missed why`, `noted = true`.
- `abandon`: interrupt the read, aborting `signal`; `buf = []`; `seen = none`.
- `lose(e)`: `abandon`; read `liveSince`, then **clear it**. If in `Repairing` with `e = Overflow` and not `movedHere`: `stalls += 1`. If `reconnect` and (`e` is Flow's, or in `while`): under the default, unless `e = Silent`: `flaps += 1` if `liveSince` was set and `healthy` had not elapsed; `flaps = 8` ends `Flapping`. With a written `schedule`: step `n`, exhausted ends `e`. Otherwise `Waiting`, `drop = e`, `dropAt = now`, `regInConn = false`, discard this connection's frames. No `reconnect`, or not retried: `end(e)`.
- `end(f)`: `Ended { f }`; queue `failure f`.
- `complete(through?)`: `stalls = 0`; queue `settle(through ?? seen ?? greeted)`; if none, it makes `{ at: undefined }` when there is no record; queue each of `buf`; `buf = []`; `Live`.

| Input ↓ / State → | `Connecting` | `Live` | `Repairing` | `Dropped` | `Waiting` | `Ended` | `Releasing` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `live()`, `live({ head })` | `register` | `register` | `abandon`; restart from `b.at`; one budget step; `RegistrationChurn`; no second notice | `register` | — | — | discard, evidence |
| `live({ proof })` | `register` | `register` | evidence; stay | `register` | — | — | discard, evidence |
| `live({ restartAt })` | T2 rows 1, 2 | T2 rows 1, 2 | `abandon`; T2 rows 1, 2 | T2 rows 1, 2 | — | — | discard, evidence |
| `down(r)` | `Dropped`, `drop = r` | `Dropped`, `drop = r`, `dropAt = now`, `liveSince = none` | `abandon`; as `Live` | `drop = r`, `owed = false` | — | — | discard, evidence |
| `ping` | evidence, `PingsWithoutLive`. **Does not re-arm** | re-arm `idle` | re-arm | evidence | — | — | discard |
| value v | `register(live())`, then this row in the new state | queue v, moves | append to `buf`; at the bound, stop pulling | no record and empty field: make `{ at: undefined }`, no notice. Else if not `owed`: `noted = false`, `notice(Unproven)`, `owed = true`. Queue v, moves. Stay | — | — | discard, evidence |
| stream fails e | `lose(e)` | `lose(e)` | `lose(e)` | `lose(e)` | — | — | discard |
| stream completes | `lose(Closed)` | `lose(Closed)` | `lose(Closed)` | `lose(Closed)` | — | — | discard |
| defect | `end(Defect)` | `end(Defect)` | `abandon`, `end(Defect)` | `end(Defect)` | `end(Defect)` | — | discard |
| a position fails to decode | `end(Defect)` | `end(Defect)` | `abandon`, `end(Defect)` | `end(Defect)` | — | — | discard |
| `idle` deadline | `lose(Silent)` | `lose(Silent)` | `lose(Silent)` | not armed | not armed | not armed | not armed |
| backoff elapsed | — | — | — | — | `connect` | — | — |
| `healthy` elapsed (1 minute since `liveSince`) | — | reset `n`, `flaps` | reset `n`, `flaps` | — | — | — | — |
| page: `more(items, c, { through? })` | — | — | queue items, frozen; `seen` = last; `through`: queue `settle(through)`, `movedHere`, `stalls = 0`; `c` same as `prevNext`, or second empty page in a row: page failure; else request `c` when no page item is queued | — | — | — | discard |
| page: `done(items, { proof, through? })` | — | — | queue items, frozen; record `proof`; `complete(through)` | — | — | — | discard |
| page: `gone(r, { items?, next?, through? })` | — | — | `notice(Lost)`, then items, frozen; `next`: request; else `complete(through)` | — | — | — | discard |
| page fails e, in `while` | — | — | step `pageSched`: delay, retry, socket open; exhausted: `lose(e)` | — | — | — | discard |
| page fails e, otherwise | — | — | `abandon`, `end(e)` | — | — | — | discard |
| `O.x.bookmark({ at })`, `at` defined | T3. A later `hello` reaches row 6 | T3. No `catchUp`: `notice(Unproven)` at the queue's head | `abandon`; T3; restart from `at` | as `Live` | T3 | T3 | T3 |
| `O.x.bookmark({ at: undefined })` | T3 | T3. `catchUp`: `Repairing`, `from` undefined, no notice. Else `notice(Unproven)` at the head | `abandon`; as `Live` | as `Live` | T3 | T3 | T3 |
| `InvalidTurn` on a delivery | `end(Defect)` | `end(Defect)` | `abandon`, `end(Defect)` | `end(Defect)` | — | — | — |
| release | `Releasing`, close the scope | same | `abandon`, same | same | cancel the sleep, same | same | stays |
| scope closed, or 5 s (`ReleaseOverdue`) | — | — | — | — | — | — | `Released` |

**Any `O.x.bookmark` cell** also makes queued values stop moving and drops queued `settle`s. **With no session placed** (`LOADING`, SSR) it is T3 only.

**`idle` is armed** from connect, only while a pull is outstanding, so a slow consumer of a pulled source does not look dead, and not in `Dropped`.

**Row.** `connection`: `Connecting` for `Connecting`, `Dropped`, `Waiting`; `Live` for `Live`, `Repairing`; `Ended`; undefined for `Releasing`, `Released`. `catchingUp` = `Repairing`.

### T2. Registration, `every` with a machine consumer

`b` the bookmark, `E` = the field is empty (`fills: false` is always empty), `first = ¬regInConn`, `C` = has `catchUp`. In order:

| # | Input | State | Result |
| --- | --- | --- | --- |
| 1 | reset(`at`) | none, `E` | `b = { at, filled: false }`; no notice. `C`: `Repairing` from `at`. Else `Live` |
| 2 | reset(`at`) | any | `b.at = at`; `clearedAt` dropped; `notice(Reset)`. `C`: `Repairing` from `at`. Else `Live` |
| 3 | any other | none, `E` | **First open.** No notice. `C`: `greeted = head`, nothing written; `Repairing`, `from` undefined; the record is made at `complete`, so an interrupted first read stays first. No `C`: `b = { at: head, filled: false }`, `head` maybe undefined. `Live` |
| 4 | proof, and `claim` defined or not `first` | any | `Live`. A replay follows and moves `b` |
| 5 | `wiped`, `first` | | **Wiped.** `C`: `greeted = head`; `Repairing` from `clearedAt`, no notice. Else `notice(Unproven)`, `head` applied at its admission if `b.at` is undefined, `Live` |
| 6 | | `{ at: p }` | `stalls ≥ 3`, three repairs in a row with no move: `notice(Lost)`, `Live`. `C`: `Repairing` from `p`. Else `notice(Unproven)`, `Live` |
| 7 | | `{ at: undefined }`, or none and not `E` | Make `b`, `filled` = not `E`. `notice(Unproven)`. `C`: `greeted = head`; `Repairing`, `from` undefined. Else `head` applied at the notice's admission, `Live` |

A proof at a first registration with nothing to name a place is not believed: `ProofWithoutPosition`. A stale `from`, as in an SDK self-rejoin, only over-replays.

**`listen`:** no bookmark; `from` is the session's own last position. `fills: false`: `E` always, never `wiped`.

### T3. The bookmark

| Event | When | Effect |
| --- | --- | --- |
| T2 rows 1, 3, 5, 7; `connect`'s wipe | Runtime step, one publication | as stated. **Every write that creates an entry takes `filled` from the field** |
| Row 2 | at `missed Reset`'s admission | `b.at = at` |
| A value that moves, admitted | step 1, kept through `Denied`, `Unhandled`; not on `InvalidTurn`, which ends `Defect`. A missing entry is re-created | `at = v[position] ?? at`. No comparison: last delivered wins, may move backward, safe |
| A frozen item or page, admitted | step 1 | none |
| `settle(p)` at the queue's head | Runtime step | `at = p`; creates the entry if none |
| `O.x.bookmark({ at })` | step 5, a member | `b.at = at`, `filled` = field not empty, on after memory |
| `O.x.bookmark({ at: undefined })` | step 5, a member | `b = { at: undefined, filled: false }`, `clearedAt` dropped |
| **Any committed turn whose key's session stays placed and has connected, including `Connecting`, `Waiting`** | end of the turn | If `filled`, the field is now empty, and `at` is defined: **`clearedAt = at`** (AT case 5). `filled` = field not empty. Written only on a change. A session waiting for its predecessor writes nothing. **A releasing turn may raise `filled`, never lower it** |
| Release, reload, freeze, thaw | — | none |
| New slice: `resetOn`, new incarnation, `.each` re-add, subroutine, dispose then `ensure` | — | none: the partition is new |
| Upgrade: an entry with no `filled` | at restore | reads true |
| A position inside an entry fails to decode | at restore | `{ at: undefined }`: owes. **Persistence O5 must allow this.** A partition failing its own shape discards the scope, as O5. A removed operation's entries are dropped |

**Bound (M1).** 256 entries per operation in a slice, oldest out. A missing entry reads none: filled, it owes; empty, nothing is held. Under `subscribe.each`, an evicted, quiet, empty key reads first open: G11 at scale, stated beside M9. **SSR's total bound binds first** (262,144 bytes).

**`from` is the bookmark at connect.** A queued page may land after: duplicates only. A `missed Reset` not yet admitted at connect asks the old log: one extra notice.

### T4. Delivery

**`every`.** `Q`, `inFlight`. Flow pulls at turn pace in `Live`. **In `Repairing`** it pulls into `buf` until full, then stops: a pulled source waits (M2), a pushed one fills `callback`'s queue, whose bound fails `Overflow`. A pushed source holds at most twice the bound.

| Input | `inFlight = none` | `inFlight ≠ none` |
| --- | --- | --- |
| queue x | append; move the head to the mailbox (`settle`: apply and continue) | append |
| turn ends (committed, `Denied`, `Unhandled`) | — | `inFlight = none`; move the next |
| admission when `Releasing`, `Released` | — | discard, `Discarded { Released }`; clear `Q` |

`pages` mapped: a page is one queue item and one turn. A page's size is the author's, the only unbounded input.

**`latest`.** `slot`, `slotConn`, `queued`, `heard`. `reconcile`: if current, `value` mapped and it differs from `heard`, set the slot; else clear it. At admission the slot must be current and match the connection, or discard (`NotLive`). One value delivery, one `failure`.

### T5. `latest`

| Connection | Value | `live()` | `proof` |
| --- | --- | --- | --- |
| `Connecting` | implicit live; `last = { v, now, own }`, confirmed, reconcile | `Live`, `value` undefined | `Live`; confirmed only if `last.own` |
| `Live` | `last = { v, now, own }`, confirmed, reconcile. Equal confirms, not heard | not confirmed | confirmed if `last.own` |
| `Dropped`, `Waiting` | `last = { v, dropAt, not own }`, nothing delivered | `Live`, not confirmed | as `Connecting` |
| Leaving `Live` | `last.at = now` if confirmed; not confirmed | | |

`value` = `last.value` iff `Live ∧ confirmed`. Age is transferred across reload and SSR and rebased.

### T6. `callback`'s queue

**Variables:** `q`, values and signal groups `(down₁?, live?, down₂?)`, with a ping flag; `closing`; `released`; `waiters`. At most the bound's values and one group between two values.

Group merge: appending `down(r)` sets `down₂ = r` if the group has a `live`, else `down₁ = r`. Appending `live(a)` with a `down₂` moves it to `down₁`, clears `down₂`, and sets `live` to the weaker of the two; without one, the weaker. Pulling a group emits `down₁`, `live`, `down₂`. No merge upgrades an answer or hides a drop.

| Input | Room | Full | `closing ≠ open` or `released` |
| --- | --- | --- | --- |
| `emit(value)` | append; a resolved promise, or if this filled the last slot, one that resolves when a pull makes room | `closing = failing Overflow`; drop the value (evidence); a promise that never resolves | no-op, evidence |
| `emit(signal)` | merge | same | no-op, evidence |
| `emit.fail(e)` / `emit.end()` | `closing = failing e` / `ending` | same | no-op |
| pull | take the head; if this made room, resolve the waiter | same | drain `q`, then fail or end |
| release | run finalizers, awaited; `released = true` | same | run finalizers if not yet run |

**For `latest`: a signal is a fence.** A value before a signal is dropped when another value follows it. At most (signal group, one value); it never overflows.

### T7. `listen` coverage

Per covered answer r: `readStart[r]`, `landed[r]`, `subscribed[r]`. Per session s: `st`, and `lastGap[s]`. **Gaps** (set `lastGap`, start a refetch of each subscribed r read earlier): an unproven or reset registration, first included; `end`; release. A `down` and a proven registration only change the present state.

```text
fresh(r) = landed[r] ∧ every covering s is Live ∧ for every s that covers or covered r: lastGap[s] = none ∨ lastGap[s] < readStart[r]
```

A released session's `lastGap` is kept until every covered `readStart` is later. `listen` ignores a contract's `catchUp`.

### T8. Write progress

Per write lane: Attempts with `ended[a]`, `addr`, `prog[a]`. Row `progress = addr ? prog[addr] : undefined`.

| Input | `a = addr ∧ ¬ended[a]` | otherwise |
| --- | --- | --- |
| `progress(p)` by Attempt a's commit | `prog[a] = p`; publish the row as a Runtime step | evidence; nothing changes |
| a's ending admitted | the mapper reads `prog[a]`; `ended[a] = true` | the mapper reads `prog[a]` |
| promotion | `addr` = the promoted Attempt, `prog` undefined | — |
| restore | every `prog[a]` undefined | same |

### T9. Lifecycle

| Edge | Session | Bookmark | Row | Machine | `listen` |
| --- | --- | --- | --- | --- | --- |
| Placement starts | waits for a releasing predecessor, then `connect` | loaded | `Connecting`; restored `last` | nothing | stale |
| Connection change | T1 | T2, T3 | T1 | none unless `missed` | T7 |
| Ending | `Ended` | kept | `Ended` | `failure` behind queued items | stale |
| Leave, key gone | `Releasing`, awaited, 5 s | kept | undefined | queued discarded with evidence | stale |
| Disposal, then `ensure` | same, then new | goes with the slice (Persistence O3) | gone, then `Connecting` | new memory | as start |
| `resetOn`, `.each` re-add | released, then new, waits | none | `Connecting` | new memory | gap |
| Restore | new; budget restarts (C4) | last capture | `Connecting`; `last` from age | no replay | stale |
| Wake | `idle` by Machines O5's overdue rule. The browser orders a timer and a socket message | unchanged | leaves `Live` at resume | nothing | stale |
| Freeze, thaw | released, then new | with the frozen slice | undefined, then `Connecting` | discarded, then as start | gap |
| Second tab | its own | none unpersisted | as new | as new | as new |
| SSR server | `every`: **never opens**. `latest`: may run, released at capture | as written by `O.x.bookmark`; an omitted actor omits both (SSR O3) | `last` as age | — | as EDP |
| SSR client | new, never delays settling | hydrated; sensitive position: entry omitted, row 7, one notice | `Connecting`; `last` dim; `heard` stops a double | no replay | one refetch per covered list |

**Rule list (L12).** 8: deliveries of a live session are never lost; a released session's are discarded with evidence. 14: always current from the active leaf. 20: `value`, `pages`, `missed`, `failure` handled from every leaf under the placement. 25: as Q5. 37: `failure` includes `Defect`, `Interrupted`, by name or `Feed`. 47: deliveries count as endings.

## 6. Examples

### 6.1 Chat's walk

| Step | What happens |
| --- | --- |
| First load | Row 3, read, `catchingUp`. `done` with `through` |
| Drop during first load | No record. Row 3 again, reads again |
| Drop, replay | `Waiting`, banner. `from = b.at`. `hello` echoes: row 4 |
| Quiet reconnect, empty room | `{ at: head }`, row 6: read from head, nothing, no notice |
| Server cannot replay | Row 6. Socket buffered, 503 retried with the socket open, `settle`, flush |
| Drop mid-repair | Buffer discarded. Bookmark at the last `more`'s `through` |
| Retention | `Feed.gone`: one `missed Lost`, kept pages, flush. No budget spent |
| Reset | Row 2: one notice, reads the new log |
| Room A→B→A | Row 3 on B; wiped on A: reads, no notice |
| Clear chat, a message, A→B→A | Cleared stays gone: the re-read starts after the clear |
| Refresh | Forgets, reads now |
| Long outage | Tries every 30 s, row `Connecting` |
| Flapping | `Flapping` after 8, `Feed`, `S.ENDED` |
| Token expiry | Not in `while`: `end`, `SIGNED_OUT` |

### 6.2 Presence

**Source:** a WebSocket with `presence_state` then diffs. Each connection folds from its own `presence_state`.

```ts
export const Presence = { room: stream({                                  // existing
  id: "Presence.room", input: { roomId: Schema.String }, output: Members, key: ["roomId"],   // user-defined: Members
  delivers: "latest",                                                     // RENAMED value
  errors: [PresenceDropped],                                              // NEW
  idle: "45 seconds",                                                     // NEW. The server pings
  reconnect: { while: ["PresenceDropped"] },                              // RENAMED
  subscribe: ({ roomId }) => PresenceSocket.frames(roomId).pipe(          // user-defined
    Stream.mapAccum((): Members | undefined => undefined, (acc, f) =>     // Effect
      f.t === "ping" ? [acc, [Feed.ping]] as const                        // a ping is not a value
      : f.t === "presence_state" ? [f.members, [f.members]] as const
      : acc === undefined ? [acc, []] as const                            // a diff before the state: nothing to apply it to
      : [applyDiff(acc, f), [applyDiff(acc, f)]] as const)),
}) }
// definition: bare, the data is its row (K3)
operations: ({ E }) => ({ presence: Presence.room }),
// machine
ROOM: { activities: [O.presence.subscribe(({ memory }) => ({ roomId: memory.roomId }))] },
// view
const row = useView(room, (s) => s.operations.presence)
const members = row?.value ?? row?.last?.value ?? {}                      // existing
```

### 6.3 Ticker

**Source:** one app-wide socket multiplexed by the service, ticks `{ symbol, price, asOf }`, pings every 10 s. **The socket's pings must reach every symbol's stream**, or a quiet symbol hits `Silent` at 25 s.

```ts
export class MarketFeed extends Context.Service<MarketFeed, {             // Effect, user-defined
  readonly frames: (symbol: string) => Stream.Stream<{ t: "ping" } | { t: "quote"; quote: Quote }, MarketDropped>   // fans each socket ping out to every subscribed symbol
}>()("app/MarketFeed") {}

export const Market = { quote: stream({
  id: "Market.quote", input: { symbol: Schema.String }, output: Quote, key: ["symbol"],
  delivers: "latest", errors: [MarketDropped], idle: "25 seconds",
  reconnect: { while: ["MarketDropped"] },
  subscribe: ({ symbol }) => Stream.unwrap(Effect.map(MarketFeed, (mf) => mf.frames(symbol).pipe(
    Stream.map((f) => f.t === "ping" ? Feed.ping : f.quote)))),           // NEW: Feed.ping, per symbol
}) }
// definition
internalEvents: { Quoted: { symbol: Schema.String, price: Schema.Number }, QuoteEnded: { symbol: Schema.String } },
operations: ({ E }) => ({ quotes: Market.quote.outcomes({
  value: E.Quoted.from((q, { key }) => ({ symbol: key.symbol, price: q.price })),
  failure: { Feed: E.QuoteEnded.from((_e, { key }) => key) },             // NEW: Feed. One line replaces five
}) }),
// machine
WATCHING: {
  activities: [O.quotes.subscribe.each(({ memory }) => memory.watchlist.filter((s) => !memory.ended.includes(s)).map((symbol) => ({ symbol })))],
  on: {
    Quoted: [{ target: "self", guard: ({ memory, event }) => event.price > (memory.alerts[event.symbol] ?? Infinity) || deny("BelowAlert"),
               updateMemory: ({ memory, event }) => ({ fired: [...memory.fired, event.symbol], alerts: omit(memory.alerts, event.symbol) }) },
             { target: "self" }],
    QuoteEnded: { target: "self", updateMemory: ({ memory, event }) => ({ ended: [...memory.ended, event.symbol] }) },   // C10
    RetryQuote: { target: "self", updateMemory: ({ memory, event }) => ({ ended: memory.ended.filter((s) => s !== event.symbol) }) },
  },
},
// view
const row = useView(watch, (s) => Watch.O.quotes.get(s, { symbol }))
row?.value ? <Price value={row.value.price} />
: row?.last ? <Price dim value={row.last.value.price} note={`as of ${ago(now - row.last.at)}`} />
: <Price pending />
```

Quiet market: pings keep `Live`. Half-open: 25 s, `Silent`, dim with true age. Equal price after reconnect: undimmed, not heard. A queued tick from before a drop is fenced and discarded (F4, F5). `subscribe.each` has no cap of its own (M9).

### 6.4 Counter

```ts
delivers: "every", position: "id", errors: [Dropped], idle: "30 seconds", reconnect: { while: ["Dropped"] },   // no catchUp: history must not be counted
memory: { unread: Schema.Int, seen: Schema.Array(Schema.String) },        // user-defined: seen, the last few ids
fills: "unread",                                                          // NEW
Notification: { target: "self", updateMemory: ({ memory, event }) => memory.seen.includes(event.n.id) ? {} : { unread: memory.unread + 1, seen: [...memory.seen, event.n.id].slice(-256) } },
MarkRead: { target: "self", updateMemory: () => ({ unread: 0 }) },        // cleared: stays 0
MayHaveMissed: { target: "self", updateMemory: () => ({ countMayBeLow: true }) },
```

Or accept drift, and drop `seen`.

### 6.5 LLM tokens with Stop

Unchanged from v2 4.4: **a streaming write stays a transaction.** Nothing here touches it (I3).

```ts
ask: transaction({
  id: "Assistant.ask", input: { threadId: Schema.String, prompt: Schema.String }, output: Answer, key: ["threadId"],
  progress: { text: Schema.String }, concurrency: "reject",
  commit: (input, { attempt, signal, progress }) => Effect.gen(function* () {
    const http = yield* FetchHttpClient.Fetch                              // Effect: the seam Fake.fetch binds
    const res = yield* Effect.tryPromise({
      try: () => http("/api/ask", { method: "POST", body: JSON.stringify(input), headers: { "Idempotency-Key": attempt.id }, signal }),
      catch: () => Outcome.unknown(new NoResponse()) })
    if (!res.ok) return yield* (res.status >= 500 ? Outcome.unknown(new ServerError({ status: res.status })) : Outcome.failure(new Refused({ status: res.status })))
    let text = ""
    let done: Usage | undefined
    yield* Stream.fromReadableStream({ evaluate: () => res.body!, onError: () => new NoResponse() }).pipe(
      Stream.decodeText(), Stream.splitLines,
      Stream.timeoutOrElse({ duration: "20 seconds", orElse: () => Stream.fail(new Stalled()) }),   // a stall fails. Rule 25 still governs calls
      Stream.runForEach((line) => Effect.sync(() => {
        const f = JSON.parse(line)
        if (f.t === "token") { text += f.text; progress({ text }) }       // no turn per token
        if (f.t === "done") done = f.usage
      })),
      Effect.catch((e) => Outcome.unknown(e)))
    if (done === undefined) return yield* Outcome.unknown(new Truncated())
    return { text, usage: done }
  }),
}),
// machine
IDLE:   { on: { Ask: { target: S.ASKING, guard: [O.ask.idle], actions: [O.ask.commit(({ memory, event }) => ({ threadId: memory.threadId, prompt: event.prompt }))] } } },
ASKING: { on: { Stop: { target: "self", actions: [O.ask.cancel] }, Answered: { target: S.IDLE, updateMemory: ({ event }) => ({ last: event.text, incomplete: false }) } } },
on: { Stopped: { target: S.IDLE, updateMemory: ({ event }) => ({ last: event.partial, incomplete: true }), actions: [O.ask.cancel] } },
// view
const text = useView(chat, (s) => s.operations.ask.progress?.text ?? s.memory.last)
```

W6: Stop then Ask is admitted once `Stopped` releases the hold; a retry may be charged twice.

### 6.6 Upload

Unchanged from v2 4.5.

```ts
put: transaction({
  id: "Uploads.put", input: { ref: Schema.String, file: Schema.instanceOf(File) }, output: Stored, key: ["ref"],
  progress: { sent: Schema.Number, total: Schema.Number }, concurrency: "reject",
  commit: ({ ref, file }, { attempt, signal, progress }) => Effect.callback<Stored, Outcome.Unknown<UploadLost> | Outcome.Failure<TooLarge>>((resume) => {
    const xhr = new XMLHttpRequest()
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) progress({ sent: e.loaded, total: e.total }) }
    xhr.onload = () => resume(xhr.status === 201 ? Effect.succeed(JSON.parse(xhr.responseText)) : xhr.status === 413 ? Outcome.failure(new TooLarge()) : Outcome.unknown(new UploadLost({ status: xhr.status })))
    xhr.onerror = xhr.ontimeout = () => resume(Outcome.unknown(new UploadLost({ status: 0 })))
    xhr.onabort = () => resume(Outcome.unknown(new UploadLost({ status: -1 })))
    signal.addEventListener("abort", () => xhr.abort())
    xhr.open("PUT", `/uploads/${ref}`); xhr.setRequestHeader("Idempotency-Key", attempt.id); xhr.send(file)
  }).pipe(Effect.timeoutOrElse({ duration: "10 minutes", orElse: () => Outcome.unknown(new UploadLost({ status: -2 })) })),
}),
// view
const label = !row.pending ? undefined : row.progress && row.progress.sent < row.progress.total ? `Sending ${pct(row.progress)}` : "Waiting for the server…"
```

### 6.7 Entity `listen` (Supabase)

```ts
export const Tickets = { changes: stream({
  id: "Tickets.changes", input: { queueId: Schema.String }, output: TicketChange, key: ["queueId"],
  delivers: "every",
  errors: [ChannelDown, SignedOut],                                       // NEW
  idle: "never",                                                          // NEW value. No heartbeat reaches the adapter; status reports
  reconnect: { while: ["ChannelDown"] },                                  // RENAMED. The adapter fails on a channel error, so Flow rejoins
  subscribe: ({ queueId }, { callback }) => Stream.unwrap(Effect.map(Supabase, (sb) => callback((emit) => Effect.gen(function* () {
    const ch = sb.channel(`queue:${queueId}:${crypto.randomUUID()}`)      // a topic of its own, so removing it closes nothing shared
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets", filter: `queue_id=eq.${queueId}` }, (p) => emit(toChange(p)))
      .subscribe((status) => {
        if (status === "SUBSCRIBED") emit(Feed.live())
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") emit.fail(new ChannelDown({ status }))
      })
    const off = sb.auth.onAuthStateChange((e) => { if (e === "SIGNED_OUT") emit.fail(new SignedOut()) })
    yield* Effect.addFinalizer(() => Effect.promise(async () => { off.data.subscription.unsubscribe(); await sb.removeChannel(ch) })
      .pipe(Effect.timeout("3 seconds"), Effect.ignore))
  })))),
}) }
// tickets.domain.ts (existing)
changes: listen(Tickets.changes).as([Ticket], (c) => c.kind === "delete" ? Ticket.delete({ id: c.id }, { version: c.version }) : Ticket.patch({ id: c.id }, c.fields)),
// queue.definition.ts
operations: ({ E }) => ({ changes: TicketsDomain.changes.outcomes({ failure: { SignedOut: E.SignedOut, Feed: E.PushEnded } }) }),   // NEW: Feed
// queue.machine.ts
QUEUE: { activities: [O.changes.subscribe(({ memory }) => ({ queueId: memory.queueId }))], on: { PushEnded: S.QUEUE_ENDED } },
```

**Costs (E9, E10, E11).** One refetch per subscribed list on re-entry. A change before `SUBSCRIBED`: at most 2 reads. One connection cannot feed both records and a log: the desk keeps 2.

## 6.8 SDKs by recipe

**Vendor behaviour is from v2, blind and prior-art notes. None was run.** Rule: section 3.2's `reconnect` row. A finalizer removes only what it created (L6). Socket.IO, Firestore, polling, `fetch`, a reduced Ably compile in my spike; the rest in RV3's.

| Source | `reconnect`, `idle` | F9 |
| --- | --- | --- |
| Raw WebSocket, Presence, ticker | yes, a duration | Yes |
| Socket.IO, Ably, Phoenix | none | The SDK's |
| Firestore | none | **No**: half-open stays current. F10 fails |
| Supabase | yes, `"never"` | Status from the SDK |
| graphql-ws | yes, a duration, `keepAlive` on | Yes: pongs. `on("pong")` is client-wide, so it proves the socket, not each subscription |
| Electric | yes, a duration | Yes: `up-to-date` |
| EventSource | yes, `"never"` | **No**, unless a named `ping` event. F10 fails |
| Polling | yes, a duration | Yes: a hung GET |
| Streaming `fetch` | yes, a duration | Yes: blank lines |

**Socket.IO** (`every`; no position).

```ts
delivers: "every", errors: [Rejected, SioDropped],
subscribe: ({ room }, { callback }) => callback((emit) => Effect.gen(function* () {
  const s = sio.socket(room)                                              // user-defined: forceNew, reconnectionAttempts: 8
  s.on("connect", () => emit(s.recovered ? Feed.live({ proof: "socket.io recovered" }) : Feed.live()))
  s.on("disconnect", (why) => why === "io server disconnect" ? emit.fail(new Rejected({ why })) : emit(Feed.down({ why })))
  s.io.on("reconnect_failed", () => emit.fail(new SioDropped()))          // the SDK's budget is the budget
  s.on("chat", (m) => emit(m))
  yield* Effect.addFinalizer(() => Effect.sync(() => s.disconnect()))
})),
```

Row 7 replaces v2's guard. REST history read first: one notice per load. With no `reconnect`, one `Overflow` is terminal: the machine must re-open.

**Ably** (`every`; `RcMap` compiled by RV1). **Unconfirmed:** whether a transparent resume emits a channel event, so react to channel states rather than `connection.on`.

```ts
delivers: "every", position: "serial", errors: [AblyDown, HistoryDown],
subscribe: ({ name }, { callback }) => Stream.unwrap(Effect.map(Ably, (a) => callback((emit) => Effect.gen(function* () {
  const ch = yield* RcMap.get(a.channels, name)                           // Effect: released with the scope
  let first = true
  const attached = (c: ChannelStateChange) => { emit(c.resumed && !first ? Feed.live({ proof: "ably resumed" }) : Feed.live()); first = false }   // a cached channel's first flag proves nothing (G6)
  const update = (c: ChannelStateChange) => { if (!c.resumed) emit(Feed.live()) }
  const down = (c: ChannelStateChange) => emit(Feed.down({ state: c.current }))
  const message = (m: InboundMessage) => emit(toMsg(m))   // user-defined: toMsg. Ably's types
  ch.on("attached", attached); ch.on("update", update); ch.on("detached", down); ch.on("suspended", down); ch.on("failed", (c) => emit.fail(new AblyDown({ reason: c.reason?.message })))
  yield* Effect.promise(() => ch.subscribe(message))
  if (ch.state === "attached" && first) { emit(Feed.live()); first = false }
  yield* Effect.addFinalizer(() => Effect.sync(() => { ch.off(attached); ch.off(update); ch.off(down); ch.unsubscribe(message) }))
})))),
catchUp: ({ name }, { from, next, signal }: { from: Serial | undefined; next: Walk | undefined; signal: AbortSignal }) =>   // annotated: a richer token. user-defined: Walk
  history(name, from, next?.page, signal).pipe(Effect.map((p) => {        // newest first
    const head = next?.head ?? p.firstSerial                              // the walk's first page: where this read ends
    const items = [...p.items].reverse()
    return p.reachedRetention ? Feed.gone("past retention", { items, through: head })
      : p.hasNext && head ? Feed.more(items, { page: p.next, head })      // no through: pages are newest first
      : Feed.done(items, { proof: "walked back to from", through: head })
  })),
```

**graphql-ws** (`every`; `retryAttempts: 0`, `keepAlive: 10_000`, which defaults to off).

```ts
delivers: "every", position: "cursor", errors: [GqlDropped], idle: "30 seconds",   // a Subscribed first event registers within idle; a pong before it does not extend it
reconnect: { while: ["GqlDropped"] },
subscribe: ({ boardId }, { from }) => Stream.unwrap(Effect.map(Gql, (gql) =>
  gql.pongsAndEvents({ query: BoardEvents, variables: { boardId, after: from } }).pipe(   // user-defined: iterate merged with on("pong")
    Stream.map((x) => x.t === "pong" ? Feed.ping
      : x.ev.__typename === "Subscribed" ? (sameCursor(x.ev.replayedFrom, from) ? Feed.live({ proof: "server replayed" }) : Feed.live({ head: x.ev.head }))
      : x.ev)))),
```

Cost: with no server first event, registration is the first `next`: write `idle: "never"`, and a quiet subscription stays `Connecting` (FC66), half-open undetected.

**Firestore** (`latest`; a listener error is final).

```ts
delivers: "latest", errors: [NoAccess, ListenError],
subscribe: ({ docId }, { callback }) => callback((emit) => Effect.gen(function* () {
  let cached = false
  const off = onSnapshot(docId, (snap) => {
    if (snap.fromCache) { cached = true; emit(Feed.down("served from cache")) }   // the fence keeps the next value from reading current (T6)
    else if (cached) { cached = false; emit(Feed.live()) }
    emit(snap.data)
  }, (err) => emit.fail(err.code === "permission-denied" ? new NoAccess() : new ListenError({ code: err.code })))
  yield* Effect.addFinalizer(() => Effect.sync(off))
})),
```

Costs: an optimistic echo reads current (F13); F10 fails; `fromCache` unconfirmed.

**Phoenix** (`every`; `heartbeatIntervalMs` set). **Unconfirmed:** `receive("ok")` firing on a rejoin.

```ts
delivers: "every", position: "id", errors: [ChannelClosed, JoinRefused],
subscribe: ({ topic }, { from, callback }) => Stream.unwrap(Effect.map(Phoenix, (p) => callback((emit) => Effect.gen(function* () {
  const ch = p.socket.channel(topic, () => ({ after: from }))
  ch.on("message", (m) => emit(m))
  ch.onError(() => emit(Feed.down({ why: "channel error" })))
  ch.onClose(() => emit.fail(new ChannelClosed()))
  ch.join().receive("ok", (r) => emit(r.replayed ? Feed.live({ proof: "join replayed" }) : Feed.live({ head: r.head }))).receive("error", (e) => emit.fail(new JoinRefused({ e })))
  yield* Effect.addFinalizer(() => Effect.sync(() => ch.leave()))
})))),
```

An SDK self-rejoin sends the stale `from`: more replay. Safe: duplicates.

**Electric** (`latest`).

```ts
delivers: "latest", errors: [ElectricDown], idle: "45 seconds",
reconnect: { while: ["ElectricDown"] },
subscribe: ({ where }, { callback }) => callback((emit) => Effect.gen(function* () {
  const ctl = new AbortController()
  const stream = new ShapeStream({ url, params: { table: "tickets", where }, signal: ctl.signal })
  stream.subscribe((msgs) => { if (msgs.some((m) => m.headers?.control === "up-to-date")) emit(Feed.live({ proof: "electric up-to-date" })) }, (e) => emit.fail(new ElectricDown({ e })))
  new Shape(stream).subscribe(({ rows }) => emit(rows))
  yield* Effect.addFinalizer(() => Effect.sync(() => ctl.abort()))
})),
```

**Cost, stated (RV2):** `latest` bans `position`, so offset and handle are not saved: each reconnect and reload re-syncs the whole shape, unless the adapter holds them for the session. `must-refetch` arrives as a new full value (R21).

**EventSource** (`every`; dense ids, no greeting).

```ts
delivers: "every", position: "id", errors: [SseDropped], idle: "never",
reconnect: { while: ["SseDropped"] },
subscribe: ({ userId }, { from, callback }) => callback((emit) => Effect.gen(function* () {
  const es = (yield* Sse).open(`/notes/stream?user=${userId}${from !== undefined ? `&after=${from}` : ""}`)   // user-defined: Sse, a service; a Story gives a client half over server.socket
  let decided = false
  es.onmessage = (m) => {
    const note = toNote(m)
    if (!decided) { decided = true; emit(from !== undefined && note.id === from + 1 ? Feed.live({ proof: `ids contiguous after ${from}` }) : Feed.live()) }   // R15
    emit(note)
  }
  es.onerror = () => emit.fail(new SseDropped())                          // closes, so the browser's Last-Event-ID cannot disagree
  yield* Effect.addFinalizer(() => Effect.sync(() => es.close()))
})),
```

Why `reconnect` here: this adapter closes on error, so the browser's retry never runs. Costs: quiet reconnect stays `Connecting`; sparse ids unproven each time (FC74); `onerror` hides status, so authenticated SSE uses `fetch` (C11); six per origin (L10).

**Polling** (`every`). The desk's technician pulse needs `idle` too. A first answer registers; a hung first GET ends `Silent`.

```ts
delivers: "every", position: "cursor", errors: [PollFailed], idle: "30 seconds",   // a hung GET: Silent
reconnect: { while: ["PollFailed"] },
subscribe: ({ ticketId }, { from }) => Stream.paginate({ cursor: from ?? "0", first: true }, ({ cursor, first }) => progress(ticketId, cursor).pipe(
  Effect.map((b) => [
    [...(first ? [Feed.live({ head: b.cursor })] : []), ...(b.events.length ? b.events : [Feed.ping])],   // RV2: the quiet false notice goes
    Option.some({ cursor: b.cursor, first: false }),
  ] as const),
  Effect.delay("1 second"))),
```

A poll from `from` sees all, but `at` alone is unproven: a reconnect's first answer is a notice unless the server says so; `Feed.live({ proof: ... })` when `from` is defined and the server's contract is "every event after". `Connecting` until the first answer (C14). A failed GET keeps the bookmark (C12).

**Streaming `fetch`** (`every`).

```ts
delivers: "every", position: "seq", errors: [BodyDropped, SignedOut], idle: "30 seconds",
reconnect: { while: ["BodyDropped"] },
subscribe: ({ feedId }, { from, signal }) => Stream.unwrap(Effect.gen(function* () {
  const http = yield* FetchHttpClient.Fetch                               // Effect: the seam Fake.fetch binds. A global fetch reaches no fake
  const res = yield* Effect.tryPromise({ try: () => http(feedUrl(feedId, from), { signal }), catch: () => new BodyDropped() })
  if (res.status === 401) return yield* new SignedOut()
  if (!res.ok) return yield* new BodyDropped()
  const hello = res.headers.get("x-replayed-from") === String(from) ? Feed.live({ proof: "server replayed" }) : Feed.live()
  return Stream.fromReadableStream({ evaluate: () => res.body!, onError: () => new BodyDropped() }).pipe(
    Stream.decodeText(), Stream.splitLines,
    Stream.map((line) => line === "" ? Feed.ping : decodeRow(line)),
    Stream.prepend([hello]))
})),
```

A body end is `Closed`, retried. V8: a terminator becomes a typed error outside `while`.

## 7. Traceability

**P** passes as written. **C** passes on a stated condition. *Model*: section 11. *Spike*: type checks. *RV*, *DT*: their runs. Otherwise reasoned.

| Row | S | How |
| --- | --- | --- |
| V1 | P | `delivers` on the contract |
| V2 | P | T4. Model |
| V3 | P | T5, T6. Latest model |
| V4 | P | Live one per turn. Exception: a read's pages, newest-first order |
| V5 | P | Rule 69 |
| V6 | P | Type-required. Spike |
| G1 | P | Model |
| G2 | P | T2 rows 5–7 |
| G3 | P | One per registration |
| G4 | P | Only `proof` skips a read |
| G5 | P | Required string, on `Feed.live` and `Feed.done` |
| G6 | **C** | No position: enforced. Positioned SDK flags by recipe |
| G7 | P | `Feed.live`; graphql-ws cost |
| G8 | P | `connection`, `catchingUp` |
| G9 | P | Every cell; `—` throws in the model; a bad position is `Defect` |
| G10 | P | Row 3 |
| G11 | P | An interrupted first read leaves no bookmark. Row 6 or 7, memory empty or not. Model, strict oracle. **Fails in one shape:** a from-now feed with neither head nor read; with a head, one queue-turn window. Model confirms both |
| G12 | **C** | `catchUp`: safe. Read outside, non-empty: row 7. Read late: T1's cell, model. **Empty read with no head, outside `catchUp`: silent.** Model confirms |
| G14 | P | Any record skips row 3 |
| G15 | P | No first-load noise; no whole-feed word. `missed` always reaches a handler |
| R1 | **C** | Model O1. Limit: a `from`-undefined read short of registration, then a reload. Model confirms. Precondition |
| R2, R3 | P | Bookmark; Schema from `output` |
| R4, R5, R6 | P | Model, no drain |
| R7 | **C** | Only `Feed.done` ends, with a `proof`. A false proof is a visible claim, as on `Feed.live` (AT) |
| R8, R9, R10 | P | Model for R10 |
| R11 | P | Bounds; fresh tokens with items are a legitimate stream |
| R12, R13 | P | Model |
| R14 | P | `upsert`; bounded duplicates. A counter's duplicates: section 3.5 |
| R16 | P | Model. Order limit stated |
| R17 | P | `signal` |
| R19 | P | `Repairing` is a state |
| R20 | **C** | Unchecked precondition. `Feed.gone`'s `through` removes the reason to lie |
| C1 | P | |
| C2 | **C** | A written budget holds. **Default: ends after 8 registered flaps; up 5 s then offline never ends** (RV3 TestClock; my virtual clock). A server that accepts and drops before registering retries at 30 s forever: the row's first sentence does not hold there. No data lost. Owner |
| C3 | P | Machine recipe, Q5 |
| C4, C5, C6, C7, C9, C12 | P | |
| C8 | **C** | Required once mapped. Bare `latest` only on the row; K3. Owner |
| M1 | P | One page at a time, `buf`, queue, 256, ring |
| M2, M3, M4 | P | T6 |
| M5 | **C** | `callback` in hand. `UnboundedBridge` not built |
| M7 | P | |
| F1–F8 | P | Spike, latest model |
| F9 | **C** | `idle`. **The row says "without Flow measuring wall time"; this changes it.** `"never"` sources lose it. Owner |
| F10 | **C, fails for two** | Window: at resume by Machines O5. **Firestore, EventSource: fails**, the source's limit. `"never"` sources likewise. Not run |
| F12 | P | |
| E1–E4, E6–E8, E11 | P | |
| W1–W7, W10 | P | Carried; DT: Assistant type-checks unchanged |
| L1, L2, L3, L4 | P | T9; probe |
| L5 | P | Separate slices |
| L6 | **C** | Recipe; Flow cannot enforce |
| L8, L11, L12 | P | |
| P1 | P | |
| P2 | **C** | One capture. **Needs O5 amended.** `through` decoded at intake. Not run |
| P3 | P | Restore; no handover (O7) |
| P4, P6 | P | |
| P5 | **C** | Crosses with the slice. Needs SSR O3's list and digest amended. Not run |
| S1, S2 | P | |
| S3 | **C** | Needs `Fake.stream`'s heartbeat, taken in SC (section 9) |
| S4–S7 | P | Section 9 |
| T1–T6 | P | |
| A1, A3, A4 | P | Spike |
| A9 | P | Spike, DT |
| A11 | P | Samples compile by inference: my spike, RV3's, and DT's `features/`, with stand-in Feed and vendor stubs. Renames here (`head`, `through`, `proof` on `done`) compiled in my spike only; ticker's `frames`, counter not compiled |
| A13 | P | |
| I2 | P | Section 9 |
| I3 | P | Checkout untouched |

**The 14 C:** G6, G12, R1, R7, R20, C2, C8, M5, F9, F10, S3, L6, P2, P5.

**Shoulds and limits.**

| Row | Result |
| --- | --- |
| A2 | **Ran once:** 2 of 8 right first time. Not re-run on this text |
| A5 | 32, higher than v2 |
| A6 | DT: feed code lines minus 21 percent; Presence, Assistant flat |
| A8 | Reopen, six-key map, deadlines go |
| A12 | `proof` required; not prevented |
| A16 | **Declined:** section 1's table is silent if broken |
| E5 | In-session only |
| E9, E10 | **Declined:** stated |
| G16 | With a head: none. No head, no read: one per connection |
| M8 | Oldest first with `through`: progress. Otherwise the stall rule |
| V9 | 2 lines, not 1 |
| U1 | **Declined:** v2's `SubscriptionRef` workaround: a service owns a latest-wins ref, the session samples and re-sends per connection, release sends a leave. U2 re-judged lightly |
| C13 | Not precluded |
| X1–X3 | Cut. Duplicates bounded by the buffer |
| Others | Met as sections say |

## 8. Tooling and testing

**Single graph, single runtime.** T1 is one Runtime record. `delivers`, `errors`, `idle`, `reconnect`'s tags, `catchUp`'s presence, `position`, `fills`, the action are readable without running a closure. Only `schedule` is a closure. No new memory writes; `check()` runs steps 2–6, so it touches no bookmark.

**`flow check`:** `FeedUnhandled`, `ListenNeedsEvery`, rule 20 rows, `DuplicateSession`, `DuplicateListen`, `VerbMismatch`, `DuplicatePlacement`, `KeyRequired`, NEW `SharedFills` (two ops, one field), NEW `FillsNotPerKey`, NEW `UnboundedBridge` (source text on `Stream.callback`; not built).

**`flow explain`:** `LIVE subscribes messages (Chat.messages, every, one session per room, fills messages, idle 45s, retries ChatDropped, catches up)`.

**Inspection:** per session: state, `drop`, T2 row and basis, each `proof`, losses, bookmark and `filled`, bound, release; counters plus a ring of the last 256. Flags: `ValuesWhileDown`, `RegistrationChurn`, `ReleaseOverdue`, `ProofWithoutPosition`, `PingsWithoutLive`, `IdleWithoutPing`, `DeliveryDenied`, `FillsUntouched`. Stories templates assert no flags.

**The chat Story**, as [stories-amended.md](../story-checks/stories-amended.md) section 11 fixed it. Illustrative; not run.

```ts
const ChatFake = Fake.webSocket(Chat, chatRoutes)                         // existing  // user-defined: Chat, chatRoutes
export const chat = Story.machine(ChatRoom, {                             // RENAMED [W1]
  id: "chat/replay-then-reset", input: { roomId: "r1" }, fixtures: [ChatFake, HistoryFake],   // user-defined
  world: [Chat.seed({ history: seed })],                                  // user-defined control
})
  .checkpoint("live")                                                     // a start cut
  .world(Chat.greet({ replay: false }), Chat.history.drop({ at: "response" }), Chat.socket.drop())   // existing: drop [W37]; a page fails once
  .advance({ next: { operation: O.messages, timer: "backoff" } })         // existing: next [W7]; reconnects, reads, the page's answer is lost
  .advance({ next: { operation: O.messages, timer: "page" } })            // existing: next
  .checkpoint("caughtUp")
  .world(Chat.resetLog({ epoch: 9 }), Chat.socket.drop())
  .advance({ next: { operation: O.messages, timer: "backoff" } })
  .checkpoint("reset")

test("replay, then reset", async () => {
  const { live, caughtUp, reset } = (await chat.run()).checkpoints
  expect(live.operations.messages?.connection).toBe("Live")
  expect(caughtUp.records("session", { operation: O.messages }).filter((r) => r.drop)).toHaveLength(1)
  expect(caughtUp.operations.messages?.catchingUp).toBe(false)            // NEW: catchingUp
  expect(reset.records("session", { operation: O.messages }).at(-1)?.bookmark?.at?.epoch).toBe(9)   // NEW: bookmark
})
```

**Reading the bookmark in a test (DT 5.1).** This replaces the five weakened assertions: "does not move backwards", the cursor after a catch-up, the cursor after a reload, and the request-log and entry-count stand-ins.

```ts
const bookmark = (cp: Checkpoint) => cp.records("session", { operation: O.activity }).at(-1)?.bookmark   // existing: records. NEW field: bookmark
expect(bookmark(caughtUp)?.at).toEqual({ epoch: 8, seq: 41 })             // the cursor after a catch-up
expect(bookmark(afterReload)?.at).toEqual({ epoch: 8, seq: 41 })          // the cursor after a reload
expect(bookmark(afterOlderFrame)?.at).toEqual({ epoch: 8, seq: 40 })      // last delivered wins: it may move backward, on purpose
expect(afterReload.read(Desk.socket).at(-1)?.input.from).toEqual({ epoch: 8, seq: 41 })   // what the server saw
expect(bookmark(cleared)?.filled).toBe(false)                             // "stays cleared"
```

A reload Story is `Story.app`; a record outlives the session, since `session` records are the run's.

**A Flapping Story, by plain construction (DT 5.3; SC's table).** A loop of `world` and `advance` adds no checkpoint, so the builder's type is unchanged.

```ts
const flapped = Array.from({ length: 8 }).reduce(                         // plain JavaScript
  (story: typeof base) => story.advance("1 second").world(Chat.socket.drop()).advance({ next: { operation: O.messages, timer: "backoff" } }),
  base,                                                                   // user-defined: base, a Story past its first registration
).checkpoint("ended")
test("eight quick drops end the session", async () => {
  const { ended } = (await flapped.run()).checkpoints
  expect(ended.state).toBe("ENDED")                                       // after FeedEnded the row is undefined
  expect(ended.records("session", { operation: O.messages }).at(-1)?.ended).toBe("Flapping")
})
```

**Fakes: `pushes` stays out (Q8).**

```ts
// desk.fake.ts: 6 lines, then one line per handler
const pushed = (before: Truth, after: Truth) => ({ truth: after, send: [Desk.socket.frames(sameWorkspace(after), newEntries(before, after))] })   // user-defined
```

## 9. Changes needed elsewhere (none applied)

### `machine-design.md`

v2 6.1 stands, with:
- rules 67–72;
- **rule 25**, Q5's text;
- rule 37's stream clause takes `Feed`;
- rule 57 adds `delivers`, key fields, `missed`'s kind, `fills`;
- 2.5 step 1 gains "a stream delivery's bookmark cell, not kept on `InvalidTurn`"; the turn's end gains `filled` and `clearedAt`;
- rule 52 thaw: "from the frozen slice's bookmark";
- rule 8, 14, 20, 47 additions per T9's rule list; rule 13 adds `pages`, `missed`; the commit context gains `progress(p)`;
- 2.7.3's stream row, 2.7.8, 2.7.9, 2.7.10, 2.7.13, 2.7.15, 2.7.16, 2.8 (`listen`, T7), C57, section 3.6 keywords, section 5, section 6, section 7 item 9, as v2 6.1 lists, reading these tables for its.

### Plans

- **Persistence O5:** the position inside a stream partition entry failing to decode reads `{ at: undefined }`; this is not a partial restore of memory. Otherwise a cursor's shape change discards every draft.
- **Persistence O2:** the position field's Schema must pass `persist: true`'s type rule. Frozen slice keeps the partition.
- **Persistence O3:** cited, not changed.
- **SSR O3:** the partition is in the transferred list; add the position field's Schema to the digest. A sensitive position is omitted.
- **SSR:** `every` sessions never open on a server; their R is provided by a layer, or exempt.
- **Operations O1, O4, O6, V9, Q1:** the shape of section 3; K2/OD12's position clause removed; rewritten from rules 67–72. `DuplicateStreamSession`, `persist`, stream tags go.
- **Machines O6, Runtime O4, O6, Testing O2, O3, O6, Entity O1, O4, Inspection, CommandLine O5:** per v2 6.2 and section 8.

### `stories-amended.md` and `fakes-v2.md`

The stories-amended side has taken this design's asks in its section 11; `fakes-v2.md` has not been re-read against them.

| # | Item | `stories-amended.md` | `fakes-v2.md` |
| --- | --- | --- | --- |
| 1 | `ping: { every, frame }` on `Fake.stream`. **Rank 1 taken** (its section 10 item 12): a tie keeps a connection alive | Taken | Add |
| 2 | Pings and `hold({ after: n })`: a ping does not count; `hold()` stops pings | 2.10.17.3 | Rule |
| 3 | Pings while suspended coalesce. **Awake, a fast ping against a long `advance` hits `StoryTurnLimit`:** write `suspended`, or a slower `ping` (item 13) | Taken | Rule |
| 4 | Timers: `backoff`, `page`, `healthy`, `idle` | Taken | — |
| 5 | Row: `catchingUp` | Taken | — |
| 6 | `session` records: cells `<State>.<input>`, T2's row, `bookmark`, and **`filled` where it says `held`; a new field `proof` on a read; `ended`** | **Rename needed** | — |
| 7 | Reload Stories are `Story.app`; no fixed `advance` onto a jittered default | Taken | — |
| 8 | Global `fetch`: every sample reads `FetchHttpClient.Fetch` or an `Sse` service. DT 3.8: the desk's `next/http-api.ts` still calls the global, so its fake needs a client half until that changes | Taken as a check | — |
| 9 | `pageSched` is `{ timer: "page" }` | Taken | — |
| 10 | "A heartbeat is `HostTimeWait`" corrected for a fake's Clock ping | Check | — |
| 11 | Coverage: T1 and T3 cells, which are suite-only, including a turn in the wait | 2.10.15 | — |
| 12 | Clean-end wording; `callback`'s awaiting finalizer is suite-only; no `fake.send` from a client frame | Taken | — |
| 13 | NDJSON has no codec: `frame` is `Schema.String`, and `end: true` must be written (DT 3.7) | — | State |
| 14 | Inline frames in `open` may widen `t` (DT 3.6): possibly a stand-in artifact | — | Check |

## 10. Word count, and what is cut

Words an author writes, by v2's method (RV1 section 8):

| Tier | Words | Count |
| --- | --- | --- |
| Common | `reconnect`, `idle`, `position`, `from`, `callback`, `errors`, `Feed.live`, `proof`, `Feed.ping`, `missed`, `fills`, `Feed` key, `drop`, `value`, `last`, `connection` literals | **16** |
| Uncommon | `"never"`, `Feed.down`, `catchUp`, `next`, `Feed.more`, `Feed.done`, `Feed.gone`, `head`, `through`, `pages`, `catchingUp`, `O.x.bookmark` (`at`), `Feed.Signal` | **13** |
| Rare | `restartAt`, `why`, `bufferSize` | **3** |
| **Total** | | **32** |

Read-only: reasons `Closed`, `Overflow`, `Silent`, `Flapping`; findings and flags.

| Design | Common | Total |
| --- | --- | --- |
| v2 | 12 | 24 |
| blind | 15 | 26 |
| trimmed v2 (RV2) | | about 29, before the same additions |
| **this** | 16 | **32** |

**Why 32.** `at` split in two because it meant four things; `Feed.Signal` is honest (DT); `bufferSize` has real cases. `pages` is the only easy cut left; it should stay.

**Cut.**

| Cut | What replaces it |
| --- | --- |
| `Feed.reconnect`, 70 cells | Contract data, one session table |
| `fresh`, `registered`, `announced`, `initial`, the guard, "`from` required with `position`" | The bookmark, `fills` |
| `after` in `input`, `cursor` in memory, `restartAt` in `missed`'s payload | The bookmark |
| `seen`, `tail`, `meet`, P0, P1, P3 | The bookmark stays put until a read says |
| `resetAfter` | A constant, 1 minute |
| `Feed.CannotRepair`, `continueAt` | `Feed.gone` |
| `lost` as an option | `Feed.live()`; `Lost` from `Feed.gone` or a stall |
| `"accept"` | One handler |
| `Feed.callback` as a module function | `callback` in the context |
| Retried tags in `failure`, under the default | The default cannot end with them |
| The fact row's `last`; hello deadline; prepended `Feed.live()` | Nothing read it; `idle`; the first value registers |
| `RETRY_WAIT` in chat | The default. Escalation stays a recipe |
| `pushes`, RV3's dotted `fills: "room.messages"`, `Feed.finished`, a Flow `merge`, per-repair progress for newest-first pages, a duplex fake | Not taken. V8: a terminator becomes a typed error outside `while` |
| Outbound live state, one shared session per Runtime, a `reconnect` member, `fromRpc` streams | Out of scope, open-items 16–19 |

## 11. What ran, and what is unproven

Serial, one process, peak about 1 GB. Files in `/private/tmp/claude-501/-Users-arpit--claude-spares-spare-Sy75Xy/b97bafc6-720f-455d-b91c-5aa81d337285/scratchpad/s3/` (`every.ts`, `latest.ts`, `main.ts`, `out.txt`, `clock.ts`, `infer.ts`).

**Model of T1–T4, `every`:** exhaustive BFS, no final drain, oracle per state, cap 120,000. History before first registration is excused only with no `catchUp` or a from-now read. O1 bookmark past an item unheld and not noticed or dismissed; O2 quiet `Live` owes nothing; O3 a live value not past a hole; O4 one notice per registration; O5 no notice on an empty feed with a head; O6 a clear does not come back. Dense positions, buffer 2, page 1, usually 2 or 3 appends, 1 drop, 1 leave.

| 50 configs | Result |
| --- | --- |
| 38: chat, heads, `through`, replay, no `catchUp`, no position, SDK flag, desk log with head excluded, dismiss, toast, reload, sign-out, room switch, `resetOn`, late read, snapshots, retention, newest first, a turn in the wait, fill and leave, an empty SSR read, refresh with no `catchUp` | **Clean, exhaustive** |
| 5: reset (two), a turn in the wait with reload, clear then a message then a switch, clear then a message then leave-and-wipe | Clean to the cap only |
| From-now with a head; from-now with no head; an empty snapshot; shared list; first load returning the latest 1 | Hit, expected: section 1's limits |
| Dismiss with `catchUp` | Hit: stale duplicate, clear, reload: one item. Stated |
| Refresh with `catchUp` | Hit on O3 only: a queued value lands before the re-read. Order, no hole. Stated |

| Mutant | Result |
| --- | --- |
| Greeting writes, `filled` in the wait, `settle` with `filled` false, bookmark `filled` true, no `filled`, no `clearedAt` (two), the late read's notice removed, `moveDuringRepair`, `passThrough`, `flushOnAbandon`, `proofAnyFirst`, `listenedNotSaved` | **Killed** |
| No raise on fill-and-leave; wipe at registration | Survive in mine; RV3's model kills both |
| Two notices; the late-read cell with `catchUp` (cut) | Survive; RV3: no path in the model, reachable in the table, no loss; the branch is extra |

**Model, not in the model:** the ping rule in `Connecting`, `Silent` not a flap, `bufferSize`, `proof` on `done`, the stall count at 3.

**`clock.ts`:** the default on a virtual clock, no jitter, before the `Silent` rule: flap 1 s, `Flapping` at 70 s; up 59 s, 534 s; up 61 s, never (176 in 3 h); offline, never (125 an hour); up 5 s then offline, never. RV3 on TestClock: 68 s, 528 s, 176, 125.

**`latest.ts`:** T5, T6 with the fence, 2,198 states, clean; without it, a cached value reads current.

**`infer.ts`, `tsc --strict`, Effect 4.0.5:** real Effect and Schema; stand-in Feed and vendor stubs. Chat, desk log, Presence, polling, `fetch`, Socket.IO, Firestore, reduced Ably, the limit endpoint recipe; `head`, `through`, `done` without a proof rejected; `failure` map; a misspelt or struct-kind `fills` rejected in the definition. RV3 compiled the rest and wired `failure` to `stream`. **Its `fills` type allowed strings; the text above excludes them: not re-checked.**

**Trials.** Agent: 8 cases from the doc, not compiled, an upper bound: 2 right first time. Desk: 3 features, 5 Stories' worth, type-checks against stand-ins, nothing executed. Their findings are answered in Q8, sections 3.4, 3.6, 3.7; the trials were on the earlier wording.

**Not run:** `idle` by me, `pages`, `fills` beyond "list empty" (`count`, `Record`), `FillsUntouched`, O5's amendment, SSR on a payload, freeze, two placements, T7, T8, `callback`'s queue, any Flow code, Story, vendor SDK, browser. RV's figures are theirs. Persistence and SSR text is cited through the reviews. I wrote the tables and the model.
