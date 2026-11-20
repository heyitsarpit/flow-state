# Round 5: independent review

Status: advice. **Everything here is proposed.** Reviewer: Opus, did not build round 5. Revision `4ab940b7` on `flow-rewrite`. Nothing in the prototype, suite or design was changed. Experiments ran from the OS temp folder, under `conformance/watch.ts`, one process at a time, peak 541 MB. This file is the only thing committed.

**Verdict.** The lane core holds, again and more strongly: a new crash-loop search, a stored-record fuzz and deep-freeze found no lost completion, no second Attempt from a crash and no impurity. **The redone judge does not hold:** I got five silent-wrongness traces from about 60 new lines plus its callers, all reproducible on versioned entities, and the most ordinary one is a first load with a feed already open. "SEARCH-LISTEN with a version has no hole" is true of what that search can express: its reads answer the server's state at answer time and its boot already holds the record. **`seal` is much stronger than round 4's gate** (2,328 stored-record corruptions, 1 failing field) but it stops at `Slot`: stream closures bypass it, and a throwing `reconnect.while` disables streaming for the whole Runtime. **Streams work on the happy path, and the backpressure headline (D71) leaks.** Most fixes are hours. D67 needs one design decision first (Decide, item 1). The month-long build is defensible for the lane core; I would not start the entity store or streams from these drafts yet.

Evidence marks: **[ran]**, **[read]**, **[reasoning]**. Age tags: **r1-2**, **r3**, **r4**, **r5-gj** (round 5 gate and judge), **r5-st** (round 5 streams). I judged age from `git diff --no-index round-4 round-5`, not the builder's table. `lane.ts`, `reads.ts`, `publish.ts`, `timers.ts` are byte-identical to round 4; `step` +25/-17, `turn` +27/-21.

## Reproduced

| Item | RESULTS says | I got |
| --- | --- | --- |
| Scenarios | 458/458, about 10 s, 230 MB | 458/458, 9.1 s, 230 MB; 6 more runs 8.8-9.2 s [ran] |
| Deep-freeze suite | 458/458 | 458/458 [ran] |
| Deep-freeze searches, 75 s each | FRAG, CROSS, REPAIRING, LISTEN, FRAGSTORE 5, SESSION 3 | CROSS 6, REPAIRING 6, SESSION 5, LISTEN version 6, FRAGSTORE row 7: no failure [ran]. Deeper than the builder's on all shared ones. Plain objects only |
| SEARCH-PAY, payFixed, ODD | as stated | **Not rerun** |
| **New: crash-loop search** | none | Persisted trait, `serialize`, `drainMs: -1`, alphabet includes `reload` and `reload` with crash after boot. **Depth 9 complete, 81,504 states, 83 s.** Oracles: mints, endings, claims, at most one undecided Attempt on the wire, one hold. No failure [ran]. My first oracle fired on a dead process's request of a key already decided: my error, fixed |
| **New: stored-record fuzz** | none | Each JSON path of each record, three states, 12 odd values, reload and a short drive: 2,328 cases, **one failing field** (L3) [ran] |

## My mutants

**57/79 raw; 57/76 (75%) with 3 equivalents removed.** Written from rule text and code before opening `mutants-r5.ts` or `mutants-builder.*`. **Disclosure:** I had read RESULTS (which names the 12 survivors and some mutants), round 4's review and convergence-5, so several are near builder's. Default `mutate-one.ts`, watchdog as usual. One kill by watchdog (`x-latest-no-heard`), a runaway. Equivalent: `x-repair-keeps-unechoed` (`settled(..., true)` clears it anyway), `x-deliver-incarnation-fence` (retract covers it while the module lives), `x-rule24-cancel-settled` (the action is a no-op off the wire).

| Part | Killed |
| --- | --- |
| Seal | 9/14 |
| D72, D73, restore | 6/6 |
| Judge | 17/19 |
| Streams | 17/28 |
| Old core | 8/9 |

Series: 20/31, 26/36, 35/50, 18/30, 24/39, 57/76. Real survivors are in M13.

