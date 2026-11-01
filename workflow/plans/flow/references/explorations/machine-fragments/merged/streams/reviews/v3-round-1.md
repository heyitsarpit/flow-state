# Proposal v3 review, round 1 of 3

Status: advice to the main session, which decides. Nothing here is an owner decision. Reviewed
[../proposal-v3.md](../proposal-v3.md), dated 2026-11-01, against [../requirements-v3.md](../requirements-v3.md).

## 1. Verdict

**There are 4 Highs.** The core is good: my independent check of T1, T2, T3 and T4 found no hole in the session tables
in 18 configurations, except one narrow first-open race (Med9). The repair simplification (`seen`, `tail`, `meet`, P0 cut;
frozen bookmark) holds for no-hole safety. The weakness is not the tables. It is **what the bookmark is attached to**.

| # | High | One line |
| --- | --- | --- |
| H1 | The record's identity and lifetime are copied from write lanes, and they are wrong in both directions | Fresh memory meets an old bookmark: a silently empty list, with no author line that could prevent it |
| H2 | Room switch, clear, "reload everything": `forget` is not a real fix | A→B→A shows an empty room, green dot, no notice |
| H3 | `position` has no Schema | The record cannot be persisted or transferred as Persistence O2 and SSR O3 require. Cannot be built as written |
| H4 | A quiet feed gets a false notice on every reconnect, and `Feed.done` has no head | Authors will rewrite the guard v3 removed |

