# Round 9: a runtime and tests entities can trust

Status: proposed, throwaway. **Part two first, part one below it. Part one's numbers stand as history; its D115, D117's second half, D118's table and D120 are replaced.**

## Part two: self-looping and what a turn cannot take

Ran 2026-11-03, Bun 1.4.2, Chrome headless, this Mac. Decisions: [../convergence-9.md](../convergence-9.md), D122-D128, all proposed. Input: [review-fixes.md](review-fixes.md), advice. **No independent review of this; mutants are mine.** Another agent's work ran in this tree at the same time, so load overlapped; search depths are lower bounds.

**Verdict.** H1, M1-M8 answered, by two rules. **Self-looping: a slice of work, however it arrived, then a task for the page; mail served actor by actor; nothing paced, dropped or cut.** The pacing machinery is deleted: `depth`, `inline`, `noIo`, `endingChain`, the `pace` timer, the `paced` wait. **What a turn cannot take: it stays with what owes it, and ends with that.** Fit to build entities on, by my reading: yes, with the one price below.

**The price, for Arpit: a spin is never stopped or slowed.** It runs at task rate, 280,000 turns a second here, one core, in a hidden tab too, until a press or a move ends it. Named at run time only for the same input failing 64 times, and by `flow check`'s `AsksForever` when no handler has a way out. A handler retrying a failing server at once hammers it at the network's rate, as it would under Effect. Part one had no protection there either. If you want a backoff, it belongs on an explicit retry, not on a guess at shape.

### Real Chrome [ran]: `reality/results-spin.json`

| Run | Part one | Part two |
| --- | --- | --- |
| Spin over a resolved promise, 2 s | **Never returned; no timer fired** | 561,805 turns; timer fired; interval p50 17 ms, max 27 ms |
| The same, failing | Never returned | 355,645 turns; max 27 ms; named once |
| Spin answered in the pump | 1,547 in 2 s | 593,951; max 24 ms |
| Press on another actor, beside a spin, 50 times | | p50 17 ms, max 19 ms |
| 1,000 rows, promise / in the pump | 4.8 s by the review | **19 ms / 21 ms.** With yielding off: 25 ms / 23 ms, first run |
| 5,000 rows | | 47 ms; off, 52 ms, first run |
| 200 rows, one duplicate / 300, every 10th / 200, all | 30 s / 12 min / 66 min in the fake | 13 ms / 17 ms / 10 ms; first run for the first two |
| 5,000 rows, page frozen for 1 s in the middle | | Done at 1,146 ms: 1 s frozen. Reports `hidden` while frozen |

**Hidden tabs are not measured.** Headless stayed `visible`; only a lifecycle freeze was run. `Host.later` is a `MessageChannel` post, which by what I know is not timer-throttled: reasoning, not shown. A host with only `setTimeout` gets each slice at the browser's floor.

### What ran on the final runtime [ran]

| Gate | Result |
| --- | --- |
| Suite | **703/703**, exit 0, nothing unlogged, catalog agrees, about 330 MB, 3.8 s |
| `--swap` typed | 703/703, exit 0 |
| 5 s gate | 29 failed, 29 expected; unexpected: none; failing differently: none; expected but passed: none |
| CLI pins | all pass. `flow check` end to end from a Schema: 12 machines |
| `tsc --strict` on typed | exit 0 |
| Typed compare, date check | 52 differences as before; pass |
| Pay | `pay.compiled.ts`, `pay.typed.ts`: no diff |
| Red | New cases on part one: 42 failed, 7 passed, in `red-round-9.txt`. Of the 7, `a-bulk-does-not-stand...` passes there only since part one's real clock never yields in a fake: `d122.mail-fifo` is what shows it is real. The 4 cases added after that first red pass (`listeners...never-leaves-the-pump`, `a-new-life-tries...once`, `a-sleeping-actors...`, `a-key-less-cancel-stays...`) were not run on part one |
| Mutants, **builder-written** | **45/47,** 1 by the watchdog (`d122.no-yield-in-loop`, a hot pump), control green, 0 invalid. `mutants-r9b.ts` |
| Lost endings | **29/29 named by oracle (j)**, each kind. `j-named.txt`. Review: 5 kinds of 26 |

**Survivors, each with a reason.** `d122.redelivery-counts`: a refused failure counts twice toward a name, so it is named early; nothing else changes. Left. `d123.letgo-takes-all`: `cancel` taking an ordinary parked ending too. I reason it cannot happen: an ordinary ending parks only with no life of its subject, a `cancel` needs one, and adoption empties first.

