# Round 8: final independent review

Status: advice. **Everything here is proposed.** Reviewer: Opus, did not build round 8. Commit `7a238a20`. Marks: **[ran]**, **[read]**, **[reasoning]**. Ages: r1-2, r3, r6, r7-edge, r8 (first pass, checkpoint), r8-second (D107-D113). Chrome 146 headless, this Mac, Bun 1.4.2. Experiments ran in a detached worktree and copies under the scratchpad, under `watch.ts`. Each command stayed under 5 minutes; the mutation loop ran as chunks under that limit. Peak: Bun 306 MB in searches, mutants killed at 1,400 MB by design, Chrome 704 MB. **Trees overlapped** while mutants, searches and Chrome ran, so kill rates below were taken under load.

## Verdict

**The money path holds. No double send, no lost hold, and no tamper with the write-ahead rule got through.** H1 real reproduces 0/12 on bare, on Refunds and on Pay [ran]. D107, D108's mechanism, D111, D112 and the plants hold up.

**D110 does not. It is the one High: a correct program loses writes silently.** 300 ordinary sends to one actor and operation in one tick: 256 go, 44 never start and never end. The turn commits, the optimistic patch stays, no row, no ending, and the `stranded` wait is erased by the next ask [ran]. 300 `.each` rows that each load once: 44 stuck in `L` for good [ran]. A 3-line patch fixes all of it [ran, proposed].

**D109's sentence, "a turn can never lose a completion", is not true yet.** One line: a `NotSent` has no attempt, and `undefined === undefined` makes it look like a hold, so it is dropped with `waits: []` and the machine stays in `W` across reloads (`turn.ts:1019`) [ran]. A firing and a stream's failure also go, by doors D109 did not cover [ran]. Where it does keep the ending, the stuck state is honest to Inspection and silent to the app.

**H3 is established, better than RESULTS says.** Bare header 10/10 in my own wipes, plant 6/6 with a clean exit, Chromium's code read. The rates reconcile with round 7: it is write load, not kill kind, as far as I could measure. Round 7's 13/248 for main-only is not explained.

**Tests:** cases are good where they exist. 67/91 of my mutants die. D108 is pinned well, D109 and D110 are not. Nothing can see a missing ending, which is why the High got through. Tampering is still easy: delete the lock, or edit `main.ts`.

**Runtime and tests can be trusted for round 9 once the first three items of "What round 9 must do first" are done. Do those before entities: bulk writes are what entities do.**

**What I'd read first:** `turn.ts:630-645` with `:674` (the budget), `turn.ts:1019` (the lost `NotSent`), `main.ts:216` (a missing lock is green).

## Reproduced

| Item | Claimed | I got |
| --- | --- | --- |
| Suite | 621/621, exit 0 | 621/621, exit 0, nothing unlogged, 266 MB, 12.4 s [ran] |
| `--swap` | 621/621 | 621/621, exit 0 [ran] |
| 5 s gate | 29 failed, 29 expected | Same, none different, none passing [ran] |
| CLI pins | pass | All pass, 15 PASS lines [ran] |
| `tsc --strict` on typed | 0 errors | 0 [ran] |
| Data diff, date check | 52, pass | 52, pass [ran] |
| Pay | no diff from `397a2e2c` | No diff; lock line present [ran] |
| H1 real, bare, hold 400 ms | 0/12 | **0/12,** 12 arrived, 1 key each, restored `U` 12, final `W` 12 [ran] |
| H1 real, Refunds | 0/12, 2 keys | **0/12 beside an undecided first,** 2 keys 12/12 [ran] |
| Pay's H1 real | 12 failures seen, 0 two charges, `UNSURE` 12, `PAID` 12 | Identical [ran] |
| Plants, not rerun by builder | | **Suite 13/13. Search 6/13** (`oldWins`, `partial`, `poisonDeletes`, `poisonAll`, `storedEarly`, `noTicket`) and `twoOut` by its assertion. The rest `inconclusive`, as in round 7 [ran] |
| Searches, not rerun by builder | | Below |

