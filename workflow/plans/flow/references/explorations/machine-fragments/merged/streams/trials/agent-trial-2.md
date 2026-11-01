# Agent trial 2: proposal-v3, sections 1, 2, 3, 6 only

Method: read sections 1, 2, 3, 6 (no reviews, no trials, no other proposals). Wrote code and expectations for 8 cases from that reading. THEN read section 5 (the tables) and checked. Part A is written before the check; Part B is the check.

## Part A. Code and expectations (before checking)

Shared: persisted actor unless stated. `fills` names the list. Delivery at least once, so handlers `upsert` by id.

### A1. Chat over a WebSocket, greeting, history, Clear chat, room switch A to B to A

```ts
messages: stream({
  id: "Chat.messages", input: { roomId: Schema.String }, output: Message, key: ["roomId"],
  delivers: "every", position: "cursor",
  subscribe: ({ roomId }, { from }) => Effect.map(ChatSocket, (c) => c.room(roomId, from)).pipe(Stream.unwrap),  // hello -> Feed.live({head}) or live({proof})
  catchUp: ({ roomId }, { from, next, signal }) => fetchPage(roomId, next ?? from, signal).pipe(Effect.map((p) =>
    p.truncated ? Feed.gone({ reason: "history starts later", items: p.messages, next: p.next })
    : p.complete ? Feed.done({ items: p.messages, proof: "page.complete", through: p.head })
    : Feed.more({ items: p.messages, next: p.next, through: p.next }))),
  reconnect: { while: (e) => e._tag === "ChatDropped" }, idleTime: "45 seconds",
})
memory: { roomId, messages: Schema.Array(Message), notice: Schema.optional(Schema.String) }
outcomes: { value: E.Message, pages: E.Page, missed: E.MayHaveMissed, fills: "messages", failure: { SignedOut, ChatDropped: E.FeedEnded, Feed: E.FeedEnded } }
LIVE: { activities: [O.messages.subscribe(({memory}) => ({ roomId: memory.roomId }))],
  on: { Message: upsert, Page: upsertAll, MayHaveMissed: notice,
        SwitchRoom: { target: S.LIVE, updateMemory: ({event}) => ({ roomId: event.roomId, messages: [] }) },
        ClearChat: { target: "self", updateMemory: () => ({ messages: [] }) } } }
```

Expectations:
- Reload: field and bookmark restored together; socket opens with `from`; replay, no notice if the server echoes `replayedFrom`. Cleared chat stays cleared.
- Wi-Fi drop: row goes Waiting, retries every few seconds forever (default), reconnects with `from`; replay fills the gap; no notice if proven.
- Room A to B to A: B reads history, A wiped on return and re-reads from the start, no notice.
- Clear chat then A to B to A: stays cleared (I assumed "cleared" is sticky until reload). Guess.
- Bug `messages: []`: permanent, silent.

### A2. Inbox with Dismiss all, then reload

```ts
inbox: stream({ id: "Inbox.items", input: { userId }, output: Item, key: ["userId"], delivers: "every", position: "id",
  subscribe: ({ userId }, { from }) => InboxSocket.items(userId, from),
  catchUp: ({ userId }, { from, next, signal }) => fetchSince(userId, next ?? from, signal).pipe(/* done / more / gone as chat */),
  reconnect: { while: (e) => e._tag === "InboxDropped" }, idleTime: "45 seconds" })
fills: "items"
DismissAll: { target: "self", updateMemory: () => ({ items: [] }) }     // I think: cleared
```

Expectations:
- Reload (persisted): inbox stays empty, new items after the bookmark arrive.
- Reload (not persisted): new slice, history re-read, the dismissed items come back. I would have called that a bug in the framework; I now think it is how an unpersisted actor works.
- Wi-Fi drop: stays empty, replay only newer items.
- Re-entry (leave screen and return, same actor, session released): I guessed the field was empty before and after, so nothing changes: stays dismissed. Guess.
- Bug writing `items: []`: same as Dismiss all.

### A3. Unread counter

```ts
delivers: "every", position: "id",            // no catchUp
subscribe: ({ userId }, { from }) => notifications(userId, from),
reconnect: { while: ... }, idleTime: "30 seconds",
memory: { unread: Schema.Int }, fills: "unread",
Notification: { target: "self", updateMemory: ({ memory }) => ({ unread: memory.unread + 1 }) },
MarkRead: { target: "self", updateMemory: () => ({ unread: 0 }) },
MayHaveMissed: { target: "self", updateMemory: () => ({ countMayBeLow: true }) },
```

