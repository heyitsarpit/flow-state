# Round 9, part two: independent review

Status: advice. **Everything here is proposed.** Reviewer: Opus, did not build round 9. Commit `3836abc4`, branch `flow-rewrite`. Marks: **[ran]**, **[read]**, **[reasoning]**. Ages: r3, r8, r9 (part one), r9b (part two). Bun 1.4.2, Chrome 146 headless, this Mac. Experiments ran in a detached worktree under the scratchpad directory `r9g`, under `watch.ts`, each command under 5 minutes. Peak: Bun 330 MB in the suite, Chrome tree 928 MB, mutants killed by the watchdog at about 1,400-1,490 MB. **Load overlapped:** three mutant lanes together, and small traces beside the real runs, S3 and S4 included. Scripts and results: `r9g/keep/`.

## Verdict

**Fit to build entities on: not yet, and it is four lines away.** The two rules are the right rules. D122's slice closes the old H1 and D123 holds. A fuzz of two actors with mail side by side, 140,650 steps with refusals and kills, is clean [ran]. Real IndexedDB, H1 real, S3 and S4 show nothing lost and no regression [ran]. Two faults stand, both in `driver.ts`, both new with D122, and both reachable by any app with a listener:

1. **H1. A listener's time is off the bill, so the page still freezes.** A spin over a resolved promise and a **1 ms** listener: a 3 s timer fires at **61.8 s**. At 5 ms it did not return in 100 s. 1,000 rows and a 5 ms listener: 5 s with no task [ran].
2. **H2. Slicing turned the listener bound into a drop.** A listener that sends once per notify, under a long drain: `b` heard 37 of 1,026, 989 dropped, named `TurnStorm` [ran]. Requirement 1 was "never drop work".

Both patches are tried: 703/703, `--swap` 703/703, gate unchanged, the freeze and the drop gone [ran].

**"Never stop or slow": honest, not yet right.** The numbers are as stated, and worse hidden than anyone had measured: 87% of a core, 40 IndexedDB commits a second against one in 5 s visible, 5,500 failing requests a second, and at 5.9 hidden minutes it was still 51,474 turns a second. M2. Yours to call; it need not hold up entities.

**Hidden tab, for the first time really hidden** [ran]: `visibilityState` hidden, `setTimeout` floor 1,004 ms, rAF 0. `MessageChannel` is not throttled: 143,291 a second. 1,000 rows: 14-22 ms hidden. 300 real writes: 136 ms hidden, 107 ms visible. Past 5 hidden minutes, with timers at one a minute, 1,000 rows take 20 ms and 100 writes 78 ms. Requirement 6 holds. `RESULTS`' reasoning was right.

**What I'd read first:** `driver.ts:245`, `driver.ts:236`, `driver.ts:293-302`.

## Reproduced

| Item | Claimed | I got |
| --- | --- | --- |
| Suite | 703/703 | 703/703, nothing unlogged, 330 MB, 3.7 s [ran] |
| `--swap` | 703/703 | Same [ran] |
| 5 s gate | 29 failed, 29 expected | Same, none different [ran] |
| CLI pins | pass | Pass [ran] |
| `tsc --strict` on typed | exit 0 | Exit 0 [ran] |
| Typed compare, date check | 52, pass | 52, pass [ran] |
| Pay | no diff | No diff in `pay.compiled.ts` from `397a2e2c`, `pay.compiled.ts` and `pay.typed.ts` from `9e635bbf` [ran] |
| 1,000 rows | 19 ms | 5-16 ms visible, 14-45 ms hidden. **With no subscriber only:** H1, M3 [ran] |
| Freeze gone | "timer fired; max 27 ms" | **True with no listener's cost** [ran]. H1 |
| D126 | `--first-lock --lock`, lock moved: refused; log deleted too: through | Both [ran] |
| Builder's lost endings | 29/29 by (j) | Not rerun; list read. M5 |
| Searches | table | `chain`, `flush.bare.capture` only. Others stand unchecked by me |

### Run for the first time on part two [ran]

