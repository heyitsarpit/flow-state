# Streams from scratch, second attempt

Status: **everything here is proposed.** Nothing is accepted. Requirements are cited as SR*, FC*, K* and M6-D* from
`../brief.md`. Written without reading the earlier proposals, their reviews or their models.

## 1. The answer in short

**One idea: the bookmark.** Flow keeps one bookmark per feed, per consumer. It means: *you hold every fact up to here.*

- It moves only when a fact is committed in a turn with nothing owed, so it is saved together with the memory that
  holds that fact.
- If something might be missing, the bookmark **freezes** and the feed **owes**. Newer facts still arrive; the
  bookmark waits.
- A debt ends in exactly one of three ways: the server proves it replayed from the bookmark, a read started after the
  connection registered completes, or the app says "start over".

Every connection opens from the bookmark. The author never stores a position, compares positions or writes a repair
state.

**Three decisions follow from it.**

1. **The server's greeting is the only source of a position in a quiet room.** `Feed.up({ head })` gives a consumer
   that has received nothing a bookmark anyway. With no `head`, Flow still remembers *that it followed this feed*, so
   the next session says "may have missed" rather than nothing. A true first open has followed nothing, so it claims
   nothing.
2. **The repair read lives on the contract (`catchUp`), and Flow runs the loop.** First load and repair are the same
   read, always started after registration, delivered as ordinary `value`s. A chat machine has no repair states.
3. **A state feed's row separates `current` from `lastKnown`.** `current` is `undefined` unless this connection
   confirmed it, so showing an old price as live has to be written out.

**Count.** 26 new author-written words, 15 in the common tier (section 3), plus 2 reused from Effect.

**Three earlier decisions this overturns, with reasons.**

| Decision | Replaced by | Why |
| --- | --- | --- |
| K2/OD12: the resume position is an `input` field | `from` in `subscribe`'s context, owned by Flow | A position in author memory makes the author write "never pass a hole" (FC22, FC24, FC46) in every chat |
| M6-D3: reconnect is a Stream combinator in the adapter | `reconnect` on the contract, run by Flow | The budget needs "how long was it registered", and `from` needs the bookmark, and both are Flow's. As data, `flow explain` can show it, and Flow tags its own sleeps for Stories |
| K14/rule 25, in part | Flow re-runs **a connection** by the contract's declared policy, never **a session** | SR13 still holds: only the machine re-opens a session. Rule 25 needs that one sentence |

**The honest weak spot (section 11, Q1).** Because the bookmark is Flow's and the facts are in the author's memory, an
author who clears a list and does not call `startOver` gets a bookmark claiming facts they threw away.

## 2. Plain words

| Word | Meaning |
| --- | --- |
| **fact feed** | Each value is something that happened. Two equal ones are two events. Chat, notifications |
| **state feed** | Each value is how things are now. Newest wins. Prices, presence |
| **session** | One placement of a feed for one key, from entering the state to leaving it. The machine owns it |
| **connection** | One run of `subscribe`. A session may have many |
| **up** | The server has registered me: anything said from now on reaches me. Not the same as "the socket opened" |
| **bookmark** | I hold every fact up to here |
| **owes** | Something may be missing, and it has not been settled |
| **catch-up** | A paged history read, started after up |

## 3. The words

