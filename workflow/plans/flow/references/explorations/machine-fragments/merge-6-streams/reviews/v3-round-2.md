# Proposal v3 review, round 2 of 3

Status: advice to the main session, which decides. Nothing here is an owner decision. Reviewed
[../proposal-v3.md](../proposal-v3.md), revision 2. Bare ids such as G11 are rows in
[../requirements-v3.md](../requirements-v3.md). H, Med and Low are this review's; RV1 is round 1. Code marks are against v3:
`// NEW`, `// RENAMED`, `// existing`, `// user-defined`.

## 1. Verdict

**There are 2 Highs.** The session tables hold again: my independent model of T1, T2 and T3 is clean for chat. The weakness has
moved to one place: what `holds` can and cannot tell.

| # | High | One line |
| --- | --- | --- |
| H1 | `holds` cannot tell "never filled" from "erased" | v3's own recipe for the desk's log silently loses entries in G11's exact test. Clear, dismiss and count are the same root, not three separate misfires |
| H2 | `Live × O.x.bookmark` has no check | The fix v3 names for G12 silently loses the message between read and registration, when the read lands after `hello` |

**`holds` is correct as a question and wrong as an answer.** Three misfires plus a silent loss, all from one bit of missing
information: Flow never records whether memory ever held anything. One private bit fixes it, with no new author word
(section 3). I modelled it: clean in every config except the shared-list limit.

**v3 against trimmed v2.** As written, trimmed v2 is **more correct on clear, dismiss, count, quiet rooms and shared lists**,
and it changes no plan. v3 is **better on room switch and on one position**: trimmed v2 needs a second, session-private position
and a cursor line in four handlers, and forgetting one line is silent. With H1 and H2 fixed, **v3 wins**; do not fall back
to v2. Its 32 words are not caused by the bookmark: `reconnect`, `idle`, `Feed.done` and friends are needed by both, and trimmed v2 counts
about 29 to v3's 29 after cuts (section 8).

**Traceability.** v3 says no must fails. I count **three that fail as written** (G11, G12, A11), **C2 failing by default**, and P2,
P5 conditional rather than passing (section 7).

## 2. Round 1: closed or not

| RV1 | State | Note |
| --- | --- | --- |
| H1 identity | **Closed** | `resetOn`, `.each`, subroutine, dispose, SSR omission all go with the slice. Plans agree (section 5) |
| H2 room switch | **Closed**, at a price | See H1 here |
| H3 Schema | **Mostly closed** | `position: "cursor"` works for Struct, Class, checked Struct (ran). `restartAt`, `at` are still unvalidated: Med2. Union has no `.fields`: Low |
| H4 quiet feed | **Closed only with a read that reaches back** | Reopened for from-now feeds: H1 |
| Med1 convergence | **Closed for oldest-first; the refund is new trouble** | Med4 |
| Med2 | **Closed in `Repairing`**, open in `Live` | H2 |
| Med3 fence | **Closed** | Independent exhaustive check, section 6 |
| Med4 `signal`, Med5 page at a time, Med6 `pages`, Med7, Med8, Med10, Med12 | Closed | Med8's fix makes dead `failure` entries: Med5 here |
| Med9 | Stated. **The Q2 recipe breaks it**: H1 | |
| Med11 heartbeat | Named, needs amending SC. S3 stays C | |
| Low1–13 | Closed, except Low3's budget step (fine) | |

## 3. High

### H1. `holds` cannot tell "never filled" from "erased"

**Failing scenario, v3's own recipe.** Q2 tells a feed that wants nothing from before now to write
`after === undefined ? Feed.done([], { at: head })`, naming the desk's log. Quiet log, drop, 1 entry posted, reconnect.

| Step | What T2 does |
| --- | --- |
| First open | Row 3, read, `done([], { at: h0 })`. `b = { at: h0 }`, memory empty |
| Reconnect | `holds` false, so `claim` undefined, row 6: "Claim void", read with `after` undefined, no notice |
| The read | The same recipe: `done([], { at: h1 })` |
| Result | **The entry is gone, `b` is past it, no notice.** G11 is this exact test |

Ran: `deskLog from-now`, exhaustive, 299 states, trace `enter, register, append, hello, drop, backoff, register, hello, read`. Same on
reload. A first read of "the latest 50" hits the same row: more than 50 posted in a quiet room's gap is silent.

**The same root gives everything else in Q1's table.**