**First mutant pass: 9 survivors.** Two showed code that did nothing: a check at `pump`'s start and a `yielding` guard. Removed, so the rule is one line. Others are pinned now. `d122.slice-per-pump` is H1 itself, written after the removal, and dies by (k).

### Searches: 40 s each, serial, under load [ran]

| Search | Depth | States | Result |
| --- | --- | --- | --- |
| **`chain`, new** | 5 | 15,557 | clean |
| `cross` | 5 | 40,057 | clean |
| `like` | 6 | 42,602 | clean |
| `frag` | 7 | 26,381 | clean |
| `session` | 5 | 34,371 | clean |
| `listen.none` | 5 | 41,004 | clean |
| `odd` | 4 | 22,469 | clean |
| `pay` | 6 | 16,828 | clean |
| `crash` | 8 | 36,999 | clean |
| `flush.serialize.directed` | 11 | 9,153 | clean |
| `flush.serialize.queue` | 8 | 10,120 | clean |
| `flush.serialize.burst` | 5 | 430 | clean |
| `flush.serialize.wipe` | 8 | 10,047 | clean |
| `flush.bare.tight` | 6 | 17,684 | clean |
| `flush.two.tight` | 4 | 15,401 | clean |
| `flush.frag.tight` | 7 | 21,547 | clean |
| `flush.pay.tight` | 12 | 3,389 | clean |
| **`flush.bare.capture`, new** | 8 | 15,548 | clean |
| `listen.load` | 3 | 1,026 | **Fails, as on rounds 7, 8 and part one.** H2 class, for entities |
| `fragstore.row` | 7 | 84,812 | **Fails, as on rounds 7, 8 and part one.** H2 class, for entities |

`fragstore.row` ran 170 s, the rest 40 s. Clean means clean to that depth: all timed out, inconclusive by time.

### Plants [ran]: `plants.txt`

Suite 13/13. **Correction: part one said 5 inconclusive; it was 6, `noMerge` too, as the review read.** Now `capture` catches 3 of the 6: `ignoresNow` (r), `noSilent` (s), `hiddenWaits` (q). **Three stay suite-only, with reasons:** `debounce`: a state's hash reads time relative to now, so `Note tick Note tick` folds into a state already seen, and the search never sees a change getting older. A time-history key would see it; not built. `encodeOnTurn`: same states, only where the encode ran differs. `noMerge`: suite-only, and I did not trace why (p) stays quiet on it.

### Tampers [ran part]

`--first-lock --lock` with the lock moved away: **refused**, no lock written, on a copy. Weaken a case, hand-paste both hashes: still green, stated. Delete the log too: gets through. `git diff expected.lock` stays the check.

### For Arpit's read

Made under delegation, overrule any:

1. **A spin is not stopped or slowed.** Above.
2. **Mail order across actors is no longer global.** Within an actor, unchanged. Entities must not assume otherwise.
3. **A cut can fall between a turn and the next mail,** not between a turn and its follow-ups. Under a long bulk the disk gets one batch a slice, not one at the end. Any step boundary was already a legal cut for `hide`.
4. **A decline stays parked, not stranded,** against the review: stranded would leave a persisted `W` with no wait for good. It blocks nothing, one per lane.
5. **A kept ending is tried once per boot or new life,** and says what was thrown: `cause`.
6. **A boot forgets a stranded wait.** "A reload asks again" is withdrawn. A lint for a lookup with no recurring schedule is yours to call: not built.
7. **`a-real-answer-breaks-the-chain` is removed, not fixed:** no chain. Same for survivors `d115.press-keeps-depth`, `follow-resets-depth`, `cancel-keeps-paced`.

### Not run, and open

- Hidden tab, throttled timers, intensive throttling. Safari, phones.
- A real server, persisted bulk through real IndexedDB under D122: `page.ts` has the new `later`, but `run.ts`, H1 real, H3, S3, S4 were **not rerun**, so a batch per slice is unmeasured on a real store.
- Old mutant lists, `mutants-r9.ts`: they name removed code. `flow graph`, `story`, `trace`. `nub run verify`, repo lint and formatter: throwaway files, as in past rounds.
- `carried` overclaiming on `NaN`, boxed primitives, a `Date`: review's Lows, unchanged. A reset with no name still issues per evaluation.

---

# Part one

Status: proposed, throwaway. Ran 2026-11-03, Bun 1.4.2, Chrome 146 headless, this Mac. Decisions: [../convergence-9.md](../convergence-9.md), D114-D121, all proposed. Input: [../round-8/review.md](../round-8/review.md), advice. Marks: **[ran]**, **[read]**, **[reasoning]**. Outputs here: `mutants-builder.txt`, `mutants-r9.ts`, `search-*.txt`, `plants.txt`, `reality/results-*.json`; red: `../conformance/red-round-9.txt`. Entities not started.

