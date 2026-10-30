# v2 review 4: re-review of proposal-v2 revision 5 (d4607c1a)

Status: **advice to the main session, not a decision.** I read proposal-v2.md revision 5 end to end, decisions S1–S8
(treated as fixed), v2-review-3 (RV3), and MD rules 51 and 52. Nothing was run. model/RESULTS.md still describes the
run on revision 4.1: the re-run is in progress (its sources are modified in the working tree), so the model is not
evidence for anything below.

## 1. Verdict

**Not zero High findings: there are two.** Both are small to fix. Neither needs a redesign.

- **H1.** "Nothing owed" is still read as "nothing emitted" or "nothing held". In fact a session owes everything from
  its first registration onward. RV3 M1's fix turns one fail-closed cell into a silent loss. The same mistake appears
  in the empty-memory guard that S8 recommends, and in 4.1's empty-history load (FC13).
- **H2.** The Ably sample's finalizer, added for RV3 L2, detaches a channel object that the whole app shares. Any
  other live session on that channel name then reads `Live` and receives nothing.

One Medium is a regression from S8 H2's wording: release-before-restart now applies only at the same placement path.

## 2. RV3's findings, walked against revision 5

| RV3 | Scenario walked | Result |
| --- | --- | --- |
| H1 `fresh` without `from` | Socket.IO: `reconnect_failed` → `FeedEnded` → `RETRY_WAIT` → `LIVE`. There is no `from`, so the first start is unproven and `missed` reaches a machine holding messages, which shows the notice. Ably passes `from: after`, so a new session with a cursor repairs through `catchUp`. The options type requires `from` with `position`, and every sample with `position` passes it (grep) | **Closed for the cross-session walk.** It reopens within a session (H1 b) |
| H2 placement identity | Two `PriceTile` copies on one symbol: separate paths give separate sessions, with no stall and no spurious `ReleaseOverdue`. Freeze, thaw and `resetOn` rows are in 2.5. Row paths are in 2.6. I10 is per path | **Closed for concurrent copies.** It over-narrows release-before-restart (M1), and with H2 the overlap turns silent |
| H3 P0 | P0 is in 2.3, in 3.7's list and in the mutant list, and a descending-pager variant is in the model scope. Ably pages forwards or reverses a bounded window | **Closed.** Ably's "forwards from the cursor's time" maps a `serial` to a time. That mapping is unconfirmed (L3) |
| M1 `Dropped` × `fresh` | The offline first start, `NoHello`, `TIMED_OUT` and the pre-attach `disconnected` all give `start(fresh)` with no false `missed` | **Closed, but it introduces H1 (a)** |
| M2 amendments | Rules 61–66; rule 41, rule 52's thaw, C57, 2.7.3, rule 25, rule 57's summaries, N3, and V9 as I1–I26 are all present | **Closed.** C57 says "incarnation path" where the rest says "placement path" (L4) |
| M3 `continueAt` | 2.3 defines `continueAt`. The 4.1 code passes `p.beforeOldest` | **Closed in the code.** 4.1 walk step 6 still says "`continueAt` = the oldest kept message" (L1) |
| M4 Electric | A 45 s `Stream.timeoutOrElse` fails `ElectricDown`, and `dropConn` emits `down` | **Closed in intent.** The `.pipe` is attached to the `Effect.gen`, not to the `Feed.callback` Stream, so it does not type-check (L2) |
| M5 Stories | 2.11 says merge 3 owns the spelling. The evidence kinds are the contract, and the two notes for merge 3 are present | **Closed** |
| L1–L9 | Each is addressed. L2's fix is the source of H2. L1's on-arrival drop is now stated in 2.3 | **Closed** (except H2) |

## 3. Findings

### High

**H1. "Nothing owed" starts at the session's first registration, not at its first value or the machine's first fact.**
`fresh` (3.4 `register`) checks four things: the call declares `from`, `last` is undefined, `¬emittedAny`, and the
signal is unproven. `¬emittedAny` is true until the first value arrives. That covers a connection that has registered
but stayed quiet. Three walks:

- **(a) A regression from RV3 M1's fix.** Take 4.1's chat in an empty room, with `from` declared and undefined:
  1. Connection 1 says `hello`, so the start is `fresh`.
  2. Nothing is posted, then the socket drops (`Feed.down`), so the session is `Dropped`.
  3. During the outage, m1 and m2 are posted.
  4. The reconnect calls `connect(undefined)`, and the server registers from now: a `hello` with no replay, which
     the adapter sends as `Feed.live()`.
  5. `register` emits `fresh` again: `last` is undefined and nothing was emitted.
  6. 3.1's new `Dropped` × `fresh` cell is `start(fresh)`. No `missed` is sent.

  m1 and m2 were owed from the moment connection 1 registered, and they are lost silently. Before revision 5 this
  cell read as `live()` and failed closed.

  The same walk fits every quiet first connection: Ably (an `attached` that was not resumed after a quiet start,
  with `catchUp` skipped because `last` is undefined), graphql-ws, and Supabase. The model's mutant "`fresh` on a
  reconnect after a value" does not cover it.

  RV3 M1's argument ("`fresh` implies that no value was emitted, so nothing is owed") holds only when no earlier
  connection of this session registered.
