# Agent trial of proposal-v3 (feature code written from the docs)

Method and honesty notes first.
- Read only `proposal-v3.md`. The tool cap forced me through lines 1-675 (so I also read Q1-Q6 and T1-T6 before writing). I then read section 8 (SDK recipes, lines 735-910) as worked examples. I did not read 676-734, 911+ (traceability, graph, amendments, "what I ran"), or anything else.
- Code below is **as first written**, from memory of the doc, before I re-checked tables. It is biased in my favour: I had just read the chat sample, so I copied it. Treat "right first time" as an upper bound. Nothing was compiled or run.
- Tables were consulted only in the "check" step (T1, T2, T3 and the Q1 tables). I note where.

## What was easy

- The chat sample is a good template. Copying it and deleting `after`/`cursor` gave a working shape in minutes.
- `fills: "messages"` is one line and the name is guessable once you know "the field this feed fills".
- The `Feed.ping`, `Feed.live`, `emit.fail` vocabulary is small. Classifying a close code into `ChatDropped` or `SignedOut` is obvious.
- "Offline retries forever, one try per 30 s, row says `Connecting`" matches what an app developer wants. I did not need to write RETRY_WAIT.
- Bare `operations: presence: Presence.room` plus `useView` for a view-only feed (case 7) is the nicest part of the API.

## First-written code

### Case 1. Chat: raw WebSocket, hello, history; Clear chat; switch room

```ts
// contract
messages: stream({
  id: "Chat.messages", input: { roomId: Schema.String }, output: Message, key: ["roomId"],
  delivers: "every", position: "cursor", errors: [ChatDropped, SignedOut],
  idle: "45 seconds",
  reconnect: { while: ["ChatDropped"] },
  subscribe: ({ roomId }, { from, callback }) => callback((emit) => Effect.gen(function* () {
    const ws = new WebSocket(roomUrl(roomId, from))
    ws.onmessage = (e) => {
      const f = frameOf(e)
      if (f.t === "hello") emit(f.replayedFrom === from ? Feed.live({ proof: "replayed" }) : Feed.live({ at: f.head }))
      else emit(f.message)
    }
    ws.onclose = (e) => emit.fail(e.code === 4401 ? new SignedOut() : new ChatDropped({ code: e.code }))
    yield* Effect.addFinalizer(() => Effect.sync(() => ws.close()))
  })),
  catchUp: ({ roomId }, { from, signal }) =>
    fetchHistory(roomId, from, signal).pipe(Effect.map((p) => Feed.done(p.messages, { at: p.head }))),
}),
// definition
memory: { roomId: Schema.String, messages: Schema.Array(Message), notice: Schema.optional(Schema.String) },
operations: ({ E }) => ({ messages: Chat.messages.outcomes({
  value: E.Message.from((message) => ({ message })), missed: E.MayHaveMissed, fills: "messages",
  failure: { SignedOut: E.SignedOut, Feed: E.FeedEnded } }) }),
// machine
LIVE: { activities: [O.messages.subscribe(({ memory }) => ({ roomId: memory.roomId }))],
  on: {
    Message: { target: "self", updateMemory: ({ memory, event }) => ({ messages: [...memory.messages, event.message] }) },
    MayHaveMissed: { target: "self", updateMemory: () => ({ notice: "Some messages may be missing." }) },
    ClearChat: { target: "self", updateMemory: () => ({ messages: [] }) },
    SwitchRoom: { target: S.LIVE, updateMemory: ({ event }) => ({ roomId: event.roomId, messages: [] }) },
    FeedEnded: { target: S.ENDED }, SignedOut: { target: S.SIGNED_OUT } } },
```

Expectations I wrote before checking:
- Reload: after Clear, still cleared; new messages appear. Right (T3 "held false").
- Wi-Fi drop: banner, retry forever, replay from bookmark, no notice if hello echoes. Right.
- Re-entry (leave state, return later): history comes back only if memory was emptied. Right.
- A→B→A: A's history reappears on return. **Wrong in one case, see below.**
- `messages: []` bug: I expected the next reload or reconnect to refill it. **Wrong.**

### Case 2. Notification inbox, Dismiss all, reload

```ts
// same contract shape as case 1, output Notification, position "id"
fills: "items",
DismissAll: { target: "self", updateMemory: () => ({ items: [] }) },
Notification: { target: "self", updateMemory: ({ memory, event }) => ({ items: [...memory.items, event.n] }) },
```
Expectation: stays dismissed after reload and reconnect; new ones appear; same as Clear.

### Case 3. Unread counter, count only

