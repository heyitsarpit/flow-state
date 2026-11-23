# Round 6: independent review

Status: advice. **Everything here is proposed.** Reviewer: Opus, did not build round 6. Revision `f836a1e5` on `flow-rewrite`. Nothing in the prototype, suite or design was changed. Experiments ran from the OS temp folder, one process at a time, under `conformance/watch.ts`. Bun peak 277 MB, one mutant killed by the watchdog at 1,463 MB as designed. Chrome peak 945 MB on a throwaway profile with the memory guard, closed after each run. This file is the only thing committed.

**Verdict.** **The lane core holds: a real re-send and a real `NotSent { Restored }`, neither reached by the builder, both behaved correctly on real IndexedDB.** `lane.ts`, `inc.ts`, `reads.ts`, `timers.ts` are byte-identical to round 5, and `step` and `turn` differ by one import and one call. **The new persistence edge does not hold:** one failed plain write produced **two charges on real IndexedDB and a real server, with the screen saying "You haven't been charged"** (H1). "0 acknowledged writes lost" is contradicted by the builder's own `results.json` and I reproduced it (H3). **The redone confirm path lost to the same family a fourth time**, on the design's own `Ticket.patch` shape (H2). H1 has a small fix that I ran. H2 needs a decision. I would start production on the lane core once round 7 has settled `Compiled`, and would keep the entity store out of production for now.

Marks: **[ran]**, **[read]**, **[reasoning]**. Ages: **r1-2**, **r3**, **r4**, **r5**, **r6-pd** (round 6 place and dispose), **r6-real** (capture, boot, reality harness, bench), **r6-other**. Age comes from `git diff --no-index`, not the builder's table.

## Reproduced

| Item | RESULTS says | I got |
| --- | --- | --- |
| Scenarios | 517/517, 9.2 s, 241 MB | 517/517, 9.4 s, 240 MB [ran] |
| The check run properly, `--round 6` | not run | 517/517. Every `REV6-*` row's cites agree with SCENARIOS.md. Exit 1 only because of the old unbuilt rows (`STREAM-*`, `POLICY-*`, `PERSIST-*`, `HOSTILE-*`, `CACHE-*`, `CTX-01`), so the flag was right for the wrong reason: **those rows should be renumbered, or the check stays unusable** [ran] |
| Deep-freeze suite | 517/517 | 517/517 [ran] |
| Deep-freeze searches, 75 s each | LISTEN no load 6, FRAGSTORE row 6, SESSION 5 at 30 s | LISTEN version no load 6 (58,888 states), LISTEN none no load 6 (67,418), FRAGSTORE row 7 (46,278), SESSION 5 (53,980), CROSS 6 (54,443), REPAIRING 5 (75,799): no failure. Plain objects only [ran] |
| SEARCH-PAY | depth 8 | depth 8, 23,668 states, 75 s, no failure, not deep-frozen [ran] |
| Crash loop on the fake, sync store | none | Complete to depth 10: 80 states, no failure [ran]. Adding one action, a plain write that fails *late*, fails at depth 7 (H1) |
| Builder's mutants | 154/182 | The file says 154/182. Not rerun |
| 96 real kills | 0 torn, 0 lost, 0 double charges | Pay's 40 rerun: 0 double charges, 0 Fatal, 0 unsettled. But H3 |
| About 40% of a main thread | by multiplication | **42%, measured** (M3) |

## My mutants

**74/107 raw; 74/102 (73%) with 5 equivalents removed.** Written from rule text and the code before I opened `mutants*.ts` or `mutants-builder.*`. **Disclosure:** I had read RESULTS, which names the 28 survivors, plus round 5's review and convergence-6. By eye, about 30 of mine resemble his, mostly `d74-*`, `d79-*`, `t6-*`. Default `mutate-one.ts`, watchdog as usual. No kill by crash; one by watchdog (`t-follow-unbounded`).

Equivalent, by reading: `e-read-no-claim`, `e-claim-ge`, `e-landing-gt` (positions are unique, a landing is never before its claim), `d-capture-plain` (the plain value equals what `saved` holds), `e-later-success-clears-all-marks` (D3 lets no later write succeed past an unresolved one. **E7 says a retry joins the tail; the code keeps its place. If that ever changes, this stops being equivalent**).

