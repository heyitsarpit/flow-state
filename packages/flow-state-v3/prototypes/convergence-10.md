# Convergence 10: a test system whose green means something

Status: **everything here is proposed.** Inputs: `conformance-audit/bugs.md` (B), `assumptions.md` (A), `over-assumptions.md` (O), `under-specification.md` (U), `blind-derivation.md` (BD), `round-9/review-part-two.md` (R). All advice; the calls below are the builder's, under delegation, for Arpit to overrule. Decisions start at D129. No entities in this round.

## Every finding, by root cause

| Root cause | What it is | Findings |
| --- | --- | --- |
| **1. A verdict is not tied to what ran.** The check reads something other than the thing driven, or says nothing about whether it ran | Oracles on an undriven harness; `closed` on 1 state; compare with no exit; crash with no verdict; `fatal` silences oracles; tool sees one process; typo passes | B H1, H2, H3, H6, M1, M2, M6, Low (typo, one-way catalog, names cut at a space, unknown flag, plants), U 1, O F11 (`--swap` 54/703) |
| **2. Assertions choose what to look at.** Anything nobody named is free | 0/703 notice an extra request, key or field; named issues are a set; junk key mutant lives; oracle trusts runtime's evidence | U 2, 3 (A02, A07), B M1, M5, BD weak list |
| **3. The record of expected results can be rewritten.** The lock is a file and the hash is blind | Paste into lock; a removed newline deletes an oracle; lists outside the lock | B H4, H5, M7 |
| **4. Scoring is by a human reading a number.** | `reality/`, `bench/`, plants, mutants' INVALID | B M2, M7, Low; U 5; R M6 |
| **5. Oracles know a format, not a meaning.** | 40-44% fail on a format change; regex ranks user fields; text compare; evidence is an untyped contract | O F1, F2, F3, F9; B M3, M4 |
| **6. The fake is kinder than the world.** | bfcache and the lock; key expiry, 409, replayed 500, body mismatch; `freeze`; hidden timers; plain write behind strict; connection loss; `landLate`; power loss; duplicates | A 1-18; B M5; O F8 |
| **7. Rules have no clause-level pin.** | 5 mutants; M4, M5, M6; (p); `letgo-takes-all`; FRAG-08; rule 37 and uncited rules | U 3, 4, 6; R M4, M5, M6, (p) |
| **8. Runtime faults those hid.** | H1, H2, M3; `x/y`; `self`; `Symbol`; O(n²); bfcache gap; HIGH-03 | R; O F4, F5, F7; A 1; BD |
| **9. The design has fallen behind.** | Stale points; ordering rule | BD disagreements; R M1 |

Causes 1-4 and the small part of 8 are stage A. Causes 5-7, the rest of 8 and 9 are stage B.

## Design

One principle answers causes 1-4: **a green must be a claim about a run, and a broken run must be able to make it red.** So every verdict carries its evidence of having run, and a standing check runs every gate on runtimes known to be broken.

### Stage A decisions

