# Streams: comparison of revision 3 (A) and the from-scratch design (B)

Status: **advice to the owner, written 2026-10-31. Nothing here is decided.** A is [proposal.md](proposal.md)
(revision 3, commit b254b5d4). B is [proposal-v2.md](proposal-v2.md). The yardstick is [brief.md](brief.md)
(DG1-DG5, SR1-SR40, K1-K19, M6-D1-D7, FC1-FC81, IP1-IP29). Working files (adapters, stubs, models, counts) are in
`/private/tmp/claude-501/-Users-arpit-Developer-flow-state/f0eec56b-0d13-4e1b-81a5-261b36564f95/scratchpad/cmp/`.

## 1. Verdict

**B, with five specific parts taken from A and a list of fixes to B's own samples.**

Why B, in the order of AGENTS.md (correctness, then readability at a glance, then agent UX):

1. **DG2 and FC63 (size and algorithm).** The chat case, the one the brief measures, costs 77 lines in B and 110 in A
   (adapter, repair and Flow-side code, same server, same hand formatting). A still leaves a protocol every chat app
   would write identically in author code: `merge`, `advance`, `paged`, an epoch comparison inside `Missed`, and an
   `OWED` sub-state with a schedule. B leaves `upsert` and one cursor write. Across all five cases: 185 lines (B)
   against 221 (A).
2. **Words.** B declares 20 new words (11 common, 5 uncommon, 4 rare). A's own table has about 24; by the brief's
   tier table I count 14 common, 8 uncommon, 2 rare (24). The common tier is the one that matters, and B is 11 against 14.
3. **Fit with accepted words.** B keeps `connection` (M6-D4) and the M6-D3 shape (`connect` is a plain `Stream`, mirror
   of `Effect.retry({ schedule, while })`). A replaces `connection` with `_tag` and `connect` with an
   `Effect<{ claim, values }>`.
4. **Coverage of the brief.** B answers SSR (SR32, FC78), playback frames, the `flow explain` line (SR37), cursors
   (written workaround, FC27/FC57) and synchronous progress from callbacks (FC58). A has no SSR section at all, no
   explain line, no playback, and defers cursors with one sentence.
5. **Table discipline (brief section 9).** B gives four filled tables (session, pump, callback queue, reconnect), 15
   invariants and 12 mutants. A gives one filled table (the connection table) and proposes models "to build next".

Why not B alone. Walking all 81 FCs, B is weaker than A on five correctness points, one of which fails open (section 6.2):
**FC54** (a cached value forwarded after an explicit `Feed.down` is read as current; fails open), **FC42's default**
(a `catchUp` stream that ends early is read as complete), **FC53** (push-on-change state sources stay dimmed),
**FC35/FC74** (hello-less dense feeds report `missed` on every reconnect) and **FC23** (a failing catch-up read drops
the healthy socket and spends the reconnect budget). A's rules fix the first four; the fifth is a small change in B.

**Carry from A into B** (each is small and removes no B simplification):

