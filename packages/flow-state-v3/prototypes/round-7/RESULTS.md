# Round 7: the persistence edge, a typed path, `flow check`

Status: proposed, throwaway. Ran on 2026-11-02, Bun 1.4.2, Effect 4.0.5, Chrome 146 headless over raw CDP, this Mac. Decisions: [../convergence-7.md](../convergence-7.md). Marks: **[ran]**, **[read]**, **[reasoning]**. Reviews: [review-mid.md](review-mid.md), advice. Edge: [edge-proposal.md](edge-proposal.md). Outputs here: `suite-output.txt`, `gate-5s.txt`, `search-*.txt`, `plants.txt`, `mutants-builder.txt`, `bench-r7.json`, `s4-r7.json`, `reality/results-edge.json`; red: `../conformance/red-round-7.txt`.

**Decided, not by me:** D80's 5 s and hide flush (owner); M9 (O5 over D57), M2, H2 option A, the edge's invariant, `now` for lanes, retired identities and armed deadlines, `strict` acks, hidden means no wait, D26's decline, business keys as the documented form (coordinator, under the owner's delegation). Everything else is proposed.

**Verdict.** **The edge is one rule now, and it held on the real step:** per actor, one batch out, carrying everything not known to have landed. My case-by-case version (D83, D94, D95) was replaced after the review showed it was a pile with two more bugs. H1, E2, M1, M2 and review H1 no longer reproduce. **H3 does not move:** a charge with nothing on disk still happens, about 1 in 100 charged first visits, and only a key the server recognises closes it. A large record at reload still does not save. `Compiled` is settled enough to port the core against for what Pay and fragments need: entities and streams were not typed. `flow check` catches one of Pay's six bugs squarely.

**Read first:** "What reality overturned", "Owner's calls", "H3".

## What I read

`round-6/review.md`, `round-6/RESULTS.md`, `convergence-6.md`, `README.md`, `SCENARIOS.md`, `machine-design.md` (rules 14-20, 45, 70, 2.7.14, 2.7.16, 2.8.11, 2.10.14, 2.10.15, 2.10.17.6), `CommandLine.plan`, `Persistence.plan` O5, `references/checkout/features/Pay/*`, `review-mid.md`, `edge-proposal.md`.

## What ran

| Item | Result |
| --- | --- |
| Red: round 6's code on the first repaired suite | 520/539; crash search failed at depth 8 [ran]. After the edge's host contract round 6 no longer runs on the fake; its controls are the numbers below from before that |
| Suite, `--round 7` | **563/563**, cites cross-checked, unlogged changes none. Deep-freeze 563/563 [ran] |
| With `--swap` typed machines | 563/563 [ran] |
| **Gate at the runtime's 5 s default** (`conformance/gate5s.ts`) | 26 fail, 26 expected, each with a reason in `gate-5s-expected.txt`; 0 unexpected [ran]. **Passing this means "nothing new", not "nothing lost"** |
| Builder mutants, edge list | **32/32. Builder-written, not independent.** 3 killed only by a search. Old list (about 180): **not rerun**; 35 no longer apply (`replaced-r7.txt`) |
| Review's independent mutants, before the edge | 27/45, on code since replaced. Not rerun |
| `tsc --strict` on typed Pay, fragments, type tests | 0 errors [ran] |
| CLI pins | all pass [ran] |
| `nub run verify`, repo lint | **not run.** No formatter run on these throwaway files |

### Searches. All stopped by time or depth, none closed except where marked.

| Search | Depth | States | Result |
| --- | --- | --- | --- |
| `flush.bare`, full alphabet | 5 | 33,896 | No failure |
| `flush.two`, full alphabet | 4 | 28,258 | No failure |
| `flush.frag`, full alphabet | 6 | 38,800 | No failure |
| `flush.pay`, full alphabet | 5 | 19,308 | No unpinned class |
| `flush.bare.tight` | 7 | 48,211 | No failure |
| `flush.two.tight` | 5 | 39,976 | No failure |
| `flush.two.tight.wide`, one store, hang | 5 | 39,030 | No failure |
| `flush.frag.tight` | 8 | 54,415 | No failure |
| `flush.pay.tight` | 15 | 10,319 | No unpinned class |
| SEARCH-PAY, pins | 7, complete | 15,547 | No unpinned, after pinning P7 |
| payFixed | 7 | 9,765 | Fails, `... place.ok Start PayRequested`: the fake, as rounds 5, 6 |
| CRASH, CRASH at 5 s | 7, 7 | 29,453, 31,383 | No failure |
| ODD, CROSS, LIKE, FRAG, FRAGSTORE, SESSION, REPAIRING, LISTEN x2 | 2, 5, 6, 7, 6, 5, 5, 6, 5 | 30 s each | No failure. **Shallower than round 6, since every search now also pays for the fake's later answers and I gave them 30 s** |

