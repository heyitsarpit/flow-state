# Round 9, part one: independent review

Status: advice. **Everything here is proposed.** Reviewer: Opus, did not build round 9. Commit `9e635bbf`, branch `flow-rewrite`. Marks: **[ran]**, **[read]**, **[reasoning]**. Ages: r3, r8, r9 (part one). Bun 1.4.2, Chrome headless, this Mac. Experiments ran in a detached worktree and copies under the scratchpad directory `r9f`, under `watch.ts`. Each command stayed under 5 minutes. Peak: Bun 306 MB in the suite, mutants killed by the watchdog at about 1,400-1,500 MB. **Trees overlapped:** four mutant lanes with the gates, then six plants with three searches. Scripts and results: `r9f/keep/`, `r9f/mutants-rev.ts`.

## Verdict

**The money path holds, and D118, D119 and the harness work are real gains. D115 has one High: "answered inside the pump" is not "no I/O".** A handler that asks again over a resolved promise freezes the page, in real Chrome, with no yield, no name and no bound [ran]. `commit: async (i) => cache.get(i.id)` is the shape. Round 8's budget stopped it at 256 with `TurnStorm`, so this is a regression. The fault is the one D115 exists to fix, on the path the public `commit` takes. A 3-line patch fixes it, 661/661 [ran, proposed].

**D115's other edges:** a failure is not proof of no progress, so one normal failure at row 150 of an import stalls 30 s, and 200 failing rows take 66 minutes [ran]. `w.depth` is whoever's turn ran last, so a spin in one actor delays another actor's press by 30 s [ran].

**D118 is the right rule, with gaps at the edges.** `cancel` does release, on disk too, when keyed [ran]. But a key-less `idle` passes beside a kept ending, a key-less `cancel` does nothing, a kept `Unencodable` decline sits on key `null` where neither `row` nor `cancel` of its own key reaches it, and a new local life hears the old life's ending [ran]. "A reload asks again" is true only of a machine with a recurring schedule [ran].

**Tests:** much better, with a narrower oracle than its name. Oracle (j) sees an ask that became nothing and a refusal with no wait anywhere. It does not see a lost ending: of 26 mutants that lose one, it named 5 kinds, and old oracles did the rest. Lost endings that pass the whole suite: a paced write's, the second parked one on a lane at boot, a keep dropped while any other wait exists [ran]. No search reaches pacing [read].

**Fit to build entities on: not yet, and it is close.** Do items 1-4 of "Do first" (about half a day). Entities run on async local sources, so H1 is the first thing they would hit.

**What I'd read first:** `driver.ts:145`, `turn.ts:1203`, `world.ts:406`.

## Reproduced

| Item | Claimed | I got |
| --- | --- | --- |
| Suite | 661/661, exit 0 | 661/661, exit 0, nothing unlogged, 306 MB, 3.4 s [ran] |
| `--swap` | 661/661 | Same [ran] |
| 5 s gate | 29 failed, 29 expected | Same, none different, none passing [ran] |
| CLI pins | pass | All pass [ran] |
| `tsc --strict` on typed | exit 0 | Exit 0 [ran] |
| Typed compare, date check | 52, pass | 52, pass [ran] |
| Pay | no diff | `pay.compiled.ts` and `pay.typed.ts` no diff from round 8. One assertion in `PAY-11` reads `undelivered`, logged [ran] |
| Red on round 8, 7 passing | "pin what round 8 did" | 6 real, 1 vacuous, below [ran] |
| Plants inconclusive: 5 | 5 | **6:** `noMerge` too, in `plants.txt` itself. RESULTS drops it [read] |
| Tamper "edit hashes in the lock" | green, stated | Green [ran]. **And `--first-lock --lock` green, not stated** |

| Search, 150 s, under load | Depth | States | Result |
| --- | --- | --- | --- |
| `odd` | 5 | 50,028 | clean, inconclusive by time |
| `flush.serialize.burst` | 7 | 1,381 | clean, inconclusive by time |
| `flush.serialize.wipe`, depth limit 8 | 8 | 4,386 | completed, clean |

Others not rerun; RESULTS' table stands unchecked by me.

## My mutants