**The searches' own killing power, measured for the first time: 4/15 [ran].** Fifteen mutants that scenarios kill, run with every scenario skipped, across 10 searches at `mutate-one`'s budget (depth 6, 3,000 states, 8 s each). Killed: `x-older-not-dropped`, `x-equal-always-applies` (LISTEN), `x-no-predecessor-wait` (SESSION, REPAIRING), `x-w-silent-at-restore` (CROSS, FRAGSTORE). **Survived, among others: `x-read-applies-over-write`, `x-success-no-doubt`, `x-newer-ignores-unechoed`, `x-frame-no-overlap`, `x-remove-success-not-applied`, `x-r51-commit-any-path`, `x-rebind-only-root`, `x-owed-ignored`.** A small budget, so this is a floor, but see H6: the first of those cannot die at any depth.

---

## High

### H1. A first load with a feed open: the newer frame is dropped, the older list applies, unmarked. On versioned entities. **r5-gj** [ran]

```text
ensure; hello(proof); Load (server snapshot v1); frame TicketUpdated v2 ("newer") -> NotHeld, dropped; list answers v1
record: title t1, revision 1, uncertain false. Nothing asks again. Same with and without a version.
```

Second door, same root: `Load; Archive; archive ok (204); list answers its snapshot` -> `archived: false`, unmarked; server true. `confirm` does `if (r.base === undefined) continue`, so a write's success on a record not yet held leaves no `changedAt`, no `unechoed`, no version. **My search variant finds it at depth 3 in 95 ms** (H6). `feed.domain.ts` states "a patch of a ticket no list holds yet changes nothing; it appears when a list loads it", which assumes the list's answer is newer than the frame. That is the classic subscribe-then-fetch race.

**Implication:** a record's identity needs evidence before it has a base. TanStack DB holds sync data until a persisting transaction settles (`db/packages/db/src/collection/state.ts:1159`); Electric buffers until `up-to-date`; Replicache refuses a response on another base (`mono/packages/replicache/src/sync/pull.ts:227`). **Proposal:** while a read of the machine is outstanding, a frame or a success for an unheld ref leaves a `Rec` with `changedAt` and version and no base. D58's interval then handles it: overlap and differs means doubt and repair. About 15 lines. T7's `current(r)` needs this anyway.

### H2. An equal version skips the interval, and "placed" can be false. Three ways to undo a confirmed fact silently. **r5-gj** [ran]

`judge` returns `apply` on `order === 0 && placed` before looking at positions, so everything rests on `unechoed` being right. It is not.

| Trace, `deskListenFixture` | Result |
| --- | --- |
| **Gone keeps the old version.** Load v1; Load again (R2 out); Archive lost; repair says `null`; Reconcile, resolved; R2 answers row v1 | The deleted record **is back, uncertain false.** `onRepair`'s gone path keeps `version: 1` and clears `unechoed`, so R2 is "equal, placed" |
| **False echo.** Load v1; Load (R2 out); Archive ok 204 (`unechoed`); replay frame `{id, title, revision: 1}`; R2 answers v1 | `archived: false`, unconfirmed gone, 0 repairs. `differs` compares only carried fields, so a partial frame that says nothing about `archived` "matched". Control without the frame: correct. Partial frames are the builder's own (`an-echo-clears...`) and the design's `Ticket.patch` |
| **A repair ignores `keepUnconfirmed`.** Archive ok; a patch with no revision (doubt, repair starts); MarkRead ok; repair answers its row at v1 | `readAt: null`, unmarked, no second repair; server has it. `onRepair` handles `again` and `stale`, then replaces whatever else `judge` said |

**Proposal:** one judge means callers obey its verdict: `onRepair` has a private branch again, which is the shape D66 removed. Echo only if the frame carries every `unconfirmed` field. Gone stores a tombstone that is not "placed" for an equal version. Better: **equal version with an overlapping start is doubt whenever the record's changedAt moved for a non-versioned reason.**

### H3. String versions compare as text. A newer row is dropped for good. **r5-gj** [ran]

`older` uses `<` on strings. `revision: "9"` then `"10"`: frame **Stale**, record stays at 9, no doubt, no repair, one evidence line. Electric-style offset `1_9` then `1_10`: same (`db/packages/electric-db-collection` carries string offsets). Opaque ETags or hashes get a random order. A string version that sorts (`versionToLexi` in `mono/packages/zero-cache/src/types/lexi-version.ts`, ISO times) is fine. A bigint `txid` is "no shape": issue, then positions, and an older one applied [ran]. D67's "Against" lists four limits and not this one.

