# Round 8: the persistence edge and the tests

Status: proposed, throwaway. Ran on 2026-11-03, Bun 1.4.2, Effect 4.0.5, Chrome 146 headless over raw CDP, this Mac. Decisions: [../convergence-8.md](../convergence-8.md), D96-D113, all proposed. Marks: **[ran]**, **[read]**, **[reasoning]**. Reviews: [review-mid.md](review-mid.md), advice. Outputs here: `mutants-builder.txt`, `mutants-builder-before-redesign.txt`, `search-*.txt`, `plants.txt`, `reality/results-h1store.json`, `reality/results-h3.json`, `reality/h3-evidence/`; red: `../conformance/red-round-8.txt`.

**Verdict.** **H1 is closed by removing `acked`,** on the fake, on real IndexedDB and on `Checkout/Refunds`: round 7 12/12 second key beside an undecided first, round 8 0/12. **H3 has a cause.** It is Chrome's own corruption recovery, on a log holding a bare record header that an earlier kill left. It is not main-only, and it deletes the origin at a later, ordinary open. **The doors, the refused ending and the spin turned out to be one problem** and were redesigned together after the mid-session review. **The harness is what was weakest:** three of round 7's kills were false, and four of my own first pins passed with their target removed.

**Read first:** "H3", "What reality overturned", "Owner's calls".

## What I read

`AGENTS.md`, memory notes, `HANDOFF.md`, `README.md`, `round-7/review.md`, `round-7/RESULTS.md`, `round-7/review-mid.md`, `convergence-7.md`, `round-7/edge-proposal.md` (by its summary in the reviews, not line by line), the runtime's `durable`, `edge`, `driver`, `lane`, `reads`, parts of `turn`, `gate`, `inc`, `world`, `publish`, `step`, `adapter`; `conformance/` drive, fake, harness, main, mutate, gate, flush search. `machine-design.md` not reread: nothing here needed a rule's text beyond what the reviews quote.

## What ran

| Item | Result |
| --- | --- |
| Red | First pass on round 7's code: 15 new cases failed, the rest pin what was already true. Second pass on the code before D107-D111: 6 failed, and `REV8-STORM` was killed by the watchdog at 1,573 MB in 1.6 s. One case had to be rewritten to fail at all (below) [ran] |
| Suite | See "Final runs" |
| **H1, real IndexedDB, store slowed 400 ms by a real second transaction, renderer crash once the request arrived, then a press** | `serialize` bare: round 7 **12/12** second key beside an undecided first; round 8 **0/12**. **`Checkout/Refunds`: round 7 12/12; round 8 0/12** [ran]. On Refunds round 8 still shows 2 keys in 12/12: the restored head resends under its own key, is answered, and only then does the new press go. Two refunds somebody asked for, not H1 |
| Pay's H1 on real IndexedDB, plain abort | 12 cycles: 0 two charges, restored `UNSURE` 12, final `PAID` 12 [ran] |
| Directed search `flush.serialize.directed` | **Round 7: finds H1 at depth 11 in 43 s,** the review's own trace, by oracle (a). Round 8: complete to depth 12, 26,279 states, clean, before the second pass [ran] |
| `tsc --strict` on typed | 0 errors. `fake-world.ts`'s `claim` fixed [ran] |
| `known-failing-h2.ts` | Still shows its traces, not counted. Not changed [ran] |
| Tamper checks on a copy | Hash logged under another id: fails. Bulk reason: fails. Renamed variant: named as removed, fails. **`--lock` with a weakened case: refused.** Edited search, gate allow list, CLI pins: unlogged, fails [ran] |

### Why the builder's three search-only kills did not reproduce [ran]

**They were false kills.** At `30d3290f`, where they ran, `flush.pay.tight` fails on the *unmutated* code in 15 s (`{"killers":[],"search":"failed"}`). `f4b13887` then pinned that class, P4. So every mutant reaching the search "died", and exactly those three reached it. At `f4b13887` all three survive. So `mutate.ts` now runs a control first and stops if it fails; it caught two real breakages this round.

### Why no search kills a core mutant [ran]

- **By selection:** `mutate-one` ran a search only on what scenarios had already missed.
- **On their own, searches do kill, within their oracles and alphabet:** 3 of 15 sampled core mutants, by a state budget of 3,000 per search with no scenario first. They find what breaks an invariant inside the alphabet: `head-restores-not-sent`, `poison-*`. A fourth, `lane.promote-skips-durable`, once an alphabet had `ok`.
- **What they miss is outside the oracle or the alphabet:** a capped retry, a named issue, a batch's timing. `driver.after-drain-ignores-work` publishes a real cut, so no oracle minds it.