| Run | Result |
| --- | --- |
| `run.ts` crash, real IndexedDB, real server, 40 cycles | 0 double charges, 0 charged with no lane, 0 fatal, 0 unsettled, 0 replays. Final `PAID` 31, nothing 9 (killed before asking) |
| `run.ts` tabs | `a` true, `b` false, new tab after a crash true, disk kept `a`'s |
| `run.ts` desk | 7 of 8 honest. `an-actor-disposed...`: revision 1 against 2, H2's family, as round 7 recorded |
| H1 real, Pay | 12 failures, 0 two charges, restored `UNSURE` 12, final `PAID` 12 |
| H1 real, `serialize` hold 400 ms | 0/12 second key beside an undecided first, restored `U` 12 |
| H1 real, `Checkout/Refunds` | 0/12 beside an undecided first; 2 keys 12/12, as before, the resend answered first |
| H3 sample, main kill, one profile, 60 cycles | **4 wiped.** No runtime in that page, so not D122: round 8's cause |
| S3, 10,000-message memory, 1x, 500 ms capture | Turn median 0.1 ms, p99 0.3 ms, 3 writes, 4.7 MB, 0 long tasks |
| S3, 6x, every commit | p99 9.1 ms, 94 MB, 1 long task. Round 6: p99 40.9 ms, same bytes. **No regression** |
| S4, 3,000 actors, 1x / 6x | Plain turn p99 0.1 / 1.2 ms, same as round 7. Click to settled p99 0.1 / 1.4 ms; round 7: 5.5 / 5.9 ms |
| Bench bundle | Core 24.8 KB gzip, with entities 32.5 KB |
| Fan-out, one task: 1,000 / 10,000 actors, 1 send each | 16 ms / 584 ms: 16, then 58 µs a turn. `rota` copies. Fine until entities show more |
| 100 actors x100; 1 actor x10,000 | 191 ms; 105 ms |

**A batch per slice on a real store** [ran]: 300 writes, 300 batches, 107 ms, `i` on disk 299. 2,000 rows of plain memory: 1 write visible, 3 hidden, each carrying the last state. No regression.

## My mutants

**Written before opening `RESULTS.md`, `plants.txt`, `mutants-builder.txt`, `mutants-r*.ts`, `j-named.txt`, `reality/*.txt|json`, or any case body.** I had read then: `AGENTS.md`, `HANDOFF.md`, `README.md`, `STATUS.md` (one line), `review-fixes.md`, `convergence-9.md` part two; all of `driver`, `world`, `step`, `turn`, `lane`, `reads`, `publish`, `durable`, `conformance/drive`, `search/chain`, `mutate`, `mutate-one`, `watch`, `reality/task`, `spin-page`, `spin`; parts of `edge`, `hooks`, `cli/check` (the lint), `typed/flow` (the walk), `main`, `fixtures/round9b` (first 50 lines), `fake-world`, `bench/cdp`; the first 14 lines of `mutants.ts` and first 3 of `mutants-r9b.ts`, for the format. Part of `RESULTS.md` came after the list was fixed, and three later mutants (`g125.delivered-then-nothing`, `laundered-as-evidence`, `kept-lost-later-if-other-actor`) after it. Overlap with the builder by intent: about 20 of 86.

Runner: `mutate.ts` with its per-chunk control skipped, since the control ran by hand. Three lanes.

| Part | Killed |
| --- | --- |
| D122 | 14/25 |
| D123 | 34/40 |
| D124 | 5/8 |
| D125, lost endings | 8/13 |

**61/86.** By gate: suite 53, CLI 5, watchdog 3 (`no-yield-after-answer`, `slice-x100`, `followup-goes-to-mail`). Two needed rewriting after a parse error; they ran after, outcome unknown beforehand.

**Survivors that matter:**

