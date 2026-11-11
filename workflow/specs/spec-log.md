# Spec log

Status: current. The record of how the core Specs were written and changed: sidecar results and how
each was used, and every later change to a Spec with its reason. Specs are guides; building may
change them, and each change is logged here.

## Scope

The core Specs listed in `spec-split.md` only. Feature areas are written when their phase starts.

## Reference check

`spec-refcheck.pl` (beside this file) checks what `workflow check` does not: every `@plan.X.Y` and
`@spec.X.Y` resolves to an entry, and every backticked prototype id in a Spec's tests section occurs
in `packages/flow-state-v3/prototypes/round-14` or `.../conformance`. It was seen failing on a file
naming outcome O9 of Machines and a plan Nope (two misses reported, exit 1).

## Sidecar results

Four read-only Haiku sidecars (effort high) mapped plan guarantees to prototype cases, wrong
runtimes and design rules. Each table row was used only after a check here. "Existence" means the
reference check found the id in the prototype; "kill read" means the mutant line naming its target
case was read.

| Sidecar | Area                                                                              | Result                                                      | How it was checked                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1       | Machines O1-O8, Runtime O5                                                        | accepted, changed                                           | ids used in Compile and Turn tests pass the reference check; `p1h.default-runs`, `r15.creation-decodes-input`, `a1.a-failed-default-is-a-value` kill lines read. Changed: its "Fragments may not declare context" and keyed/restartOn rows say no case exists; the Specs mark those tests "no prototype wrong runtime" rather than citing a case.                                                                                                                                                          |
| 2       | Runtime O2-O7, Operations O3, O7                                                  | accepted, one row rejected                                  | `mutants-lifetime.ts:26-96` read in full: each `life.*`, `id.*`, `d*.`, `o6.*` id kills the case the table names. Its list of guarantees with no case (RuntimeNotReady, BlockedByDependents, CleanupFailed, ConflictingActorRef, the 1,024 cap, isolation) is carried into Actors as open items. Rejected: its retry-budget row cites `edge.no-retry-cap` (D83), but that mutant edits the storage edge's backoff cap in edge.ts, not retryable's times; WriteLanes cites no wrong runtime for RetryLimit. |
| 3       | Operations O1, O2, O4-O6, EntityDomains                                           | accepted for O1, O2, O5, O6; streams and entities set aside | Streams and entity rows wait for those Specs (phase 5). Its finding that the prototype has no staleTime, gcTime, setData, placeholder, InvalidKey or key bounds was confirmed by grep (no prototype .ts file names any of them), and Reads marks them "no prototype wrong runtime". Changed: it gave some cases by variant line only; their group ids were resolved by reading the files (REV6-H4, REV4-H5, MED-03, REV4-H1).                                                                              |
| 4       | Persistence, LazyFeatures, ServerRendering, CLI O5; the three hydration questions | accepted for Persistence and CLI; lazy and SSR set aside    | Its quotes on the three questions were read against the plans at the cited lines; the questions are listed, not settled, in `spec-split.md` (scope change). Its finding that O7 (second tab) has only a browser harness is moot: O7 moved to phase 5.                                                                                                                                                                                                                                                      |

## Decisions made while writing (the runner's delegation)

- The split itself (`spec-split.md`).
- `specs/runtime/Runtime.spec` is marked superseded in its basis, not by status: the format allows
  open coverage only while a Spec is proposed, and every one of its rows is open.
- Every Requirement's evidence is `open_by` its Spec's Q1 ("executable checks are not built"): no
  production test exists yet, and a prototype case is evidence about the prototype only.

## Changes

### Fix pass after the phase 2 completion audit

From `phase-2-completion-audit.md` (B1-B5, m1-m27, over-design 1-3) and the runner's rulings on it.