**The flush search:** flush timing is an action, with the timer out of reach. Oracles: (a) second Attempt, (b) a cut never published, (c) held for good, (d) a guard sees two turns, (e) the disk moves forward and memory is never ahead of a lane, (f) a waiting state has something that can end it, (g) one batch out, thrown by the fake, (h) write-ahead. **Not built as proposed:** (i) ack before report: in this code a success is reported before its lane's removal lands, by design, and a kill then gives a pessimistic hold. (j) as a differential: replaced by a two-actor search and a case. (k), (m) are suite cases.

### The proposal's 15 plants, on the real runtime [ran]

| Plant | Suite | Search |
| --- | --- | --- |
| `twoOut` | caught | (g) throws |
| `oldWins` | caught | (h) |
| `noMerge` | caught | not caught in 30 s |
| `partial` | caught | L3 |
| `poisonDeletes` | caught | (e) memory ahead of its lane |
| Poison stops every scope | caught | L3, two actors |
| Debounce | caught | no |
| Ignores `now` | caught | no |
| No `StorageSilent` | caught | no |
| `stored` before landing | caught | (h) |
| Ticket boards no batch | caught | L3 |
| Encode on the turn | **not caught, so I added a case, then caught** | no |
| Hidden not urgent | caught | no |
| No `commit()` | Spy on real Chrome: every edge batch commits, relaxed plain, strict with a ticket [ran]. **Only the host's own marker transaction does not call it** | Autocommit before this: 0/12 survive `navigate` |
| Plain `strict`, ack `relaxed` | Same spy | |

## H3: not fixed, not explained

| Run | SIGKILL within ms of the first click | Charged | Charged, nothing on disk |
| --- | --- | --- | --- |
| Marker, before the edge | 240 | 141 | 3 |
| No marker | 240 | 137 | 2 |
| Marker, close and reopen | 180 | 107 | 2 |
| **Marker, on the edge** | 120 | 73 | **1** |
| Pay table on the edge, 40 mixed | 40 | 32 | **1** (SIGKILL at about 2 ms) |
| Database 1.5 s old | 60 | 20 | 0. Too few to claim anything |

`onDisk` was `[]`: the marker gone too, so the whole database, and `oncomplete` of a `strict` transaction had fired [ran]. D85's marker does not help; I drop it as a remedy. **Chrome's cause is not established.** "0 acknowledged writes lost" is false and I do not restate it. It needs a first visit and a whole-browser kill within milliseconds. 0 double charges in those runs, because nobody pressed again; a press would be a second key.

## What reality overturned

| The fake said, or we assumed | Reality [ran] | Consequence |
| --- | --- | --- |
| A failed plain write is known before the next | `onabort` comes later. Round 6: **12/12 two charges, 12/12 told "not charged"** on a real abort. Now 0/12 | The edge |
| A coalesced batch costs a little | No-reconcile machine, kill after success: round 6 `U`, held, 40/48. Now `B` 48/48 | Lanes are `now` |
| A marker makes a new database safe | No (above) | Limit |
| Memory ahead of a lane is a fake's trick | The review reproduced it, 1/72 on real IndexedDB. Now **0/72**: `W` with no lane never | The edge |
| A write started at pagehide finishes | **Not unless it commits explicitly:** autocommit 0/12 on `navigate`. With `tx.commit()`: below | Host contract |
| Real quota can be simulated by CDP | **No.** `Storage.overrideQuotaForOrigin` changes `estimate()`; Chrome committed 2.8 MB against a 1,000-byte quota | **Real quota: not run.** Only `tx.abort()` |
| Plain batch and ack are separate transactions, per the proposal | In this code both are emitted before the request and merge | One batch: see below |
| A typed `Schema.Date` round-trips | It lost the whole actor each reload (review). Now through `Schema.toCodecJson`; Date, NaN, BigInt restore [ran] | D89 |

**Not overturned:** multi-key atomicity (56 cycles, 0 torn), Web Locks, restore, the lane table.