| Search, 120 s, under load | Depth | States | Result |
| --- | --- | --- | --- |
| `cross` | 6 | 104,398 | clean |
| `like` | 7 | 109,893 | clean |
| `frag` | 8 | 76,801 | clean |
| `session` | 6 | 100,123 | clean |
| `listen.none` | 6 | 114,590 | clean |
| `flush.serialize.queue` | 10 | 41,542 | clean |
| **`odd`** | **1** | **139** | Inconclusive, the same with oracle (h) off, so not D112. It looks at almost nothing. Why: not traced |
| `listen.load` | 3 | 938 | **Fails:** "silently wrong". **Same failure on round 7's runtime** [ran]. H2 class, pre-existing |
| `fragstore.row` | 7 | 80,321 | **Fails:** `Go ack put.lost GiveUp reload Fetch fetch.truth landLate`. **Same on round 7 at 77,243 states** [ran]; the earlier 30-45 s budgets stopped before it. A write given up and landing after a read. For the entity redesign |
| `flush.serialize.directed`, to depth 14, past the builder's 12 | 13 | | **Fails, false alarm:** `(c)` on `Go`x13 `ack`. Drain is `i < 24` (`flush.search.ts:253`), too short for 13 Attempts, so a `Forget` meets a wire. By hand: nothing wrong [ran]. Low |

My own: a search with a `WIPE` action and a business key, oracle "one server key", `checkClaims` per state: clean, 30,000 states [ran].

## My mutants

**Written before opening `RESULTS.md`, `STATUS.md`, `mutants-r8.ts`, `mutants-builder*.txt` or any `round8.scenario.ts` body.** I had read then: `AGENTS.md`, `HANDOFF.md`, `round-7/review.md`, `round-8/review-mid.md`, `convergence-8.md`; all of `turn`, `durable`, `gate`, `edge`, `publish`, `reads`, `world`, `inc`, `lane`, `driver`, `step`, `hooks`, `adapter`; `conformance/` `main`, `mutate`, `mutate-one`, `gate5s`, its allow list, `drive`, `harness`, `watch`, part of `ctx`, the first 60 lines of `build.ts`, and a grep of `check.ts`. Overlap with the builder's list, checked afterwards: **5 ids of 91.** Run by the committed, unmodified `mutate.ts`, control green in every chunk (38-41 s).

| Part | Killed |
| --- | --- |
| D107 | 3/4 |
| D108 | 14/18, with one invalid edit of mine corrected and rerun |
| D109 | 8/14 |
| D110 | 10/15 |
| D111 | 9/10 |
| D112, runtime lies | **5/5** |
| Others | 18/25 |

**67/91.** By gate: suite 60, 5 s gate only 2, CLI 1, watchdog 4 (`d110.off`, `lookup-free`, `commit-free`, `wall-clock`: the spin itself). Equivalent or close by reading: `lane.byending-dead` (the dead branch), `turn.refusal-keeps-asks` (agree with the builder), `adapter.asked-in-hash`, `d110.refund-kept`, `d109.no-evidence`, possibly `d107.w-releasing-delivers`. **Sampled against cited reasons** [ran]: `d109.not-kept` by `REV8-KEPT`, `d108.*` by the named `REV8-M9` cases, `d112.*`, `gate.canon-*` by `REV8-PINS`: all for the reason named.

**Survivors that matter:**

| Survivor | What it means |
| --- | --- |
| **`turn.refusal-keeps-commands`** | A refused turn's commands stay. A lookup's `invoke` from a turn a later follow-up refuses would still leave. **The turn's rollback is half unpinned** |
| **`d109.hold-parked-too`** | Removing the line at fault in M1 passes. `a-hold-needs-nothing` reads the row and not `parked` |
| `d109.unpersisted-parks`, `unpersisted-silent`, `subject-lost`, `strand-invisible` | D109's branches other than the one pinned |
| `d108.reset-not-constant` | "A reset value with no text fires no reset" is unpinned. `d108.ungated-reset` dies only at the gate, the same accident as mid-review M6's third |
| `d108.commit-subject-lost` | A fragment's `Unencodable` decline with the wrong subject would park for nobody |
| `d110.sliding`, `issue-each`, `retry-free`, `cancel-counts` | The budget's edges, including whether a retry counts |
| `gate.raise-key-ungated`, `gate.stream-key-ungated` | The doors RESULTS calls stated have no pin |
| `gate.lane-key-unchecked`, `d108.guard-no-reason` | **Reported by the mid review; unpinned** |

