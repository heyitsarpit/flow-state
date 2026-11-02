# Round 6: placed evidence, a real disk, a real server

Status: proposed, throwaway. Ran on 2026-11-02, Bun 1.4.2, Effect 4.0.5, Chrome 146 headless over raw CDP, this Mac. Decisions: [../convergence-6.md](../convergence-6.md). Outputs here: `suite-output.txt`, `mutants-builder.txt`, `search-*.txt`, `bench-r5.json`, `bench-r6.json`, `s4-r5.json`, `s4-r6.json`, `reality/results.json`; red: `../conformance/red-round-6.txt`.

**Verdict.** **The step, the fence and `Phase` were not implicated, and real IndexedDB plus a real server did not implicate them either.** 96 real kills: 0 torn batches, 0 acknowledged writes lost, 0 double charges, 0 Fatal. The write-ahead protocol held; its cost and interface moved to the driver, as the review predicted. The entity confirm path was redone from requirements and held eight real traces and the repaired searches. **Nobody independent has read it, and the same family has beaten each earlier version:** treat it as one round old. Streams on a real socket got one reconnect trace and no overflow.

**Read first:** "What reality overturned", then "Owner's calls", then M1 under Survivors.

## What ran

| Item                                      | Result                                                                                                                                                                                                   |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Red, round 5's code on the repaired suite | 33 of 510 cases failed; SEARCH-LISTEN with no first load failed at depth 3, version and none                                                                                                             |
| Scenarios                                 | **517/517**, 9.2 s, 241 MB. Unlogged changes: none. Runner flag `--round 5`, because SCENARIOS.md's old round 6 rows (`STREAM-*`) are unbuilt; so the `REV6-*` rows' cites are not cross-checked         |
| Deep-freeze                               | 517/517. LISTEN version no load depth 6, FRAGSTORE row depth 6, SESSION depth 5, 30 s each. No failure                                                                                                   |
| Builder mutants                           | **154/182, from the output file's last line. Not an independent number.** One kill is false: `d77-unknown-closure-ok` is a crash from my edit. 21 of round 5's 126 name replaced code: `replaced-r6.txt` |
| Format                                    | `oxfmt` defaults: `vp` is not on the path. **Not the repo's config**                                                                                                                                     |
| Lint, types                               | `oxlint` defaults on `round-6` and `conformance`: see output. Not chased. `tsc --strict` on `adapter.ts`'s graph: none in those folders                                                                  |

| Search                            | Limit        | Depth complete | States                 | Result                                                                    |
| --------------------------------- | ------------ | -------------- | ---------------------- | ------------------------------------------------------------------------- |
| SEARCH-PAY, pins                  | 95 s         | 8              | 33,072                 | 26 classes (round 5: 25, at less depth), no unpinned. Inconclusive past 8 |
| payFixed                          | 45 s         | 8              | 9,037                  | The same `... place.ok Start PayRequested` classes as round 5: the fake   |
| ODD                               | 60 s         | 3              | 551                    | No failure                                                                |
| ODD-ALL                           | enumerated   |                | 432 scripts            | No failure                                                                |
| CROSS                             | 70 s         | 6              | 81,634                 | No failure                                                                |
| LIKE                              | 45 s         | 6              | 58,518                 | No failure                                                                |
| FRAG                              | 50 s         | 7              | 43,087                 | No failure                                                                |
| FRAGSTORE row, noVersion, nothing | 50, 30, 30 s | 7, 6, 6        | 50,339, 31,908, 31,497 | No failure, with reads from their start                                   |
| SESSION                           | 70 s         | 5              | 72,595                 | No failure                                                                |
| REPAIRING                         | 50 s         | 5              | 74,966                 | No failure                                                                |
| **LISTEN version, boot loads**    | 45 s         | 6              | 47,452                 | No failure, reads from their start                                        |
| **LISTEN none, boot loads**       | 45 s         | 6              | 57,635                 | No failure. Excuse narrowed to the stated limit                           |
| **LISTEN version, no first load** | 45 s         | 6              | 52,424                 | No failure. **Found two bugs of mine first, below**                       |
| **LISTEN none, no first load**    | 45 s         | 6              | 61,410                 | No failure                                                                |

All stopped by time, none closed.

## The review's Highs