**Written before opening `RESULTS.md`, `STATUS.md`, `mutants-builder.txt`, `mutants-r*.ts` or any round 9 case body or fixture.** I had read then: `AGENTS.md`, `round-8/review.md` (first 120 lines), `convergence-9.md`; all of `turn`, `world`, `step`, `driver`, `lane`, `gate`, `durable`, `publish`, `reads`, `timers`, `record`; `conformance/` `drive`, `main`, `mutate`, `mutate-one`, `watch`, `scenarios/ctx.ts` (230 lines); the first 12 lines of `mutants.ts` for the format; the first 80 of `hooks.ts`; greps of `inc.ts`, `check.ts`, `flow.ts`, `search/run.ts`. Three edits named the wrong file (`reads.ts` for `publish.ts`); the runner refused, I fixed the paths, and the unrun ones ran after, no outcome known beforehand. Overlap with the builder's ids: **11 of 117**, some with different edits.

Runner: the committed `mutate.ts` with only its per-chunk control skipped (a copy, `mutate-rev.ts`), since I ran the control by hand: every gate above green. Four lanes in parallel.

| Part | Killed |
| --- | --- |
| D115 | 24/30 |
| D118 | 25/32 |
| D114 | 9/9 |
| D119 | 9/11 |
| D120 | 3/4 |
| Canon | 4/6 |
| Lost endings | 21/21 |
| Older rollback | 2/4 |

**97/117.** By gate: suite 88, CLI 3, watchdog 6 (a hot spin in the fake). **Equivalent or close by reading:** `gate.no-cycle-check`, `d115.pace-invisible`, `d118.fire-invisible`, `d118.no-machine-silent` (unreachable), `old.refusal-keeps-asks`, `old.refusal-keeps-touched`, `d115.redelivery-counts`, two evidence-only.

**Survivors that matter:**

| Survivor | What it means |
| --- | --- |
| **`d118.parked-is-kept`** | Any parked ending reads as `Kept`, so an ordinary rule 53 park blocks its key, and every case passes. The side of the boolean that says "not kept" is unpinned |
| **`d118.letgo-takes-all`** | `cancel` drops ordinary parked endings too. Unpinned |
| `d118.release-keeps-kept` | A leaving turn's release of a kept lane. Unpinned |
| **`d115.press-keeps-depth`** | A press inherits the last turn's depth. "A press is not part of the chain" is pinned only over a real answer. (The builder's mutant of this name differs, and died by the watchdog) |
| `d115.follow-resets-depth` | A follow-up resets the chain, so a spin through one is unbounded. Unpinned |
| `d115.cancel-keeps-paced` | A `cancel` beside a paced read. Unpinned |
| `d115.driver-throw-not-inline` | A commit that throws, in `driver.ts:148`. The named case's write comes back round by `Rejected`, so it still paces. A **read** whose commit throws has no case |
| **`d120.front-none`** | The front end never emits `keyFieldsNoJson`, and every pin passes: `broken.ts:178` hand-sets it, and `hasJsonForm` is tested alone. D120 end to end has no pin |
| `d119.member-key-carried`, `d119.bigint-plain` | `cancel` by a `1n` key, D118's way out on those lanes. `1n` and `"1"` as one lane |
| `gate.fn-silent` | No case feeds a function into a value |

---

## D114-D120

| Id | Verdict | Evidence |
| --- | --- | --- |
| **D114** | **Right for writes, not done for reads** | 9/9 die. M6: a read's decline still has `input: undefined` |
| **D115** | **Right idea, wrong test** | No budget and nothing dropped: 300 and 1,000 cases hold. H1, M1, M2 |
| **D116** | **Mostly** | `rm` fails, weaken plus delete fails, new file fails [ran]. Low: two ways round |
| **D117** | **Useful, narrower than its name** | Tests, below |
| **D118** | **Right rule, edges leak** | M3, M4, M5 |
| **D119** | **Holds** | A `1n` lane survives a reload, resets work. `carried` overclaims: Low |
| **D120** | **Wrong both ways** | M7 |