Expectations: reload keeps count and bookmark. Wi-Fi drop: replay from the bookmark may repeat the last delivered item (at least once), so `+ 1` may over-count by one; my first draft had no `seen`. MarkRead then reload: stays 0. Re-entry with released session: wipe only if the count was emptied while released; no catchUp, so `missed` notice. Bug `unread: 0`: reads as MarkRead.

### A4. Toast feed, `fills: false`

```ts
delivers: "every", position: "id", no catchUp, reconnect + idleTime,
memory: { toasts: Schema.Array(Toast) }, fills: false,
Toast: { target: "self", updateMemory: ({ memory, event }) => ({ toasts: [...memory.toasts, event.toast] }) },
Expire: { target: "self", updateMemory: ({ memory, event }) => ({ toasts: memory.toasts.filter((t) => t.id !== event.id) }) },
```

Expectations: never wiped. Reload (persisted): continues from the bookmark, so toasts shown before are not re-shown, but toasts that arrived while the tab was closed replay as a burst. Wi-Fi drop: continues from bookmark, replay or a `missed`. Re-entry with released session and same memory: continues from bookmark. Bug `toasts: []`: harmless, since `fills: false` means the empty list means nothing to Flow.

### A5. List trimmed to 100

```ts
Message: updateMemory: ({ memory, event }) => ({ messages: upsert(memory.messages, event.message).slice(-100) }),
Page:    updateMemory: ({ memory, event }) => ({ messages: upsertAll(memory.messages, event.messages).slice(-100) }),
```

Expectations: a trimmed list is non-empty, so it is not read as a clear or wipe. Reload and drop: unaffected, the bookmark is at the newest. A wipe re-read walks all of history, each page trimmed, ends with the newest 100 if pages arrive oldest-first. I did not think about page order.

### A6. Plain EventSource, no positions, "may be missing" notice

```ts
delivers: "every",                              // no position, no catchUp
subscribe: ({ userId }) => Feed.callback<Note, SseDropped>((emit) => Effect.gen(function* () {
  const es = new EventSource(`/notes?user=${userId}`)   // (through the Sse service in real code)
  es.onopen = () => emit(Feed.live())
  es.onmessage = (m) => emit(toNote(m))
  es.onerror = () => emit.fail(new SseDropped())
  yield* Effect.addFinalizer(() => Effect.sync(() => es.close()))
})),
reconnect: { while: (e) => e._tag === "SseDropped" }, idleTime: "Infinity",
fills: "notes",  MayHaveMissed: { updateMemory: () => ({ notice: "Some items may be missing." }) }
```

Expectations: first open no notice. Wi-Fi drop: reconnect, `Feed.live()` proves nothing, one `missed Unproven`, notice shown once. Reload: new connection, nothing proven. Is that a notice? I guessed no notice on reload when the actor is not persisted and a notice when persisted. Re-entry: wipe without catchUp: `missed`. Half-open connection: I guessed `idleTime: "Infinity"` is fine for EventSource; I did not see that it means no detection.

### A7. Limit-style history endpoint, newest 50, no cursor parameter

First draft (natural):
```ts
catchUp: ({ roomId }, { signal }) => latest50(roomId, signal).pipe(Effect.map((p) =>
  Feed.done({ items: p.messages, proof: "newest 50", through: p.head })))
```
Expectation before reading 3.4's warning: this is fine, since a limit endpoint always returns the latest. (Wrong, see Part B.) Corrected from 3.4: overlap check on `from`, else `Feed.gone` with items.

### A8. Refresh button

```ts
Refresh: { target: "self", updateMemory: () => ({ messages: [] }) }   // first draft: expected a re-read
```
Expectation: emptying the list makes Flow re-read, like a wipe. Corrected from 3.7: `O.messages.refetch(...)` is the recipe.