**Verdict.** Review's High, M1-M7 are answered, none by a site-by-site patch. **The budget is gone:** the fault was a loop that never let the drain end, not a rate. 300 sends, 300 rows and 1,000 lookups in a tick all end, a spin stops spinning, and no clock is involved. **No independent review of this yet;** every mutant below is mine.

## What ran, on the final runtime and harness [ran]

| Gate | Result |
| --- | --- |
| Suite | **661/661,** exit 0, nothing unlogged, catalog agrees, about 300 MB, **3.6 s** (was 12.5 s: see `odd`) |
| `--swap` typed | 661/661, exit 0 |
| 5 s gate | 29 failed, 29 expected, none different, none newly passing. Means "nothing new" |
| CLI pins | all pass |
| `tsc --strict` on typed | exit 0 |
| Typed compare, date check | 52 differences as before; pass |
| Pay | `pay.compiled.ts`: no diff from `397a2e2c` |
| Red | New cases on round 8's runtime: **33 failed, 7 passed;** the 7 pin what round 8 already did: `red-round-9.txt` |
| Mutants, **builder-written, not independent** | **49/51,** 3 of them by the watchdog (the spin itself: `d115.no-pace`, `press-keeps-depth`, `turn-ignored`), control green, 0 invalid |
| Real, Pay's H1 | 12 failures seen, 0 two charges, restored `UNSURE` 12, final `PAID` 12 |
| Real, H1 bare, hold 400 ms | 0/12 second key, restored `U` 12 |
| Real, H1 `Refunds` | 0/12 beside an undecided first; 2 keys 12/12, as round 8: the restored head resends, is answered, then the new press goes. `reality/results-h1refunds.json` |
| `known-failing-h2.ts` | Still shows its traces, not counted |

Two survivors, each with a reason: `gate.lane-key-unchecked`: parsed JSON always has a name, so the check cannot fail. `gate.cycle-unchecked`: the stack overflow is caught as "no name", so only speed changes.

**The first mutant pass found 8 survivors,** 6 of them real gaps or dead code, now pinned or removed. **`a-hold-parks-nothing` was vacuous as I first wrote it:** it copied a fault path with no Slot.

### Searches: 40 s each, serial [ran]

| Search | Depth | States | Result |
| --- | --- | --- | --- |
| `cross` | 6 | 44,856 | clean |
| `like` | 6 | 53,000 | clean |
| `frag` | 8 | 31,533 | clean |
| `session` | 5 | 41,330 | clean |
| `listen.none` | 6 | 47,360 | clean |
| **`odd`** | **5** | **23,889** | clean. Round 8: depth 1 at 139 states in 120 s |
| `pay` | 7 | 19,786 | clean |
| `crash` | 8 | 37,964 | clean |
| `flush.serialize.directed` | 12 | 9,311 | clean |
| `flush.serialize.queue`, with a mapper's throw | 9 | 11,688 | clean |
| **`flush.serialize.burst`, new** | 6 | 622 | clean. Slow per state: 70 sends a step |
| **`flush.serialize.wipe`, new** | 9 | 11,620 | clean. Oracle (a) off after a wipe: the stated limit |
| `flush.bare.tight` | 6 | 19,762 | clean |
| `flush.two.tight` | 4 | 16,206 | clean |
| `flush.frag.tight` | 7 | 23,628 | clean |
| `flush.pay.tight` | 14 | 3,362 | complete, clean |
| `listen.load` | 3 | 1,015 | **Fails, as on rounds 7 and 8.** H2 class, for entities |
| `fragstore.row`, 170 s | | 83,322 | **Fails, as on rounds 7 and 8,** same trace `Go ack put.lost GiveUp reload Fetch fetch.truth ...`. At 40 s it stops before reaching it. For entities |

Oracle (j) is in every one. **It has not caught a new bug here;** it kills `d115.ask-dropped` in the suite.

### Plants [ran]

Suite 13/13. Search, 30 s on `flush.bare.tight` or `two.tight`: `plants.txt`. `debounce`, `ignoresNow`, `noSilent`, `encodeOnTurn`, `hiddenWaits`, `noMerge`: inconclusive, as in round 8. (Corrected in part two: this said 5.) Overlap: my swap, gate and CLI runs overlapped the first plants; the tampers overlapped the first mutant pass; the final mutants, searches and real runs were serial.

### Tampers, on a copy [ran]