| Survivor | What it means |
| --- | --- |
| **`g125.second-try-lost-if-mail`** | D50's second try is lost whenever any other mail exists. Suite, gate, CLI and `chain` all pass. M4 |
| **`g125.read-ending-lost-if-other-actor`** | A read's answer is lost whenever another actor has mail. Same. M4 |
| **`g122.task-is-microtask`** | `Host.later` a microtask on a page: the old H1, whole, and every gate passes. M6 |
| `g122.slice-x8` | A 64 ms slice passes. No gate measures a slice. M6 |
| **`g123.letgo-takes-all`** | Reachable: below |
| `g123.keyed-cancel-any-subject` | A keyed `cancel` from another path takes that path's kept ending. Rule 51, unpinned |
| `g123.keyless-cancel-any-op` | A key-less `cancel` takes every op's kept endings. Unpinned |
| `g123.coalesce-keeps-older`, `coalesce-takes-ordinary` | Which decline survives. Unpinned |
| `g122.rota-stale-wedges` | The branch for a stale `rota` entry has no case: a freeze taking an actor's only mail while another actor has mail. As mutated, a hot pump forever |
| `g122.rota-drop-on-take` | Serving falls back to FIFO after one round. A press still goes. Fairness between two queues unpinned |
| `g122.success-keeps-count`, `failing-by-op-only`, `unknown-not-failure`, `failing-survives-dispose`, `second-try-counted` | Naming only, and it decides nothing. Low |
| `g124.no-class`, `no-suspend`, `literal` | D124 branches with no pin. The walk itself is right on all of them [ran] |
| `g125.delivered-then-nothing`, `laundered-as-evidence` | (j) pays on the runtime's word. M5 |

Others: `g122.press-waits-for-task`, `clock-real`, close to equivalent. `g123.cause-dropped-ensure`, Low.

**`letgo-takes-all`, against RESULTS' reason ("cannot happen").** It can [ran, `r9g/keep/letgo.txt`]: a resumable fragment's unkeyed op has subject `[]`, the same as its host, so the host's `cancel` reaches a frozen life's lane.

```text
Do, Do on `serialize`. First answer's handler throws twice: kept. Second promoted, on the wire.
Out: the fragment freezes. Second answers: parked, ordinary. Lane: [kept, ordinary].
Root's cancel:  correct: parked 1, thaw hears it, heard 1.  Mutant: parked 0, heard 0. Whole suite passes.
```

The code is right. The pin is missing, and this trace is the case. **Also for Arpit:** should a host's `cancel` reach a frozen life's kept ending at all? The table says yes by omission.

---

## D122-D128

| Id | Verdict | Evidence |
| --- | --- | --- |
| **D122 slice** | **Right rule, wrong clock** | H1, H2, M3. Old H1 gone, requirements 3-7 hold [ran] |
| **D122 mail by actor** | **Sound; the rule isn't written down** | M1. Fuzz clean, press beside a spin 8.6 ms [ran] |
| **D122 "never stop or slow"** | **Honest, not yet right** | M2 |
| **D123** | **Holds** | 34/40, the rest Low. One try per boot and adoption, `cancel` and coalescing all work [ran]. Lows below |
| **D124** | **Right** | Correct on bigint, Struct, optional, Union, Array, Record, Tuple, Set, Map, Class, Literal; quiet on Date, URL. Gaps: Low |
| **D125** | **A real gain, narrower than "every ending"** | M5 |
| **D126** | **As stated** | [ran] |
| **D127** | **Good; (p) can't fire on what it is for** | Below |
| **D128** | **Good, and blind to mail side by side** | M4 |

---

## High

### H1. Work between pumps is off the bill, so the freeze is back with any real listener. **r9b** [ran]

Where the value comes from: `subscribe` is how every UI reads the runtime, and `useSyncExternalStore` calls it on each publish. The answer comes from a resolved promise, D122's own case.

```ts
// existing: subscribe, Spin. user-defined: render. All D122 needs is this:
rt.subscribe(() => render());                 // LOOK: 1 ms of work
commit: async () => cache.get(k),             // answers in a microtask
```

```text
Real Chrome, real driver. A 3 s setTimeout, a 10 ms interval. Page's own tasks seen by a MessageChannel ping.
Spin, listener 1 ms    timer fires at 61,862 ms; interval ticks 1, max gap 61.9 s
Spin, listener 5 ms    no answer in 100 s; the watchdog killed it
1,000 rows, none       15 ms, max gap 7.7 ms
1,000 rows, 1 ms       1,002 ms, max gap 1,002 ms: no task at all
1,000 rows, 5 ms       5,006 ms, max gap 5,006 ms
300 rows, 20 ms        6,020 ms, max gap 6,020 ms
1,000 rows, commit's tail after `await` 5 ms, no listener   5,001 ms, max gap 5,001 ms
```

`driver.ts:245` starts `mark` fresh in each pump, and `:293` runs the listeners outside it. So `spent` counts only the step, about 6 µs. 8 ms of that is 1,300 answers, and each one pays its listener first. "`spent` counts work across pumps" (D122) is true of the step, not of the work. `RESULTS`' table is real: `spin-page.ts:81` subscribes a counter.