**Proposal:** versions are numbers unless the entity declares a comparator; a string with no comparator is equality-only. The version's source closure is compile-time data, so `flow check` can say so.

### H4. Stream closures are outside the seal. One throw turns streaming off for every machine. **r5-st** [ran]

D65: "a value from outside may not name, shape or stop the core"; D46: a user closure is "never a disable". `StreamSpec`'s `key`, `backoff`, `reconnectWhile`, `pageRetryWhile` are bare functions, called bare in `sessions.ts`.

```text
reconnectWhile throws, or backoff, or pageRetryWhile, on a failure -> ModuleDefect sessions.input
key throws at placement                                            -> ModuleDefect sessions.told
```

Every session of every machine stops. **H1 of round 4 renamed.** The seal covers `Slot` and the odd-value search covers `Slot`, so the enumeration moved up one level. `sealMapped` does cover the stream's mappers. **Proposal:** every closure in `Compiled` is a `Slot`, as a type, so a bare function does not compile; `seal` wraps them; `reconnectWhile`'s throw means not retried, with an issue.

### H5. A release that changes a key's encoding: a second Attempt beside a hold. **r5-gj on r1-2 identity** [ran]

```text
Go; ack; lost (held, lane key {"k":"a"}). Release: op.key returns {key: i.k}. Reload: no issue.
Go; ack -> requests att-1-1, att-1-2; waits held, wire
```

`validLane`'s comment says "a release must not make an idle guard miss a hold", but it only checks that the id agrees with the stored key, which it always will. Review H2 of round 4 named this case; what shipped does not cover it. An `idle` guard misses the same way [read]. It is the double-charge shape and silent. **Proposal:** at restore, `canon(op.key(head.input))` must equal the stored key, or the lane is re-keyed with evidence. About 5 lines, in a turn-free `cx.user`.

### H6. The silent-wrongness oracle cannot see a stale read. Measured. **r5-gj (suite)** [ran]

Round 5's new oracle is what makes "no hole" sound strong. Its alphabet's `list.truth` is `{ truth: true }`: the fake reads its state **at the moment of the answer**, so no read in SEARCH-LISTEN or SEARCH-FRAGSTORE can ever be older than its landing. And `boot` always loads first.