- **(b) The by-hand substitute that S8 recommends has the same mistake.** 2.3 says a start with no `from` can be
  ignored "on an empty memory", and 4.7's Socket.IO guard is `memory.messages.length === 0`. Walk:
  1. The room is quiet, and the first `connect` is unproven, so it is ignored. That is correct.
  2. Socket.IO disconnects, and m1 and m2 are posted.
  3. The SDK reconnects with `recovered: false`, so the adapter sends `Feed.live()` and `missed Unproven` follows.
  4. Memory is still empty, so the guard ignores the `missed`.

  m1 and m2 are lost silently. The machine knows "I hold nothing"; only Flow knows "this is the session's first
  registration". The guard is correct only with both.
- **(c) FC13 with an empty history (this was already true before revision 5; RV3 walked only the no-history case).**
  1. 4.1 LOADING reads an empty page, so `Loaded` stores `cursor: undefined`.
  2. LIVE subscribes without `after`.
  3. The `hello` carries no replay, so the start is `fresh`.

  A message posted between the history read and registration is never shown, and no `missed` is sent. This is exactly
  FC13, which 5.2 marks "met" and the 4.1 comment calls "no first-live race". An empty `from` is honest only if the
  consumer needs nothing from before this registration. A consumer that read a snapshot first does need it.

*Fix (proposed):*

- **3.4 (internal, no API).** Add `announced`: set when this session emits any start (`fresh`, `live`, `proof`,
  `lost`, `reset` or `pending`, implicit ones included). `register` emits `fresh` only if `¬announced`.
  - RV3 M1's cases keep `fresh`, since nothing registered: an offline start, a `NoHello`, a `TIMED_OUT` before the
    join. That follows R-Live: a connection is registered only when the adapter says so.
  - Walk (a) becomes `missed Unproven`.
  - Add a mutant: "`fresh` after a registered connection with no value" (I23).
- **(b): an owner round, since it touches the payload.**
  - **A (recommended):** `Feed.Missed` gains a boolean (spelling for the owner, e.g. `initial`) that Flow sets only on
    the start of a session that has not registered before. The Socket.IO guard becomes
    `m.initial && memory.messages.length === 0`.
  - **B:** drop the ignore. Every first load of a positionless source shows the notice. That is correct but noisy,
    and authors will rewrite it as the lossy guard.
- **(c): a precondition in 2.3 beside `fresh`, plus a sample fix.** The precondition: "an undefined `from` means the
  consumer needs nothing from before this registration; a consumer that reads a snapshot first passes the snapshot's
  position, even for an empty snapshot". In the sample, the history page returns `head`, and `Loaded` stores
  `event.messages.at(-1)?.cursor ?? event.head`. `flow check` cannot see this precondition; state it as a limit.

**H2. A session's release can close transport that another live session is using (recipe S).** The Ably finalizer
(4.7, added for RV3 L2) calls `ch.detach()`. `ably.channels.get(name)` returns one channel object per name per
client, and the client is app-wide (recipe S). Revision 5 allows other live sessions on that object in three ways:

- equal keys in two actors (2.5, "Multiplicity");
- two fragment copies on one key (S8 H2);
- a successor at a different placement path that no longer waits (M1).

*Walk:* actor A and actor B each subscribe to channel `room:1`.

1. A leaves, and its finalizer detaches the shared channel.
2. B's listeners stay registered, but the channel is detached. The sample listens for `attached`, `update` and
   `failed`, not `detached`, and Ably does not re-attach a channel that was detached on request.

B's row reads `Live`, no messages arrive, and no `missed` is sent: stale data shown as fresh, with silent loss. 2.4
already says "closing the client per session would kill the other sessions", but it does not say that an SDK's
name-keyed objects (Ably channels, Supabase's `channel(topic)` in recent clients, Socket.IO's `Manager.socket(nsp)`)
are shared too.

*Fix:*

- Add a recipe S rule to 2.4: a session's finalizer removes only its own listeners. It never detaches, leaves or
  closes an SDK object it obtained by name, unless the client service reference-counts that object per name.
- In the Ably sample, drop `ch.detach()`, or move it behind a reference count in the `Ably` service.
- Add a `ch.on("detached", down)` listener, so a detach from any cause drops the row.

The model cannot see this, because its server has one session per key.

### Medium

**M1. Release-before-restart is narrowed to one placement path, and the text contradicts itself.**