1. **Value after an explicit drop updates `last` only** (A's `Down` + value row, connection table 4.1.2). Move B's
   "implicit live on first value" out of Flow's session table and into `Feed.reconnect`, which knows connection
   boundaries and can emit `Feed.live()` before the first value of each connection that said nothing. Flow's table
   then treats a value after `down` with no live signal as `last` only, never `value`. Closes FC54 and FC64 as fail-safe
   and lets a Firestore-style cache show dimmed with its age.
2. **`Feed.live({ proof })` on a state feed re-confirms `last` as `value`** (A's `resumed` on `latest`). Closes FC53 for
   any server that can attest "your value is still current".
3. **The contiguity recipe for hello-less dense feeds** (A 7.7.4), as a documented adapter recipe or a small helper.
   Closes FC35 and removes FC74's cost for dense ids.
4. **Page completeness stays explicit.** A's `complete` flag defaults to "ask for the next page"; B's `catchUp` defaults
   to "the stream ended, so it is complete". Make `catchUp` end only on an explicit marker (a page with `complete`), or
   document and lint the paginate shape (FC42).
5. **Keep the repair visible.** B's `CatchingUp` phase is a hidden per-adapter state machine (SR38) and its read is not
   an operation. No new author word is needed: surface the phase in Inspection and playback frames, and retry the
   catch-up read before dropping the connection (FC23). A's no-stale-resolution and liveness invariants belong in B's
   executable model.

**Fix before B is accepted** (found by compiling its samples against Effect 4.0.5; section 3.3): the `proof` line that
claims continuity on a `hello` with no replay, six uses of `X.asEffect()` (not an Effect 4.0.5 API), `Stream.provide`
of the global `WebSocketConstructor` inside the adapter (a Story cannot replace it, which contradicts SR34),
`Stream.fromChannel(Socket.toChannelString(...))` (does not type-check), `flatMap(fromIterable)` after
`Stream.paginate` (does not type-check), and a chat adapter with no deadline on the `hello`.

## 2. Scorecard

Scale: **+** clearly better, **=** equal, **-** clearly worse, relative to the other design. Evidence is in the
section named.

| Criterion (brief) | A (rev 3) | B (v2) | Section |
| --- | --- | --- | --- |
| DG2 lines, five cases (221 / 185) | - | + | 4.1 |
| DG2 lines, chat only (110 / 77) | - | + | 4.1 |
| DG2 no algorithm in author code | - | + | 4.3 |
| DG2 common-tier words (14 / 11), total (24 / 20) | - | + | 4.2 |
| DG3 new source needs only adapter code | = | = | 4.4 |
| DG4 rare cost not charged to common | - (reset/`Missed` epoch logic in the common chat) | + | 4.3 |
| DG5 safe by default | - (`failure` optional on `every`; push SDKs have no budget) | - (FC54 fail-open, `catchUp` defaults to complete) | 6.2 |
| Correctness walk (81 FCs: pass / limit-or-cost / fail-or-out) | 65 / 15 / 1 | 65 / 14 / 2 out | 5 |
| Connection tables total and conservative (run) | + (one table) | + (four tables, invariants, mutants) | 6.1 |
| Single graph, static analysis, Stories, CLI | + (repair read is an operation, `OWED` is a state) | - (`CatchingUp` hidden in the adapter) | 6.3 |
| Fit: OD1-OD26, rule 14, rule 20, write lanes, merge 4 | = | = | 7 |
| Fit: accepted words and M6-D3 shape | - (`_tag`, `Effect<{claim,values}>`) | + | 7 |
| Brief coverage: SSR, playback, explain, cursors | - | + | 7 |
| Samples compile against Effect 4.0.5 | + | - (six idioms) | 3.3 |
| Subtle author spots across the five cases (32 / 25) | - | + | 4.1 |
| Stale-as-current typing (SR20, SR22) | = | = | 6.2 |

## 3. Method, and what could and could not be checked

### 3.1 What I wrote

For each design I wrote the same five cases from only what that design specifies, in the scratchpad folder above:

| Case | Source | Files (A in `a/`, B in `b/`) |
| --- | --- | --- |
| 1. Chat with catch-up, drop, reset, reload | `effect/socket` WebSocket; server answers `hello` (with or without replay) or `reset`; paged HTTP history; post | `chat.contracts.ts`, `chat.flow.txt` |
| 2. Ticker with a quiet feed, watchlist, alert | one multiplexed socket service; `asOf` on each tick | `ticker.contracts.ts`, `ticker.flow.txt` |
| 3. LLM tokens with Stop | `fetch` body, NDJSON, terminator | `llm.contracts.ts`, `llm.flow.txt` |
| 4. `listen` feeding entity records | Supabase-like channel statuses, async remove | `tickets.contracts.ts`, `tickets.flow.txt` |
| 5. An SDK that reconnects by itself | Firestore-like `onSnapshot` with `fromCache` | `firestore.contracts.ts`, `firestore.flow.txt` |

The server, the transport services (`ChatHttp`, `MarketFeed`, `Realtime`, `Firestore` subsets) and the unchanged post
commit are shared and are not counted for either design (`common/`).

### 3.2 What was type-checked, and what was not

- **Type-checked with `tsc` 7.0.2 against `node_modules/effect` 4.0.5** (all ten `*.contracts.ts` files, `strict`,
  zero errors at the end): the stream contract's `subscribe`, every adapter, `Socket.makeWebSocket` /
  `readerString`, `Stream.timeoutOrElse`, `Stream.paginate`, `Schedule.exponential/jittered/upTo/max`,
  `Context.Service`, `Schema.TaggedError`, the two LLM commits with each design's `progress` type.
- **Against stand-ins, not the real thing:** `Session.*` (A, from sections 4.1.2-4.1.6) and `Feed.*` (B, from 2.2-2.3,
  3.3, 3.4) are my type-only declarations in `a/flow-a.ts` and `b/flow-b.ts`. `packages/flow-state-rewrite` has no stream
  implementation. So the types prove the adapters are well-typed against the signatures as specified, not that the
  signatures are implementable. Both designs needed explicit generics on their combinator in my stubs (inference does not
  flow from `connect` to `while` in either), which says nothing about the real signature.
- **Not type-checkable:** the definition and machine DSL (`*.flow.txt`), the view code, the Story spelling. They are
  written in full and counted, not compiled. SDK shapes (Supabase, Firestore) are from memory, as in both proposals.
- **Not run:** the brief's SR40 trial (a Sonnet agent writing each case from the docs). I did not spawn one.

### 3.3 What compiling found in the proposals' own samples

B states "code is not compiled". Findings in B's samples (each reproduced with `tsc`):

| # | Sample | Problem | Effect on the design |
| --- | --- | --- | --- |
| 1 | 4.1 adapter, `hello` frame | `Feed.live({ proof: "server replayed from ${f.replayedFrom ?? "now"}" })` claims proof on a `hello` with no replay. Its own walk step 5 says that case must send `Feed.live()`. | The FC65 danger (continuity with no evidence) written in the sample. The required string did not stop it. |
| 2 | six sites, `X.asEffect()` | Not an Effect 4.0.5 API (`Context.Service` classes are used as `Effect.map(X, ...)`, `X.use(...)` or `yield* X`). | Cosmetic, but it is the pervasive idiom of B's samples. |
| 3 | 4.1 adapter | `Stream.fromChannel(Socket.toChannelString(socket))` does not type-check (a duplex channel needs its input). `Socket.readerString` + `Stream.fromEffectRepeat` is the working form (A uses it). | Cosmetic. |
| 4 | 4.1 adapter | `Stream.provide(Socket.layerWebSocketConstructorGlobal)` inside the service hides the constructor, so a Story cannot replace it. | Contradicts B's own 2.11 and SR34. Fix: provide at the app layer. |
| 5 | 4.7 polling | `Stream.flatMap(Stream.fromIterable)` after `Stream.paginate` (which already flattens) does not type-check. | Cosmetic. |
| 6 | 4.1 adapter | The idle deadline sits before decoding, so server pings reset it; with no `hello` the row stays `Connecting` for ever. | Fail-closed but stuck: composer denied for ever. Needs one deadline on the `hello`. |

In A's samples I found no Effect-API error in the idioms I rewrote (its `readerString`, `timeoutOrElse`,
`Schedule.max`, `Queue.offerUnsafe` forms compile), but I rewrote them after seeing B's failures, so this is weaker
evidence than it looks. Design-level findings in A's samples are in section 6.

Both: `Schedule.upTo`, `Schedule.max`, `Schedule.jittered`, lazy `Stream.scan` seeds, `Stream.timeoutOrElse`,
`Schema.TaggedError` all exist in 4.0.5.

## 4. The five cases

### 4.1 Lines, and places where the author must get something subtle right

Lines are non-blank, non-comment physical lines, counted by region markers in the files (`count.py`). Both designs were
written by the same hand in the same style, so read the numbers to about 10%. "Adapter" is the contract's `subscribe`
and its services; "repair" is what the catch-up forces outside the adapter proper; "Flow side" is operation, placement,
forced handlers and view, with memory declarations the stream forces.

| Case | A adapter | A repair | A Flow side | **A total** | B adapter | B repair | B Flow side | **B total** |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1. Chat (live path + catch-up + reset + reload) | 41 | 10 | 59 | **110** | 38 | 9 | 30 | **77** |
| 2. Ticker, watchlist, alert, quiet feed | 11 | - | 14 | **25** | 10 | - | 19 | **29** |
| 3. LLM tokens with Stop | 26 | - | 12 | **38** | 26 | - | 12 | **38** |
| 4. `listen` feeding records (Supabase) | 17 | - | 8 | **25** | 18 | - | 7 | **25** |
| 5. SDK that reconnects (Firestore) | 19 | - | 4 | **23** | 12 | - | 4 | **16** |
| **Total** | | | | **221** | | | | **185** |

Chat Flow side split: A operation 24 (events, memory, mappings), placement 2, handlers 30, view 3. B operation 15,
placement 4 (includes the `LOADING` state), handlers 9, view 2. States forced by the stream in chat: A five
(`SYNCED`, `OWED`, `LOST`, `OFFLINE`, `SIGNED_OUT`), B four (`LOADING`, `LIVE`, `RETRY_WAIT`, `SIGNED_OUT`), none of
them a repair state.

Why B is larger in case 2: B requires `failure` to be mapped once `value` is (DG5), so the ticker carries a four-tag
mapping and a `QuoteEnded` handler (5 lines) that A's ticker omits; its view also shows the age and the quiet note
(7 lines against 3). That is B buying DG5 in the common tier.

**Subtle spots** are places where correctness depends on unchecked author knowledge (a type, a check or a default does
not catch the mistake). My list, per case:

| Case | A (count) | B (count) |
| --- | --- | --- |
| 1. Chat | **12**: claim only after `hello`; honest witness; `Reset` reused for "could not replay"; `Missed` epoch comparison; `at` frozen in `OWED`, moved in `SYNCED`; `paged` sets `at` from the page; `complete` computed correctly; catch-up key includes `epoch` and `after`; dedup by id; `ResyncTick` guard on `idle`; `timeoutOrElse` not `timeout`; `Live` guard on send | **9**: `proof` only on a real replay; `catchUp` ends only at the head; `position` for every value; `upsert` by id; cursor written only in fact turns; `restartAt` stored in the `missed` handler; initial page sets the cursor; deadline on `hello` and on frames; `Live` guard (true during catch-up) |
| 2. Ticker | **4**: dummy `position`; `open()` before values; quiet recipe needs a keyed schedule on `each`; classification | **3**: idle deadline in the service; `while`; `asOf` recipe |
| 3. LLM | **5** | **5** (identical: unknown not failure on a cut, `timeoutOrElse`, terminator, release the hold, accumulate text) |
| 4. `listen` | **6**: claim once per `SUBSCRIBED`; down vs fail by status; awaited `removeChannel`; sign-out; re-open state; the SDK's own rejoin has no budget | **5**: `Feed.live()` on `SUBSCRIBED`; fail on every other status; awaited `removeChannel`; sign-out; re-open state |
| 5. Firestore | **5**: tri-state `fromServer` flag; `down` before the cached value; forward the value while down; listener error terminal; metadata option | **3**: drop the cached doc and emit `down`; metadata option; listener error terminal |
| **Total** | **32** | **25** |

### 4.2 New words an author must learn, by tier

Tiers follow the brief's DG4 table (common: a state feed in a view, a fact feed that replays, `listen` consumption;
uncommon: repair, SDK adapters, streaming writes, quiet staleness; rare: resets, unproven positions, silent SDKs,
flapping, outbound). Words that are accepted or already exist (`delivers`, `connection` for B, `progress`,
`subscribe(.each)`, `value`, `failure`, `while`, `schedule`) are not counted.