```ts
delivers: "every", position: "id", errors: [Dropped], idle: "30 seconds", reconnect: { while: ["Dropped"] },
subscribe: ...,                                   // no catchUp: I don't want history counted
memory: { unread: Schema.Int },
fills: "unread",
Notification: { target: "self", updateMemory: ({ memory }) => ({ unread: memory.unread + 1 }) },
MarkRead: { target: "self", updateMemory: () => ({ unread: 0 }) },
MayHaveMissed: { target: "self", updateMemory: () => ({ countMayBeLow: true }) },
```
Expectation: reload keeps count and resumes after the bookmark; a drop with replay-after-`from` counts exactly the missed; MarkRead stays 0.

### Case 4. Toast feed, remove after 5 seconds

```ts
fills: "toasts",                                  // toasts live in memory
Toast: { target: "self", updateMemory: ({ memory, event }) => ({ toasts: [...memory.toasts, { ...event.t, expires: now + 5000 }] }) },
// removal: a schedule on the state, tick every second, filter out expired       // GUESS: schedules syntax copied from v2's RETRY_WAIT
```
Expectation: after expiry the field is empty so it stays gone; after reload old toasts are not re-shown.

### Case 5. List trimmed to last 100

```ts
Message: { target: "self", updateMemory: ({ memory, event }) => ({ messages: [...memory.messages, event.message].slice(-100) }) },
catchUp: ({ roomId }, { from, signal }) =>
  fetchLatest(roomId, 100, signal).pipe(Effect.map((p) => Feed.done(p.messages, { at: p.head }))),   // GET /messages?limit=100, a snapshot of the newest 100
```
Expectation: a reload or long drop restores up to the last 100; nothing silent.

### Case 6. Plain EventSource, no positions, no history

```ts
delivers: "every", errors: [SseDropped], idle: "never", reconnect: { while: ["SseDropped"] },
subscribe: ({ userId }, { callback }) => callback((emit) => Effect.gen(function* () {
  const es = new EventSource(`/feed?user=${userId}`)
  es.onmessage = (m) => emit(toMsg(m))
  es.onerror = () => emit.fail(new SseDropped())
  yield* Effect.addFinalizer(() => Effect.sync(() => es.close()))
})),
fills: "items", missed: E.MayHaveMissed,        // handler: notice "some messages may be missing"
```
Expectation: first load, no notice. Every reconnect and every reload with a filled list: one notice. Right per rows 3 and 7.

### Case 7. Stock ticker view, no machine handling

```ts
Market.quote = stream({ id: "Market.quote", input: { symbol }, output: Quote, key: ["symbol"],
  delivers: "latest", errors: [MarketDropped], idle: "25 seconds",
  reconnect: { while: ["MarketDropped"] },
  subscribe: ({ symbol }) => Stream.unwrap(Effect.map(MarketFeed, (mf) => mf.quotes(symbol))) })
operations: ({ E }) => ({ quotes: Market.quote })          // bare
WATCHING: { activities: [O.quotes.subscribe.each(({ memory }) => memory.watchlist.map((symbol) => ({ symbol })))] }
// view: row.value ? <Price/> : row.last ? <Price dim/> : <Price pending/>
```
Expectation: reload shows last price dimmed "as of", then live. Drop shows dim. Right.

### Case 8. List in a parent machine, fed by a child fragment

```ts
// child fragment: owns the subscription
Chat.fragment = { operations: { messages: Chat.messages.outcomes({ value: ..., missed: ..., fills: "messages", failure: ... }) },
  states: { LIVE: { activities: [O.messages.subscribe(({ memory }) => ({ roomId: memory.roomId }))],
                    on: { Message: { target: "self", updateMemory: upsertInto("messages") } } } } }
// parent: mounts it and reads the list
parent.memory = { roomId, messages: Schema.Array(Message) }
parent.on.ResetAll = { updateMemory: () => ({ messages: [] }) }
```
GUESS: the fragment can name the parent's `messages` in `fills`. I found nothing in what I read about how a fragment sees memory.

## Where I was wrong, unsure, or guessed

### Silent loss (nothing tells the user or the dev)