**A first send is one batch.** The proposal's "two transactions, always" means something else from what the code writes (convergence-7). So a kill before it lands restores the state before the click, with no `NotSent { Restored }`. `PAY-09`, `PAY-13`, `STORE-04/Restored`, `REV6-CAPTURE` changed, each logged. **Round 6's `NotSent` window goes, and with it Pay's "wasn't sent" notice on that path: the click just vanishes. 2.10.15's row is the owner's.** On the Pay table: `NotSent` 0, was 3.

### Section 8's question 5

**The real step does not break the invariant.** A commit's state and lane are one step. Mail is not: a follow-up or a restored ending runs later, so batches go after the drain, and the wrapper re-defers across a yield. A hide across a yield is a true step boundary. (e) and (f) found nothing on the real runtime.

## Hide, kill, D80 [ran]. Timer throttling **on** for these

| What happens | 100 messages | 10,000 |
| --- | --- | --- |
| Tab hidden, then SIGKILL at the event's beacon | 6/6 newest | 6/6 |
| Tab closed | 6/6 | 6/6 |
| Navigate away | 6/6 | 6/6 |
| **Reload** | 6/6 | **0/6** |
| **Navigate, kill at the beacon** | 6/6 | **0/6** |
| Kill or crash before the event reaches the page | 0/48 | 0/48 |

**So the hide flush is reliable for ordinary records and unreliable for a large one on the way out,** though safe: an older whole state. Cause of reload against navigate at 10,000 is not established. Throttled timers change nothing here: hide does not wait for one.

**Cost 4, the hide window:** 40 cycles, kill or navigate 0-50 ms after a success: **0 holds** [ran]. **Weak:** my timing starts from a 10 ms poll and a small record, so it rarely lands in the window. Not frequent on this evidence, so `out ∪ dirty` was not tried.

**A typed draft, open for the owner.** Plain memory at 5 s survives hide and close, and loses up to 5 s to a crash. Options: leave it (proposed: a crash is rare, and the draft comes back older, whole); or a per-field shorter interval, 500 ms costing about 1% busy at 1,000 messages [ran] and a new word. D80 also loses a **leaf change** and an actor's **first record** to a kill; an armed deadline no longer, by decision.

### Benchmarks, by the same bench. Busy %, 240 values at 60 a second (960 at 5 s)

| Size, rate | 0 ms | 100 | 500 | 5,000 |
| --- | --- | --- | --- | --- |
| 1,000, 1x | 10 | 2 | 1 | 0 |
| 10,000, 1x | 44 | 10 | 3 | 1 |
| 1,000, 6x | 24 | 4 | 1 | 0 |
| 10,000, 6x (a stress test, not a target) | 96 | 28 | 6 | 1 |

Turn p99 at 5 s: 0.2 ms or less. MB/s at 10,000, 6x: 38, 11, 2.4, 0.3. **Long tasks: 0 observed at n=60 and n=240 with `takeRecords`, 4 at capture 0; the review saw 36 and 42% where I see 28%. Not resolved.** The `bench/main` figure "persisted at once" now excludes encoding, which moved off the turn: only the busy table is honest about that cost.

| Measure | Round 6 | Round 7 |
| --- | --- | --- |
| Plain turn, 1, 1,000, 10,000 actors, us | 2.5, 23, 245 | 2.7, 2.7, 3.1 |
| Seal Pay; desk, us | 11; 9 | 13.7; 12.3 |
| S4 plain mean, 6x, fresh, 1,000; 3,000, us | 22; 1,316 | 19.5; 20.2 |
| S4 plain mean, 6x, polluted, 1,000; 3,000 | 363; 1,330 | 94; 174. **Before the edge the same run gave 17.6; 17.8. Noise or the edge, not resolved** |
| S4 click to settled, 6x, ms | 4.7 | 4.7 |
| Bundle gzip, core with driver, KB | 21.4 | 23.1 |

### Production budgets, a draft (proposed)

| Budget | Value | Basis |
| --- | --- | --- |
| Turn, 1,000 actors, low-end | under 1 ms | **Measured** at 6x CDP: 20-174 us. Not a phone |
| Click to settled | under 16 ms | **Measured** 4.7 ms. Not a phone |
| Main-thread busy from persistence, chat at 60/s, 1,000 messages | under 2% | **Measured** at 5 s: 0%. At 6x: 0% |
| Memory size before chunks are owed | 10,000 messages | **Guess.** Flush about 40 ms at 6x; a hide at this size is lost on reload [ran] |
| Plain loss on a crash | up to 5 s, visible pages | **Decided** |
| Hidden: time to issue | same task | **Measured** on Chrome only |
| Core bundle | under 25 KB gzip | **Guess** from 23.1 |
| Actors per tab | 3,000 at no cost seen | **Measured** at 3,000; beyond is a guess |
| Boot read bound | 10 s | **Guess** |
| Storage per user | none | Unknown; real quota not run |