| Tier | A (words) | n | B (words) | n |
| --- | --- | --- | --- | --- |
| Common | `Session.reconnect`, `connect` (returns `{ claim, values }`), `position`, `Session.open`, `Session.resumed`, `witness`, `Session.gap`, outcome `gap`, `Unproven`, outcome `complete`, row `_tag` (seven literals), `data`, `lastKnown`, `Stale.since` | **14** | `Feed.reconnect`, `from`, `position`, `Feed.live`, `proof`, outcome `missed`, `Closed`, row `drop`, `value`, `last` (`at`), the `connection` literals | **11** |
| Uncommon | `Session.push`, `emit` (`fail`, `end`), `Session.down`, `capacity`, `Overflow`, `ConnectionEnded`, `stableAfter`, the watermark/debt/`OWED` recipe | **8** | `Feed.down`, `Feed.callback` (`emit`, `fail`, `end`), `bufferSize`, `catchUp`, `Overflow` | **5** |
| Rare | claim `at`, the contiguity witness recipe | **2** | `lost`, `restartAt`, `why` literals, `resetAfter` | **4** |
| **Total** | | **24** | | **20** |
| Tooling only (not written by authors) | `Reclaimed`, `NoClaims`, `DuplicateSession`, `DuplicateListen`, `session`/`delivery` evidence, `listen` stale cause | 6 | `FeedUnhandled`, `ListenNeedsFacts`, `DuplicateSession`, `DuplicateListen`, `UnprovenValues`, `RegistrationChurn`, `ReleaseOverdue`, `Discarded`, causes `feedDown/feedGap/feedEnded` | 11 |