| Part | Killed |
| --- | --- |
| Entities | 35/42 |
| Streams | 11/22 |
| Driver, durable | 9/15 |
| Gate | 2/3 |
| Old core: lane, turn, step | 17/20 |

Series: 20/31, 26/36, 35/50, 18/30, 24/39, 57/76, 74/102. Real survivors are in M7 and L7.

**Searches alone: 8/15 [ran]**, mutants that scenarios kill, every scenario skipped, 10 searches at `mutate-one`'s budget. Round 5 measured 4/15 on other mutants, so this is not a trend. Killed: `e-equal-ignores-claim`, `e-frame-ignores-claim`, `e-echo-some`, `e-merge-overwrites-claim`, `e-stub-not-kept` (LISTEN), `e-no-D3` (LIKE), `d-acked-forgotten`, `l-commit-over-hold` (PAY). **Survived: `d-awaited-says-unacked`, `l-rule18-off`, `st-send-fence`, `t-told-restored-twice`, `e-unknown-no-repair`, `e-newer-ignores-claim`, `e-fields-no-claim`.** The first three are the double-charge shape, and their oracles do not look there.

---

## High

### H1. A failed plain write is retried over a newer acknowledgement. Two Attempts, two charges. **r6-real** [ran, real IndexedDB and a real server]

```text
Pay, captureMs 100. The plain batch (actor + lane, acked: false) aborts; the awaited ack, one transaction later, commits.
The request goes out. 1 s later the retry writes lane { acked: false } over the ack. Renderer crash while on the wire.
Reload: "CARD", notice "Your payment wasn't sent. You haven't been charged." Pay again.
Server: charged [att-6999737d, att-3506d921]. Control with no abort: UNSURE, unknown { Restored }.
```

The abort was a real `tx.abort()`, as a quota failure gives. Two independent gaps let it through. `flushCapture`'s failure path checks only `dirty`, never what has been issued since (`driver.ts:150`). And `flush`'s `saved[id] === value` skips the later plain write that would have healed it, because `saved` already holds the ack's bytes. So `put` believes the ack landed, and the retry undoes it. Convergence-6 says `saved` is "only a diff; nothing reads it for correctness". This is the read.

**The fake cannot show it, and that is the finding.** Its `failed` fires synchronously, so `flushCapture` runs again inside the same `persist`, before the awaited write exists. IndexedDB reports `onabort` later. With one change, failure reported on the next tick, a small search fails at depth 7: `failNext Go Go ack reload Go ack`. Any later plain flush triggers it, no timer needed [ran]. `d80-retry-overwrites-newer` surviving was a real signal, but this is a different bug: that mutant is about `dirty`.

**It breaks O3 too:** "Older writes never replace newer committed state". A batch in flight that fails after a newer batch succeeded takes the same path [read].

**Implication.** The write-ahead protocol's safety depends on one invariant the driver does not state: *per key, a later write wins, whatever order the answers come in.* Treat this as a store contract, not a retry detail. **Proposal:** a per-key issue number in the driver. An awaited write deletes its keys from `dirty`, and a failed batch re-enters only keys it was the newest issue of. About 6 lines. **Ran in a scratch copy:** 517/517, every `mutate-one` search clean, the same crash search clean to depth 11, 946 states. Give the fake late failure, and run real abort and real quota.

### H2. A partial answer moves the whole record's version. Rows and confirmed writes are dropped, unmarked. **r6-pd** (A1's door predates it) [ran]

| Trace, `deskListenFixture` | Result |
| --- | --- |
| **A1.** `hello; Load; Retitle; retitle ok { title, revision: 2 }; list answers whole row v1` | `{ title, revision, slug }`, **no `id`, no `archived`, unmarked, for good**. The row is Stale |
| **A2.** `hello; Load; Archive; 204; frame { id, title, revision: 3 }; list answers row v1` | `{ id, title, revision }`: **no `archived`, no `slug`, unmarked. The confirmed write's field is gone too** |
| **A3.** `Load; Rename out; frame { id, readAt, revision: 5 }; rename ok, whole row v4` | **Title back to the old one, unmarked, no repair.** The write's own confirmation is Stale. My forged answer: the fake applies a write at its answer, so it cannot say "applied, then answered late" |
| **A4.** `Load; tombstone v2; frame { id, title, revision: 3 }` | Resurrected as `{ id, title, revision }`, unmarked |