## Review findings, by age

| Finding | State |
| --- | --- |
| R6 H1, double charge | **Fixed, ran, real** |
| R6 H2 | **Out.** `known-failing-h2.ts`, not counted. `Carried.evidence` added, unread. With the whole-record oracle, `an-actor-disposed...` shows revision 1 against 2, unmarked, real: same family, known-failing |
| R6 H3 | **Not fixed.** Above |
| R6 M1 | Fixed, ran. `PLACING` restored 0/40, was 10/40 |
| R6 M2 | Fixed, decided |
| R6 M3, M13 | Measured; D90 |
| R6 M4 (a, b, c, e) | Sleep gone; oracle fixed; orders still keyed by cart, so `orders` proves little; whole-record oracle in; (e) above |
| R6 M5, M6, M10, M12 | **Left:** all the store's, round 8. M6: not started |
| R6 M7 | Partly. Left: `three-silent-reads`, and the T1 deadline case: past 30 s the read's own deadline fires, so it cannot reach the idle row without answering the read |
| R6 M8, M9, M11 | Fixed, ran. **Still refuses:** a lookup's input, a guard's key and a module value use `admit`. Decided scope said "never"; I built commits and memory. **Against the decision, reported** |
| R6 L1-L4 | Fixed |
| R6 L5, L6, L8, L9 | Left: the store's, or stated |
| Mid H1, H2, H3, H4, M1-M4 | Fixed, ran |
| Mid M6, D87's bound past `open` | Host contract; `page.ts` **still awaits `open` outside the bound** |
| Mid M7 | Pay's. (f) reports it under `KILL`/`refuse`, by script, so a real new one there would pass |

| Age of the code at fault | High | All | New this round |
| --- | --- | --- | --- |
| r1-2 | 0 | 2 | Clock back; first-record loss |
| r3 | 0 | 2 | |
| r4 | 0 | 1 | |
| r5 | 0 | 2 | |
| r6 place, dispose | 1 | 4 | |
| r6 real | 2 | 9 | |
| r7, mine | 4 | 12 | D94's zombie, per-batch poison, JSON vs Schema, E2's search allowance, `boot` lost at 5 s, D95's split batch (caught at once) |

## The sweep at 5 s

Classified, **60 at the time, with the differential on the then-current suite** [ran]: **39** read or corrupted the disk before any flush; **12** lose plain memory at a kill, each with a kill trace (`FRAG-10`, whose armed deadline went; by decision it now does not); **6** read an issue, a timer or a fault on the turn; **3** name their own bound or fault. **Real bugs: 2.** `REV5-H5H6/a-disposed-identity-sleeps-through-a-reload`: a dispose was plain, so a kill woke the actor (D93). `PAY-14`: `boot` in plain `meta` lost to a kill, so frame numbers repeated (now `now`). No search found these; a gate does now.

## Part 2: the typed path

Pay and ThreeDS with nested Countdown, typed. **84 of 563 cases boot them: 59 Pay, 25 fragments**; the review's 54 counted `s.fixtures` statically, mine counts boots including `fresh()`. **479 cases run hand-written `Compiled`.** All 563 pass [ran]; a flipped target fails 5, a flipped `history` 2 [ran]. Pay's `Declined` text changing fails nothing: no case reads it. Data diff against hand fixtures: 49, of which 46 are the hand fixture's `on.on.` path typo, and 3 are stated. No literal `any`. **18 casts remain** (`as never`, `as unknown as`): 12 in `flow.ts`, 6 in `pay.typed.ts`. Pay repeats memory and event types in shared alternatives: inference stops there. Refused by types: wrong field, wrong key, wrong tag, wrong commit input. **Not refused:** an unknown key on `on` (`flow check` says it) or `states` (compile throws).

**What `Compiled` needed that it lacked:** `keyFields`, `events`, `memory.encode` and a fragment's `restore`, a Slot for `commit`, a service type `R` with `provide`, `Carried.evidence`.

**Review's "most likely to change" list:**