**One root cause covers H1, H2, part of H4 and three Mediums:** the bookmark claims something about memory ("this
consumer holds everything up to here"), but nothing ties it to that memory, in storage or in meaning. Section 2 proposes
one storage move and one contract line that together retire `forget` and `ReadBeforeFeed`.

**The traceability is too generous.** v3 says six conditional musts. By my reading it is **fifteen**, and three more rows do not
pass as written (section 5).

## 2. Root cause and the proposed convergence

The two proposed changes, written in full on chat. They go together; each can be judged alone.

**Change A: the bookmark lives in the memory slice's saved record, as a Flow-private partition.** It is not a memory
field: no patch, not readable by a guard, moved by the same step-1 cell v3 specifies, so every argument against option C
in Q1 still stands. But it is created, frozen, saved, transferred, decoded and dropped **with its slice**. No rule to
write for `resetOn`, `.each`, subroutines, disposal, decode failure, SSR omission or two placements. Identity becomes
(incarnation slice, instance path, operation, key). Words: none.

**Change B: one required line on a machine's `every` outcomes, saying whether memory still holds what the feed filled.**

```ts
// chat.definition.ts
messages: Chat.messages.outcomes({                     // existing: outcomes
  value: E.Message.from((message) => ({ message })),   // existing: value
  missed: E.MayHaveMissed,                             // existing: missed
  failure: { SignedOut: E.SignedOut, ChatDropped: E.FeedEnded, Feed: E.FeedEnded },   // existing in v3: Feed
  holds: (memory) => memory.messages.length > 0,       // NEW: holds. user-defined body. Read at each registration
}),

// chat.machine.ts: a room switch now needs no second line
SwitchRoom: {
  target: S.LIVE,
  updateMemory: ({ event }) => ({ roomId: event.roomId, messages: [] }),   // existing. `forget` is gone
},
```

| Bookmark | `holds` | Result at registration |
| --- | --- | --- |
| none | false | First open: T2 row 3, no notice |
| none | **true** | Memory has data the feed never filled (a read outside `catchUp`, SSR, seeded input). **Owes**: row 8 or 9. Replaces `ReadBeforeFeed` for every non-empty read, including those in a parent or another actor |
| `{ at: p }` | true | As T2 |
| `{ at: p }` | **false** | The bookmark's claim is false. With `catchUp`: read with `after` undefined, no notice, as a first open. Without: `missed Unproven`, then Live, and the bookmark restarts |
| `{ at: undefined }` | either | Owes, as T2 (G11's quiet room, memory empty) |

**Added:** `holds`, `Feed.done(items, { at })` (H4). **Dropped:** `forget`, `ReadBeforeFeed`, the no-`at` form of `O.x.bookmark` for non-empty reads, and row `bookmark` (to Inspection and `cp`).

**What it does not catch:** a list shortened but not emptied, undo-like restores, and a read that came back empty
(G12's empty case still needs `catchUp` or `O.x.bookmark`). Non-list consumers write their own test, such as
`(m) => m.count > 0`. "Clear chat, keep it cleared" needs a memory flag: `holds: (m) => m.messages.length > 0 || m.cleared`.

**Prior art:** blind's Q1 option B, a `keep` memory field, is the other way to bind the two (a new memory concept). v2's
guard `initial && memory empty` is the ancestor, but `holds` is one upfront line, Flow applies it, and it leaks no `why`
or `initial`. If the owner rejects `holds`, the honest alternative is option E (the author's cursor in memory, v2 made
explicit), and its failure table in Q1 returns. Q1's table marks D "Hole of the same size as B, narrowed". H2 shows it is
larger than Q1 thinks.

**Is this a clever hybrid?** I do not think so: it is one declared predicate, read at one place, whose failure direction
is an extra read or a notice. But the main session should judge it as a proposal. It is not modelled beyond S2 and S4.

## 3. Findings

Findings are H, Med and Low. A bare id such as M1, L5 or G15 is a row in requirements-v3.md.

### High

**H1. Identity and lifetime come from write lanes, where they are wrong.**

MD rule 46: a lane is a Runtime record "never inside the actor's record", and it "decodes … independent of the machine,
so a fresh incarnation adopts it even when the actor record no longer decodes". Rule 53: "writes outlive the
incarnation". Those are right for an obligation, and exactly wrong for a claim about memory. Rule 71 and T3 borrow the
subject path. Under rule 51 a subject path has one part per `.each` key and per `resetOn` value, nothing for a subroutine
or an ordinary placement. So:

| Failing scenario | What happens |
| --- | --- |
| Fragment with `resetOn` on `roomId`, the canonical pattern: A → B → A | Back on path `["A"]`, memory is initial. T3's "new subject path" does not apply: the path is old. `from = p`, server replays nothing, row 4 or 7, `Live`, empty list, no notice. **Section Q1's "A `resetOn` needs no `forget`" is false.** T9's `resetOn` row says "new, empty", T3 and rule 71 imply otherwise |
| `.each` copy removed, the same key added later (a tab closed and reopened) | New incarnation, same path `["d1"]`, same result |
| A stream in a subroutine (rule 48 allows it). Path has no part | Each invocation starts with fresh memory on one record |
| Upgrade where the actor record no longer decodes | Under rule 46's lane behaviour the record survives while memory restarts. Silent |
| Explicit dispose then `ensure` of one identity | T9 says "saved if persisted"; Persistence O3 removes the actor from the next capture. The bookmark must die too. T9 is silent |
| Two sibling placements `left: ChatPane`, `right: ChatPane` on one room in one actor (L5) | Both have path `[]`, rule 70 gives two sessions, rule 71 gives **one record**. Left's values move the bookmark for Right. Right reloads from Left's place |
| Actor omitted from SSR for sensitive memory (SSR O3) | A separate record may transfer without memory, or memory without the record. Needs its own rule |
| 5 actors with `.each` on `every` feeds | T3 allows 1,024 records per operation. Persistence O3: a scope admits 4,096 records and "exceeding either bound rejects the whole capture without eviction". All saving stops |

I ran the first (same trace for all): `S4` in `s.py` ends `Live`, bookmark past the item, nothing held, no notice.

**Fix:** Change A. It removes every row above and the 4,096 problem (only 16 MiB then applies). The "one capture" claim
then holds by construction. Note the citation is wrong today: rule 38 is about a lane, its Attempt and its predicted keys
acknowledged before invocation. What gives "one capture with memory" is **Persistence O3**: a capture "sees only whole
publications, never part of a turn". So a value's cell in step 1 and its patch in step 6 do land together; v3's result is
right for the wrong reason. Settle and row 1, 3 are Runtime steps and whole publications too.

**H2. `forget` is not a fix: the hole remains, and it is the common case.**

Q1 says of a cleared list: "the list stays short, visibly, with no wrong data". Walk the most common chat there is:

```ts
// existing words only. The natural line, as v2's readers already write it
SwitchRoom: { target: "self", updateMemory: ({ event }) => ({ roomId: event.roomId, messages: [] }) },
```

A → B → A in one actor. T9 "Leave, key gone: kept". The bookmark for A says `p`. Back on A: `from = p`, quiet, `Live`, an
**empty room with a green dot and no notice**, forever if the server has no replay. Not "short": empty. Ran as `S2`:
`st=Live`, owes the item, zero notices, my H1 check fails. In v2 the author's `cursor: undefined` sat on the same line as
`messages: []`. Locality was lost.

`forget` has three further faults:

1. **It reads the wrong memory.** MD 2.5: action selects read the **After** memory. `O.messages.forget(({ memory }) =>
   ({ roomId: memory.roomId }))` in that handler forgets **B**. The correct form needs the old key from a mapper. Nobody
   will write it first time.
2. **"Reload everything" does not reload.** T1 for `Live`: `forget` applies T3 and stays `Live`. Ran as `S3`: list empty,
   bookmark none, `Live`, no read, no notice, and the check passes because a forgotten bookmark owes nothing. It waits for
   the next connection.
3. **A record for `{ messages: [] }` is invisible to tooling** ("No check can see it"; v3 says so). So the design's rule 1 of
   "Nobody can silently lose data" has a hole no tool reports.

Is it a real fix? **No.** It is a word you must remember in the one place nothing reminds you.

**Fix:** Change B. If rejected, the other honest answer is the position in memory (option E).

**H3. `position` has no Schema, so the record cannot be built as written.**

`position?: (a: A) => P | undefined`. v2's `after: Schema.optional(Cursor)` carried the Schema, and v3 removes it.
Persistence O2: "Persisted Schemas must encode and decode synchronously … Unsupported values fail encoding instead of
being coerced". O3: "encoding failure preserves the last good capture", so one Date, BigInt or class position **stops all
saving**. SSR O3: "Omit values without a usable Schema": the record is omitted and the hydrated client sees none, with
memory holding items, so **row 3, silent loss**, which is P5's exact failure. An upgrade that changes the position's shape
has nothing to decode against. `restartAt` and `O.x.bookmark({ at })` are also untyped. The Story's
`bookmark?.at?.epoch` shows the sample's cursor is an object, so section 2.1's `f.replayedFrom === from` never matches and
`` `${from}` `` prints `[object Object]`: a second bug from the same root.

**Fix, no new word, and it removes a closure:**

```ts
position: "cursor",   // RENAMED shape: a field name of `output`. Its Schema is output's field. Readable without running code
```

A computed position, if any real case needs one: `position: { schema: Cursor, of: (m) => m.cursor }`. None of the eleven
samples does. On a record that fails to decode, read `{ at: undefined }`: owes, never none.

**H4. A quiet feed gets a false notice on every reconnect, with no way out but the guard v3 removed.**

Q2 says the cost of a quiet first connection is "one notice, or one read". It is one **per connection**, forever, until a
first value arrives. Row 8 leaves `{ at: undefined }`. Ran as `S1`: empty room, `catchUp`, history complete and empty,
three reconnects, nothing ever posted: **3 notices**. `S1b`, no `catchUp`: 2 reconnects, 2 notices. Chat's sample prints
"Some messages could not be recovered." on every laptop wake in every new room, right after a read that said `done`. G16
says a notice loop must not train users to ignore it.

The author's only ways out are `missed: "accept"` (which swallows real losses, G15) or a handler guard on "memory empty":
exactly the guard section 1 claims to remove (X9). The design's headline saving will be written back by hand within a day.

v2 had this right: `Loaded { head }`, `cursor: event.messages.at(-1)?.cursor ?? event.head`. v3 made the snapshot a
`catchUp` and gave it nowhere to put the head. A snapshot "with a head can still write it" applies only outside `catchUp`,
which Q2's rule 1 tells you not to do.

**Fix:** the server's word, on the answer that already carries the server's word:

```ts
catchUp: ({ roomId }, { after, next, signal }) =>             // existing; NEW in the context: signal (Med4)
  fetchPage(roomId, next ?? after, signal).pipe(Effect.map((p) =>   // user-defined: fetchPage
    p.truncated ? Feed.gone(`history starts at ${p.oldest}`, p.messages, p.next)   // existing in v3
    : p.complete ? Feed.done(p.messages, { at: p.head })       // NEW option: at. Where this answer ends. existing: done
    : Feed.more(p.messages, p.next))),                         // existing in v3
```

`settle` then uses `at` rather than the last delivered position. This also **removes the newest-first limit**: Q3's "the
bookmark rests on an old item … a quiet reconnect repeats the read" goes, and Ably's `untilAttach` read says exactly this.
A source with no head omits it and keeps today's cost, now stated correctly. Blind's warning applies: only `done` carries
it, and only after the read, so it cannot pass unread pages. **Not modelled.**

### Medium

**Med1. A large gap on a busy pushed source cannot converge, because no progress survives a drop.** R12 and M8 are claimed
with "by budget only", and the claim is honest, but the size is not stated. v2's oldest-first pages moved the cursor. In
v3 every restart begins again. By arithmetic (`l.py`, not a table run): pushed source, queue plus buffer of 2,048.

| Gap | Live rate | Pages | v3, frozen | Per-page progress |
| --- | --- | --- | --- | --- |
| 5,000 | 100/s | 500/s | done | done |
| 20,000 | 100/s | 500/s | **Ended after 8 connections, 81,920 items re-delivered** | done after 3 |
| 100,000 | 100/s | 1,000/s | **Ended after 8 connections, 163,840 re-delivered** | done after 6 |
| 100,000 | 5/s | 1,000/s | done | done |

20,000 at 100/s is 200 seconds offline. Each attempt overflows at 20.5 s, under the 1-minute healthy mark, so it spends
the budget. Same class on a phone with a connection living under a page run. **Fix:** an optional source claim on oldest-first
pagers, `Feed.more(items, next, { through: p })`, saying "pages reach `p` with nothing before it unread", moving the
bookmark after the page is admitted. Absent (newest-first), today's behaviour. Or state the limit in M8's terms and accept
it: correct, visible, and a scope cut the owner allows. I lean to stating it now and adding the option only if a real case
appears.

**Med2. `Repairing × O.x.bookmark` opens a hole.** T1: "`abandon`; T3; `Live`". `abandon` discards `buf`, with no
re-registration. Next value moves the bookmark past what was discarded. Scenario: a `Loaded` arrives while the feed is
repairing, with `O.messages.bookmark({ at: event.head })`, buffer holds items after head: lost, no notice, and a reload
does not bring them back. Reasoned, not run. **Fix:** "`abandon`; T3; restart `Repairing` from the new `at`".

**Med3. T6's one sentence for `latest` can make stale read as current.** "One slot, newest replaces." Firestore recipe,
consumer busy: `[v_good, down, v_cached]`. If the slot keeps its place, `v_cached` lands before `down`, so it reads current
and a machine can act on it: F4, F5. v2's model never ran this slot, and v3 did not run `latest` at all. **Fix:** "a signal
is a fence: a value before a signal is dropped when another value follows it", so the queue is at most `(signal group, slot)`.
State it and model it. Reasoned, not run. This is the answer to attack 5: T5, T7 and T8 read as still valid, since they never used
`Feed.reconnect`'s internals, but they are **unverified on Flow-run connections**, and this one line is new, not carried.

**Med4. `catchUp` has no `signal`, so R17's row cites something that does not exist.** Section 4's signature is `{ after, next }`.
R17 says "`signal`, interrupted at `abandon`". An Effect interrupt does not abort a `fetch` unless `fetchPage` passes a
signal, and DESK S-M2 was this exact mistake. **Fix:** add `signal`, as on `subscribe`.

**Med5. T1 and T4 disagree on the bound; requirement M1 does not hold as written.** T1: `more`: "queue items, frozen … else request `c`",
at once. T4: "`Q` holds at most one page plus one `buf`". A week offline at network speed with a slow consumer fills `Q`
with pages: 100,000 items, against M1's test. **Fix:** "request `c` when `Q` holds no page item". Repair then runs at turn
pace, and Med1's arithmetic gets worse, which is one more reason to state its limit.

**Med6. `every` first load is now one turn per item, and LOADING's work did not go away.** "First load is catchUp, so LOADING
is gone": v2's `Loaded` was one turn with an array. v3 is 50 or 5,000 turns, each publishing, each `upsert` O(n), so O(n²) and
a re-render per message on first paint. And **SSR**: T9 releases server sessions at capture and "never delays settling",
so a server-rendered chat has no messages without a real read outside `catchUp`, which sends it back to the form Q2 calls
the weakest path. The desk's activity log wants no history at all on first open (v2's `fresh`), so `eventsPage` needs a new
`after === undefined ? Feed.done([])` branch. **Fix:** say plainly when `catchUp` is the first load and when it is not, and
consider `value`'s page form as one event for frozen pages. An owner-level question: does V4's "one per turn" bind a read?

**Med7. `idle`, rule 25 and F9, F10.** Attack 4.

- **Eight of eleven recipes say `"never"`.** Where the SDK has its own heartbeat and reports it (Socket.IO, Ably,
  Phoenix, Supabase), it is fine. Elsewhere it loses F9 silently: **graphql-ws**, whose `keepAlive` defaults to 0 and takes "no
  automatic action if the server never pongs" (prior-art-2), and **polling**, where a hung GET keeps the row `Live` forever. The polling
  recipe says `Feed.ping` is "unneeded"; it should be `idle: "30 seconds"` with `Feed.ping`. The desk's technician pulse has the same hole.
  **Firestore** stays current through a half-open: `value` reads current, against F10, which is a must.
- **Required on every contract is the wrong place.** The word is forced where Flow owns the socket and noise where the SDK
  does. **Fix:** required when `reconnect` is present; omitted and meaningless when it is not. Types can express it. Socket.IO, Ably and
  Phoenix lose one line. `idle: "never"` then always means a real decision.
- **F9's words are "without Flow measuring wall time".** Section 9 re-reads SR23 as "no measuring of the source". That is
  arguing with the row, and O8 says "no Flow timeout and no Flow retry". I think v3 is **right** to argue it (the desk failed this
  way, and it is a data declaration on the Clock), but it is an owner decision, and it should be asked in those words. Say that rule
  25 changes, not "gains one sentence". Streaming writes keep their own `Stream.timeoutOrElse` (section 7.3 notes it), so Flow would
  have two spellings of one idea.
- **Budget, attack 4 on a flapper:** T1 and C2 read correct. Up 59 s: spends. Up 61 s: resets. A connection never registered cannot reset.
  Not run on a clock.

**Med8. The default budget makes the headline sample a dead end.** Default `exponential("500 millis")`, 8 tries: about 127 s
in total. Chat maps `Feed` and `ChatDropped` to `S.ENDED`, with nothing leaving it. A deploy over 2 minutes, or waking a laptop with no
Wi-Fi yet, ends chat until reload. Section 2.2 says "A longer schedule" replaces RETRY_WAIT, then the sample does not write one.
The desk's `RETRY_WAIT` plus `Healthy` plus `reopenInMs` exists for this (REVIEW 13–16). **Fix:** default to capped-forever, `exponential`
to 30 s with no count, so only a typed error ends a session; a budget is what you write when you want one. Same on an SDK feed: with no
`reconnect`, one `Overflow` is terminal, where the machine must reopen. State that.

**Med9. First-open read past the race: "any read is honest" is not quite true.** Exhaustive hit (`ch-pos-latest`): first open,
two posted after registration, the read returns the latest 1, `settle` moves to it, then a reload before the frames are pulled.
The older one is lost silently. Needs more posts between registration and read than the read returns: a page size in ms, or a 503
retry window with the socket open on a busy room. **Fix:** with `after` undefined and a non-complete read, `settle` only if `buf` and
the connection are empty, or state it as a precondition: "an `after`-undefined read must reach back to registration".

**Med10. `ReadBeforeFeed` is a noisy warning that misses the real cases.** It fires on any earlier lookup (a profile, a config),
so authors learn to ignore it. It misses a read in a parent, another actor, a domain resource, `Flow.input`-seeded memory, and SSR.
**Fix:** Change B makes it unnecessary for non-empty reads. **Snapshot form with `O.x.bookmark`:** correct but it notices on every page
load, since every load re-reads and re-states "I read first" (`missed` each time, on no-position sources). Docs should say use `catchUp`
for that; the form remains for a head. Also `O.x.bookmark` overwrites a newer `{ at: p }`: on a re-entry that re-reads with no `at`, position is
lost. Rule: no-`at` applies only when no record exists.

**Med11. Stories: every `advance` over `idle` now drops the socket.** Section 10 names `hold` only. It is wider: any Story with an
`every` feed that advances past 45 s for an unrelated reason (a debounce, a 2-minute draft) stops at the `idle` deadline and gets `Silent`.
Correct in production, but the fake has no heartbeat: fakes-v2 has frames from controls, not on a clock, and SC says a heartbeat is
`HostTimeWait` if real. So authors loop controls, or set `idle: "never"` in a test build, which is the adapter-bypass SC forbids. **Fix:**
`Fake.stream({ …, ping: { every: "30 seconds", frame } })`, or a stated recipe, with a coverage row. Needs a fakes-v2 amendment; S3 reads conditional until then.

**Med12. `missed: "accept"` fails G15 as written.** G15 is a must: "only by a means that cannot also swallow a real later loss, a known
loss or a reset". Q4 admits it "does swallow". An agent avoiding a handler on a chat gets silent loss with one word (A1). Fine for typing; V9 asks for it.
**Fix:** either re-word G15 for an explicit whole-feed choice and ask the owner, or type-reject `"accept"` on a contract with `catchUp`, `position`
or `restartAt`, since saying "loss doesn't matter" and "I can repair" together is a contradiction. That also removes T2's dead combination.

### Low

| # | Finding | Fix |
| --- | --- | --- |
| Low1 | Reset does not read the new log, though it can. T2 row 2 "No repair: a new log". Client offline; epoch 9 has 200 items; row 2 notices, next live value moves the bookmark past them. Notified, but avoidable | Row 2 with `C`: after `missed Reset`, `Repairing`, `after = restartAt` |
| Low2 | `{ at: undefined }` + `C` with no `position`: a type hole; every reconnect is notice plus full read, and repairs overtake the buffer (section 12) | `catchUp` requires `position` in the type |
| Low3 | Second `live()` in `Repairing` restarts with no bound (attack 8). Ably `update`, any repeated status: repair never finishes. Safe, but a loop | Count it as a budget step, flag `RegistrationChurn` |
| Low4 | T1, `Dropped` from `Connecting`, value, no bookmark: queues `missed` on a first-ever open (G10, G13). T3's move on none is undefined; read literally a position-less source stays none, then row 3 is silent next time | Define it: a value in `Dropped` with none is a first registration |
| Low5 | `.each` eviction: after `evicted`, every never-seen key reads `{ at: undefined }`: a false notice on every new key forever, and `forget` cannot work. Flag never clears | Falls away if records are per slice and bounded by size; otherwise state the false notice as a cost |
| Low6 | "Connections read `at` at connect … nothing is in flight" is not true: a 500 ms backoff beats a queued page. Safe (duplicates only), but do not state it. A `missed Reset` not yet admitted at connect asks the old log, which resets again: extra notice | Correct the text |
| Low7 | A Denied value: "this consumer holds everything up to here" is false after a guard or a refusing child part. Same as v2 in effect, since v2's next handled value also passes it. So the Denied exception does not earn much | Keep it, but add evidence `DeliveryDenied`, and fix rule 71's sentence to "was offered" |
| Low8 | `row.bookmark` leaks wiring (AGENTS), and "guard cannot read it when not placed" invites misuse | `cp` and Inspection only. Then "memory changes only through `updateMemory`" is honest in substance too: no handler sees it |
| Low9 | Record keyed by `operation`, where MD keys lanes by contract id so a rename "changes nothing persisted". A rename here gives none, then silent row 3 | Key by contract id |
| Low10 | `Feed.callback` reads the kind from context: a hidden service; used outside a session it needs a default that could overflow or not | `subscribe: (input, { from, signal, callback })`: no service, and the easiest bridge is the one in hand (M5). RENAMED, no new word |
| Low11 | C8 bare `latest` ending "only on the row": the row's test says "never only a row". K3 may justify it, but say the row's reading is an exception | Mark as conditional |
| Low12 | Samples: Presence's `Stream.scan(undefined as …, …)` **does not compile**: Effect 4.0.5's first argument is `LazyArg` (`() => undefined`; ran `tsc`). Presence comment says "pings arrive as `Feed.ping`" but the code folds `f.t === "ping"`, which also re-emits the value per ping. A diff before `presence_state` passes as "first full state". Phoenix's note is wrong: a stale `from` closure **passes** the echo, since it compares with itself; still safe, a full replay, duplicates | Correct them |
| Low13 | Newest-first with the desk's `upsert`, `.slice(-100)`: a later, older page evicts the newest entries until flush, or for good if the flush is smaller. "needs a sort" understates it | State the window case. `at` in H4 fixes the bookmark half only |

## 4. Hand-written real code (attack 7)

**`Assistant`: nothing changes.** `suggestReply`'s body is untouched. I3 holds. Only friction: its `Stream.timeoutOrElse` is a second spelling beside `idle` (Med7).

**`Presence`: better.** Written, the contract and definition, in full:

```ts
// presence.contracts.ts
export const typingIn = stream({                        // existing
  id: "DispatchDesk/typing-in",
  input: { workspaceId: Schema.String, ticketId: Schema.String },
  output: Typing,                                       // user-defined
  key: ["workspaceId", "ticketId"],
  delivers: "every",                                    // RENAMED value
  idle: "never",                                        // NEW. The SDK reports. Goes if Med7 is taken
  bufferSize: 256,                                      // existing word, moved from Feed.callback's options
  subscribe: (key) => onChannel<Typing>(ticketChannel(key), (channel, emit) =>
    channel.subscribe("typing", (message) => emit(message))),   // user-defined; emit's promise is S7 Q20
})
// presence.definition.ts
typing: typingIn.outcomes({
  value: E.Typing.from((t) => ({ memberId: t.memberId, at: t.at, id: t.id })),
  missed: "accept",                                     // NEW. MayHaveMissed and its handler are gone
  failure: { CollabFailed: gaveUp, Feed: E.Ended.from((e) => ({ reason: e._tag })) },   // NEW: Feed. Assumes Reason is tagged: not stated in section 4
}),
```

Reads well. `first` in `onChannel` can go: `latest` proof is guarded by `own`, and typing accepts. The eight `.from` lines become two. Two open: is `Feed.Reason` tagged (`broke("closed")` wants the reason), and `viewers` as `latest` never overflows now, a real fix.

**`Tickets/feed`: much better, with four frictions.**

- `activity` loses `after`, `cursor`, the guard, the `restartAt` line and `Feed.reconnect`. `toItems`' `ping` case changes from `[]` to `[Feed.ping]`, in both contracts.
- `sameCursor` stays: `hello`'s echo compares objects. Fine, A3 says so.
- **`Feed.gone` for this server:** a truncated page has no entries, so `Feed.gone(reason, [], page.truncated.beforeOldest)`, an empty array nobody wants. Make `items` follow `next`, or take `{ items?, next? }`.
- **First open:** see Med6. `eventsPage` needs a branch for `after` undefined, since the desk reads no history then. This branch is the author's new line.
- **`RETRY_WAIT`:** deletable only under Med8's default. Today the desk must keep it, `reopenInMs`, `Healthy` and `bothLive`, so A8's "reopen ×2" is not absorbed by v3 as written.
- 2 connections remain (E9, stated).

**Technicians:** `Stream.prepend([Feed.live()])` and `resetAfter` go, correct. `idle` must be a number (Med7).

## 5. Traceability spot-check

| Row | v3 says | Mine |
| --- | --- | --- |
| F9 | pass with a note | **Conditional.** Re-reads the row's wording; `never` sources lose it (Med7) |
| F10 | pass, "not covered, stated" | **Conditional.** Stated is not a pass on a must |
| G15 | pass | **Fails as written** (Med12) |
| R17 | pass | **Fails as written** until `signal` (Med4) |
| M1 | pass | **Fails as written** (Med5; H1's 4,096) |
| P5, P2, R3, G11 | pass | **Conditional on H3.** Across persistence and SSR they do not hold without a Schema |
| R1 | model | **Conditional** on H1, H2, Med2 |
| G10 | model | Holds except Low4 |
| C8 | pass | Conditional (Low11) |
| S3 | section 10 | Conditional (Med11) |
| G6, G12, R7, R20, M5, A11 | conditional | Agreed. **A11 has one real failure** (Low12). R20 and G12 are unsafe if broken, as v3 says. R7's natural line `length < 50 ? Feed.done` remains possible: it is a visible claim, as stated |

**"Passes" that did hold on independent check:** G1, G2, G3, G4, G9 (other than Low4), G13, G14, R2, R4, R5, R6, R8, R10, R12, R13.

## 6. What v3 lost that v2 or blind had

| Lost | From | Consequence | Back |
| --- | --- | --- | --- |
| Clearing beside the list | v2 | H2 | Change B |
| A Schema for the position | v2 (`input`) | H3 | `position: "cursor"` |
| A head with the snapshot | v2 `Loaded`, blind `Feed.up({ head })` | H4 | `Feed.done(items, { at })`. Q2's cut of blind's word is right; the cut of the idea is not |
| Per-page progress | v2 | Med1 | Optional, or state it |
| Patience by default | v2's RETRY_WAIT | Med8 | Default schedule |
| Bookmark tied to slice | Blind's stated "Q1 option B" as an open question | H1 | Change A |

**Rightly lost:** `seen`, `tail`, `meet`, P0, P3, `fresh`, `registered`, `announced`, `initial`, 70 cells.

## 7. Real sources (attack 6)

From tables and prior-art notes. No SDK run.

| Source | Verdict |
| --- | --- |
| Raw WebSocket, greeting | Good. Object cursor sample bug (H3). `idle` correct and useful |
| EventSource | Fine, quiet `Connecting` stated. F9 lost, stated: comments cannot be read |
| Ably | Good, now simple. Newest-first limit goes with H4. Repeated `update` → Low3 |
| Socket.IO | Good. Row 5, 6 work. Every plain reconnect notices, honest. `Overflow` terminal (Med8) |
| Supabase | Good as `listen`. As `every`, one rare notice |
| graphql-ws | **Half-open undetected** with `idle: "never"` (Med7). Set `keepAlive` plus `idle` in the recipe |
| Firestore | Works, but relies on Med3's fence. F10 lost with `never`. `fromCache` is unconfirmed in prior art |
| Phoenix | Works. Note Low12 |
| Electric | Plausible. `Feed.live({ proof })` on every `up-to-date`, safe. Ordering of `Shape` vs `subscribe` unconfirmed |
| Polling | Works. Should set `idle` (Med7) |
| Streaming `fetch` | Good, cleanest. `idle` real, since the server can send blank lines |

## 8. Surface (attack 8)

**The count is low, not 28.** v2's method counted `emit`-class context words. Uncounted here: `after`, `next`, `Feed.Missed`, `"never"`. **By v2's method: 32.** No concept in the list is fake; several are avoidable.

| Cut | Saves | Cost |
| --- | --- | --- |
| `forget` → Change B's `holds` | 0 net | Adds a required line, removes a trap and a check |
| `lost` as an option. `live({ lost })` differs from `live()` only in the notice's tag. Keep `restartAt` | 1 | Tag `Lost` only from `Feed.gone`. O5's preference is a preference |
| `bufferSize` as a constant. Only the desk's 256 used it, and that case's `emit` waits | 1 | An advanced knob. Add later |
| `Feed.Signal` removed from the common tier: only a service's type | tier | Uncommon, no count change |
| `why` as `Feed.Missed` payload the author rarely reads | tier | Rare stays |
| `bookmark` row word (Low8) | half | `cp` |
| `catchingUp`, `Feed.more/done/gone`, `"accept"` | Keep | Each fails a must or a should if cut |

Honest target: about 30 by v2's method, with 2–3 fewer lines per contract through Med7.

## 9. What I ran, and what I did not

All serial, one process, peak 311 MB. Files in
`/private/tmp/claude-501/-Users-arpit--claude-spares-spare-Sy75Xy/b97bafc6-720f-455d-b91c-5aa81d337285/scratchpad/s3r1/`.

| Probe | Result |
| --- | --- |
| `m.py`: my own bounded model of T1, T2, T3, T4 from the tables, not reading `s3/model.ts`'s logic (I only read its output's mutant line). Exhaustive BFS, cap 120,000 states, 3 appends, 2 drops, 1 reload, 1–2 re-entries, bound 2. **No final drain.** Oracle on the server's log, per state: bookmark never past an unheld, unnoticed item; a live value never past one; quiet `Live` owes nothing. A notice covers what was on the log when queued. 18 configs: positions or not, `catchUp`, replay, hard drop, newest-first, latest-1, SDK in-place, reset, snapshot with the action, no greeting | 17 clean, 2 of them capped. **1 hit: `ch-pos-latest`, Med9** |
| Mutants, same checks | `moveDuringRepair`, `passThrough`, `flushOnAbandon`, `listenedNotSaved`, `proofAnyFirst` **killed by exhaustive search, each with a short trace**, including `listenedNotSaved` and `proofAnyFirst`, which survived the writer's walks. **`resetNoMove` survives:** it costs a repeat notice, never a loss, under this oracle. A directed R13 test is the right tool |
| `s.py`: directed scripts | S1, S1b (H4), S2, S4 (H1, H2), S3 (H2). Each states the row and memory reached |
| `l.py` | Arithmetic for Med1, not a table run. Page rate and fill rate assumed |
| `r.ts`, `tsc --strict`, Effect 4.0.5, 128 MB | `RcMap.get`, `fromAsyncIterable`, polling's `paginate`, Supabase's finalizer, `Schedule` default, `WebSocketConstructor` compile. **Presence's `Stream.scan` fails** |

**Limits.** I wrote these tables' reading too, so it proves agreement with my reading, a different one from the writer's: two
independent readings is what it adds. A notice covering all earlier items is generous and does not test G3 strictly. Positions are dense.
`bufferSize` is 2. Page size 1 or 2.

**Not run:** `latest`, T5, T6, T7, T8 (Med3 reasoned); Med2 and the Lows reasoned; budgets and `healthy` on a clock; freeze, SSR, two placements, `.each` beyond S4's same trace; Change A, Change B and `Feed.done`'s `at`, none modelled, and they need it next round; any vendor SDK; any Flow code; any Story; an agent trial (A2).

**Read in part:** `stories-amended.md` by search only; v2's reviews by headings and the rows cited; `proposal-v2.md` by its count table. `prior-art-v2-assessment.md`, requirements, `decisions-v2.md`, and v3 in full. Blind's proposal, first half and its Q1. MD rules 25, 38, 46, 48–54, 2.5, 2.7.15; Persistence O2–O4; SSR O3 by search.

## 10. Attack list, plain answers

| v3 section 13 | Answer |
| --- | --- |
| 1 D versus C | D's moves are right; its **storage** is wrong. Change A keeps every argument for D. `InvalidTurn`'s clause is enough |
| 2 `forget` forgotten | The biggest hole. H2 |
| 3 `ReadBeforeFeed` | Replace. Med10 |
| 4 `idle` required | Required only with `reconnect`. Med7 |
| 5 Rule 25 | Ask the owner, in plain words. I lean yes |
| 6 Stop at full `buf` | Read correct. A pulled source waiting long may be closed by its server; that is `Closed`, retried, then Med1's class |
| 7 Page size in `Q` | Med5 |
| 8 Second `live()` | Low3 |
| 9 Proof with `{ at: p }` | Trust stays with the author: the echo idiom is the check. G6 conditional is right |
| 10 Moving backward | Safe in my runs. Reorder then a drop asks from earlier. No hole found, dense positions only |
| 11 Callback's context | Low10 |
| 12 `.each` | Low5, and H1's capture limit |
| 13 Word count | 32 by v2's method. Section 8 |