Words used per case (distinct, new): chat A 12 / B 12; ticker A 8 / B 4; LLM 0 / 0 (both reuse `progress`); `listen`
A 5 / B 6; Firestore A 8 / B 7. The common chat has the same word count in both; A's extra weight is in the code those
words force (4.3).

### 4.3 Hacks, faked features and algorithm in author code

**A**

- **Chat: the protocol every chat app repeats is in author code.** `merge`, `advance`, `paged`, the epoch comparison in
  `Missed`, the `OWED` sub-state with a 5-second `Schedule.spaced`, `CaughtUp` branching on `complete`, `ResyncTick`
  guarded by `O.catchUp.idle`. This is what DG2 forbids ("never writes a protocol that every app of the same kind would
  write identically") and what FC63 names. A reports 65 machine + 46 definition lines (111) before the adapter; my count of the same work is Flow side 59, adapter 41, repair 10 (110). B: 30 + 38 + 9 = 77.
- **Chat: the first connection always gaps.** A fresh machine starts with `at = { epoch: 0, after: 0 }`; against a server that cannot replay
  from an unknown position (A's own walk step 1) the first claim is a gap and the whole history is fetched through the catch-up from position 0. That is the load path, so
  the "rare" reset logic sits in the common chat (DG4: a rare cost charged to the common tier).
- **Chat: `Reset` is reused for "could not replay in the same epoch"**, and the handler tells them apart by comparing
  epochs. A reason that means two things.
- **Ticker: `position` is required on a state feed**, so the author writes a dummy `position: () => undefined` and
  types `P = undefined`.
- **Ticker: the quiet recipe breaks on the watchlist.** A's 7.3 uses `armOn` for the quiet schedule and then says the
  watchlist is "the same contract placed with `subscribe.each`". `armOn` is banned on keyed schedules (K15), so I wrote
  the keyed form (`keys`, `restartOn: [E.Price]`, per-symbol memory map). The keyed spelling is my reading of OD17 Q13,
  not something A shows.
- **`failure` is not required on a non-`listen` `every` operation** (rule 59 requires `value`, `gap`, `complete`). A chat
  that omits it passes the check, and when the reconnect budget is exhausted the session dies with only the row saying
  `Failure`; the machine is never told. That is a DG5 fail-open that B does not have.
- **Firestore: a hand-written tri-state flag** (`fromServer`) so that repeated server snapshots do not claim again.
  Forgetting it is not silent (evidence `Reclaimed`) but costs a re-claim per snapshot.
- **Upload progress** (not one of the five): `progress` is an Effect, so an XHR needs a Queue-bridging `Stream.callback`
  service (A 7.5, about 14 lines). SR30 says the author should not bridge callbacks by hand.

**B**

- **The repair read is not an operation.** `catchUp` is a function inside the adapter. Nothing in the graph, `flow
  explain`, a Story ending or the row shows it. The row says `Live` (the combinator emits `Feed.live({ proof: "catch-up
  from <from>" })` at the start of the catch-up), so the composer is enabled while history is still arriving.
- **`catchUp` is complete when its stream ends.** A pager that stops early (an empty page, a 304) is read as complete,
  with no `missed`. The contract is "must end only at the head" and nothing checks it.
- **A catch-up failure is a connection failure.** A flaky history endpoint tears down a healthy socket and spends the
  reconnect budget; after eight such failures the session ends.
- **`proof` is any string.** Its own sample wrote one on a hello that replayed nothing (3.3 row 1).
- **State feeds trust a value as liveness.** After an explicit `Feed.down`, a forwarded value makes the row `Live` and
  `value` current (table 3.1, value in `Connecting`). Safe only if the adapter never forwards a cache (FC54).
- **No path to re-confirm a push-on-change state feed** (`Feed.live({ proof })` restores nothing): `value` stays
  `undefined` until the server sends a value (FC53).
- **A deadline on the `hello` has no natural place.** The plain `Stream` shape lets pings keep a connection in
  `Connecting` for ever; I restructured the adapter to pull the first batch in an Effect (`Effect.timeoutOrElse`) to get
  what A's `connect` Effect has by construction.

### 4.4 DG3: a source the brief does not list

Both add a source with adapter code only. Pusher or Ably channels map to B as `Feed.callback` + `Feed.live({ proof })`
on `attached(resumed)`; to A as `Session.push` + `Session.resumed(witness)`. Phoenix join replies are the `hello` of case
1. An MQTT bridge with retained messages is a state feed in both. B's special mechanisms: `catchUp` and `restartAt`; A's:
the debt, the connection table, `at`, `stableAfter`, `capacity`. Neither needs a new concept per source; A pays more
per source in the common tier (a claim choice per connection in `connect`).

## 5. Failure cases, walked against both designs

All 81 FCs were walked (the task asked for at least 40, including every review-2 High, FC41-FC52, and every FC either
design marks unmet or partial). Status key: **P** pass; **C** met with a stated cost; **L** stated limit, or only partly
met; **F** not met; **O** out of scope with the reason and a workaround (SR28's second branch). A is judged on its
revision 3 text; it predates the brief, so FCs it never mentions are judged on what its rules imply.

| FC | Case | A | A: why | B | B: why |
| --- | --- | --- | --- | --- | --- |
| FC1 | equal fact vanishes | P | rule 48: no equality on `every` | P | R-Kind: facts never equality-silenced |
| FC2 | slow reader skips a delete | P | `every` pulled one per turn | P | facts pulled one per turn |
| FC3 | mapping changes meaning | P | `delivers` on the contract | P | `delivers` on the contract |
| FC4 | Wi-Fi blip loses messages | P | `Session.reconnect` resumes from last position; replay or `gap` | P | `Feed.reconnect` resumes from last; proof or `missed` |
| FC5 | `listen` stale with fresh frontier | P | gap/`open()` lowers covered answers (rule 58) | P | unproven start lowers covered answers (2.8) |
| FC6 | no connection status | P | row `_tag` Opening/Live/Down + `reason` | P | row `connection` + `drop` + `failure` |
| FC7 | duplicate session waits forever | P | `DuplicatePlacement`; two ops = two sessions + warning | P | same |
| FC8 | no resume | P | watermark input; row after restart `Opening`+`lastKnown` | P | `after` input; row `Connecting`+`last` |
| FC9 | signed out looks like offline | P | adapter classifies 4401 (`classify` in my type-checked adapter) | P | same (`classify` in my type-checked adapter) |
| FC10 | obligation facts lost on navigation | P | watermark in memory advances only in handled turns; needs a replaying server | P | cursor advances only in fact turns; same condition |
| FC11 | no back-pressure | P | `capacity`; pull waits; push sliding + `Overflow` gap; `highWaterMark` | P | pull one-at-a-time; `bufferSize` overflow becomes a reconnect; state coalesces |
| FC12 | streaming write silent | P | `progress` on the lane | P | `progress` on the lane |
| FC13 | first-live race | P | first `open()` is a gap that lowers earlier answers | P | first unproven start lowers earlier answers |
| FC14 | replay duplicates, unversioned order | P | merge by id; domain versions | P | upsert by id; domain versions |
| FC15 | restored value has no age | P | `lastKnown.since` restored | P | `last.at` restored |
| FC16 | Stories cannot drive a feed | P | control table (needs M3 spelling) | P | control table (own spelling) |
| FC17 | nothing is checked | P | rule 59 errors; `NoClaims`, `Reclaimed` | P | `FeedUnhandled`, `UnprovenValues`, `RegistrationChurn` |
| FC18 | duplicate connections / SSE six | L | sharing rejected (A15); SSE limit not stated | L | stated limit; Q9 asks |
| FC19 | quiet reconnect never comes back | P | claim at hello makes row Live | P | `Feed.live` at hello makes row Live |
| FC20 | old price shows as live | P | `data` only on `Live`; Opening until a value | P | `value` undefined until current connection confirms |
| FC21 | continuity claimed without proof | P | witness required; snapshot is a `gap` | P | proof string required; snapshot not a proof |
| FC22 | chat resumes past a hole | P | debt freezes watermark | P | by construction: cursor moves only on handled facts; repair only in adapter |
| FC23 | failed catch-up forgotten | P | `OWED` + `ResyncTick` retries the read alone | C | catch-up failure fails the whole connection: the healthy socket is dropped and the budget spent |
| FC24 | server reset drops everything | P | claim `at` + epoch in dedup | P | `restartAt` + epoch in position |
| FC25 | reload silences equal fact | P | no baseline on `every` | P | no baseline on facts |
| FC26 | overflow per adapter, untested | P | contract `capacity`; fake runs adapter | P | `Feed.callback` ships the bound; fake runs adapter |
| FC27 | cursors have no home | L | deferred to own proposal; one sentence of workaround, no code | O | out of scope with a worked `SubscriptionRef` workaround (SR28 branch 2) |
| FC28 | ended/down `listen` leaves answers fresh | P | rule 58; `failure`+`complete` required | P | 2.8 table; `failure` required |
| FC29 | clean close ends feed silently | P | `complete` required on `every` (not on `latest`) | P | `Closed` is a retried drop or a mapped ending |
| FC30 | Stop wipes next answer's progress | P | progress per Attempt | P | progress per Attempt |
| FC31 | status sequences undefined | P | 3x7 connection table, no ignored cell | P | 5x12 session table, no ignored cell |
| FC32 | deliveries against mailbox cap | P | outside cap, bounded by placements | P | outside cap, <=1 item per session |
| FC33 | release and restart race | P | finalizers awaited before next session | P | same, 5 s bound + `ReleaseOverdue` |
| FC34 | unbounded default buffer | L | hand-written `Stream.callback` bypasses `capacity`; unchecked | L | same; stated |
| FC35 | SSE cannot prove continuity | P | contiguity witness recipe (dense ids) | C | every reconnect is unproven -> `missed` |
| FC36 | budget reset unstated | P | `stableAfter` 10 s | P | `resetAfter` 1 min |
| FC37 | stall looks like completion | P | `timeoutOrElse` rule 51 | P | `timeoutOrElse` 2.3 |
| FC38 | wall-clock adapters | L | rule 61 in docs only | L | stated limit |
| FC39 | retry after Stop unstated | P | key-less `cancel` in the ending's handler | P | same |
| FC40 | flat market vs dead feed | P | `asOf` + schedule; `armOn` recipe is banned on `each` (K15), keyed form needed | P | `asOf` + `useNow` in the view, no machine state |
| FC41 | flapping server loops forever | P | `stableAfter`; but `Session.push` SDKs have no budget | P | `resetAfter`; SDKs can be wrapped in `Feed.reconnect` |
| FC42 | partial catch-up declares in sync | P | explicit `complete`; default path pages on | P | `catchUp` must end at the head: a stream that ends early is read as complete |
| FC43 | late page from old log | P | newer lookup releases older; page carries epoch | P | catch-up scoped to its connection |
| FC44 | hole detection on sparse positions | P | no inference | P | no comparison |
| FC45 | reload mid-repair stuck | P | `OWED` restored + tick | P | new session repeats the catch-up |
| FC46 | quiet reconnect after reset gaps again | P | claim `at` is next `from` | P | `restartAt` is next `from` |
| FC47 | silent SDK rejoin loses deletes | P | claim while Live = new connection | P | unproven live while Live = unseen reconnect |
| FC48 | leaving screen leaves answers fresh | P | release makes covered answers stale | P | release makes covered answers stale |
| FC49 | bounds on one path only | P | contract bound + signals take no buffer | P | bounded callback + signal groups O(1) |
| FC50 | live/stale view code lies | P | `data` only on Live; `lastKnown` is `Stale<A>` | P | `value` undefined unless current; `last` needs the word |
| FC51 | registration before it exists | P | adapter picks the claim moment; first value default (3 options) | P | first value implicit live (2 options) |
| FC52 | feed that can never be repaired | P | acceptance, discharge (c) | P | `missed` handler, acceptance |
| FC53 | dimmed forever (push-on-change) | P | `resumed` on `latest` restores the last value if the server attests | C | stays dimmed until a value; server must resend state |
| FC54 | cached value as fresh | P | value after `down` updates `lastKnown` only, never reaches the machine | L | fails open if the adapter forwards a cache after `down`: value is read as implicit live; safe only if adapter drops caches |
| FC55 | values before subscription confirmed | P | implicit open gap first | P | implicit unproven start first |
| FC56 | woken page shows old price | P | overdue heartbeat deadline | P | overdue idle deadline |
| FC57 | outbound state lifecycle | L | deferred; ghost/restore/rate holes listed, no code | O | out of scope; workaround meets clear/re-send/no-restore/no-turn |
| FC58 | progress from callbacks awkward | L | needs a Queue-bridging `Stream.callback` service (~14 lines) | P | synchronous `progress(p)` in `onprogress` |
| FC59 | Stories miss real sequences | P | withhold/hold/reorder/flap/suspend | P | withhold/hold/reorder/flap/suspend |
| FC60 | out-of-sync has no exit | P | tick until a complete page | P | no out-of-sync state |
| FC61 | clean close unreachable on Effect sockets | P | stated; `ConnectionEnded` for others | P | stated; `Closed` from completion |
| FC62 | normal snapshots look like reconnects | P | needs the `fromServer` tri-state flag in the adapter | P | snapshots are values, nothing to track |
| FC63 | correctness bought with size | L | chat 110 lines; merge/advance/paged/epoch-compare/`OWED` remain in author code | P | chat 76 lines; only `upsert` and a cursor write remain |
| FC64 | most common adapter mistake | P | value after `down` -> gap, lane stays Down; `NoClaims` | P | implicit live + `missed`; `UnprovenValues` |
| FC65 | most dangerous adapter line | L | witness is any value; visible, not prevented | L | proof is any string; B's own sample writes `?? "now"` on a hello with no replay |
| FC66 | quiet room disables sending | C | first-value claim; Opening on a quiet feed | C | same |
| FC67 | cached first snapshot reads live | P | leading `down` (adapter's job) | P | dropped + `down` (adapter's job) |
| FC68 | two catch-ups for one rejoin | C | stated | C | stated |
| FC69 | leaving and returning costs a read | C | stated | C | stated |
| FC70 | Stop holds the next Ask | C | stated | C | stated |
| FC71 | several uploads, one progress | P | key per upload + `reject` | P | same |
| FC72 | polling restarts at beginning | P | `Session.reconnect` over long-poll (claim by cursor) | P | `Feed.reconnect` + cursor (sample has a type slip) |
| FC73 | flapping ends session; machine re-opens | C | LOST + backoff state | C | RETRY_WAIT state |
| FC74 | repeated 'may be missing' (sparse SSE) | C | server's fix | C | server's fix |
| FC75 | tabs | P | restore/handover rows | P | restore/handover rows |
| FC76 | two `listen` sessions | P | M6-D6, `DuplicateListen` | P | M6-D6, `DuplicateListen` |
| FC77 | reload restarts machine backoff | P | Duration with `feedTries` in memory | P | Duration `reopenInMs` in memory |
| FC78 | server-rendered price reads live | F | SSR not addressed at all (SR32, IP22) | P | state `last` transferred as last known |
| FC79 | upload shows 100% early | L | not addressed | P | label recipe 'Waiting for the server' |
| FC80 | truncated body looks complete | P | terminator -> unknown | P | terminator -> unknown |
| FC81 | half-open socket looks alive | P | client ping + 40 s deadline | P | server ping + 45 s deadline |

**Tally.** A: 65 P, 6 C, 9 L, 1 F. B: 65 P, 9 C, 5 L, 2 O. The 10 FCs on which they differ:

| FC | Better | Why |
| --- | --- | --- |
| FC23 failed catch-up | A | `OWED` retries the read alone; B drops the live connection and spends its budget |
| FC27, FC57 cursors, outbound state | B | B documents a workaround that meets SR28's clauses; A defers with one sentence |
| FC35 SSE continuity | A | contiguity witness proves dense-id reconnects; B reports `missed` every time |
| FC53 dimmed forever | A | `resumed` on `latest` re-confirms the last value when the server can attest |
| FC54 cached value as fresh | A | value after `down` updates `lastKnown` only; B reads a forwarded value as live |
| FC58 progress from callbacks | B | synchronous `progress(p)`; A needs a Queue-bridging service |
| FC63 correctness bought with size | B | 77 lines and no protocol in the machine; A's chat still carries it |
| FC78 server-rendered price | B | A has no SSR design |
| FC79 upload 100% early | B | A states nothing |

Shared costs and limits (identical in both): FC18, FC34, FC38, FC65, FC66, FC68-FC70, FC73, FC74.

## 6. Correctness risks

### 6.1 The state tables, run

I transcribed A's connection table (4.1.2, 3 states x 7 inputs, both kinds) and B's session table (3.1, 5 states, 8 of its 12 inputs modelled including release,
both kinds) into `model.py` and enumerated every adapter sequence up to length 7 (about 2.4
million for B facts at length 7, 0.8 million for A). Properties: **P1** (SR5): no fact is delivered after an
interruption (a drop, a start, a claim while live) before its answer (a gap, or a proof the adapter gave). **P2** (SR20):
a state value counted as current was confirmed on the current connection. **P3** (SR8): every (state, input) pair is
defined.

| | P1 | P2 | P3 |
| --- | --- | --- | --- |
| A, `every` / `latest` | 0 violations | 0 | total |
| B, facts / state | 0 violations | 0 | total |

Mutants kill (so the harness has teeth): A with "ignore a second claim while Live" gives 1,340 violations at length 5;
B with "value before live read as proven" gives 7,216. The tables as written are total and conservative in both
designs. What running them does not cover is where the findings are:

- **A's table is one of several pieces.** `Session.reconnect` (backoff, `stableAfter`, `ConnectionEnded`, scope per
  connection) is described in bullets, not a table; the pump (one pull per delivered turn) has no table; the
  session's ending is a pointer ("4.1.7") rather than a cell; release is in the lifecycle table only. Brief section 9
  asks for filled tables and invariants for SR5, SR8, SR9, SR10, SR18, SR20; A's section 12 proposes them as a next step.
  B's section 3 has four filled tables (60, 16, 15 and 60 cells), 15 invariants and 12 mutants, ready for an executable
  model.
- **A's `Opening` column mixes two states on `latest`:** "no claim yet" and "claimed, no value yet". A view cannot tell
  "not registered" from "registered and quiet" (the FC66 distinction) except through evidence.
- **A's gap merging keeps the latest reason only** (rule 56). A `Reset { epoch }` followed by an `Unproven` gap in a push
  source loses the epoch; A patches this by making the catch-up page carry its epoch, so the debt logic depends on it.
- **B's table treats a value in `Connecting` as an implicit live** whether or not an explicit `Feed.down` came first.
  That is what makes FC54 fail open for an adapter that forwards a cache.
- **Both pump one element per turn**, so a `down` signal sits behind up to `capacity` (A) or `bufferSize` (B) queued
  facts: the row can read `Live` for as long as those turns take. Shared; bounded; not a loss.

### 6.2 What fails open

| # | Design | Where it fails open | Severity |
| --- | --- | --- | --- |
| 1 | A, B | `resumed(witness)` / `Feed.live({ proof })` accept any value. A required argument or string makes the claim visible in review and Inspection, but does not stop it. B's own sample claims proof on a hello with no replay. | Dangerous, visible |
| 2 | A | `failure` is not required on a non-`listen` `every` operation: a chat whose budget is exhausted ends with only a row saying `Failure`; the machine is never told. | Medium |
| 3 | A | `Session.push` sources have no flap budget: an SDK that rejoins in a loop is bounded only by its own policy (FC41 for SDKs, SR14). | Medium |
| 4 | A | An adapter on a source with a cache that forgets the leading `down` shows its first cached snapshot as `Live` (A says so, 7.7.3). | Adapter-dependent |
| 5 | B | After an explicit `Feed.down`, a forwarded value makes `value` current (FC54). The adapter must drop caches; the table does not protect. | Medium |
| 6 | B | `catchUp` ends when its stream ends; an early end reads as "complete", silently (FC42). | Medium |
| 7 | B | `Closed` from a clean completion is retried inside `Feed.reconnect`; a server that closes every connection cleanly is a flapping loop that only the budget stops (stated). | Low |

Neither design lets stale data type-check as current without a visible word: A's `data` exists only on `Live` and
`lastKnown` is `Stale<A>`; B's `value` is `undefined` unless current and the stale value is reachable only as
`last.value`. The most natural expression, `row?.value ?? row?.last?.value`, type-checks in B and
`lane._tag === "Live" ? lane.data : lane.lastKnown?.value` in A; both show the word and neither can be written by
accident.

### 6.3 One graph, one runtime, static analysis, Stories, CLI

- **A:** the catch-up read is an operation (`O.catchUp.lookup`), the debt is a state (`LIVE.OWED`), both visible to
  `flow check`, `flow explain`, guards, views and Stories. A one-off lookup that a newer lookup releases (K18) is
  what makes "a repair that started before the latest loss never resolves it" structural. Cost: all of it is
  author-written per app.
- **B:** `Feed.reconnect`'s `CatchingUp` (3.4) is a state machine inside an adapter that Inspection is told nothing
  about: its proof is announced when the catch-up starts, not when it completes, so Inspection shows a verdict whose
  basis is still running. The read has no lane, no row, no `Story.ending`. SR38 asks for "no hidden per-adapter state
  machine Inspection cannot see". `Feed.reconnect`'s other state (schedule step, `Waiting`) is listed in Inspection
  ("the schedule step"), as A's schedule restarts are. Mitigation is cheap (surface the phase; carry-over 5).
- **Tooling (SR36, SR37):** B has the findings table, the explain line and Inspection flags specified; A has the
  findings (rule 59 errors, `DuplicateSession`, `DuplicateListen`) and `NoClaims` / `Reclaimed` evidence but no explain line.
- **Stories (SR34, SR35):** both fake the transport and keep the adapter; both list withhold, hold, reorder, flap and
  suspend controls and depend on M3's spelling. B's own sample undercut this (3.3 row 4).

## 7. Fit with the merged design

| Merged-design point | A | B |
| --- | --- | --- |
| OD2 / OD2a verbs, OD3 operations by name, OD12 flat `input`/`output`, OD23 Q38 `key` required | Rebased; follows. | Follows (built from MD). |
| OD12 resume position is an input field outside the key | `{ roomId, epoch, after }`: three flat fields, the position split in two. | `after: Schema.optional(Cursor)`: one field. |
| OD17 Q13 `restartOn` per key, `armOn` banned on keyed | Violated by the quiet-feed recipe on `subscribe.each` (7.3). | No schedule in the common recipe; `useNow` in the view. |
| OD17 Q14 `DuplicatePlacement`, MD rule 41 | One operation twice = `DuplicatePlacement`; two operations = two sessions + warning. | Same. |
| Rule 14 delivery (current / late / adopted) | Deliveries mapped at admission; a released session's delivery discarded, never late (rule 53). Stated against rule 14. | Always current from the active leaf; discarded on release with evidence (rule 51 amendment). Stated against rule 14. |
| Rule 8, K17 (deliveries never lost) | Amended: live session's deliveries; released discarded with evidence. | Amended the same way; adds `Discarded { NotLive }` for stale state deliveries. |
| Rule 20 required handling, rule 37 | Rule 59: `value`, `gap`, `complete` on `every`; `failure`, `complete` on `listen`. `failure` optional on `every`. | `value`, `missed`, `failure`; `failure` required whenever anything is mapped; `Closed` joins `Defect`, `Interrupted`. No late handlers (never late). |
| Rule 25, K14 (no Flow retry) | Holds; reconnect is the adapter's. | Holds; `Feed.reconnect` is adapter code on `Clock`. |
| M6-D3 shape (mirror of `Effect.retry`) | Departs: `connect` returns `Effect<{ claim, values }>` (M6-D8 proposed). | Keeps it: `connect(from)` is a `Stream`, `schedule` + `while`; adds `resetAfter`, `catchUp`. |
| M6-D4 `connection` | Replaced by `_tag` (proposed M6-D9). | Kept, on every phase (FC50). |
| Runtime-owned write lanes (OD19-OD22, rule 44) | Sessions are activation-owned, never adopted; reasoned in a table (4.4); streaming-write progress on the Runtime lane. | Same split, same reason (2.5); progress on the lane. |
| OD5-OD8 hold after `cancel` | Releases with a key-less `cancel` in the ending's handler. | Same. |
| Merge 4 record queue and `listen` (rules 26-38, SR24-SR27) | Pushes at arrival, no record queue, no `uncertain` clearing; stale unless every covering session `Live`; release and ending stale. | Same; its table adds `feedDown`, `feedGap`, `feedEnded` causes; first connection counts. |
| Rule 47 mapped events only from endings | Deliveries count as endings. | Same. |
| Persistence O2/O4 (IP21) | `latest` last value as `lastKnown`; `persist?` still appears in A's O1 amendment. | `persist` dropped from streams; state `last` + baseline saved (Q10). |
| SSR O2/O3/O5 (IP22, SR32, FC78) | Not addressed. | Addressed (2.10). |
| Playback, `useNow` (IP24) | Not addressed. | Frames carry `connection` and `last.at`; `useNow` for "as of". |
| `flow explain` line (SR37) | Not specified. | Specified. |
| Static analysis (K12, SR36) | Rule 59 checked at the operation and over leaves. | Types first, `flow check` rows second; sources of both read tokens and data, never closures. |

No point is in conflict with a decided item in either design except A's `_tag`, which overrides accepted M6-D4 and is
proposed as M6-D9; the owner decides that one.

## 8. Limits of this comparison

- The Flow side (definition, machine, views, Stories) is written to each design's specification but cannot be
  type-checked: no stream implementation exists. Lines there are hand-formatted; read to about 10%.
- Subtle-spot counts and word counts are my reading of the specifications; the lists are in 4.1 and 4.2 so they can be
  disputed line by line.
- The table model transcribes the specifications' tables; it shows they are total and conservative, not that the
  specifications describe a sound runtime.
- SDK behaviours (Supabase, Firestore, graphql-ws, SSE) are from memory, as in both proposals. I did not run a Sonnet
  authoring trial (SR40).
- I wrote both sets of code. I wrote A's adapter after seeing B's compile failures, so A's clean compile is weaker
  evidence than B's failures.
