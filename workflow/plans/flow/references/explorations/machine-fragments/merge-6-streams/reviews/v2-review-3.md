# v2 review 3: final review of proposal-v2 revision 4.1 (9f890f61)

Status: **advice to the main session, not a decision.** I read proposal-v2.md end to end, decisions S1–S7 (fixed),
brief.md, v2-review-1 (RV1), v2-review-2 (RV2), model/RESULTS.md (MDL), machine-design.md (MD) rules 8, 14, 17, 20, 25,
29, 39–60, 2.9 and N1–N3, EntityDomains.plan's repair paragraph, and merged/stories/proposal-v2.md 2.10, 3.3, 4.3.
Effect calls were checked against `node_modules/effect/src` (4.0.5). Nothing was run. The model is treated as evidence
that section 3's tables agree with their invariants. It is not evidence about cases outside its server: pages
ascending, one session per key, one placement.

## 1. Verdict

**Not zero High findings: there are three.** None needs a redesign. Each is a missing precondition or a missing
identity component, and each has a fix of one or two sentences.

- **H1.** `fresh` silently hides a gap between sessions when the consumer keeps facts but passes no `from`. Two of the
  proposal's own family samples have this shape (Socket.IO, Ably).
- **H2.** Session identity leaves out the fragment incarnation. Two live copies with an equal key stall the second
  copy, or I10 is false.
- **H3.** `catchUp`'s contract does not require pages oldest first. The Ably history the proposal names is newest
  first, and a drop in the middle of the repair then loses silently.

Everything else is Medium or below. The core, tables 3.1–3.6, holds up under my own walks as well as the model's.
RV1's three Highs and RV2's three Highs are closed as written (section 2). RV2 H1 is closed for the case it named but
re-opens at the edges (H1, M1).

## 2. Earlier Highs, walked against revision 4.1

| Finding | Scenario walked | Result |
| --- | --- | --- |
| RV1 H1: an SDK `Feed.down` during a catch-up emits the buffer | 3.4 `CatchingUp` × inner `down(r)`: `abandon()` (buffer, `seen` and `tail` discarded), emit `down`, `Connecting`. 3.1 `Live` × `down`: `pending` → `abandoned`. `last` stays before the hole; the next connection repairs from it. I21, plus the mutant "buffer emitted on abandon", killed | **Closed** |
| RV1 H2: a value is shown current but never heard | Ticker case: `heard` 99; 105 is slotted; a drop; admission discards it (`st ≠ Live`). `Dropped` × `proof`: `start(proven)`, then `last.own` makes `confirmed` true, then `reconcile`: 105 ≠ `heard`, so it is slotted at the new `conn` and admitted. I24, plus the mutant "re-confirm not offered", killed | **Closed** |
| RV1 H3: a fact feed with nothing mapped skips silently | R-Kind and 2.7: an unmapped or partly mapped fact feed is a type error, and `FeedUnhandled` reports it (S7 Q22) | **Closed** |
| RV2 H1: the first start without a position reports a loss | `register`: unproven, `last` undefined, `¬emittedAny` → `fresh`; 3.1 `Opening` × `fresh` delivers no `missed`; `listen` treats it as a gap | **Closed for the stated case.** Re-opens across sessions (H1) and after a failed first attempt (M1) |
| RV2 H2: a bounded history cannot say "cannot" | `CannotRepair` → `settle(lost)`, `settled = true`, page from `continueAt` or `complete()`; no `dropConn`, no budget spent. I22b and mutant C2 | **Closed.** The 4.1 sample's `continueAt` loses one message (M3) |
| RV2 H3: recipe S could never reach `resumed` or `recovered` | 2.4's two recipes; the proof is reworded to cover "the span since the last value this session's stream delivered" | **Closed.** One caveat on SDK objects that live across connections (L7) |

## 3. Findings

### High

**H1. `fresh` means "this session has emitted nothing", but it is used as "the consumer holds nothing".** 3.4
`register` emits `fresh` when `last` is undefined and `¬emittedAny`. That holds whenever the `Feed.reconnect` call has
no `from`, which covers:

- every source without positions (the Socket.IO sample, 4.7);
- sources with positions whose author did not wire `from`. The Ably sample, 4.7, has `position: (m) => m.serial` and
  `catchUp`, but no `from`.

New sessions are routine:

