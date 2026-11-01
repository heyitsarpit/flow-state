# Round 3: fragments and every fix, on one rewritten turn

Status: proposed, throwaway. Everything marked ran was run on 2026-11-02, Bun, Effect 4.0.5, this Mac, one process at a time, under `conformance/watch.ts`. Decisions: [../convergence-3.md](../convergence-3.md). Outputs here: `suite-output.txt`, `mutants-second.first.txt`, `mutants-second.txt`, `search-*.txt`; red: `../conformance/red-round-3.txt`.

**Verdict.** The shape held again: traits, subroutines, `.each`, `resetOn`, `.resumable()`, subject paths, parking, adoption and releasing run on one step, under budget, and D24's cut did not land. The review's Highs are fixed on what ran. **It is not done.** An independent author, who read no scenario, killed 35 of 50, the same order as last round (26/36, 20/31). His reading also found real bugs the green suite did not, one of them in rule 60. A green suite here is weak evidence. Do not start streams before reading the seam section: its new hooks are paper.

## What ran

| Item                                                                                     | Result                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Red, no runtime                                                                          | 0/224 cases. One first passed vacuously (SURV-09); fixed before the red commit                                                                                                                                                                 |
| Scenarios                                                                                | **234/234 cases**, under 1 s, peak 160 MB. Unlogged changes: none                                                                                                                                                                              |
| Second author's mutants (Opus, read no scenario, search, fixture or earlier mutant list) | **First run 35/50 (70%). This is the reported number.** After I added FRAG-20 from his survivors: 40/50, which is not independent                                                                                                              |
| SEARCH-PAY, per-authorization oracle, narrow pins                                        | **depth 9 complete, 117,173 states at my stop**: new states per depth 1, 2, 11, 36, 123, 385, 1265, 4397, 15812, 57690 new states. Stopped by my 240 s limit in depth 10: inconclusive past 9. 27 classes, all pinned, 0 unpinned. Peak 342 MB |
| SEARCH-PAY on `pay.fixed.ts`, no pins                                                    | **Failed as expected:** depth 8, 10,684 states, 14 classes. Mostly Leave then Start                                                                                                                                                            |
| SEARCH-LIKE                                                                              | depth 8 complete, 234,168 states, 172 s, 403 MB. No oracle failed                                                                                                                                                                              |
| SEARCH-CROSS (new, review H5)                                                            | depth 7 complete, 183,350 states, 111 s, 315 MB. No oracle failed. Not closed: depth 7 added 139,473                                                                                                                                           |
| SEARCH-FRAG (new)                                                                        | depth 10 complete, 18,043 states, 16 s. No oracle failed. One copy only                                                                                                                                                                        |
| Limits                                                                                   | No watchdog kill. Highest mutant peak 278 MB; poll 15 ms, limit 1.4 GB. Every run was under the watchdog                                                                                                                                       |

LIKE, CROSS, FRAG and payFixed ran before the last fake change (`mayHave`), which only their hash reads, so state counts could move by a few. PAY was rerun after it.

**Surviving, after FRAG-20 (10):** `s-pending-reset-after-adoption`, `s-abandoned-reads-final-memory`, `s-late-leaves-subroutine` (my scenario is denied by the pending-call clause too, so the subroutine clause stays untested), `s-late-filling-may-leave`, `s-commit-from-other-path-joins` (no scenario on a non-`reject` lane), `s-queued-firing-not-retracted`, `s-defect-keeps-effects` (the fault throws before the hook does anything, so D46's rollback has **no test**), `s-bad-record-reaches-boot` (a record that parses with a bad tree), `s-redelivery-jumps-mail`, `s-restore-unsorted` (the fake returns records in mint order, so **rule 44's order is not really tested**).

Citations with at least one killing mutant: 34/104. Report says "covered", not "proven" (D56). UNTESTED owed: see `suite-output.txt`.

## Findings

### Plan right, code wrong

| Id                                              | Finding                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Round 2's runtime**                           | H1, H2, H3, H4, M1, M3, M7, M8 reproduced as scenarios first, then fixed. See convergence-3                                                                                                                                                                                                                                                   |
| Second author's reading, fixed after his number | `markResend` promoted `W` entries it had just ended (rule 60), **no scenario reaches it, so the fix is unverified**. A re-entered resumable trait was ended (rule 1). A freeze left nested children's timers running (rule 1), **fix unverified: no nested fixture**. D15 yielded with its waiter gone. A freeze noted `Superseded` (rule 52) |
| Second author's, not fixed                      | A releasing lane's restore skips the store's mark (2.9.3 against "marks across a reload are lost")                                                                                                                                                                                                                                            |
| My own, at build                                | Runtime named its fault module and `entities` in two places, and a resumable thaw does not check `resetOn`. The first is gone. **The second is not built**                                                                                                                                                                                    |
| P1-P6                                           | **Pay's bugs, pinned, Pay unchanged.** Fixes proposed in convergence-2. Pay's memory, one intent and one `authorized` bit, is the owner's call. On the real `CHALLENGE` machine, P6's press reaches `LateMayNotLeave` on a placed order: FRAG-20 pins that shape                                                                              |

### Plan wrong