A3 needs a frame that overtakes a response and a feed that does not echo the writer's change, or that coalesces. Both are ordinary. `Ticket.patch` is the **design's own** `listen` shape (2.11.12.7, `ticket.domain.ts`), so this is not an odd fixture.

**Root.** `Rec.version` means "the record as a whole is at v", and `take` moves it on evidence that speaks for only some fields. D67's limit (e) states this for one case, a list row. D76's stub covers only a frame on a record with no base, no claim and no tombstone, so a claim or a tombstone opens the door again. H2 row 2 of round 5 said "a partial frame says nothing about fields it does not carry". `heldBack` applies that to values, and `version` ignores it.

**Is it finally one rule? No.** It is two functions and a table, and clearer than `judge`. But `dispose` returns 8 verbs where convergence-6 says 4, and it holds overrides on `ordered` and `order === 0`. `onPushed`'s stub path, `confirm`'s after-admit claim and direct `take`, `admit`'s `fill` branch and `onRepair`'s `same` check all sit around it. The surface grew from about 60 to about 200 lines. Version strings, gone records, first load, reload and across-actors held up in the traces I tried [ran]. **It fails where evidence is partial.**

**Why the searches missed it: H6 renamed.** LISTEN's frames are always whole, it has no partial-response write, and its oracle reads two fields. I added `Retitle`, a patch frame and "every server field is present": **no first load fails at depth 2, 56 states, in both version shapes** (`Retitle retitle.ok`) [ran]. A real server cannot show it either: `bump` broadcasts whole rows. So "the judge's answers on real orders" were tested on the one shape that cannot fail this way.

**Implication.** Four forms in four reviews means more branches will not do it, and this is the review's "wrong level" again.

| Option, proposed | What it means | Against |
| --- | --- | --- |
| **A. Version per field** (`at: { field: v }`), evidence applied field by field | One rule: a field moves only by evidence at or past its version, and no base means marked. All four traces and the claim become the same comparison | Memory per record; a redesign of `Rec` |
| **B. Partial evidence moves no version**, and needs `Carried.whole` from the front end | Smaller | A late whole row can undo a partial frame's field, unmarked. Needs a mark there, so another branch |
| **C. Shrink the promise:** versions only on whole rows; a store that gets a partial marks the record and asks | Simple, honest | More repairs; `Ticket.patch` costs a read |

I lean A, by a from-scratch design agent given these traces and not the draft. Zero's row patches and TanStack DB's partial updates have to answer the same question.

### H3. An acknowledged write can vanish on a kill: charged, with nothing on disk. **r6-real** [ran; cause not established]

The builder's own row: `{ how: "sigkill", killMs: 3, keys: 1, arrived: 1, restored: null, final: null, orders: 0 }`. RESULTS says of those 12 nulls "no request had left in those 12". **False by its own file.** `doubleCharge` counts only `keys > 1`, so the oracle cannot see this.

| Run | SIGKILL within a few ms of the click | Charged and nothing restored |
| --- | --- | --- |
| Builder's `results.json` | 20 | 1 |
| His harness, my rerun | 20 | 0 |
| Mine, no `before` read, new database | 40 | 0 |
| Mine, new database | 75 | **4** |
| Mine, new database | 59 | **3** (empty after a further wait and after one more kill and restart: durably lost) |
| Mine, the database 1.2 s old | 59 | **0** |

`oncomplete` of a `strict` transaction fired, the request left, and after SIGKILL of Chrome the whole database is empty. It is confined to **a database created moments earlier**, so the atomicity loop, which keeps writing for 150-500 ms before its kill, never sees it. Chrome 146, macOS. I do not know Chrome's mechanism. Whatever the cause, on a loss the client has no hold and no mark, the user can pay again, and it is a second Attempt.

**How bad.** Narrow in time: the first write of a first visit, and a whole-browser kill within a few milliseconds. **The size of the window matters less than the claim.** **Proposal:** a host commits a strict marker and awaits it before reporting ready, rerun this table, and state it as a host contract. Not run. Change the oracle to `charged && no lane`.