---

## D107-D113

| Id | Verdict | Evidence |
| --- | --- | --- |
| **D107** | **Right for a checked machine** | `d107.head-first` dies. Real 12/12 `U`. A machine where `W` alone handles `No` and `Unsure`: `No` moves to `A`, `Unsure` is `Unhandled`, row uncertain, no prompt, no issue [ran]. Before D107 it reached `U`. But `flow check` rejects that machine: `Rule20Adopted` on `A` and `B` [ran]. So D107 leans on the check. Low. `retryable` in `W`'s handler now sees `Settled`, not `Held` [read]; no harm found |
| **D108** | **One door, for what it says** | Keys, inputs, module values, guard keys, resets: gated at seal, 14/18 of my mutants die. **Not one door:** a raise key (`gate.ts:152`) and a stream key (`gate.ts:237`) still refuse or issue, stated. `frozen.parked` poison, open from the mid review: not reachable now, since it holds only `Interrupted` with an input that has passed the gate [read]. Two problems: M1's mapper, M5 |
| **D109** | **Not yet what it says** | M1, M2, M3 |
| **D110** | **Wrong bound** | High, M4 |
| **D111** | **I could not break it** | A record's ids are minted at or below its stamp in every write path [read]. A hold does not rewrite [read]. Unreadable records still count if they parse. Mint repeats only a dead one, and entity marks are not saved [read]. Only `d111.stamp-any-type` survives, Low. Frame repeats: evidence only |
| **D112** | **Good, and cheap enough** | 5/5 runtime lies die, and in every search but `odd`'s depth. Blind spots: `raw` steps are not checked; an operation with no idempotency key is invisible; business keys exempt by design [read]. Oracle off changed nothing in `odd` [ran] |
| **D113** | **Partly** | `--lock` refuses [ran]. `INVALID` works: my own bad edit said so [ran]. Hashing is incomplete: M7 |

---

## H3

**Established** [ran]:

| Experiment | Result |
| --- | --- |
| Planted 7-byte header, second stop `Browser.close` | **wiped 6/6,** Chrome says corruption 6/6 |
| Planted, second stop `killTree` | wiped 6/6 |
| No plant, control | wiped 0/6 |
| Loop of strict writes, `killTree` | **4/60** (builder 5/71) |
| Same, `Browser.crash` | **4/60** (2/64) |
| Same, `killMain` | **2/60** (12/285) |
| Chrome's log in every one of those 10 wipes | `backing_store.cc:244` "Failed to open", `:1515` "recovering from a corrupted" |
| Pre-open bytes in those 10 wipes | **10/10:** a bad record of 72, 79 or 193 bytes, and **a whole valid record at its offset + 7.** So: a bare header |
| 3 strict writes then quiet, kill 30-150 ms later | **0/90 tree, 0/90 main, 0/90 crash** |
| One write every 15 ms | **0/81 tree, 0/82 main** |

**Source** [read, by fetch, summarised by a small model, so treat as pointers]: LevelDB's `EmitPhysicalRecord` calls `Append(header)`, `Append(payload)`, `Flush` as three steps. `RecoverLogFile` reuses the last log and appends at its size when `reuse_logs` and no compaction; in paranoid mode a log read error becomes the status. Chromium's `env_chromium.cc`: `reuse_logs` is **false on ChromeOS, and `!IsLowEndDevice...` elsewhere.** So the builder's inference from bytes matches the code, and **low-end devices may not have this mechanism at all, with whatever they have instead.** Not read: Chromium's writable file, or where IndexedDB sets paranoid checks.

**Reconciled, mostly.** Under a tight write loop, kill kind doesn't matter, 3-7% all round, three runs agree. Under low write load, 0/343 of every kind. So round 7's 0/299 for other kinds is what low load gives. **"It is not main-only" holds. Not reconciled: round 7's 13/248 main-only,** since my main-only low-load runs give 0/172. Its harness is not in the repo, its page ran a real runtime, and I did not rebuild it.

**Not established:** a rate in ordinary use. How many opens a tear survives: the bad record sat 46-234 KB before the end, against about 30-150 KB of log per cycle, so usually about one cycle, perhaps more. Headed Chrome, a real user profile, power loss, other browsers. All my rates were taken with other trees running.