| Id  | State                | How                                                                                                                                                                                                                                           |
| --- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1  | fixed, ran, real too | D74, D76: stubs and claims                                                                                                                                                                                                                    |
| H2  | fixed, ran           | D74. Each trace is a case. The partial frame rests on the fixture's shape                                                                                                                                                                     |
| H3  | fixed, ran           | D75: strings equal or different unless declared. Limit: an ETag out of order is the unversioned limit                                                                                                                                         |
| H4  | fixed, ran           | D77. **Half:** a bare function is still legal on input until the typed front end                                                                                                                                                              |
| H5  | fixed, ran           | D78                                                                                                                                                                                                                                           |
| H6  | fixed                | `{ atStart }`, no first load, field-by-field excuse. **The first version of my own repair shadowed `first`, so "load" also ran no load; the search showed identical counts and I caught it.** Depths for "boot loads" above are after the fix |
| H7  | fixed, ran           | D79, two T1 rows, proposed                                                                                                                                                                                                                    |

M2-M5, M7, M8 (a stand-in), M9, M11, M12, L2-L7 as convergence-6. M1 below. M6 under costs. M10, L1, L8 stated, not fixed.

## What reality overturned

| The fake said, or we assumed                    | Reality                                                                                                                                                                                          | Consequence                                                                                                                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A request is sent once per send                 | **Chrome sent a POST twice by itself** on a connection reset before any response byte: `archive:applied, reset, archive:arrived, archive:replayed`. The machine saw one `success` and never knew | Plan silent. **The idempotency key is load-bearing even with no retry and no reload.** A write with no key would double-apply, invisibly. A fake can't say this unless told |
| `now` and `id` survive a process                | The fake's clock and id counter live outside the "process". `performance.now` restarts and a counter repeats, so a stored `dueAt` is wrong and an Attempt id could collide                       | **Host contract, plan silent.** Real host: wall clock, random ids. A wall clock jumps; not tested                                                                           |
| `load` is synchronous                           | Promise. Inputs now wait for boot                                                                                                                                                                | Against 2.10.17.6's `ActorAbsent`: flagged                                                                                                                                  |
| A kill loses little                             | With `captureMs: 100`, `PAID` came back as `PLACING` on 10 cycles: the actor and the lane's removal share a plain batch. Pay reconciled to `PAID` every time, no second order                    | Safe by the protocol, and visibly costs a reconcile. A machine with no reconcile sees an older state after a kill                                                           |
| A lost response is a failed call                | Headers can arrive, then the body dies: `fetch` resolves `ok`, `json()` rejects. A 204 has no body at all                                                                                        | Adapter's job. Recipes must show it                                                                                                                                         |
| A pushed source is a thing with a queue         | `EventSource` reconnects itself. T1 owns reconnects, so the adapter closes it on error                                                                                                           | A recipe line                                                                                                                                                               |
| `Feed.callback` could be a value                | Authors `.pipe` it                                                                                                                                                                               | A service, `FeedQueue`                                                                                                                                                      |
| Whole-record encoding might be IndexedDB's cost | **Mostly the encode:** at 10,000 messages, 6x, JSON 14 ms a commit, chunks 0.8 ms; a put of the string about 5 ms                                                                                | Below                                                                                                                                                                       |

**Not overturned:** multi-key atomicity, Web Locks, the protocol, the judge's answers on real orders, the step. Expected to fail and did not: real out-of-order lists, subscribe-then-fetch, a slow list beside a 204.

## Real persistence

| Kills                              | Cycles | Torn | Acknowledged and lost |
| ---------------------------------- | ------ | ---- | --------------------- |
| Renderer crash, relaxed; strict    | 14; 14 | 0; 0 | 0; 0                  |
| SIGKILL of Chrome, relaxed; strict | 14; 14 | 0; 0 | 0; 0                  |

Ten keys in one transaction. "Acknowledged" was told to the server after `oncomplete`. **A process kill is not power loss:** strict and relaxed cannot be told apart here. `strict` for awaited writes is kept on the plan's word, not on evidence.

**Pay, unchanged, on IndexedDB and a real server: 40 cycles,** 20 by renderer crash, 20 by SIGKILL, at offsets including the click itself. 0 double charges, 0 Fatal, 0 unsettled, 0 issues. Restored `UNSURE` 18, `PLACING` 10, nothing on disk 12. Final `PAID` 28, nothing 12: no request had left in those 12.