| Consumer | `holds` false because | What it really means | v3's result |
| --- | --- | --- | --- |
| Room switch | Erased, session left | Claim void | Correct |
| Quiet room, desk log | **Never filled** | Claim stands | **Silent loss** (with a from-now read), else a needless read |
| Replay server with a head, no history | **Never filled** | Claim stands | `from` undefined, replay impossible, a notice per connection |
| Roster audit, polled, quiet | **Never filled** | Poll from `0` sees all | False notice per failed GET. The desk has this feed |
| Toast per message | **Never filled** | Claim stands | Re-reads, or needs a flag |
| Clear chat | Erased **on purpose, session stays** | Claim stands | Comes back |
| Dismiss all, count reset | Erased **on purpose, session stays** | Claim stands | Comes back, or notice each connection |

Only the first row wants what row 6 does. **Two facts are missing: did it ever hold anything, and was it emptied while listening?**

**How much real code.** Desk: `activity` and the roster's `audit` are plain lists, so the natural line is right on the
list, but **both are quiet-feed cases**. `typing` uses `"accept"`. Toasts, comments' "mark read" and Roster's notices are not feeds.
Beyond the desk, notifications (dismiss all), inbox counts, toast-per-event and "clear chat" are ordinary product asks. An agent would
write `length > 0` first time, and it reads right. It would not write `|| memory.dismissed` until a user reports it. A required
line whose correct form depends on a consumer's future feature is the clever hybrid. **`() => true` is not the main risk;
the natural line is.**

**Is there one simpler rule? Yes.** Flow keeps one more private bit on the entry.

> **While this key's session stays placed, each committed turn sets `held = holds(memory)`. A claim is void only if `held` is true and
> memory is empty.** A turn that empties memory and also releases the session (room switch, re-enter to reload, sign-out) leaves
> `held` true: void, as today. A turn that empties memory with the session placed is the consumer's choice: `held` goes false, the claim stands.

| Case | Result, natural `length > 0`, no flag |
| --- | --- |
| Room switch A→B→A; reload everything by clear plus re-enter | Void, reads. As today |
| Clear chat; dismiss all; count reset | Stays cleared, across connections and reloads |
| Quiet room, desk log, toast | Never held: claim stands, asks from `at` |
| Clear in one turn, leave in a later one, come back | Stays cleared. Correct: the user cleared it |
| Upgrade: entry with no bit | Absent reads true, so today's behaviour |

And give a registration its own head, as blind's `Feed.up({ head })` did, so a from-now feed needs no racy read:

```ts
// desk: activity. Definition side unchanged
stream({                                                   // existing
  id: "DispatchDesk/activity",                             // existing
  input: { workspaceId: Schema.String },                   // existing
  output: ActivityEntry,                                   // user-defined: ActivityEntry
  key: ["workspaceId"],                                    // existing
  delivers: "every",                                       // existing
  position: "cursor",                                      // existing
  subscribe: ({ workspaceId }, { from }) => Stream.unwrap(Effect.map(DeskSocket, (socket) =>   // user-defined: DeskSocket
    socket.frames(workspaceId, from).pipe(Stream.flatMap((f) => Stream.fromIterable(
      f.t === "hello"
        ? [f.replayedFrom && sameCursor(f.replayedFrom, from)   // user-defined: sameCursor
            ? Feed.live({ proof: "server replayed" })           // existing
            : Feed.live({ at: f.head })]                        // NEW option: at. "I am registered at this position"
      : f.t === "activity" ? [f.entry] : []))))),
  catchUp: ({ workspaceId }, { after, next, signal }) =>        // existing
    after === undefined ? Effect.succeed(Feed.done([]))         // existing: nothing before now. No head needed, and no race
    : eventsPage(workspaceId, next ?? after, signal),           // user-defined: eventsPage
  idle: "45 seconds",                                           // existing
  reconnect: { while: (e) => e._tag === "SocketDropped" },      // existing
})
```