**The rate says a real runtime's traffic is far from the danger on this Mac. It doesn't say it is safe.** A batch per commit plus a 5 s capture looks like my 0/343 row, not the 4/60 row [reasoning]. D80 and D111 point the right way.

### Is everything designed for a wiped origin?

**The runtime is. The rules around it are not yet.**

| Question | Answer |
| --- | --- |
| Does a wipe corrupt the runtime's state? | No. Boots clean, no issue, one lane or none [ran `REV8-WIPE`; my search] |
| Does a business key prevent a second charge? | Yes [ran, both] |
| Does anything tell a program it was wiped? | **No.** Empty read means first visit (`driver.ts:325`). Proposed flag is in `revisit.md`, not built |
| Does anything require a business key? | **No.** Every fixture and typed machine uses `idempotencyKey: attempt.id`. `commit` is a closure, so `flow check` cannot see it. `machine-design.md` has no line on it [read] |
| Is it searched? | **Not by the repo.** `wipe` is in 3 cases and no search alphabet [read]. Mine is the first |
| Streams, sessions, entities after a wipe? | **Not run.** A bookmark gone reads as first open [read] |
| What about a tear with no kill later? | The wipe comes at a later ordinary open, even after a clean exit [ran]. So a hold written since the tear goes with it, and the user did nothing unusual |

**Proposed: put the server's key in the contract,** so it is data. See "The rest of the system".

---

## High

### H1. D110 cuts correct programs, silently. **r8-second** [ran]

```text
// One send per row, one op, a lane per row. Nothing fails. `Del` patches deleting: [...], and commits.
for 300: send Del { id: m_i }
ack all; answer all ok
-> requests 256. done 256. memory.deleting still holds 44. row(m299) undefined. No ending, no mint.
-> waits [stranded:del], TurnStorm once.
advance 1100; send Del { id: next }
-> waits has no stranded. 44 still `deleting`, and now nothing anywhere says so.

// 300 `.each` rows, each loading once by a firing at entry
-> open requests 256, rows { D: 256, L: 44 }. Same.
```

`turn.ts:674` skips the member and the turn commits. `turn.ts:637` clears the only signal on the next good ask, and `strand`'s key is the operation, so it can't count what it lost. Rule: an ask ends or it holds. No oracle checks that: `checkEndings` starts at a mint. `REV8-STORM/the-default-budget-lets-an-ordinary-burst-through` pins **200** (`round8.scenario.ts:505`).

**Who hits it:** bulk select, CSV import, any catch-up through a stream whose handler commits, a page of rows that each read. **Round 9's own TanStack DB integration, probably first.** The convergence states the cost as "a real burst is cut". What it does not state: the cut has no ending.

**Root cause:** the spin is a failure with no I/O and a handler that asks again. The bound counts all asks. A press and a firing cannot spin by themselves.

**Proposed, tried:** only an ask made in an ending's turn counts.

```ts
// CHANGED, turn.ts:674. existing: mayAsk, mem.verb. NEW: the first condition. Nothing added to Compiled.
if (w.item?.k === "ending" && (mem.verb === "commit" || mem.verb === "lookup" || mem.verb === "retry") && !mayAsk(tx, w.a.key, w.a.machine, mem.op)) continue;
```

With this: 300 of 300 both ways, spins still stop, **618/621** [ran]. The three that fail are bookkeeping the cases read: `clearStranded` must also run on a first ask (2), and the count is off by one (1). Reasonable to pair with this: a program asking from endings at 256 a second with a real network is not ordinary, so being cut there, with a wait, is fine. Still open: an ending-driven queue over a local or cached source.

## Medium

### M1. A refused `NotSent` is dropped, and the machine waits for good. **r8-second** [ran]

```text
Go { at: 1n } -> commit's input doesn't encode -> NotSent { Unencodable } -> No's mapper reads input.id -> throws, twice
-> InvalidTurn x2, EndingKept, state W, waits [], no lane on disk. The same after two reloads.
```

```ts
// turn.ts:1019. A decline has no attempt and no lane, so undefined === undefined reads as a hold.
if (lane?.head?.id === item.attempt) return;
// PROPOSED: if (item.attempt && lane?.head?.id === item.attempt) return;
```

