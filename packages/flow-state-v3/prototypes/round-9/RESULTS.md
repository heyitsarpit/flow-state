# Round 9, part one: a runtime and tests entities can trust

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

Suite 13/13. Search, 30 s on `flush.bare.tight` or `two.tight`: `plants.txt`. `debounce`, `ignoresNow`, `noSilent`, `encodeOnTurn`, `hiddenWaits`: inconclusive, as in round 8. Overlap: my swap, gate and CLI runs overlapped the first plants; the tampers overlapped the first mutant pass; the final mutants, searches and real runs were serial.

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
