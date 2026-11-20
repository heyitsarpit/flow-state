# Round 7: mid-round review

Status: advice. **Everything here is proposed.** Reviewer: Opus, did not build round 7. Snapshot `4420ed87`. `git diff 4420ed87 b61a26d6` adds only `STATUS.md` and lines in `mutants-builder.txt`, so every finding applies to both. Marks: **[ran]**, **[read]**, **[reasoning]**. Ages: r1-2, r3, r4, r5, r6, r7. Experiments ran under `watch.ts`: Bun peak about 300 MB, Chrome 146 at 128 MB.

## Verdict

**H1, M1 and D93 are real progress, and the builder's status is honest. But the persistence edge is becoming a pile of cases, and it still has no single ordering rule.** D94 fixed a real double path and opened a new one: a released hold comes back from disk [ran]. D89 keeps back the *whole* batch, so one actor's `bigint` stops every other actor's writes, and their completed charges come back held [ran]. The memory-ahead-of-lane bug (E2) reproduces on real IndexedDB, 1 of 72 [ran], and leaves a shopper on "Still confirming with your bank…" forever. A typed `Schema.Date` field loses the whole actor on every reload [ran]. The biggest money assumption is outside the driver: the idempotency key is `attempt.id`, so **any** lost or unread record gives a second key. A frozen tab reproduces that with one visible tab: 2 keys, 0 issues [ran].

The typed path resembles the design. `flow check` is real, and it passes Pay with six known bugs. The suite is 545/545 and my mutants are 27/45 (60%). 545 says little about D80, because the suite runs at `captureMs: 0` (`drive.ts:190`).

## Reproduced

| Item | Claimed | I got |
| --- | --- | --- |
| Suite | 545/545 | 545/545, 241 MB, 9.5 s [ran]. With `--swap`: 545/545 [ran] |
| Sweep at 5 s | 58 fail | 58 [ran] |
| H3 counts | marker 3/240, no marker 2/240, reopen 2/180 | `results.json` agrees [read]. Not rerun |
| E2 | open, on the fake | Yes, and on real IndexedDB [ran] |
| `d94-does-not-wait`, `d94-owed-not-carried` survive the suite | yes | Yes. **`flush.pay.tight` does kill them, in 30 s** [ran]; it is in no gate |
| Web Lock race after a crash or reload | not claimed | 0/45 crashes, 0/20 reloads, this machine [ran]. A fear I had that did not hold |

---

## Part 1: assumptions, sorted by harm