**Added:** one private bit; `at` on `Feed.live`, 1 word already counted elsewhere. **Dropped:** the flags in Q1's table; the `after === undefined ?
Feed.done([], { at: head })` recipe, which breaks v3's own precondition, because a head read after registration passes a frame still in
flight (model: same class as Med9). `Feed.live({ at })` also fixes polling: the first answer's cursor goes there.

**Optional, for reading and tooling:** make the line data, `fills: "messages"` (RENAMED `holds` → `fills`, a memory field, its emptiness read by
Flow). Then `() => true` cannot be written, `flow explain` prints it, and `flow check` can see a `subscribe.each` over a plain list
(Med3). Not modelled as a separate form; the rule above was modelled with the predicate.

**Model.** Same model, `heldbit` and `greetHead` on: chat, dismiss, desk from-now, leave-and-clear, replay with head: all clean,
exhaustive. Only the shared-list limit remains (Med3).

**Cost, plainly:** `holds` now runs per committed turn rather than per connection. T2 grows one column. It stays one line for the author.

### H2. `Live × O.x.bookmark` loses the message between read and registration

Q2 and G12 name `O.x.bookmark({ at: head })` as the fix for a read outside `catchUp`. T1 says `Live`: T3, no check.

```ts
// A very common shape: read and subscribe placed together, no history endpoint for the gap
LIVE: {
  entry: [O.history.lookup(({ memory }) => ({ roomId: memory.roomId }))],               // existing
  activities: [O.messages.subscribe(({ memory }) => ({ roomId: memory.roomId }))],      // existing
  on: { Loaded: { target: "self",
    updateMemory: ({ event }) => ({ messages: event.messages }),                        // user-defined
    actions: [O.messages.bookmark(({ event, memory }) => ({ roomId: memory.roomId, at: event.head }))] } },   // existing in v3
},
```

Post m1; the read snapshots; post m2; `hello` arrives: none and empty, row 3, `Live`, no notice; `Loaded` lands; `b = { at: m1 }`. **m2 was neither
read nor sent. No notice.** Ran as a directed script: `n=2, st=Live, b=1, mem=[1], noticed=0, silent=[2]`. v3's model only had the order where
`bookmark` comes first, which is the SSR order.

**Fix, one cell:** in `Live` and `Dropped`, `O.x.bookmark` is a registration check: `C`: `Repairing` from `at` (already in `Repairing`'s cell). No `C`: `notice(Unproven)`.
With `catchUp`, my config is clean. A later `hello` in `Connecting` already reaches row 5.

## 4. Medium, by root cause

**Types were assumed, not checked.**

**Med1. The samples do not compile, and the spikes hid it. A11 fails as written.** `spike.ts` and `spike2.ts` pass explicit type arguments,
`next: any`, and in one place `as Effect.Effect<unknown>`. With no explicit arguments, what an author writes (`infer.ts`, `tsc --strict`, Effect 4.0.5):

| Sample | Result |
| --- | --- |
| Section 2.1: `reconnect` before `subscribe` | `e` is `unknown`: `e._tag` fails |
| `subscribe` first, plain Stream | **Works**, E inferred |
| `callback((emit) => … emit.fail(new X))`, any order | E stays `unknown`: fails, and A9's "add `Banned`: compile error" has nothing to read |
| `callback<ChatDropped \| SignedOut, never>(…)` | Works, but every `callback` sample omits it |
| `next` in `catchUp`, chat | Fails with no default. Works if `N` defaults to the position type |
| `next` as Ably's `{ page, head }` | `never` or `unknown`: an annotation on the whole second parameter is needed. Worked when written so |
| Polling, streaming `fetch`, literal | **Compile**, with `subscribe` before `reconnect` |

**Fix:** three rules for the docs and samples: `subscribe` comes first; `callback<Errors>(…)` always names its errors; `next` defaults to the position, otherwise annotate. Or add a contract field `error: Schema.Union(…)`, which `flow check` could read. Check prior art first (Effect's own `Stream.callback` needs the explicit form).

```ts
subscribe: ({ roomId }, { from, callback }) => callback<ChatDropped | SignedOut>((emit) => …),   // existing; the error argument is required
reconnect: { while: (e) => e._tag === "ChatDropped" },                                          // existing; written after subscribe
```

**Persistence and SSR rules were amended less than the design needs.**

**Med2. A position can stop all saving, and T3's decode rule contradicts Persistence O5.**

- **O5:** "Flow never partially restores an invalid scope." The only exception is a dormant lazy record. T3 says a bad entry reads `{ at: undefined }`: a new partial restore. Followed literally, O5 throws away every draft in the scope because a cursor's shape changed. T3 is the right behaviour, and **O5 must be amended**; section 11 does not list it. T3's "undecodable actor" also has no such outcome under O5.
- **O5, O2:** an encoding failure skips the whole write until an encodable state exists. `restartAt`, `Feed.done`'s `at`, `Feed.more`'s `at`, `O.x.bookmark`'s `at` are unchecked author values. `spike2.ts` passes `restartAt: 1` where the position is `{ epoch, seq }`. One bad frame stops saving silently, with a diagnostic. **Fix:** type `Feed.Signal<P>`, and decode each `at` against the field's Schema at intake; a failure is `Defect`, before it reaches the partition.
- **O2:** "incompatible Schemas are a type error" on `persist: true`. A contract's `output` field must now pass that check, through `operations`. New type rule, unlisted.
- **SSR O3's digest** covers machine ids, state trees, event, input and memory Schemas, and operation identities, **not `output`**. A deploy changing the position's shape passes the digest, then a decode failure means `HydrationMalformed` for the whole payload under O4, against T3. **Fix:** add the position field's Schema to the digest.

**Med3. "Failures are visible, never silent" is false for three natural lines.** Q1's claim holds for lists owned by one feed and one key.

| Natural line, same `length > 0` | Scenario | Result |
| --- | --- | --- |
| Two feeds into one `inbox` list | A→B→A clears; feed 2 fills first; feed 1 connects | `holds` true, `{ at: p }`: **silent gap**. Model: silent |
| `subscribe.each` with one list | Key removed, re-added, others still there | Same. And a new key reads none and true: a false notice each |
| A fragment's feed, list kept by the host through `notify`, or a root feed raising into a child | `resetOn` on the fragment: partition new, host list full. Or the child re-added: root partition old | `holds` reads the **op's own slice**: row 3, silent |

Trimmed v2 has none of these, since its cursor sits with the data. **Fix:** with `fills` as data, a `flow check` finding for `subscribe.each` over a non-`Record` field, and a rule that a `Record` field is indexed by a single-field key. Say in docs: the field must live in the op's slice and be filled by this feed alone. If it is not, write a flag. Unfixable case stated: a shared list.

**Repair under load.**

**Med4. The `Overflow` refund has no delay and defeats a written budget.** T1's `lose`: "step `n`, unless `e` is `Overflow` in a repair that moved the bookmark. A delay: `Waiting`". With no step there is no delay, so as written T1 is undefined. Stepped simulation, gap 20,000, 100 msg/s, default backoff, no jitter (`conv.py`):

| Read rate, `at`, refund | Result |
| --- | --- |
| 500/s, `at`, refund | **Converges**, 3 connections, 50 s, 25,000 items. Matches RV1 |
| 150/s (pages unmapped, turn-paced), `at`, refund | Converges, 20 connections, 400 s |
| 100/s or 90/s, `at`, refund, budget 8 | **Never ends: 176 connections in an hour, 0 budget spent.** The author's budget is ignored |
| 90/s, `at`, no refund, budget 8 | Ends by budget, 276 s |
| Newest-first, frozen, budget 8 | Ends by budget, 276 s, 92,250 items |
| Newest-first, frozen, **default** | **Never ends: 75 connections an hour, 764,300 items re-delivered, gap growing to 380,010.** Row: `Live`, `catchingUp` |

**Fix: cut the refund.** The default has no budget, so it never mattered there; with a written budget, 3 connections fit inside 8. The rule goes.
**Newest-first with the default breaks M8** ("ends, by progress or by the budget"): neither. **Fix, no word:** a repair that overflows 3 times with no bookmark move gives up: `notice(Lost)`, `settle` to its first page's head, flush. Honest and bounded. Not modelled.

**Med5. The new default leaves dead code, and fails C2 as worded.** Under the default, `while` matches never end. Yet Q6 requires `ChatDropped: E.FeedEnded`, and section 7.5 keeps `PushEnded`, `QUEUE_RETRY` and `Reopen`: they are reachable only by `Defect` and `Interrupted`. A reader learns the wrong thing, and an agent copies a retry state nothing uses. **Measured on `TestClock`:** a flap with the default: 123 connections in an hour, never ends. C2 says "exhausts it in bounded tries": **the default fails that must**; the owner should waive it, in those words. Jitter after the cap gave 34.8 s, so "capped at 30 s" needs jitter first. **Fix:** with no `schedule`, the type does not ask for `while`-matched tags in `failure`, and 7.5 loses three lines. With a written `schedule`, it does.

**Reads with nowhere to say what they did.**

**Med6. A snapshot-only source gets a false notice per quiet reconnect.** Q3's recipe: `after === undefined ? Feed.done(items, { at }) : Feed.gone("snapshot only", { items })`. T1's `gone` does not set `seen`, and `complete()` then settles nothing, so `b` never moves. Quiet room: row 5, read, gone, `notice(Lost)`, on every laptop wake. This is RV1's H4 back for the commonest REST shape, `GET /messages?limit=50`. **Fix:** `Feed.gone(reason, { items, next, at })` (NEW option on an existing word).

**SSR.**

**Med7. A server session changes the client's first connection.** T9: "may run". If `hello` lands before capture, the server's row 3 writes `{ at: undefined }`, which transfers. Client, no `C`: row 6: **a false notice on every hydrated first open** (G10). With `more` pages unmoved, memory partial: row 7, a false notice plus a re-read. Also timing-dependent bytes, against SSR V1 "equal Stories dehydrate to equal bytes". And a socket per request needs `WebSocketConstructor` in server setup, or a defect. **Fix:** an `every` session never opens on a server. Nothing transfers from it anyway: "a fact row transfers nothing". Reasoned, not run.

**Wake.**

**Med8. F10's window is `idle`, and T9's order is not Flow's to promise.** "Overdue `idle` first, then frames": after a sleep, the browser decides between a timer and a socket message, and timers may not count sleep. The window is up to `idle` after wake: 25–45 s of `row.value` reading current after a 10-minute sleep. F10 asks for "small". **Machines O5 already has resume behaviour** ("fires once if overdue"). **Fix:** arm `idle` by that same rule, with Clock time compared at resume, and cite it; state the window as "at resume, where the tab's visibility event fires". Firestore and EventSource still fail F10 by name: say **fails for these sources**, not C.

## 5. The partition against the plans, read directly

| Question | Plan says | v3 | Verdict |
| --- | --- | --- | --- |
| Is writing the record from a Runtime step legal? | O3: a capture "sees only whole publications" | Step 1 cell plus patch: one publication. `settle`, rows 1, 3: own | **Legal.** Partition-only publications add writes, coalesced by O3 |
| **Persistence O3** in full | Atomic; 4,096 records, 16 MiB, rejects whole capture | Partition sits inside an actor record | Adds no records. Good |
| Capture size | Inspection O2: one value: 10,000 nodes, 2 MiB. SSR: 262,144 B total | Cites only O3 | 256 entries × 80 B ≈ 20 KB. Fine, **but SSR's bound binds first**, not O3: correct the text |
| **SSR O3** in full | Transfers listed items; "Omit values without a usable Schema", omit actor with sensitive memory, "whole stream value whose Schema contains sensitive fields" | "Transfers with the slice"; omitted actor omits both | Add partition to O3's list. **A sensitive position field:** entry omitted, memory stays: row 7, a notice. Fails safe: **`holds` earns this one** |
| Decode failure | O5: discards the scope | Per-entry `{ at: undefined }` | **Conflict**, Med2 |
| Migration | O5: "v1 has no migration API"; exact `version`; Schema transformations allowed | Field Schema | Bump: all gone, consistent. Same version, new shape: Med2 |
| Upgrade, saved record, no partition | Strict codec, owning Schema | Optional part, reads none | Memory held: **row 7: one notice and one read per actor, once**. Empty: first open. Acceptable; say it. Partition must be absent, not `{}`, so bytes re-encode |
| `position` added later | | `{ at: undefined }` or none | Same one notice |
| Operation renamed or removed | | Entries stay | Fails safe. Orphans persist unbounded by "256 per operation". Drop unknown ops at decode (Low) |
| Hydrating positions | O5: actor beats copy; `Hydrate` applies at commit | With the actor | **Correct.** Partition and memory always win or lose together |
| Fragments, freeze, thaw | MD rule 52: thaw places from "the fragment's own position" | Frozen slice's bookmark, amended | **Correct.** Reset on return: ended, new |
| `resetOn`, `.each` copies | Rules 9, 52 | New slice | **Correct, and this is the partition's real win** |
| `subscribe.each` in one slice | | 256 per op | With more than 256 live keys, an active entry is evicted, and T3 does not say what a move does on a missing entry. Say: re-creates |
| T9 "handover" | **O7: "There is no tab sharing or handover"** | "Restore, handover" | Stale word; P3 row too |
| Local actors | "never persist"; not transferred | Nothing | Correct |

**Verdict on the partition: right.** It is the correct storage. Its only real plan conflict is Med2's decode rule.

## 6. v3's "unproven" list

| Item | Result | How |
| --- | --- | --- |
| `O.x.bookmark` during repair | **Clean with `C`.** `Live` cell is H2 | Model, directed script |
| `pages` | Works on paper. **A `Denied` page plus `settle` passes the whole page**, with `DeliveryDenied` only (Low) | Reasoned |
| `Feed.more(…, { at })` | Sound oldest first. Wrong `at` is silent: A16 declined, correct to say | Conv., reasoned |
| 20,000 gap at 100 msg/s | **3 connections with pages; see Med4** | `conv.py`, arithmetic stepped, not on a table |
| `idle` on a Clock | Half-open ends in 9 connections at budget 8; pings hold it. My loop, armed around a pull; not Flow | `clock.ts`, TestClock |
| Budgets | Up 59 s spends, ends at 660 s. Up 61 s resets, runs forever, as designed. Never-registered does not reset | `clock.ts` |
| `latest` fence | **Clean**: 63,955 states, nothing cached heard or current. Without it: 946 hits | `latest.py`, mine, T5 plus T6 |
| `Feed.callback` | Type problem, Med1. Queue behaviour **not run** | |
| `listen` | Reasoned only. T7 reads right; 7.5's dead retry, Med5. `listen` on a contract with `catchUp` ignores it, stated | |
| Schema from Union `output` | **`.fields` absent, `.members` present.** Possible, by a walk; a `decodeTo` output has neither: needs `{ field, schema }` | Ran |

## 7. Fourteen conditional musts, and other "passes"

| Row | v3 | Mine | Why |
| --- | --- | --- | --- |
| G6 | C | C | Author's flag, positioned SDK. Agree |
| G12 | C | **Fails** | Its stated fix is H2 |
| G15 | C | C | Owner. Handler can also ignore everything; no `why` to discriminate, fine |
| R1 | C | C, **fails on Q2's recipe** | H1 |
| R7 | C | C | Agree. Visible claim |
| R20 | C | C | Unsafe if broken; agree. Med6 makes authors want to lie: they will write `done` for a snapshot |
| C2 | C | **Fails by default** | Med5. Owner waives or not |
| C8 | C | C | K3. Owner |
| M5 | C | C | `UnboundedBridge` unbuilt; `Stream.callback` still compiles |
| F9 | C | C | Owner, rule 25. Agree with v3's argument |
| F10 | C | **Fails for Firestore, EventSource**; C else | Med8 |
| S3 | C | C | Needs the fake's `ping`. SC's "a heartbeat is `HostTimeWait`" (2.10) needs changing too: a Flow `idle` sleep plus a fake ping is a Clock wait, fine |
| L6 | C | C | Recipe. Agree |
| A11 | C | **Fails** | Med1 |

**Other "passes", spot-checked.**

| Row | v3 | Mine |
| --- | --- | --- |
| G11 | P | **Fails on the from-now recipe**, H1 |
| G9 "every cell" | P | `holds` throwing has no cell. Add `end(Defect)` (Low) |
| P2 | P | C on Med2 |
| P5 | P, "not run" | C: safe, false notices (Med7) |
| M8 | should | **Not met** for newest-first under the default, Med4 |
| G16 | should | Not met for snapshots, polling, Med6, H1 |
| A3 | P | `\|\| memory.dismissed` is an algorithm that H1 removes |
| G1, G2, G3, G4, R2, R4, R5, R6, R8, R10, R13 | P | Hold in my configs |

## 8. Is it actually better than v2?

**What "trimmed v2" must be.** `catchUp` on the contract means Flow runs the repair, so Flow also runs the reconnect. So **`reconnect`, `idle`, `Feed.ping`, `Feed.more/done/gone`, `at`, `pages`, `catchingUp`, `Feed` key are in both.** So presence, ticker, `listen`, streaming writes are **identical, line for line**: sections 7.1, 7.2 and 7.5 of the proposal, none of which has a bookmark. The comparison is only an `every` feed with a machine.

**Chat, trimmed v2, complete.**

```ts
// chat.contracts.ts: same as v3 except these two lines
input: { roomId: Schema.String, after: Schema.optional(Cursor) },   // existing in v2: after. The author carries the position
subscribe: ({ roomId, after }, { from, callback }) => …             // from = after at first connect, then Flow's own last position in this session
// chat.definition.ts
memory: { roomId: Schema.String, messages: Schema.Array(Message), cursor: Schema.optional(Cursor), notice: Schema.optional(Schema.String) },   // cursor is back
internalEvents: { Message: { message: Message }, Page: { messages: Schema.Array(Message), at: Schema.optional(Cursor) }, MayHaveMissed: { restartAt: Schema.optional(Cursor) }, FeedEnded: {}, SignedOut: {} },
operations: ({ E }) => ({
  messages: Chat.messages.outcomes({
    value: E.Message.from((message) => ({ message })),
    pages: E.Page.from((messages, { at }) => ({ messages, at })),   // required now: it is the only way `at` reaches memory, and it keeps pages off the cursor
    missed: E.MayHaveMissed.from((m) => ({ restartAt: m.restartAt })),
    failure: { SignedOut: E.SignedOut, ChatDropped: E.FeedEnded, Feed: E.FeedEnded },
  }),
}),
// chat.machine.ts
LIVE: {
  activities: [O.messages.subscribe(({ memory }) => ({ roomId: memory.roomId, after: memory.cursor }))],
  on: {
    Message: { target: "self", updateMemory: ({ memory, event }) => ({ messages: upsert(memory.messages, event.message), cursor: event.message.cursor }) },
    Page: { target: "self", updateMemory: ({ memory, event }) => ({ messages: upsertAll(memory.messages, event.messages), cursor: event.at ?? memory.cursor }) },
    MayHaveMissed: { target: "self", updateMemory: ({ memory, event }) => ({ notice: "Some messages may be missing.", cursor: event.restartAt ?? memory.cursor }) },
    SwitchRoom: { target: S.LIVE, updateMemory: ({ event }) => ({ roomId: event.roomId, messages: [], cursor: undefined }) },   // forget this last field: silent
    FeedEnded: { target: S.ENDED },
    SignedOut: { target: S.SIGNED_OUT },
  },
},
```

**Chat, v3 with this review's fixes:** section 2.1 unchanged, except `holds` keeps its line. 4 cursor fragments fewer, one `holds` more.

**The three SDKs**, adapters the same but for `from`:

| | v3, fixed | Trimmed v2 |
| --- | --- | --- |
| Socket.IO, no position | `holds: (m) => m.list.length > 0`. Quiet: `missed` per reconnect, honest | **A Flow-private saved fact is still needed** (assessment 7), plus a way to say "I read first". So a partition anyway |
| Ably, newest first | Pages frozen, `done { at: head }`. A drop mid-walk is safe | `pages` required, so handler moves only on `at`. **Safe too**, which removes Q1's case against E |
| Phoenix, join replay | `from` from the bookmark | `after` for first join; session position for rejoins |

**Scorecard, same scenarios, modelled where marked.**

| Scenario | v3 as written | v3 fixed | Trimmed v2 |
| --- | --- | --- | --- |
| Room switch, natural line | **Right** (model) | **Right** (model) | Right with `cursor: undefined`; **silent if forgotten** (model) |
| `resetOn`, `.each` | Right | Right | Right |
| Clear, dismiss, count | Comes back | **Right** | **Right** (model) |
| Quiet room, from-now | **Silent loss** (model) | **Right** (model) | **Right**, if a head reaches memory (model) |
| Replay server, quiet, with head | Notice each time | **Right** (model) | **Right** (model) |
| Shared list, per-key list | **Silent** (model) | **Silent, stated** (model) | **Right** (model) |
| Host-kept list | Silent | Silent, stated | Right |
| Read outside `catchUp`, then bookmark | H2 | Right | Equal hole unless Flow checks a `Loaded`'s cursor write, and it can't see one: **worse** |
| Reset | Flow | Flow | **Author line** `restartAt`; forget it: asks the old log forever |
| In-session position | One | One | **Two**: memory's and the session's. A7 |
| Reload mid-repair | Right | Right | Right, by `at` only |
| Persistence, SSR, Schema | Partition, amendments, Med2 | Same | **Nothing new** for positioned feeds: memory carries it |
| Reads at a glance | No cursor lines | One `holds` | Four cursor fragments |
| Agent UX | Natural line is usually right | Natural line right | Required on `Page`; forgetting is silent, in a handler |
| Words (by v2's method) | 32 | **29** (below) | **about 29**: −`holds`, −`O.x.bookmark`; +`restartAt` payload, +`at` payload, + a way to say "read first" |

**So:** correctness goes to trimmed v2 on v3 as written, and to fixed v3 on the cases that matter most: a silently forgotten line in the commonest handler, a second position, and an author-written reset. **Trimmed v2 is not simpler in concept**: it still has a partition for no-position sources, and a session position. Readability goes to v3. I would take fixed v3. **If the owner rejects the private bit, trimmed v2 beats plain `holds`**, because a bug there is a wrong line someone wrote rather than a feature a user asks for later. That is the honest fallback, in place of Q1's middle column.

**What can be cut.**

| Cut | Saves | What happens |
| --- | --- | --- |
| `Overflow` refund | a rule | Nothing bad: Med4 |
| `after` → reuse `from` in `catchUp` | 1 word | Same concept, one name (A7). `next` stays |
| `lost` as an option | 1 | Tag only. O5's preference. Notice says `Unproven` |
| `"accept"` | 1 | V9 costs 3 lines, not 1; G15 becomes clean, not conditional. **I would cut it**: typing's handler is one line |
| `Feed.more`'s `at` | 1 use of `at` | Oldest-first at 20,000 gap: ends by budget or never. **Keep**: Med4's table |
| `pages` | 1 | One turn and render per item, O(n²) first load. **Keep** |
| `O.x.bookmark` | 1 | SSR with no `C`: a notice per hydration. **Keep**, only because SSR must read outside |
| Add `Feed.live({ at })` | −0: `at` already counted | H1 |

**Net: 32 − 3 = 29.** Rule 25 stays the owner's call; reversing it changes both designs equally.

## 9. Real sources

From tables and prior-art notes, no SDK run. Compile as in Med1.

| Source | Verdict |
| --- | --- |
| Raw WebSocket, greeting | Good. Should send `at` (H1). Reorder and name errors (Med1). `decodeFrame` throwing in a listener has no route: wrap it (Low) |
| EventSource | Honest. Quiet reconnect stays `Connecting`. F10 fails, stated |
| Ably | Good. **`at: head` can be undefined on an empty first page: does not type-check** as `{ at: P }`. **`a.connection.on(["disconnected", …], down)`:** prior art says a resume is "transparent", with no channel event named: the row may stay `Dropped`, and each later value gives a false `Unproven`. Unconfirmed. Safest: react to channel states only |
| Socket.IO | Good. A plain reconnect notices. Should be fine |
| Supabase | Good. Section 8's rule ("an SDK that reconnects itself omits") contradicts its table, which gives it `reconnect`. Name the exception: its channel error is terminal per channel. Med5's dead lines |
| graphql-ws | Works on paper. `pongsAndEvents` hides the hard part: `on("pong")` is client-wide, so one client's pongs prove every subscription alive. Fine for half-open; say it |
| Firestore | Good, relies on the fence (clean). F10 fails, stated |
| Phoenix | Works. Whether `receive("ok")` re-fires on rejoin is not in prior art: confirm, since `proof` depends on it |
| Electric | Plausible. **`latest` bans `position`, so offset and handle cannot be saved: every reconnect and reload re-syncs the whole shape.** Large shapes pay. Not stated: say it, or let the adapter hold them for the session |
| Polling | Compiles. Quiet false notice until `Feed.live({ at })`, H1. Desk's roster has this |
| Streaming `fetch` | Good, compiles |

## 10. Low

| # | Finding | Fix |
| --- | --- | --- |
| Low1 | T2 row 4 reads `claim`, set at connect; `h` is read at registration. Clear in that window: proof, `Live`, empty list, replay after `p` only | Accept: the user cleared. With the private bit, consistent. State it |
| Low2 | `holds` throwing: no cell, G9 | `end(Defect)` |
| Low3 | A `Denied` page, then `settle`: page gone, evidence only. Same class as a value, bigger | Keep; `pages` docs say guards on a page handler lose the page |
| Low4 | Schema from a Union by walk; a `decodeTo` output has no fields | `position: { field, schema }` as the rare form, as RV1 said |
| Low5 | Same op placed twice in parallel in one slice: one entry, two sessions moving it | `DuplicateSession` covers it; say so |
| Low6 | Orphan entries for removed ops | Drop at decode |
| Low7 | Default jitter exceeds "capped at 30 s": 34.8 s measured | Jitter first, then cap |
| Low8 | `at` must be a value of the position's type, or "`at: undefined`" means "no change": T1 `complete(at ?? seen)` already does; type it optional where Ably needs it | One line in section 4 |

## 11. What I ran, and what I did not

Serial, one process at a time. Files in `/private/tmp/claude-501/-Users-arpit--claude-spares-spare-Sy75Xy/b97bafc6-720f-455d-b91c-5aa81d337285/scratchpad/s3r2/`. Python peak 15 MB.

| Probe | Result |
| --- | --- |
| `m.py`: my own BFS of T1, T2, T3, reading the tables, not v3's or RV1's model. Exhaustive, all under 13,000 states. 2 appends, 1–2 drops, 1 clear, 1–2 leaves, 1 reload. Oracle at every quiet `Live`: an item past the base neither held, dismissed nor noticed. Output `out-m.txt` | Chat clean. **Hits:** desk from-now (2 configs), shared list, `() => true`. Dismiss comes back through a read. **`heldbit` plus `greetHead`:** clean except the shared list. **Trimmed v2 (`cursorInMemory`):** clean; a forgotten `cursor: undefined` is silent |
| Directed script in `m.py` | H2 |
| `latest.py`: T5 and T6, exhaustive | Fence clean; no fence 946 hits |
| `conv.py` | Med4's table. Arithmetic at page steps, no table run, no jitter |
| `clock.ts`, Bun, real `Schedule`, `TestClock` | Med5, section 6. My loop around T1's cells, armed by pulls in a simple script |
| `infer.ts`, `infer2.ts`, `infer3.ts`, `tsc --strict`, Effect 4.0.5 | Med1. Stand-in Feed types, real Effect and Schema |
| `fieldschema.ts` | Section 6 |

**Limits.** Reads and flushes are atomic in `m.py`, one page, no overflow, no queue: admission windows were RV1's. A notice covers everything earlier. It proves my reading agrees with itself. `heldbit` is my own proposal, tested by my own model: **a fresh Opus should attack it in round 3**, especially `fills` as data, a turn that empties memory while the session is `Connecting`, and `Record` indexing, none of which I modelled separately.

**Not run:** any Flow code; any Story; any vendor SDK; a browser; `callback`'s queue and emit promise; two placements; freeze; hydration on a real payload; T7, T8; an agent trial (A2), which is what the `holds` question most needs: "write clear chat from the docs". Trimmed v2's Socket.IO "I read first" form was not designed, only named. Vendor claims rest on prior-art notes, with Ably's and Phoenix's flagged unconfirmed.

**Read in part:** `stories-amended.md` and `fakes-v2.md` by search on heartbeat, idle, hold; `proposal-v2.md` by 2.10 and its chat sample; blind's first 140 lines; MD rules 25, 46, 52 and 2.5's start; desk feed, presence, technician and roster contracts, definitions and machines. In full: v3, RV1, the assessment, requirements, Persistence, ServerRendering, `decisions-v2.md`.