---

## Medium

- **M1. A coalesced capture regresses a completed write. r6-real [ran].** `PAID` as `PLACING` on 9-10 of 40. On Pay: safe, it reconciles. **A machine without Pay's reconcile:** `A -Go-> B` with an unknown outcome that moves to `U`, killed within 100 ms of success: live `B`, restored **`U`, memory older, `held`, and still `held` an hour on**, and `Go` is refused. Coalescing widens this from the time of one transaction to 100 ms after every success. **Worse than it looks:** it makes `unknown { Restored }` a routine answer to a write that succeeded. **Proposal:** a batch that touches a lane never waits: it flushes now, and only lane-free memory coalesces. Lanes change on writes, not on chat values, so S3's case keeps its saving [reasoning, not run]. Then `captureMs` loses only plain memory, which is what D80's table already says.
- **M2. Queued until boot, no bound, and the suite cannot see it. r6-real [ran].** `load` that never answers: `pending()` false, 0 actors, 0 issues, 0 evidence, 0 timers, inputs held for ever. Non-persisted machines wait too. `d-boot-queue-off` and `d-read-failure-keeps-persist` both survive: the fake's `load` is synchronous, and no scenario fails a read. **Which is right, 2.10.17.6 or the code?** Queueing, proposed: `ActorAbsent` makes every author handle a click during a slow disk, and a click is the design's concern, not the author's. **But only with O5's bound:** past it, `StorageFailure`, run without persistence, flush the queue. `ActorAbsent` is not implemented anywhere, so 2.10.17.6's table, Stories' `Fake.storage` read rows and `pending()` must all change with it.
- **M3. The 40% is real, and "0 long tasks" is not. r6-real [ran].** 240 values at 60 a second, real IndexedDB: 10,000 messages, 6x, `captureMs` 100: **42% busy, 36 long tasks from 36 flushes, about 9 MB/s to disk** (`Performance.getMetrics`). At 1x, 10%. 1,000 at 6x, 9%. `captureMs` 500: 16%; 1,000: 11%. RESULTS' 0 came from a run of `n = 60`; why it differs from mine is not resolved. Its table's 0.2 ms turn was 1.6 ms here. **Chunks are owed for memory that size, or an adaptive interval.** Chunks' restore is unbuilt; only their store cost is measured.
- **M4. The reality harness and oracles hide things. r6-real [ran, read].** (a) `await Bun.sleep(payDelay + 50)` waits for the server to finish before reopening, so `intent` always says charged and **no re-send can occur**. Removed: restored `UNSURE`, 3 s later a real re-send, one key, charged once, `replayed` in the journal. **Credit, it holds.** (b) `orders` cannot exceed 1: the server keys them by cart. "No second order" is the server's. (c) `honest` compares two fields and accepts a mark even at the end: `an-actor-disposed...` shows `revision: 1` against 2, called honest. (d) `atom` proves IndexedDB's contract on its own keys, not that our batches are whole across our two transactions; H1 is that gap. (e) `NotSent { Restored }` "never occurred": with no wait before the click, **13 of 120** cycles ended in it, 0 charges, truthful message. **Credit too.** It can only come from a SIGKILL or a race: a plain and an awaited transaction are issued in one task. Design 2.8.11 says "one capture": one transaction would remove the window and H1's first half. Worth asking.
- **M5. A busy record asks for a repair per frame. r6-pd [ran].** 10 patch frames faster than a repair: **11 repair requests, still marked, prediction still showing; round 5 sent 1.** Each answer is `older`, `landedAt > start`, so `again`. No bound overall, since each restart re-arms `repairMs`. A re-send on that record waits `on: repair` for as long as the feed is hot. **Proposal:** a repair that finds the record moved does not ask again unless it is older than what a mark needs; or a count of restarts, then `RepairOverdue`.
- **M6. The sync-engine claim is narrower than it reads. r6-other [ran, read].** Not faked: it runs on the real core through the Harness, and RESULTS lists what it does not show. **"No core change beyond D81" does not follow,** because a real engine needs what the spike did not try:
  - **Protocol.** Zero's confirmation is `lastMutationIDChanges: Record<clientID, number>` (`zero-poke-handler.ts:301-375`), a number per client, in order. The spike's `lmid` is a list of Attempt ids that its own test copies from the request. A random `att-uuid` cannot map to a monotonic per-client counter, and `Env.id` belongs to the host. **A seam for issuing mutation ids is missing.**
  - **Durability.** `Module` has `init()` synchronous and `save` per Attempt. There is no durable slice and no async load. Persisted, reloaded [ran]: record gone, cookie back to 0, next live poke `PokeGap`. Replicache keeps pending mutations atomically with client state; an engine's own store cannot share a transaction with Flow's ack, so **two outboxes means a tear**, which is convergence-5's (b), now with a shape.
  - **Reads.** `read(s, ref)` by record. Zero and TanStack DB read by query over an external mutable store (`db/.../collection/sync.ts` `begin/write/commit`). A module's slice is pure and part of the world, so an engine either copies its rows in (`{ ...s.base }` per poke) or breaks replay. **I think this one is the real blocker** [reasoning].
  - **Bounds.** A success and no poke for an hour: `predicted: true`, 0 timers [ran]. `repair.run("pull|N")` borrows a closure with another meaning. `overlay` stores a field function as a value [read].

  Answer: plausibly behind the seam for a server-order module of this size; **for Zero or TanStack DB, unproved, and on this reading a core change.** The owner's "test bed" needs one real integration, TanStack DB first, in a day, before the seam is frozen.