| # | Assumption | Where | When it is false | What happens | Tested? | Severity |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | A tab that did not read the disk may still send a persisted write | `driver.ts:70,430`, `page.ts:53-58` | Owner tab frozen (`Page.setWebLifecycleState`), new tab. Or a read past `bootMs` | **Real Chrome: second tab not owner, PAID, 2 keys for one intent, 0 issues** [ran]. Fake, bound: 2 keys, both undecided [ran] | Decided cost (O6, M2) with an unfrozen tab; frozen untested | High, money |
| 2 | A record, once written, is still there | `pay.typed.ts:73` (key is `attempt.id`), `reality/*` (no `storage.persist()`) | Safari's 7-day cap, eviction, H3's unexplained loss, a cleared site | Hold forgotten; new Attempt, new key; server sees a new charge [reasoning]. H3 is the measured form: 3/240 charged with nothing on disk [read] | No | High, money |
| 3 | The server honours a key for as long as a hold lives | `fake-world.ts:505` (once per key, for ever); hold has no age: `durable.ts:213` restores `sentAt: 0` | Stripe-style 24 h key expiry; retry of a hold 3 days later | Same key, charged again [reasoning] | No | High, money, limit |
| 4 | One actor's bad record concerns only that actor | `driver.ts:129-149,167-168,204` | Actor `a` holds a `bigint`. Actor `b`: Go, ack, ok | **`b`'s lane removal and memory never land, at 60 s or after hide. Reload: `b` is `U`, held, note gone** [ran]. Issue names `a` only | No: every flush search has one actor | High, lost data |
| 5 | Encode and decode are the same format | `driver.ts:136` (JSON) vs `typed/flow.ts:66-76` (Schema) | Typed `Schema.Date` or `Schema.Number` holding `NaN` | Written as an ISO string or `"$NaN"`, then **`RecordQuarantined`, whole actor gone, every reload** [ran]. `Schema.BigInt` is never written, so it triggers #4 [ran] | No | High for the typed path |
| 6 | A failed batch is known before the next batch goes | `driver.ts:162-187` | Batch N (actor W + lane) aborts, N+1 (actor W) issued first, kill | **Restored `W`/`PAYING`, no lane, no ending, no wait, no issue, for good. Pay again does nothing** [ran, fake]. **Real IndexedDB: 1/72, at 0 ms** [ran] | Search counts it as an "exception" | Medium: rare, permanent |
| 7 | What an awaited write holds is still right when it finally goes | `driver.ts:201-216`, `durable.ts:178` | D94 holds a re-send's capture; `Forget` releases and deletes; then the capture lands | **Zombie record. Reload: released hold is back, `U`** [ran] | No | Medium, r7 |
| 8 | Timers fire on time | `driver.ts:231`, `cdp.ts:57` | Hidden tab: throttled to about 1/min after 5 min; frozen: never [reasoning] | After hide, new memory waits on the timer: 4.9 s later still not on disk [ran]. Hidden is where most kills happen, so "5 s" is really "a minute, or unbounded" | **Every real run disables throttling** | Medium |
| 9 | A write at hide finishes | `driver.ts:233`, `idb.ts` | Reload at 10,000 messages 0/6; kill before hide 0/96 | STATUS measures it [read]. Mac, Chrome only | Yes, one browser | Medium, limit |
| 10 | D87's bound covers the disk | `page.ts:65-66` awaits `openDb` and `strictMarker` before `createRuntime` | `indexedDB.open` hangs or is blocked | No runtime at all, no bound, no issue [read] | No | Medium |
| 11 | A reload is not a failed attempt | Pay's `retryable({times:3})`, `durable.ts` capture on restore | One press, `place` on the wire, 4 reloads | STUCK, then `CheckAgain` reaches **`PLACING`, `place` held for good, charged, no order** [ran]. Pay's bug, but see H4 | No | Medium |
| 12 | Clocks move forward | `page.ts:41,44`, `durable.ts:308-311` absolute `dueAt` | Clock back a day, reload | Pay's 3 s reconcile waits a day [ran]. Past 2^31 ms `setTimeout` fires at once [reasoning] | No: the fake's clock only rises | Low to medium |
| 13 | Unreadable actor records are safe to replace | `durable.ts:255-263` vs D88's lanes | A newer release's record, then an old cached tab (rollback) | `ensure` overwrites it [ran]. D88 keeps lanes; actors are not kept | No | Low to medium |
| 14 | A plain write either lands at once or fails | `fake-world.ts:224-228`, `drive.ts:190` | A slow plain batch that succeeds | Never exercised. D94's common case, unanswered for a few ms, has no test [read] | No | Medium, test |
| 15 | One Mac and Chrome speak for browsers | `cdp.ts:7,57` | Safari, Firefox, phones. `durability: "strict"` is a hint; macOS `fsync` is not a full flush [reasoning] | Unknown | No | Medium, limit |
| 16 | A Web Lock exists | `page.ts:53` returns owner when absent | Plain http, old browsers | Two writers. `saved[id] === value` and the single load both lean on one writer [read] | No | Low |
| 17 | A quarantined lane's id survives | `lane.ts:509` | A release changes the key function | New id, no hold, second Attempt [reasoning] | No | Low |
| 18 | The world does not change after a turn | `gate.ts:93-100` shallow copy; D80 encodes up to 5 s later | An author mutates a nested value | Disk and live agree, on a cut never published [read] | Deep-freeze only | Low |
| 19 | `text()` succeeding means it round-trips | `gate.ts:38` | `NaN`, `Date`, class instance on hand-written memory | A number comes back as `"$NaN"` [ran] | Mutant survives | Low |
| 20 | D80's 5 s covers "plain memory" | STATUS on FRAG-10 | A leaf change, an armed deadline, an actor's first record | A kill loses all three; a deadline can vanish [ran] | Sweep only | Owner's question |

**Fix now:** 4, 5, 6, 7, 8. **State as limits, and put to the owner:** 1, 2, 3, 9, 15, 20. **Fix in the host contract:** 10, 16. **Not worth handling now:** 12's overflow, 17, 18, 19 (Schema encoding ends 19), 13 until a release story exists.