**Why the suite can't see it:** `workClock` in the fake ticks only on calls inside `pump`, and (k) counts answers to 5,000. M6.

**Proposed, tried:** the bill runs from the last yield, not the last pump. Two lines moved.

```ts
// CHANGED, driver.ts. existing: spent, clock, yieldToPage. NEW: nothing. `mark` moves out of pump
let mark = clock();                 // MOVED, from pump's top: all time since the last yield is on the bill
const yieldToPage = () => { ...
  host.later(() => { yielding = false; spent = 0;
    mark = clock();                 // NEW
    pump(); }); };
```

| Run | Before | After |
| --- | --- | --- |
| Spin, 1 ms: 3 s timer | 61,862 ms | **3,018 ms,** max gap 30 ms |
| Spin, 5 ms | no answer | **3,026 ms,** max gap 30 ms |
| Spin, 20 ms | not reached | 3,061 ms, max gap 80 ms |
| 1,000 rows, none | 15 ms | 16 ms, max gap 8.2 ms |
| 1,000 rows, 1 / 5 ms: max gap | 1,002 / 5,006 ms | **10 / 15 ms;** total 1.1 / 7.5 s |
| 1,000 rows, tail 5 ms: max gap | 5,001 ms | **10 ms,** total 5.0 s |

Suite 703/703, `--swap` 703/703, gate unchanged [ran]. **Cost:** idle time is on the bill too, so the first step with work after an idle gap yields once: one task, under a millisecond. A row with a 5 ms listener pays 1.5 notifies, not 1: M3. It is still a clock that decides only when.

**Added:** a case with a listener that costs. **Dropped:** nothing.

### H2. A slice's notify counts toward the listener bound, so a correct listener's send is dropped. **r9b, on r4's L2** [ran]

Where the value comes from: an app's listener that forwards a change to another actor, the bridge every "progress" or "sync two screens" code writes.

```ts
// existing: subscribe, input. user-defined: last, bridge. LOOK: one send per change heard
rt.subscribe(() => { if (changed()) rt.input({ k: "send", actor: b, event: { tag: "Press", payload: {} } }); });
```

```text
Bun, real driver, answers in the pump, one drain:
Rows n=200,000      listener sent 99     b heard 35     dropped 64    TurnStorm: send
Spin, 3 s           listener sent 1,026  b heard 37     dropped 989   TurnStorm: send
```

`driver.ts:300` does `chain++` when a listener's send is in the inbox, and `:308` drops past `notifyChain`. Only `input` from outside resets `chain` (`:316`), and an answer inside the pump or a yield's pump never does. Before D122 a notify came once per drain, so `chain` counted one cascade. Now it counts slices. Past about 0.5 s of busy, every listener-originated `send` and `ensure` is dropped, and `TurnStorm` blames a storm that isn't one. Answers over a microtask do reset it, which is why nothing saw this.

**Proposed, tried:** a task has passed, so a new chain.

```ts
// CHANGED, driver.ts, in yieldToPage's task. existing: chain, stormed
chain = 0;        // NEW
stormed = false;  // NEW
```

`Rows`: sent 95, heard 95, dropped 0. Spin: sent 1,026, heard 1,026, dropped 0. Suite, swap, gate as above [ran]. A real storm, sends in one stack, is still cut. **Added:** one case. **Dropped:** nothing.

---

## Medium

### M1. The real ordering rule isn't stated, and a press order across actors is no longer kept. **r9b** [ran, read]

`machine-design.md:1115` still says "the mailbox is FIFO in admission order", and `:3865` leans on it. `RESULTS` says "within an actor, unchanged" and stops. The real rule, by reading `world.ts:412-434` and `turn.ts:1249-1253`:

```text
Follow-ups first, whoever's, up to the bound, global.   // existing, and it stays global
Else one mail from the next actor in rota, oldest first within that actor.
An actor joins the rota at its first mail, and goes to the back after each.
Nothing orders two actors' turns unless a turn links them.
```

**Trace, a user's two clicks** [ran]:

```text
Backlog of 30 on A. In one task: Pw on A, then Pw on B.
Global (mutant):  Pw turns A, B.  mints A 1, B 2.   server sees A, then B.
D122:             Pw turns B, A.  mints B 1, A 2.   server sees B, then A.
```

