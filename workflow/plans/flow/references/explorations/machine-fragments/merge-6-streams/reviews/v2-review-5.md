# v2 review 5: re-review of proposal-v2 revision 6 (5cd949a0)

Status: **advice to the main session, not a decision.** I read proposal-v2.md revision 6 (the S9 diff in full, and
sections 1, 2.3–2.5, 2.7, 3.1, 3.4, 3.7, 4.1, 4.6, 4.7, 6–9), decisions S1–S9 (fixed) and v2-review-4 (RV4). Nothing
was run. model/RESULTS.md still describes the run on revision 4.1; its sources are modified in the working tree, so the
model is not evidence for anything below. Effect 4.0.5's `Equal.equals` is structural for plain objects
(`node_modules/effect/src/Equal.ts`), so Ably's new `{ serial, at }` position matches in `seen`, `tail` and `buf`.

## 1. Verdict

**Not zero High findings: there is one.** It is RV4 H1's root one level up, and it needs no new author word.

- **H1.** "First registration" is scoped to the session, but the obligation belongs to the consumer, whose memory
  outlives its sessions. The proposal's own re-open pattern (2.7's RETRY_WAIT, 4.1) and an ordinary re-entry (4.6's
  "opening settings releases the session") start a new session for the same memory. That new session is `fresh`
  again, or its `missed` is `initial` again. On a quiet feed, what was posted between the two sessions is lost
  silently. This affects the Socket.IO sample as written, and any positioned feed whose consumer reads no snapshot.

There are also two Mediums (an Ably channel leak, and `initial` unspecified on one path) and a few Lows. RV4's H2 and
M1 are closed. RV4 H1 (a) and (c) are closed. H1 (b) is closed only within a session.

## 2. Review 4's fixes, walked against revision 6

