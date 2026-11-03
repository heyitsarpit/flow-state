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
| 14 | ledger (j) | `delivered` | Checked against `turn`/`Denied`/`Unhandled`/`refused` in the batch. **Stage G:** observed by the suite's own guard. **Stage H:** conserved: every observed handler run of a mapped event is paid once by an expected delivery to that recipient or by a send, follow-up or refusal retry the suite saw; recipients are told apart by a suite serial in each incarnation's memory (D173). **Stage I:** a boot's runs are placed by serial once `port.boot` returns, by the same ledger (D176); the suite adds no Slot (D177). **Stage J:** a boot's runs are judged as they happen, state check included, by the runtime's published reads from its first evidence (D180); serials minted by the Host's record decode, no platform global (D181) | **Allowance A2**, narrowed to the 143 deliveries no guard saw (no alternative's guard ran) |
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
| **D154** | **An oracle may excuse a missing obligation only for a cause the suite observed itself.** A self-report may say which attempt, never why. The causes: a `dispose` the suite drove (a life over); the owner gone from what it publishes; the owner's published state or memory moving in the batch while the compiled machine can let the op go (a `cancel` member, or a `whenAbandoned.release`); an event the suite drove to the owner (sent, or mapped by the compiled data from its timer, a restored ending after a reload it drove, or its answer of ANOTHER op: an answer's own event never excuses an ending of the same op, or a hidden ending excuses itself) on which some alternative cancels the op. `Released` and `lane.release.*` name a release; THIS attempt's owner must have a cause. The no-attempt wildcard is gone. `Superseded` gets an oracle: a write needs `latest` and a newer attempt of the op by the same owner; a lookup needs a newer send, a newer ask (seen by the wrapped input Slot), or the owner moving | The cancel cause is by event, not by alternative: an event with a cancel member under a guard that refused still counts. A memory change of the owner beside a lie, with a releasable op, still excuses. A let-go with no attempt takes any actor's cause | `drive.ts` |
| **D155** | **Lying runtimes are a standing part of `falsify.ts` (`--part lies`).** One per self-report the oracles read as an excuse: `evidenceOnly`, `Released`, a `lane.release.*` cell with and without an attempt, the narrowest `like2nc` and `save` lies with `Released`, a settled head said `Superseded`, a `serialize` queue said superseded, a `DisposeStart` with no dispose, a settled head said `Released` (`checkMints`), a cancel letting go every parked ending. Eleven. Each must go red by a named oracle with no output compare, and by the oracle named (`(j)`, `(j) superseded`) | The allowances A1-A7 have no lie yet | `falsify.ts` |
| **D156** | **`types-check` finds directives as TypeScript does, by comment token (`^//\/?\s*@ts-expect-error`), skipping strings and block comments, and pins each by its words.** Eight, not the nine the text count held (one was the header). The re-check's tamper (a directive made a mention, `as any`) is red by its words, in `falsify.ts`. The installed TypeScript is 7, with no JS scanner, so the token scan is ours | A directive's words need a check edit when they change | `checks/types-check.ts`, `falsify.ts` |
| **D157** | **Every real-run mode declares its row counters.** `s3`, `desk`, `crash` rows and `tabs` have them. Cycles and `n` must be above zero; no count may be negative; a key not declared by a declared mode fails, so a misspelt counter beside the real one is red. Each re-check attack is a case in `checks/score-check.ts`, beside a green per mode | `run7.ts`, `h3.ts`, `spin.ts` still not by mode (D153). A new row field needs a declaration | `reality/score.ts`, `checks/score-check.ts` |
| **D158** | **The rest of the re-check's M4'.** `corruptStored` that matches no key throws; `odd`'s corruptions are tried only where their match is on disk. `Ctx.record` takes the actor's id from `Reads.actorKey`, the suite's one spelling, which `diskScope` answers in. REV9-KEPT's two "nothing on disk" absences go through `Ctx.lanesOf` (kind and scope by the codec). `DisposeStart` turns the ledger off only after a dispose step the suite drove; `Released` excuses (h) and `checkMints` only when the ledger saw its cause | Lane helpers reading one lane by its full key are still literal for presence checks | `drive.ts`, `harness.ts`, `ctx.ts`, `round9.scenario.ts`, `odd.search.ts` |

### Stage E: a reference model of binding (from `conformance-audit/re-check-round-10d.md`)

The gate failed three times on one class: (j) excused an undelivered ending by something the runtime said (`evidenceOnly`, then `Released`, then `parked`/`kept`). The root: the suite had no model of its own for which actor may receive an op's ending, so it borrowed the runtime's. `conformance/reference/model.ts` is that model. It is written from `machine-design.md`'s rules 14, 44, 49, 51, 52, 53, 60, imports nothing from `round-*`, and reads only the compiled data and the leaf state an actor publishes. Every answer is yes, no or unknown; an oracle excuses only on a certain one.

Inventory changes (the stage D table, rows by number):