| Word | Where | Tier | Status |
| --- | --- | --- | --- |
| `delivers: "facts" \| "state"` | contract | common | NEW (M6-D4's word) |
| `position` | contract, facts | common | NEW |
| `idle` | contract, required | common | NEW |
| `reconnect: { while, schedule }` | contract | common | NEW; `while`, `schedule` follow `Effect.retry` |
| `from` | `subscribe`'s context; placement option | common | NEW |
| `Feed.callback` | adapter | common | NEW |
| `Feed.up({ continuous, head })` | adapter | common | NEW (3 words) |
| `ended` | outcome | common | NEW |
| `missed` | row, outcome, `Feed.up` option | common | NEW |
| `status` | row | common | NEW |
| `merge` | contract member | common | NEW |
| `current`, `lastKnown` | row, state | common | NEW |
| `catchUp`, `Feed.page({ next, gone })` | contract | uncommon | NEW (4 words) |
| `healthyAfter` | `reconnect` | uncommon | NEW |
| `catchingUp`, `reason` | row | uncommon | NEW |
| `Feed.down`, `Feed.alive` | adapter | uncommon | NEW |
| `startOver` | action | uncommon | NEW |
| `Feed.finished` | adapter | rare | NEW |

**Dropped from today's plans:** OPS O6's stream tags (`Running`, …), `DuplicateStreamSession`, the stream `persist`
option's "last mapped value" baseline, the value-mapping-changes-meaning rule (FC3), the position field in `input`.

## 4. Examples

### 4.1 Chat over a raw WebSocket with a greeting

**Where the data comes from.** The browser's `WebSocket`. The server takes `?after=<position>`. Its first frame is a
greeting: `{ type: "welcome", resumed: boolean, head: number }`. Then `{ type: "message", seq, text, from }`, and
`{ type: "ping" }` every 20 seconds. `resumed: true` means it will replay everything after `after`. History is
`GET /rooms/:room/messages?after=&limit=50`, oldest first.

**Before** (today's plans):

```ts
// chat.contracts.ts
export const messages = stream({
  id: "Chat.messages",
  input: { room: Schema.String, after: Schema.optional(Schema.Number) },   // the author keeps the position
  output: Message,
  key: ["room"],
  subscribe: ({ room, after }) => ChatApi.socket(room, after),
})
// chat.definition.ts
operations: ({ E }) => ({ messages: Chat.messages.outcomes({ value: E.Got }) })
// chat.machine.ts
ROOM: {
  activities: [O.messages.subscribe(({ memory }) => ({ room: memory.room, after: memory.lastSeq }))],
  on: { Got: { target: "self", updateMemory: ({ memory, event }) => ({ messages: [...memory.messages, event], lastSeq: event.seq }) } },
}
```

That loses messages on a blip, shows no status, and moves `lastSeq` past holes.

**After:**

```ts
// chat.contracts.ts
export const messages = stream({                                    // existing: stream
  id: "Chat.messages",                                              // existing: id
  input: { room: Schema.String },                                   // existing: input
  output: Message,                                                  // existing: output   // user-defined: Message
  key: ["room"],                                                    // existing: key
  delivers: "facts",                                                // NEW: delivers
  position: (m) => m.seq,                                           // NEW: position; unique and ordered
  idle: "45 seconds",                                               // NEW: idle; no sign of life this long = dead connection
  reconnect: {                                                      // NEW: reconnect; Flow re-runs subscribe within the session
    while: (e) => e._tag !== "SignedOut",                           // existing (Effect's word)   // user-defined: SignedOut
    schedule: Schedule.exponential("500 millis").pipe(Schedule.jittered, (s) => Schedule.max([s, Schedule.recurs(8)])),
  },                                                                // existing: schedule, Effect's Schedule
  subscribe: ({ room }, { from }) => Feed.callback((emit) =>        // NEW: from, the bookmark; NEW: Feed.callback; user-named: emit
    Effect.gen(function* () {
      const makeWs = yield* Socket.WebSocketConstructor             // existing (Effect): Stories swap this
      const ws = makeWs(`wss://chat.example/rooms/${room}?after=${from ?? ""}`)
      ws.onmessage = (e) => {
        const f = decodeFrame(e.data)                               // user-defined
        if (f.type === "welcome") emit(Feed.up(f.resumed            // NEW: Feed.up
          ? { continuous: "server resumed from after=", head: f.head } // NEW: continuous, says what proves it
          : { head: f.head }))                                      // NEW: head; the server's newest position
        else if (f.type === "ping") emit(Feed.alive)                // NEW: Feed.alive (uncommon)
        else emit(f)                                                // a value
      }
      ws.onclose = (e) => emit.fail(e.code === 4401 ? new SignedOut() : new Lost({ code: e.code })) // user-defined: Lost
      return Effect.sync(() => ws.close())                          // the release; Flow waits for it (section 6.5)
    })),
  catchUp: ({ room }, { after, cursor }) =>                         // NEW: catchUp (uncommon); user-named: cursor comes from next
    ChatApi.history(room, { after: cursor ?? after, limit: 50 }).pipe(Effect.map((r) => Feed.page({ // NEW: Feed.page
      items: r.items,                                               // user-named field of Feed.page's argument
      next: r.items.length === 50 ? r.items[49].seq : undefined,    // NEW: next; undefined = complete
      gone: r.oldestKept > (after ?? 0) + 1,                        // NEW: gone; history no longer reaches `after`
    }))),
})

// chat.definition.ts
internalEvents: { Got: Message, RoomEnded: { reason: Schema.String } },   // existing: internalEvents   // user-defined: Got, RoomEnded
operations: ({ E }) => ({
  messages: Chat.messages.outcomes({                                // existing: outcomes
    value: E.Got,                                                   // existing: value
    ended: E.RoomEnded.from((r) => ({ reason: r._tag })),           // NEW: ended; required when value is mapped
  }),
}),

// chat.machine.ts
ROOM: {
  activities: [O.messages.subscribe(({ memory }) => ({ room: memory.room }))],   // existing: subscribe
  on: {
    Got: { target: "self", updateMemory: ({ memory, event }) => ({ messages: Chat.messages.merge(memory.messages, event) }) },
    //                                                             NEW: merge; inserts by position, a repeat replaces
    RoomEnded: { target: S.ENDED },
  },
},