- **M7. Tests and citations. r6-other [ran, read].** Vacuous: `a-deadline-is-armed-only-while-a-pull-is-out-T1` advances 29 s, below both deadlines, so `s-idle-armed-when-stopped` survives. `three-silent-reads-make-one-lost` asserts `PageSilent >= 1`, never a `Lost`. `the-rekeyed-lane-is-what-a-guard-reads` reads the disk, no guard. `a-repair-obeys-the-judge`'s `yes` is weak; the `eq` beside it carries it. Real survivors, no case reaches them:
  - T1, T2: `s-pagesilent-not-stall`, `s-stall-any-repair`, `s-complete-resets-no-stalls`.
  - T6: `s-latest-keeps-all`, `s-weaker-is-newer`, `s-reset-hidden`, `s-down-merges-one`, `s-ping-always`.
  - T7: `s-lose-no-gap`, `s-release-no-gap`, `e-gap-other-machines`.
  - Table: `e-against-removed-false`, `e-older-repair-stale`, `e-version-carried-still-claims`, `e-stub-unbounded`, `e-stub-since-newest`, `e-declared-nan-zero`. **No case runs a declared comparator function.**
  - Driver: `d-report-every-failure`, `d-unencodable-deletes` (a record that will not encode would be **deleted**), `d-decode-throw-keeps`.
  - Gate: `g-key-unchecked`.

  Sampled citations: `REV6-H2` cites rule 32 and asserts no mark directly. `REV6-H1`, `H3`, `H5`, `M8`, `L3`, `TEAR` are accurate.
- **M8. A quarantined lane forgets its hold. r3 [ran].** Held on `charge`; lane record fails `validLane`; reload: `RecordQuarantined`. `Go`: **a second Attempt beside the first, both undecided.** Named by an issue, and the same shape as round 5's H5. `orphaned` (P19) is unbuilt. **O5's "no partial restore" against rule 46:** per record is right, the design wins and one bad record must not cost a scope. But a quarantined lane must still block its id. **Proposal:** keep its id as a tombstone hold that refuses a mint, until an owner clears it. The id is the record's key, so it survives what the body does not.
- **M9. An ending refused for encoding is a lost completion. r3 [ran].** Persisted machine, success with a value holding a bigint: `InvalidTurn` twice (D50), state stays `A`, **lane already gone from disk**. Reload: `A`, no waits, nothing owed. `Go` mints again. The server did it. **O5 "encoding never fails the turn" against D57's refusal: O5 is right for endings** [reasoning]. Refusing cannot undo the world, and a hold survives only if the batch is skipped. **And round 6 does not follow O5's other half:** `encodeAll` skips one record, not the whole batch. A verified value mutated later: actor stays on old leaf, lane's removal lands, **restored `A`, no lane, no waits, for good** [ran, contrived trigger, r6-real part]. **Proposal, one rule:** a turn never refuses for encoding once Schema types memory; the driver skips the whole batch and keeps the last good capture, with an issue. That also removes `admitted` from every turn. Flip: keep D57 for sends only, which is two rules.
- **M10. A gap can leave a record silently wrong. r5 [ran].** Feed dies, record deleted meanwhile, refetch answers without it: record shows, unmarked. Refetch **fails**: `ok ? onAnswered : s`, no retry, no mark, ten minutes later still old. `current(r)` (T7) is what the design wants and it is unbuilt, so round 5's M10 understated this. `the-feed-dies-and-comes-back` patches a title and its reread succeeds.
- **M11. M11 is half fixed. r5 [ran].** `plain` copies only a plain object. A class instance with a throwing own getter passes, then the spread throws a plain `TypeError` outside `Refused`: **`Fatal`, the whole Runtime.** Contrived, but D65's sentence is "may not stop the core". One line.
- **M12. A partial read clears a doubt. r4 [ran].** Doubt on `archived`, repair hanging, a list projection `{ id, title, revision: 3 }` started later: `uncertain: false`, shows `archived: true`, server `false`, until the repair answers. If it never does, for good. Same root as H2: evidence decides about a field it did not carry.
- **M13. S4's number is real code, not this round's. r1-2 [ran].** See below.