**Not reached:** the window where the capture landed and the acknowledgement did not, so `NotSent { Restored }` never occurred on real IndexedDB. A real re-send of Pay never occurred: every kill landed before or after the server's answer, and `intent` decided it (0 replays in Pay; replays ran in the desk traces). Refused and quota writes on a real store: failure paths ran on the fake only.

**Two tabs.** Web Locks available. A owner; B no lock, runs empty, `SecondTabNoPersistence`; A crashes, its lock goes, a new tab owns and reads A's record while B is still open.

**Desk on real fetch and SSE: 8 traces, all honest at the end:** first load with a feed open; a 204 beside a slow list; two lists out of order; a body that dies then a replay; the browser's own replay; dispose aborts a read and not a write (server journal agrees); a feed that dies and comes back; 40 frames beside a rename. Rereads after a disposed actor: M10 still shows.

### Whole record or something smaller (S3)

Commit at the store, median ms, relaxed, this Mac. `sync` is the main-thread part, including encode.

| Messages | Rate | JSON sync, commit | Memoised pieces | Structured clone | Chunks | Append log |
| -------- | ---- | ----------------- | --------------- | ---------------- | ------ | ---------- |
| 1,000    | 1x   | 0.3, 0.3          | 0.1, 0.2        | 0.2, 0.3         | 0, 0.1 | 0, 0.1     |
| 10,000   | 1x   | 2.5, 3.1          | 1, 1.6          | 1.7, 2.3         | 0, 0.1 | 0, 0.1     |
| 1,000    | 6x   | 1, 1.6            | 0.2, 1.2        | 1, 1.6           | 0, 0.8 | 0, 0.1     |
| 10,000   | 6x   | 12.2, 14.1        | 6.6, 8.2        | 10.2, 12         | 0, 0.8 | 0, 0.5     |

Strict against relaxed at 1,000, 1x: 0.5 against 0.3. An SSD, no phone.

Runtime on IndexedDB, 60 values a second, turn median ms:

| Size, rate | `captureMs` 0 | 100 | 500 |
| ---------- | ------------- | --- | --- |
| 1,000, 1x  | 1.2           | 0.1 | 0.1 |
| 10,000, 1x | 7.8           | 0.4 | 0.4 |
| 1,000, 6x  | 3.3           | 0   | 0   |
| 10,000, 6x | 37.8          | 0.2 | 0.2 |

**Chosen, proposed:** coalesce at 100 ms, keep the whole record. **It moves the encode, it does not remove it:** at 10,000 and 6x each flush is about 35 ms of encode plus 5 ms of put, every 100 ms under a steady feed: about 40% of a main thread, by multiplication [reasoning]. **So chunks, or an adaptive interval, are owed for memory that large.** Chunks measured at the store only, restore not built. 0 long tasks seen; under 50 ms each, so the observer cannot see these.

## Benchmarks: `conformance/bench/`

`bun conformance/watch.ts -- bun conformance/bench/main.ts --runtime ../round-N/adapter.ts`, `s4-run.ts` the same. S4 moved there from `round-2/`. Rounds 5 and 6 were both measured today. **Round 2's numbers are old,** from its own `measure.txt` and RESULTS, other fixtures' memory.

| Measure                                                                       | Round 2 (old) | Round 5                                                               | Round 6                   |
| ----------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------- | ------------------------- |
| Plain turn, 1 actor, us                                                       | 0.9           | 2.42                                                                  | 2.52                      |
| 1,000 actors                                                                  | 19.18         | 22.36                                                                 | 22.82                     |
| 10,000 actors                                                                 | 215.78        | 251.36                                                                | 251.63                    |
| Seal, Pay fixture, us, make included (make 0.4)                               |               | 10.7                                                                  | 11.1                      |
| Seal, desk, us (make about 4)                                                 |               | 8.5                                                                   | 9.1                       |
| One value, not persisted, 10,000, ms                                          |               | 0.02                                                                  | 0.022                     |
| One value, persisted, at once: 100, 1,000, 10,000, 50,000 ms                  |               | 0.98, 1.79, 9.4, 46 (review: 0.23, 0.77, 7.4, 35, differently shaped) | 0.50, 0.92, 4.7, 23.5     |
| Same, coalesced, encode **not** in this figure: the bench's timer never fires |               | same as at once                                                       | 0.013, 0.019, 0.082, 0.63 |
| Bundle gzip KB: core with driver; entities; sessions                          |               | 19.2; 4.2; 5.6                                                        | 21.4; 5; 6.8              |
| S4 click p99, 1x and 6x, 1,000 actors, us                                     | 200; 100      | 200; 1,100                                                            | 200; 900                  |
| S4 click to settled median, ms, 6x, 1,000 actors                              | 4.6           | 4.9                                                                   | 5                         |
| S4 plain mean, 6x, 1,000 actors, us                                           | 13            | 395                                                                   | 389                       |
| S4 persisted value at once, 10,000, 1x; 6x, ms                                |               | 11.3; 68.3                                                            | 5.9; 34.8                 |
| S4 persisted value coalesced, 10,000, 1x; 6x, ms                              |               | 11.2; 70.2                                                            | 0.1; 0.3                  |