**Is `odd`'s fix sound? Yes, with one small regression.** Against round 8's `text` on 32 odd values [ran]: same on all but `1n` (intended), a 20,000-deep array (now no name, fine) and **boxed primitives**: `new Number(1)` and `new Number(2)` both read `{}`, one lane; round 8 read `1` and `2`. `new String("a")` reads `{"0":"a"}`. Low. Nothing else differs, so a lane id on disk from round 8 still validates. `odd` itself reaches depth 5 now [ran].

---

## High

### H1. A spin over a resolved promise freezes the page. D115 can't see it. **r9** [ran]

Where the value comes from: `commit` is the author's, and an `async` function is the ordinary way to write one. A local cache, a store read that is already in memory.

```ts
// existing: lookup, commit, on. user-defined: Got, r, cache
commit: async () => cache.get("k"),                          // answers in a microtask: no timer, no I/O
Got: [{ patch: ({ memory }) => ({ n: memory.n + 1 }),
        members: lookup("r", () => ({})) }],                 // LOOK: asks again from its own ending
```

```text
Real driver, MixedScheduler, setTimeout host, as reality/page.ts builds it. 2 s run, then print.
sync, Effect.succeed     n 1,547  paced, interval ticks 196, gap 11 ms
failing, Outcome.failure n 65     paced, TurnStorm, ticks 171
promise                  NEVER RETURNS. No timer fires. watch.ts kills it at 15 s
failing promise          NEVER RETURNS
promise, round 8's code  n 256, TurnStorm, ticks 169: it stopped
Chrome headless, promise: page posts "start", never posts its 3 s timer. Nothing runs again
```

`driver.ts:145` marks an answer `inline` only while `running`. A promise answers after `pump` returned, so `noIo` is false (`step.ts:429`), `depth` stays 0 (`world.ts:406`), and the fiber's next ask is another microtask. Listeners run, since `pump` ends each time. **Batches, capture, `hide`, input and paint don't: all are tasks.** RESULTS' "it yields anyway" holds for `Effect.yieldNow` (287,474 turns in 2 s, no name, ticks 198 [ran]) and not for a microtask.

**Same root, smaller harm:** a real network that fails fast, with a handler that asks again, has no bound and no name. D115 says so ("at the rate of a failing network"). Round 8 cut it at 256. [reasoning]

**Proposed, tried:** no I/O means no task boundary since the ask.

```ts
// CHANGED, driver.ts:143. existing: fork, input, host.later. NEW: sameTask
const effect = commitSlot.run(c.input, { attempt: c.ctx });
let sameTask = true;                                  // NEW
host.later(() => void (sameTask = false));            // NEW: a task has passed
fork(`${c.attempt}#${c.send}`, effect, (exit) =>
  input({ k: "sent", attempt: c.attempt, send: c.send, exit,
          ...(sameTask ? { inline: true as const } : {}) }), // CHANGED: was `running`
);
```

Promise: n 1,439, paced, ticks 194. Failing promise: n 65, `TurnStorm`, ticks 174. **Suite 661/661** [ran]. A later per invoke; not measured on a big burst. Added: nothing public. Dropped: nothing. Yet to add: a case with a real microtask answer, which the fake's scheduler cannot do as written, so it needs a host test.

---

## Medium

### M1. A failure is not proof of no progress. **r9** [ran]

A chain over a local source, one row per ending, where a duplicate is a normal failure and the handler moves on. Virtual time, default bounds:

| Run | To finish |
| --- | --- |
| 1,000 rows, all succeed | 1 s in the fake. **Real Chrome 4.8 s; 0.1 s with pacing off** [ran] |
| 200 rows, one duplicate at row 150 | **30 s** |
| 300 rows, every 10th a duplicate | **12 minutes** |
| 200 rows, all duplicates | **66 minutes** |

`turn.ts:1203` backs off from `over`, and `depth` never falls (`step.ts:175` keeps it). So past row 64, any failure pays the cap at once, unnamed unless it is exactly `over === 1`. RESULTS states the naming limit, not the cost.

**Hidden tab, not measured [reasoning]:** every paced ending is a timer, so 936 rows at Chrome's 1 s floor is about 16 minutes, and intensive throttling at 1 a minute after 5 hidden minutes is hours. The drain's own `later` has the same floor already; pacing makes it per ending past 64. **Does a spin starve real work?** Presses and others' asks go at once [ran], apart from M2. A success spin burns a timer tick forever, no issue at all [ran: n 1,547, issues none].

**Proposed [reasoning, not tried]:** split the two jobs. `depth` decides only whether to yield. Backoff counts failures **in a row with the same input**, which is what a spin is; a success or a new input resets it.

```ts
// CHANGED, turn.ts pace. existing: pace, depth, retryMaxMs. NEW: failRun
const delay = failing && item.failRun! > 0
  ? Math.min(tx.bounds.retryMaxMs, 1000 * 2 ** (item.failRun! - 1)) // NEW: same op, same input, failing again
  : 0;                                                              // a queue only yields