// room.tsx
const row = useView(room, (s) => s.operations.messages)             // existing: useView, operations
if (row?.status === "Reconnecting") banner("Reconnecting…")         // NEW: status
if (row?.catchingUp) spinner()                                      // NEW: catchingUp (uncommon)
if (row && row.missed !== "None") notice("Some messages may be missing")  // NEW: missed
const canSend = row?.status === "Live"
```

**Added:** the words marked NEW. **Dropped:** `after` in `input`, `lastSeq` in memory.

A chat with no history endpoint omits `catchUp`. Everything else stays.

### 4.2 A price ticker

**Where the data comes from.** A WebSocket per symbol. Each frame is `{ symbol, price, asOf }`, and the server sends the
current price on join, then on each change, and pings.

```ts
export const price = stream({
  id: "Market.price", input: { symbol: Schema.String }, output: Tick, key: ["symbol"],   // existing   // user-defined: Tick
  delivers: "state",                                                // NEW; position here is a type error
  idle: "30 seconds",                                               // NEW
  reconnect: { while: () => true, schedule: Schedule.spaced("2 seconds") },  // NEW
  subscribe: ({ symbol }) => Feed.callback((emit) => MarketSocket.join(symbol, {   // user-defined: MarketSocket
    onTick: (t) => emit(t),                                         // first value of a connection means up, and is current
    onPing: () => emit(Feed.alive),
    onClose: (e) => emit.fail(new Lost({ code: e.code })),
  })),
})

// definition
operations: ({ E }) => ({ price: Market.price.outcomes({ value: E.Priced, ended: E.PriceEnded }) }),
// machine: an alert fires only on a current value; Flow never delivers any other kind
WATCHING: {
  activities: [O.price.subscribe(({ memory }) => ({ symbol: memory.symbol }))],
  on: { Priced: [{ target: S.ALERT, guard: ({ event, memory }) => event.price > memory.limit }, { target: "self" }], PriceEnded: { target: S.OFFLINE } },
},