With the fix: parked, `parked` wait, redelivered each boot [ran]. It applies to every decline: `Rejected`, `Overloaded`, `NoPersistence`, `ModuleDisabled`. Note the trigger: `turn.ts:680` declines with `input: undefined` where every other `NotSent` carries one. A release can't heal that. Proposed: keep the raw input on the mail, since mail needs no encoding until it parks.

### M2. D109 covers writes only. A deadline and a stream's failure still go. **r3 (D50); D109 left it** [ran]

```text
T: schedule 1 s sends GiveUp, GiveUp's patch throws
Arm, advance 1500 -> InvalidTurn x2, state T, waits [] at +120 s.
Note, flush, healed release, reload, advance 5000 -> state T, waits []. The next record dropped the timer.

chat: fail { _tag: Whatever }, on.Ended throws twice -> InvalidTurn x2, state OPEN, waits [], feed closed. A reload reopens it.
```

`turn.ts:1178`, `turn.ts:1214`. `EXPIRED`'s `GiveUp` is the only way out, the comment there says so. A read's ending is `stranded`, so its value goes too, and for an unpersisted machine a write's does. **Raise key:** `1n` on a success's turn refuses (`gate.ts:152`), keeping `gate.ts:3`'s sentence false for it; D109 keeps that one, but `storableParked` replaces the value with `{ unencodable: true }` (`durable.ts:76`), so it can't heal the same way.

**Proposed:** D109's statement narrowed to what it does, or the same keep for a firing and a `deliver`. Firing: its timer stays on the record until a turn commits. Not tried.

### M3. A kept ending is honest to Inspection and silent to the app. **r8-second** [ran]

Is `W` a stuck state? **Yes.** Is it honest? **Only in `waits`.**

| What | Now |
| --- | --- |
| `row` | `undefined`: `publish.ts:11` needs a head. The app reads this as idle |
| `idle` guard | Passes: `lane.ts:136` |
| A press from a root handler | **A second key, beside a success nobody heard** [ran: `GoBoom` x2, 2 keys, `B`] |
| Exit | **Only a release.** `cancel` reads `Idle`: nothing [read] |
| Every boot | 2 more `InvalidTurn`, delivered wherever the machine then is, because `restored` routes from the active leaf. Stale `BoomDone` in `B` [ran] |
| A long-lived tab | Nothing heals until a reload, and nothing suggests one |

Round 7's M9 and the mid review's M4 are improved, not closed. **Proposed:** a row says `undelivered`, and a write's kept ending keeps the lane from `Idle`. Whether a machine may declare a fallback stays open; I agree with not building one until a real case asks. For Arpit's read.

### M4. A clock set back stops all asks for that operation. **r8-second** [ran]

```text
Look; clockBack 1 h; one Look per second for 400 s
-> 255 asked, then TurnStorm, stranded, and 145 cut. Nothing returns until the clock catches up.
```

`turn.ts:633`: `now - at` is negative, so the window never renews. `edge.ts` was written for this and the budget wasn't. **Proposed:** `tx.env.now < cur.at ||` [ran: 400/400].

### M5. A typed program reaches the door, and a reset keeps the last customer. **r8-second, r3** [ran]

```ts
// Types accept it (tsc complains only about an unannotated closure of mine). Memory: Schema.BigInt, stored as "7".
transaction({ id: "Lab/save", input: { orderId: Schema.BigInt, note: Schema.String }, key: ["orderId"], ... })
// -> every press: NotSent { Unencodable }, state A, UnencodableValue. It can never send.
```

```text
resetOn: memory.who, who: 1n -> Put "customer-1 secret" into the kid; who: 2n
-> no reset, kid keeps it, subject "$unencodable" for both, 5 issues in one send.
```

`inc.ts:95`. RESULTS' "a typed program reaching the doors: hand fixtures only" is now run. The convergence says `canon` "names a lane: it must be stable, and need not be reversible". By that, `1n` has a perfectly good name. **Proposed:** `canon` gives bigint a tagged text, which closes keys and resets; `input` stays with `keyFields` in the compile step; `flow check` lints a key field with no JSON form. Cheap. Not tried.

### M6. Nothing can see a missing ending, and D109-D110's pins are thin. **r8-second** [ran]