| # | Was | Now |
| --- | --- | --- |
| 2, 3 | "owner moved" while any machine anywhere had a `cancel` or `whenAbandoned.release` of the op name | Per owner, by the reference: between the leaf before and after the batch, the owner left every state that binds the op, or left a fragment that releases it. A `cancel` alternative is no cause by a move alone (which alternative ran is not published). Unknown (a keyed, nested or resumable fragment) pays only a fragment's own op |
| 4 | A reload added every mapped event of every op, and `advance` every schedule, to every actor | Per owner: a reload drives the mapped events of each open attempt to its own actor, marked with that attempt, so a restored ending never excuses itself as evidence (it may still pay the release (h) reads); `advance` drives each actor its own machine's timers; an answer drives its op's events to the owners of that op's open attempts. The cancel must be one the owner's own machine has, on that event |
| 9 | **A1**: a `turn` of any actor attributes | **Checked**: a `turn` of an actor the suite never addressed and that publishes nothing is red, and attributes nothing. A1 closed |
| 15 | **A3**: `parked` checked only against a wait | **Checked against the reference**: a park of an attempt whose owner is alive, not disposing, and whose published state the reference says binds the op is red, whatever a wait says. Left as allowance A3': a park with no attempt (a decline), and a park where the reference says unknown |
| 16 | **A4**: `turn`/`Denied`/`Unhandled` pay a refusal by event; `fence`/`unbound` clear every refusal | `Denied`/`Unhandled` pay only if one of the event's alternatives' Slots (the suite's own wrap) ran after the refusal; `fence`/`unbound` pay only with an actor the suite saw gone in that batch. Left as allowance A4': a `turn` of the event pays (A2's class) |
| 35 (new) | | `Instance.binding(actor, op, subject)`, optional: the runtime's own answer. Oracle (ref) compares it with the reference every batch, for every live actor and op of its machine, where the reference is certain (a root op, bound while the actor lives; a fragment op with no placing state, bound nowhere) |

**Counts: 35 inputs. 11 observed, 3 debt-only, 5 names-only, 15 checked, 1 excuse at the runtime's word (17). Allowances: A2, A3' (narrowed), A4' (narrowed), A5, A6, A7; A1 closed.**

### Stage E decisions (all proposed)

| Id | Decision | Costs | Changes |
| --- | --- | --- | --- |
| **D159** | **The suite holds a reference model of binding and cancels, `conformance/reference/model.ts`, from the design's rules, and checks the runtime's `bindingOf` against it every batch (oracle `(ref)`).** Three-valued; an excuse needs a certain answer. A placement keyed by `.each` or `resetOn` is unknown, since the ending's subject picks the incarnation, and so is one beside it | The reference cannot see a fragment's own states, nested fragments or frozen copies; there it says unknown and the old allowance stands. A runtime that does not offer `binding` skips (ref) | `reference/model.ts`, `drive.ts`, `harness.ts`, `round-10/adapter.ts`, `round-10/turn.ts` (`bindingIn`, extracted, same code) |
| **D160** | **(j): an ending may be parked only where the reference says no live actor binds it, or the owner is gone or moved off its binding state.** The re-check's H1'' | `kept` is not reread: after a refusal twice it is right on a bound owner (D118); its cause is the refusal, which D162 now checks | `drive.ts` |
| **D161** | **Every D154 cause is per owner.** Moves by the reference (rows 2-3); driven events per actor, by its own machine (row 4); a restored ending pays its own release, never its own ending as evidence | A memory change of an owner with a keyed fragment that releases the op still excuses (unknown) | `drive.ts`, `reference/model.ts` |
| **D162** | **A1 closed and A4 narrowed**, as rows 9 and 16 say | A `turn` still pays a refusal | `drive.ts` |
| **D163** | **`types-check` pins each directive's error, by code and words, on a copy with the directives stripped (re-check L1); `falsify.ts --part lies` holds the 24 stage D lies beside the 11 (`--slice i/n` keeps each command under 5 minutes; a lie whose trigger fires in no case must show its probe firing nowhere); `falsify.ts` finds `node_modules` from a fresh worktree through git's common dir** | A changed error message needs a check edit | `checks/types-check.ts`, `falsify.ts` |

### Stage F decisions (from `conformance-audit/re-check-round-10e.md`; all proposed)

| Id | Decision | Costs | Changes |
| --- | --- | --- | --- |
| **D164** | **(j) checks who received each ending, not how many.** The suite records each attempt's copy from what it drove; `delivered` names the copy it ran in (`at`); a mismatch, a missing `at`, or a delivery the suite cannot place is red | A runtime must publish the delivery's path. Placement from a root event with 2+ copies rests on the `.each` key the wrapped input Slot saw | `drive.ts`, `round-10/turn.ts` (evidence only), FRAG-21 |
| **D165** | **The reference is answered per copy** (`Reference.copies`: published leaf, `.each` membership, published copy state, `resetOn` values). The park check and a decline's park use the attempt's or decline's own copy. A3' closed | `moveLetsGo`/`cancelsOn` still whole-actor | `reference/model.ts`, `drive.ts` |
| **D166** | **(ref) asks with the real subject** for every open `.each` copy attempt; a lie in the runtime's `binding` alone is red | `resetOn` copies are not asked by (ref) | `drive.ts`, `falsify.ts` |
| **D167** | **`reference/` is under the lock**, with a tamper in `falsify.ts` | | `main.ts`, `falsify.ts` |
| **D168** | **A `turn` pays a refusal only with a seen Slot run** (A4' closed); `types-check` finds `tsc` through git's common dir | A refused event whose alternatives run no Slot could not be paid by a turn; none in the suite | `drive.ts`, `checks/types-check.ts` |

### Stage G: who received an ending, observed (from `conformance-audit/re-check-round-10f.md`; all proposed)

The gate failed six times on one path: (j) learned who received an ending from what the runtime said about the delivery (`evidenceOnly`, `Released`, `parked`, a count, `at`, then a `turn` of any actor). By the convergence rule this stage does not patch hop seven. It replaces the source: the suite observes the recipient itself.

**How.** The suite holds the compiled data it boots, so it adds a guard of its own, first, to every alternative on an event an ending maps to (machine nodes and fragment nodes). The guard always passes. The runtime runs it with the recipient's own view, as it runs any guard. At that moment the suite places the view itself: the actor (from its own `ensure` steps), its life (from its own `dispose` steps) and its copy (from `Reference.copies`) whose published memory equals that view. Each `delivered` is paired, in order, with the first unused observation of an event the compiled data maps its op to. The expected recipient is total: the attempt's owner (the actor whose turn made it), that owner's current life (a dispose keeps a persisted record and the next life adopts the ending: rule 44, FRAG-20), and the copy recorded from what the suite drove; or a stated reason for none (copy undecided: red; made before this boot: actor and life only). Nothing the runtime says about the delivery is in that loop.

**Deleted.** The `at` check (D164's `samePath(want.path, at)`), the "a delivery names no copy" check, and `heard` as the payer of an observed delivery (an observed delivery is paid by its own observation). `round-10/turn.ts` still writes `at` into `delivered`; no oracle reads it.

**What it rests on.** Published `state`, `memory` and `inner` (inventory row 2's class, Observed) and the compiled data. Run counts over the suite (`main.ts` prints them as `RECIPIENTS`): 44,063 deliveries observed and placed; 1,364 of them among equal views (two actors or copies with equal memory, where any of them passes); 205 at a boot (the new instance is not readable until `port.boot` returns, so a view is placed by what each actor published before the kill; none matched, a stated reason, not red); 143 unobserved (no alternative's guard ran: an event the state does not handle, or every alternative refused by a token), paid by the batch's `turn`/`Denied`/`Unhandled` as before (allowance A2, narrowed to these).

| Id | Decision | Costs | Changes |
| --- | --- | --- | --- |
| **D169** | **(j) observes each ending's recipient** by a guard of its own on every alternative of a mapped event, placed by published views into one actor, life and copy, and compares it with the recipient the suite expects from what it drove. A mismatch is red (`(j) delivered to the wrong recipient`), and so is a view no actor or copy the suite drove publishes. FRAG-22: two actors of one machine, three keyed copies each, an unknown, a failure and a success to one copy of one actor; and a keyed failure, another actor's unknown and two copies' own turns in one batch | Views equal across actors or copies cannot be told apart (1,364). A view at a boot is placed by pre-kill memory only. An event no guard can see is still allowance A2 (143). The suite runs at about the same time as before (61 s on this machine, as HEAD) | `drive.ts`, `main.ts`, `frag.scenario.ts`, `SCENARIOS.md` |
| **D170** | **Let-go per copy and per owner.** `moveLetsGo` answers an attempt placed in a copy by THAT copy (gone, or its own `resetOn` value changed: rule 51), not by the actor's memory moving. `cancelsOn` counts an event the suite sent to one copy (`to`) only for that copy's attempts. A decline's let-go is owed the actors whose declining or refused turn the suite saw, not every actor it knows (REV9-EDGE's new variant: a kept decline stays while another actor moves) | A fragment's cancel reached by a raise from the host is still `unknown` and pays | `drive.ts`, `round9b.scenario.ts` |
| **D171** | **`Reference.copies` de-duplicates by path** (re-check G1): two members with one key are one incarnation. `falsify --part search` is all ok on the real runtime | | `reference/model.ts` |
| **D172** | **`types-check` from a fresh worktree** links the main checkout's `node_modules` at the worktree root for the run (the same packages its `tsc` came from) and removes it at exit (re-check L1) | Writes a link into the worktree for the run | `round-10/checks/types-check.ts` |

Inventory changes: row 14 (`delivered`) is **observed** for the 44,063 deliveries a guard saw; A2 remains only for the 143 no guard saw. Row 12 (`KeptLetGo`/`ParkedLetGo` with no attempt) is now per owner. The `at` field is no longer an input of any oracle.

### Stage H: every observed run accounted for (from `conformance-audit/re-check-round-10g.md`; all proposed)

Stage G observed who ran an ending, but only asked the question one way: each `delivered` found one observation, and the observations left over were never read (H1⁵), and the recipient was found by memory equality, so equal views were any of them. Both are one gap: the suite did not hold a ledger of the runs it saw. By the convergence rule this stage does not add a leftover check beside the old placement. It replaces placement and pairing with one requirement, conservation, and a total identity it rests on.

**Conservation.** Per batch, every handler run the suite's guard observes on a mapped event is accounted for exactly once: by an expected ending delivery to **that** recipient (actor, life, copy), or by a cause the suite saw itself for that recipient: a send it made (`send`, `burst` n times, `sendMany`, `Harness.send`), a follow-up whose compiled Slot it saw return the event in that actor's turn, a timer of that actor's machine on `advance`, or one retry after a `refused`. A run left over is red: `(j) delivered to the wrong recipient` when an expected delivery of that event went unobserved in the batch, else `(j) a handler run nothing accounts for`. A send pays at most one run; a send not run pays nothing and is not owed one (a send may be unhandled). Credits die with the process at a kill. A delivery whose recipient ran nothing is allowance A2 as before (143).

**Identity.** The suite wraps every `memory.initial` and `memory.restore` in the compiled data it boots (machines and fragments; a `restore` that is absent becomes the identity plus the serial) to give each incarnation a serial under a symbol key the suite owns. Spread keeps it, so a patch does; `canonValue`, JSON, the disk codec, `stateText` and every output ignore symbol keys, so no published text changed (736/736 with whole output, no output line moved). The ear reads the serial from the view and maps it to the one actor and copy whose published memory carries it. The ear also names its node, so the recipient's published leaf must be that node or under it: a run in a state the recipient does not publish is red.

**Deleted.** `placeView` (memory-equality placement over actors and copies), `placeAtBoot` (pre-kill memory equality), the structural `same`, the `indistinct` count, and pairing a delivery with the first observation of any of its events. A boot's runs are counted by event against the boot's deliveries and retries, not placed: the booting runtime is not readable until `port.boot` returns, and its restored memory carries a new serial.

Run counts (`RECIPIENTS`, 736 cases): observed and placed 45,380; **ambiguous 0** (a view with no serial; a serial two incarnations publish is not counted: the first place cached wins, as the code does (this note said "the last scanned wins" until stage I; D178 makes such a serial red); unplaceable 0; at a boot, counted 256; unobserved (A2) 143; runs paid by the suite's own sends 175; left over 0.

| Id | Decision | Costs | Changes |
| --- | --- | --- | --- |
| **D173** | **(j) conserves observed handler runs.** Each run of a mapped event the suite's guard sees is paid exactly once, by an expected delivery to that recipient or by a send, follow-up, timer or refusal retry the suite saw for it; a run left over is red. Recipients are told apart by a suite serial minted in every incarnation's memory, never by its view; the state is matched by the ear's node. Memory-equality placement is deleted | A memory a compiled Slot makes other than `initial`/`restore`, or one that is not a plain object, carries no serial; none in the suite (ambiguous 0), and any would be red. A boot's runs are counted, not placed. A follow-up pays a run in any copy of its actor. A raise to a child on a mapped event would need a credit; none in the suite | `drive.ts`, `main.ts` |
| **D174** | **FRAG-23**: two Feed actors with equal memory in one state, and in two states (LIVE, AWAY); two equal copies across two Notes actors (same key, same body); an ending beside the suite's own send of its event to another actor | Within one actor two `.each` copies never have equal views (the view carries the key), so "two equal copies" is built across two actors | `frag.scenario.ts`, `SCENARIOS.md` |
| **D175** | **`falsify --part lies` holds the stage G re-check's lies**: `q3.dup-other`, `q3.dup-copy`, `q1.wa-eq-any`, and `q5.send-stolen` (an ending run in another actor the suite sent mail to in that batch) | `q5.send-stolen` fires in 2 cases, not in FRAG-23's own variant (the send has run before the ending arrives there) | `falsify.ts` |

### Stage I: a boot is not a special case, and the suite adds no code path (from `conformance-audit/re-check-round-10h.md`; all proposed)

Two findings, one root each. H1⁶: at a boot, (j) counted restored endings by event and never placed them, so a restored ending run in another actor or copy stayed green. T1: to carry the serial, the suite gave every memory with no `memory.restore` one of its own, so the runtime's own branch for none (`durable.ts`: `dec ? dec.run(i.memory) : i.memory`) never ran in tests. The rule both break: the harness observes; it does not change what the runtime runs, and it does not special-case a step it cannot read.

**How.** A boot's evidence and issues are held, in order, each batch with the ears it heard, and judged once `port.boot` returns, when the new instance is readable. Each run is then placed by its serial with the same one-to-one ledger, `fits` and credit rules as any batch: the `o.boot ||` escapes are deleted. Only the state check (the ear's node against the recipient's published leaf) is not made for a boot's runs, since the leaf has moved by then. The serial of a memory with no restore is minted where the runtime makes that object: while the runtime runs (inside `port.boot`, a settle, a step the suite drives), each plain object `JSON.parse` returns gets a serial in place, under the suite's symbol key, before the runtime holds it. The compiled data is wrapped only where it has a Slot: `initial`, and `restore` where it exists.

Run counts (`RECIPIENTS`, 738 cases): observed and placed 45,642; at a boot, placed 260 (was 256 counted); ambiguous 0; unplaceable 0; one serial in two places 0; unobserved (A2) 143; paid by the suite's sends 175; left over 0.

| Id | Decision | Costs | Changes |
| --- | --- | --- | --- |
| **D176** | **A boot's runs are placed by serial after `port.boot` returns.** Its batches are held and judged in order then, each with its own ears, by the one ledger every batch uses. R10-BOOT-ROWS: two rows of one machine reload with a write in flight each, through a compiled restore (each row's own count moves: 101, 100) and through none (each keeps its memory: 1, 0) | The state check is not made for a boot's runs. A copy that a restored ending's turn ends during the boot would publish its serial nowhere afterwards, and be red as unplaceable; none in the suite | `drive.ts`, `main.ts`, `round6.scenario.ts`, `SCENARIOS.md` |
| **D177** | **The suite adds no Slot.** A restore that is absent stays absent, and the runtime's own branch for it runs. The serial of a decoded memory is minted at `JSON.parse`, in place, while the runtime runs. `h.restore-absent-lost` (that branch returns `{}`) is red by named oracles in 91 cases; at stage H it was green | The platform is instrumented: a runtime that decodes by another means mints no serial, and its views are `ambiguous` (red, loudly). Every plain object the runtime parses carries a symbol key; no published text, hash or output moved | `drive.ts`, `falsify.ts` |
| **D178** | **One place per serial.** `resolve` keeps the first place a serial was seen (stage H's note said "the last scanned wins"; the code kept the first, and now both say first). A scan that finds one serial in two places is red: `(j) one incarnation's identity is published by two` | | `drive.ts`, `main.ts` |
| **D179** | **`falsify` holds the stage H re-check's boot lies and its mutant.** `--part lies`: `h.boot-other`, `h.boot-copy`, `h.boot-dup`. `--part mutants`: `h.restore-absent-lost`. `d154.event-fail-released` and `d154.event-like-released` are retired: their trigger (a failure ending taken while its owner has a `send` in mail) needs a send injected between an ending's enqueue and its turn, and no case does that; a lie that cannot fire proves nothing | The cause they lied about (a cancel by a driven event) has no lie now. A case for it is owed (`round-10/STATUS.md`, item 0) | `falsify.ts` |

**Every place the harness wraps program functions, checked against the same rule** (does the runtime take a different path?):

| Wrapper (`conformance/drive.ts`) | What it wraps | Changes a path? |
| --- | --- | --- |
| `wrap` | every compiled Slot (`run` + `at`), to record its run and throw an armed fault | No, unless a case arms a fault there; that is the fault |
| `askedFor` | an existing `input` Slot of a `commit`/`lookup` member | No |
| `commit` wrapper | an existing commit function, for `startThrows` | Only when armed |
| `listen`'s ear | **adds** one guard, first, to every alternative on an event an ending maps to | No branch in `round-10` reads how many guards an alternative has, and the work clock is read per pump, not per Slot. The ear always passes. It is still an added Slot run: a runtime that charged work per guard, or skipped empty guard lists, would run differently. Stated |
| `listen`'s `follow` | an existing follow-up Slot | No |
| `tagged` | `memory.initial` (always present) and `memory.restore` where present | The runtime gets a copy of what the program returned. A runtime comparing that result by reference would see it; none does |
| `whileRuntimeRuns` | `JSON.parse`, not a program function | No path. Objects carry one more symbol key |
| `Object.fromEntries` rebuilds in `wrap` and `listen` | the compiled data's plain objects | Identity of compiled objects changes; the runtime seals its own copy anyway |

Inventory changes: row 14 (`delivered`): a boot's runs are placed, not counted. The note on two publishers is replaced by a red check.

### Stage J: a boot is judged as it happens, and the suite instruments no platform global (from `conformance-audit/re-check-round-10i.md`; all proposed)

Two findings, one root. S1: D176 skipped the state check for a boot's runs, so a restored ending run from a state its row is not in passed (`h.boot-stale`, `h.boot-state`: 0 by (j)). D177: the serial of a memory with no restore came from a process-wide `JSON.parse` hook, which reached 9,500 objects that are not memories and does not carry to production. The root both share: the suite could not read the runtime during its boot, so it held the boot's batches and reached for the platform to carry identity in. Both go once the runtime's published reads answer from its first evidence.

**The fix chosen for S1, and why.** Neither of the review's two as written.
- **B** (`port.boot` returns before restored endings run) changes runtime behaviour. With a synchronous load, the `boot` input and the turns that deliver restored mail run in one pump inside `createRuntime` (`driver.ts`, `boot` and `pump`). Deferring them to a task lets inputs that waited for the boot (`waitingBoot`) step before the restored endings, and a listener's first read sees the world before them. That is a different ordering, not only a different place to observe, so B fails its own condition.
- **A** (check each run's node against the leaf on the suite's disk) needs the leaf after every earlier run in the same boot. The reference cannot step it: which alternative a turn takes depends on guards and patches the reference does not run. Advancing it by the runtime's `turn` would take the runtime's word.
- **Taken: A's check, from the runtime's published reads, live.** `BootArgs.reads` hands the suite the Instance's published reads (`state`, `memory`, `inner`, `binding`) before the runtime boots; until `createRuntime` returns they answer from the world of the last logged step (`adapter.ts`, `early`). A boot's batches are no longer held: each is judged as it happens, its runs placed by serial and their state checked at the ear, by the same reads as any other batch. The ear reads the leaf before the step, as it does everywhere. Runtime behaviour is unchanged: nothing it runs or orders moved, only what the suite can read and when.

| Id | Decision | Costs | Changes |
| --- | --- | --- | --- |
| **D180** | **A boot is judged as it happens.** An Instance's published reads answer from its first evidence (`BootArgs.reads`), so a boot's runs are placed by serial and state-checked at the ear like any other run. D176's held batches and its stated limit are deleted. Until the reads are given, the suite reads nothing (never the killed instance), and a run there is unplaceable: red | A Port must answer its published reads during its own boot. A runtime that cannot is red at every boot, loudly | `harness.ts`, `drive.ts`, `round-10/adapter.ts` |
| **D181** | **Serials are minted by the Host's record decode, not a platform hook.** `Host.decode(key, text)` is the store's codec; the runtime parses a stored record through it (`System.decode`, `durable.ts`'s `parse`; not given, `JSON.parse`). The suite's host mints a serial on every plain object of an actor record (by the runtime's own `disk.kind`), in place. D177's `JSON.parse` swap is deleted. Keyed copies keep their identity: a copy's memory is an object in the record, so it has its own serial, and `viewOf`'s spread keeps the symbol key. The review's note holds: a table keyed by actor or by object would miss them, so none is used | One optional Host member and one System member, both read only at a record's decode. Objects inside an actor record that are not memories (the record, its incarnations, nested values) still carry a serial; none is published. In production the same seam is the Host's store codec, and the compiled `memory.restore` wrapper stays for persisted memory with a Schema | `fake-world.ts` (Host), `drive.ts`, `round-10/world.ts`, `driver.ts`, `durable.ts` |
| **D182** | **The boot's state and copies, named.** R10-BOOT-STATE: `Lab/RowMove`, two rows with a write in flight each; row a moves SAVING to REVIEW while its write is out; at the reload a takes REVIEW's `Unsure`, b takes SAVING's (to EDITING). FRAG-24: two `.each` copies of one Notes actor with a write in flight each reload, each hears its own `Restored`. `falsify --part lies` holds `h.boot-stale` and `h.boot-state`. `d154.moved-save-released` fires now, in FRAG-24 (two restored `save` endings of one actor in mail at once), and is red by (j) | | `fixtures/round6.compiled.ts`, `round6.scenario.ts`, `frag.scenario.ts`, `falsify.ts`, `SCENARIOS.md` |
| **D183** | **`falsify --part suite` is split.** `suite1` (null and three broken runtimes), `suite2` (four broken), `suite3` (the no-output oracles and `--only` of nothing). Each fits a 5-minute command; `--part suite` still runs all three | | `falsify.ts` |

Run counts (`RECIPIENTS`, 740 cases): observed and placed 45,646; at a boot, placed 264 (FRAG-24 and R10-BOOT-STATE add 4); ambiguous 0; unplaceable 0; one serial in two places 0; unobserved (A2) 143; paid by sends 175; left over 0. The lies, `--no-output`: `h.boot-stale` red in 5 of 5 failing cases by the state check, `h.boot-state` 15 of 15, `h.boot-copy` 2 of 2 by (j) (FRAG-15, FRAG-24), `d154.moved-save-released` 1 of 1 by (j). `h.boot-stale`'s probe fired in 12 cases at stage I; in the 7 that stay green the stale node's handler is presumably also the one the leaf's chain reaches, so the run is the same [reasoning, not run].

Wrappers table (stage I) changes: the `whileRuntimeRuns` row is deleted. A new seam, not a wrapper: the Host's `decode`, which the suite gives as its store's codec and which returns what `JSON.parse` returns.

Inventory changes: row 14 (`delivered`): a boot's runs are judged as they happen, state check included (D180); serials at the record decode (D181).

### Stage K: oracle (j) converged, once (from `conformance-audit/re-check-round-10c.md` to `10j`; all proposed)

Eight re-checks in a row failed (j), each one dimension further (excuses, counts, copy, actor, a second run, a boot's recipient, a boot's routing state, a boot's restored state). Under `policy-convergence` this stage lists every dimension once and answers all of them with one rule: `conformance-audit/ending-check-design.md` (written before reading (j)'s code or stages C-J; its section 5 lists what it drops). Root causes there: R1 a runtime's report paid or set the expectation; R2 pairing in one direction; R3 a recipient named by event, path or value; R4 a boot judged by looser rules; R5 an excuse or an order judged at the run's time, not the cause's.

The rule: for every batch, a boot's included, the observed runs of mapped events and the causes due in it match one to one, by recipient incarnation (actor key, life, copy path), event, and a node in the recipient's **anchored** chain. A cause closes with no run only by an excuse the suite computes, **at the time the cause was due**. The old (j) already matched both ways by serial (stage H) and state-checked live (stage J); stage K adds the two anchors it lacked and drops the boot's own flag.

| Id | Decision | Costs | Changes |
| --- | --- | --- | --- |
| **D184** | **A boot's state is anchored to its records.** `DiskCodec.leaves(entries, actor)` reads the leaf an actor record holds, for its root and each live copy, from the suite's bytes. At a boot's own step, before any run, each actor and live copy with a record must publish that leaf; a difference is red (`(j) restored in X, but its record on disk holds Y`). After it, each run is checked against the published leaf at the ear (D180), so the expectation is anchored at both ends. A boot has no rule of its own: the `booting` flag, `Ear.boot` and the "at a boot, placed" count are dropped; RECIPIENTS counts restored states checked against their record | One more codec reader in the Port's contract (`round-10/adapter.ts`'s `disk`, not the runtime). A codec and a restore that agree on a wrong leaf pass (limit L1) | `harness.ts`, `drive.ts`, `main.ts`, `null-adapter.ts`, `variant-adapter.ts`, `round-10/adapter.ts` |
| **D185** | **A restored ending is judged at the boot.** Each `ending` or `unparked` of a boot's step is due to its owner as at the reload: "the life is over" is read from the lives at the reload, and a definition's op is bound if the owner was live at the boot. A restored ending of such an op that parks after its owner went, or a run of the suite's own send in an actor whose restored endings are still owed, is red (`an input ran before the restored endings`, rule 44) | A copy's binding is still judged at its run, since a lost reset legitimately runs first (L7) | `drive.ts` |
| **D186** | **The order, named.** R10-BOOT-ORDER: `Lab/RowMove`, two rows with a write in flight each reload while the store loads slowly; a send to a (`Review`, which only SAVING handles) and a dispose of b wait for the load. Each row hears its restored ending first. `falsify --part lies` holds `h.restore-at-send` (10j S1′) and `h.boot-order` (10j section 5) | | `round6.scenario.ts`, `falsify.ts`, `SCENARIOS.md`, `expected-output.txt` |
| **D187** | **`quiet().loading`.** Until a boot's `boot` evidence comes, the runtime has not booted: what was in flight is on disk only. `checkMints` waits for the boot instead of calling it vanished (it did, at R10-BOOT-ORDER's reload; no case reached it before) | | `harness.ts`, `drive.ts`, `scenarios/ctx.ts` |

Run counts (741 cases): the control is 741/741 with output and catalog at round 10, stale lock 0; RECIPIENTS observed 45,648; restored states checked against their record 1,071; ambiguous 0; unplaceable 0; one serial in two places 0; unobserved (A2) 143; paid by sends 175; left over 0. The lies, `--no-output`: `h.restore-at-send` red by `(j) restored in` in 17 of 17 failing cases (its probe fired in 19 at 10j; was 0 by (j)); `h.boot-order` red by `before the restored endings` in 1 of 1 (R10-BOOT-ORDER; its probe fired in no case at 10j). 5 s gate unchanged: 30 failed, 30 expected.

Inventory changes: row 2 (`inst.state` before and after each batch) is the runtime's word, not "Observed": a claim anchored at the boot by row 6's bytes through the codec (D184). Row 1 (`dispose` steps): a dispose ends a life for the endings due after it, not for the restored endings due at the boot before it (D185).

Stated limits (`ending-check-design.md`, section 4): L1 a codec and restore that agree on a wrong leaf; L2 the published leaf between anchors (each run's node is checked); L3 order among one incarnation's restored endings; L4 order across actors (not promised); L5 allowance A2 (143); L6 a serial moved by a spread; L7 a copy's binding at a boot; L8 timer and follow-up credits per actor until the kill.

### Stage L: the single revision of (j) (from `conformance-audit/review-ending-check.md`; all proposed)

The review of stage K found a new class, not a step further along a listed dimension. Its two root causes: R6, the runtime's silence counted as an excuse (H1, H2, H3, H7, M1, M2, M8), and R7, a cause that named its recipient but not its event, start node, order or count (H4, H5, H6, M3, M4, M6, M7, L1). Under policy-convergence step 8 they are answered together in `ending-check-design.md`, revised in place, whose "Revision" section says what changed. There is no further re-check cycle. What is left is stated, with a named case for each.

| Id | Decision | Costs | Changes |
| --- | --- | --- | --- |
| **D188** | **Every expectation from the suite's own facts (R6).** Alive is the suite's record: ensured, not disposed; at a reload kept only with an actor record on disk (a dispose the kill undid revives it, by the bytes). What a boot owes is read from the disk (`heads`, `parked`): each has an ending said at that boot, a head `unknown { Restored }`, queued work `NotSent { Restored }`. The boot's records are given when the fake answered its load; `loading` is the fake's pending load. The anchor runs before the first run in the boot, at its `boot` evidence, or at the step's end, whichever is first. Red: no `leaves` answer for a restored actor, an actor or live copy on disk that is not restored, a restored copy its record lacks, an actor the suite never disposed that stops publishing, or a load answered with no `boot`. A quarantine excuses only for a cause the suite drove: a release, bytes it edited, or a compiled restore it saw throw | A Port's codec must read every live record it restores. The anchor reads the published state at the first run, which is the boot step's world | `drive.ts`, `harness.ts`, `fake-world.ts` |
| **D189** | **A cause names its event and its start (R7).** The run's event is rule 13's mapping of the ending said, for an attempt or a decline. Another event of the op in the right recipient is "delivered as X". Rule 14's start: current (every Restored, an adopted lane) from the deepest node up from the active leaf that handles the event, past only token-gated alternatives; late from the owner's nearest ancestor alive at every batch end since the ask. The owner is the node the asking alternative's transition names, seen by the suite's wrap of each commit and lookup input. A late turn that leaves a state owning another pending call is red (rule 15). A delivery with no run is red where a token-free alternative handles its event (A2 narrowed) | "Late" is sampled between steps (limit L7). An ask in a placement callback, or a resend by a retry, has no owner the suite saw | `drive.ts` |
| **D190** | **Order and count across boots (R7).** A restored ending is owed as at the reload, for every op, a copy's included. Red: a park after the owner's life changed since, a run of the suite's send in the same incarnation, or any move of the actor while the ending is owed. A lane's parked endings run in their saved order (`disk.parked` names its lane), declines included. An ending a run took is not restored again (rule 17). With every write landed and no capture interval, nothing is parked on disk that the ledger does not owe | The disk check needs `captureMs: 0`, every write landed, and no failing store | `drive.ts`, `harness.ts`, `round-10/adapter.ts` |
| **D191** | **Scope, locks, contracts.** A torn batch or an edited record excuses only the actors it touched, by the codec's scope (`ledgerOff` stays for a wipe and a disposed runtime). RECIPIENTS is held to `expected-recipients.txt` under the lock. The codec reads a copy of the bytes. Rule 47 is asserted at `start` (no schedule sends a mapped event), so timer credits cannot pay an ending. A sent write said Superseded is red. `DiskCodec.leaves` must not share restore's decode | A change in coverage counts needs a log line | `drive.ts`, `main.ts`, `fake-world.ts`, `expected-recipients.txt` |
| **D192** | **Named.** FRAG-24 gains a slow-load variant: a dispose waits for the load, and both copies hear their restored unknown first. The review's lies are in `falsify --part lies`; `--cases` and `FALSIFY_LIST` are for diagnosis. The review's `k.stream-other` is limit L10 (a frame's session is invisible); `k.frozen-at-send` is L11 and `k.read-to-new-inc` L12 (neither fires) | | `frag.scenario.ts`, `falsify.ts`, `expected-output.txt` |

Run counts at `c93813f1` (742 cases): `RECIPIENTS observed 45650; ambiguous 0; with no copy recorded 0; unplaceable 0; restored states checked against their record 1074; one serial in two places 0; unobserved (A2) 143; paid by sends 175; left over 0; start node checked 6288; stream deliveries placed 180`. The review's lies, `--no-output`: see `ending-check-design.md` section 6 and `round-10/STATUS.md`.

Inventory changes:
- Row 2 (`inst.state`) is a claim at both ends and no longer an excuse anywhere (`lifeOver`, D188).
- Row 6 (disk bytes) now also owes heads and orders parked endings.
- Row 14 (`delivered`): its event and start are derived (D189). A2 holds only where every handler of the event is token-gated.
- New inputs, both Observed: the suite's wrap of commit and lookup inputs, which gives each attempt's owner node; and the fake's load answers.

Stated limits (`ending-check-design.md`, section 4):
- L1 a codec and restore sharing one wrong decode
- L2 the published leaf between anchors
- L3 order across actors
- L4 A2 where every handler is token-gated (143)
- L5 a serial moved by a spread
- L6 a copy unplaced by a lost reset at a boot
- L7 "late" sampled between steps
- L8 rule 15's active subroutine
- L9 the live channel is the ending evidence's word
- L10 a stream frame's session
- L11 frozen copies
- L12 two incarnations at one path
- L13 an empty boot after the runtime's own load bound

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