| Id | Decision | Costs | Changes |
| --- | --- | --- | --- |
| **D129** | **`watch.ts` measures and kills the tree.** Child in its own process group; each poll reads the whole process table and follows parents; peak is the tree's sum; a kill and a normal exit both end every descendant ever seen and the group. Leftovers are reported. Limit: a poll is 40 ms, so a spike between polls is unseen; a process that left by `setsid` before the first poll that saw it is unseen | A `ps` per poll | `watch.ts`, `falsify.ts` |
| **D130** | **End-of-case oracles run on every harness a case made.** The runner tracks `make()`, so no scenario edit is needed. Named issues are one list per case, shared by every `Ctx` in it. Runs inside a `try`; a crash is that case's verdict | Some cases fail: traced below | `main.ts`, `ctx.ts` |
| **D131** | **`closed` and `completed` need evidence.** Every action must change the state hash on at least one edge, or the search names it in `idleAllowed` with a reason. Otherwise the verdict is `vacuous`, exit 1. A throw anywhere in a search is `failed`, not a crash | A search states what it cannot move | `engine.ts`, `run.ts` |
| **D132** | **Every gate must fail on a broken runtime: `conformance/falsify.ts`,** standing, a member of the lock. Null runtime, and the real runtime with a constant hash, a lying `fatal`, no evidence, no waits, a junk disk key, a lying replay: each gate run on each must be red. Mutate counts a parsed mutant that crashes as killed by `crash`. `--only` of nothing fails. Catalog is checked both ways. `compare.ts` exits 1 on any difference not on its stated list. Null implements the whole `Instance` contract, so it fails by expectation, not `TypeError` | About a minute | `falsify.ts`, `null-adapter.ts`, `mutate*.ts`, `main.ts`, `typed/compare.ts` |
| **D133** | **`fatal` must be named.** A fatal a case did not name in `namedIssues` is a failure, at each step. It no longer turns oracles off silently. Fatal without its `Fatal` issue is itself a failure | | `ctx.ts` |
| **D134** | **Whole output is the default assertion.** For each case and each harness, the runner reduces every read to an output: request sequence, issues with counts and origin presence, disk by class, each actor's state and memory, evidence kinds with counts, frames, waits, truth, distinct state hashes. It is compared with `expected-output.txt`, one line per case. A case states what it does not care about in the scenario: `outputAllow: { sections, why }`. Each output is in the lock under `output:<case>`, so a change needs its own log line. Only the plain pass compares: `--swap` and the 5 s gate have other outputs by design. **A mutant killed only by output says `killedBy: "output"`,** apart from named oracles, since a snapshot kills anything that changes and proves nothing about correctness | A change detector, not a proof: it says what changed, a person says if that is right. Each behaviour change means log lines per case | `main.ts`, `output.ts`, `mutate-one.ts` |
| **D135** | **Lock and log.** A hash reads tokens: a TS file or function through the transpiler (comments and format free, strings and code not), others by bytes. **The lock can no longer launder:** for each id, the current hash must be the id's frozen baseline, or the hash on its last log line, whose reason is non-empty and not bulk. A pasted hash has no line. `main.ts` pins the baseline file's digest. **The limit, stated:** a hand can still write a log line with a poor reason, and can edit the baseline and `main.ts` together. Prevention would need a signature no local file can give; the check is that the reason is required per id, that it is reviewable in `git diff`, and that review reads it | Log lines | `main.ts`, `expected.baseline` |
| **D136** | **The bill runs from the last yield,** and a yield's task starts a new chain. **One notify per task:** the first pump end in a task notifies; later ones in the task coalesce into one in the next task. Review H1, H2, M3 | A publish past the first in a task is not heard in its own stack | `driver.ts` |
| **D137** | **An actor key names one machine.** `ensure` on a live key with another machine refuses, named: `ActorMachineMismatch`. The harness's key escapes the id, so `M` + `x/y` and `M/x` + `y` are two actors. | | `step.ts` or `turn.ts`, `drive.ts`, `ctx.ts` |
| **D138** | **A state may not be named `self` or `__proto__`:** `ReservedStateName` at seal, a wiring error like `DuplicateMachine`. Changing the data format's `"self"` to a sentinel would be the alternative; refusing is one line and the name has no use | A name is lost | `gate.ts` |
| **D139** | **A value with no form is refused the same way, whatever it is.** A `Symbol` anywhere joins function, Map and Set: `UnencodableValue`, not `Fatal`, not silently dropped. `NaN` and `Infinity` cannot be carried: they get a stable name (D119 stands) and no carried form, rather than coming back as strings | A machine with `NaN` in memory now keeps its last capture, named | `gate.ts` |
| **D140** | **Mail is a queue, not an array copied per send.** Persistent for a linear use: a shared buffer and a window, copied only when a branch writes. Bursts go linear. Pin: 100,000 sends in a stated time budget in the driver, without the adapter's log | One small type | `world.ts`, sites |
| **D141** | **The hash and replay see values, not the JSON they happen to make.** `canon` tags `Date`, `Map`, `Set`, `NaN`. Wall clock offset joins the fake's text (B M3, review M3) | A few more states | `adapter.ts`, `fake-world.ts` |

### Stage B decisions