Survivor table above. `checkEndings` starts from an invoke or a mint; oracle (f) runs only in flush searches, with `refuseOk` only on `Ok` (`flush.search.ts`); `parked` and `stranded` fall to `default:` in `checkClaims`. **Proposed oracle (j):** the harness wraps every commit and lookup input Slot already (`drive.ts:34`), so every run in a committed turn must reach an ending, a lane or a read. It would have caught H1 and M1 in the suite. Needs care with refused turns.

### M7. Change-log tampers left. **r1-2, r8** [ran]

RESULTS marks the mid review's M7 fixed. On a copy, all exit 0 with nothing logged:

| Tamper | Result |
| --- | --- |
| **`rm expected.lock`** | **Green.** `main.ts:216` reads no lock as empty |
| Weaken a case, then edit its two hashes in the lock | Green |
| Weaken a case, then delete its lock lines | Green: `old.has(id)` is false |
| **Delete `checkClaims(c.r)` from `main.ts`** | **Green.** `main.ts` isn't hashed |
| Edit `report.ts`, `watch.ts`, `search/run.ts`, `pay.fixed.ts`, and the like, odd, session, listen, frag, fragstore searches | Green: none hashed |
| Weaken a case, `--lock` | Refused [as claimed] |
| Edit the allow list | Caught [as claimed] |
| Weaken a case, add log lines with a two-character reason | Green, and should be: the reason is what a reader judges |

**Proposed:** no lock is a failure unless `--lock`; hash `main.ts` and every file in `search/`; `git diff` of the lock in the review checklist. This is about a tired agent, not a determined one.

## Low

- A restored hold in a machine that fails `flow check` is silently `Unhandled`. **r8-second** [ran]
- Stream key: `UserClosure` rather than `UnencodableValue`, `waits: []`, state `OPEN`, no session. RESULTS states the door, not the silence. **r8** [ran]
- `flush.search.ts:253` drain 24: false alarm past depth 12. **r7-edge** [ran]
- `asked` is never pruned and is copied on each ask, while D90 made `actors` a tree for this reason (`world.ts:170`, `turn.ts:635`). **r8-second** [read]
- An unencodable reset issues per evaluation: 5 in one send. **r8** [ran]
- `odd` reaches depth 1. **Not traced** [ran]
- Allow list labels: `REV7-H1/backoff-grows...` and `E2-...` blame the gate's flush, and fail with no flush too [ran]. Otherwise agreed, below.
- `EndingKept` is read by nothing. `d109.no-evidence` [ran].

| Age | High | All |
| --- | --- | --- |
| r1-2 | 0 | 1 |
| r3 | 0 | 1 |
| r7-edge | 0 | 1 |
| r8 | 0 | 4 |
| r8-second | 1 | 9 |

**Almost everything is in the second pass, which had no independent review until now.** D110's and M1's are the kind only an outside attack finds, since both pass every case written with the code.

## Assumptions: continued

| # | Assumption | State now | Note |
| --- | --- | --- | --- |
| 2 | A record stays | **Limit, cause established** | Rate under real traffic unknown; 0/343 at low load |
| 5 | Encode and decode one format | Half | Stated. M5 |
| 8 | Timers fire on time | Mostly | Unchanged |
| 12 | Clocks move forward | **Worse: M4** | Edge fine, budget not |
| 21 | The store answers truthfully | False in effect | A tear is silent, then a later open deletes |
| 22 | Batches are atomic | True on IndexedDB | Plant confirms a tail is tolerated |
| 23 | Every batch answers | Not guaranteed | Unchanged |
| 25 | `meta` is only a floor | Gone | Held |
| 34 | A synchronous failure is rate-limited | **Answered at the wrong place** | High |
| 35 | The last ending at restore matters | True if `flow check` passes | D107 |
| 36 | A refused turn can be redelivered into success | Answered for lanes only | M1, M2 |
| 37 | Unencodable values are rare | **False for typed `BigInt`** [ran] | M5 |
| 38 | A gate's exit code means something | **Better** | Suite exits 0. M7 |
| Others | 1, 3, 4, 6, 7, 9, 10, 11, 13-20, 24, 26-33 | Unchanged by this review | |

**New:**