**One root under 1, 2, 3, 17:** the key is the Attempt, and the Attempt lives on the client. Proposed for the owner: a stable business key should be the documented form for at-most-once writes (`pay`'s key is `intentId`, and the fixture sends `attempt.id`), with a stated rule: *the client's record reduces duplicates; only a key the server can recognise prevents them.* It costs nothing in the runtime and it changes every money example. Prior art to check: Stripe, TanStack DB offline transactions.

---

## High

### H1. D89's skip is per batch, so one actor stops everyone. **r7** [ran]

```text
a: NoteBad (1n).  b: Note, hide  -> b's note not on disk.
b: Go, ack        -> lane on disk, actor still A.
b: ok, 60 s, hide -> lane still acked on disk.
reload            -> b is U, uncertain, note "". Issues: UnencodableValue only.
```

`driver.ts:189` says the lane-ahead case "cannot occur". Under D89 it does, because `carried` is `undefined` and the ack goes alone (`driver.ts:204,212`). It also contradicts the comment at `:190`: "another actor's stuck write holds nobody". **Implication:** a chat app's one `bigint` turns every actor's next completed payment into a hold, until the bad value goes. O5 decided a turn never fails; nobody decided this scope. Proposal: skip per actor. A two-actor search must exist; SEARCH-FLUSH cannot see this.

### H2. Typed memory reads with Schema and writes with JSON. **r7** [ran]

`Flow.initial(Schema.Date, new Date(0))`: live is a `Date`, disk is `"1970-…Z"`, restore gives `RecordQuarantined: memory this release cannot decode`. **All memory lost, every reload**, on a program the types accept. `NaN` under `Schema.Number` the same. convergence-7 says the memory Schema "is the encoder used by the driver"; it is not built. Typed Pay is safe only because its fields are JSON-shaped. Proposal: encode through the Schema, or `flow check` refuses a memory field that does not round-trip through JSON until then.

### H3. A persisted machine sends with nothing written ahead. **r6, widened here** [ran, real Chrome]

Round 6 L8 called two tabs a stated limit, and M2 accepts the bound's cost. I am not relitigating those. New facts: it needs only **one visible tab** (the owner frozen), there is **no issue**, only host evidence, and persistence stays off for the session. Question for the owner, not a fix: in a tab without persistence, should a `persisted` machine's commit decline (`NotSent { NoPersistence }`) rather than send? Against: the second tab's Pay button stops working. For: D26's write-ahead is what the machine declared. **Recommendation: decline, or make it a per-contract choice.**

### H4. `flow check` passes Pay with its bugs, and misses a real stranded hold. **r7** [ran]

`typed-pay`: exit 0, 5 `Rule16` warnings, `complete: yes`. By my mapping [reasoning]: P4 and part of P1 and P6 get a warning; P2, P3, P5 get nothing. One press plus 4 reloads gives `place` held in `PLACING` for good, charged, no order. No `UnresolvedHold`. Plants: removing root `PayUnsure` gives 16 errors, good; removing STUCK's way out gives **0 errors**, with `place` then visibly stranded. `arrivalsOf` treats a retry behind the unknown event as an owner, though that event has already been spent. The money audit agrees, for its own reason: `pay.search.ts:89` counts any `PLACING` as accounted, charged or not, even with nothing open.

## Medium

- **M1. E2: memory ahead of lane. r6 or r7, not separated** [ran]. Assumption 6. Real: `{"0ms U lanes=1":11,"0ms W lanes=0":1, rest U lanes=1: 60}`. Window is short on IndexedDB, longer on any store with slow failures. Builder's candidate, one plain batch out at a time, also answers M2.
- **M2. D94 inverts order. r7** [ran]. `Go, ack, lost, failHeld, Note, Retry, Forget, failLate, ack, reload` gives `U` with a hold the owner released. D83's sentence, "a later write wins", is false for a write parked in `waitingAwaited`: the delete issued after it lands before it. Stamp and value are taken at different times. **The stall you asked about:** no deadlock. A plain batch that never answers keeps the ack waiting for good, with `StorageSilent` once and no issue; `Forget` moves the state and the lane stays [ran]. That matches a hung awaited write, so it costs little.
- **M3. Hidden pages get the 5 s default** [ran on the fake; throttling by reasoning]. Proposal: while hidden, flush at once. D80 stands for visible pages.
- **M4. The suite does not run the accepted default. r7** [read, ran]. 545 at `captureMs: 0`. `drv-d93-retired-waits` and the builder's `d80-default-not-5s` survive for that reason. `drv-timer-reset-debounce` also survives: turn the 5 s into a debounce and a steady chat never flushes, nothing notices.
- **M5. Oracles.** See Part 2.
- **M6. D87's bound stops short of the real hang** (`page.ts:65`) [read].
- **M7. Pay: after `NotSent { Restored }` on `place`, the shopper sees "Try again" and the only button charges again** (`Pay ack pay.ok KILL`, then Pay: third Attempt) [ran]. Pay's bug. Pinned under P6 only when a second press is in the script; the first half has no pin.

## Low

- Clock back a day delays a restored schedule a day [ran]. **r4 or older, not traced.**
- `on.on.` in hand fixtures' paths, known to STATUS. `cli-outputs.md`'s success example (0 warnings, 2 info) no longer matches typed Pay (5 warnings, 0 info) [ran].
- `ctx.ts`: ack claims pass whenever `out.failing > 0`, for any actor [read]. Could be per key.
- Unknown keys on `on` are not refused by types; `check` catches them. Known.

---

## Part 2: the code so far

**Persistence edge: a pile, by now.** Order is held by `issued`, `dirty`, `saved`, `plainOut`, `waitingAwaited` and `behind`, plus the turn's `then`. Each answered one trace, and M1 and M2 are the next two. This is the moment for your convergence rule: all findings at once. **Proposed shape, not tried:** per actor, one batch out at a time; at issue, take the newest value per key from the world; "awaited" is a flag on the batch. That is issue order by construction, and it removes `issued`, `plainOut`, `behind`, `waitingAwaited`, D94 and the skip scope. Cost: a slow store delays that actor's writes, as D94 already does. It needs a from-scratch agent given these findings, not the driver.

**Bounded boot, quarantine:** behave as stated [ran]. `lane-quarantine-guard-idle` survives, so a button's `idle` is unpinned.

**SEARCH-FLUSH.** `plant-a` is H1 (STATUS agrees). Why it shows nothing: **oracle (b) allows any past cut**, so a restore older than what had already landed passes. Only `REV7-H1/…stays-dead` kills it. My plants, 30 s each [ran]:

| Plant | Search | Result |
| --- | --- | --- |
| H1, issue number ignored | bare.tight, pay.tight | **not caught** |
| No D94 wait | pay.tight | caught, `held-no-owner:PAID`, `Pay failHeld ack pay.ok ack KILL` |
| No D94 carry | pay.tight | caught, same class |
| Acked restored as NotSent | bare | caught (a), depth 4 |
| Forget's cancel does nothing | bare | caught (c), depth 6 |
| No D84 | bare | **not caught**: a completed write back as a hold, and `Forget` then clears it |
| Parked hold dropped | bare | **not caught** |
| Guard shown a mixed pair | bare | caught (d), depth 0 |
| Same | bare.tight | **not caught: tight's alphabet has no `Peek`** (`flush.search.ts:183`), so (d) cannot fire there |

So the oracle works for (a), (c), (d) and not for recency. Proposed: (e) a restore is no older than the newest batch that landed; (f) a waiting state has something that can end it.

**The 247 to 4,115 "exceptions".** The number is not a count of boots: `exceptions++` (`:214`) runs in `state()`, which rewalks every boot's frame for each new state, so one boot counts once per descendant [read]. Shapes, from an instrumented copy [ran]: bare 176/189 and Pay 79/104 are `W` or `PAYING` with **no row**, which is E2: **yes, a bug was hiding in the allowance, and the comment (`:4-5`) names only the other direction.** The rest are `pending` rows, a boot frame's undelivered restored mail, which I read as harmless.

My oracle (f) adds `waits-for-nothing:PLACING` at `Pay ack pay.ok KILL`, one press, no fault at all [ran]: M7.

**Pay's classes.** `two-keys-one-intent:STUCK` and `told-not-charged:STUCK`: known family, P6's second press plus restarts spending `place`'s budget [ran a one-press form]. Pins are regexes on the script, so anything with two presses is pinned whatever its cause. STATUS says the same.

**The 59, now 58 (differential, mine) [ran].** Flush before reads and faults: 26 still fail, so **32 read too early**. Flush before kills too: 15 still fail, so **11 depend on a kill**, all expected loss in those I traced (first record lost, FRAG-10's deadline). The 15 left set their own bound or count timers. STATUS: 35/12/11, close. "The test read too early" is true of 55%, not of all. I traced 4 (FRAG-10, FRAG-18 twice, SPIKE-04), no new bug; the rest by differential only. The owner's question is FRAG-10: a deadline disappears, and that is more than plain memory.

**Typed path.** Resembles the design: `definition`, `machine(D, ({S,E,O}) => …)`, `transaction`, `resource`, `Flow.initial`, `E.x.from`, `O.pay.commit`, `guard`, `updateMemory`, an Effect service for the source [read]. Not a helper shaped around `Compiled`. No literal `any` [read]. **But `flow.ts:2`'s "erased at exactly one function" is false:** 11 more casts in `flow.ts` (`as never` at `:439,452,571,652-654,661`, `as unknown as` at `:73,496,505,565`), 6 in `pay.typed.ts`. `tsc` printed no errors [ran]. Pay repeats memory and event types by hand (`MemoryT`, `start`), so inference does not reach shared alternatives [read]. Coverage: STATUS's 84 of 545; my static count by `fixtures` is 54 before `fresh()` uses, not reconciled.

**`flow check`, `flow explain`: real, no callbacks** [ran]. Every Slot poisoned, count 0. Desk's 5 `UnresolvedHold` are true of the hand fixture: `Unsure: [{}]` and retry only for `archive` [read]. pay-full 9 warnings, cart 1, refunds 0. Explain stops at opaque guards and says so. Limit in H4.

**Overclaims.** STATUS: none found; it volunteers most of these. Elsewhere:
- Commit `5c742541`, "encoding never fails a turn": `turn.ts:156,165,648-658` still `admit()` for lookups, guard keys, module values [read]. convergence-7 mentions lookups; the commit does not.
- `driver.ts:189` "cannot occur": false under H1.
- convergence-7 promises "Corrections after building"; no such section [read]. Fair, mid-round.

---

## Part 3: the tests

**My mutants: 27/45 (60%); 27/44 without `dur-capture-goes-plain`, likely equivalent.** Written from the rules and code before opening `mutants-r7.ts` or the builder's list. I had read round 6's review. By eye about 10 resemble the builder's. Default `mutate-one`, which runs no flush search.

| Part | Killed |
| --- | --- |
| Driver | 11/21 |
| Durable | 9/13 |
| Lane | 5/6 |
| Gate | 1/4 |
| Turn | 1/1 |

Survivors that matter: `drv-d94-no-wait`, `drv-d94-no-carry` (**`E1-a-failed-batch-goes-with-the-next-ack` passes without D94**), `drv-d83-no-dirty-delete`, `drv-carried-fail-forgotten`, `drv-d93-retired-waits`, `drv-timer-reset-debounce`, `dur-refused-saved-stays`, `lane-quarantine-guard-idle`, `gate-lane-id-unchecked` (the comment at `gate.ts:404` says why it matters), `dur-firing-not-kept`, `drv-d94-actor-only`. Others: `drv-failed-overwrites-dirty`, `drv-backoff-no-cap`, `drv-landed-no-reset`, `dur-mint-from-lanes`, `gate-ms-no-upper`, `gate-nan-as-null`.

**The persistence edge, the round's point, is the worst-pinned part.** Proposed: `flush.pay.tight` at 30 s in `mutate-one`, so the search counts.

**Fake's late failure:** realistic in kind, `onabort` is later. **`failHeld` is stronger than one IndexedDB store**, where events come in order, but E2's real 1/72 shows the shape is reachable, and another store could do what it models. Keep it. Missing from the fake: plain success in flight, backward clock, throttled and frozen timers, more than one actor in flush searches.

**`expected-changes.log`:** no case deleted (all 517 of round 6 are in the 545) [ran]. Changed expectations in `review`, `round4`, `stream`, `round6` all follow D89, as decided, or pin M1 harder (`drainMs: -1`) [ran `git diff`]. No unjustified weakening. `ctx.ts`'s relaxation: Low above.

---

## What the builder should do next, in order

1. `driver.ts`: scope D89's skip per actor. New two-actor case and search (H1).
2. Gather H1, E2, M2, D94 and D83, then one from-scratch redesign of the edge (the shape above, as input to judge, not to inherit). `round-7/` only.
3. Typed memory: encode through Schema in the driver, or `check` refuses (H2).
4. `driver.ts:231`: flush at once while hidden (M3).
5. `conformance/search/flush.search.ts`: fix the counter, add (e) and (f), put `Peek` in tight. `pay.search.ts:89`: narrow.
6. `conformance/fake-world.ts`: plain success in flight, clock back. `conformance/mutate-one.ts`: add `flush.pay.tight`.
7. `conformance/drive.ts:190`: a second suite pass at the default, cases that mean it flushing explicitly.
8. `cli/check.ts` `arrivalsOf`: a hold whose unknown event is spent has no owner (H4).
9. RESULTS: limits 1, 2, 3, 9, 15, 20, and the casts. Owner questions: H3, business keys, D80's scope, hidden flush.

## Not checked

- Builder's H1, kills and hide numbers: read, not rerun. Quota: nothing real fired for the builder and I did not try.
- Real throttling, a real sleep, Safari, Firefox, phones, eviction, real server key expiry: reasoning only.
- Whether the one-batch-out redesign holds: not built.
- H3's cause: not established, by me either.
- E2's age. Entities, sessions and `turn.ts` beyond the commit path. M5, M6, M10, M12. The confirm path, as instructed.
- Rule 45's exact intent for H4's spent-event case: I read the code and the runtime trace, not the rule's full text. My mapping of P1-P6 to warnings is judgment.