1. **Accidental `messages: []` (or any reset-to-empty) is permanent.** I expected a reconnect or reload to heal it. The doc's model is the opposite: an empty field while the session stays placed means "the user cleared it" (`held` false). It stays empty across reconnect and reload, with no notice, and Flow cannot tell a bug from Clear. The doc lists "A list shortened by your own bug" as silent, but "emptied by your own bug" is the stronger case and is described as a feature in the Clear row. An error-recovery path such as `onError: messages: []` becomes data loss. This is the biggest cost of the `fills` design and it is only visible by reading Q1's two tables together.
2. **A "Refresh" button written as `messages: []` shows an empty list forever.** To force a re-read you need `O.messages.bookmark({ roomId, at: undefined })`. That is mentioned once, inside a table cell (line 293). Section 4's one-line API says `bookmark(select)`, "returning the key fields and `at`". The cell passes a plain object, not a selector. I could not tell the call shape from section 4.
3. **`catchUp` that claims `done` over a window it did not read (cases 1 and 5).** I wrote `Feed.done(p.messages, { at: p.head })` against a history endpoint that returns only the newest N. With a gap larger than N the middle is lost and Flow believes it is complete. The doc's rule is in Q3 ("with `from` defined the read is a change log; snapshot-only: `from === undefined ? done : gone(...)`"), and for a truncated page the correct answer is `Feed.gone` (a notice). Nothing in the type tells you; the sample hides it because its `fetchPage` already returns `truncated` and `complete`. A developer with a plain `?limit=50` endpoint would write what I wrote. Listed in "Where loss stays silent" as "A read with `from` set that is not a change log", but the table says "Adapter" and not what a limit-style endpoint looks like.
4. **Case 8, host-kept list.** If the list lives in the parent and the child feeds it, the honest line is `fills: false`, and then a parent wipe is never seen as void: the feed continues from the bookmark and the old history never returns, no notice. If I name the parent's field instead, I do not know that the type accepts it. The doc calls this a limit ("cannot be found") and it is the most natural shape for case 8. I would have shipped the guess.
5. **Clear, then a new message, then A→B→A brings the cleared messages back.** Clear in A: `held` false. A new message arrives: field non-empty, `held` true. Switch to B and back: field empty, `held` true, so void, full re-read. The doc's row says Clear "stays cleared across connections and reloads". It does not say "until the next message and a room switch". Clear only holds while nothing has arrived since. I derived this from T3's `held` rule, not from any prose. This silently un-clears. Same applies to Dismiss all (case 2) when switching accounts or inboxes.
6. **Counter double-counts duplicates (case 3).** The doc says duplicates are safe ("Safe: duplicates", "a queued page may land after: duplicates only", stale `from` replays). That is true for `upsert` by id, false for `unread + 1`. A reconnect with a stale `from`, or the bookmark moving backward ("last delivered wins, may move backward"), over-counts silently. The doc never says a counter must de-dupe by id, or that a counter feed needs its own idempotence. I would not have thought of it.
7. **Counter with `catchUp`.** I deliberately left it out, and that is right. If I had added one (to "recover missed counts"), a void (sign-out clears the count in another state, `held` stays true) would re-read all history and count it as unread. Not stated for counters; I worked it out from the sign-out row.
8. **Toast with `fills: "toasts"` and a wipe in another state** (clear on sign-out) is void on return: old toasts replay. The doc's own recommendation is `fills: false` for "toast, stores nothing", but my toasts are stored in memory. The doc does not say which to choose when the list is stored and ephemeral. I guessed the field name; `fills: false` is probably safer. Wrong or right depends on a distinction the doc leaves implicit.

### Visible but wrong guesses

9. **`idle` on a server with no heartbeat (case 1).** I copied `idle: "45 seconds"`. My server sends a greeting and messages only. A quiet room would hit `Silent`, reconnect, register, die within the minute, 8 times, then `Flapping`, then `S.ENDED`, in about six minutes. It is visible (ENDED), but the doc says `idle` is "required with reconnect" without saying "your server must send something within this window or you must pick `never`". The raw-WebSocket row says "yes, a duration" and nothing about adding pings. "Does the hello itself re-arm `idle`?" is not stated either.
10. **Ticker pings (case 7).** The source note says "pings every 10 s" but `mf.quotes(symbol)` returns only quotes in the sample. If the per-symbol stream does not emit `Feed.ping`, a quiet symbol hits `Silent` at 25 s and flaps to ENDED. The multiplexed socket's pings must be fanned into each symbol's stream. The sample does not show it.
11. **EventSource and "SDKs that reconnect omit `reconnect`".** Rule says omit, but EventSource self-heals and the recipe has `reconnect` and `idle: "never"` and closes the source on error. I would have omitted `reconnect` and used `Feed.down` (browser reconnects, Last-Event-ID is sent). Plausibly works but then `idle` is unavailable and F10 fails. The rule and the recipe disagree on the same word.
12. **`new WebSocket` instead of `Socket.WebSocketConstructor`.** The sample's seam comment is easy to skip; it breaks Stories. Not a data issue.
13. **Plain `[...messages, m]` in `Message`.** Duplicates show on replay; the sample uses a user-defined `upsert` with no hint that it is required for correctness. The doc says duplicates are expected after replay, but does not say the handler must be idempotent.
14. **Persistence of memory.** I assumed memory and the bookmark are persisted across reload by default (Clear stays cleared). The doc rows say so ("Release, reload, freeze, thaw: none") but I never saw how an app opts in. If memory is not persisted, a reload is a new slice and the whole list re-reads, so Clear would not stay cleared.