// view
const row = useView(watch, (s) => s.operations.price)
row?.current ? <Price v={row.current.price} /> :                    // NEW: current; undefined unless confirmed now
row?.lastKnown ? <Price dim v={row.lastKnown.value.price} asOf={row.lastKnown.at} /> : <Dash />  // NEW: lastKnown
```

## 5. Contract rules

`subscribe` describes **one connection**: `(input, { from }) => Stream<A | Signal, E>`. A plain `Stream<A, E>` is valid
(M6-D2). `Feed.callback` is the bridge from callbacks and the only one that knows the kind's bound. `Stream.fromAsyncIterable`
and `Stream.fromReadableStream` work for pulled sources.

**Signals.**

| Signal | Means | When to use |
| --- | --- | --- |
| `Feed.up()` | Registered. I can't say whether anything was missed | Default |
| `Feed.up({ continuous: "why" })` | Registered, and nothing since `from` was missed. The string is required and shown by Inspection | The server said so |
| `Feed.up({ missed: true })` | Registered, and something was lost. While up, it reports a loss mid-connection | Server's "lagged", or a reset |
| `head` on any `up` | The server's newest position, or on a reset, where the new log starts | A greeting |
| `Feed.down(reason)` | The SDK lost its connection and is healing itself | Self-healing SDKs only |
| `Feed.alive` | Sign of life with no value. Resets `idle` | Heartbeats, an empty poll |
| `Feed.finished` | The source proved it is complete | A terminator frame |

**Ending a connection.** The stream failing, or completing without `Feed.finished`, is a connection loss. Completing
is the reason `Feed.Closed`. `idle` expiring is `Feed.Silent`. Both go through `while` like any error, so a clean close
is never silently final (FC29, FC61) and a stall never reads as finished (FC37). No `reconnect` means the first loss
ends the session.

**`position`.** Unique and ordered within a log. A number or a string; a tuple `[epoch, seq]` for servers that restart
logs: a different first element is a different log, and positions in different logs are never compared. Optional:
without it there is no bookmark, every re-registration answers "may have missed", and `merge` is unavailable.

**`idle` is required** (`"never"` is allowed and reads as a decision). It is the one way to tell a flat market from a
dead socket (FC40, FC81), and it runs on Effect's `Clock`, so no adapter calls `Date.now` (FC38).

**`catchUp`** takes `{ after, cursor }` and returns `Feed.page({ items, next, gone })`, in any page order.
`next: undefined` means it reached `after`, or, with no `after`, that this is as far back as a first load goes. `gone`
means the history cannot serve `after`, including a position from another log. A page whose `next` repeats the last
one, or a walk over 1,000 pages (a constant, not an option), is a failure.

**Failures of `catchUp`** go through the same `while` and the same budget as connection losses. There is one budget.

## 6. State tables (normative)

### 6.1 T1: connection (both kinds)

States: `Connecting`, `Live`, `Down`, `Waiting` (backoff), `Ended`. `status` is a function of them: `Connecting` on the
session's first connection, else `Reconnecting`; `Live`; `Down` and `Waiting` → `Reconnecting`; `Ended`.

| Input ↓ / State → | `Connecting` | `Live` | `Down` | `Waiting` | `Ended` |
| --- | --- | --- | --- | --- | --- |
| `up` | → `Live`, T2 answer, start healthy clock | stay, T2 answer (facts: a second up is an interruption; state: confirm) | → `Live`, T2 answer | unreachable: no connection runs | discarded, evidence |
| value | implicit `up()` then as `Live` | deliver | facts: deliver and owe; state: `lastKnown` only. Stay `Down` | unreachable | discarded, evidence |
| `alive` | no change; arm `idle` | arm `idle` | arm `idle` | unreachable | discarded |
| `down(r)` | → `Down` | → `Down`, cancel catch-up | `reason` = r | unreachable | discarded |
| lost, `while` true, budget left | → `Waiting` | → `Waiting`, cancel catch-up | → `Waiting` | unreachable | discarded |
| lost, `while` false, or budget spent | → `Ended { e }` or `Ended { Exhausted { last } }` | same | same | unreachable | discarded |
| `finished` | → `Ended { Finished }` | same | same | unreachable | discarded |
| `idle` deadline | lost `Silent` | lost `Silent` | lost `Silent` | not armed | not armed |
| backoff done | unreachable | unreachable | unreachable | → `Connecting`, `from` = bookmark now | unreachable |
| healthy clock reaches `healthyAfter` | not armed | budget and schedule restart | not armed (a down stops it) | not armed | not armed |
| release | run release, await, gone | same | same | gone | gone |

`healthyAfter` defaults to 30 seconds. **Values never touch the budget** (test case 5). A reload restarts the budget:
a reload is the user's own action and is bounded by the user (FC77's cost, stated).

### 6.2 T2: bookmark (facts)

Saved: `followed`, `bookmark?`, `high?`, `owed` (`null`, `Loading`, `Maybe`, `Gone`), `notice`. `gen` counts
interruptions and is not user-visible. Below, "move" means `bookmark = max(bookmark, high, connection's head)`.

| Input | Result |
| --- | --- |
| Placement, nothing saved, no `from` option | Nothing yet |
| Placement, nothing saved, `from` option | `followed = true`, `bookmark` = its value (may be `undefined`) |
| `up`, not `followed` (a first open) | `followed = true`. With `catchUp`: `owed = Loading`, start it, `after` undefined. Without: `bookmark = head`. **No claim either way** |
| `up`, `head` in a different log from the bookmark | A reset: `bookmark = head`, `owed = null`, `notice = true`, cancel catch-up |
| first `up` of a connection, `continuous`, connection's `from` = bookmark, bookmark exists | `owed = null`, cancel catch-up. **The replay closes every older debt**, because it started at the bookmark |
| later `up` in a connection, `continuous` | Nothing new owed, an older debt stays. An SDK's rejoin says nothing about the bookmark |
| any other `up` (none, `missed`, or `continuous` with no bookmark) | `gen++`. `Loading` stays `Loading`, else `owed = Maybe`. With `catchUp`, restart it from the bookmark |
| value while `Down` | If nothing owed: `gen++`, `owed = Maybe`. No catch-up until `up` |
| overflow (6.4) | As `up({ missed: true })` |
| value committed, repeat-window hit | Dropped, evidence |
| value committed | `high = max`. If `owed = null`: `bookmark = max`. A value in another log with no greeting: `notice = true`, `bookmark` undefined, `owed = Maybe` |
| catch-up page | Items become values, sorted within the page. Next page only after they commit |
| page complete, and its `gen` is current | After its items commit: `owed = null`, move |
| page `gone`, and its `gen` is current | `owed = Gone`. Bookmark stays frozen, and each new session tries again |
| page or completion with an old `gen` | Discarded, evidence |
| `startOver`, connection `Live` | `owed = null`, `notice = false`, move, cancel catch-up |
| `startOver`, not `Live` | Forget everything: the next `up` is a first open |
| release, reload | Queue dropped, bookmark unmoved, so a replay brings those facts back (FC10). Repeat window: kept on release, emptied on reload |

**`head` moves the bookmark only when there is none.** If it moved while a replay was still arriving, a drop
mid-replay would lose the rest. The model's `headAlwaysMoves` mutant shows exactly that.

**The repeat window** holds the last 1,024 **committed** positions, is not saved, and is the only reason Flow drops a
fact. Flow never drops on `position <= bookmark`, because that loses a reordered fact (SR2). So delivery is
**at least once across a hole or a reload**, and a consumer keeps facts by position: `merge` does this, and entity
versions do it for `listen`. A counter must key by id.

**Row:**

| `missed` | When |
| --- | --- |
| `"Yes"` | `notice`, or `owed = Gone` |
| `"Maybe"` | `owed` is `Maybe` with no `catchUp`, or with `catchUp` once the session has `Ended` |
| `"None"` | Otherwise |

`catchingUp` is true while a catch-up runs. The `missed` outcome, when mapped, fires when `missed` leaves `"None"`,
FIFO before any later fact (SR5). `flow check` warns on a mapped `value` with neither `catchUp` nor `missed` mapped
(Q3).

### 6.3 T3: value (state)

| Connection | Value arrives | `up` with no value | `continuous` |
| --- | --- | --- | --- |
| `Connecting` | implicit up, `current = v`, deliver if not equal to last heard | `Live`, `current` stays undefined | `current` = last known |
| `Live` | `current = v`, deliver if not equal to last heard. Equal still confirms | no change | no change |
| `Down`, `Waiting` | `lastKnown = v`, **no delivery** | n/a | n/a |
| leaving `Live` | `lastKnown = { value: current, at: now }`, `current = undefined` | | |

Delivery: one pending slot per session, newest replaces. The row publishes at most once per Runtime publication
(SR3). `at` is the last moment the value was proven current.

### 6.4 Delivery and bounds

- A session has **one pending delivery**, outside the mailbox's 1,024 cap, so deliveries are bounded by placements
  (SR19). The next fact is not taken until the previous turn commits (SR4).
- A pulled source simply waits, because Flow does not pull (SR18).
- `Feed.callback`'s buffer holds 1,024 values. Facts past it are dropped with a recorded overflow and count; state keeps
  the newest. **Signals live in one latest-wins slot beside the buffer**, so values can never evict them and a flap
  costs fixed memory (FC26, FC49).
- `value`, `missed` and `ended` count as endings under rule 47. Rule 8 gains: a stream value is delivered only while its
  session lives; a released session's value is discarded with evidence, and the bookmark has not passed it.
  Not current or late under rule 14 (SR33), because the bookmark is what makes dropping it safe.

### 6.5 Ownership and release

The session belongs to the activation; a fragment's, to its incarnation. The bookmark record belongs to **(actor
identity, declarer's path, operation, key)**, in the same scope as the declarer's memory, and goes when that memory
goes. Records are small and are not evicted: bound = distinct keys ever placed per actor.

**Release before restart: `Feed.callback`'s returned Effect is run and awaited by Flow**, within the Runtime's 5-second
bound. Opening waits on any release in progress for the same **(Runtime, contract id, key)**, whichever actor or copy
owns it. Past the bound it opens anyway and records `ReleaseOverrun`.

*Why not Effect's finalizers:* the probe in section 10 saw `Fiber.interrupt` on a stream return before an async
`acquireRelease` release finished. A plain `Stream` adapter gets no such wait, and that is a stated limit.

| Edge | Connection | Bookmark | Row |
| --- | --- | --- | --- |
| Start | open from bookmark | load | `Connecting` |
| Leaving the state | release, await | kept | `undefined` |
| Actor disposal | release | saved if persisted | gone |
| New incarnation of the identity | new | loaded | `Connecting` |
| Runtime disposal | release, bounded | saved | gone |
| Reload or restore | new | loaded; `Loading`, `Maybe`, `Gone` resume | `lastKnown` restored |
| Freeze and thaw | release, then new | kept with the frozen slice | `undefined`, then `Connecting` |
| Page wake | overdue `idle` fires first, then frames (2.10.3's order) | unchanged | leaves `Live` at the first timer after wake |
| Second tab | its own sessions; no saved record | first open | as new |
| Leader handover | new generation | loads last commit | `Connecting` |

## 7. The test cases, walked

**1. Quiet room.**
- *With a greeting:* first open, `Feed.up({ head: 42 })`, bookmark 42, no claim. Session ends by any means; bookmark
  stays, saved. Events 43, 44 posted. New session opens `?after=42`, server resumes, `continuous`, replay. Nothing lost.
- *No head from the server:* `followed` is saved. New session, `up` → `Maybe`. `catchUp` runs, or the row says "Maybe".
  Never silent.
- *A plain stream with no signals:* it never reaches up while quiet, so it reads `Connecting` and `followed` stays false.
  It **claims nothing and is not Live**, but a later session cannot say what was missed. This is the stated cost of
  no signal at all (FC66); one `Feed.up()` fixes it.
- *First open:* not `followed`, no claim, `missed` is `"None"`.

**2. Snapshot first.**
- *Best: don't.* Declare the read as `catchUp`. It always starts after up, so there is no race.
- *When the read is elsewhere:* `O.messages.subscribe(select, { from: ({ memory }) => memory.head })`. A server `head` in
  the snapshot resumes after it, and an empty snapshot works, because it still has a head.
- *Empty snapshot with no head:* `from` returns `undefined`. The option's presence still marks `followed`, so the first
  `up` is `Maybe`: an honest cost of one read or one notice. `from` applies only when nothing is saved.

**3. Value after a drop, no new registration.** T1's `Down` row. Facts are delivered and owe, the bookmark freezes, and
the status stays `Reconnecting`. State goes only to `lastKnown`, never to the machine. The cost of the common adapter
mistake (FC64) is therefore "stuck Reconnecting", which is safe, visible, and flagged by Inspection (`ValuesWhileDown`).

**4. Repair by paging.**
- *Socket values during paging:* delivered as usual, interleaved; bookmark frozen.
- *Overlap:* the repeat window and `merge`.
- *Why completion is sound:* the read started after registration, so read plus live covers everything up to `high`.
- *Retention:* `gone` → `Gone`, `missed: "Yes"`, frozen; the user's Dismiss calls `startOver`.
- *Newest-first:* `next` walks backwards and stops at `after`. Flow sorts within a page, and `merge` copes across pages.
  ```ts
  next: last(items).seq > (after ?? 0) ? last(items).seq : undefined   // items newest first
  ```
- *Drop mid-repair:* T1 cancels; `gen` moves; a landed page is discarded; restart from the frozen bookmark.
- *A pager that never progresses:* the repeated `next` or page cap is a failure on the shared budget, so it ends.
- *Reload mid-repair:* `owed` is saved; the next `up` restarts (FC45).

**5. Flapping.** Only `healthyAfter` of unbroken up restores the budget. One replayed message per cycle changes nothing.
The model ends a flapper in 6 cycles at budget 5. After `Ended`, the machine decides; each re-open costs one replay
(FC73, stated).

**6. Equal keys and shared objects.**
- *Two fragment copies, equal keys:* two sessions and two bookmark records, by declarer's path.
- *Successor while predecessor closes:* the release gate in 6.5.
- *Shared SDK objects:* Flow does not share connections. An adapter whose SDK hands out one object per topic uses
  Effect's `RcMap` in its service, and fans out, with `Feed.up` sent at once to a late joiner.

**7. Price.** Section 4.2 and T3. Newest wins, `lastKnown` dims, the alert sees only current values, and an equal price
after a drop confirms without firing. A push-on-change server with no value on join: `current` stays `undefined`,
honestly dimmed, until it sends one, unless it sends `continuous` or declares a one-page `catchUp` (FC53).

**8. Entity domains.** One inequality replaces the case list:

> A covered answer is **fresh** when every covering session is `Live` and the read started after that session's `since`.

`since` is the moment of the latest `up` that was not proven continuous. So:
- A drop, an end or a release makes answers stale at once (FC28, FC48).
- `continuous` keeps `since`, so staleness caused by the drop lifts and returning costs no read (FC69 avoided when
  provable).
- Any other `up` moves `since`: subscribed answers refetch, the rest stay stale until read (FC5, FC19, FC47).
- First live is the same rule, so an answer read before it is stale (FC13).

The refetch is the repair: a `listen` debt closes at that `up`, and the machine never sees `missed`. Pushes apply at
arrival, outside record queues, and clear no `uncertain` (K13). `listen` takes facts only (type error), `ended` is
required, and M6-D6 stands.

**9. Persistence, SSR, reload.**
- *Saved with the memory, in one write:* facts: the T2 record. State: `lastKnown`, unless the field is sensitive.
- *Never saved:* queues, the repeat window, equality baselines (FC25), the budget.
- *Reload:* a restored state value is `lastKnown`, never delivered.
- *SSR:* sessions don't delay settling. Facts transfer as memory plus the T2 record, or via `from` reading transferred
  memory. A server-side `current` is demoted to `lastKnown` at dehydrate (FC78), with no `value` delivery on hydrate
  (SR32). Clients open their own sessions.

## 8. Other sources

The tables don't change. Only `subscribe` does.

| Source | `subscribe` | Notes |
| --- | --- | --- |
| **EventSource** | `new EventSource(url + "?after=" + from)`. `onerror`: `es.close()`, `emit.fail(new Lost())`. A `hello` event → `Feed.up({ continuous, head })` | Failing on error hands reconnect to Flow, so the browser's own `Last-Event-ID` never disagrees with a frozen bookmark (FC35). With no `hello`: `Feed.up()` on open, costing a read or notice per reconnect (FC52, FC74). Six connections per origin is a stated limit |
| **Socket.IO** | `connect`: `socket.recovered ? Feed.up({ continuous: "socket.recovered" }) : Feed.up()`. `disconnect`: `"io server disconnect"` fails `Kicked`, otherwise `Feed.down(reason)` | The SDK heals itself. A rejoin's proof doesn't close older debts (T2). No public offset, so `position` is the app's id |
| **Ably** | channel `attached`: `resumed ? Feed.up({ continuous: "ably resumed" }) : Feed.up()`. `suspended`, `disconnected`: `Feed.down`. `failed`: fail | `catchUp` is `history({ untilAttach: true })`, newest first. The first attach's `resumed: false` makes no claim, because it's a first open |
| **Supabase** | `SUBSCRIBED`: `Feed.up()`. `CHANNEL_ERROR`, `TIMED_OUT`: `Feed.down`. `CLOSED`: fail. Release: `removeChannel` | A change before `SUBSCRIBED` costs a second `up`, hence one extra repair (FC68). On a first open with no `catchUp`, that second `up` can show one spurious `Maybe`: a stated rare cost |
| **Firestore** (state) | `fromCache ? [Feed.down("Cached"), v] : [Feed.up(), v]` | No `cached` word needed: a value while down is last known (FC54, FC67). Repeated `up` on a state feed only confirms (FC62) |
| **graphql-ws** | Plain values. First value means up | No per-subscription ack, so a quiet subscription stays `Connecting` (FC51, FC66). Saying `Feed.up()` at `connection_ack` is possible and visibly a lie about registration. Server fix: a first "subscribed" event |
| **Polling** | `Stream.paginate` over GETs, keeping the cursor inside the connection, starting at `from`. First success: `Feed.up({ continuous: "cursor read", head })`. An empty poll: `Feed.alive` | A failed GET is a typed failure, and the retry resumes from the bookmark (FC72). Pulled, so it waits for turns |
| **Streaming `fetch`** | `fetch(url + "?after=" + from)`. Non-2xx: typed failure. Headers: `Feed.up({ head })`. `Stream.fromReadableStream(body)`, split lines. Terminator frame: `Feed.finished` | End with no terminator is `Closed`, not complete (FC80). `idle` catches a stall. Pulled |
| **Presence** (state) | Adapter folds `presence_state` and diffs with `Stream.mapAccum`, and emits the full map each time | Full state is what state means |

**A streaming write stays a transaction** (M6-D1, M6-D5, K10), with `progress` on the lane. One proposed change:
`progress` is a plain synchronous function, so an XHR callback calls it directly (FC58). LLM tokens and uploads are not
feeds. I did not re-examine the rest of the write lane.

## 9. Graph, Stories, tooling

**Single graph and runtime (SR38).** T1 to T3 are one Runtime record per session. There is no per-adapter machine, because
adapters only emit signals. `delivers`, `reconnect`, `catchUp`, `position` and `idle` are read off the contract without
running a closure.

**`flow check` (SR36).**
- Errors: a mapped `value` with no `ended`; a bare fact operation (`FactsNotHeld`: there's nowhere for the second fact to
  go); `position` on state and state in `listen` are type errors.
- Warnings: `DuplicateListen`; a fact feed with neither `position` nor `catchUp` (`CannotRecover`).
- Existing rules stand: `VerbMismatch`, `DuplicatePlacement`, `KeyRequired`, and the `KeyOmitsInput` exemption.

**`flow explain`:** `LIVE subscribes feed (Chat.messages, facts, one session per room, resumes, catches up, idle 45s)`.

**Inspection (SR37).** Per session: phase, last reason, the `continuous` string that was claimed (the dangerous line,
FC65, is therefore greppable and shown), bookmark, `owed`, overflow counts, release duration. Flags: `ValuesWhileDown`,
`UpsWithoutDrops`.

**Stories (SR34, SR35).** The real adapter runs against `Fake.webSocket` or a client half. The existing wire words cover
it, and nothing new is asked of `Fake`:

| Sequence | Control |
| --- | --- |
| Withhold the greeting | a control `open` reads, or `hold({ at: "open" })` |
| Hold or fail a page | the history endpoint's `hold`, or its handler |
| Reorder | `hold()`, then `release({ nth })` |
| Flap | a loop of `drop`, `advance` |
| Background tab | `advance(d, { suspended: true })` |
| What the server saw | `cp.read(Chat.socket)`'s `input` |

Flow's sleeps are tagged `reconnect`, `idle`, `healthy`, so `advance({ next: { operation: O.messages, timer: "reconnect" } })`
works. Rows and `session` records give the rest. Playback frames carry the row, which is plain data. `process()` doesn't
wait on an open connection; an open connection is already covered by rule 61's "connection its owner opened".

```ts
// quiet room, test case 1
const quiet = Story.machine(ChatRoom, { id: "chat/quiet-room", input: { room: "r1" }, fixtures: [ChatFake] })   // existing
  .checkpoint("first")                       // first open: status Live, missed None
  .reload()                                  // existing
  .world(Chat.post({ room: "r1", text: "hi" }))  // user-defined control
  .checkpoint("back")                        // the fake's log shows after=<head>; the message is held once
```

The Story spelling above is illustrative, and I did not run it.

## 10. What I ran and what I didn't

The owner's machine was under memory pressure, so everything ran serially with small counts. Files are in
`/private/tmp/claude-501/-Users-arpit--claude-spares-spare-Sy75Xy/b97bafc6-720f-455d-b91c-5aa81d337285/scratchpad/s2/`.

| Probe | Result |
| --- | --- |
| `model.ts`: T1 and T2 as code, 17 scripted cases | All 17 pass |
| `model.ts` random walks: 2,250 (3 servers, 4 pagers) with faults: invariants "bookmark never passes a hole" and "at quiet, no loss without a visible flag" | 0 violations. A small sample, not an exhaustive check |
| Mutants | 6 of 11 killed by the walks. The other 5 survived the walks and were killed by one directed script each (`kills.ts`) |
| `fx.ts`, `fx2.ts`: real Effect 4.0.5 on TestClock | `Fiber.interrupt` on a `Stream.callback` and a `Stream.unwrap`'d resource returned before an async release ended. Observed in that probe; I did not find the cause in Effect's source. `Schedule.both` is absent, `Schedule.max` and `recurs` exist |
| `spike.ts`: `tsc --strict`, hand-written types | `show(row.current)` is a type error, even after a status test. `status` reads on all phases. `position` on state and state in `listen` are type errors |

**The model changed the design in six places**, each a real bug in my first draft:

1. A reset's `head` must name where the **new log starts**, not its newest position. Otherwise facts posted between the
   reset and the reconnect are skipped.
2. A value in a new log with no greeting cannot set the bookmark. Nobody named the start.
3. The repeat window must record **commits**, not arrivals. Otherwise a released queue makes a replay look already seen.
4. A first open with `catchUp` must not take `head` as the bookmark, or the first load skips everything.
5. A `catchUp` given a position from another log must answer `gone`, never an empty success.
6. A special "empty snapshot owes" rule was redundant: `followed = true` already produces it. Removed.

**Weakening made to get to zero, for you to judge.** Two model waivers are stated limits, not proofs: a first load
accepts whatever history exists, and a repair with no bookmark cannot prove how far back it reached.

**Not run:**
- No Flow implementation exists. Nothing ran through a real Runtime, mailbox or React.
- T3 (state feeds), `Feed.callback`'s overflow slot, the `since` rule for entity domains, persistence atomicity and SSR
  are unmodelled, reasoned only.
- The budget ran on abstract ticks, not TestClock, and real `Schedule` stepping was not exercised.
- The section 4 and 8 adapters did not compile. `WebSocketConstructor`'s call shape and the vendor SDKs' behaviour are
  taken from `prior-art-*.md` and Effect's source, not run. Firestore's `fromCache` is unconfirmed there.
- The Story above did not run, and no agent trial for SR40 was done.

## 11. Cut, limits, open questions

**Cut:**
- **Outbound ephemeral state (SR28, cursors).** Out of scope. Workaround: an adapter service owns a latest-wins send,
  re-sends on `up`, and clears in its release, with the view calling it directly. Inbound cursors are a state feed.
- **Dense-position hole detection.** Positions never infer holes (SR12). An adapter that notices says `up({ missed: true })`.
- **Sharing a connection across consumers** (FC18, M6-D6's open question). `RcMap` in the adapter.
- **Fact values in the row.** A fact feed with no consumer has nowhere to hold them.
- **Partial repair progress.** A dropped repair restarts from the bookmark.
- **A reconnect-now member.** Stays parked; nothing precludes it.
- **Download resume, sync-engine guarantees.** Adapter code; a sync engine reports through the same signals, with
  `truncate` as a reset.

**Limits, deliberately not handled:**
- A server that reorders frames and then drops before the late frame arrives can lose it: the bookmark passed it.
- An adapter that lies with `continuous` is believed. The string makes it visible, not impossible.
- A premature `Feed.up()` can let a repair finish before registration (FC51). Flow cannot know.
- A sparse-position server that silently returns an empty page for an expired cursor reads as complete.
- A plain `Stream` adapter gets no awaited release.
- A counter consumer double-counts across a hole unless it keys by id.

**Open, for the owner (proposed recommendations):**

| # | Question | Recommendation |
| --- | --- | --- |
| Q1 | An author clears a list and forgets `startOver`. Options: A keep it as documented, Inspection shows the bookmark; B a `keep` memory field that holds facts and bookmark together, so they can't diverge, at the cost of a new memory concept | A for now. It's the design's largest real risk, so it deserves a review on its own |
| Q2 | Is `idle` required? It adds a line to every contract | Yes. A decision, even `"never"`, beats a half-open socket reading Live |
| Q3 | Should a mapped `value` with no `catchUp` and no `missed` mapping be an error or a warning? `flow check` can't see a view reading `row.missed` | Warning, naming the row. The row is always correct, so nothing is silent |
| Q4 | Overturning K2/OD12 and M6-D3 (section 1) | Accept. Most of the savings come from these |