| Item | Changed? |
| --- | --- |
| 1. `domain` per machine | **Not tried.** Pay has none. Round 8 decides, with H2 |
| 2. Bare functions and Slots | `commit` yes: Slot after seal, always from the typed path. Streams, `domain` not: not typed |
| 3. `commit: Effect<_, _, never>` | **Yes:** `Typed<R>` and `provide`, so the Runtime stays `never`. Whether a Runtime should take a layer: open |
| 4. `memory.restore` and `encodable` | **Yes.** `encodable` is gone; Schema both ways |
| 5. Additive for `flow check` | `events`, `keyFields`. Fragment ports: read off nodes |
| 6. String names | **No.** `target`, `uses`, `fragment` are strings still; tokens produce them |

## Part 3: CLI

`round-7/cli-outputs.md`, new. Every Slot poisoned, 0 callbacks run [ran]. Explain stops at opaque guards and says where. `flow trace` does not fold into `explain --trace`: paper, in that file.

**Pay's six.** My reading of what each finding says against the cause: judgment [read].

| Bug | `flow check` | Existing search |
| --- | --- | --- |
| P1 Leave during PLACING | Missed. A `Rule16` on the same alternative names `void`, not `place` | Yes |
| P2 late `Placed` denied | Missed: rule 15 is not a check here | Yes |
| P3 late `Confirmed` | Missed: a bare `self` is a legal ignore | Yes |
| **P4 Pay in UNSURE** | **Caught.** `Rule16`, and its advice is the fix | Yes |
| P5 new Start beside a hold | Missed: a `cancel` counts for any key, stated in 2.7.14 | Yes |
| P6 Pay in PLACING | **Half.** `Rule16` on the line; its advice, `idle`, does not fix it, since the lane is idle | Yes |

**One caught, one half, four missed. `flow check` is no substitute for the search.** New since the review: `place` stranded in STUCK, once its unknown event is spent: `UnresolvedHold` warning, 8 leaves.

**False alarms**, read by hand: Checkout (pay-full, cart, mini-cart, refunds): 19 warnings. 2 point at pinned bugs (`PayRequested`, `onPay`), 9 at `place`'s real stranded hold, **8 `Rule16`s are literal and I know no bug behind them.** Desk: 5 `UnresolvedHold` errors, true of the **hand fixture** (`Unsure: [{}]`, retry for `archive` only); real dispatch-desk not checked. Ticket, attach, address, panels: 0, on hand-written data, so `KeyRequired` undecided, and it says `complete: no`.

## D26 and two tabs [ran]

A second tab: Pay ends `NotSent { NoPersistence }`, state `CARD`, notice "Your payment wasn't sent. You haven't been charged.", 0 keys. True, and **a second tab's Pay button is dead**, as is every tab past `bootMs`. Pay needed no change. O6's "no cross-tab exactly-once" stays for what a server key must do.

## Limits, to state

- **H3-the-Chrome-loss.** Above.
- **Eviction, a cleared site, Safari's cap:** a hold forgotten, then a new key [reasoning]. Not run.
- **Server key expiry:** a hold retried after the server forgot its key charges again. No age on a hold [read].
- **A large record at hide** (above).
- **Other browsers, phones, power loss.** Not run. `strict` is a hint.
- **D80 loses a leaf change, and a first record, at a kill:** a true earlier state.
- **A hung store holds everyone:** one IndexedDB store is one queue. Safe and loud (`flush.two.tight.wide`, a case).
- **Two actors are not one cut:** an entity table's write and a lane can part.

**The rule for money, decided.** *The client's record reduces duplicates; only a key the server can recognise prevents them.* New money examples use a business key; Pay stays pinned and unchanged:

```ts
const pay = transaction({
  id: "Checkout/pay",
  input: { intentId: Schema.String, paymentMethodId: Schema.String },
  key: ["intentId"],                        // existing
  commit: (input) =>
    Effect.flatMap(Effect.service(ShopApi), (api) =>
      api.confirm(input, { idempotencyKey: `pay:${input.intentId}` })),  // CHANGED: was attempt.id. A hold lost with the disk can't charge twice
});
```

Prior art not checked beyond the proposal's reading of TanStack DB offline transactions.

## Harness: what still reaches past the adapter

For porting `conformance/` to the production build. Not restructured.