| RV4 | Scenario walked | Result |
| --- | --- | --- |
| H1 (a) `announced` | 4.1-style empty room with `from` declared and undefined. `hello` → `register` → `fresh`, which sets `announced`. Nothing is posted, then a drop: `Dropped`. m1 and m2 are posted. `connect(undefined)` → `hello` with no replay → `register`: `last` is undefined, so no repair; `announced` is set, so it emits `live()` → `Dropped` × `live()` = `start(unproven)` → `missed Unproven`. The same holds for Ably (`attached` not resumed → `Feed.live()` → `register`), graphql-ws and Supabase. `Dropped` × `fresh` is now reachable only before any start (an offline start, `NoHello`, `TIMED_OUT`): `start(fresh)` with nothing owed. Every emitted start sets `announced`: `register` (`fresh` included), `startRepair`, and the proof and reset cells | **Closed within a session** |
| H1 (b) `initial` | Socket.IO in a quiet room. The first `connect` → `start(unproven)` with `conn = 0` → `initial` is true, memory is empty, and the guard ignores it. A disconnect, m1 and m2 posted, then `recovered: false` → `Feed.live()` → `conn = 1` → `initial` is false → notice. `Dropped` × value with `conn = 0` (a `down` before any start) gives `initial` true: the session never registered, so that is defensible | **Closed within a session; open across sessions (H1 below)** |
| H1 (c) `head` | Empty history page → `Loaded { head: H }` → `cursor = H` → LIVE subscribes `after: H` → `catchUp` (or the server's replay) from H covers the race. RETRY_WAIT → LIVE keeps `cursor = H`, so 4.1 is safe on re-open too. 2.3 states the precondition and L8's `event.cursor ?? memory.cursor` | **Closed for 4.1.** `HistoryPage` is not shown with `head` (L1). The precondition is incomplete (H1) |
| H2 own-listener finalizers | **Ably:** the finalizer runs `off` on its own five listeners and `unsubscribe(message)`. It no longer calls `detach`. Actor A leaves, and B's listeners and the attached channel are untouched. `detached` → `Feed.down`, so a requested detach drops the row instead of reading `Live`. `first` is set by the `attached` handler and checked after `subscribe` resolves, so there is no double `Feed.live()` when this session caused the attach, and one `Feed.live()` when another session already had it attached (RV4 L7). **Socket.IO:** a Socket per call, `disconnect()` closes only it. **Supabase:** a per-connection `randomUUID` topic, so `removeChannel` closes nothing shared, and postgres_changes does not depend on the topic name. EventSource, Electric (`AbortController`), Firestore (`off`) and graphql-ws (the iterator) close only what they created | **Closed.** Ably now leaks attached channels (M1). Socket.IO's per-call Socket no longer fits recipe S's "app-wide transport" (L3) |
| M1 identity vs the wait | R-Owner, 2.5's paragraph, the `resetOn` row, I10's two clauses, rule 64, Runtime O6, SR17 and FC33 all say identity per placement path and the wait per (actor, operation, key) at any path. Walks: a `resetOn` reset with an unchanged key waits; a sibling-state move waits; two live copies do not wait (neither is `Releasing`); a copy placed while another copy is `Releasing` waits at most 5 s. There is no deadlock: only `Opening` sessions wait, and only on `Releasing` sessions, which end within the bound | **Closed.** Small wording drift (L4) |
| L1–L8 | 4.1 step 6 now uses `p.beforeOldest`; Electric's `.pipe` is on the `Feed.callback` Stream (the parentheses check out); Ably carries `{ serial, at }`; C57 says "placement path"; DG2 says 12; 8.2 says P0–P3 and O4 says 61–66; Ably's already-attached `Feed.live()`; L8 is stated in 2.3 | **Closed** |

## 3. Findings

### High

**H1. "The first registration" belongs to the consumer's memory, not to the session.** S9 made the obligation start at
the session's first registration (`announced` in 3.4, `initial = (conn = 0)` in 3.1). But a consumer's memory routinely
outlives a session for the same (operation, key):

- the machine-level re-open of 2.7 and 4.1 (`FeedEnded` → RETRY_WAIT → LIVE);
- a re-entry (4.6: "opening settings releases the session");
- a sibling-state move, or a thaw.

Each of these starts a new session, and that session is "first" again.

*Walk 1 (Socket.IO, the sample as written):*

1. The room is quiet. The first `connect` is initial, memory is empty, so the guard ignores it. That is correct.
2. The SDK's 8 reconnects fail, then `reconnect_failed` 3 times → the session fails → `FeedEnded` → RETRY_WAIT. Or the
   user opens settings and comes back.
3. m1 and m2 are posted meanwhile.
4. LIVE places a new session. Its first `connect` has `conn = 0`, so `initial` is true. Memory is still empty, so the
   guard ignores it.

m1 and m2 are never shown, and no notice appears. This is RV4 H1 (b)'s loss moved across a session boundary. The
guard needs "this memory has registered before", and `initial` cannot say that.

*Walk 2 (any positioned feed without a snapshot read: graphql-ws's `from: after`, Ably's `from: after`, a hand-written
socket):*

1. The board is quiet, so `memory.cursor` is undefined. Session 1 is `fresh`.
2. Session 1 ends, or is released by a re-entry.
3. Events are posted.
4. Session 2 opens with `from: undefined` and `announced = false`, so it is `fresh` too. No `missed` is sent.

The 2.3 precondition ("an undefined `from` means the consumer needs nothing from before this registration") is false
here, and the author cannot meet it. With no facts there is no cursor to write. The only way out is a snapshot read
with a `head`, which many sources (graphql-ws, Ably without history) do not have. `flow check` cannot see this either.
4.1 is safe only because LOADING stores the history's `head`.

This silently loses data in the proposal's own recommended patterns, so it is a High.

*Fix (proposed; root cause, no new author word):*

- **3.1 (Flow runtime, internal).** Keep `registered` per (memory slice that maps the feed's outcomes, operation,
  key). Every start sets it. A new slice, a `resetOn` reset (a fresh slice) and a key change clear it. It is kept with
  the slice through freeze and thaw, and persisted with it like a state row's `heard` (2.10), so a reload or handover
  of a quiet consumer is not first either. It is bounded: one boolean per placement.
- **`fresh`.** 3.1's `fresh` cells read "if `registered`, as `live()` (evidence)". 3.4's `announced` can stay as the
  in-session fast path, or be dropped. The adapter does not need to know.
- **`initial`.** `initial = ¬registered` at the start, not `conn = 0`. The Socket.IO guard is then correct as written.
  2.7's type note becomes "the first registration for this memory and key".
- **2.3's precondition** shrinks to its true residue: "a consumer that read a snapshot first passes the snapshot's
  position". Re-placement is covered by Flow.
- **Model and mutants.** Add a scenario with a quiet first session, a release, events, then a second session with the
  same memory. Add the mutant "`registered` scoped to the session" (I23).

*Alternative B:* keep the session scope and drop both the ignore guard and `fresh` on any re-placement. That needs a
"first placement" notion anyway, so it is not simpler. *Alternative C:* an author-side `joined` flag in memory. This
fixes the Socket.IO guard, but not walk 2, because a `fresh` start sends the machine nothing to set the flag from.

This touches `initial`'s meaning, which S9 decided (it was delegated), so it is the main session's call.

### Medium

**M1. Ably: no session ever detaches, so attached channels accumulate.** Without the reference count that 2.4 allows,
every room an app has visited stays attached for the client's lifetime. Each one keeps receiving messages (bandwidth,
plus SDK buffers) and counts against Ably's per-connection channel limit. Once that limit is reached, an attach fails
→ `failed` → `AblyDown`, which is visible, so it fails closed. But memory and traffic grow with the number of rooms
visited, which is unbounded for per-document channels.

*Fix:* show the reference count in the `Ably` service, since 2.4 already names it as the escape:
`acquire(name)` / `release(name)`, with `detach` at zero. Include the edge where a new `acquire` arrives while a
detach is in flight (Ably queues an `attach` after a pending `detach`; worth one line in the recipe). Or state the leak
as a cost of the sample.