**So a search is not paying for itself as a regression gate, and it is no longer one.** `mutate-one` runs suite, `--swap`, typed compare and date check, CLI pins, 5 s gate; `--search` adds a directed search by state budget. A search hunts new traces, with a small alphabet per risk: `.directed` for a store, `.queue` for what waits behind a head, with a hold, a retry and a refused turn. The wall-clock budget made results depend on how busy the machine was; a state budget does not.

### Mutants. **Builder-written, not independent.** [ran]

64 listed, by the review's names where it gave one. Each kill by a gate: `mutants-builder.txt`. Totals at the end. Survivors, each with a reason:

| Survivor | Reason |
| --- | --- |
| `driver.credit-kept` | A connection id is unique per connection, so a leftover credit is a map entry and nothing reads it. Memory only. Not pinned |
| `durable.ticket-not-fenced` | The phase check beside it covers what I can reach: a same-Attempt durable phase with another ticket needs two tickets out, which `ackOut` and the edge prevent [reasoning]. Kept as a defence |
| `turn.refusal-keeps-asks` | Equivalent by reading: the world and `touchedLanes` are restored, so a leftover ask names a lane it no longer matches and `flush` passes over it [read] |
| `durable.plain-lane-write-unstamped` | Only the ticket's stamp is pinned. A plain lane write with no stamp can lower the floor only if nothing else in that boot landed a stamp. Narrow; not pinned |

Typed and CLI read 0/21 for the review because the runner ran neither. Now `typed.*` and `cli.*` die by `--swap`, date check and pins. `durable.deadline-not-now` dies only by the gate. `turn.no-ask-budget` dies by the watchdog: what it means.

**The old list (about 180) and round 7's 32: not rerun.**

### Plants, rerun on round 8 before the second pass [ran]

13 of 13 caught by the suite. Search as in round 7, now with oracle (h) reading the record: `plants.txt`. Not rerun after the second pass.

## H3: what deletes the origin

**Chrome does, on purpose.** [ran]

```text
ERROR: backing_store.cc:244  Failed to open LevelDB database from ...indexeddb.leveldb, Corruption: checksum mismatch
ERROR: backing_store.cc:1649 Got corruption for { origin: http://127.0.0.1:... }, checksum mismatch
ERROR: backing_store.cc:1515 IndexedDB recovering from a corrupted (and deleted) database.
```

12 of 12 wipes with `--v=1` show exactly this; no good cycle does. `reality/h3-evidence/`.