| Tamper | Result |
| --- | --- |
| `rm expected.lock` | **Fails** |
| Weaken a case, delete its lock lines | **Fails** |
| Weaken a case, `--lock` | Refused |
| Delete `checkClaims` from `main.ts` | **Fails** |
| Edit `report.ts`, `watch.ts`, `drive.ts`, `search/run.ts`, `pay.fixed.ts`, and the odd, session, listen, frag, fragstore, like searches; a CLI pin | **Each fails,** by name |
| Add a new search file | **Fails** |
| **Weaken a case and edit both its hashes in the lock** | **Still green.** Stated limit: read `git diff expected.lock` in review. This is about a tired agent, not a determined one |

## What overturned

| The review or I said | What ran | Consequence |
| --- | --- | --- |
| Review: only an ask in an ending's turn counts | Not taken: a correct bulk flow over real answers still gets cut with no ending [reasoning] | D115 |
| Review: `odd`, why not traced | **A cycle. `canon`'s sorting copies defeated JSON's cycle check, so each look overflowed the stack: 1.8 s a step** | `canon` walks. Suite 3.5x faster. A real cost: a cycle from a server took seconds per turn |
| Review: `canon` gives bigint text, "closes keys" | True for keys, but the same door guards memory and inputs: bigint would have silently written `"$1n"` into memory and input | D119: two texts |
| My D115 draft: delayed endings are safe | Reading it: a paced read could beat a newer ask, and reach a frozen life | Superseded; interrupted at a freeze |
| My D114 draft: a whole stand-in | A reload lost `input.id` too | Per field |
| Round 8 RESULTS: "a turn can never lose a completion" | Narrowed | D118 |

## Decisions (all proposed)

D114 a decline carries its input; only an Attempt can be a hold. **D115, replaces D110:** no rate budget; an ending chain with no I/O past 64 waits on a timer, failures back off and are named, successes only yield. D116 lock. D117 oracle (j). **D118** one rule for what a turn cannot take. D119 names and carried values. D120 `KeyFieldForm`. D121 server key: proposal only.

Removed: `asked`, `askMax`, `askWindowMs`, `mayAsk`, `EndingKept`, `encodableKey`, `ROUND_FILES`.

## For Arpit's read

Made under delegation, by the one rule in D118, overrule any:

1. **Is `W` a stuck state? Yes.** A release or a reload heals it, or now `cancel`.
2. **A kept ending blocks its key:** `idle` denies, a commit declines `Rejected`, whatever the policy. `row.undelivered` says how many.
3. **A refused deadline is kept** on the record, gone when its activation ends, carried by a retiring actor.
4. **A stream's failure and a read's answer are not kept:** a `stranded` wait, since a reload asks again. D109's sentence is narrowed to: never loses a write's ending or a deadline.
5. **A raise or stream key with no name:** named, the turn runs.
6. **A spin never ends by itself.** It slows to 1 per 30 s until a newer ask or a state change. Nothing is dropped. The price of "every ask ends".
7. **`1n` as a key restores as `"$1n"`.** One lane; a mapper's `key` differs after a reload. A bigint in an `input` still declines, with a lint.
8. **Server key on a contract:** before/after in `convergence-9.md`. My recommendation: accept, after entities show what they need.

## Costs

Runtime 133 lines larger across the files touched, net of the budget. Fixture about 300, cases about 400. `Compiled`: one optional field. A new key lane column. New cases each need a log line.

## Rules broken

None of Pay's. D110 replaced. `REV4-H4`'s bigint variant and two `REV8-STORM` variants removed by log lines, reasons there. `REV8-M9`'s door pins moved from `1n` to a `Set`. PAY-11 reads `undelivered`.

## Not run, and open

- **No independent review.** Mutants are mine.
- Sessions and entities after a wipe: `wipe` is in one alphabet, on `serialize`. Whether a wiped origin can be noticed: unbuilt, in `revisit.md`.
- `flow graph`, `story`, `trace`; `flow trace` naming `paced`, `parked`, `stranded`. Old mutant lists (about 180), `mutants-r8.ts`: their budget entries no longer apply.
- Real browser with a real spin: pacing ran on the fake only. Real H3, S3, S4 benches, Safari, phones, quota, real clock change.
- `nub run verify`, repo lint and formatter: throwaway files, as in past rounds.
- A kept ending still redelivers each boot, 2 more `InvalidTurn`, routed from wherever the machine is. A reset with no name still issues per evaluation. A chain of successes turning into failures past the bound is paced unnamed. `input` through Schema with `keyFields` is for typing `domain`.
- A module's own loop (`deliver`) is outside D115; I reasoned it is bounded by its backoff and did not test it. A sync-looking Effect that yields to the scheduler is not inline, so it never counts: it yields anyway, and can run hot at macrotask rate.
- Search depths at 40 s, not comparable to the review's 120 s under load.