| Id | Decision | Costs | Changes |
| --- | --- | --- | --- |
| **D142** | **The runtime says what its disk means: `Port.disk`,** a codec with `kind`, `scope`, `heads`, `parked`, `decode`. Every-step oracles, `stored()` and whole output ask it. The suite still owns the bytes, to tear, wipe and edit. A case that names a stored key pins the format, and does it by naming it. Measured with `variant-adapter.ts`, a correct runtime in another format: renamed keys, 312 failing to 112; wrapped values, 279 to 30 | A port names its format. Output's `truth` counts acked bytes, so 711 output lines were rebased, checked to differ in `truth` alone | `harness.ts`, `drive.ts`, `ctx.ts`, `output.ts`, `adapter.ts` |
| **D143** | **A user's data is opaque to the hash's ranks.** Memory, payload, input, value are written with no `"`, so no regex reaches a `pos` in them. `Ctx.eq` compares values (`canonText`): field order free, `Date`, `NaN`, `Map`, `undefined` themselves | The edge's bytes and the fake's open requests still hold ranked copies; one exact copy in the world keeps the states apart | `adapter.ts`, `ctx.ts` |
| **D144** | **A real run is scored, and exits by its score.** `reality/score.ts`: errors, `NO ANSWER`, and `twoCharges`, `doubleCharge`, `toldNotChargedAndCharged`, `chargedNoLane`, `fatal`, `unsettled` must be zero. `checks/score-check.ts` proves it fails what it says. Not run in Chrome this round | `bench/main.ts` still only measures | `reality/*.ts` |
| **D145** | **The fake server is as strict as Stripe's.** Keys can be pruned (`forgetKeys`), a send while the key executes answers 409 (`inFlight`), a landed 500 replays to every retry (`applyFail`), another body on a key is refused. Every application is counted: **a key applied twice fails any case** that did not name `AppliedTwice`, and a resend with another body fails any case. Every landing is in the ledger. **Contract for authors:** a resend on an old key reads what the server holds first, as Pay does; Flow keeps no key age | 409 is an answer to choose, not the default | `fake-world.ts`, `main.ts`, Pay's server model |
| **D147, HIGH-03 decided** | **A read whose domain mapper throws, or returns what has no shape, ends in failure `Defect`** (rule 37), and the store's `UserClosure` says why. The machine no longer hears `Listed` for a list the store could not take. Correctness: a machine must not believe it has data nobody stored | A mapper bug moves the machine to its failure path, not its success path | `step.ts`, HIGH-03 |
| **D148** | **Host contract for the back-forward cache: a page holds the lock while it is the live page, not for its life.** On `pagehide` with `persisted`, after the runtime's own flush, the host releases the lock. On `pageshow` with `persisted`, the host reloads: **a return is a new boot**, which re-reads the disk and asks for the lock again. **Verified in Chrome** (`reality/run.ts --only bfcache`, scored): the next page is the owner, the page went into the cache, the return reloaded and sees B's newer value. Without the contract (`--no-contract`) the run fails: the next page is not the owner. Rejected: keep the lock and restore the cached page in place (a second writer with stale memory); opt out of the cache (`Cache-Control: no-store` is a hint Chrome is moving away from) | A Flow page loses the instant back. The fake has no `leave`/`return`: under this contract a cached page holds nothing, so a return is a kill and a boot, which the fake has | `reality/page.ts`, `reality/run.ts` |
| **D146** | **A frozen page runs nothing.** No task, microtask, answer heard or storage answer until a thaw; a kill thaws (a discard). A step needing the page's JS on a frozen page is dropped, and a case that drops one fails. The round 7 case that pressed a frozen page is replaced by two true ones | | `drive.ts`, `ctx.ts`, `round7.scenario.ts` |

### Stage C decisions (from `conformance-audit/re-audit-round-10.md`; all proposed)

One root cause under H1, H2, M1 and M4: **a gate that takes a self-report at its word.** The runtime said `evidenceOnly`; `tsc` was trusted to have run; a real run said nothing and scored zero; a budget excused a dead action. Each now checks from what it sees itself.