| SEARCH-LISTEN's alphabet, version, 40 s limit | Result |
| --- | --- |
| Boot loads, reads answer at landing (builder's) | Depth 7 complete, 31,616 states, no failure |
| Boot loads, **each read answers what the server held when it started** | Depth 7 complete, 28,958 states, no failure. **Credit: on a held record with whole rows the judge holds** |
| **No first load**, reads answer their start | **Fails at depth 3** (`Load Archive archive.ok list.snap`), 95 ms |

**On the owner's question, the excluded out-of-order frame.** The limit itself is acceptable; the way it is excluded is not. Over one ordered connection, a no-version frame that is old is healed by the next frame in order, and connections are fenced by `conn`, so the permanent wrongness needs two feeds on one entity, or a server that does not send a later frame. Stating that is fine. But the oracle counts every `frame.was` as "behind" until a later truth, which also blinds it to anything else wrong after one. **Proposal:** make the limit precise (two feeds, or no later frame), let an unversioned entity with a `position` on its feed use that as its order, and give every fake a read that answers from its start. **A sync engine cannot sit behind this judge: it would replace it.** See Readiness.

### H7. A read can wedge a session, and the plan and the code disagree on how. **r5-st, plan** [ran]

```text
catchUp, a read that never answers, pings every 30 s: one hour later Repairing, catchingUp true, one request, no evidence
```

No timer covers a page. **Builder's "plan wrong" claim, checked.** He is right that a full `buf` stops the pull so T6's `Overflow` is unheard: 12 frames, bound 4, no `Overflow` ever. He is wrong about the code: "`idle` is unarmed then too, so... waits forever" is the plan's reading. The code calls `armIdle` before the bound check, against T1's "armed only while a pull is outstanding", so at 45 s it `lose(Silent)`s, reconnects, reads again. So **a slow read beside a busy source is called Silent, loops forever, and `stalls` never counts it** (only `Overflow` does), so T2 row 6's "three repairs, one Lost" is unreachable here. Follow T1 literally and it is a wedge; keep the code and it is a false Silent loop.

**Proposal, for the owner's table:** (1) T6's `failing` reaches the session out of band. `Feed.callback` is Flow's own code, so a new input row `lose(Overflow)` in `Repairing` is one line of T1 and a race in the credit wait. (2) Rule 25 is cancelled, so T1 gets a page deadline, tagged `page`, counted as a stall. **T4's pull and T6's queue are otherwise fine.**

---

## Medium

- **M1. D71's credit is banked by every read. r5-st [ran].** `complete` sets `waitingForPull: true` although no value is waiting, so pump sends a `pull` that the driver counts. Pulled source, 1 first read, 5 `Jump` reads, `drainMs: -1`, 10 values: **peak queue 5, pulled 7 ahead of turned; T4 says 1.** Rule 69 holds, the pull does not. **Fix:** remember whether a value is holding the source.
- **M2. "Live's queue holds at most a notice and one value" is false. r5-st [ran].** `complete` queues `buf` in Live. `drainMs: -1`, 6 buffered: peak 4 queued in Live. `end` mid-flush: memory `[m1, m2]`, 0 `discarded` evidence. So `m5-end-drops-queue` and `l7-lose-keeps-moving` guard live rows, and calling them "unreachable" hid a gap. An 8 ms drain is ordinary with a large page. `t1-member-notice-at-tail` the builder has right: with no `catchUp` nothing queues past one. T1's "at the head" rows are mostly dead there. Keep them; they cost a line. **Vacuous test:** `a-drop-with-one-in-mail-loses-what-moves` settles first, so nothing is in mail; it asserts `queued === 0`.
- **M3. A member with `catchUp` leaves the in-mail value moving. r5-st [ran].** `afterMember`'s `catchUp` branch skips the `moves: false` the other branch does. Yield, `Jump` 40, value cursor 7 in mail, `done`: **bookmark 7, not 40.** T1, T3. One line.
- **M4. A stream that dies reconnects; T1 says `end(Defect)`. r4 [ran].** `exit.t === "defect"` becomes `why: "Failed"`, so `lose`. `Stream.die`: Waiting, nothing ended. A `subscribe` that throws: `CommandFailed`, Connecting; with `idleTime: "Infinity"`, the design's default for a server with no ping, for good.
- **M5. Overflow is faked, as you suspected. r5-st [read, ran].** `api.pulled`'s bound and drain-then-fail are the fake's; the runtime has no `Feed.callback`, no signal groups, no 1,024. `STREAM5-LOSE` cites T6 and proves the fake. `api.socket` is an unbounded `Stream.callback` queue: **nothing bounds a pushed source**, against T4's "holds at most 2,048". RESULTS marks this thin, honestly. It is the piece every real socket uses, so T6 must be runtime code before "streams ran" means much.
- **M6. Persisting re-encodes the whole actor on every turn, inside `step`. r1-2 [ran].** One value, persisted chat: 100 messages 0.23 ms, 1,000 0.77, **10,000 7.4, 50,000 35**. Not persisted: 0.02, 0.03, 0.08, 0.31. This Mac, Bun. At S4's 6x, 1,000 messages is about 5 ms of an 8 ms drain per value, and a `pages` flush multiplies it [reasoning]. Likely S4's hang too: its first attempt's event grew memory, and the change that "fixed" it stopped that; quadratic, not a timing bug [reasoning, not rerun]. S3 is deferred and this is its answer's first half. `seal`'s per-call cost: **6 ns against 0.5** [ran]. Not a concern.
- **M7. A plain write has no failure path. r1-2 [read].** `Host.storage.write` with no `then` returns nothing, and `flush` sets `saved[id] = value` regardless, so a refused or quota-failed write is believed and never retried. The fake's writes never fail, and it lands a batch of keys in one step, so **no test tears actor from lane**. The plan's O5 wants the newest state retried and a scope saved atomically. D72's "stays on disk" assumes both.
- **M8. Restored memory has no shape; an ending can be refused away. r3 [ran].** A release's `Ok` reads a new field; stored memory lacks it: `InvalidTurn` twice (D50), ending gone, no wait, write succeeded, machine never hears. D50 as designed, but `validInc` checks only that memory is an object. Schema decode with defaults is a persistence-round requirement that the prototype cannot show.
- **M9. Two doors, and a third inside the closed one. r5-gj [read].** H4 of round 4 cannot recur at `input`. But `Told` has `{ k: "module", payload: unknown }`, and entities narrows by cast, so the untyped door moved. `input` still treats any unknown kind as a timer. `sessions.ts` names `"entities"` in `cx.tell`, so "no core file names a module" holds while the modules are coupled: an engine must be called `entities` or `listen` needs a change. 13 hooks counted, correct. `cx.placed`: good, keep it.
- **M10. `listen`'s gap is coarser than "thin". r5-st [ran, read].** Dispose the only actor: a new `list` request, for nobody [ran]. `answers` is per distinct input, never shrinks, not per actor, so each reconnect re-reads every search and page ever answered [read]. `onGap`'s comment says a generation fences a slow one; nothing does, and `dispose` does not stop rereads [read]. Stated partly.
- **M11. A patch with a throwing getter is Fatal. r5-gj [ran].** `plain` checks and passes on the original; the spread later throws outside `Refused`. Narrow (a lazy class instance, a Proxy). One line: copy inside the gate.
- **M12. The seal is applied by the test adapter. r5-gj [read].** `createRuntime` takes `machines` and does not call `seal`; `adapter.ts` does. Convergence-5's before/after shows `createRuntime` sealing. "A new call site cannot forget" is true only of a host that remembers. Move it.
- **M13. Real survivors of mine, by rule. r5-gj, r5-st, suite [ran].** Claimed fixed, unpinned: `x-schedule-no-upper` (L10), `x-schedule-negative`, `x-canon-nan-is-null` (L3), `x-abandon-notify-unsealed`, `x-failure-by-unsealed`. Judge: `x-older-repair-no-again`, `x-any-read-clears-unechoed`. T1: `x-down-keeps-deadline`, `x-ping-connecting-rearms` (a stated "does not re-arm"), `x-value-keeps-deadline`, `x-flow-reasons-ask-while`, `x-stalls-any-reason`, `x-empty-pages-loop`, `x-backoff-ignores-closing`. T3, T7, T9: `x-reset-at-registration`, `x-release-no-gap`, `x-when-throw-releases`. **Rule 71: `x-denied-keeps-bookmark`, "a `Denied` value moves it", is not pinned by any case that reaches a Denied.** Core: `x-sends-before-facts`.

## Low

- **L1. r1-2 [ran].** `ORDER-03` fails under clock jitter (2 of 3 seeds): `performance.now` is the only wall clock in the core, and that assertion leans on it.
- **L2. r4 [ran].** `healthy` is not disarmed on `down`. T1 marks it `—`. A connection down for a minute resets `n`.
- **L3. r5-gj [ran].** Stored `root.frag: 5` is Fatal: `validActor` does not require null. Stored `key: "__proto__"`: `actors[v.key] =` sets a prototype and the actor vanishes with no quarantine. Body key and record key are not compared [read].
- **L4. r4 [ran].** `{ _feed: "bogus" }` registers. A value row with a field `_feed` is eaten.
- **L5. r5-st [ran].** A `backoff` of no shape arms a `NaN` timer: Waiting for an hour, no issue. Module timers bypass `finiteMs`: L10's second door. `idleTime: "Infinity"` must not reach a browser's `setTimeout` [reasoning].
- **L6. r5-st [read].** `credits` and `waiting` keep an entry per closed connection; a pull to a dead connection counts forever.
- **L7. r5-gj [read].** D67's "a version carried: no `unechoed`": `settled` returns early on a success, so an older `unechoed` stays. One extra repair.
- **L8. r3 [read].** D72 covers restored endings only. A thaw writes the actor without `frozen` in the step whose endings are only in mail. Narrow, in the sync window. Reverse hazard: a core bug on a stored ending is now Fatal at every boot, a poison record.

---

## Counts by age

| Age | High | Medium | Low | Total |
| --- | --- | --- | --- | --- |
| r1-2 | 0 | 2 (M6, M7) | 1 | **3** |
| r3 | 0 | 1 (M8) | 1 | **2** |
| r4 | 0 | 1 (M4) | 2 | **3** |
| r5-gj | 5 (H1, H2, H3, H5, H6) | 4 | 2 | **11** |
| r5-st | 2 (H4, H7) | 5 | 2 | **9** |
| **All** | **7** | **13** | **8** | **28** |

M6 and M7 are interface facts persistence will hit, not logic bugs. H5 rests on r1-2's lane identity.

**Is the core stabilising? Yes for the lane core; no for what sits on it.** Lane, step, fence, `Phase`, D3, driver: no High, no logic bug, 8/9 mutants, and for the first time a search built to attack them (crash loops, repeated boots) closed depth 9 clean. That is better evidence than three reviews of "not implicated". The caveat stands: counts follow where I looked, and I looked hard at new code. **The count did reset on the judge, as you said it would:** 3 Highs in code one round old, with the same family as round 3's H1 and round 4's H3 (a confirmed fact silently undone). That family has now produced Highs in three reviews running (rounds 3, 4, 5), each time on the branch nobody fed. It suggests that a per-record compare is the wrong level, not that one more fix will do it.

## Round 4's findings, really fixed?

| Finding | State |
| --- | --- |
| H1 | Fixed for `Slot` [ran]. **Renamed: H4, M11** |
| H2 | Fixed; fuzz agrees [ran]. Key change: **H5** |
| H3 | Fixed on a held record [ran]. **Renamed: H1, H2** |
| H4 | Fixed [ran]. Door moved: M9 |
| H5, H6, M1, M2 | Fixed [ran: boots search, builder's cases, my kills] |
| H7, M3-M7 | Fixed [ran: `x-no-predecessor-wait` dies by search] |
| H8 | Built. **New limits: H1-H3** |
| H9 | Mostly; one vacuous case (M2), one row wrong (M3) |
| L3, L10 | Coded, unpinned (M13); L10's second door L5 |
| L6 | Fixed in code, no scenario, as RESULTS says |
| M8, M9, M10, M11, M13 | As stated. M13's D73: sleeps [ran]. Nothing ever deletes the record, and T9's "new memory" still differs; owner's |

## Asked and answered

- **Search reach (CROSS 7 to 6, LIKE 7 to 5, ODD 4 to 3): does not matter.** `perDepth` is identical across rounds where both reached. Rerun: **LIKE on round 5 does 89,445 edges in 20 s against round 4's 97,098; the builder's run did 72,749 in 65 s** [ran]. So his run was about 4x slowed by the machine, not the code. Efficiency: stateless replay, a prefix twice per edge (`pre` and `post`), about 15 steps per edge. `pre` could be dropped where an action has no `on`. **Depth is not what limits these searches; the alphabet is.** Everything I found by search is at depth 3 or less with a new action. Each extra depth costs 3-5x. Spend on fakes and actions.
- **118 s suite run: not reproduced.** 7 plain runs 8.8-9.2 s, `FLOW_DRAIN_MS` 0 and -1 about 9 s (only ORDER-03 and DRV-01's intended cases differ), three jittered-clock runs normal. One wall-clock site, in `pump`. Together with LIKE above, I read it as machine contention or sleep: **no timing bug found** [ran, reasoning]. S4's hang: M6.
- **`chat.compiled.ts`:** compared with 2.11.2 and `feed.machine.ts`, `feed.socket.ts`. Shape fair: position, fills, catchUp, pages, tagged failure. Not real: `Feed.callback` (M5), exhaustive `failure`, `bothLive`, two sessions, `upsert`'s `.slice`. No hack in the machine.
- **`sessions.ts`, 916 lines: not core work.** T1-T7 belong there. `onActors`'s reconciliation (about 65 lines) is the general part. It reaches the tree only through `cx.placed` and `cx.slice`. Fine.
- **Hacks or faked features:** M5, H6's causal read, M7's unfailing and atomic storage, M12's adapter seal. Nothing else passes because a fixture does the work. `moneyAudit` read fairly; not reworked.
- **Citations sampled:** REV5-SESS, STREAM5-* against T1-T5: accurate apart from M2's and STREAM5-LOSE's T6. Log tail: reasons are present but several hashes share one line, so a reader cannot tell what moved.

## Readiness, for the owner

**Could a sync engine sit behind this? Behind the seam, plausibly; behind `judge`, no.** Zero's order is a snapshot cookie with atomic pokes and `lastMutationID` in the same snapshot (`zero-poke-handler.ts:301-375`); `judge` is per record and has no snapshot. An engine replaces `entities.ts`, and needs M9 undone. Unproved. A small fake engine module (cookie, LMID, atomic poke, 200 lines) would settle it in a day.

**What most likely overturns this design, in order [reasoning]:**

1. **Real servers against the entity store.** Most likely, and already started: H1-H3 come from ordinary shapes. Expect to move from per-record compare towards "what snapshot does this evidence belong to", or to shrink the promise. The store is optional, so this does not take the core down.
2. **Real persistence: a per-turn whole-record encode and multi-key writes.** M6 and M7 will force a different capture: batching off the turn, atomic scopes, retried writes, async load (`createRuntime` calls a synchronous `load()`). The write-ahead *protocol* looks right; its *cost and interface* are unmeasured. S3 is still deferred. A hold's Attempt must survive this, so it touches the core's edge.
3. **`Feed.callback` on a real socket.** T6, abort signals, wake ordering, a browser's timers. Fixable table work, but the least-run code.
4. **The typed front end.** `Compiled` has never been produced by anything but hand; H4 shows it is not uniform yet. I expect it to change `Compiled`, not the runtime's logic. Risk of cost more than of overturn. **Nobody has tried it, so this is the least known.**

**Month-long full build:** I would not start it whole. I would start the lane core, as it is. Before committing to the store and streams, spend about a week on: real IndexedDB persistence with S3, one real server with the fake engine, and one thin typed path to `Compiled`. Those are the three things no round has touched, and more prototype rounds on the fakes will mostly find more of what the fakes allow.

## What round 6 must decide, in order

All proposed.

1. **Owner: what D67 promises.** A: keep per-record versions with the fixes below, and state plainly that a record has no joint order. B: add a read's snapshot version where the server has one. I lean A plus the numeric rule, for the optional module.
2. **Judge, redone once more from all findings at once:** H1, H2, H3, L7, every caller obeying its verdict. Redesign by convergence, not by branch.
3. **Fakes first:** reads answer from their start, plain writes can fail, batches can tear, a feed can run two connections for one entity. Then rerun every search (H6, M7).
4. **Every closure a `Slot`, seal inside `createRuntime`:** H4, M11, M12, L5.
5. **H5**, restore checks the key. Small, and the worst shape.
6. **Owner's table: T1 and T6.** H7's two rows. Then M1-M4.
7. **T6 as runtime code,** with the bound out of the fake (M5).
8. **S3, real IndexedDB:** M6, M7, M8, before more entity work if the month is being weighed.
9. **M13's cases;** a fake engine spike (M9).

## Not checked

- SEARCH-PAY, payFixed, SEARCH-ODD rerun; the builder's mutants rerun; `nub run verify`; lint; bundle size.
- A real browser, `fetch`, socket, IndexedDB, phone. S4 not rerun, so its hang is a reading. M6's phone number is a multiplication.
- `allow`, `cancel` family, keyed schedules, `.alsoChanges`, `basedOn`'s rebase, `current(r)`, T8, `subscribe.each`: not built. Two feeds on one entity: reasoning.
- Second tab: probed without a lock (B's boot marks A's live Attempt `Restored`). The plan's O7 forbids that by a Web Lock, which is not built. Not counted.
- Citation sampling is thin past REV5 and STREAM5. Fuzz covered one fixture in three states and did not reach `owner.chain`'s items in a route.
- Search-only kill rate is 15 mutants at a small budget. My traces use `{ ok: row }` answers I judged causally fair, on real shapes where the design has them; a partial frame's realism rests on `Ticket.patch` and the builder's own cases.