**M2. `initial` is unspecified on `settle(lost r)`.** 3.1's `settle(lost r)` cell says `deliver(missed Lost)` with no
`initial`, yet the type makes `initial` a required boolean. The case: a first session with a defined `from` (4.1's
`head`), whose first start is `pending` and settles lost. The model cannot be built for this field from section 3
alone. *Fix:* `deliver(missed Lost, initial = (conn = 1))`, or `¬registered` before the start under H1's fix. Also say
that the ignore guard applies only to `why: "Unproven"`. A `Lost` or `Reset` carrying `restartAt` must not be ignored,
or `restartAt` is dropped.

### Low

- **L1.** 4.1: `HistoryPage` is not shown with `head: Cursor`, and nothing says what `head` is for an empty room (a
  position before the first message). The `Loaded` comment ends in a duplicated "…(FC13; RV4 H1 c); FC13)".
- **L2.** 4.1 maps `initial: m.initial` into `MayHaveMissed` but never reads it. That is one more word in the common
  case, against "Uncommon" in the tier table. Drop it from 4.1, and keep it in the Socket.IO sample, where it is used.
- **L3.** Socket.IO now makes "a new Socket per call (forceNew)". That is a Manager per session, so one WebSocket per
  session, which is per-session transport. 2.4's table still lists Socket.IO under S, "app-wide transport", and 2.4's
  new paragraph lists `Manager.socket(nsp)` as a shared object. Either move Socket.IO to recipe P (keeping the SDK's
  retry as the stated exception), or say the per-call Socket trades sharing for an honest `recovered`.
- **L4.** 2.5's "placement starts" row says "once the predecessor is `Released`". Make it "once no session of its
  (actor, operation, key) is `Releasing`". I10's identity clause says "(actor, placement path, operation, key)", but
  3.1's heading says "actor incarnation". Use one.
- **L5.** The Socket.IO guard's deny reason is `deny("MayHaveMissed")`, the event's own name. A reason such as
  `"HoldsOrRejoined"` reads better in Inspection.
- **L6.** 4.6's walk still says "Leaving and re-entering fast waits for `removeChannel` (FC33)". With a per-connection
  topic, the wait no longer protects anything for Supabase (it is harmless). Say so, or the walk overstates why it
  waits.

## 4. Regressions against what reviews 3 and 4 confirmed

| Confirmed earlier | Revision 6 | Result |
| --- | --- | --- |
| RV3 H1: cross-session `fresh` needs a declared `from` | Unchanged; the type still requires `from` with `position` | Still closed. H1 above is a separate hole (an empty `from` across sessions) that RV3 and RV4 did not walk |
| RV3 H2: concurrent copies are separate sessions with no stall | The wait now spans paths, but only on `Releasing` | No regression |
| RV3 H3: P0, pages oldest first | Ably pages forwards from `at` | No regression |
| RV3 M1: `Dropped` × `fresh` for never-registered starts | Now reachable only before any start | No regression |
| RV4: 3.1–3.6, `listen`, state feeds, SSR, persistence | `initial` added to `start` and `Dropped` × value only | No regression (M2 is a gap, not a change) |
| RV1 and RV2 Highs | Unchanged | Still closed |
| Single graph and runtime, static analysis, CLI | No new placement or graph shape. `initial` is payload data. H1's fix adds one persisted Flow-owned boolean per placement, like `heard` | No regression |
| Effect shapes | Electric's `timeoutOrElse` is now on a Stream; `Equal.equals` is structural for `{ serial, at }` | Fixed |

## 5. Consistency read and concept count

- S9 is applied consistently across section 1 (R-Answer, R-Owner, the tier table), 2.3, 2.4, 2.5, 2.7's outcome
  table, 3.1, 3.4, 3.7 (I10 and the mutants), 4.1, 4.6, 4.7, 5.2 (SR17, FC13, FC33), 6, 7, 8 and 9. The exceptions are
  L3 and L4.
- The decision log in 8.1 lists S9 above S8. Swap them so the log is in order.
- **The concept count is 24, and it agrees everywhere.** Common has 12 (section 1 and section 7). Uncommon has 8:
  `Feed.down`, `Feed.callback`, `bufferSize`, `catchUp`, `Overflow`, `Feed.CannotRepair`, `continueAt` and `initial`.
  Section 1's row writes `continueAt` "with" `Feed.CannotRepair` but counts it, matching section 7. Rare has 4. H1's
  fix adds no word.

## 6. What must change before merge

1. **H1:** scope "first registration" to (memory slice, operation, key). That means `registered` in 3.1, persisted
   with the slice; `fresh` downgraded when it is set; and `initial = ¬registered`. Shrink 2.3's precondition, and add
   the model scenario and mutant. This changes the meaning of the decided `initial`, so the main session should
   decide it.
2. **M2:** specify `initial` on `settle(lost)`, and limit the ignore guard to `Unproven`.
3. **M1:** add the Ably reference count, or state the leak as a cost.
4. Re-run the model with H1's two-session scenario.

There is no "ready to merge" section, because a High remains. Once H1 is fixed, the remaining polish is M1 (if stated
as a cost) and L1–L6. None of them blocks a merge.