**What the corruption is.** I copied the log as the kill left it, before Chrome read it, and read it by hand (`reality/leveldb-log.py`). In **12 of 12** wipes with a copy, the first bad record is a **bare 7-byte header claiming 72-193 bytes, followed at once by a whole record from the next process.** It sits tens of KB before the end of the file, so it was written cycles earlier. Reading that together [reasoning, Chromium's source not read]: LevelDB's header and payload are separate writes, a process killed between them leaves the header, the next open tolerates a short tail and appends after it (`reuse_logs`), and from then on the tail is a bad record in the middle, and the open after that fails.

**The same thing with no kill timing at all:** stop the browser cleanly, append those 7 bytes, open, read, write, stop, open, read.

| Experiment, 12 cycles each | First open | Second open |
| --- | --- | --- |
| Planted header, second stop a kill | sentinel there 12/12 | **wiped 12/12**, Chrome says corruption 12/12 |
| **Planted header, second stop a clean `Browser.close`** | 12/12 | **wiped 12/12** |
| No plant, control | 12/12 | wiped 0/12 |

**Under a loop of `strict` writes at the kill, one profile living through the run:**

| Kill | Cycles | Wiped |
| --- | --- | --- |
| `killMain` | 285 | **12** |
| `killTree` | 71 | **5** |
| `crashBrowser`, CDP `Browser.crash` | 64 | **2** |
| `killMain`, a new profile each cycle, so only one open after any kill | 52 | 0, as the mechanism predicts. Few |

**Consequences.**

- **It is not main-only.** The review's 0 of 299 for other kinds is not reproduced under load. What decides is, I think, whether the storage process was between those two writes [reasoning]. Its runs had far less writing at the kill; not reconciled further.
- **It is two steps apart.** A kill tears; the browser runs on and the page sees nothing, and everything still reads. **The open after that deletes the whole origin, even after a clean exit.** So "a recent hold" is wrong too: a hold written since the tear goes with it.
- **It costs writes to be at risk.** Fewer writes at a kill mean a smaller window [reasoning]. D111 removes one transaction per commit, and D80's coalescing is on the right side of this.
- **Any site's IndexedDB is exposed to this** [reasoning]. Nothing about it is specific to us.

**Design for it, regardless:** `REV8-WIPE` pins it. With the Attempt's key a wiped hold gives a second key beside an undecided first: the stated limit. With a business key the server sees one key. That is the decided rule for money.

**Not run:** headed Chrome, a user's own long-lived profile (mine is a persistent throwaway directory), macOS Force Quit, power loss, other browsers. Chromium's source not read, so "two separate writes" and `reuse_logs` are inferred from the bytes. A rate in ordinary use: unknown; mine is a stress test.

## What reality overturned

| The fake, a review or I said | Reality [ran] | Consequence |
| --- | --- | --- |
| "Who deletes it: not established." H3 is a main-process kill | Chrome's recovery, on a torn log. `killTree` and `Browser.crash` too | The limit is restated, and larger: a wipe at a later ordinary open |
| Round 7's three search-only kills | The search failed on the unmutated code | Control first |
| A `head.acked` distinction worth keeping | 5 reads of the field in 563 cases, nothing else moved | D96 |
| `Refunds` second key: read, not run | 12/12 on round 7, 0/12 now. A plain count of keys says 2 on both, so the oracle is "beside an undecided first" | Stated |
| My first M2 case | Passed on round 7: it set `due` to 0 by sending while hidden. Seen because the mutant survived | Rewritten, seen failing. Also fibers, lane id, firing |
| M3's repeated id "harm not traced" | A read's ending reached another copy: `copy z got its own read: expected "z", got "p"` | D99 |
| `meta` needed for boots | Stamps alone pass everything | D111 |

## Decisions (all proposed)

D96 `acked` gone; D97 an answer to a hidden page issues at once, backoff apart; D98 `work()` false after a fatal; D99, D111 a record's stamp is the boot floor, `meta` gone, a hold no longer rewrites per boot; D101 `mutate-one` runs the round's gates, with a control; D102 pins; D103, D113 the log is keyed by id, `--lock` refuses, what gates depend on is hashed, an unparsable mutant is `INVALID`; D104 wipe and slow-after-ack in the fake; D105 kills named; D106 a wiped origin pinned; D107 a hold's route last; **D108, replacing D100's mechanics,** one door gated at seal, one reader, one table by verb; **D109 a turn can never lose a completion;** **D110 256 asks a second per actor and operation;** D112 write-ahead checked in every step of every case and search.

**The stated answers the coordinator asked for.**

- *A turn can never lose a completion.* An ending whose turn refuses twice is kept: on disk as a parked ending, delivered at the next boot or adoption, with a `parked` wait saying so. A hold's lane already holds it. A read's becomes a `stranded` wait. **The machine still sits in `W` until a reload:** visible, not fixed. A release that fixes the closure heals it (`REV8-KEPT`).
- *Unbounded self-looping.* The bound is at the ask, never at an ending, since an ending must not be what drops. Past it the ask does not start, `TurnStorm` once, `stranded`. The budget returns with time.
- *Two codecs,* on purpose: `toCodecJson` carries a value and must give it back; `canon` names a lane and need not. **The gap:** an `input` is carried and goes through `canon`, so a `Date` in one resends as a string. It belongs with `keyFields` in the compile step, as hand-written `Compiled` has no Schema. Assumption 5 stays half.

**Doors left, stated:** a stream's key and a raise's key refuse through their own paths. `frozen.parked` poison: read by the reviewer, not run. Low: a superseded bad lookup's failure can arrive after the newer read started, as it has no generation.

## Mid-session review, by finding

| Finding | State |
| --- | --- |
| M1 restore's order | Fixed, D107 [ran] |
| M2 D97's case | Fixed before the review arrived; `edge.hidden-not-issued` dies [ran] |
| M3 exit 1, runner cannot run | Fixed before it arrived [ran] |
| M4, M5, D100 | Redesigned together: D108-D110 [ran] |
| M6 three vacuous pins | Fixed; each named mutant dies. **`firing-not-saved`, traced:** a firing doesn't touch the record, so nothing writes it unless something else writes that actor while the firing is in mail. The case now has a `Note` ahead of it [ran] |
| M7 tampers | Fixed [ran]. A determined edit of the log itself still passes, and should |
| D99's proposal | Taken: D111 [ran] |
| Oracle (h) | Every step, in every gate; 0 false alarms in 621 cases. `durable.head-off-disk-on-the-wire` dies by it [ran] |
| Syntax-error mutant | `INVALID` [ran] |
| Search reaches a hold, `throwIn` in an alphabet | `.queue` [ran] |
| Reviewer's own mutants | **Not rerun by me:** they are in its scratchpad |
| Stale names (`Purpose`, `byEnding`'s dead branch, `machine-design.md` lines) | Left, for the merge. Listed in the review |

## Findings, by age

| Age of the code at fault | High | All | What |
| --- | --- | --- | --- |
| r1-2 | 0 | 2 | Restore order (M1), the spin (M5) |
| r3 | 0 | 2 | Refused ending (M4), doors |
| r6, r7 harness | 0 | 3 | False kills, gate reasons, log |
| r7-edge | 1 | 4 | H1, M2, M3, fatal |
| r8, mine | 0 | 7 | Spaced names in the lock, four vacuous pins, D97's window read wrong at first, a `pkill` of mine |

**What I got wrong, plainly.** Four pins passed with their target removed. The first red run left a spinning case unwatched for two minutes: I ran one suite without `watch.ts`, against the brief, and it ran up to the bash timeout before I killed it. My `pkill -f` matched my own shell's command line too, and took that shell with it; no Chrome and nothing else of Arpit's. Checkpoint 1's lock made `main.ts` exit 1 and I did not notice; the review did. `--driver round-7` controls ran after the harness had grown, which is fine, but they share `conformance/`.

## Rules broken

- **"Run under `watch.ts`":** once, above.
- **2.10.15, rule 44:** a head on disk never restores `NotSent` (D96); within a lane, `W` before head (D107). Mine, reasons above.
- **D50's "after the redelivery, nothing":** replaced by D109.
- **Round 7's `StorageRefused` for a commit that cannot encode:** now `Unencodable`.
- **`REV4-H4`'s refusal for a reset value:** gone, logged. A turn that refused now runs: the one place an expected result is weaker on purpose.
- **Pay:** byte-identical to `397a2e2c` [ran by `git diff`, final runs].
- **Round 7's folder untouched,** apart from nothing: `cdp.ts` keeps `kill` for it.

## Owner's calls, made and reported

1. **A machine with a kept ending still sits in `W`.** I chose visible over a declared fallback or falling through alternatives. Overrule if you want an API for it.
2. **256 asks a second** is a guess.
3. **Frame numbers may repeat across a boot that landed nothing** (D111). Evidence only.
4. **A wiped origin could be noticed:** a `localStorage` flag, "this origin has had a boot", against an empty database would let a host say so, and hold back a first send. **Proposed, not built:** in `revisit.md`.
5. From before, still yours: 2.10.15's row; a second tab's button.

## Assumptions, changed

| # | Assumption | State |
| --- | --- | --- |
| 2 | A record stays | **Limit, with a cause.** Can go at a later open |
| 7, 24 | An awaited write is right when it goes; a ticket's value lands | **Closed:** a record with this head landed |
| 8 | Timers fire on time | Mostly: M2 closed |
| 21 | The store answers truthfully | False in effect: H3 |
| 25 | `meta` is only a floor | Gone |
| 34, 36 | A synchronous failure is rate-limited; a refused turn can be redelivered into success | Answered: D110, D109 |
| 35 | The last ending at restore is the one that matters | Now true: D107 |

## Costs

Runtime about 60 lines larger: `gate` +20, `durable` about 0 (`meta` out, stamp in), `turn` +30, `world` +15, `reads` +10. Round 8's scenarios about 700 lines, fixture about 280. Harness: `h3.ts`, `h3-plant.ts` throwaway.

## Final runs

FINAL_RUNS

## Not run

Safari, Firefox, a phone, power loss, real quota, real clock change, headed Chrome, a user's own long-lived profile. S4 and S3 benches on round 8. Other real-browser sections of `run7.ts` beyond `h1`, `h1store`. Old mutant list. `flow graph`, `story`, `trace`. A typed program reaching the doors: hand fixtures only. `nub run verify`, repo lint and formatter: throwaway files, as in past rounds. Plants, `cross`, `like`, `frag`, `odd` after the second pass. An independent review of the second pass.