- **`conformance/bench/main.ts`, `s4-*`:** import `driver.ts`, `gate.ts`, `entities.ts` beside the adapter, and call `createRuntime`, `seal` by name.
- **`mutate.ts`, `mutate-one.ts`, mutant lists:** edit source text by file name and exact string; the layout is the interface.
- **`reality/`** lives in the round's folder: `page.ts`, `run7.ts`, `run.ts` import `../driver.ts`, `../entities.ts`, `../sessions.ts`, `../inc.ts`, `../actors.ts`, read `rt.world()`. `run7.ts --driver` maps by file name. **Should move to `conformance/`.**
- **`round-7/cli/`, `typed/`** import hand fixtures directly; `known-failing-h2.ts`, `date-check.ts` import `adapter.ts`, which is fine.
- **`adapter.ts` itself:** `stateText` reaches `rt.edgeText()`; `normalise` knows world field names and regexes `mint`, `dueAt`.
- **Hand-written `Compiled`:** 479 of 563 cases, and every fixture: `fixtures/compiled.ts` is the runtime's type, and `conformance/search/*` read `at.path`, nodes and tokens through it. `logGuards` walks `Compiled` for `guards`. `Compiled` must settle first.
- **`Fixture.make(api)`:** dependency by parameter; the typed path's service goes through a seam in `pay.typed.ts`.
- **`Host`:** defined in `fake-world.ts`, the edge's contract. **Round 6 no longer runs on it.**
- **`drive.ts`:** `stateText` tail format for `FLOW_KILL_TRACE`, env flags. `report.ts`: `convergence-N.md` file names and machine-design's numbering.
- **`scenarios/`:** on-disk format: `actor/`, `lane/`, `head.acked`, `root.memory`, `root.kids`. A production format change touches about 40 cases.
- **`search/flush.search.ts`:** same format in oracle (e).

## Survivors

Edge list: none of 32. **That list is mine, written with the code.** The review's 45 are not rerun on the edge, and it found 18 survivors on the last version. **A new independent number is what this is missing.**

## Rules broken

- **2.10.15's row,** first-send `NotSent { Restored }`: gone (above). Owner's.
- **2.10.17.6 `ActorAbsent`:** queued, decided.
- **`D57`:** replaced, decided. **`D80`:** amended, accepted.
- **The brief's "don't add cases to the ordering":** I added D94, D95 before that instruction arrived; both replaced.
- **"Keep a design from `step`":** none. The driver's persist path is rewritten, against the brief's first framing, as later instructed.
- **Round 6's folder:** untouched. Conformance's host changed, so it no longer runs.
- **Fragment `restore` added** beyond D82, by H2's need.

## Owner's calls, flagged and not decided

1. **2.10.15's row:** a first send's silent loss on a kill, against parking an acked write and M2's risk. Proposed: accept.
2. **`flow check` severity for hand-written `Compiled`:** `complete: no` exits on findings. Proposed: exit 2 when typed.
3. **A typed draft** (above).
4. **A leaf change at a kill:** D80 stays, decided; a state a user saw is lost. Flagged again.
5. **A lookup or guard key that cannot encode still refuses its turn.** "Never fails the turn" was decided: decline for a lookup, or narrow the sentence?
6. **The second tab's dead button,** or per-contract choice (review).
7. **D85's marker:** drop it. Proposed, since it did not help.

## Costs

| Part | Round 6 | Now |
| --- | --- | --- |
| Step, turn, world, seam, hooks, gate, inc | 3,065 | 3,092, plus `actors.ts` 61, `record.ts` 24 |
| Lane, reads, timers | 649 | 664 |
| Write-ahead | 421 | 455 |
| Driver | 370 | 359 |
| **Edge** | | **184** |
| Publication | 102 | 107 |
| Entities, sessions, feed | 1,989 | 1,989 |
| Typed path, CLI (throwaway) | | 1,388, 661 |

## Limits of this run

One process tree held, apart from Chrome, which `cdp.ts` watches: peak 958 MB. **Three runs hit the watchdog at 590 s** and left orphaned throwaway Chrome trees, which I removed by exact profile path. Their results were discarded. The H1 re-run's "told not charged, 12/12" on `--abort awaited` is my oracle's error: it compares a notice from before the second press with the keys after it. 0 two charges there.

## Not run

Safari, Firefox, a phone, power loss, real quota, a real hung read, eviction, server key expiry, a real sleep, real clock changes. The old mutant list. A new independent review or second author on the edge. Real Zero or TanStack DB. `nub run verify`. Every search past its stated depth. `flow graph`, `flow story`, `flow trace`.