**What depends on the old order:**

| Case | Effect | Mark |
| --- | --- | --- |
| A cross-actor reply | **Safe.** Sent and enqueued at the step; it joins the end of the asker's queue as before | [read], fuzz |
| Raises, notifies, exits | **Safe.** One turn, one actor | [read] |
| A read's or a write's ending | **Safe.** The store hears at settlement, in the `sent` step, before any mail (`step.ts:95`, `lane.ts:591`). Only the machine's turn moves | [read] |
| An ending's `Owner`, late routing | **Safe.** Read against that actor's own life when served | [read] |
| D26: write-ahead, its ticket and the ack | **Safe.** Per lane, by phase. A persisted press's order across actors was never promised | [read] |
| D50's "after other mail" | **Means the actor's other mail now.** Fine; no case has any (M4) | [read] |
| **Rule 44, "before any external event"** | **Now per actor.** A press on B may run before A's restored endings | [read] |
| **The record queue: `entities.ts:45`, "mint order by construction"** | **Mint order is now turn order, not click order.** Two actors' writes on one record go in the order the rota reached them. D3's order stays total, and stops meaning what the user did | [ran for mints, reasoning for the queue] |
| Entity fan-out | Fair, cheap (table above). One record's `deliver`s reach actors in rota order | [ran] |
| A hung actor | **No effect.** A never-answered op holds its lane, not the rota. A sync hang in a closure holds the page, as ever | [read] |

**Proposed:** write the four lines into the design. **For entities:** decide whether a record queue may reorder two clicks. I'd accept, and say so: a backlog on one actor means its clicks were already behind, and nothing cross-actor was promised. If not, a mint at admission would keep click order, and costs a counter on the mail.

### M2. "Never stop or slow": honest, not yet right. **r9b** [ran]

| Run | Visible | Hidden |
| --- | --- | --- |
| Timer floor; `MessageChannel` per second; rAF | 5 ms; 560,129; 182 | **1,004 ms; 143,291; 0** |
| Spin over a promise: turns, CPU | 1,687,511 in 6 s, 99% | 378,008 in 8 s, **87%** |
| The same, failing | 1,202,610, 99%, named once | 296,539, 87%, named once |
| Persisted spin: IndexedDB commits | 1 in 5 s, capture coalesces | **290 in 7 s,** 81 KB: a hidden page doesn't wait (`edge.ts:169`) |
| Spin, failing `fetch`, real server, 503 | 5,415 requests a second | **5,535 a second,** one actor, localhost |
| Spin, succeeding `fetch` | 5,410, **no name at all** | 5,215, no name |
| 300 real writes on B beside A's spin | 7,747 ms against 107 alone: **72x** | 7,853 ms |
| Press on B beside it | p50 8.6, max 10.9 ms | p50 8.8, max 9.9 ms |

**Past 5 hidden minutes, intensive throttling on** [ran]: chained `setTimeout` max gap **60,001 ms,** so Chrome's 1-a-minute floor really was in force. `MessageChannel` 140,525 a second. 1,000 rows 20 ms, 5,000 rows 141 ms, 100 real writes 78 ms, `i` on disk 99. **The spin on the other hidden tab: 16,947,220 turns at 5.9 minutes, still 51,474 a second.** Requirement 6 holds, and nothing eased the spin. A schedule, a `timeoutMs` or a storage bound can fire up to 60 s late there, as any timer does.


**The claim holds:** requirement 5 by a press, 6, 7. **What it costs that isn't in `RESULTS`:** a hidden page's disk runs flat out. Correct work beside a spin pays three slices per write. A varying input is never named: `failing` resets on a new input (`turn.ts:1193`), so only `flow check` can see it, and `AsksForever` looks only at `target: "self"` with no way out (`cli/check.ts:249`). A retry with a guard, or one through a state, has neither.

**Prior art says it's normal:** `Effect.forever` and xstate behave the same. **It is also an error of a kind every retry library was written for,** and rounds 8 and 9 part one did protect a server, in a way that cut correct work. Requirement 7 rules out a number that decides *what*; `drainMs` already decides *when*.

**Proposed, for Arpit, none tried:**