- the machine-level re-open after `FeedEnded` (2.7, and 4.1's `RETRY_WAIT`);
- leaving a state and entering it again;
- a reload of a persisted actor;
- SSR then hydrate;
- a fragment's freeze and thaw (MD rule 52: "a stream resumes from the fragment's own position").

The machine's memory still holds the earlier facts in each case.

*Walk:* a Socket.IO chat reaches `reconnect_failed` → `FeedEnded` → `RETRY_WAIT` (1 to 30 s) → `LIVE`. The new
session's first `connect` has `recovered: false`, so the adapter sends `Feed.live()`, `register` answers `fresh`, and
no `missed` is sent. Every message sent during the outage and the wait is absent from `memory.messages`, and nothing
reports it. That is the exact silent gap SR5 and R-Answer promise against. Ably goes the same way. Its `catchUp` never
runs on a new session, because `last` is undefined, even though Ably's history could repair the gap.

S7 Q21 ("a first start with no position is `fresh`") is fixed. The question is what "no position" means.

*Fix (owner round):*

- **A (recommended):** "no position" means the author declared the resume field (`from` is present in the options)
  and its value is undefined. Under R-Position that holds only when the machine has handled no fact. Make `from`
  required in the options type whenever `position` is given.
  - A call without `from` gets an unproven first start. Its `missed` handler can ignore it on an empty memory:
    `memory.messages.length === 0`, the machine's own knowledge.
  - Fix the Ably sample to pass `from: after`. Its `catchUp` then repairs across sessions too.
- **B:** keep the rule and state a precondition: "a consumer that keeps facts across sessions must pass `from`; a
  source without positions must be re-read on every new session". This is silent if ignored, and `flow check` cannot
  see it.

Under A, add a mutant: "`fresh` without a declared `from`, with memory holding facts".

**H2. The session's identity leaves out the fragment incarnation (MD rules 52, 59).** 2.5, the 3.1 title, I10 and the
release-before-restart rule all key the session on (actor incarnation, operation, key). MD rule 52 makes a fragment's
live placements belong to the incarnation, and rule 59 makes `.each` rows a keyed list per copy.

*Walk:* a `PriceTile` trait under `.each` declares `operations: { quote: Market.quote }`. Two copies show the same
symbol. Both place a session with the same (actor, operation, key):

- read literally, the second session waits for the first's scope to close (2.5), which happens only when the first
  copy leaves, so the second tile stays `Connecting`;
- read with the 5 s bound, it starts after a spurious `ReleaseOverdue`, and I10 is false while both run.

The same applies to a `resetOn` reset (release, then place again: here the wait is right) against two copies (here it
is wrong). The proposal never mentions fragments, freeze, thaw or `resetOn`.

*Fix:*

- The identity becomes (actor incarnation, placement incarnation: the instance path plus the subject path, operation,
  key).
- Release-before-restart applies to a successor at the same placement path (re-entry, a reset, a thaw). Concurrent
  incarnations are separate sessions, as two operations are.
- `DuplicateSession` can warn on them from summaries, since rule 57 already carries the contract id and the key fields.

Add the 2.5 rows:

- **freeze:** released, undelivered items `Discarded { Released }`;
- **thaw:** placed again from the thawed memory;
- **`resetOn`:** released, then placed;
- the state `last` and `heard` of a frozen slice.

**H3. `catchUp` does not require pages oldest first, and the proposal names a newest-first source.** P1 says the
history "is one ordered log"; 3.4 emits "each page's values in order" and sets `last` from each page value. 4.7 says
Ably history is "`untilAttach`, newest first", and maps it to `catchUp`.

*Walk:* the obvious step function is `ch.history({ untilAttach: true })`, then `[page.items, page.hasNext() ?
some(page) : none]`. Values reach the machine newest first. `last`, and the machine's cursor, become the oldest value
of page 1. A drop during page 2 abandons the repair. The next connection repairs from `last`, which is past every
value on pages 2 to n. Those values are never requested, and the start settles proven.

Slack, Discord and most "latest messages" REST APIs page newest first too.

The model cannot see this, because its server returns ascending slices. **[unconfirmed]**: whether Ably allows
`direction: "forwards"` together with `untilAttach`.

*Fix:*

- Add **P0: pages return values in log order, oldest first, starting after the cursor** to the doc comment and to 3.7.
- Write `ablyHistory` forwards from `from`'s timestamp. If Ably cannot do that, state that Ably's `catchUp` is limited
  to reading the whole window and reversing it, bounded by `bufferSize`, with `Feed.CannotRepair` past that bound.
- Add a model server variant with descending pages, and the mutant "descending pager".

### Medium

**M1. 3.1 `Dropped` × `fresh` is read as `live()`, so an offline start gets a false `missed`.** `fresh` reaches
`Dropped` whenever the first connection fails before it registers:

- the app opens offline;
- 4.1's 10 s hello deadline (`NoHello`);
- Supabase `TIMED_OUT` on the first join;
- Ably reporting `disconnected` before `attached`.

In each case `dropConn` emits `down`, and the reconnect's `register` still emits `fresh`, because nothing has been
emitted. The cell then delivers `missed Unproven`, and the user sees "Some messages could not be recovered" on a first
load. It fails closed, but it is wrong UX on the most common flaky start.

`fresh` implies that no value was emitted, so `start(fresh)` is safe in `Dropped`; `listen` is unchanged, since
`fresh` is a gap. Then "`fresh` on a reconnect" is not an equivalent mutant (MDL N10): list it.

**M2. The amendments (6.1, 6.2) predate the fragments merge.**

- *Numbering.* 6.1 adds "rules 48–53", but MD rules 48–60 are now fragments', so the streams rules are 61–66. Every
  "rule 51" in 6.1 and 6.2 (the N3 placeholder, rule 8, rule 14, 2.7.8–2.7.10, 2.7.13, Runtime O4 and O6) would point
  at fragments' lane-identity rule.
- *Placeholders not amended:* MD line 810 (rule 41, "*Stream details: merge 6*"), line 938 (rule 52's thaw), C57
  (line 4541), and 2.7.3's stream row, which still lists `gap` and `complete` (line 1452).
- *Rule 25* ("No Flow timeout and no Flow retry") needs a sentence: `Feed.reconnect` is adapter code inside a session
  (M6-D3), and rule 25 governs sessions and calls.
- *Rule 57's summaries* should carry `delivers` and the stream key fields, so that `FeedUnhandled` and
  `DuplicateSession` work at a host.
- *6.2* V9 still says I1–I24; it is I1–I26 now.

**M3. 4.1's `continueAt` skips the oldest kept message.** `fetchPage` is "`GET ?after=`" (exclusive), and
`continueAt: p.oldest` therefore pages from after the oldest kept message. The step 6 walk ("the kept history and the
buffer follow") and Stories' `historyGone` both assume all of it arrives. The loss sits inside a reported `missed Lost`
cut, so it is not silent, but the headline sample does not do what it says. The model reads `continueAt` as
`ret − 1` (MDL R2).

*Fix:* define `continueAt` as "the cursor the next page starts after", and pass the position before the oldest kept
message, or a server-given page token. State it in 2.3.

**M4. The Electric sample has no idle deadline and no `Feed.down`.** The prose says "the adapter puts its idle
deadline on" `up-to-date`, but the code emits neither a deadline nor a drop. If ShapeStream retries network errors
internally (**[unconfirmed]**: its default backoff), the state row stays `Live` with `value` current through an
outage. That is stale shown as fresh, in a documented family. Fix the sample: a `Clock` deadline reset on each
`up-to-date`, emitting `Feed.down` when it expires.

**M5. Friction with Stories proposal-v2 (in progress; for merge 3 to settle).** M6 2.11 and the 4.1 Story use words
Stories v2 removes: `.process()`, `.do(({ fake }) => …)`, `story.suspend`, checkpoint predicates,
`truth.fake.resumedFrom`, `evidence.feed`. Stories maps them to `.world`, `advance(…, { suspended })`,
`expect(Chat, { connections })` and `session` records.

Proposed: M6 marks 2.11 and 4.1's Story as "spelling owned by merge 3", and names the evidence record kinds (answer,
basis, `missed`, drop, `Overflow`, `Discarded`, phase) as the contract between the two proposals.

Two items for Stories:

- Stories 4.3's `flapping` expects `connection: "Ended"`, but 4.1's machine leaves `LIVE` on `FeedEnded`, so after
  settling the row is `undefined` (2.6 and 3.1: `Releasing` gives `undefined`).
- `historyGone` depends on M3.

### Low

- **L1. Prose that contradicts 3.4.** 4.1 walk step 5, "buffered messages a page returned are dropped by position",
  describes revision 3's ring. 3.4 stops reading pages at the meet and emits the whole buffer. Separately, 2.3 never
  states the rev 4.1 rule that a socket value already in `seen` is dropped on arrival.
- **L2. The Ably sample does not compile and leaks listeners.** `catchUp: ablyHistory(ch)` names `ch`, which is local
  to the `Feed.callback` body. `ch.on(…)` and `ably.connection.on(…)` are never removed, so each reconnect adds
  listeners, and their stale `emit`s become evidence.
- **L3. The 4.8 cursor throttle drops the last position.** `Stream.throttle({ strategy: "enforce" })` drops chunks
  over budget (EFX `Stream.ts:14824`), so the final pointer position can be lost and is not "latest wins". A latest-wins
  sampler is needed.
- **L4. 4.1 classification typing.** `mapError` reads `e.reason` on a union that includes `decodeFrame`'s error type.
  That type-checks only if `decodeFrame` fails with `ChatDropped`; say so.
- **L5. The polling sample's row reads `Live` too early.** It prepends the proof before the first GET answers, so an
  offline device shows `Live` until the first poll fails. That is defensible because there is no persistent
  registration, but state it, or emit the proof after the first batch.
- **L6. A transient fresh window in `listen`.** A proven start makes covered answers fresh before the replayed frames
  that follow it are applied; the same holds at `settle(proven)` before the buffer. It corrects itself in order. State
  it beside 3.6.
- **L7. Recipe S proofs and SDK objects reused across connections.** A proof taken from an SDK flag covers what the
  SDK received. `emit` after release is a no-op, and `Overflow` drops a value, so an SDK object cached across
  `Feed.reconnect` connections must not report a resume that covers those values. State it: subscribe per connection,
  or treat the first start of each `Feed.reconnect` connection as unproven.
- **L8. Status and stale text.** The status line says "revision 4" while the title says 4.1. 8.2 says "None in
  revision 4". 4.1's `ChatBanner` "Disconnected" branch is unreachable with 4.1's own machine, which leaves `LIVE` on
  `FeedEnded`.
- **L9. Model readings to write into the text.** MDL R2 (`continueAt`, see M3), R3 (what an I25 merge may keep), R4
  (reads under one covering session).

## 4. Text against the tables

Checked cell by cell against 2.3, 2.5, 2.6, 2.7, 2.8 and section 4's walks:

- 2.5's lifecycle table matches 3.1 and 3.6, including:
  - the rule that `down` and `end` move `last.at` only for a confirmed `last`;
  - a value received in `Dropped` that takes `dropAt`;
  - a lost settle that sends `missed Lost` before the next fact;
  - a `pending` start that keeps `listen` stale.
- 2.6's row derivation matches 3.1's footnote.
- 2.3's bullets match 3.4, including `liveSince`, the two empty pages, `pageSched` and abandonment. The exceptions are
  L1 and M3.

Effect 4.0.5: every call used exists with the shape used:

| Module | Calls |
| --- | --- |
| `Socket` | `readerString` (an Effect of a pull, needs `Scope`), `makeWebSocket` with `highWaterMark` |
| `Stream` | `unwrap` (removes `Scope`), `paginate` (skips empty arrays, which the polling recipe relies on), `fromEffectRepeat`, `timeoutOrElse({ duration, orElse })` (checked per pull), `fromAsyncIterable(iterable, onError)`, `fromReadableStream({ evaluate, onError })`, `decodeText`, `splitLines`, `throttle`, `scan`, `prepend` |
| `Effect` | `timeoutOrElse`, `callback`, `catch` |
| `Schedule` | `upTo` |
| `Schema` | `TaggedError<Self>()(tag, fields)`, `Literals` |
| `Layer` | `succeed(Tag)(impl)` |
| `SubscriptionRef` | `changes` |
| `Equal` | structural for plain objects (`Equal.ts:2-4`) |

## 5. Integration with the merged design

| Area | Result |
| --- | --- |
| Fragments (rules 48–60, 2.9) | **H2** and **M2**. Otherwise R-Owner maps cleanly: an `.each` copy removed, a `resetOn` reset, a freeze and leaving all release the session; a thaw places again from the fragment's memory. Rule 48 allows streams anywhere. Rule 50 (only the fragment subscribes) and rule 59 (`s.operations.<instance>.<name>`, keyed per copy, then per key under `subscribe.each`) need one line in 2.6 |
| `listen` and the record queue | Consistent. Pushes are applied at arrival and never go through rule 29's queue (EDP: versions, then position). 3.6's gap refetch uses EDP's "one in flight and one trailing", and "Reconnect … refetch covered answers" becomes the gap events. H1 does not affect `listen`, where `fresh` is a gap |
| Persistence, reload, SSR | Sound for state feeds (age plus `heard`; a restored `last` cannot be re-confirmed). Fact feeds are correct only where `from` is wired (**H1**). Freeze is missing from 2.10's table (**H2**) |
| Stories v2 | **M5**: spelling friction only. Stories' `Fake.stream` and `Fake.webSocket` replace `Socket.WebSocketConstructor` as M6 2.11 asks, and the fake stream connection (Stories 3.3) produces every `Feed` signal through the real adapter |
| `flow check` and Inspection | `FeedUnhandled`, `ListenNeedsFacts` and `DuplicateSession` are computable from contract data and tokens. `delivers` must be a literal on the contract, and rule 57's summaries must carry it to hosts (**M2**). Bounded evidence (ring of 256 plus counters) is fine. No closure is read |
| Single graph and runtime | Kept. `Feed.reconnect`'s phase reaches Inspection and Playback through Flow's channel; no second runtime |

## 6. Library families from RV2, under revision 4.1

| # | Family | Works? | Notes |
| --- | --- | --- | --- |
| 1 | Raw WebSocket (4.1) | **yes** | The model's own case. M3 (`continueAt`), L1, L4 |
| 2 | SSE / EventSource | **yes** | `from: after` is wired, so a first load is `fresh` and later loads use the contiguity proof. M1 on an offline start |
| 3 | `fetch` body (LLM) | **yes** | A transaction with `progress`; no stream concept. Unchanged |
| 4 | XHR upload | **yes** | `onabort`, `ontimeout`, a deadline and `lengthComputable` are all present |
| 5 | Socket.IO (recipe S) | **no, across sessions** | Within a session it is honest (`recovered`). A new session is `fresh` with memory still holding messages (**H1**). Also L7 |
| 6 | graphql-ws (recipe P) | **yes** | The implicit live, or a `Subscribed` proof; a quiet subscription stays `Connecting` (FC66 cost). `fromAsyncIterable`'s unawaited `return()` is a stated limit |
| 7 | Supabase / Phoenix (`listen`) | **yes** | `fresh`, then `SUBSCRIBED` unproven: two lowerings, at most two reads (stated). The finalizer is bounded at 3 s |
| 8 | Ably (recipe S) | **no** | **H1** (no `from`), **H3** (newest-first history), L2 (does not compile, leaks listeners) |
| 9 | Electric (state) | **sample unsafe** | **M4**: no deadline and no `down`. The design works once the sample has them |
| 10 | Firestore (state) | **yes** | A cache snapshot is `down` and is shown dimmed; a server snapshot is announced live. The optimistic local echo is stated |
| — | Polling with a cursor | **yes** | At least once inside a batch; L5 |
| — | Presence (state) | **yes** | Folds per connection. Relies on `presence_state` arriving first (Phoenix guarantees it) |

## 7. Concept count, honestly

7 says 21 words (11 common, 6 uncommon, 4 rare). Words an author actually writes that it does not count:

- **`Feed.Signal<D, P>`**: written in the headline 4.1 service type, so common;
- **`continueAt`**: written in 4.1's `catchUp`, so uncommon;
- `reason` on `Feed.CannotRepair`: a field, so arguably part of the word.

**Honest count: 23 written words, 12 common, 7 uncommon, 4 rare.** There are also about 15 read-only tooling words:

- 4 findings, `DuplicateListen` included;
- 3 flags;
- `Discarded`;
- 3 `listen` causes;
- the answer kinds Inspection and Stories show (`proven`, `fresh`, `pending`, `lost`, `reset`, `unproven`,
  `abandoned`).

Two further concepts are not words but are load-bearing for an author:

- `catchUp`'s contract (P0 from H3, plus P1–P3);
- "`fresh` needs a declared `from`" (H1 option A).

Under H1 A the count does not change: `from` is already counted.

## 8. What must change before merge

1. **H1:** an owner round on what "no position" means. The recommendation is A. Then fix the Ably sample's `from`.
2. **H2:** add the placement incarnation to the session identity, I10 and release-before-restart; add the 2.5 rows
   for freeze, thaw and `resetOn`.
3. **H3:** add P0 (oldest first, after the cursor) to the `catchUp` doc comment and 3.7; fix or limit `ablyHistory`;
   add the model variant and the mutant.
4. **M1–M4:** the `Dropped` × `fresh` cell; renumber to rules 61–66 and finish the fragment amendments; define
   `continueAt`; add a deadline to the Electric sample.
5. Re-run the model with the H1 mutant, a descending-page server, two placements on one key, and the M1 cell.

Polish that can follow the merge: L1–L9 and M5. M5 belongs to merge 3.