| Id | Decision | Costs | Changes |
| --- | --- | --- | --- |
| **D149** | **The ending ledger decides when an ending may go as evidence, or a parked one be let go.** The suite attributes each Attempt to an actor and a life, by the turn whose step minted or invoked it, and counts lives by its own `dispose` steps. `evidenceOnly` pays only when the life that asked is over, the actor is not alive, or the suite saw the lane let go (`Released`, or a `lane.release.*` cell for that head or that op of that actor in the step). `KeptLetGo`/`ParkedLetGo` pay only with those, or the owner's turn in the step, or a newer keep of the op. Otherwise the debt stays, and (j) names it. Asked of every oracle: `delivered` was fixed by review M5; `parked` must still be named by a wait; `checkEndings` counts and now defers to the ledger; `checkMints` still takes `Released`/`Superseded` as accounted (stated below). `g125.laundered-as-evidence`: 0 named cases before, **2 now** (MED-01, `R10-AUDIT-ENDINGS`), in `falsify.ts --part mutants` | The ledger still reads the runtime's `lane` cell names as a release's sign: a runtime lying in both `lane` and `evidenceOnly` passes. Attribution by the turn of the step: a mint with no turn in its step pays nothing, and none such exists today | `drive.ts`, `ctx.ts`, `round10.scenario.ts` |
| **D149b** | **`typed/` is a gate: `checks/types-check.ts` runs `tsc -p typed/tsconfig.json` and counts the nine `@ts-expect-error` pins**, and `mutate-one.ts` runs it with every `checks/` file. **`typed/` hashes by its text with whitespace collapsed**, so a type, a directive or a comment's words need a log line; `vp fmt`'s line breaks do not. `falsify.ts` tampers: the audit's weakening (directive gone, `as any`) is red on the count and on the lock; a directive removed alone is red on `tsc` | A comment's words under `typed/` now need a log line. The count of pins is a number in the check, changed with the file | `main.ts`, `checks/types-check.ts`, `falsify.ts` |
| **D150** | **A search stopped by depth or budget is `vacuous` if any action it ran never moved the state.** Only an action never reached may be unmoved, and only up to half. `frag`'s `resend` was such an action: it is now guarded to where it can move (after a save ended unsure), and moves at depth 6. `checks/search-vacuity-check.ts` pins it on the real runtime: one dead action of four, budget-stopped, is red; the old rule passed it | SEARCH-FRAG explores fewer edges (output logged) | `search/engine.ts`, `search/frag.search.ts`, `checks/search-vacuity-check.ts` |
| **D151** | **Two runtime rules get cases.** A fault `lateCancel`: a timer cancel that loses the race (its task already queued) fires anyway. With it, the first send's timeout fires while the resend's timer holds the key, and must be fenced (`R10-AUDIT`). Disposing the runtime with a read in flight leaves nothing open at the server (`R10-AUDIT-READS`). Both mutants (`step.timer-fence-off`, `step.dispose-reads-not-aborted`) are killed by these named cases, in `falsify.ts` | One fault in the fake world | `harness.ts`, `fake-world.ts`, `drive.ts`, `round10.scenario.ts` |
| **D152** | **Disk is read through the codec where a key's spelling is not the point.** `Ctx.record(actor)` and `Ctx.laneKeys()` ask the runtime's codec for kind and scope. Renamed keys: **112 failing before, 73 now**; an envelope: 30 before, 26 now. What stays, and why: `corruptStored` edits (a corrupt record is written in the runtime's own format; that is what they pin), `storage` steps matched by key (the fake's batch filter), and lane helpers reading one lane by its full key (round 7, 8, 9, 9b): **not yet moved**, and not justified as pins | The 73 are not marked as pins. Stated in RESULTS | `ctx.ts`, ten scenario files |
| **D153** | **A real run is scored by the modes it was asked for.** Each mode of `reality/run.ts` declares its sections and counters; a mode not reporting, a section empty, a counter missing or not a finite number fails. `--only nothing-here` is red. Re-audit L5 with it: bfcache's green arm must show `cached:true` and `back:"reload"`. `checks/score-check.ts` holds eleven new cases | `run7.ts`, `h3.ts`, `spin.ts` still score the old way | `reality/score.ts`, `reality/run.ts`, `checks/score-check.ts` |