- **B1, old-version lanes** (runner's ruling: the prototype and Persistence win). WriteLanes R11,
  I17 and T7: only an older key fingerprint is a hold; an older identity version's lane is
  re-keyed and blocks nothing. `Operations.plan` O3 changed to match @plan.Persistence.O5, since
  the prototype re-keys (round-14/durable.ts) and declines only on the key fingerprint
  (round-14/lane.ts).
- **B2, delivery count** (runner's ruling). WriteLanes I15 now counts per Attempt and per
  incarnation, with the exceptions written out (refused re-send capture, unknown { Restored } per
  incarnation, redelivery after a refused admission, releasing lanes, evidence-only endings); R10
  points to it. Turn R9 and I15 follow Machines O3: an ending admitted in a Denied or Unhandled
  turn keeps its lane effects and counts as delivered.
- **B3, Attempt ids** (the runner's ruling, a correctness call). Ids are unique across devices
  and scopes, because a server may use the Attempt id as its idempotency key; the mint draws on
  entropy the host supplies as data at boot (a random session seed), so the core stays
  deterministic given its inputs. WriteLanes R5, I6, Q4, T18; WriteAhead R12 and I18 now say
  "never equal to any id on disk"; Actors R24 points to WriteLanes R5. The prototype's
  boot-floored counters do not meet this; phase 4 builds the seeded mint and phase 3 writes the
  colliding-counter wrong runtime.
- **B4, dead wrong runtimes.** Removed `d114.decline-no-input`, `d118.let-go-keeps`,
  `d123.keyless-cancel-nothing`, `d122.mail-fifo`, `d122.rota-forgets`,
  `durable.head-first-at-restore` and `durable.memory-decode-failure-ignored`; each guarantee
  keeps a live wrong runtime, except mailbox FIFO, which is marked "phase 3 writes". The folded
  check then found an eighth, `d78-old-id-stays` (its id has no dot, so `mutcheck.pl` skipped it);
  removed. Mis-aimed ones moved or dropped (m24): `p1h.default-runs` to Compile T3 (ImpureDefault),
  `m1.key-order-matters` to Reads T3 (key versions), `d74-*` and `d76-*` dropped from Reads T9
  (they edit entities.ts), `o6.no-bound` relabelled as the last-fiber wait in Actors T16.
- **B5.** WriteAhead R10, I12 and T5: a capture is issued within 5 s; nothing bounds the storage
  wait; the frozen-page and Safari limits are carried in.
- **Over-design (amendment 13).** Reads keeps what the prototype proved; staleTime, gcTime,
  trailing refetch, setData, invalidate, clear, the 256 batch, placeholders, contract.get, key size
  bounds and InvalidKey, focus triggers and optimistic stacking moved to `spec-split.md`'s
  "written when their phase starts" (Reads R4, R7, R11, R12, R15 removed; R1, R3, R5, R8, R10, R13
  narrowed). WriteLanes R13 keeps only the lane-side hook; record queues, their bounds and
  ModuleDisabled moved to the entity store area. Codec and Diagnostics are headed as the Specs
  most likely to change.
- **Minors.** m1-m9 restored the dropped Machines rules in Turn R6, R7, R14, R16, R17, R18, R21,
  R23 and Compile R11; m10 marks the rule order proposed; m11 Actors R9; m12 wiring gaps refused
  at admission (Compile R18, T10); m13 WriteLanes R5; m14 the "(the runner's ruling)" and
  "(agent-judged)" tags restored in Restore R5, R7, R8, WriteAhead R12, Actors R11; m15 proposed
  names marked; m16 Reads R8, R10, R13; m17 bigint in Reads R3; m18 idempotency in Reads R1; m19 the
  fresh-start limit in Restore R5 and I13; m20 Codec bounds in WriteAhead R4 and T13; m21
  Diagnostics R8; m22 closed reasons deferred in Diagnostics R2 and T1; m23 InvalidTurn named as
  check's denial (Turn T6, Q3; Actors R13); m25 every untested Invariant now has a test, most
  marked "phase 3 writes"; m26 sources name only placed outcomes, the duplicated OldVersionActor
  and forget rules point to Restore, and `transaction` is provided by Reads only; m27 the join
  artifacts fixed.
- **Checks.** `mutcheck.pl` is folded into `spec-refcheck.pl` as check 4 (a cited single-edit
  wrong runtime must still apply); it was seen failing on the previous Actors.spec, naming the two
  rotted `d122` ids. `invcheck.pl` reports no untested Invariant.
- **Why m27 happened.** `workflow format` joins two words when it re-wraps a continuation line
  that has no trailing space. Every Spec was unwrapped to one line per value, formatted to a fixed
  point (`workflow format --check` passes on each), and scanned against a dictionary plus the plan
  vocabulary; 30 joined words were split. Edit Specs by replacing whole values, then format.

### Phase 3, conformance round 3 (the lane-cells oracle)

Found while writing the `lane-cells` oracle and its lies (packages/flow-state-v3/conformance).

- **WriteLanes R14, cancel on Idle.** "Idle: nothing, with evidence" named no evidence kind: R3's
  closed list (Superseded, NothingToResend, InFlight, Released) has none for it, and the
  prototype records only its internal cell trace, which no public report carries. Now "Idle:
  nothing, and no ending". The oracle allows evidence there and fails any ending. The wrong
  runtime `audit-1.cancel-all-idle-silent` differs from round-14 only in that internal trace, so
  T10 names `p1h.cancel-all-idle-declines` (an Idle `cancelAll` that declines) instead.
- **WriteLanes T4, `lane.promote-skips-durable`.** It sends a promoted head with no
  acknowledgement: that breaks WriteAhead I15 (acknowledge before send), not I11 or I12 (the head
  is promoted only after the old one resolved). Moved to WriteAhead T7. T4 now names the phase 3
  wrong runtimes for I11 and I12.
- **WriteLanes T9, `lost.letgo-silent`.** It drops the record of a kept ending a cancel lets go:
  an ending neither delivered nor recorded, WriteLanes I15. Moved to T6. T9 names the phase 3
  wrong runtime `lane.cancel-wire-as-never-sent`.
- Edits to T4, T6, T9, T10, R14 and WriteAhead T7 kept the trailing space on each continuation
  line (the Edit tool strips it; it was restored on the exact lines), and `workflow format --check`
  passes on both files.

## The `User's read` field dropped (2026-11-10)

- **Conformance.spec, five agent decisions (R4, R6, two in R7, R9).** The trailing
  `User's read: pending.` is removed from each; the decisions, their reasons and their `Reverse`
  lines are unchanged. The user's call: the field tracked a read that does not happen, and the
  decision convention no longer has it.

## Turn.spec R1 to R11 link their Plan items instead of copying them (2026-11-10)

- **Turn.spec R1 to R11.** Each `must` restated @plan.Machines.O2 or O3 nearly word for word, so a
  rule lived in two places. Each now names the behaviour in one line and defers to its `source`;
  the invariants and tests, the checkable part, are unchanged. The user's call: Specs come after
  Plans and link the items they derive from. Reverse: restore the text from git.
- R12 to R25 still restate @plan.Machines.O4 to O8; not changed in this pass.

## Actors I35 and I36: Runtime disposal's bound (2026-11-10)

- **Actors I35, I36 added; R22's coverage and T16 cite them.** R22's bound (a call settling
  within 5 s is parked; past it, unknown { Disposed }; a definite ending drops the head) had no
  Invariant, so no oracle could judge it and the wrong runtimes `o6.dispose-interrupts-wire`,
  `o6.no-bound` and `o6.settled-in-bound-stays-held` were caught only by case expectations. The
  user's call (2026-11-10, Q1 A): add an Invariant for the bound. Written as two, since they fail
  apart (to-spec: no bundled Invariants): I35 the bound itself, I36 the definite ending's head.
  An unknown keeping its head Held is already I29 (every non-Idle lane survives). Reverse: drop
  both and return the three wrong runtimes to case expectations.

## Conformance Q5: mutants name their Invariant (2026-11-10)

- **Conformance.spec Q5 narrowed.** Each mutant now carries `expects`, the Invariant it breaks, and
  falsify counts a kill only by its oracle's violation that names that Invariant (per (oracle,
  Invariant) pair, R6). The orchestrator's design call on the T6 review (L2). Still open: case-only
  Invariants' mutants and judging every failing run. Reverse: drop `expects`.

## WriteLanes R4 reworded to agree with R14 (2026-11-11)

- **WriteLanes R4's "a cancel's own turn end" named.** It read as if the O.x.cancel member released
  its own unknown, against R14 (a cancelled call on the wire is retained Held). Its source, the old
  design's `HeldThisTurn` (machine-design at `20986677^`, the 2.7.13 table), is the `cancel`
  concurrency policy: an unknown is held only for its own ending's turn. R4 now says so and points
  at R14. No Invariant changed (I5 and I12 already read this way); the suite's ledger follows R14.
  Builder's call on the T6 completion review's M4. @plan.Operations.O3 carries the same phrase and
  is left for the user. Reverse: restore the old clause from git.

## Conformance Q5, Q11, Q12, Q14 follow the suite; Compile R17's gaps (2026-11-11)

- **Conformance Q5.** A mutant held by case expectations is caught only by a failed expectation citing
  the Invariant it expects (`CASE_EXPECTATIONS`, the verdict's `cites`). Still open: the runtime
  cases' case-only mutants and judging every failing run. Builder's call (T13). Reverse: judge
  case-held mutants by any red case.
- **Conformance Q11.** `cites` is now a verdict field; the copy holds the prototype's `conformance/`
  tree as copied source files, so only `node_modules` is linked. Still open: the other fields, every
  failing run, the link and the edit-path check.
- **Conformance Q12.** Static cases run unbounded in process too.
- **Conformance Q14.** Rewritten to the state after T13: 17 static Invariants case-covered or
  judged by `graph-names`, 28 owed to @task.V3.T17, @task.V3.T20 and @task.V3.T22 (the
  orchestrator's decision, log 2026-11-10T20:57:29Z).
- **Compile R17, two decisions.** The refusal's code is InvalidConfiguration with a reason
  (@plan.Diagnostics.O2 already lists Runtime.O1 as an owner); and a refusal need not list every
  malformation, since R2 binds Construction only. No Invariant changed. Reverse: add a code, or
  extend R2 with an Invariant, with the user.
- **Compile Q3 added, not settled.** Whether a Schema's functions or the machine callback count as
  Slots: settling it changes what I15 says, so it is the user's call.

## Conformance Q12: a per-case time bound for runtime cases (2026-11-11)

- **Conformance Q12.** Each runtime case now runs under one 10 s bound over all its seeds; the world
  checks it at every settled task, timer firing and request, and an overrun is the verdict
  `Timeout`, which never counts as a catch. Still open: static cases, a runtime that spins without
  touching its hosts, and the split path's whole-slice bound. The orchestrator's decision (V3 log,
  2026-11-10T23:44:41Z). Reverse: drop the `Timeout` verdict and the world's bound.
- **Conformance Q8.** The `lane-queue` half is closed and its code link dropped: since convergence
  step 4 a Held head's re-send needs an anchored retry member of the reference rows, and
  `lane-model.ts` (with `permittedResend`) was deleted as dead code (step 4 review L1, landed in `c51f6501`). The
  `ending-channels` half stays open. The V3 builder (2026-11-11). Reverse: restore the sentence.

## Conformance Q14: Compile I7, I8, I13, I14 back on round-14; partial standings (2026-11-11)

- **Conformance Q14.** Round-14 makes results for 21 of the 45 static Invariants, not 17: creation
  and restore are the Compiled's own Slots (I7, I8), `seal` refuses a state named self (I13) and
  `sealAll` two machines under one id (I14). They are case-covered by `CMP-08` to `CMP-11` and
  leave T17's row. A check that judges only some clauses of an Invariant now has a remainder row
  naming the rest and its owning Task, and the gate fails a row whose owner is not an open Task.
  From the T41 and T13 review (M2, M3) and the StaticCli review (M1). The V3 builder (2026-11-11).
  Reverse: return the four to T17's row and drop the remainder rows.

## T42: the Invariant audit and the 2026-11-11 rulings (2026-11-11)

All 26 conflicts are resolved in the Specs, the rulings and seven gaps are written, and the 18 cuts and 7
rewordings applied: 183 core Invariants (186, less 18 cut, plus 15 added), coverage gate at 0 gaps. Source:
code:workflow/plans/flow/references/proposals/invariant-audit-2026-11-11.md; the rulings in the V3 log
(2026-11-11T03:30:58Z) and the audit decision (04:03:53Z). The Spec lead of @task.V3.T42, under the orchestrator's
delegation of Spec questions. Numbers are not reused: a cut leaves a gap. Reverse: revert this commit's Spec edits.

**Rulings written.**

- **CQ1 (C1):** WriteLanes I15 and R10, Actors R15: a second refusal ends an ending's tries until the next boot or
  adoption, each giving one try with no redelivery after a refusal. CQ2's wording (each refusal reports an issue)
  went in with it, since round-14 does it and Port change 4 assumes it.
- **CQ3 (C2):** a kept ending is a value on its lane; WriteLanes R6 and I8 ("not Idle or holds a kept ending"), and
  Actors R21 (forget lets kept endings go, recorded). CQ4 confirmed: a kept ending is not work in flight (the
  Actors model says so).
- **CQ5:** WriteLanes I3 adds "an Attempt never sent ends only NotSent, or unknown { Restored } at a boot". T6 M5's
  other half ("without an answer only unknowns and declines") is M5's Invariant, not repeated in I3.
- **CQ6 and G5:** new Actors I38 and R22: every never-sent commit at disposal start, a head still waiting for its
  acknowledgement included, ends NotSent { Disposed } before disposal ends, delivered once to the next incarnation.
  Round-14 never delivers it after the reload: a stated limit of round-14.
- **CQ7 (C3):** WriteLanes I11 and R8: a superseded head promotes the next.
- **CQ9 (C11):** WriteLanes R7, R10 and I15: the Attempt a `cancel`-policy commit interrupts is evidence only when no
  cancel is pending on it. Why: R14's "a pending cancel is never lost" is the author's explicit request.
- **Compile Q3 (C4):** a Schema's own functions are not Slots (Compile R16, R17, I15); the machine callback is
  construction and never in Compiled. Q3 is closed. T9 compares data views structurally, Schemas by their JSON
  Schema documents, since the Codec refuses a Schema as notPlain.
- **M5:** new WriteLanes I25 and R2: a definite ending other than NotSent matches an answer a send received.
- **The owed retry:** new WriteLanes I26 and R8.
- **R9:** the Spec's KeyRequired stands, unchanged; round-14 applies key-less members to every lane, a stated limit.
- **C5:** "mint order" for queued commits is admission order (W's order) in WriteLanes R15 and I21, since a queued
  commit has no id yet. The disposal ending order (`1b.disposal-definite-w-first`) stays deferred in revisit.md.

**New conflicts, each with the reading chosen.** Why, unless said: it is what an app author can rely on, and it
matches the other Specs.

- **C6:** check reports a Construction's FlowError diagnostics as error findings, exit 1 (StaticCli R11), with a
  stated limit: it cannot report what that failed construction kept from loading. Kept construction strict, since
  Compile R2's one-error-lists-all is what makes the findings complete. Rejected: moving the rules out of
  construction, which would let untyped apps run invalid machines.
- **C7:** codes R6 lists fix their classification; every other code takes its Cause's (Diagnostics R6, R8, I6, I7).
  A GuardDefect stays Defect; a StorageFailure cut short by interruption is Interruption, so callers don't retry it.
- **C8:** check runs each machine's configuration callback once as construction and no runtime callback (StaticCli
  R9, I1).
- **C9:** WriteLanes I2 is "only if, and never after the ending's event"; the positive half with InvalidWrite and
  stale marking is new I24.
- **C10:** WriteLanes I12 adds forget of a gone operation's hold (HoldForgotten) and Restore R5's fresh start.
- **C12:** WriteLanes I17: no commit is invoked; it declines OldVersion, or Rejected where R11 puts another path's
  Rejected first.
- **C13:** baselines are silent at a reload restore; a return gets R9's one wave (Actors R18, Turn R22, I28).
- **C14:** WriteAhead I12: within 5 s or once that key's previous write answers, whichever is later.
- **C15:** Actors I24: never lost while its lane or life stands.
- **C16:** WriteAhead I17: never re-sent on Flow's own; a user retry re-sends the same id; R5's fresh start excepted.
- **C17:** an Owed identity whose record is quarantined or reset is not live at ready; its endings stay parked for
  the adopting ensure (Restore R1, I1). Why: R5's and R7's adopting ensure already handles such lanes, and waking a
  fresh actor nobody asked for would be invented state.
- **C18:** a check with errors has status completed and exits 1; missing type facts give status failed; StaticCli I6
  maps status plus "has an error finding", taking the cut I9.
- **C19:** StaticCli I10 "loads no config but"; I11 and R13 exempt forced termination (CommandLine O2, O3).
- **C20:** Compile I16: machine() never emits one, and Runtime creation refuses one.
- **C21:** the Turn model's Boundary of "self" is H; an explicit target naming H is a re-entry.
- **C22:** Actors R10: no unknown { Restored } for a head whose own ending is parked (Restore R3).
- **C23:** inside a turn or capture every codec failure is UnencodableValue; Codec errors are raised only where a
  codec failure is a FlowError (Codec R4).
- **C24:** Compile R6 and I8: restore runs only R8's defaults, for fields the record lacks.
- **C25:** the Actors model's WorkInFlight takes R7's wording; "kept read" is gone (T6 too).
- **C26:** StaticCli R2 names a source location only where one is carried, else the definition path; new StaticCli
  Q3 asks where Compiled gets locations (phase 5).

**Gaps.** New Invariants: WriteLanes I27 (every commit ends, G1), I28 (a seed per boot, G4, with R5); Actors I37
(Free actors end, G3); WriteAhead R16 and I19 (a Runtime refused scope ownership saves and reads nothing, G2: the
core half of Persistence O7; the Web Lock stays phase 5's); Turn I32 to I35 (equal deadlines, step delays,
`restartOn`, keyed schedules, G6). Three more were needed so a Requirement keeps an Invariant after a cut: Actors
I39 (R11's version rule), Restore I19 (R2's reset first), Reads I20 (R9's read endings, part of G10). G7 and G17
are Plan wording: @plan.Pending D2 and D3. Not written: G3's context-propagation retry, G8 to G16 (no conflict;
left for their Tasks with to-spec).

**Cuts and rewordings.** The 18 cuts and the five clause cuts are applied as the audit lists them; each Spec's
coverage and tests now cite what covers them. Compile I2's count folds into I1 (`cmp.callback-twice` and CMP-01 now
expect I1); StaticCli I9 folds into I6 (`cli.warnings-fail`, CLI-07 and the remainder row). Turn I8's type clause
moves to Compile T6; Turn I18 takes I19's old-snapshot clause. The seven rewordings are applied, plus Reads I19
("returns the idle row"), which the audit's table also asked for.

## 2026-11-11, T8 (M3 ruled: @plan.Pending D4)

- **WriteLanes R10 and I15:** an ending whose turn is refused for any cause, a mapper throw included, is
  redelivered once; a second refusal is final until the next boot or adoption. Why: the coordinator's ruling of
  M3 (log.task, D4), so WriteLanes agrees with Actors R15, I24 and ruling CQ1. Reverse: restore "a throw from
  the outcome mapper".


## 2026-11-11, T16 (production walking skeleton)

- **Turn, WriteLanes, Compile composition:** production layout notes added, marked proposed for the user's
  read. Why: skill:to-design records the chosen shape in the owning Spec. Reverse: delete the three notes.
- **Restore R1 (found, not changed):** the suite (DISP-05, after the prototype) expects each Held head's unknown
  Restored to be decided and parked at the boot, so its identity is live at ready even when its lane was Held,
  not InFlight, at capture; R1's text keeps such a record a record until reached. Production follows the suite.
  Open for the user: reword R1, or change DISP-05.

## 2026-11-11, Restore R1 ruled (the user): DISP-05's expectation follows R1

- **Restore R1 stands:** a Held lane's identity stays a record until something reaches it. The suite's
  lifecycle now takes a held head's unknown Restored, decided and parked at the boot, as meeting the boot's
  restore obligation; its Parked life owes it to the identity's next incarnation (Opens, then StepEnds), so a
  parked-and-never-delivered restore is still caught. Why: the user's ruling of the T16 finding above.
  Reverse: drop the `Parked` row from `discharged` in conformance/dsl/lifecycle-lives.ts.
- **Two prototype mutants retired from Actors I29:** `k.drop-row` and `q1a.unchanged-resets` lose a
  restorable record at a boot; under R1 a parked restore is on time, so they are pending probes now, red by
  case expectations, until an oracle checks WriteAhead I4. The production runtime keeps a Held lane's
  identity a record at the boot (src/core/incarnations.ts).

## 2026-11-11, the replan's Spec passes (slice R and slice 1; idiomatic Effect)

Two passes before coding resumes, under the user's acceptance of the replan (V3 log, 2026-11-11). Source:
code:workflow/plans/flow/references/proposals/replan-2026-11-11.md (parts 2 and 3),
code:workflow/plans/flow/references/proposals/effect-simplification-2026-11-11.md and advisor Q1, Q2, Q10. The
Spec lead, under the orchestrator's delegation. No Invariant's meaning changed; the guarantee changes found are
listed last for the user. Reverse: revert this pass's Spec edits.

**Pass 1, what slice R and slice 1 need.**

- **WriteLanes model: the cell table.** The model pointed at the deleted machine-design 2.7.13 table, so
  production had no table to write its lane from (advisor Q10, risk 4). The model now holds Phase (one tag per
  history and wait: Idle, Kept, Acknowledging, Unsent, Withdrawing, Recapturing, Resending, OnWire, Cancelling,
  Held), Displaced, Promote and one cell per (phase, input), each citing its Requirement. Readings chosen where
  the Requirements meet: a Cancelling head ends unknown { Cancelled } whatever its exit (I20, over the old
  design's "the real ending if it had already settled"); latest does not supersede a Withdrawing head (R14 over
  R7's "never-invoked head"); disposal ends a Withdrawing head NotSent { Disposed } (Actors R22). New Q5: a
  cancel-policy commit on a Kept lane, and a kept unknown on a Held head, have no ruling; slice 1 rules them.
- **WriteLanes composition.** Production's lane is one total function from that table, and reports an act
  determines (Minted, Sent, endings) are derived once per step by evidenceOf; Turn parts and members stay
  written (@task.V3.T51, advisor Q10 risk 1). Turn's production note points at it.
- **Reads R6.** A lookup's context carries no Attempt (@plan.Operations.O1's lookup(input, ctx); only a commit
  has one). The replan's T51 removes the made-up Attempt (`host/driver.ts`).
- **Conformance R15 to R23, I45 to I67, Q15, Q16, T29 to T44.** Parts as data modules with four readers and a
  reference derived from `Compiled`, hand cases frozen (R15); feature codes declared by parts and adapters, only
  declared codes drawn (R16); the matrix gate, "owed by slice N" or a failure (R17); the combination gate, pairs
  from the channel table enforced, triples reported (R18); the Spec model, its five limits, the generic compare
  and model mutation (R19); obligations from suite facts only (R20); the liar gate (R21); round-14 as a mutant
  host with a verified limits list and production as the default runtime (R22); the bench replay's work
  fingerprint (R23). Widened, same ids: R1 (the adapter's listed seam, I45), R4 (a part's derived reference), R5
  (the model is not an implementation), R8 (a script's seed), R14 (hand cases and generated runs).

**Pass 2, idiomatic Effect.** Each change removes a hand-rolled design or a parallel abstraction from the text.

- Turn and Actors composition: the driver's own fibers and a Clock "over host timers" become keyed fibers in
  one FiberMap owned by the Runtime's Scope, sleeping on Effect's Clock and Scheduler (T43 R1). Actors R4's
  reverse-order release is the services Layer's finalizers in that Scope; R8's grace is on the Effect Clock.
- Actors composition, a code gap found (not a Spec change): R22 wants the core's disposal before the Scope
  closes; today `dispose` closes the driver and then the Scope, skipping it. Marked proposed in the note.
- WriteAhead R12: the batch "answers landed" protocol is an Effect that succeeds when the batch landed and fails
  with a typed refusal; an interrupted write is unanswered, as R12's pending rule already reads. Composition: the
  capture wait is a FiberMap sleep and an urgent batch a Scheduler yield (T43 R4, R8). New Q4: R2's KeyValueStore
  has no batch, so R2 and R12 cannot both hold over it; slice 2 settles the store service.
- Diagnostics R1, R2, R8: FlowError is one Data.TaggedError; Diagnostic one Schema.TaggedError class, so the
  error and its codec are one declaration; R8's classification names Cause.hasDies and Cause.hasFails.
- WriteLanes T19: the callback-era "adapter that never answers" is a commit Effect that never completes, one
  that succeeds and one that fails with a tagged failure.
- StaticCli composition: the CLI is one Effect program under the platform's runMain; failure classes are tagged
  errors mapped to exit codes once, temporary files are scoped resources, and signals interrupt.
- Conformance R1, I31: the world's "hosts" cross as Effect services (a virtual-time Clock, the page's Scheduler,
  the Host service with the store wrapped once as Effects). R9: one Schema codec writes and reads the machine
  form.

**Sidecars (four Haiku, effort high, read-only; each finding checked against the Spec and effect 4.0.5).**
Accepted: Turn's host-timer Clock, Actors' driver fibers and Layer release, Diagnostics' Error class and Cause
fold, WriteLanes T19, WriteAhead's store protocol and its KeyValueStore gap (no batch in
`effect/src/persistence/KeyValueStore.ts`), StaticCli's signals and temp files, Conformance's host bag and
decoders. Rejected: FiberMap, Latch, Queue, RcMap, SubscriptionRef or Cache for schedules, mailboxes, uses,
snapshots and shared lookups, since the core decides each as data that replays (the audit's "Schedule at the
host" and "PubSub and Queue" rejections); `Effect.timeout` for the suite's case bound, since the world is
synchronous; ManagedRuntime and a Result-returning codec, which are public-API calls (C6); Codec R4's "no raw
Cause escapes", a safety rule FlowError's in-process cause already meets; Compile R18 as a Layer, since context
providers are actors. Changed: StaticCli R12's package-instance rule stays for slice 6's C15.

**Guarantee changes for the user (not made).**

- Compile R16 and I15: production holds `sameMemory` (Schema.toEquivalence) on `Compiled`, and T43 R2 compiles
  codecs there; these are neither Slots nor a Schema's own filters, so I15 as written refuses them. Widen R16 and
  I15 to "functions Flow derives from a Schema", or keep them beside `Compiled`.
- Reads: an Invariant that no lookup's context carries an Attempt (R6 now says so without one).

**Owed, by slice (the replan's part 2; each written when its slice starts).**

- 1 (@task.V3.T18): WriteLanes Q5; otherwise check WriteLanes against building.
- 2 (@task.V3.T19, @task.V3.T20): WriteAhead R2's KeyValueStore Invariant and Q4; `previous: [{ key }]` holds
  against Restore R6; a host store section (in memory now, IndexedDB's Safari rules in slice 9).
- 3 (@task.V3.T17): Compile M05, M06, M13, M19, M21, M22, M39 to M41 and Invariants for R10, R13, R14; Turn's
  history and snapshot-shape Invariants, M44, M59; Diagnostics' multi-violation errors.
- 4 (@task.V3.T9): Actors R11's rule, R14's and R19's Invariants.
- 5 (@task.V3.T21): Reads' lifted Q2 section and the R8 Invariant.
- 6 (@task.V3.T22): StaticCli C13 and C15.
- 7 to 10: Streams, Entities, MultiTab and Lazy, Inspection and Testing (new Specs); then React and
  ServerRendering (P6) and Package (P10).