## Low

- **L1. M1 is fixed; the case is wrong. r6-other [ran].** With `drainMs: -1`, which the case lacks: pulled ahead of turned **2 fixed, 7 with `m1-banks-credit`**. So the fix is proven and one option kills the mutant. T4 says 1: 2 may be my sampling, not resolved.
- **L2. r6-real [read].** `if (!lastFailed) retryN = 0` runs before an asynchronous failure can report, so on a real store backoff never grows: the whole record re-encoded every second, for ever, under quota.
- **L3. r6-real [read].** `disposeRuntime` does not call `flushCapture`, against convergence-6's table. `page.ts` flushes on `pagehide`, not on hidden as the plan says.
- **L4. H4 half. r6-other [read].** A bare function stays legal on input, as stated. `known` checks two levels only: a stray function in `domain.writes.x`, an `Op` or a `Node` seals without complaint, so "the next new closure cannot slip past" holds for streams and the domain's top level. `sealAll` overwrites duplicate ids. `d77-unknown-closure-ok`'s false kill confirmed in the output.
- **L5. r6-pd [ran].** Number, then string, then an older number: all apply. `flow check` can say so once versions are declared on the entity.
- **L6. r6-pd [ran].** No version, a read after a write from a lagging replica: a removed record is back, unmarked. `pastClaim` assumes read-your-writes. Not in D74's limits.
- **L7. Old rules unpinned. r1-2 [ran].** `t-overlap-ok`, `t-two-movers`, `d-restore-order`, `l-w-no-bound`.
- **L8. Two tabs. r6-real [ran].** Web Locks behave. Same intent, two tabs: **two charges**, B never read the disk. O6 states "no cross-tab exactly-once", so not a bug. Owner should know a duplicated tab during `UNSURE` is this. `page.ts` opens the database before the lock, against O7. **Multi-key atomicity:** no tear seen; it is IndexedDB's contract, and only per transaction (M4).
- **L9. r6-other [ran].** 37 `OLD-RULE` flags, `REV6-H4` and `REV6-L3` among them, on decisions round 6 itself replaced.
- **L10. r6-other [read].** `verified` is a module-level `WeakSet` on the step's path. Harmless while values are immutable, and deep-freeze shows they are. Note it for production: it is state outside the world.

---

## S4's number: the cause

**Both: real code, and a harness that shows it only by accident.** [ran]

The plain mean depends on **what ran earlier in the page**:

| Order, 6x, 1,000 actors | Round 6 | Round 2 |
| --- | --- | --- |
| Fresh page, first thing | 26-32 us | 20-22 us |
| `__run(1)`, `__run(1000)` at 1x and 6x, as round 2's S4 did | 31 | 20 |
| **S4 as `s4-run.ts` does it, `__grow` before 6x** | **595** | **624** |
| Ascending 1, 10, 100, 300, then 1,000 | 672 | 647 |
| Then 3,000 | 1,890 | 2,416 |