```

### M2. `w.depth` is the last turn's, whoever's. **r9** [ran]

```text
Actor Sp: a read that fails at once and asks again. Past the bound, ticking on its backoff.
Actor Pw: persisted write over a local source. Press Save; its ack is out.
Sp ticks. w.depth is now Sp's. The ack lands; the source answers at once, in that pump.
-> Pw's ending: inline, depth Sp's + 1. waits paced:s. Heard 30,000 ms later.
```

`world.ts:406` reads `tx.w.depth`, set by the last mail's turn (`turn.ts:1214`). `stored` isn't a chain step either: the write went through the disk, which is I/O. **Proposed:** the asker's depth travels with the ask (on the Attempt, on the read), and a `stored` step's invoke starts at 0. H1's patch doesn't change this: the invoke and its answer are both in the ack's task, so they still read as inline. Survivor `d115.press-keeps-depth` is the same line.

### M3. A kept ending's way out has four holes. **r9** [ran]

What works: `row.undelivered`, keyed `idle` denies, commit `Rejected`, keyed `cancel` frees the lane and the record, and the next boot is clean. What doesn't:

| Hole | Trace |
| --- | --- |
| **A key-less `idle` passes** | Kept success, `Pay` guarded by key-less `idle`: guard passes, machine moves, commit declines `Rejected`, while keyed `idle` denies. `turn.ts:131-134` filters on `l.head`. D118 says `idle` denies |
| **A key-less `cancel` does nothing** | `turn.ts:726-731`: key-less names an ending's Attempt only. Row stays |
| **A kept `Unencodable` decline is on key `null`** | `Go { id: "a", at: Set }`, mapper throws twice: `W`, parked at `lane/...save|null`. `row` for `{ id: "a" }`: nothing. `cancel` of `{ id: "a" }`: parked still 1. `turn.ts:664` sets `key: null` even when only the input failed |
| **Declines pile up** | Handler for `NotSent` throws too. 5 presses: parked 6 on disk, `undelivered: 6`, and each boot **12** `InvalidTurn`, not 2. A kept block makes a `Rejected` that is itself kept. `lane.ts:366`, `turn.ts:1028` |

**What a real author sees:** `{ code: "InvalidTurn", origin: "Kp on.Paid[0].updateMemory", input: { k: "mail", event: "Paid", redelivered: true } }`. The thrown error is nowhere: `turn.ts:1172` drops `e.message`. **r3.** Every boot, 2 more, for good, until someone writes a `cancel` the machine may not have.

**Proposed:** key-less `idle` reads `columnOf`, not `l.head`. A decline (no Attempt) is never kept: it has sent nothing, so a stranded wait is honest and blocks no key. That closes rows three and four at once. Put the cause in the issue.

### M4. A new local life hears the old life's ending. **r9, on r8's keep** [ran]

```text
local, unpersisted. Pay, answer ok, Paid's handler throws twice: W, undelivered 1.
dispose -> row still undelivered 1, wait parked.
ensure  -> state D, paid: true. Nobody pressed anything in this life.
```

`step.ts:231-237` skips a lane with no head. `adoption` (`turn.ts:816`) unparks it. D21 says a local identity's hold is never adopted. **Proposed:** a local dispose drops kept endings as evidence.

### M5. `stranded` doesn't last as long as what it reports. **r9** [ran]

Assumption 41, still false, and D118 leans on it.

```text
.each rows r1, r2. r1's read answers, its handler throws twice: r1 in L, stranded:get.
r2 asks -> stranded [] while r1 is still in L. turn.ts:673: the key is actor|op.
r2's answer refuses too -> stranded:get. All rows removed -> stranded:get, 10 minutes later, idle.
Reload, one read: state L, requests still 1, waits []. The wait is gone and nothing asks again.
```

**"A reload asks again" (D118, convergence-9 line 22):** true only where the machine has a recurring schedule, which is what `machine-design.md` rule 42 requires of the author ("must look up again") [read]. A correct machine by rule 42 is fine; one that isn't gets silence, and `flow check` doesn't lint it. The wider case, a read in flight at any kill, is decided design (OD9 Q26). **For Arpit:** a `flow check` warning on a state entered with a lookup and no recurring schedule is a table lint. **Proposed:** key `stranded` by incarnation; reap with the life as `keptFires` are (`turn.ts:796`); fix the sentence.

### M6. D114 stops at writes. **r9** [ran]

`reads.ts:56` enqueues `input: undefined`. A read's failure mapper reading `c.input.id`, on `{ id: Set }`: throws, twice, `InvalidTurn` x2, `L`, stranded. It is the review's M1 on the read path. **Proposed:** pass the asked input, as `turn.ts:679` does.

### M7. D120 is wrong both ways, and unpinned. **r9** [ran]

| Field | `hasJsonForm` | Real |
| --- | --- | --- |
| `Schema.Date`, key | false, warns "every commit ends `NotSent`" | `carried` true: commits go. **Pinned as true** by the CLI |
| `TemplateLiteral`, `Unknown`, `Any` | false, warns | A string goes |
| `Struct({ id: BigInt })`, `Array(BigInt)` | **true, silent** | Every commit declines |
| Any **non-key** field, `amount: Schema.BigInt` | **not looked at** | Every commit declines |

`flow.ts:488`, `:494`. Round 8's M5 trace was a key, but the common bigint is an amount, and the door is the whole input. **Proposed:** walk every input field, into objects and arrays; ask "does its decoded type carry"; `flow.ts` end to end in a pin.

### M8. Oracle (j) and the pins. **r9** [ran]

Below, under Tests.

---

## Low

- **A paced decline dies at a reload.** `Go` with an unencodable input, retried from `No`: paced at depth 65, kill, reload: `W`, no lane, `waits: []`, for good. A decline has no lane, and pacing stretches a mail's life from a drain to 30 s. D118's sentence is false in that window. A chain of declines is already a bug [ran] **r9**
- **Tampers.** Weaken a case: `--first-lock --lock` after moving the lock: green, and RESULTS doesn't list it (`main.ts:187`, `:202`). Hand-pasted hashes: green, stated. `--lock` refused, a removed line with its hash logged passes rightly, a bad variant caught. 125 of 249 lock lines predate the log, so "every lock hash has a log line" needs a frozen base first. `git diff expected.lock` stays the check. **r9** [ran]
- `carried` overclaims "comes back": `NaN` input on a lane is `null` after a reload, so a resend sends `null` under the same key (`durable.ts:84` is `JSON.stringify`); `NaN` in memory is the string `"$NaN"` (`record.ts:23` is `carry`); one value, two forms. A `Date`, an `Error`, a RegExp "carry". **r8, r9** [ran]
- Boxed primitives, above. **r9** [ran]
- A kept deadline is not retried in a live tab: healed, a later good turn, 60 s: still parked. Stated in effect. **r9** [ran]
- A paced **write** can't be cancelled: `Settled` reads `nothing` (`lane.ts:91`). A read's can. **r9** [read]
- RESULTS' plant count, above. **r9** [read]

| Age | High | All |
| --- | --- | --- |
| r3 | 0 | 1 |
| r8 | 0 | 1 (shared) |
| r9 | 1 | 15 |

Almost all in the new code, as round 8's was: each passes every case written with it.

## Tests

**Does oracle (j) see a missing ending where it matters?** It kills what it was built for. By reason [ran]:

| Lost | Cases failing | Named by (j) |
| --- | --- | --- |
| An ask in a committed turn, `commit` or `lookup` | 96, 17 | **All** |
| A keep, whole; a read's strand; a firing's keep | 14, 1, 5 | **All** |
| A settled write's ending, a read's answer, a restored head, parked or `W`, adoption, a thaw's parked, a decline's mail or admission, a dead actor's, an unplaced one, a second try | 1 to 266 | **0.** Older oracles or named cases |
| A stream's strand | 1 | 0: `again` is only for `ending` and `fire` (`turn.ts:1171`), so (j) can't see a `deliver` |
| **A keep dropped while any other held, parked or stranded wait exists** | **0** | **0.** `drive.ts:209` asks for a wait of the kind, anywhere |
| **A paced write's ending at its timer** | **0** | **0.** No case advances a paced write. Other oracles would catch it if one did [read] |
| **The second parked ending on a lane, at boot** | **0** | **0.** No case has two. My M3 trace makes six |

So (j) is "an ask became something, and a refusal left some wait". **Proposed:** name it so. Make the second half specific: the wait's op and attempt. Three cases: a paced write delivered, two parked at boot, a keep beside a hold.

**Do tampers pass?** Low, above. D116 is a real gain, and this is still about a tired agent.

**The 7 that passed on round 8** [ran, each by a mutant]:

| Case | Real? |
| --- | --- |
| `a-refused-rejected-is-kept-too` | Yes |
| `a-hold-parks-nothing` | Yes, the only killer of `hold-parked-too` |
| **`a-real-answer-breaks-the-chain`** | **No.** `real-answer-counted` passes it: a `send` between every ask resets depth (`turn.ts:1214`). `300-sends` and `300-rows` kill that mutant. Vacuous as written: have the handler ask |
| `a-kept-ending-delivered-at-boot-frees-its-key` | Yes |
| `a-refused-turn-takes-its-commands` | Yes, only killer, closes round 8's survivor |
| `two-reset-values-with-no-name-are-one` | Yes |
| `a-guard-key-with-no-name-says-why` | Yes, only killer of `no-reason` |

**Why do search-plants read inconclusive?** **Not budget: no alphabet and oracle can express them.** On the full `flush.bare`, 150 s, 13,000 states, depth 4: all six stay inconclusive [ran]. `inconclusive` only says the time ran out, and a clean runtime reads the same.

| Plant | Why no search can see it [read] |
| --- | --- |
| `debounce`, `hiddenWaits`, `ignoresNow` | `flush.search.ts:179` sets `captureMs: 2e9`, so a capture never wakes. `FLUSH` clears `hidden`, nothing sets `stay`. No action sets `now` in `bare` |
| `noSilent` | `hang` and `tick` are outside `tightNames` (`:118`), and no oracle reads the issue |
| `encodeOnTurn` | Same states; only where the encode ran differs |
| `noMerge` | Needs failure, then time, then a kill, and memory lost there is allowed |

All six die in the suite. Nothing is hidden. **Proposed:** report them as "suite only, and why". Round 7 and 8's same line stops being a mystery.

**Searches and pacing:** no search file mentions `endingChain`, and no alphabet has an op that answers at once [read]. D115's "a search can reach it" is unused. The `Kept` column is reached: `refuseOk`, `refuseNo` in `queue` and `burst`.

**Fake against real:** the fake's scheduler can't answer in a microtask. That is why H1 passes everything. RESULTS says pacing ran on the fake only, and it was right to.

## Assumptions: continued

| # | Assumption | State now | Note |
| --- | --- | --- | --- |
| 8 | Timers fire on time | **Leaned on more** | Each paced ending is a timer. Hidden tabs: M1 |
| 12 | Clocks move forward | **Better** | Pacing is pinned with the clock back |
| 34 | A synchronous failure is rate-limited | **Yes; an async one isn't** | H1 |
| 36 | A refused turn can be redelivered into success | Answered | D118 |
| 39 | A correct program stays under 256 asks a second | Gone | D115 |
| 40 | Every ask ends | **Yes in a live tab, past H1** | Not a paced decline at a reload |
| 41 | A `stranded` wait lasts as long as what it reports | **Still false** | M5 |
| 42 | Every ending has an attempt | Answered | D114 |
| 45 | A press beside a kept success is a real new intent | Answered: no | Keyed. M3 |
| 47 | A missing lock means a first run | Answered | Low |
| Others | | Unchanged by this review | |

**New:**

| # | Assumption | True? | Harm when false |
| --- | --- | --- | --- |
| 48 | An answer after the pump returned had I/O | **False** [ran] | High |
| 49 | A failure past 64 means no progress | **False** [ran] | M1 |
| 50 | `w.depth` is the asker's | **False** [ran] | M2 |
| 51 | A reload asks a read again | Only with a recurring schedule [ran] | M5 |
| 52 | A kept ending's key is one the app can name | **False:** `null` [ran] | M3 |
| 53 | A local life's endings die with it | **False** [ran] | M4 |
| 54 | A Schema's AST tag says what carries | **False** [ran] | M7 |
| 55 | `carried` means it comes back | **False:** `NaN`, `Date` [ran] | Low |
| 56 | An `InvalidTurn` says enough to fix it | **False:** no cause [ran] | M3 |
| 57 | The fake can answer the way real code answers | **False:** no microtask [read] | H1 got through |

## The rest of the system

- **Entities:** `.confirms` over a local source, sync engines and optimistic stores answer in microtasks. H1 first. A failed confirm chain hits M1. A kept ending's `ended` hook has run, so an entity is confirmed while the machine is stuck, as round 8 noted: still so.
- **`Compiled`:** D120's field stays optional; widen it to any input field. "A state waiting on a read with no recurring schedule" is table data, so a lint, for Arpit.
- **Static analysis, CLI:** `paced`, `parked`, `stranded` still aren't in `flow trace`.
- **Stories:** no Story shows a kept ending.
- **Types:** `EndCtx.input` stays `unknown`, so M6's mapper needs a cast.

## Do first, in order

1. `round-9/driver.ts:143-148`: H1's patch, for commit and for a throw. A host test in `conformance/` with a real microtask.
2. `round-9/world.ts:406`, `turn.ts:1214`, `step.ts:429`: depth travels with the ask; a `stored` step's invoke starts at 0 (M2).
3. `round-9/turn.ts:1198-1206`: backoff by failures in a row on one input (M1). Then decide what Chrome's hidden floor means for it, with a hidden-tab run.
4. `round-9/turn.ts:131-134`, `:664`, `:1028`, `:1172`; `reads.ts:56`; `step.ts:231`; `turn.ts:673`: M3, M6, M4, M5.
5. `conformance/drive.ts:209`, `turn.ts:1171`, `scenarios/round9.scenario.ts:197`: oracle (j) specific, `a-real-answer` real. Cases for the survivors and three lost endings above. An alphabet with an op that answers at once.
6. `round-9/typed/flow.ts:485-494`, `cli/check.ts:247`: M7, with an end-to-end pin.
7. Then entities, with `fragstore.row` and `listen.load` as the builder has them.

**Reorder, proposed:** none beyond this. Real Chrome took 60 lines to find H1, so a real spin test belongs with item 1, and with every later change to `driver.ts`.

## Not checked

- Hidden tabs and throttled timers: reasoning only. Headless Chrome reported `visible`.
- H1 real, H3, S3, S4, Refunds real: builder's numbers, not rerun. Most searches, `listen.load`, `fragstore.row`: not rerun. Old mutant lists.
- H1's patch on a big burst's cost, on sessions' `fork` (module fibers aren't marked). M1's proposal: not tried. A module's own loop: not tested, same as the builder.
- Entities after a wipe. `flow graph`, `story`, `trace`. `nub run verify`, repo lint and formatter: throwaway files, no code changed here.
- Whether a `.cancel` on a Kept lane with a head behaves; by reading it needs a second cancel after the head ends.
- **Load:** see the first paragraph. Search depths are lower bounds.
- **Time:** about 30 of 45 minutes by the machine's clock. Nothing committed. Worktree removed with `git worktree remove`.
- **My own slips:** three mutants named the wrong file, above. One command with a relative `rm` was refused by a safety check; I rewrote the tamper to work with no deletion. A tamper copy's first run failed on a missing plan path, so it told nothing; I linked the plan and reran all of it.