## Part B. Check against section 5 (tables) and sections 1 to 3
Rules used: T1 `connect` (wipe test: entry exists, `filled`, field empty), T2 rows 3 to 7, T3 (`filled` = field not empty at the end of any turn where the key's session stays placed and has connected; a releasing turn may raise it, never lower it), T1 rows `refetch`/`bookmark`/value-in-`Dropped`.

### B1. Per-case result

| Case | Reload | Wi-Fi drop | Re-entry | Bug `[]` | My guess |
| --- | --- | --- | --- | --- | --- |
| 1 Chat | Persisted: row 6, `Repairing` from `at`, no notice if the echo proves. Not persisted: new slice, first open, whole history returns, cleared items too | `Waiting`, retries (30 s cap), row 4 or row 6 | A to B to A: A's entry is `filled`, field emptied by the switch turn, wipe, re-read from start, no notice. Clear then A to B to A with no message in between: `filled` was lowered by the clear and a releasing turn cannot raise it, so not a wipe, row 6, continues from `at`, stays cleared. With a message in between: returns (3.7.1) | Permanent, silent (3.7) | Right. One nuance missed: "stays cleared" is conditional on no message arriving or being sent (own sends count, see C3) |
| 2 Inbox | Persisted: stays dismissed. Not persisted: all return | Stays dismissed, replays only after `at` | Same as chat. If Dismiss all has `target: S.EMPTY` (a state without the activity), the turn releases the session, so it is a wipe and the list returns on re-entry (3.7 row 2) | Same as Dismiss all | Right for `target: "self"`; I did not think of the leaving target |
| 3 Counter | Persisted: count and bookmark together, row 6, `notice(Unproven)` unless proof. Not persisted: 0, first open from now, no notice | Replay or `notice(Unproven)` | Count kept in memory; row 6 | `unread: 0` is a MarkRead | Right on persisted. I had not asked what a non-persisted reload shows (C2) |
| 4 Toasts | Persisted: row 6, replays whatever the server can prove after `at`. Not persisted: fresh | As reload | `fills: false` is always empty, never wiped: continues from `at`. A returning screen may get a burst of toasts that arrived while away | `toasts: []` harmless | Right |
| 5 Trim 100 | Non-empty, so never a clear or a wipe. Reload and drop unaffected | Unaffected | Unaffected | n/a | Right on flags. Missed page order (C1) |
| 6 EventSource, no position | Persisted: `{at: undefined}`, row 7, one notice. Not persisted: first open, no notice | `onerror` then `fail`, retry, `Feed.live()` proves nothing, row 7, one notice. A half-open drop: nothing fires (`Infinity`) | Row 7 or row 5, one notice | Permanent | Right, plus the half-open cost |
| 7 Limit 50 | Row 6, `from` = bookmark; overlap test in the recipe | Same | Same | n/a | **Wrong**: I wrote `Feed.done` unconditionally |
| 8 Refresh | n/a | Offline Refresh: T3 only, then row 7, `notice(Unproven)` and a read from undefined | n/a | n/a | **Wrong**: I wrote `messages: []` and expected a re-read |

### B2. Wrong guesses

1. **A7: `Feed.done` for a limit endpoint.** Silent gap of everything older than the newest 50, with a true-looking `proof`. Stated: 3.4, and section 1 ("a false `Feed.done` proof"). Already a stated limit.
2. **A8: Refresh as `messages: []`.** Stays empty. Stated: 3.7 last row. Already stated (the recipe is `refetch`).
3. **A3: no `seen` set.** Over-count on a replay. Stated: 3.5, section 1 row ("a counter's duplicates").
4. **A6/A1: `new EventSource` or `new WebSocket` directly.** Reaches no fake. Stated 3.1 comment. Minor.
5. **A5: page order.** See C1.
6. **A2/A3/A4: assuming reload keeps the state.** Only a persisted actor does (3.6, last line). Stated, but see C2.

### B3. Silent-loss findings, classified

**C1. NEW. A bounded list trimmed in a handler loses the newest items after a newest-first repair.** Ordinary code: `Page: upsertAll(memory.messages, event.messages).slice(-100)`, a feed whose history API is newest-first (the Ably recipe in 6.8 is exactly this; 3.4's `done` comment says "newest first").
Sequence: (1) list holds the newest 100, bookmark `at = p`. (2) Wi-Fi drops for ten minutes; 250 messages are posted. (3) Reconnect, row 6, `Repairing` from `p`. (4) `catchUp` walks back from the head: page 1 is messages 151 to 250, page 2 is 51 to 150, page 3 is 1 to 50 (each page reversed to oldest first, as in 6.8). (5) Each page is one turn; `upsertAll` appends in arrival order, so after page 3 the list is [old 100, 151..250, 51..150, 1..50] and `slice(-100)` keeps 51..150 then 1..50, that is the OLDEST of the walk. (6) `done` with `proof: "walked back to from"` and `through: head`: the bookmark moves to the head, no notice, no `missed`. Result: the newest ~200 are gone from the list, the bookmark says they were offered, nothing re-reads them until a wipe. Flow did everything right; the author's trim and the page order did it. The sections give no order contract for `Page` (3.4 says only that `more`'s `through` is "oldest first"), and no hint that a bounded list must sort by position before trimming. Same code with a forward walk (`from` defined, oldest first, as in chat's `fetchPage(next ?? from)`) is correct, so tests on a quiet fixture pass. Fix to say: pages arrive in read order, which may be newest first; sort by `position` before any bound. Silent: yes. Stated in section 1: no ("A list shortened by your own bug" is the nearest row, but this code looks correct).

**C2. Implied, not listed. Counters, toasts and any `fills` feed on a non-persisted actor start fresh after a reload, with no notice.** An unread counter reads 0 after reload while the server has 5 unread; nothing says "may be missing" because T2 row 3 is a first open (no entry, field empty). Stated in 3.6's last line and row 3's "No notice", but section 1's silent table has no row for it, and 6.4 says "or accept drift" without naming this. Classify: stated limit by rule, not in section 1. The same applies to the inbox: dismissed items return after a reload of a non-persisted actor.

**C3. Stated limit, but more reachable than it reads.** 3.7.1's "a later message" includes the user's own sends and optimistic echoes: Clear chat, type "hi" (a local append to `messages`, which also breaks "the field holds only this feed's items"), switch rooms and back: the field was non-empty so `filled` is true, the switch emptied it, so it is a wipe and the cleared history returns. Visible, nothing lost, but expect it in the first QA pass. Its recipe is also incomplete as written: `.filter(after(memory.clearedBefore))` is shown in the `Message` handler only, and the re-read arrives through `Page`, so the filter must be in `Page` too; and `clearedBefore` must be per room (a single field applied across rooms would hide room B's messages with older cursors without any notice).

**C4. Stated limit, section 1 wording narrower than T3.** T3's bound (256 entries per operation, oldest out) is generic, section 1 mentions only `subscribe.each`. A plain keyed feed with no `catchUp` (EventSource list per user, a counter per topic) that is switched through more than 256 keys: the key's entry is evicted, the switch emptied the field, so on return it reads "none, empty", row 3, first open, no notice. Items from the time away vanish without a `missed`. With `catchUp` the same sequence re-reads, so nothing is lost. Rare, but ordinary code.

**C5. Stated (3.2, 6.8), absent from section 1's silent table: half-open connection with `idleTime: "Infinity"`.** The plain EventSource feed (case 6) cannot detect it, so a Wi-Fi drop that does not reach `onerror` loses items with no `missed`, no `Waiting`, `connection` still `Live`. Section 1's opening says "a view cannot show an old price as current by accident"; Firestore and EventSource are exceptions listed only in 6.8's table.

**C6. Visible, not silent: Refresh on a feed without `catchUp`.** `messages: []` plus `O.x.refetch`: T1 `refetch` with no `catchUp` is `notice(Unproven)` and nothing re-reads. The list is emptied and stays empty, with a "may be missing" notice. 3.7 calls refetch "the one recipe for reload" and does not say it needs `catchUp`. Offline Refresh also adds a notice before the read (row 7).

**C7. Tension, not a loss.** 3.6 endorses `fills: false` for toasts; section 1's silent table lists `fills: false` where a list exists as a silent limit. Both are right (a short-lived list may be lost); worth one sentence saying which lists are allowed to be lost.

### B4. What I would write differently now
- Refresh: `Refresh: { target: "self", actions: [O.messages.refetch(...)] }` with no `messages: []` (the read upserts), only on a feed with `catchUp`.
- Bounded list: sort by position, then trim; do it in `Message` and `Page`.
- Limit endpoint: the 3.4 recipe, verbatim.
- Counter/toast: no `catchUp`, `seen` set for the counter, and a server count (REST) for a counter that must survive a reload.
- Plain EventSource: `onopen` emits `Feed.live()`; accept `Infinity`, or use `fetch` with blank-line heartbeats.