| Option | What | Correct work's cost | Recommend |
| --- | --- | --- | --- |
| A. As is | State the table above | None | Fine for now |
| B. Hidden, sustained | Hidden, and work has not run out for 2 s: the next yield is a `setTimeout`, not a post. So a spin gets 8 ms a second, under 1% | Measured correct work ends in 14-136 ms. A bulk past 2 s hidden goes at 8 ms a second, then 8 ms a minute after 5 minutes: **that would be requirement 6 again** for a huge import. Slice size could grow with the wait | **Yes, once a phone run says what battery costs.** Not before entities |
| C. Failing, named | Past `TurnStorm`'s own evidence, same op and input, the next ask waits, doubling. Decides only when | None measured: 200 failing rows with varying input are not touched | Maybe. Builder's "on an explicit retry" is the cleaner answer, and it needs an API. Revisit with `retry` |

### M3. Listeners run per answer, not per slice, on the promise path. **r9b** [ran]

D122: "Listeners and batches run at each slice's end." True in the pump. Over microtasks each answer's pump ends, and `:293` notifies: 1,000 rows, **1,001 calls.** So `RESULTS`' "1,000 rows 19 ms" is the no-subscriber number: any listener turns 6 µs a row into its own cost. Entities' `.confirms` over a local source is this path. H1's patch keeps the page alive and doesn't fix the total: 5 ms listener, 7.5 s.

**Proposed [reasoning, not tried]:** one notify per task: a pump that ends mid-task leaves a flag, and the slice's end or a `later` runs listeners once. A listener then sees a cut, not each step, which is what S1 promises anyway. Costs: a publish is no longer heard in its own stack. Check against REV8 listener cases.

### M4. No case or search has endings beside another actor's mail. **Tests, r9b** [ran]

D122 made that the normal case, and `chain` can't reach it: every action settles, so an answer never lands while another actor has mail.

| Mutant | Suite, swap, gate, CLI | `chain`, 40 s | My fuzz, 15 s |
| --- | --- | --- | --- |
| `second-try-lost-if-mail` | pass | clean, depth 5 | **seed 5:** (j) refused once, and not tried again |
| `read-ending-lost-if-other-actor` | pass | clean, depth 5 | **seed 1:** an ending was never delivered |

The fuzz (`r9g/keep/fuzz.ts`, 60 lines): chain fixture, persisted, `drainMs` 0.05-0.2, 1-4 `raw` sends on two actors between settles, refusals, acks, kills, disposals. **On the real runtime: 5,626 runs, 140,650 steps, clean** [ran]. So the rota is sound where nothing tested it. **Proposed:** `chain` gains an action that sends to both actors with no settle, and this fuzz or a case joins the suite.

**One false alarm found by it:** "(j) kept, and no wait names it" when a newer ask of the same op clears a strand before the harness reads (`drive.ts:309`). D123 says that's correct. I filtered that one line. Low.

### M5. The ledger is real, and "every ending" overclaims. **Tests, r9b** [read, ran]

**Can it fail? Yes:** it names kinds round 9 part one missed, and it named both M4 mutants once something reached them. **Is 29 complete? No.** All 29 are endings lost at the step they happen, with one actor. Not on the list:

| Gap | Why | Mark |
| --- | --- | --- |
| **Lost later:** a strand, a kept firing, a hold, a **re-kept** ending, after the first read | `keptNames` is read once (`drive.ts:312`), and `kept` adds to `parkedOwed` only when `onLane` (`:73`, `turn.ts:1059`). `strand-goes-any-step`, `keptfire-goes-any-step` die to named cases, not (j) | [ran, read] |
| **Paid on the runtime's word** | `delivered` before the turn runs (`turn.ts:1153`) and `evidenceOnly` clear the debt. `delivered-then-nothing` and `laundered-as-evidence` clean over 2,100 fuzz runs | [ran] |
| `tryAgain` by event name | Any turn of that event pays. Any `fence` or `unbound` clears all debts (`drive.ts:89-92`) | [read] |
| `ledgerOff` is for good | One wipe, tear, edit or `disposeRuntime`, and the half stays off for the case and search (`drive.ts:45`) | [read] |
| `bootOwed` reads lanes only | Frozen parked endings on an actor record aren't owed at a boot. Named cases catch `frozen-lost-at-restore` | [read, ran] |