| # | Assumption | True? | Harm when false |
| --- | --- | --- | --- |
| 39 | A correct program stays under 256 asks a second per actor and operation | **False** [ran] | High |
| 40 | Every ask ends | **False past the budget** | No ending, no wait |
| 41 | A `stranded` wait lasts as long as what it reports | **False** | Cleared by an unrelated ask |
| 42 | Every ending has an attempt | **False:** declines | M1 |
| 43 | A kept ending can be delivered unchanged | Only if it encodes | M2 |
| 44 | A firing, a stream's failure and a read are not completions | Design call | M2 |
| 45 | A press beside a kept success is a real new intent | **Doubtful** | M3 |
| 46 | One Mac's tear mechanism is every Chrome's | **False by source** [read] | Low-end, ChromeOS: not reused |
| 47 | A missing lock means a first run | **False** | M7 |

## Tests

**Do cases fail without their fix?** Yes where a mutant reaches them, sample above. The builder's correction of vacuous pins held: `driver.fatal-keeps-fibers`, `durable.firing-not-saved` now die [ran].

**Does the 5 s allow list hide anything?** Reran the suite in four flush modes [ran]:

| Class | Listed | Behaves as its label says |
| --- | --- | --- |
| Kill loses plain memory, first record | 9 | **7 pass with kills flushed.** `PAY-09`, `PAY-13` still fail: their first batch is the held ticket, so nothing could flush. Label true |
| Names 5 s, flush defeats it | 5 | **All pass with no flush** |
| Reads an issue or a capture, window, clock | 15 | Fail in every mode; messages read and agree, apart from the two labels in Low |

**No new bug found behind it. It does hide:** a listed case stops at its first mismatch, so its later assertions do not run at 5 s. The prefix check is a real improvement. Two mutants died only here, by accident (above). `gate5s` does not fail on a listed case that now passes; it reports it. Fine.

**Fake against real:**

| Gap | Effect |
| --- | --- |
| `wipe` is immediate, certain | Reality: a tear, then a later open. Fine as a pin |
| A `tear` step means a partial batch, not a torn log | Reality's tear loses nothing yet. Not modelled, and no reason to |
| No value through Schema decode | M5 is the first typed run |
| Time doesn't pass inside a burst | Hides nothing here: real bursts take ms |

**Searches:** mostly clean, and the two failures predate this round. `odd` tells little. D112 in every state slowed none measurably at depth 1. `asked` left out of the hash means a search can't reach budget states, and at 256 it couldn't anyway; `askMax: 16` in a directed alphabet could. **What every alphabet misses:** a burst, a throw on a mapper, a wipe.

**Log:** not re-audited line by line; round 7's method wasn't repeated. M7 instead. Catalog agrees, no variant gone [ran].

## Production question

**Lane core:** stable. Nothing new.

**Edge, driver:** nothing new. H1 real and plants agree.

**Turn:** D108 and D111 are sound. D109 needs one line and a decision, D110 a different bound. Small work, but it's on the path of every ask.

**Before production, adding to `HANDOFF.md`'s list:** the three below; a phone with its own H3 run, since its log may differ.

## The rest of the system

- **`Compiled`:** D108-D111 add nothing to it, which is good for the single graph and is also why they cannot be checked statically. Three things worth moving into data:
  - **The server's key.** `idempotency: "attempt" | fields` on a contract. Then `flow explain` can say "after a wiped origin, this can send twice", and `flow check` can warn on a money-shaped write. It's the honest form of the decided rule. **Ask Arpit.**
  - **`keyFields` with Schemas,** so M5 is a compile error or a lint.
  - **A kept ending's fallback,** only if a real machine asks.
- **Static analysis:** `.each.max` is data, so "a row's entry asks, and max exceeds a budget" is a table lint, if a budget of that form survives. With H1's fix it needn't. `flow check`'s `Rule20Adopted` is what makes D107 safe: treat it as load-bearing and say so.
- **Entity redesign:** **D110 first.** Bulk confirms, sync-engine integration and optimistic list edits are this exact shape. `prepareAll` runs before the budget, so a cut commit has run `prepare` with no `start` [read]; harmless now, a trap if `prepare` grows. A kept ending's `ended` hook has already run at the cell, so an entity is confirmed while the machine is stuck: consistent with the server, not with the machine. Use `fragstore.row`'s and `listen.load`'s traces as input; both are real and neither is in `known-failing-h2.ts`. Version order and a wipe: a fresh client has no marks, so "newest wins" must not need them.
- **Stories, CLI inspection:** `parked` and `stranded` should appear in `flow trace` by name. No Story can currently show a refused turn.
- **Types:** `Unencodable` is still in no typed denial reason. `EndCtx.input` is `unknown`, so M1's mapper needs a cast: narrower in typed code, not closed.