### Words that confused me

- **`at`** means four things: `Feed.live({ at })` (the server's head, "I am registered here"), `Feed.done/more/gone({ at })` (where this read ends), `O.x.bookmark({ at })` (write the bookmark), and the bookmark's own `at`. I could not tell, writing the hello, when `Feed.live({ at: head })` matters. By T2, it is used at rows 3, 5, 7 and reset, and apparently ignored at row 6 (an existing bookmark), where only a catch-up `done`'s `at` matters. Not stated; I inferred it.
- **`position: "cursor"`** reads like a mode. It is a field name of `output`. The comment fixes it, but "position" vs "bookmark" vs "from" vs "at" vs "cursor" are five words for one idea.
- **`void`** (bookmark is void, "voided") reads like "invalid/ignored". It means "memory was wiped; the position cannot be trusted, so re-read from the start". I read it as the opposite at first.
- **`held`** sounds like "the user is holding the feed". It means "this field was non-empty at some turn in the placement".
- **`missed`** carries no reason in v3 (the payload is `E.MayHaveMissed` with nothing). The UI cannot tell Lost, Unproven and Reset apart. Fine, but the earlier text kept using the three names.
- **`reconnect: { while }`** reads as "reconnect while connected". It is the list of tags that Flow retries.
- **`catchUp` result types** `more` takes a second positional token and options; Ably's takes an object token. `Feed.more(items, p.next, { at: p.next })` in chat repeats `p.next` for two roles (token and position) without saying why.
- **`fills`** I first read as "how full" (a capacity). The table cell says it ties the bookmark to memory. A name like `holds`, `feedsField` or `into` would have been clearer; RV is not mine to quote.
- **`proof`** vs **`at`** in the hello: both are ways of saying "I'm live". When to use which is only in a comment (`sameCursor`).

## Per-case scorecard (reload / drop / re-entry / `[]` bug)

| Case | Code | Reload | Wi-Fi drop | Re-entry | `[]` bug |
| --- | --- | --- | --- | --- | --- |
| 1 Chat, Clear, switch | Compiles by inference, `catchUp` unsafe (3), `idle` unsafe (9) | Right | Right | A→B→A right unless Clear then message (5) | Wrong (1) |
| 2 Dismiss all | Right | Right | Right | Same as 5 | Wrong (1) |
| 3 Counter | Right shape, unsafe handler (6) | Right | Over-counts on duplicates (6) | Right if no `catchUp` (7) | `unread: 0` bug is permanent (1) |
| 4 Toast | Field choice unclear (8), timer syntax guessed | Unsure | Right | Unsure (8) | Same as 1 |
| 5 Trimmed 100 | `catchUp` wrong (3) | Wrong | Wrong on gaps over 100 | Right | Trim is fine |
| 6 EventSource | Right | Right | Right | Right | Same as 1 |
| 7 Ticker | Right, ping gap (10) | Right | Right | Right | n/a |
| 8 Parent list | Guessed (4) | Unsure | Right | Unsure | Silent (1, 4) |

**Right first time (code and all four expectations): 2 of 8 (cases 6 and 7).** Case 2 is right only if the user does not switch contexts. Cases 1, 3, 4, 5, 8 each had at least one wrong or guessed expectation.

## Silent-loss mistakes, short list

1. `messages: []` by accident is indistinguishable from Clear and sticks for good.
2. `Feed.done` over a snapshot or limit-style history endpoint hides a gap.
3. Host-kept parent list (case 8) is never void and loses history after a parent wipe.
4. Clear is only remembered until the next message plus a room switch, then the cleared items return.
5. A counter double-counts the duplicates the doc calls safe.

## Suggestions (advice only)

- Say in section 4, next to `fills`, one sentence: "Setting this field to empty while the session is placed means the user cleared it. It is never refilled."
- Put the `O.x.bookmark` call shape in section 4 with a Refresh example, and note it takes an object.
- Put the snapshot-endpoint recipe (`from === undefined ? done : gone`) beside the chat sample, not in Q3.
- Say that `idle` needs a server heartbeat or `"never"`, and show the ticker's per-symbol ping.
- Say handlers for `every` must be idempotent (upsert by id; counters need a seen set).