| Id                           | Finding                                                                                                                                                                                                                                                                                              | Evidence                        |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| D41 (mine, round 2)          | Replaced by D47                                                                                                                                                                                                                                                                                      | HIGH-04                         |
| D45's text (mine)            | One bit was enough: `sent` and `unknownOnce` were never needed. Corrected in convergence-3                                                                                                                                                                                                           | Built; second author flagged it |
| D39                          | Narrowed: only a re-send waits for a repair. D47 makes a new write overtaking one safe, by reading. Without this, every retry that first failed to land stalled the queue on one more read                                                                                                           | Suite churn; SEARCH-CROSS held  |
| D47's cost                   | A re-send that lands fresh after a repair said "not there" **always** differs, so it always costs one more read, and the screen shows old data until it answers. I expected the common path to be free; only the landed case is (HIGH-04b). The owner may prefer showing the answer during that read | Ran: LIKE-01, CART-02           |
| Rule 8 against D31           | D50: redelivered once                                                                                                                                                                                                                                                                                | PAY-11                          |
| "Disjoint keys" (2.5 step 5) | "A new incarnation's initial memory and a later part's patch do not overlap" contradicts rule 1's raise into a fresh incarnation. I enforce it among patches only                                                                                                                                    | FRAG-02                         |

### Plan silent

| Id                           | Finding                                                                                                                     | Decision                    |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| Harness                      | `dispose` meant retain expiry for a persisted identity, `disposeActor` otherwise. One `dispose` step, chosen by `persisted` | Stated                      |
| A retired actor at reload    | Comes back as a live actor from its record                                                                                  | Shortcut                    |
| `NotSent { ModuleDisabled }` | A new why. Real handlers map `NotSent`, so it reaches them                                                                  | Proposed, D46               |
| `.each` with `resetOn`       | The design says a reset removes every instance; memory then re-adds them in the final list                                  | Built that way, no scenario |

### Costs (formatted, comments in; stop 10,000 is **the owner's**, D38's 12,450 not used)

| Part                                                    | Round 2   | Target    | Stop      | Actual                                     |
| ------------------------------------------------------- | --------- | --------- | --------- | ------------------------------------------ |
| Step, turn, world, seam, hooks, without fragments' turn | 1,086     | 1,500     | 1,800     | 2,168 less 769 of `turn.ts` growth = 1,399 |
| Fragments: `inc.ts` 175 + `turn.ts`'s growth 769        | 0         | 700       | **1,000** | **944**: D24 does not trigger, by 56 lines |
| Lane                                                    | 419       | 520       | 650       | 561                                        |
| Reads, timers                                           | 114       | 200       | 280       | 77                                         |
| Write-ahead                                             | 242       | 320       | 420       | 298                                        |
| Publication                                             | 78        | 110       | 160       | 97                                         |
| Driver                                                  | 247       | 280       | 360       | 253                                        |
| Entities                                                | 314       | 420       | 550       | 404                                        |
| **Core + driver + entities**                            | **2,500** | **4,050** | **5,220** | **4,033**                                  |
| Adapter                                                 | 155       |           |           | 190                                        |

My budget accounted fragments' share of `turn.ts` after the fact, stated in convergence-3 before the code. Without that split, the first row is over its stop.

**Projection against 10,000 [estimate]:** 4,033 now, plus streams 1,100-1,500, context and resources 700-1,000, cache and keyed schedules 500-800, entities' remainder 600-1,200, Inspection 400-600, driver's scopes 350-700, write-ahead 200-400, `check()` and `activities` 200-400, lane's `cancel` and `allow` 100-200: **8,180-10,830, midpoint about 9,500.** Below last round's midpoint because `inc.ts` came in small; it may flatter, as there is no `check()` here. 10,000 is reachable and not safe.

**Bundle** (`bun build --minify`, gzip, Effect external): core with driver **16.8 KB against round 2's target of 14: over.** Entities alone 2.6 KB. A bundle from `driver.ts` holds no `startRepair` or `readRecord`; no core file names `entities`.

## Questions

- **Do fragments and streams share one seam?** On paper, yes, with two hooks and four capabilities: convergence-3's table. **Not run.** S5's Form A was a spike, not this runtime. Fragments needed no hook at all.
- **Hooks:** 12 built (was 14); 14 with the paper ones.
- **A sync engine behind the seam?** Same hooks on paper. Not built, not tried against `db`.
- **Is the core pure?** Replay re-executes each boot's log on every scenario case, and the case passes. I did not rerun the review's deep-freeze check.

## Rules broken

- **D27, D31, D41, D39:** replaced or narrowed: D46, D50, D47.
- **Rule 31's "contested":** collapsed into one repair, D47.
- **Rule 24, OD20 F4:** a never-sent cancel or replace waits for its ack, D48.
- **Rule 44:** D15's one release of a hold, as convergence-1 wrote it.
- **Rule 29:** `latest` replacing a head whose ack is out queues first, D48.
- **Rule 12 and rule 9's dead-incarnation clause:** partly: a raise that a later selected state change exits is not a defect here.
- **Flattened:** `reserveShipping` is `latest`, not `cancel`. No ADDRESS, no `activities`, no keyed schedule. Comments has only post and delete. No `check()`.

## Not run

Streams, or any paper hook. `flow check`. `cancel`, `allow`. Keyed schedules. S4 (no browser question this round; L1's watchdog print waits for the next S4). A real `fetch`, IndexedDB, Node, Safari. `pay.scenario`-sized reread of old tests against their citations. `tsc` strict: I ran one `tsc` on `round-3/adapter.ts` during the build and its output filtered to `round-3` was empty; `nub run verify` not run. A review by Opus of this round: owed.

Lint on `round-3` and `conformance`: 612 errors, 2646 warnings, not chased.

## Limits

No limit breach. One command of mine hung for 180 s on a stray `cat` with no input, unrelated to the runtime; stopped. SEARCH-CROSS has one fixture and no fragments. SEARCH-FRAG has one copy. The money results are under a fake that answers what the search picks. The second author's 50 are one reader's choice.