## What round 9 must do first, in order

1. `round-8/turn.ts:1019`: `item.attempt &&`. A case in `conformance/scenarios/` that fails on it, with the `parked` wait read. `turn.ts:680`: decide what a decline's input is.
2. `round-8/turn.ts:674`, `:633`, `:637`: the budget per H1 and M4, one of them `tx.env.now < cur.at`. New cases: 300 sends, 300 rows, a clock back. Replace `REV8-STORM`'s 200 by 1,000.
3. `conformance/main.ts:216`, `:63`: no lock fails; hash `main.ts` and all of `search/`. Oracle (j) in `conformance/drive.ts` or `scenarios/ctx.ts`, with alphabets that have a burst and a mapper's throw. Pins for `turn.refusal-keeps-commands` and the rest of the table.
4. Decide M2, M3 with Arpit's one-page read: a firing and a stream's failure kept, or the sentence narrowed; `row` says `undelivered`; `idle` beside a kept success. `publish.ts:11`, `lane.ts:136`, `turn.ts:1178`, `:1214`.
5. `round-8/gate.ts:34`: bigint's text, a `flow check` lint for key fields. `inc.ts:95` follows.
6. Ask Arpit: a server key as data on a contract. Add `wipe` to a directed alphabet, on sessions and entities too.
7. Then the H2 entity redesign, with `fragstore.row` and `listen.load` added to its traces.

**Reorder, proposed:**

- **Items 1-3 before entities, not after.** Bulk writes reach H1 first.
- **Move the phone or Safari run with real quota (HANDOFF step 9) before the compile prototypes (step 8),** not before production. Chromium's own code says low-end devices take another path through H3, D97 and D110's numbers are unmeasured there, and it could change the edge. Entities can go first, as they don't depend on it.
- **`keyFields` with Schemas moves from the compile step to typing `domain` in round 9,** as M5 shows a typed program reaching it today.

## Not checked

- Round 7's 13/248 main-only: not rebuilt. Rate under a real runtime's traffic, headed Chrome, a user's own profile, Force Quit, power loss, other browsers. Whether IndexedDB's paranoid checks are where I think.
- `odd`'s depth. Whether `d107.w-releasing-delivers` is truly equivalent. The proposed oracle (j), the `canon` change, keeping a firing: not tried. H1's patch and M4's: run, 618/621, the three failures read and not fixed.
- Sessions and entities after a wipe. A TanStack DB shape against the budget. Real-browser D97, D26. Real quota, clock, Safari, phones. `flow graph`, `story`, `trace`. `nub run verify`, repo lint and formatter: no code changed. Old mutant lists and `mutants-r8.ts`, not run. Log's lines not re-audited. Round 6's M5, M6, M10, M12.
- **Load:** mutants, searches and Chrome overlapped: H3 kill rates and search depths were taken busy. H1's real runs overlapped only mutants. State budgets don't change verdicts; deadlines do, so search depths above are lower bounds.
- **Time:** about 55 of 90 minutes.
- **My own slips:** I ran `git worktree prune` when removing my worktree, which drops metadata of any other worktree whose directory is already gone (the listed ones remain). A stray `cat` in one command hung it for two minutes, stopped, no effect. I overwrote the mid reviewer's `rev/mutants-rev.ts` in the shared scratchpad before noticing the directory was in use, then moved to `rf/`; it is not needed by anything in the repo. Throwaway `h3-light.ts`, `h3-mid.ts` and a typed test sat in the scratch worktree while mutants copied it; no gate reads them, and they were removed. The worktree is removed. Experiments are in the scratchpad's `rf/`: `mutants-rev.ts`, `mut-log.txt`, `x1.ts` to `x12.ts`, `tamper.sh`, `h3/`, `h3l/`, `h3m/`, `h1/`, `searches.txt`, `plants.txt`. Nothing written in this worktree except this file.