**Unexplained:** the plain mean at 6x and 1,000 actors is 30x round 2's, and non-linear (16 us with 1 actor). It is not this round's. My guess is the drain yielding with a long inbox; not investigated. **A turn is still O(actors):** the `actors` spread, 250 us at 10,000.

The review's reading of S4's old hang (M6) was not directly rerun, but growth at 1x and 6x above is linear, as it said.

## Findings

### Plan right, code wrong

| Age                      | Finding                                                                                                                          |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| r5                       | H1-H7, as reviewed                                                                                                               |
| r6, mine, caught at once | An older stub overwrote a newer one; a frame with a queued write bypassed its stub (LISTEN no load); a search parameter shadowed |
| r6, mine                 | `api.socket`'s first form as a value broke every piped fixture: 46 cases                                                         |
| harness, mine            | Unclosed targets in the kill loop: see limits. A control word `reset` that reset the server by accident; harmless, fixed         |

### Plan wrong (proposed)

| Id        | Finding                                                                                                                              |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| T1        | Two rows needed: `failing` out of band in `Repairing`, a page deadline. Without them a wedge or a false `Silent` loop. Owner's table |
| 2.10.17.6 | `ActorAbsent` during a held restore: queued instead. No bound on a hung read yet (O5 wants one)                                      |
| D67       | Replaced by D74, D75. **Owner's**                                                                                                    |

### Plan silent

Host contract: wall clock, ids unique across boots. A browser may repeat a POST. Which durability an awaited write needs. A coalesced capture may restore an earlier leaf than the user saw. Stubs: a bound for frames about unheld records. Chunks at large memory.

### Owner's calls, flagged and not decided

D67's replacement (D74, D75; option B, a read's snapshot, stays additive), T9 as built, D24, Pay's memory, T1's two rows.

## Could a sync engine sit behind the seam?

**Behind the module seam, yes on what ran; behind the judge, no, and it should not.** `engine-spike.ts`, 123 lines, cookie, LMID, atomic pokes, `blocks: false`, on the suite's Harness, 4 cases. **No core change beyond D81's `store` and `publish`.** It shares nothing with `entities.ts`. Not shown: its slice across a reload, marks, a real engine's protocol, and convergence-5's (a) one cut: a fixture's `c.rec` goes blank, since the Harness reads `entities`.

## Survivors (28), by reading

| Mutant                                                                                | Reading                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`m1-banks-credit`**                                                                 | **Real. REV6's M1 case passes with or without the fix, so M1's fix is unproven.** Not resolved                                                                                                                                                                                                                                                                                                             |
| `d74-repair-older-no-again`, `d74-equal-gone-after-is-older`, `d74-remove-no-claim`   | Real gaps in the new table: no case reaches these rows                                                                                                                                                                                                                                                                                                                                                     |
| `d79-page-deadline-not-disarmed`, `d79-idle-while-stopped`, `d79-pagesilent-no-stall` | Real. So the "three stalls, one Lost" case does not pin T2 row 6, and the T1 literal deadline is not pinned                                                                                                                                                                                                                                                                                                |
| `t6-down-hidden`, `t6-weaker-upgrades`                                                | **Signal groups are built and unpinned**                                                                                                                                                                                                                                                                                                                                                                   |
| `l5-module-timer-unguarded`, `d80-retry-overwrites-newer`, `d80-cycle-passes`         | Real. A cycle now fails at the driver, named, not at the gate                                                                                                                                                                                                                                                                                                                                              |
| `d80-persist-off-ignored`                                                             | The fake has no second tab. Ran on real Chrome only                                                                                                                                                                                                                                                                                                                                                        |
| `d74-early-is-newer`, `d74-read-ignores-claim`                                        | Equivalent by reading: no start, and a landing is never before its claim. The lines could go                                                                                                                                                                                                                                                                                                               |
| 13 from earlier rounds                                                                | As round 5: `d57-valid-leaf-unchecked`, `l6-*`, `r54-facts-before-reset`, `m3-*`, `t1-member-notice-at-tail`, `m5-end-drops-queue`, `l7-lose-keeps-moving`, `s-latest-down-keeps-confirmed`, `d65-raise-key-unchecked`, `h5-frozen-adopts-at-rebind`. **New: `h2-lane-id-unchecked`**: L3's check of the record key sits beside it. `m5`, `l7` deserve a look now that the review says they have live rows |