**Proposed:** `delivered` is paid only by a `turn`, `Denied`, `Unhandled` or a refusal in the same step: two lines, and it would have named both launderers. Carry strands, firings and re-keeps in `parkedOwed`. Reset `ledgerOff` at the next boot.

### M6. A real spin is not a gate. **Tests, r9b** [ran]

`task-is-microtask` passes every gate, H1 passed them all, and part one's H1 did too. Three times the fault was what the fake can't do. **Proposed:** `reality/spin.ts`, with `__spinL` from `r9g/keep/x-page.ts`, runs with every `driver.ts` change: under a minute. The fake's clock gains a charge per notify, so (k) can see H1 without Chrome.

---

## Why (p) misses `noMerge`

**A state oracle can't see a state that doesn't change.** [ran]

```text
Direct, on the plant: `Note failNext tickLong`: disk note "", live note "x", nothing outstanding. The bug is there.
The search never evaluates that script.
Note failNext FLUSH     reached first: same state, so its hash wins (action order)
Note failNext tickLong  same hash as that: dedupe, no state() call
... FLUSH tickLong      time isn't in the hash, nothing changes: dedupe
```

`flush.search.ts:113` asks `last("tickLong") === script.length - 1`, and `state()` runs only on new states (`engine.ts:103`). (p) asks about a self-loop, and BFS drops self-loops. `debounce` is the same family.

**Proposed, tried:** make it a probe in `drain`, on every new state: advance 40 s, then ask. The plant dies at **`Note failNext`, depth 2.** The real runtime: **completed, depth 5, 1,161 states, clean** [ran]. `r9g/keep/flush.search.probe.ts`. Five lines. Any liveness claim belongs there.

---

## Low

- **A hold and a firing get two tries per boot, not one.** A held head's `Restored` mail has no `redelivered` (`durable.ts:373`); a fired timer comes back as a timer. D123's "one try" is true of parked endings [read] **r9b**
- A stream's strand is keyed by event tag, and no ask of that op ever clears it: it lasts to its life's end (`turn.ts:1279`) [read] **r9b**
- A kept ending's lane is not rekeyed: `durable.ts:385`, no head [read] **r8**
- D124: `Schema.Option(Schema.BigInt)` says nothing, by its stated limit. `Schema.Symbol` says nothing, and a symbol's text is `"undefined"` [ran] **r9b**
- `failing` keeps each failing input's text, per actor and op, until a success [read] **r9b**
- `AsksForever`: M2 [read]
- `carried` on `NaN`, boxed primitives, `Date`: review's Lows, unchanged [not rerun]
- Tamper, log deleted too: as `RESULTS` states [ran]

| Age | High | All |
| --- | --- | --- |
| r8 | 0 | 1 |
| r9 | 0 | 1 (carried) |
| r9b | 2 | 13 |

Again almost all in the newest code, each passing every case written with it.

## Tests

- **Are the 703 good? Better:** D123 34/40 by an outsider, and the old hole list is closed. `a-real-answer` was rightly removed: no chain.
- **What they can't see:** H1, H2 (no case has a listener that costs, or sends, across slices), M4.
- **Plants:** `capture` catches 3 of the 6 as stated, and with (p) as a probe, 4. `encodeOnTurn` stays suite-only, for the reason given.
- **Red on part one:** not rerun.
- **Searches beside the fuzz:** 40 s of fuzz found what 40 s of `chain` did not. Bounded BFS with a settle per action has a ceiling here.

## Assumptions: continued

| # | Assumption | State now | Note |
| --- | --- | --- | --- |
| 8 | Timers fire on time | **Measured:** 1,004 ms hidden, 60,001 ms past 5 minutes | M2 |
| 34 | A synchronous failure is rate-limited | **Gone on purpose** | M2 |
| 40 | Every ask ends | Yes, past H1 | |
| 41 | A `stranded` wait lasts as long as what it reports | **Answered** | D123 |
| 48-50 | An answer after the pump had I/O; a failure past 64; `w.depth` | **Gone with the code** | D122 |
| 51 | A reload asks a read again | Withdrawn, stated | |
| 52, 53, 56 | Kept key, local life, a cause | **Answered** | D123 |
| 55 | `carried` comes back | Still false | Low |
| 57 | The fake can answer as real code does | **Half:** a microtask yes, and a listener's cost no | H1 |
| Others | | Unchanged by this review | |