- R-Owner (section 1) still keys the wait on (actor, operation, key).
- 2.5, I10, rule 64 and Runtime O6 key it on the same placement path.
- 2.5's `resetOn` row gives the successor "a new subject path" (MD rule 51: the reset value is a path part), while
  the release-before-restart paragraph lists "a reset" as a same-path successor.

Taken literally, two kinds of successor no longer wait for the old scope to close:

- a `resetOn` reset whose key is unchanged;
- a move between two sibling states that both place the operation.

That reopens FC33. With Supabase it is a visible flap, because `removeChannel` closes the topic that both sessions
share. With H2's Ably sample it is silent.

*Fix:* keep two separate rules.

- **Identity**, for "at most one live session", is per placement path, as S8 decided.
- **The wait** is on any `Releasing` session with the same (actor, operation, key), whatever its path. A copy that is
  still live is not `Releasing`, so S8's case does not wait.

Restate I10 as two clauses, and align R-Owner, rule 64 and Runtime O6.

### Low

- **L1.** 4.1 walk step 6: change "`continueAt` = the oldest kept message" to "the position just before it
  (`p.beforeOldest`)".
- **L2.** The Electric sample: `.pipe(Stream.timeoutOrElse(…))` sits on the `Effect.gen` inside `Feed.callback`. Move
  it to the `Feed.callback(…)` Stream.
- **L3.** Ably's `catchUp`: `position` is `m.serial`, but "forwards from the cursor's time" needs a timestamp. Either
  carry `{ serial, timestamp }` as the position, or say how `ablyForwards` gets a time from a serial (unconfirmed).
- **L4.** 6.1's C57 says "one session per incarnation path". Use "placement path", as rule 41 and rule 62 do.
- **L5.** 7's DG2 bullet still says "Common tier: 11 new words". It is 12.
- **L6.** 8.2 says "the preconditions P1–P3"; it should be P0–P3. 6.2's Operations O4 says "rules 61–65"; check whether
  rule 66 belongs there.
- **L7.** Ably with a channel object cached across connections: a new `Feed.reconnect` connection on a channel that is
  already attached gets no `attached` event. A quiet channel then stays `Connecting` until the first message. This
  fails closed, but emit `Feed.live()` after `ch.subscribe` resolves when `ch.state === "attached"`.
- **L8.** R-Position's claim that "an undefined `from` means the machine has handled no fact" needs each fact handler
  to write a defined cursor (`e.cursor ?? memory.cursor`). Polling's in-batch `undefined` positions are safe only
  because `from ?? "0"` replays from the start. State this beside H1 (c)'s precondition.

## 4. Regressions against what RV3 confirmed

| RV3 confirmed | Revision 5 | Result |
| --- | --- | --- |
| 3.1–3.6 hold (the model and RV3's walks) | The `Dropped` × `fresh` cell changed | **Regressed: H1 (a)** |
| Release-before-restart (FC33, I10) | Narrowed to one path | **Regressed: M1** |
| Recipe S works for Ably within a session | The finalizer now detaches the shared channel | **Regressed: H2** |
| RV1 and RV2 Highs closed | Unchanged | Still closed |
| Effect calls exist with the shapes used | The new `Stream.timeoutOrElse` is on the wrong value | L2 |
| `listen` (3.6), state feeds, SSR and persistence | `fresh` is still a gap for `listen`. State feeds have no `missed`. Freeze and thaw are consistent with 2.10 | No regression |
| Single graph and runtime, static analysis, CLI | The path in identity comes from placements, and summaries carry `delivers` and key fields | No regression |

## 5. End-to-end consistency read

- Sections 1, 2.3, 2.5, 3.1, 3.4, 3.7, 6, 8 and 9 agree on S8 except where noted:
  - R-Owner versus 2.5 and I10 (M1);
  - the `resetOn` path (M1);
  - C57's wording (L4);
  - the stale counts (L5, L6).
- 2.5's freeze, thaw and `resetOn` rows match MD rule 52: a freeze releases the stream, a thaw places it again from
  the thawed memory, and the session is not parked.
- The mutant list adds RV3's four. Add H1 (a)'s mutant, plus a model scenario: a quiet registered first connection,
  a drop, then the reconnect.

## 6. What must change before merge

1. **H1:** add `announced` to 3.4 (internal) and the mutant. Hold an owner round on (b), recommending A. Add the
   empty-`from` precondition and 4.1's `head`.
2. **H2:** add the recipe S rule about SDK objects obtained by name, and fix the Ably finalizer and `detached`
   listener.
3. **M1:** separate identity from the wait. Restate I10 and align R-Owner, rule 64 and Runtime O6.
4. Re-run the model with H1 (a)'s sequence and M1's different-path successor.

No "ready to merge" section, since Highs remain. The polish that can follow the merge is L1–L8.