## Findings by age

| Age of the code at fault | Review High | Review all | New this round                                                 |
| ------------------------ | ----------- | ---------- | -------------------------------------------------------------- |
| r1-2                     | 0           | 3          | 2 (the fake's clock and ids across a process; a host contract) |
| r3                       | 0           | 2          | 0                                                              |
| r4                       | 0           | 3          | 0                                                              |
| r5 gate, judge           | 5           | 11         | 0                                                              |
| r5 streams               | 2           | 9          | 1 (`Feed.callback`'s shape)                                    |
| r6                       |             |            | 3, caught at once                                              |

**Decisions overturned this round:** D67 (r5, owner's). Changed: D65, D68, D26's encoding point. **From rounds 1-3 no logic decision.** The lane table, step and fence drew nothing, and now on a real disk. **That is the strongest evidence yet, and it is one builder's.**

## Costs

| Part                                           | Round 5   | Now        |
| ---------------------------------------------- | --------- | ---------- |
| Step, turn, world, seam, hooks, gate, `inc.ts` | 2,904     | 3,065      |
| Lane                                           | 571       | 571        |
| Reads, timers                                  | 78        | 78         |
| Write-ahead                                    | 377       | 421        |
| Publication                                    | 102       | 102        |
| Driver                                         | 275       | 370        |
| Entities                                       | 703       | 841        |
| **Core + driver + entities**                   | **5,010** | **5,448**  |
| Sessions + `feed.ts`                           | 916       | 1,148      |
| **With sessions**                              | 5,926     | **6,596**  |
| Engine spike, adapter                          | 235       | 123, 238   |
| Reality harness, bench (throwaway)             |           | 1,065, 604 |

Formatted, comments in.

## Rules broken

- **D67:** replaced, flagged. **T1:** two rows added. **T9:** as round 5. **2.10.17.6:** queued, not `ActorAbsent`.
- **O5 "no partial restore":** per record, as the design's rule 46 says; the design wins. **O5 "encoding failure never fails the turn"** against D57's refusal: kept the refusal.
- **T6:** built except the `latest` row's case: none runs. A full queue's `emit(signal)` read as a merge; "same" in the table is ambiguous.
- **Round 2's folder edited:** S4 moved out, a pointer added, as asked.
- **M10, L1, L8:** stated, not fixed. **`.alsoChanges`, `basedOn`, cache, `current(r)`:** still not built.

## Limits

**One breach of my own guard.** The first kill loop left targets open; Chrome's process tree summed to 1,870 MB, and the guard killed it at its 1,800 limit. The sum counts shared memory repeatedly, so real use was lower, but it is the number I have. Fixed by closing targets; later peak 942 MB. Mutants' watchdog kills at 1,409-1,527 MB by design. A browser is necessarily a second process tree next to Bun: `watch.ts` tracks only Bun, `cdp.ts`'s guard tracks Chrome. Throwaway profiles removed; Chrome closed each run. No broad kills.

## Not run

Safari, Firefox, a phone, power loss, quota, real write refusal, a hung real read, `NotSent { Restored }` on real IndexedDB, a real Pay re-send, Overflow on a real socket, `pagehide`'s flush, wall-clock jumps. `nub run verify`. A second author, on instruction. The typed front end, next round. An independent review of round 6, owed. Every search past the depth stated.