It is V8's object spread. `{ ...o, [k]: v }` on a 1,000-key object: **0.9-3.5 us at 1x while the site is warm on few shapes, 62-65 us after it has seen ten others; 6-24 us against 460-495 us at 6x.** The turn's `actors` spread goes megamorphic. **Round 2's 13 us was the lucky state, and round 2's code gives 624 us under today's order.** Not this round, not the drain.

**So what.** A real app has many shapes, so the bad number is the honest one: **about 60 us at 1x and 400-600 us at 6x per turn at 1,000 actors; 2 ms at 3,000**, click to settled 9.6-10.6 ms. Still inside a frame at 1,000. D37's "a persistent map pays" was argued from 19 us. **Proposal:** `actors` as a persistent map or per-key cell before production, since it is one field; and the bench runs each measure in a fresh page, plus once deliberately polluted, and says which.

**Is the bench honest and reusable?** Honest in what it states, including the coalesced timer that never fires. Reusable: `--runtime` works on round 2 and round 6. But no number in its table can be compared across runs without knowing the order.

---

## Round 5's findings, really fixed?

| Finding | State |
| --- | --- |
| H1 | Fixed for its traces, with reads from their start [ran]. **Door left: a claim or tombstone with a partial frame, H2 A2 and A4** |
| H2 | Three traces fixed. **Renamed: H2, M12** |
| H3 | Fixed. L5 stated |
| H4 | Fixed for streams [ran]. Half: L4 |
| H5 | Fixed for held, acked and parked. **Same shape by another door: M8** |
| H6 | Fixed for what it named. **Renamed: H2's alphabet and two-field oracle, A3's fake** |
| H7 | Fixed in code; deadline rows unpinned (M7) |
| M1 | Fixed; case wrong (L1) |
| M2-M4 | Fixed [ran] |
| M5 | Fixed. T6 is runtime code; signal groups unpinned |
| M6 | Moved, measured: M3 |
| M7 | **Fixed, with a new double charge: H1** |
| M8 | Stand-in; M9 remains |
| M9, M12 | Fixed |
| M10 | Understated: M10 |
| M11 | Half: M11 |
| L2-L7 | Fixed. L1, L8 stated |

## Counts by age

| Age | High | Medium | Low | Total |
| --- | --- | --- | --- | --- |
| r1-2 | 0 | 1 (M13) | 1 | **2** |
| r3 | 0 | 2 (M8, M9) | 0 | **2** |
| r4 | 0 | 1 (M12) | 0 | **1** |
| r5 | 0 | 2 (M10, M11) | 0 | **2** |
| r6-pd | 1 (H2) | 1 (M5) | 2 | **4** |
| r6-real | 2 (H1, H3) | 4 (M1-M4) | 3 | **9** |
| r6-other | 0 | 2 (M6, M7) | 4 | **6** |
| **All** | **3** | **13** | **10** | **26** |

M8 and M9 are not lane logic: they are the record gate and the turn gate at the persistence edge. M13 is a cost.

**Is the owner's premise holding? Yes, for the lane core, and now on real evidence.** No High in code older than round 6. The lane table, step and fence drew no logic finding, on a real disk, with a real re-send and a real `NotSent` I reached and the builder did not. 17/20 mutants on old core, and the 3 survivors are old rule pins. **The counts follow where I looked,** and I looked hardest at new code. **It does not hold for the edge:** 19 of 26 findings are in round 6's new code, as you would expect, and they are not small.

**Is a clean core review close?** On the lane core, step, turn and fragments: I think the next review of those is clean apart from tests. On core plus driver: one round, if H1, H3, M1, M2, M9 are done together, and only if the fake learns late failure, since H1 was invisible to it. **On the store: not close, and it should not be a condition.** It is optional.

## What round 7 must decide, in order

All proposed.