**New:**

| # | Assumption | True? | Harm when false |
| --- | --- | --- | --- |
| 58 | Time inside `pump` is the page's cost | **False** [ran] | H1 |
| 59 | A listener's cost is small against a step | **False:** 1 ms against 6 µs [ran] | H1, M3 |
| 60 | `chain` counts one cascade | **False:** slices [ran] | H2 |
| 61 | Mint order is the user's order | **False across actors** [ran] | M1 |
| 62 | `MessageChannel` isn't throttled hidden | **True, here** [ran] | M2 |
| 63 | A hidden page's disk is quiet | **False under a spin:** 40 commits a second [ran] | M2 |
| 64 | Ordinary parked and kept can't share a lane under a `cancel` | **False** [ran] | Low |
| 65 | A state oracle sees a liveness failure | **False** [ran] | (p) |
| 66 | A new state is the only place to check | **False:** self-loops | (p) |
| 67 | An ending said `delivered` was heard | **Not checked** [ran] | M5 |

## The rest of the system

- **Entities:** H1 and M3 first: `.confirms` over a local source, with screens subscribed, is exactly that path. M1's queue order is theirs to state. A kept ending's `ended` hook still has run, so an entity can be confirmed while its machine is stuck, as rounds 8 and 9 noted.
- **`Compiled`:** nothing. `inputNotCarried` is right.
- **Static analysis, CLI:** `parked`, `stranded` still not in `flow trace`. `AsksForever` narrow.
- **Stories:** none shows a kept ending or a queue on two actors.
- **Types:** `EndCtx.input` is still `unknown`.
- **Hosts:** `Host.later` must be a real task: only `task.ts` knows. Worth a line in the host contract, and it's what `task-is-microtask` passes.

## Do first, in order

1. `round-9/driver.ts:245`, `:236-240`: H1's and H2's patches. Cases: a listener that charges the clock; a listener that sends across 70 slices. `fake-world.ts:202`: a charge per notify.
2. `round-9/reality/spin.ts`: add `__spinL` from `r9g/keep/x-page.ts` (M6). Rerun it.
3. `conformance/search/chain.search.ts:15`: an action with no settle, or `r9g/keep/fuzz.ts` as a case (M4). Pins for `letgo-takes-all` (`r9g/keep/let.ts`), `keyed-cancel-any-subject`, `keyless-cancel-any-op`, the stale `rota` branch.
4. `conformance/drive.ts:59`, `:73`, `:89`, `:292`: M5. `search/flush.search.ts:113`: (p) as a probe.
5. `machine-design.md:1115` at merge: M1's four lines. Decide the record queue's order.
6. Then entities. M2 and M3 by Arpit, with a phone run.

**Reorder, proposed:** none. Items 1-2 are under an hour; the rest can run beside entities.

## Not checked

- A phone, Safari, real battery, Chrome's own freezing of a hot background tab: none seen in 5.9 minutes, but headless, with `Energy Saver` not on, may never freeze.
- Other searches, `listen.load`, `fragstore.row`, red on part one, old mutant lists. `run.ts` `atom`. `flow graph`, `story`, `trace`. `nub run verify`, repo lint and formatter: throwaway files, no code changed here.
- H1's and H2's patches: suite, swap, gate and my runs only. No search or mutants on them, CLI and typed compare not rerun, though neither touches `driver.ts`. M3's and M2's proposals: not tried.
- `entities.ts` under the rota: read, and fan-out on plain sends. No real entity write on two actors.
- `D26's owner` in the brief: I read it as the `Owner` on an ending and D26's write-ahead, and covered both in M1. If another meaning was intended, that is unchecked.
- **My own slips:** two mutants had a parse error, fixed, rerun. Three scripts of mine failed or hung first: a fuzz with no settle, a queue test that never built a queue, and `fan.ts` with no exit, which the watchdog killed after it printed. The first base listener run was killed by the watchdog and left a throwaway Chrome; killed by its exact profile path. A first fix for H1 with one more `later` per task failed 20+ cases by the harness's "work runnable" check: dropped for the patch above. Nothing committed. **Time:** about 45 minutes by the machine's clock. The 5-minute hidden run used a Chrome left running between two commands, each under 5 minutes, killed by its exact profile path after. Worktree removed with `git worktree remove`; no prune.