### Stage D: every input every oracle reads (from `conformance-audit/re-check-round-10c.md`)

The gate failed twice on one class: an oracle excused a missing obligation because the runtime said why. Stage C fixed `evidenceOnly`; the re-check showed `Released` one hop further. So this stage lists every input, not the next hop.

Kinds:

- **Observed**: the suite drove it, answered it, disposed it, owns its bytes, or read it from what the runtime publishes (`state`, `memory`, the compiled data it holds, its own wrapped Slots).
- **Debt**: a self-report that only adds an obligation. A lie in it can only make a run redder.
- **Names**: a self-report that only says which attempt or op; why must be observed.
- **Checked**: a self-report used as an excuse, and itself cross-checked against something observed.
- **Allowance**: a self-report used as an excuse, not yet checked. Each is listed, so none is an oracle default by silence.

| # | Oracle | Input | Kind | What it may do now |
| --- | --- | --- | --- | --- |
| 1 | ledger (j) | `dispose` steps, life count | Observed | Ends a life: its endings may go as evidence |
| 2 | ledger (j) | `inst.state` / `inst.memory` before and after each batch | Observed | Owner gone, or owner moved (D154) |
| 3 | ledger (j) | compiled `cancel` members, `whenAbandoned.release`, op `concurrency`, outcome mappings, schedules | Observed (the suite holds the compiled data) | Says whether a move or an event can release, cancel or supersede the op |
| 4 | ledger (j) | events the suite sent; events its answers and timers map to | Observed | A cancel the suite drove (D154) |
| 5 | ledger (j) | asks, by the suite's wrap of `commit`/`lookup` input Slots | Observed | Debt (`judgeAsks`); a newer ask supersedes a lookup |
| 6 | ledger (j) | disk bytes at a kill, read by the runtime's codec | Observed bytes, codec reading | Debt (`bootOwed`) |
| 7 | ledger (j) | `corruptStored`, `wipe`, `tear` steps | Observed | Turns (j) off for the case (rule 46). A corruption that matches nothing is now red (D158) |
| 8 | ledger (j) | `ending`, `unparked`, `refused` | Debt | Adds what is owed |
| 9 | ledger (j) | `mint`, `invoked`, `turn`'s actor | Names | Attributes an attempt to an actor. **Allowance A1**: a lie that attributes to a dead actor would excuse its ending; no case shows one |
| 10 | ledger (j) | `evidenceOnly` | Names (D149, D154) | Pays only for rows 1-4 |
| 11 | ledger (j) | `Released`, `lane.release.*` cell | Names (D154) | Says a release of the op happened. Pays only if THIS attempt's owner has a cause from rows 1-4. No attempt: no wildcard |
| 12 | ledger (j) | `KeptLetGo`, `ParkedLetGo` | Names (D154) | Pays for rows 1-4, or a newer `kept` (row 15) |
| 13 | ledger (j) | `Superseded` | Names (D154, new oracle) | Owed a dispose, the owner gone, or (write) `latest` and a newer attempt of the op by the owner, or (lookup) a newer send, a newer ask, or the owner moved |
| 14 | ledger (j) | `delivered` | Checked against `turn`/`Denied`/`Unhandled`/`refused` in the batch | **Allowance A2**: the check is another self-report. A machine turn is observable only through Slots a turn may not run |
| 15 | ledger (j) | `parked`, `kept` | Checked: each must be named by a wait (`inst.waits()`) | **Allowance A3**: a wait is the runtime's inspection; for `parked`/`kept` waits nothing outside backs it |
| 16 | ledger (j) | `turn`/`Denied`/`Unhandled` pay a refusal; `fence`/`unbound` clear refusals | Self-report excuse | **Allowance A4** |
| 17 | ledger (j) | `UnmappedEnding`, `InvalidTurn` issues pay a batch's unheard deliveries | Self-report excuse | **Allowance A5**. A case that does not name the issue still fails (D130) |
| 18 | ledger (j), `checkEndings`, `checkMints` | `DisposeStart` | Checked (D158): turns (j) off only after a dispose step the suite drove | Was an allowance |
| 19 | (h) `writeAheadLies` | `fake.mayHave`, `excused` | Observed | Debt |
| 20 | (h) | heads on disk by the codec | Observed bytes, codec reading | Pays |
| 21 | (h), `checkMints` | `Released` | Names (D158): pays only if the ledger saw a cause (row 11) | Was taken at its word |
| 22 | `checkMints` | `ending`, `lostWithProcess` (the suite's own, at a kill) | Debt / Observed | Accounts a mint |
| 23 | `checkMints` | `Superseded` | Checked by row 13 | Accounts a mint |
| 24 | `checkMints` | a wait naming the attempt | Checked for `wire`/`ack`/`capture`/`timer` by L3 against the fake's outside | **Allowance A3** for other kinds |
| 25 | `checkEndings` | `invoked`, `ending` | Debt | |
| 26 | `checkEndings` | `Superseded`, `AbandonedFiber` close a send | `Superseded` checked (row 13); **Allowance A6** for `AbandonedFiber` | |
| 27 | L3 `checkClaims` | `wire`, `ack`, `capture`, `timer`, `repair` waits | Checked against the fake's open requests, writes and timers | |
| 28 | L3 | `held` waits | Checked against published state | |
| 29 | L3 | `disabled` waits | Checked against a `ModuleDefect` issue | **Allowance A7**: two self-reports |
| 30 | L3, D133 | `fatal` | Checked: a `Fatal` issue, named by the case | Per-case allowance, as it should be |
| 31 | L3 | `quiet().idle` | `inst.pending()` and the fake's own work | A lie only makes it redder (not idle fails) |
| 32 | S11 replay | the runtime's logged draws | Self-report, compared with what was published | Consistency; `lyingReplay` in `falsify.ts` |
| 33 | searches | `stateText` for dedupe | Self-report | Prunes; `constantHash` in `falsify.ts` |
| 34 | searches (odd, listen, fragstore) | published records against the fake server's truth | Observed | |

**Counts: 34 inputs. 11 observed (1-7, 19, 20, 22, 34), 3 debt-only (8, 25, 31), 6 names-only (9-13, 21), 12 checked (14, 15, 18, 23, 24, 26-30, 32, 33), 2 excuses at the runtime's word (16, 17). 7 allowances in all (A1-A7): the two excuses, and five rows whose name or check rests on another self-report.** Rows 10, 11, 12, 13, 18, 21 were excuses at the runtime's word before this stage. Every row has a lie in `falsify.ts` except the allowances.

### Stage D decisions (all proposed)

| Id | Decision | Costs | Changes |
| --- | --- | --- | --- |
| **D154** | **An oracle may excuse a missing obligation only for a cause the suite observed itself.** A self-report may say which attempt, never why. The causes: a `dispose` the suite drove (a life over); the owner gone from what it publishes; the owner's published state or memory moving in the batch while the compiled machine can let the op go (a `cancel` member, or a `whenAbandoned.release`); an event the suite drove to the owner (sent, or mapped by the compiled data from its answer, its timer, or a restored ending after a reload it drove) on which some alternative cancels the op. `Released` and `lane.release.*` name a release; THIS attempt's owner must have a cause. The no-attempt wildcard is gone. `Superseded` gets an oracle: a write needs `latest` and a newer attempt of the op by the same owner; a lookup needs a newer send, a newer ask (seen by the wrapped input Slot), or the owner moving | The cancel cause is by event, not by alternative: an event with a cancel member under a guard that refused still counts. A memory change of the owner beside a lie, with a releasable op, still excuses. A let-go with no attempt takes any actor's cause | `drive.ts` |
| **D155** | **Lying runtimes are a standing part of `falsify.ts` (`--part lies`).** One per self-report the oracles read as an excuse: `evidenceOnly`, `Released`, a `lane.release.*` cell with and without an attempt, the narrowest `like2nc` and `save` lies with `Released`, a settled head said `Superseded`, a `serialize` queue said superseded, a `DisposeStart` with no dispose, a settled head said `Released` (`checkMints`), a cancel letting go every parked ending. Eleven. Each must go red by a named oracle with no output compare, and by the oracle named (`(j)`, `(j) superseded`) | The allowances A1-A7 have no lie yet | `falsify.ts` |
| **D156** | **`types-check` finds directives as TypeScript does, by comment token (`^//\/?\s*@ts-expect-error`), skipping strings and block comments, and pins each by its words.** Eight, not the nine the text count held (one was the header). The re-check's tamper (a directive made a mention, `as any`) is red by its words, in `falsify.ts`. The installed TypeScript is 7, with no JS scanner, so the token scan is ours | A directive's words need a check edit when they change | `checks/types-check.ts`, `falsify.ts` |
| **D157** | **Every real-run mode declares its row counters.** `s3`, `desk`, `crash` rows and `tabs` have them. Cycles and `n` must be above zero; no count may be negative; a key not declared by a declared mode fails, so a misspelt counter beside the real one is red. Each re-check attack is a case in `checks/score-check.ts`, beside a green per mode | `run7.ts`, `h3.ts`, `spin.ts` still not by mode (D153). A new row field needs a declaration | `reality/score.ts`, `checks/score-check.ts` |
| **D158** | **The rest of the re-check's M4'.** `corruptStored` that matches no key throws; `odd`'s corruptions are tried only where their match is on disk. `Ctx.record` takes the actor's id from `Reads.actorKey`, the suite's one spelling, which `diskScope` answers in. REV9-KEPT's two "nothing on disk" absences go through `Ctx.lanesOf` (kind and scope by the codec). `DisposeStart` turns the ledger off only after a dispose step the suite drove; `Released` excuses (h) and `checkMints` only when the ledger saw its cause | Lane helpers reading one lane by its full key are still literal for presence checks | `drive.ts`, `harness.ts`, `ctx.ts`, `round9.scenario.ts`, `odd.search.ts` |

## Design edits owed at merge

`machine-design.md` is not edited in this round. Owed:

1. Rule 30, 2.8.5, 2.8.6 E7, rule 31: a retry does not rejoin the queue (LIB-02, D3, D40). Recheck rule 32's limit wording.
2. Rule 25: a carve-out or a new rule for the repair's own 30 s bound (STORE-07, D40).
3. Rule 8, 2.5: a turn refused twice stays with what owes it (REV9-EDGE, D109, D118, D123).
4. `machine-design.md:1115`, `:3865`, the ordering rule (R M1), the four lines: follow-ups first and global, up to the bound; else one mail from the next actor in rota, oldest first within that actor; an actor joins the rota at its first mail and goes to the back after each; nothing orders two actors' turns unless a turn links them.
5. Rule 37 and 27: a read mapper's throw, or a result of no shape, ends the read in failure `Defect` (D147, HIGH-03).
6. Host contract (2.10 or the host section): the lock is held while the page is live; a page that enters the back-forward cache releases it after its flush, and a return from the cache is a new boot (D148).
7. Rule 25: a frozen page runs nothing, so no deadline, backoff or capture fires until a thaw; a discard is a kill with no `pagehide` (D146).
8. Author contract for server keys (rule 19's neighbourhood): a server may prune a key; a resend on an old key reads what the server holds first. Flow keeps no key age (D145).

## For Arpit: the hidden-tab spin (review M2), recorded, not changed

Decided by correctness, under delegation: **leave it as named, option A.** 5,535 failing requests a second from a hidden tab is a cost, not a wrong answer: no work is dropped, no money moves twice, and requirement 7 (no wall-clock number decides *what*) rules out a cut. Option B (a `setTimeout` yield past 2 s hidden) would put a correct bulk import back at 8 ms a second, which is requirement 6's failure. The real fix is an explicit retry with a delay, which needs an API; it goes with `retry`. Until then the cost is stated: a spin burns a core and hits the server at task rate, hidden or not, and `TurnStorm` names only same-input failures. Yours to overrule.

## Rule 37 and the rules no case cites

The audit's list, by what would test each. Added this round: **rule 37's read defect** (HIGH-03, D147), **rule 12's origin** for every issue (an oracle, not a case), **rule 51**'s cancel against a kept ending (`letgo-takes-all`).

| Needs | Rules | State |
| --- | --- | --- |
| A runtime case, and it matters | 47 (mapped events only from endings), 50 (only the fragment acts), 56 (a host that ends a holding placement can start it again), 59 (a fragment's rows while its incarnation is absent) | **Owed, next round.** 47 and 59 first: both are runtime-visible and unpinned |
| Entities | 26, 33, 34, 36, 37's confirmed-data half | With entities |
| Types or compile, with `tsc` as a gate | 2, 3, 4, 5, 10, 39, 40, 41, 48, 49, 57 | `typed/type-tests.ts` is not a gate yet; owed |
| `flow check` pins | 20 (has pins), 55 (none: `Rule20Adopted`, `BareWrite` unpinned) | 55 owed |
| Stories, `flow graph`, `story`, `trace` | 11, 58, 61, 62, 63, 64, 65, 66 | **No code exists.** Stated, not built

## Traces of the failures D130 exposes

Twelve failed once the checks reached the driven harness. **None is a runtime bug.** All 12 traced by printing the first difference (`FLOW_REPLAY_TRACE=1`).

| Cases | What it was | Answer |
| --- | --- | --- |
| REV6-H5 (2) | Replay limit. The case changes a key closure between lives (`rel.v = 2`), and replay ran the first life under the second closure: `{"key":"a"}` against `{"k":"a"}` | **`Harness.release(now, before)`:** the program changing is a step. S11 replays each life under the program it ran. No exemption. REV6-M8 made the same move, and passed by luck |
| REV8-KEPT (1), REV9-KEPT (3), REV9-EDGE (3) | The same limit. `__healed`, a release that fixes a closure, flipped outside the harness, so a replay's turn refused where the live one committed | Same step. S11 is now pinned for kept endings and for a release that changes a key |
| PAY-11/refused-after-members | Expected issue, never named: the check never reached the second harness | Named |
| REV9-LOOP/a-commit-that-throws… | Same: `Defect` | Named |
| REV5-H2/a-module-value… | Same, already named by its inner `Ctx`. The runner read another list | One list per case |

Also `PAY-17/core-throw-is-fatal`, new with D133: it named `Fatal` after the fatal. Moved. And a fault armed in one life and spent in the next would replay wrongly; none does today, but the replay now starts each life from what was armed when it booted.

## What the new checks found (stage A)

- **D140's cause was not where the audit put it.** The array copy was half. `durable.ts` flush walks all mail each step to find restored endings (profiled: most of the time). `MailQ` keeps a count of them. 100,000 sends in the driver: 85 s on round 9, **0.24 s** now; 10,000: 986 ms, 42 ms (`bench/burst.ts`, scored).
- **The token hash first hashed every scenario body as nothing:** the transpiler drops an unused pure expression, so all bodies matched. Seen only because `--hashes` listed too few ids. Held by an assignment now. `falsify.ts` tampers a scenario body and the lock, so this cannot come back quietly.
- **`--swap`, the 5 s gate, CLI pins, date check:** unchanged. 5 s gate: 29 failed, 29 expected.

## Limits stated

- **Whole output is a change detector.** It was captured from the runtime, so it says "this changed", never "this is right". Mutation scores count it apart (`killedBy: "output"`).
- `REV9-LOOP`, `R10-RUNTIME` allow away requests, actors, evidence, frames, hashes, outside, waits: how far a spin gets in a step is the work clock's count. Their named assertions and truth, issues, disk, fatal stay.
- `SEARCH-ODD-*` keep their own oracle, untracked. Three cases boot nothing, since the seal refuses. `falsify.ts` lists them, so a fourth is noticed.
- `outputs` read disk by key prefix, so a format change moves every line. Stage B's job (cause 5).
- Search floors: a `closed` needs every action to have moved or an `idle` reason. A search cut off by depth or budget needs half. So a search of a real runtime with half its actions dead by a bug would read as green at low depth. A named limit, not a proof.
- A log line can still say something poor: D135.
- The older mutant lists (`mutants-r9b.ts`' `d122.mail-fifo`, and any quoting `enqueue`, `takeMail`, the pump's `mark`) no longer apply to round 10's text. They were not rewritten; `mutate.ts` refuses a stale edit by name. Stage B's sweep.
- Bench, `reality/`: still not scored, except `bench/burst.ts`. Stage B.