1. **H1 first, today.** Per-key issue number, late failure in the fake, real abort and quota in the harness. Small, and the worst shape.
2. **Owner: H2's options.** A, B or C. Redesign from scratch from every trace, with partial evidence in the fakes, a real server that sends patches, and a whole-record oracle first.
3. **Owner: M9.** O5 or D57. It decides what `admitted` is, and the typed front end's memory Schema must know before it is designed.
4. **Owner: M2.** Queue with a bound, or `ActorAbsent`. Changes 2.10.17.6.
5. **M1:** lanes flush now, memory coalesces. Then rerun the kill table, expecting `PLACING` near 0.
6. **H3:** strict marker before ready; oracle `charged && no lane`; remove the harness's sleep for good.
7. **Should a first send's capture and ack be one transaction?** Design 2.8.11 says one capture. M4 (e).
8. **M8:** a quarantined lane holds its id. **M13:** `actors` map, bench in fresh pages.
9. **Typed front end,** with `flow check` and static `flow explain`.
10. **One real engine, TanStack DB,** a day, before the seam is frozen (M6).

## The production question

**Still worth a prototype:**

- The entity confirm path (H2), redone once with partial evidence.
- The real-engine seam (M6): a day. Its answer can change `Module`.
- The typed front end: nobody has produced `Compiled` by anything but hand.
- A phone. Every number here is an SSD and a CDP throttle.
- Chunks' restore (M3), only if 10,000-message memory is a real requirement.
- Real quota, refusal and hung read. Part of H1's harness.

**Can go straight into production code against this suite, after 1-3 above:**

- Lane table, `Phase`, step, fence, dispatch, `inc`, the turn, reads, timers, publication, fragments.
- Rule tables T1-T5. Sessions are table work; pin what M7 lists as you port.
- `seal`.
- The write-ahead record format and restore, with the driver's edge rewritten small against H1's invariant.

Production code needs the suite's missing pins (M7, L7), not a new design. **I would not wait for a clean store. I would wait for `Compiled`,** because porting the core against hand-written tables, then re-porting it, costs more than a round.

**Second author, on instruction, not run.** The last ran in round 3 at 35/50. A number from someone with no prior reading would be worth more than this one, and the owner should weigh it.

**What about `Compiled` looks most likely to change, most likely first [reasoning, read]:**

1. **`domain` is per machine, and the data is per entity.** `version(ref)` returns a field name from a string it must parse; `versionOrder` per machine, so two machines can disagree on one record; refs are `Entity|key` strings built by closures. Expect a top-level entity table, with Schema, whole or partial on `Carried` (H2), and `repair` per entity.
2. **Bare functions and Slots side by side.** `StreamSpec`, `reads`, `listens`, `confirms`, `repair`, `Op.commit`. The seal is a workaround for this. Round 7 removes it.
3. **`commit: Effect<_, _, never>` and fixtures' `make(api)`.** Dependency injection by parameter. The design's adapters are services: `Effect.map(TicketChannel, ...)`. `Compiled` must carry a requirement and the Runtime a layer. Touches `driver.fork`, `FeedQueue`.
4. **`memory.restore` and `encodable`** go to Schema. Lane keys decode by contract `input` pick, independent of the machine (rule 46), which `Op` cannot express.
5. **Additive for `flow check`:** `internalEvents` (rule 47), fragments' declared ports, callbacks and exits, memory visibility, event schemas. `flow explain` has what it needs for targets and tokens. Guards and `input` stay opaque, so static explain stops at their `at.path`.
6. **String names:** `uses`, `Member.module`, `position`, `fills`. Will become references, and `flow check` needs them to.

**Stable, I expect:** `Alternative`, `Node`, `Placement`, `Member`'s verbs, `Op.outcomes`.

## Not checked

- Power loss, Safari, Firefox, a phone, a real quota failure (the abort stands in), a hung real read, `pagehide`'s flush, wall-clock jumps, Overflow on a real socket.
- H3's cause in Chrome. Its rate on other platforms, or with a database older than a few seconds but younger than 1.2 s.
- H2's A3 on a real server: `server.ts` sends whole rows and sleeps before applying. Forged answer on the fake, which I judged causally fair.
- M1's and M13's proposals, H3's marker: not run. H1's fix: run on the fake only, not on real IndexedDB.
- Builder's mutants rerun; `nub run verify`; lint; bundle size; S3's store table beyond the runtime rows.
- A real Zero or TanStack DB integration. M6 is reading.
- `.alsoChanges`, `basedOn`, cache, `current(r)`, T8: not built. Two feeds on one entity: read only.
- Citation sampling is thin, about ten rows. Deep-freeze covers plain objects only.
