# Progress: Flow State v3 production

## Resume

**Now (2026-11-09, after the stage A re-check):** phase 0 and phase 1 are done (OD49-OD54); the stage A close-out failed, its fixes landed (`d3d89576`), the re-check closed B1-B3 and B5 and left only B4 (the user's-read list), now completed below. Next: phase 2, the plan merge WITHOUT a stop (amendment 11), then phase 3 (production from `.spec` files via `to-design`, lint-bomb style, quality review angle). The hourly review cron (session-only) must be re-created after a restart. **Earlier (2026-11-08, ~14:30):** phase 0's queue is done (round 14, round 15, round 15b; design
OD49-OD50, OD51 being written). Phase 1 is running: area H (H1, H2, M2) done at `e6b0db23`; **entities** in progress
(lead builder with Haiku sidecars); then streams, record migration; then stage A's close-out and the stop for phase 2's
label round. How the loop runs now: roadmap amendments 4-9 (converge on the third same-class review; Haiku research
fan-out; every new item built with the roadmap skill; Opus reviews own 4 Haiku sidecars at effort high; prototype
builders are leads with Haiku sidecars and must scrutinise every result; small public API calls are the runner's).
The hourly review cron (session-only) must be re-created after a restart: `CronList`, then `CronCreate` hourly at :07
with the review prompt. The log below is the record; the latest lines are the state.

**Hand-off, 2026-11-08 (from the first runner session).** A new agent runs this roadmap's loop for the user. Read, in
order:
1. `AGENTS.md`, then the memory index `/Users/arpit/.claude/projects/-Users-arpit-Developer-flow-state/memory/MEMORY.md`
   and the files it points to; especially `one-busy-builder.md`, `v3-roadmap-handed-off.md`,
   `merge-into-machine-design-first.md`, `preserve-usage-limits.md`, `shell-commands-must-be-bounded.md`.
2. `workflow/roadmaps/v3-production/roadmap.md` (approved 2026-11-07; amendment 2 below changes stage A's running).
3. This file, all of it.
4. The design, `workflow/plans/flow/references/explorations/machine-fragments/machine-design.md` (OD1-OD48, C1-C161):
   rules 73-74 and 2.7.17-2.7.20 are today's.
5. The prototype round in flight: the worktree `/Users/arpit/Developer/flow-state/.claude/worktrees/agent-acee8f40b71d961fd`
   (branch `worktree-agent-acee8f40b71d961fd`), `packages/flow-state-v3/prototypes/round-14/STATUS.md` (its
   "Hand-off (2026-11-08)" section says what is done and what is left) and `RESULTS.md`.

**How to run the loop (the user's rule, 2026-11-08, roadmap amendment 3):** Work serially: one builder at a time, always busy on the queue. One independent Opus review of the latest
committed checkpoint every 60 minutes, and one close-out review when a round or area finishes. Reviews only report;
the runner fixes minor findings itself. When several reviews in a row keep finding many issues, stop patching:
collect every finding as a requirement and run one convergence pass (`policy-convergence`), then keep going.
"Several" is three: converge on the third review in a row that finds the same root-cause class in the same part
(amendment 4, the user, 2026-11-08); the failure ledger counts them.
The runner (you) fixes minor findings inline, writes each round's design corrections
into machine-design.md, merges finished rounds into `flow-rewrite`, keeps this file current and commits locally with
explicit paths. Never push. Do not spawn extra fix passes, audits or re-reviews for minor findings; stage A's close-out
review, before the plan merge, is its completion audit. Stop only at the roadmap's blocking stops or at 95%
usage. A session cron (`CronCreate`, hourly at an off minute) can wake you for the reviews; re-create it.

**No worktrees (the user, 2026-11-08: "the work is serial"; Q2 A):** builders work in the main checkout on
`flow-rewrite`. Round 14's branch was merged as is (`482e8e2b`); its remaining gates and review run on `flow-rewrite`.
The old worktree is removed once the timing survey that runs in it finishes.

**The queue (stage A, by actual work):**
0. **Harness speed pass, before round 14's remaining gates** (the user, 2026-11-08, Q3 A; a Task inside phase 0 under runner
   rule 4). Fixes 1-4 from the speed survey, one builder pass, each with a before and after profile and a full suite run
   showing identical results (`expected-output.txt`, RECIPIENTS, every verdict): (1) memoise `copiesOf`/`bindsCopy` per
   published world in `conformance/drive.ts`, hoisting `chain.flatMap` in `reference/model.ts`, after checking that the
   reference model's own Slot calls are not counted in `slotRuns`; linear `viewOf` in `round-14/inc.ts`; (2) canonical text
   cached per subtree in replay (`round-14/adapter.ts` canon, byte-identical, under `FLOW_DEEP_FREEZE`), `ranked()` by Map;
   (3) skip the per-step `stateHash` under `--no-output`; (4) `mutate-one.ts` suites run concurrently, and `mutate.ts`
   gains a `--parallel N` pool. Targets (the user, 2026-11-08, Q4 A; on this MacBook, checks unchanged): the suite in
   one process ≤ 15 s (65 s now); peak RSS per suite process ≤ 600 MB (1.7 GB now); the builder's fast loop (suite,
   `round-14/checks/*.ts`, typed `tsc`, CLI pins) ≤ 30 s wall; every final-commit gate at up to 8 in parallel ≤ 10 min
   wall (to be confirmed once the lies are timed). Baseline: "Gate timings" below.
1. **Finish round 14** (merged into `flow-rewrite` at `482e8e2b`, from `f49ec387`): all nine fix items after round 14's final review are done
   and committed (`0dd9e9f3`, `76e65e3e`, `8b737bdc`); the suite is 834/834 with a clean lock, the suite with its
   searches exits 0, 57 lifetime wrong runtimes are red. **Left:** run the four gates the hand-off stopped
   (`mutate-one.ts` control, `graph-gate.ts`, falsify `suite1`-`suite3` and `mutants`, the full targeted lies
   `--parallel 4`) and update RESULTS.md's gate table (it still shows the pre-fix numbers); diagnose `fragstore.row`,
   which now fails at depth 7 on round 13's rule 17 class ("delivered once, still parked"), not yet understood. The
   exact steps are in `round-14/STATUS.md`, "Hand-off (2026-11-08)". Then one review; if no High, merge the branch
   into `flow-rewrite` and remove the worktree (`git worktree remove`), which also clears `workflow check`'s
   DUPLICATE_SPEC_ID and SPEC_INDEX_STALE.
2. **Round 15:** bring the prototype to the rulings it owes (listed under "Owed to the prototype" below), each with a
   case seen failing first.
3. **Phase 1, one area after another in the same builder thread:** H1, H2 and round 13's M2 (the missing D221 pins);
   entities (`packages/flow-state-v3/prototypes/round-9/entity-proposal-2.md`, settling U7, U10, U11 and D3's price;
   the user delegated D3 to the runner on 2026-11-08, "fine pick whatever is more correct": keep strict per-record
   order, but a write joins its record's queue when it is sent, not when it is minted, so an unconfirmed (held) write
   is draft state and stalls no other actor; a late draft re-bases its prediction and meets the server's version check
   as an ordinary conflict. Verify against the prototype's meaning of "pressed"/held first; if D3's "joined at commit"
   already means at send, record that and change nothing); streams; record migration. Each area's settled design goes into machine-design.md.
4. **Stop for the user: phase 2, the plan merge** (writes the `.plan` files from machine-design.md's C rows). Before
   it: the one completion audit of stage A.

Roadmap: roadmap.md
State: stopped for hand-off, 2026-11-08; stage A in progress (phase 0b done; round 14's fix pass stopped at a clean
point)
Phase: 0 (reconcile the design and the prototype): 0b done (`818bd236` to `5132591c`, plus U19); 0a's round 14 fix
pass stopped for hand-off. Revision: see `git log` on `flow-rewrite`
Budget used: rounds: round 14 (lifetime experiment, round 14, its fix pass); usage 2026-11-08 at the loop's start:
weekly 19% (resets 2026-11-13), 5-hour 36%

## Gate timings (baseline, 2026-11-08, round 14 at `f49ec387`, serial on an idle machine; 12 cores, 24 GB)

| Gate | Exit | Wall s | Cores | Peak MB |
| --- | --- | --- | --- | --- |
| `main.ts --no-search` (suite, 834 cases) | 0 | 65 | 1.2 | 1715 |
| `main.ts` (searches are not run by it) | 0 | 66 | 1.2 | 1750 |
| `mutate-one.ts` control (`killedBy: null`) | 0 | 206 | 1.2 | 1756 |
| `graph-gate.ts --no-search` / full | 0 | 67 / 66 | 1.2 | 1787 |
| `falsify.ts --part watch` / `suite1` / `suite2` / `suite3` | 0 | 1 / 75 / 223 / 102 | 1.3-1.4 | 1755 |
| `falsify.ts --part search` | **1: `chain` red on the real runtime** | 47 | 1.6 | 304 |
| `falsify.ts --part tamper` | 0 | 4 | 2.9 | 275 |
| mutants, lies, `lifetime-falsify`, checks, `tsc`, `nub` | not timed (stopped for the speed pass) | | | |

Survey findings (read-only Opus agent): `REV9-BURST/300-rows-each-asking-once-all-end` is 43.7 s of the suite, cubic in its
row count, 79% in the oracle's ledger (`drive.ts` `copiesOf`); replay's whole-world `canon` (`adapter.ts:319`) is 35-61%
of the next heavy cases; tree copies (9 ms) and imports (110 ms) are negligible.
Next action: record migration (lead running), OD53 being written; then migration's adversarial audit, stage A close-out, phase 2 (no stop), phase 3.
Owed to the prototype (queue item 2): the label round's rulings that change it, now in machine-design.md (OD48): U2
key-less members name only the ending's own Attempt; U3 restore delivers `W`'s `NotSent { Restored }` before the head's
unknown; U4 quarantine, no key-equality adoption, no `orphaned`; U5 no `allow`; U6 `NotSent { Unencodable }` and
`UnencodableValue`, with a lookup ending `Defect`; U8 sends queue until boot; U9 creation checks the type side; U13
`unknown { Disposed }` past the disposal bound; U14 `disposeActor` flushes at once, and an unbound lane record is listed
and reported until adopted or forgotten; U15 and U19 `persist` on the definition, `definition({ id, persist: true })`,
not the ref; U17 versions and key fingerprints compare the type and encoded sides. Also the completion-audit fixes of
`5132591c` (`Rejected` mapped for kept endings and quarantined lanes; `Disposed` a reserved reason).
Waiting on the user:
- nothing blocking now: U1-U19 are ruled (U1-U18 on 2026-11-07, all at the recommended option; U19 A on 2026-11-08);
- phase 2's label round, then its user-judged decisions;
- not blocking, to decide 2026-11-09: folding this roadmap into Workflow records as an Epic (`to-epic`), in
  `/Users/arpit/Developer/workflow/spec-lang/design/to-epic-proposal.md` (Q1-Q5, all proposed);
- which example apps to build, any time before phase 6. Candidates are below.

## Phases

- [x] 0 Reconcile the design and the prototype: done (rounds 14, 15, 15b; OD49-OD51); stage A close-out passed after fixes, 2026-11-09
- [x] 1 Pre-work prototype (entities, streams, migration; round 13's H1 and H2): done 2026-11-09 (OD52-OD54; M5 settled as an oracle (h) harness bug)
- [ ] 2 Plan merge: not started
- [ ] 3 Conformance rewrite: not started
- [ ] 4 Core: not started
- [ ] 5 Features: not started
- [ ] 6 Example apps: not started
- [ ] 7 Documentation: not started
- [ ] 8 Hardening and budgets: not started
- [ ] 9 Release: not started

## Failure ledger

| Part or gate | Root-cause class, one sentence | Failures | Last revision | State |
| --- | --- | --- | --- | --- |
| (none yet) | | | | |

Carried from the prototype, as prior art: the ending oracle failed its gate eight times, one step
further each time (round 10, stages C-J), until convergence in stages K and L.

## Agents running

| Agent | Started | Last checkpoint | Last review |
| --- | --- | --- | --- |
| (none: the round 14 builder was stopped for the hand-off, 2026-11-08) | | | |

## Calls for the user's read

Calls made under delegation before this roadmap are listed in
`FOR-ARPIT.md` section 2 (in git at `04e314f4`; accepted 2026-11-07). New calls go here, one line each: the
call, its reason, its evidence, and how reversible it is.

## Calls for the user's read (added 2026-11-07)

- Amendment 1 (cold read, wording only): the runner judged it agent-level because it only reconciles
  text with the user's own decisions; reversible by reverting `fadf004f`. Not changed, for the user's
  read: the cold read also noted that "business keys for money" binds no phase explicitly, and that
  phase 1's number of areas is implied (entities, streams, migration, H1/H2) rather than counted.

- Round 14's builder pinned two cases to its own Runtime-disposal behaviour against Runtime O6; the
  runner judged the design wins and ordered them reverted (agent-level: the design text is explicit).
  Reversible: if the user prefers interrupting the wire at disposal, it becomes a design change.

- Phase 0b, design catch-up (`d1117383`, OD46 in machine-design.md; entries in
  `workflow/plans/flow/references/proposals/design-catch-up/change-list.md`). Agent-judged rulings applied, each
  reversible by editing machine-design.md (nothing is built on them yet; overruling now costs one edit):
  - D48 (rule 24): a cancel or `latest` replacement waits while a never-sent Attempt's acknowledgement is being
    written. Reason: a cancelled Attempt whose acknowledgement lands restores as unknown (safety). Evidence:
    convergence-3, M1. Its price, no bound on a hung disk, is U16 (pass 2).
  - D145 (rule 19): servers may prune keys; a re-send on an old key reads first; Flow keeps no key age. Evidence:
    convergence-10's owed edit 8.
  - 2.7.20's store contract, frozen page, ids never repeated (D83, D95, D99, D111, D146). Reason: they state what the
    host already had to do for the accepted calls 1, 4 and 9. Evidence: convergence-7 to 10, `safari/RESULTS.md`.
    D30 (silent storage) and D94 (an awaited write's wait) moved to U16 in pass 2.
  - 2.6.1's `Compiled` contents, key from key fields, every closure a Slot (D206, D215, D216, D223). Reason: internal
    representation under the accepted call 14. Evidence: convergence-11 to 13.
  - Round 14's final review: R14R 2 (a reload and a return mint new ids for the actor and every restored fragment
    incarnation; the round-14 builder's "a kept record keeps its root id" disagrees and should follow), R14R 3
    (`ready` creates nothing; a kept record holding a `Held` lane is named), R14R 6 (an "undecodable record" state in
    2.7.17's table), R14R 9 (R14 D1's `Interrupted` on every path back, after rule 44's deliveries). R14R 5 judged "the
    design stands" (waiting commits behind a `Held` head are not owed at ready). R14R 7 was overturned in pass 2 and
    is U17.
  - The round-14 builder's call that a previous incarnation's ending is delivered as adopted (2.7.17), marked agent
    in pass 2 (pass 1 had folded it into the user's approval, OD45).
  - Pass 2 (`workflow/plans/flow/references/proposals/design-catch-up/change-list.md` E50-E70, after an independent
    review): the follow-up bound, 64 per admitted event, then `InvalidTurn` naming the chain (D13, D35; 2.5 step 1,
    C149); one notify per task (D136; C147 against React O3). Reason: the review asked for the bound to be defined, and
    both are Runtime timing the prototype proved. Reversible: one edit each.
  - For the user, not built: convergence-9 withdrew "a reload asks again". A boot forgets a stranded read, so a machine
    with no recurring schedule stays where it was (now in rule 8). The prototype proposed a table lint for that case
    and never built it; whether to add one is yours.
  - Names the user already accepted, now recorded as decided (OD47): `KeyFieldOptional` (call 11), `TwoDefaults` (call
    13), `OldVersionLane` (Q2 A), `UnknownNotUncertain` (section 4), `TurnStorm` and `AsksForever` (call 5). The rest
    are U18.
  - Readings to check: FOR-ARPIT section 4's change log is "already in the design" (its "after" spellings are the
    design's own); R14 D4's "identity encoded with its Schema" is read as the Schema's encoded form, keeping OD30 Q6's
    string rule; the H1 fix's per-actor default is recorded, and its clash with creation's purity is U12.

- Phase 0b pass 3 (the label round's rulings, change-list E71-E90, OD48). Agent calls made in applying them, each one
  edit to reverse: a lane whose operation is gone is kept like a quarantined lane until `forget` (U4 names only an
  undecodable key); a quarantined path's `cancel` may come from any subject path (rule 51 would decline it); rule 20
  requires `Unencodable` where an input or key Schema admits a value with no form; `persist` sits on the definition
  (`definition({ id, persist: true, … })`), since `machine()` takes no options and the definition holds `context` and
  the persisted memory. Decision entries before OD48 stay as history.

- 2026-11-08, CP1 relock (the user: "you decide what's best and more correct"). The runner's call: log one line per
  changed harness file in `conformance/expected-changes.log` and relock, but only after CP1's close-out review passes,
  so the log line can name the review as its evidence. Reason: the lock exists to force a logged reason for a harness
  change; here the reason is checkable (834/834, every output, RECIPIENTS and falsify verdict identical), and an
  unrelocked suite would exit 1 on every run and hide a real unlogged change. If the review finds a High, fix first.
  If the permission classifier refuses the relock again, the user runs the two commands. Reversible: revert the lock
  and the seven log lines.
- 2026-11-08, `mutate.ts`'s `--rss-mb` default (1700 MB is below the suite's own 1745 MB peak): the runner raises it in
  CP2, with time kills read as unknown. Reversible: one default.

## Calls for the user's read (added 2026-11-09, stage A close-out B4: every public API or guarantee call since OD49)

Ordered by how much they touch your own decisions. Each: the call, why, evidence, how to reverse. Phase 2 has
written the plans from these calls (2026-11-09), so overruling one now costs a design edit and a plan edit; nothing
below is built on by production yet. Q17-Q20 in entries 2-4 are the runner's migration-audit numbers, not your
question numbers.

1. **Migration reset is per record, not per definition (narrows your Q1).** You chose "A without optional manual
   version", which I summarised as "that definition's saved memory and state are discarded" (my paraphrase, not your
   words). As built (OD54 (8)), each record is checked against the current shape and only incompatible ones reset;
   one `RecordShapeChanged` per definition reports how many. It differs only when a release removes a state: records
   saved in other states keep their data. Why: resetting records that still decode loses data for no safety gain.
   Evidence: audit M2 Q18, `5ccc6944`. Reverse: reset every record of the definition when any is incompatible; one
   rule in the prototype's boot.
2. **What counts as an incompatible shape (Q19).** Any structural Schema change to a stored field resets the record,
   including a harmless validation change (`minLength(1)` to `minLength(2)`, a widening). Why: it is a fixed upfront
   rule that `flow explain --since` can list before a deploy; a decode-based rule depends on the data and can't be
   listed. Price: some needless resets. Evidence: OD54 (9). Reverse: reset only when the old value fails to decode.
3. **A dropped field is applied at that release's boot (Q20).** The records holding it are rewritten then, so a later
   re-add starts empty instead of resurrecting old data; a bounded exception to "untouched records are not rewritten"
   (D111). Evidence: OD54 (10), audit M2. Reverse: keep D111 strict and accept resurrection.
4. **A new identity gets its own lane (Q17).** A lane is (identity, contract, key); after an identity field change the
   old identity's in-flight write is kept, blocks nothing, is reported at every boot, and ends only by its own answer
   (stated limit: no user exit, `revisit.md`). Evidence: OD54 (7), audit M2 break 1. Reverse: needs a new word
   (an identity route), so it would be your API call.
5. **Repair bound resets at `RepairOverdue` (stage A close-out B1, built `d3d89576`).** A given-up doubt asks at most 3
   times, then `RepairOverdue`, after which the count starts again, so a doubt on a screen open for days is never
   stranded; this reverses my earlier OD53 (8) call of "3 asks in total, then nothing until a reload". Reverse: one
   rule.
6. **Two write operations on one contract stay illegal (B2).** The design already refuses them (`SharedContract`,
   2.7, F2), so per-operation and per-contract lanes name the same lane on every legal machine; the fix lead built
   the missing `flow check` error instead of re-keying lanes (my first ruling would have made legal what F2 forbids,
   and a shared lane would need per-attempt outcome maps that aren't designed). Accepted by the runner. Reverse:
   allowing it reverses F2 and needs design work.
7. **Entities' internal soundness under `guarded` (OD52).** You approved `guarded`, `.gone`, `.covers`,
   `delta`/`row` and the narrowed rebase; under them I ruled: a guarded doubt ends only on an answer showing the
   record's version past the sent base or a same-key success; the record queue is released once the forced repair
   settles (rule 30), the held write keeps its own hold; `Released` frees a never-re-sent unknown's queue entry at
   once; U10's later success is by landing order; `allOrNothing` not added (revisit.md). Why: each makes a doubt
   end only on proof and keeps one actor's hold from blocking another's writes. Evidence: OD52 (1), (6), (9), (10),
   (14), audits 2, 3, 3b. Reverse: one rule each in rules 30 and 32.
8. **Streams calls (OD53).** `emit.fail(e, key)` added to `Feed.multiplex` (small API); a key change empties a `fills`
   field in the same turn with `FillsOtherKey`; a session's select runs every committed turn (a cost per turn per
   placed activity) and a throw keeps what is placed with one issue, `undefined` releases; the default backoff is
   500 ms x 2^n, jittered, capped at 30 s; 256 bookmarks per operation, oldest by last write dropped; T1 wins over T5
   on Waiting. Why: per-key failure for multiplexed sockets (req C10); a field holds one key's items; the key can
   change any turn; a bounded, replayable backoff with no randomness in the core. Evidence: OD53 (1)-(7), (12),
   (13), audits S1, S1b. Reverse: one rule each; the backoff and the 256 bound are constants.
9. **Rounds 15/15b and area H (OD50, OD51).** `cancelAll` (accepted name) interrupts a head on the wire; a live
   `cancelAll` delivers the queue first and the hold-leaving head last (D107); rule 15's cancel exemption dropped
   (a late ending never leaves live work); `persist` stays on the definition; `forget` removes the record and a held
   lane stays unbound and reported; a hold whose operation is gone is dropped with evidence at `forget`; an Effect
   default is a construction error. Why: the cancel exemption let exempted work be sent anyway (R1); the hold-last
   order gives the hold's route the last word (D107); a hold no member can cancel needs one exit; a default that
   runs breaks creation's purity (U12 B). Evidence: OD50, OD51, STATUS.md "Round 15", "Round 15b", "Phase 1: H1,
   H2, M2". Reverse: one rule each.
10. **Proposed names, none confirmed by you:** `RecordShapeChanged`, `LaneRekeyCollision`, `OpRenamed`,
    `PreviousIsCurrent`, `FieldDropped`, `HoldWithoutRecord`, `UnboundLane`, `LaneRekeyed`, `GoneWithoutKey`,
    `FillsOtherKey`, `GuardContradicted`, `ImpureDefault`, `RepairOverdue`, `IdleWithoutPing`, `Abandoned`,
    `ModuleDisabled`, `contract.get` (renamed from `descriptor.get`), `ReservedReason`, `HoldForgotten`, `SelectedNoKey`, `UnsettledEvicted`, `GuardedUnbound`,
    `GuardedWithoutVersion`, `GuardedWithoutTarget`, `RecordUndecodable`, `RecordHeld`, `SharedContract` (built
    as a check), and the inspection value `stalled: "record"`. (`OldVersionLane` you accepted, OD47.) Renaming any is
    one edit until phase 3 builds production on them.

Added after the stage A re-check (missing from the first pass):

11. **Migration (OD54), more calls.** (2) a new public method `previous[i].retryable(k, { times })` beside
    `retry`/`cancel` (small API); (6) Flow's own record format (1-4) with a pure upgrade at boot, a newer or invalid
    format quarantined whole; (13) a state a record's history points to, removed by a release, resets the record
    instead of quarantining it; (14) `flow explain <release> --since <release>` compares two compiled releases (it
    can be wrong across a chain of releases: open item, revisit.md); (16) **an undecodable record is quarantined and
    then overwritten when the fresh actor first saves**, so its bytes are not kept for later recovery. Why (16): a
    second copy per actor would need a storage budget and a recovery API nobody asked for. Reverse: keep quarantined
    bytes under their own key until `forget`. Also (3) `FieldDropped`; (4) `HoldWithoutRecord`: a head whose
    identity's record is reset or unreadable is reported at each boot; (5) on a fragment operation, another path's
    `Rejected` comes before `OldVersion`; (11) `PreviousIsCurrent`; (12) op rename by contract id with
    `OpRenamed`/`LaneRekeyCollision`. Why (all): each keeps writes in flight and data honest across a release, as
    rule 74 and Q1 A require. Evidence: OD54, audit M2, STATUS.md "Phase 1: record migration". Reverse: one rule
    each (the method in (2) is one member).
12. **Correction to entry 4:** `forget` does not release an old identity's hold (it keeps every hold whose
    operation exists, as built); the hold ends only by its own answer. The earlier log line saying "or forget" was
    my ruling before the build showed it doesn't hold.
13. **Q19's price, said fully:** an offline app (notes with unsent drafts) loses saved drafts when any stored
    field's Schema changes, even harmlessly; and the prototype stamps computed fields, so changing one resets too
    (a stated limit until they're derived on restore). If this price is too high, the alternative is a decode-based
    reset (entry 2's reverse).
14. **Rounds 15/15b, area H (OD50, OD51), more calls.** R2: a key-less member of an unkeyed operation names its one
    lane in every handler, a `NotSent` ending's included; R6: a refused acknowledgement of a head replaced under
    `latest` or `cancel` concurrency ends it `Superseded` (evidence) with `StorageFailure` evidence and the newer
    commit is acknowledged and sent, `NotSent { StorageRefused }` staying the `cancel` member's; R7: Flow keeps each
    older version format's hash and reads an older-format version by recomputing in that format, symmetric, and
    format 0 (names only) compares names, a stated limit; R8: the rule 15 check reads only the transition's own
    operations (other ops a stated limit); R10: when the same transition releases the lane on leave (rule 60), the
    release wins over `cancelAll`: the queued commits end as evidence and the head is left to the release; M2: a
    decline beside an old-version hold is `NotSent { OldVersion }`, not `Rejected`. Why: R2 keeps the one-lane
    promise; R6 stops a refused write from taking the newer commit down with it; R7 so an upgrade cannot hide a
    type change; R8 is what a static check can read; R10 because a release is declared and wins; M2 makes the
    decline name its cause. Evidence: OD50, OD51, STATUS.md "Round 15", "Round 15b", "Phase 1: H1, H2, M2".
    Reverse: one rule each.
15. **Entities (OD52), more calls.** The D3 price: on a last-writer-wins source an earlier draft may silently
    overwrite a later commit from another actor (screen and server agree, but the later write is lost); repair uses
    no timers (count-bounded); a given-up mark lives until the 4,096-per-entity cap evicts it (oldest first) unless
    `guarded` proves it; `ModuleDisabled` fails closed until a reload; the judge: a lower version is stale (dropped
    with evidence), a higher one applies when ordered, equality by `Schema.toEquivalence`. Why: D3 lets a held draft
    stall no other actor; no timers (your U1 B); the cap bounds memory; failing closed is the safe default; the judge
    is the version's own order. Evidence: OD52 (7), (11), (13), (15), (22), audits 2, 3, 3b. Reverse: one rule each
    (D3's join point is the largest: joining at commit instead brings back the cross-actor stall).
16. **Streams (OD53), more calls.** `dropAt` is set on leaving Live/Repairing or when unset; `Feed.callback`'s 1,024
    bound counts the queue only; Q2 A (a key change empties a `fills` field in the same turn; you didn't see this
    one, I decided it); a select that finds no key raises `SelectedNoKey` and releases. Why: the not-live period
    needs a start; the adapter controls only its own queue; a field holds one key's items; a placement with no key
    has nothing to watch. Evidence: OD53 (2), (5), (10)-(14), audits S1, S1b. Reverse: one rule each.
17. **The close-out's own calls.** Rule 13's `byReason` keys were widened from "Flow's reasons" (OD50's decided
    text) to "the commit's own unknown tags or Flow's unknown reasons", because the commit's tags exist only in its
    type and phase 3's type-level check enforces them; m4 narrowed rule 15's Q4 A text to the check as built (the
    transition's own operations). Rule 30 gained (re-check n1): news during a running ask joins it and does not reset
    the count. Reverse: each is one edit.

Added by phase 2's fix pass (2026-11-09, from the independent merge audit's read-list gaps):

18. **Proposed, not built: evidence for kept and stranded deliveries (OD49 (11)).** A kept ending's one try per boot
    or adoption, and a stranded read let go, leave no evidence today; the proposal is evidence for both, naming the
    cause. The gap itself is stated in Runtime O4. Why proposed: a reader of evidence must infer both today.
    Evidence: rule 8's stated gap, round 14. Reverse: nothing to reverse; yours to accept or drop.
19. **Open, as built (OD54 (c)): a revert can meet an overwritten old-version record.** Release 2's ensure of the
    new identity writes over release 1's old-version record (one record key), so after a revert release 3 sees one
    unsure lane, not two, and `forget` is not the only removal of an old-version record. Also latent: (b) saved-shape
    stamps are compared raw across a future change of Flow's own version format; (d) a re-key is persisted only when the
    lane is next written; (e) a crash between writing a moved lane and deleting the old one leaves both on disk. Why open: no ruling yet; the plans keep "removed by
    `forget`". Evidence: OD54's open items, record migration round 3. Reverse: a separate key per identity version
    for actor records (a design change).
20. **Entities and streams as built, not separately listed (OD52, OD53).** A gap marks the version field (only key
    fields are left out); a read's `.one` answer replaces the whole row; a quiet removal doubt over a present row
    reads `unconfirmed` on every non-key field; an unbound sent hold yields, with no clock, to a ready write behind
    it (`unknown { Abandoned }`, proposed); two placements of one operation and key share one session slot. Why:
    each is what the build showed safe (over-marking is the safe side; a yield keeps the record live). Evidence:
    OD52 (12), OD53 (15)-(17), STATUS.md "Phase 1: streams". Reverse: one rule each.

21. **OD54's stated limits, in one place** (each also in revisit.md): an old identity's unknown hold has no user exit
    (entries 4, 12); a memory field rename is a drop plus an add, so it never resets and the old value is lost but for
    `FieldDropped`; records with no shape stamp (written before Flow's record format 4) never reset; computed initial
    values are stamped in the prototype, so changing one resets (entry 13). Why: each is the price of the automatic
    reset without a manual version or migration functions (your Q1). Evidence: OD54, audit M2, `5ccc6944`. Reverse:
    migration functions (revisit.md, option B) answer the first three; deriving computed fields on restore, the last.
    PC3 in the phase 2 table below is this list's entries 2 and 13, a behaviour call, not wording.

## Calls for the user's read (added 2026-11-09, phase 2 plan merge)

The merge's conflicts, each with the merge lead's ruling and the independent merge audit's judgement
(`workflow/plans/flow/references/proposals/plan-merge-audit.md`, 2026-11-09). Details: `plan-merge-log.md`.

| Call | Ruling | Audit | Why | Reverse |
| --- | --- | --- | --- | --- |
| `trace diff` (CLC1) | cut, per your 2026-11-02 CLI scope, now recorded as OD55 | disagreed with the first merge (which kept it); agrees with the cut | you cut it; no later record re-adds it | re-add one command line and its paragraph |
| `diff --base` (CLC1) | cut, per OD55 | agree | your CLI scope; `explain --since` compares releases | one command |
| `story list --coverage` (CLC2) | your spelling (OD55) over the design's `flow stories --coverage` | agree (judge: you) | your words | one name |
| Removed machine's lanes (PC1) | actor records discarded, lane records quarantined (the runner's ruling) | agree; marked | your U4 quarantines a lane whose operation is gone | discard the lanes as evidence (C47's text) |
| Dormant undecodable record (PC2) | quarantined, ensure starts fresh (the runner's ruling) | agree; marked | one rule for every undecodable record (R14 D7) | discard alone, as the old plan said |
| Per-record reset (P-2, B1) | your Q1 A per definition, decided per record (the runner's ruling) | agree; mark fixed | already entry 1 | entry 1's reverse |
| `contract.get` (OC1) | kept, renamed from `descriptor.get`, proposed | agree | descriptors became contracts | one name |
| 256-identity write batch (OC3) | kept, the plan's own bound | agree | the prototype never went there | one sentence |
| `version?` optional (EC2) | optional (the runner's ruling) | agree; marked | unversioned entities are a stated case | make it required |
| `length` default 40 (TC1) | `steps`' old default moved to `length` | agree | C73 renamed the option without a default | one number |
| `PropertyTestFailed` class (PKC1) | exported, the one exception to "no capability error classes" | agree | C82 lists it | make it a `FlowError` code |
| Trace's `persistenceVersion` (IC2) | dropped | agree | your Q1 A removed the app-wide version | restore the field |
| Build target (FSC1) | `packages/flow-state-v3/src/` | agree (judge: you) | the approved roadmap and AGENTS.md | one sentence |
| InvalidWrite and no-overwrite (B4) | restored in Operations O3 | agree | dropped silently by the merge; the design never removed them | none needed |
| Others (MC1, MC2, OC2, OC4, RC1, RC2, PC3, EC1, IC1, DC1, DC2, CLC3, TC2, SRC1) | as in the log | agree | wording, readings of decided rows, or kept plan content | one edit each |

## Change proposals

One entry each (runner rule 4): the kind (insert, modify, split, reorder, reclassify), why, the
class, gates and misfire of anything new, the budget cost, the judge, and its state (proposed,
applied as amendment <n>, or rejected).
- **CP1, the harness speed pass (queue item 0).** Kind: insert, a Task inside phase 0, before round 14's remaining
  gates. Judge: the user (Q3 A and Q4 A, 2026-11-08). State: applied; builder running. Built with the roadmap skill
  (amendment 6, applied after the builder started; recorded here, and the brief was already consistent with it):
  - Class: **performance work** (done means numbers on a named workload). Draws from `playbook-performance`,
    `performance` and `check-benchmark` at `/Users/arpit/Developer/workflow/skills/suites/workflow/NAME/SKILL.md`
    (`9b1dd09`): find the limiter, reduce work, keep a change only when the checked comparison shows a gain.
  - Goal: the gates run much faster with exactly the same checks. Workload: round 14's gates on this MacBook (12
    cores, 24 GB), baseline in "Gate timings" above.
  - Verified by: before and after profiles per fix; a full suite run with `expected-output.txt`, RECIPIENTS and every
    verdict byte-identical; `mutate-one` still `{"killedBy":null}`; every lie and all 57 lifetime wrong runtimes still
    red; then `check-benchmark` on the baseline and final numbers, by an agent that did not do the work.
  - One iteration: one fix (1 ledger memo and linear `viewOf`; 2 canon cache; 3 hash skip; 4 gate concurrency),
    measured against the accepted baseline.
  - Done when: the Q4 A targets are met (suite ≤ 15 s, peak ≤ 600 MB, fast loop ≤ 30 s, final-commit gates ≤ 10 min
    at up to 8 in parallel) with no verdict changed, or the gap is reported with its limiter.
  - Likely misfire: a speedup that skips work, such as a memo hiding a Slot run the oracle should count, or a cache
    reused after an in-place write. Caught by the byte-identical outputs, the differential canon mode, the lies and
    mutants staying red, and `check-benchmark` comparing the work done.
  - Gates: the suite and its lock, falsify (suite1-3, tamper, mutants, lies), `lifetime-falsify`, `mutate-one`, the
    graph gate. Each must still fail on its null, broken or lying runtime.
  - Budget: up to 2 builder rounds. Blocking: a change to any expected result or guarantee. Reviews: the hourly
    review, `check-benchmark` at the end, and the final numbers in the log.
  - Cold read: not run separately. The user ruled the targets directly; a cold read of this entry is owed at the
    next review.
- **CP2, speed pass 2 (queue item 0b, after CP1).** Kind: insert, a Task inside phase 0. Judge: agent (the runner),
  continuing CP1 toward the user's Q4 A targets, which CP1 leaves unmet on memory. State: proposed; starts when CP1's
  builder reports. Built with the roadmap skill (amendment 6), from three read-only Haiku surveys on 2026-11-08 (the
  suite, the runtime, the gates; unprofiled, so every saving is a guess until measured):
  - Class: **performance work**. Draws from `playbook-performance`, `performance`, `check-benchmark` (`9b1dd09`).
  - Goal: peak RSS per suite process ≤ 600 MB and every final-commit gate ≤ 10 min at up to 8 in parallel, with the
    same checks.
  - First, the CP1 close-out review's findings (PASS with findings, 2026-11-08; no High; sidecars agreed):
    0a. make the no-in-place-write assumption checked, not trusted: the harness freezes every published and logged
        world by default (what `FLOW_DEEP_FREEZE=1` does today), so an in-place write is Fatal for any runtime, and
        the fix 1 and fix 2 memos stay sound against wrong runtimes; add one lie that writes a published world in
        place and confirm it goes red; measure the freeze's cost;
    0b. `mutate.ts`: a watchdog time kill reads as unknown and is rerun serially, never killed; `--rss-mb` default
        above the suite's own peak (step 6 below);
    0c. `drive.ts:1378`'s 20 s wall-clock "did not quiesce" (older than CP1): under parallel load a correct runtime
        can hit it; make a clock-only trip read as unknown and rerun, keeping the 5000-task bound as the
        deterministic guard;
    0d. record the falsify and lifetime ok/BAD lines at the start of CP2 (the review could not re-check "identical
        to `f0771187`", because no baseline lines were kept), and compare against them at the end.
    One relock at the end of CP2 covers CP1 and CP2 (each relock needs the user while the classifier refuses it).
  - Steps, each profiled before it is kept:
    1. finish each harness's end checks and output line as soon as the harness is done, instead of keeping every
       harness to the case's end (`main.ts` tracked list; FRAG-15 about 4059, DRV-01 2160);
    2. build the search engine's `pre` and `key(pre)` once per script (`search/engine.ts`), after checking that no
       guard or edge mutates `pre`;
    3. a GC check inside long settle loops (`drive.ts`; R10-RUNTIME's 1.2 GB of garbage);
    4. memoise `encodeRecord` per incarnation object (`round-14/durable.ts`, `record.ts`);
    5. one 8-slot scheduler for every final-commit gate: falsify's parts and searches, `lifetime-falsify`'s 57
       runtimes in their own folders, the graph gate, mutants. Longest first, at most 8 jobs and 14 GB, mutate-one
       counted at 4.8 GB;
    6. `mutate.ts`: a watchdog time kill reads as unknown and is rerun serially, never as killed (today line 143
       counts any watchdog kill as killed, so parallel load could inflate the score); `--parallel` capped by memory.
  - Done when: both targets are met with every verdict and output byte-identical, or the gap is named with its
    limiter.
  - Likely misfire: finishing a harness early drops a check that reads state named later in the case (DRV-01 names
    its issues after its checks), or a parallel run hides a time kill as a verdict. Caught by byte-identical outputs
    and lock, a differential mode per cache, lies and mutants still red, and `check-benchmark`.
  - Gates: as CP1. Budget: 1 builder round. Blocking: any changed expected result or guarantee. Reviews: hourly, and
    `check-benchmark` at the end.
  - Left out: clonefile copies (measured 9 ms); indexes for lanes, mail and rota in the runtime (`turn.ts:851`,
    `mailq.ts`), unless step 4's profile shows the runtime is now the limiter.
  - State: built (`93005ef6`..`9724ef88`); close-out PASS with findings; its verdict-reading findings converge in CP3.
- **CP3, verdict convergence (queue item 0c, after CP2).** Kind: insert, a Task inside phase 0. Judge: agent (the
  runner), under roadmap amendment 4: three reviews in a row (CP1 close-out, CP2 mid-task, CP2 close-out) found the
  same root-cause class in the same part, how a gate reads a child's run. State: started 2026-11-08. Built with the
  roadmap skill (amendment 6):
  - Class: **not readily verifiable** for the redesign (the gates' own correctness shows only under many
    conditions: load, kills, partial output), done through `policy-convergence`
    (`/Users/arpit/Developer/workflow/skills/suites/workflow/policy-convergence/SKILL.md`, `9b1dd09`) and
    `policy-testing`.
  - Goal: one way to read a run, with typed pass/fail/unknown and its evidence; no clock deciding correctness;
    controls pinned; all evidence read. Requirements and the 17 findings by class:
    `packages/flow-state-v3/prototypes/conformance/VERDICTS-CONVERGENCE.md`.
  - Steps: (1) a from-scratch design by an Opus designer given the problems, traces and requirements, not the
    current scripts' design, written as `conformance/VERDICTS-PROPOSAL.md`; (2) one adversarial review (Opus plus
    four Haiku sidecars); (3) one revision into `VERDICTS-PROPOSAL-2.md`; (4) build it, with a planted failure per
    finding, each red on the old code where it was wrong.
  - Done when: every finding's planted case is handled; every gate's verdict is unchanged on the real, null, broken,
    lying, mutant and lifetime runtimes except where the old one was wrong (each named); the speed targets CP1 and
    CP2 met still hold.
  - Likely misfire: a design that names one more special case per finding instead of one rule. Caught by the review
    judging it against "one reading", and by the planted cases.
  - Gates: as CP2, plus the planted cases. Budget: 1 design, 1 review, 1 build round. Blocking: a changed expected
    result that is not one of the named wrong verdicts (FRAG-15 and SEARCH-ODD-SMALL asserting their verdict are
    named here and logged). Reviews: the hourly review and the close-out.
  - Relock: after CP3, one relock for CP1-CP3.

## Example app candidates (proposed, for the user's pick)

The user likes these (2026-11-04); the final pick is still the user's. Each is a Next.js demo with a
live inspector panel beside the app, showing `flow trace` and `flow graph` as it runs, so the demo
shows its own guarantees. The user also set two requirements:
- Each app explains what it is demoing, with a write-up beside it, and tooltips that open a popup
  to show a feature off at the moment it happens.
- One demo shows the Story presentation feature: Stories played back as a presentation.

| App | What it demos |
| --- | --- |
| **Pull the plug**, a shop where you can kill the tab, go offline or reload mid-payment, and still never get charged twice | Write-ahead, unknown outcomes, business keys, 3-D Secure as a fragment |
| **Live auction**, with bids streaming in, optimistic bids, outbid races, countdowns and reconnects | Streams, entities, `latest`/`reject` concurrency, timers |
| **Agent console**, a small Codex-like chat: streamed output, tool calls approved step by step, runs resumable across a reload | Streams, subroutines, persistence, cancel and retry; a step toward the Electron stretch goal |
| **Mission control**, thousands of live objects (satellites or flights) on a map, with doubt marks when the feed drops and repairs when it returns | Entities at scale, listen frames, doubt and repair, performance |
| **Smart home**, a panel of simulated devices where a command may or may not have happened ("did the light turn on?") | Unknown outcomes, retries, device streams, multi-tab ownership |
| **Escape room**, a puzzle game whose deep state machine doubles as its own walkthrough, with Stories as replays | Fragments, `flow graph`, Stories, record migration between game versions |

## Log

One line per iteration. Results live in the records; link them.
- 2026-11-04 setup `5d92e2d3`: lint-bomb vendored and wired. The throwaway file caught 6 of its 6
  seeded violations, the frozen and prototype paths were not linted, and the rule tests passed.
  `nub run verify` fails at `build:library` (the frozen package), as it did at `d4d54074`.
  Results: `tools/lint-bomb/FLOW-STATE.md`.
- 2026-11-04 first roadmap draft `0ecda35d`. The user rejected its new prototype rounds and gave
  the shape.
- 2026-11-04 `tools/oxlint/anti-slop/` deleted (`6bd32fbb`).
- 2026-11-04 lint rules added and evaluated (`6f6c1309` to `6593b072`); lint-bomb at `183d43b`.
- 2026-11-04 roadmap rebuilt from the updated roadmap skill. A cold read found 4 contradictions
  and 10 ambiguities. All are fixed:
  - M5 moved to phase 2 (later settled in phase 1 as an oracle (h) harness bug, 2026-11-09), and the H1/H2 fixes are named in the prototyping constraint;
  - phase 2's plan edits went to R6;
  - examples come before docs;
  - budgets got numbers (R7), and the reserve got a default;
  - the convergence stop and the "no new decision" stop were aligned, also in the skill;
  - paths are written in full, and a glossary added;
  - a real phone is the user's step.
  A second cold read has not been run.
- 2026-11-07 round 1 answered (Q1 A, Q2 B, Q3 A, Q4 A, Q5 A). Stops are now blocking only where
  the work can't go on without the user; everything else goes to the review queue. Every
  operation declares a `services` list. H1 and H2 are fixed in phase 2. There's a 5% reserve, and
  phase 2's designs go straight into the plans. The roadmap skill gained the same blocking/review
  split, uncommitted in the suite.
- 2026-11-07 rounds 1-3 answered. The roadmap skill changed (judgment goals, the guarantee map,
  guarantee changes, back moves, amendments, no handoff file); roadmap.md rebuilt from it;
  `handoff.md` folded into the Resume block above and deleted; `nub run verify` no longer builds
  the frozen package.
- 2026-11-07 OD28-OD31 merged into machine-design.md (`6d02bef6`); stage A reordered (round 4): phase 0
  reconcile, phase 1 pre-work prototype, phase 2 plan merge; round 14 started as phase 0's first iteration.
- 2026-11-07 roadmap approved (`309c87e4`); cold read run after approval; its wording fixes applied as amendment 1 (`fadf004f`); round 14 continues with the review's fixes and D1-D7.
- 2026-11-07 0a.1 `ad2a6315` (worktree branch): round 14 done, 822/822, lock clean, every gate green except `fragstore.row` (failing differently: an ending reached nobody after dispose and reload); 46 lifetime mutants red; D1-D7 and the mid-review fixes in. Final independent review started; phase 0b (design catches up, `proposals/design-catch-up/`) started alongside, separate write scope. Usage: not measured.
- 2026-11-07 0a.1 final review of `ad2a6315`: not merged yet. H-A: Runtime disposal pinned to `Interrupted` against Runtime O6 (two cases rewritten to the runtime); `fragstore.row` misdiagnosed (a suite-ledger gap: boot mail on a record kept at ready has no evidence, not a D6 hole); D1 lost when woken at ready; D3 unguarded; prototype call 2 departs from rule 73; persist order-dependent; 12 templated output reasons hide real differences; a lie retired on weak grounds. 0a.2 fix pass started in the worktree; the review's nine design corrections passed to phase 0b for labelling.
- 2026-11-07 0b `818bd236`, `d1117383`: design catch-up. Inventory of D1-D228, FOR-ARPIT, R14 D1-D7 and the final
  review's nine items (`workflow/plans/flow/references/proposals/design-catch-up/inventory.md`); change list applied
  to machine-design.md, 52 blocks, none skipped: OD32-OD44 (FOR-ARPIT accepted), OD45 (R14 D1-D7), OD46
  (agent-judged), plan rows C128-C146. Fifteen user-judged conflicts U1-U15 not applied, waiting for the label round.
  OD and C ids unique, links resolve; `workflow check` shows only the worktree's `DUPLICATE_SPEC_ID` and
  `SPEC_INDEX_STALE` (no `.spec` touched). Not yet reviewed by an independent agent. Usage: not measured.
- 2026-11-07 0b pass 2: an independent review upheld pass 1 with 16 findings, all applied (change-list E50-E70, 34
  blocks, none skipped): R14R 7 overturned to U17; D30, D94 and D48's wait to U16; D2 and call 19's third part
  recorded as the user's (OD47); stale reason lists fixed; `UnencodableValue` back with U6; accepted names marked
  decided, the rest batched as U18; C128, C144 fixed, C147-C149 added. OD1-OD47 and C1-C149 unique, links resolve.
  Waiting on the user: U1-U18. Usage: not measured.
- 2026-11-07 0b.2 `9cccc580`: the 0b review's 16 findings applied (R14R 7 overturned to U17; D30/D48/D94's unbounded waits to U16; D2 recorded as the user's Q3 A; stale reason lists fixed; names batched as U18). Phase 0b now blocks on the user's label round (U1-U18); its completion audit follows it. Round 14 fix pass running.
- 2026-11-07 0b pass 3: the user ruled U1-U18 in the label round, all at the recommended option. Written into
  machine-design.md as change-list E71-E90 (98 blocks, none skipped): OD48 records each ruling (U1 overturns the
  user's 2026-11-01 timeout remark; U17 amends Q1 A); plan rows C150-C161; `allow` and `orphaned` moved to
  `revisit.md`; the U marks and the five names' [P] removed. OD1-OD48 and C1-C161 unique, links resolve. U1-U18 are
  off "Waiting on the user"; the prototype owes U2-U6, U8, U9, U13-U15, U17 (see Resume). Usage: not measured.
- 2026-11-08 phase 0b completion audit: failed on minor items, fixed inline (`5132591c`); the `persist` placement went to the user and was ruled U19 A (on the definition). The user asked for one busy builder thread, an hourly review and no extra passes or audits for minor findings, then stopped the session for a hand-off; the round 14 builder was told to stop at a clean point and write what is left in its STATUS.md.
- 2026-11-08 0a round 14 fix pass stopped for hand-off at `f49ec387`: nine items done, four gates left (see the queue). The builder ran `git stash`/`pop` in the worktree, which briefly applied the user's `stash@{0}` there; it undid it, and the stash entry is intact (checked). Note for the next agent: never use bare `git stash` in a worktree; the stash stack is shared.

- 2026-11-08 amendment 4 (the user, "let's fix it as 3 for now"): convergence on the third review in a row with the same root-cause class in the same part; roadmap version 5. Uncommitted.
- 2026-11-08 amendment 5 (the user, Q1 A): up to 4 Haiku agents for read-only research fan-out in phase 0's close-out and phase 2, only while no builder runs; tables, never verdicts; one Opus reviewer judges. Roadmap version 6. Uncommitted.
- 2026-11-08 round 14 merged into `flow-rewrite` as is (`482e8e2b`; the user's Q2 A, no worktrees from now on). Gate timing survey running (results in the session scratchpad, to be summarised here); a read-only research agent is surveying per-process speed and memory techniques for the gates.
- 2026-11-08 speed survey: baseline above; the user accepted the speed pass as queue item 0 (Q3 A) and its targets (Q4 A). New: `falsify --part search` red on `chain` (the real runtime), for round 14's remaining work. Worktree removed. Loop started, item 0's builder launched.
- 2026-11-08 CP1 speed pass built (`0806c7de`..`b2fd9218`): suite 65 s → 17.1 s, mutate-one 206 s → 20 s, graph gate 67 s → 16 s, lies at 4 in 29 s, lifetime-falsify 32 s (57/57 red), fast loop 21 s, final-commit gates about 3 min; every falsify and lifetime ok/BAD line identical to `f0771187`. Missed: suite 15 s (17.1 s) and RSS 600 MB (1.75 GB), carried to CP2. The suite exits 1 only on the lock (seven harness files hashed by D113); relock refused by the permission classifier for the builder and for the runner, so it waits on the user. Close-out review with `check-benchmark` started; CP2 waits for it (its timing re-runs need an idle machine).
- 2026-11-08 CP1 close-out review (Opus, high, with four Haiku sidecars): PASS with findings, no High. Re-measured: suite 16.5 s (2 runs), mutate-one 19.5 s, falsify suite2 50.7 s, `FLOW_CANON_CHECK` 205650 steps 0 differ. Findings: the memos trust that no world is written in place, unchecked for wrong runtimes (Medium; sidecar 2 reproduced a false equal on an in-place write); `mutate.ts` counts a time kill as killed, riskier under `--parallel` (Low-Medium; sidecar 3 called it High); a 20 s wall-clock settle trip in `drive.ts` (Medium, older); the identical-lines claim had no recorded baseline (Low). All four go first in CP2 (0a-0d); relock moved to the end of CP2.
- 2026-11-08 the user, going to sleep: "this is performance work, inform me for any public api changes, for the rest you decide what's correct." The run continues unattended: CP2, then round 14's remaining work. Blocking for the user only: a public API change (plus the roadmap's existing blocking stops). The relock stays queued for the user's morning if the classifier still refuses it; builders judge runs by the SUMMARY line meanwhile.
- 2026-11-08 03:09 review of CP2 checkpoint `a84b1c2a` (`93005ef6`..`a84b1c2a`): Opus high plus four Haiku sidecars (freeze coverage; unknown vs real failure; early harness release; shared `pre` in searches). Usage: weekly 21%, 5-hour 54%.
- 2026-11-08 review of `a84b1c2a`: PASS with findings, no check weakened. Medium: the in-place guard skips objects frozen by an earlier harness (shared constants), arrays only fingerprinted, one inert check (`versions.written()`), a clock-trip FAIL could count as a lie's catch, FRAG-15's coverage depends on an 8 s wall-clock deadline. Lows: unknowns dropped from tallies, ended harnesses still accept release/subscribe, the shared search parent unchecked, `--rss-mb` loose, STATUS text. All sent to the CP2 builder to fix before it finishes.
- 2026-11-08 CP2 built (`93005ef6`..`9724ef88`): suite alone 18.1-18.5 s (the in-place guard costs about 2 s), peak 1.0-1.3 GB (FRAG-15 1797 → 301 MB); every final-commit gate via `conformance/gates.ts` in 115 s; lifetime-falsify 14 s at `--parallel 3`; two in-place lies red; copies and canon checks 0 differ; 0d baselines identical except the new lies. Missed with named limiters: suite 15 s, peak 600 MB (DRV-01 holds 2160 harnesses its body may read; R10-RUNTIME keeps about 110k logged steps for replay). Step 4 (encodeRecord memo) skipped: 133 ms per suite. Close-out review (Opus with `check-benchmark`, plus four Haiku sidecars) started.
- 2026-11-08 CP2 close-out (Opus with `check-benchmark`, four sidecars): PASS with findings; suite measured 17.4-17.75 s, FRAG-15 318 MB, `gates.ts` 115 s, every comparison identical. Highs: `gates.ts` reads mutate-one by exit code only (it always exits 0); a recurring time kill still counts as killed; clock trips in mutate-one's search paths and gate5s are false kills; `lifetime-falsify`'s control can pass partially after a memory kill. Third review in a row with the same class (reading a run), so CP3 converges it (amendment 4).
- 2026-11-08 CP3 convergence: proposal 1 (`5a5c05b9`) reviewed by Opus plus four sidecars, accept with changes, 27 rows (`VERDICTS-REVIEW-1.md`, `e2b5e536`); the one revision, proposal 2 (`acd85832`), handles all 27 through four gaps (whose answer, what was answered, what it may cost, proof on both commits), adds a global `--budget 600` so a gate run ends by 605 s. Builder (Opus, high: third build round) started on proposal 2.
- 2026-11-08 05:09 review of CP3 checkpoint `76328de4`: Opus high plus four Haiku sidecars (the whose-answer table in code; no parsing outside `verdicts/`; work bound and search budgets; runner, budget and cleanup).
- 2026-11-08 review of `76328de4`: PASS with findings, no check weakened (Opus). Sidecars' Highs: the budget does not bound queued attempts while another top holds the alone lock, and teardown can hang on an escaped pipe (so 605 s does not hold yet); `odd`/`session` searches expect inconclusive, so a budget hit passes; a foreign SIGKILL after a memory decision reads as our kill. Twenty items plus the S1 leftovers sent to the CP3 builder.
- 2026-11-08 06:09 review of CP3 checkpoints `2d103851`, `5614feda` (review fixes, black-box plants): Opus high plus four Haiku sidecars (plants can fail; runner fixes; whose-answer fixes; searches, kills, lifetime coverage).
- 2026-11-08 review of `2d103851`+`5614feda`: PASS with findings; nearly all earlier items fixed. Open: the black-box plants assert nothing yet and can reuse another commit's tree; the root is killed before its tree is read; lock and exit waits unbounded in edge cases; odd/session pins tautological under budget; a work-bound hit attributed as an oracle catch. Runner calls (delegated): nothing scored is unknown, not fail (deviation from the design); memory kills at ≥2× measured reference are the program's fail, no near-limit band; FRAG-15/SEARCH-ODD-SMALL assert their verdict on state bounds; three OS edge cases (unreaped D-state child, a setsid grandchild between polls, a foreign SIGKILL in the decision tick) stated as limits, not patched. Sent to the builder.
- 2026-11-08 07:09 review of CP3 checkpoints `95a278cb`, `f6f08b15`, `817fead9`: Opus high plus four Haiku sidecars (plants assert; signals, lock, bounded waits; searches, work bound, coverage; outcomes, errnos, exemptions).
- 2026-11-08 review of `95a278cb`..`817fead9`: PASS with findings. Real suite finding: lifetime-falsify keyed on full ids shows 34 lifetime cases never red on any wrong runtime (the old prefix-keying hid it); kept red, listed for round 14. Also: search depths cut (store 12→9, bare 12→5, odd/session 4→3) and state-count pins counting as mutant kills; plants failing for the wrong reason (B3, B4, B7, B12b, B20) or unable to fail (B10); lock stolen when ps fails. Runner calls R5-R8: mutants judged on search verdict (state-count changes noted as `search-reach`); original depths restored with measured budgets; lifetime gap stays red; B5 and B10 deviations recorded. Finish list sent to the builder; remaining OS races become stated limits.
- 2026-11-08 08:09 review of CP3 checkpoint `87d47cac` (finish list): Opus high plus four Haiku sidecars (plants proof; lock and teardown; search depth and mutant scoring; errnos, readers, references). Usage: weekly 28%, 5-hour 47%.
- 2026-11-08 review of `87d47cac`: PASS with findings, not ready for close-out. Three parts hit the convergence rule (amendment 4) and each gets one rule instead of patches: C1 errnos (fourth review with another catch site losing the code) → no catch stringifies an error, one `classify(e)`, enforced by a recursive S1 rule; C2 the cross-process alone lock (fourth review with a lock race) → removed, alone means this run's own tree, two concurrent top-level runs a stated limit; C3 plants (third review with wrong-reason or vacuous plants) → each states its expected reason per side and checks its own preconditions, a failed precondition is a broken plant. Plus bare's depth-12 budget, work-peak re-measure, STATUS records. Sent to the builder.
- 2026-11-08 the user: "this harness is just a prototype btw, we are wasting time". CP3 wrapped up early: the builder finishes the lock removal only, confirms verdicts unchanged once, and carries every open item to the phase 3 conformance rewrite (STATUS.md). No further sidecar rounds on prototype harness checkpoints; CP3's close-out is a single check of the final run, not a full review (call for the user's read). Next: relock, then round 14's remaining work.
- 2026-11-08 CP3 wrapped (`8cf6a7e5`): cross-process lock removed, open items carried to the phase 3 rewrite (round-14/STATUS.md). Final run: suite 834/834 with outputs and RECIPIENTS identical to baseline; `gates.ts` 151 s, 19/25, reds only the lock (now cleared), `chain`, and lifetime's 34 uncovered cases. Relocked (`c1462681`, 61 lines each with its own reason): the suite exits 0 and falsify tamper's control is green. Queue item 0 done; next: item 1, round 14's remaining work.
- 2026-11-08 amendment 8 (`d5b809ef`): prototype builders lead up to four Haiku sidecars. Round 14 finish started with it: Opus lead (medium) on `chain`, `queue`, `fragstore.row`, `listen.load`, and wrong runtimes for the 34 uncovered lifetime cases.
- 2026-11-08 round 14 finish (`158cb5db`, `ce7c415b`): `chain` and `fragstore.row` were wrong oracles, `listen.load` a harness bug since round 7 (an invalid shape behind `as never`); all three fixed with design citations. 35 new lifetime wrong runtimes: all 34 uncovered cases now red. `gates.ts` 25/25 green in 166 s, first all-green run of round 14. `queue`: rule 15 ambiguity (do queued commits count as live work after a late ending?); runner call under delegation: option A, queued commits count, so "a late ending never leaves live work" holds as written (suite unchanged when tried); the lead is applying it. Findings for the design (STATUS.md): rule 15 queued work; rule 17's refused-resend exception (2.7.11); re-entering one's own state decides lateness (rules 14-15); a disposed identity whose removal never reached disk returns on a plain send after a crash; path-dependent search oracles (carried to phase 3). Trial of lead plus Haiku sidecars: 39 min from plan to done, 7 sidecars (4 coders, 2 runners, 1 reviewer), 1.5-3.5 min each, no diff redone; the reviewer caught a real gap in the lead's own fix.
- 2026-11-08 rule 15 option A applied (`33791bec`): `leavesWork` counts queued commits; new variant red before, wrong runtime `misc.late-leaves-queued` red; queue search completes at depth 8 (4345 states, budget 6000, 11.5 s); its `refuseOk`/`refuseNo` actions dropped (armed faults are not in the state key; carried as finding 6). `gates.ts` 25/25 in 165 s, suite 836/836. Round 14 close-out review started: Opus high plus four sidecars (oracle fixes against the design; lifetime wrong runtimes red for the right reason; rule 15 change and queue search; design findings complete).
- 2026-11-08 round 14 close-out (Opus plus four sidecars): PASS with findings; `gates.ts` 25/25 confirmed. High: armed faults are not in the search state key, so fault actions read as dead and dropping them hid two reds (one harness false red in `keptNames`, one older undiagnosed `refuseNo` reload red). Also: chain and fragstore oracle fixes too loose (persisted record; delivery per ending), queue pin shallower, six lifetime wrong runtimes weak (equivalent, broad, composite, crash-only), LIFE-24's case too weak. Runner calls under delegation: rule 15's "pending" = InFlight head plus every queued commit including behind a Held head, Held head excluded; a transition that cancels the owning lane may leave (not live work); `flow check` must treat serialize-queued commits as pending. Fix batch sent to the lead. Design text owed in machine-design.md: rule 15 wording, rule 17's refused re-send, self re-entry generalised next to rules 14-15, a disposed identity after a crash vs "a send must not resurrect", D67's unversioned late-frame limit into 2.8, delivery per ending, an ended identity's memory, a head's parked ending restores as parked.
- 2026-11-08 round 14 done (`64ee7807`): armed faults in the search key; the two exposed reds were harness false reds (keptNames; the refuseNo oracle's three gaps plus oracle (e)); queue pinned at depth 12 inconclusive; rule 15 with its Held and cancel rules, two denied and three allowed controls, three wrong runtimes; lifetime `kills` names its target case, which must fail by assertion; listen `.noload` in falsify. `gates.ts` 25/25 in 172 s, suite 841/841, all five mutate-one searches pass. No further review round (prototype harness; the user's guidance). Runner call: a late transition that cancels a lane also exempts its never-sent promoted head (to round 15). Started: design text for round 14's findings into machine-design.md (OD49, Opus writer); round 15 builder (Opus, medium) on the owed rulings U2-U19 plus that call.
- 2026-11-08 round 14's design text in machine-design.md (`4fc720df`): OD49, C162-C169. Proposed for the user's read (not decided): the rule 15 cancel exemption also covering a never-sent promoted head (runner's answer yes, being built in round 15); evidence for a kept ending's per-boot retry and for a stranded read let go.
- 2026-11-08 11:11 review of round 15 checkpoints `3703c8cb`..`b35fe3d2` (rule 15 promoted head, U13, U14, U17; U2/U3/U5/U8/U9 shown already true): Opus high plus four Haiku sidecars at high (cases against the design; already-true claims; runtime changes; design findings). Usage: weekly 33%, 5-hour 24%.
- 2026-11-08 review of round 15 `3703c8cb`..`b35fe3d2`: PASS with findings. High: the rule 15 cancel exemption is a name match that wrongly exempts other keys and other ops. Runner rulings (under delegation): R1 drop rule 15's cancel exemption entirely (both halves; reverses OD49(1)'s exemption) — a late ending may not leave live work; giving up is written as a stay-put alternative that cancels, so the work ends as a current ending; R2 rule 43 on unkeyed operations: a key-less member names its one lane (U2's own-Attempt reading is for keyed operations only), runtime to follow; R3 U17: read pre-U17 names-only stamps (a change to Flow's own stamp format is a migration Flow owes; to phase 1 migration); R4 a late ending with every alternative denied: to be written up, not decided. Also U13's persisted shape and hooks, the kill-inside-the-window case, U5/U8/U9 wrong runtimes, U2/U3/U14 stronger cases. Sent to the round 15 lead. Design text owed (OD50): R1-R3, "final capture", `cancel` concurrency absent, `forget` on parked endings and holds, no module may start work once disposal starts.
- 2026-11-08 round 15 built (`3703c8cb`..`fd99510f`): every owed ruling done or shown already true, except U14's `forget` (not in the prototype; the design does not say what it does to owed endings); runner rulings R1-R3 built, R4 written up; `gates.ts` 25/25, suite 856/856. 22 findings for the design in STATUS.md, including likely user decisions: `persist` opt-in default, `cancel` concurrency absent from the API, U17's "ignoring annotations" unbuildable in Effect 4. Sidecars: 11 tasks, 5 changed, 0 rejected, reviewers found four real bugs. Close-out review started (Opus owning its own four Haiku sidecars).
- 2026-11-08 the user accepted every recommendation of the round 15 decision round ("all recommendations are accepted"): Q1 A `forget` turns parked endings into evidence, holds stay (only the owner's cancel drops a hold); Q2 A U17 compares each check's `representation: { id, payload }`, ignores other annotations, custom filters and transformations a stated limit; Q3 A an explicit whole-lane cancel (name `cancelAll`, proposed by the runner, accepted with the recommendation) releases the hold and ends every queued commit `NotSent { Cancelled }`; Q4 A `flow check` errors on a late handler with no stay-put alternative, runtime unchanged; Q5 A `persist` defaults to false (opt-in). The user asked whether `persist` belongs on the machine rather than the definition (several machines from one definition); runner's answer: keep U19 A (on the definition) — open question for the user's read, not changed. Runner calls from the close-out: a format tag on Flow's version encodings (actor and op), `cancel` concurrency built per C153, the rest per the close-out's (a)/(b) list. Next: OD50 design writer, and a lead builder for the round 15 follow-up batch; then phase 1 (H1, H2, M2).
- 2026-11-08 OD50 written (C170-C177). Writer's own call, accepted by the runner: `cancelAll` interrupts a head still on the wire, as `cancel` does. Proposed for the user's read: after `forget`, a lane whose operation no longer exists keeps its hold and no member can cancel it (a consequence of Q1); and whether `persist` belongs on the machine.
- 2026-11-08 amendment 9: small public API changes are the runner's (recorded for the user's read); large ones stay the user's. Runner calls under it: `persist` stays on the definition (U19 A; persistence describes the stored record, which the definition holds); after `forget`, a hold on a lane whose operation no longer exists is dropped with evidence (otherwise it can never drop; holds of live operations stay per Q1). Both to OD51 with the next design text.
- 2026-11-08 round 15b built (`1a616443`, `9bec746d`): all 12 items (cancelAll, persist opt-in, representation compare, forget, the flow check rule 15 error, format tag, cancel concurrency, local identities, live gates, reserved reasons, oracle (h), stale cases); suite 869/869, gates 25/25 (graph-gate and lifetime-falsify passed on rerun alone). Sidecars 6 tasks: 1 accepted, 5 changed (one coder's compiler change thrown out and rebuilt). Phase 0's queue is done. Review of 15b started (Opus owning its sidecars) in parallel with PHASE 1's first area (H1, H2, M2; lead builder, high effort, every third build round), which also builds runner rulings R5-R8 on 15b's findings: live cancelAll hears the head first then the queue in mint order; a refused ack under cancel/latest follows the table (Superseded); cross-format compare recomputes the old format's hash (names-only dropped); the rule 15 check must not flag a handler that can stay.
- 2026-11-08 round 15b review: pass with findings. High: `forget` did not remove the record (C173) and hid forgotten held lanes (a mutant enforced the deviation); the amendment-9 call (drop a hold whose operation is gone) was not built. Runner rulings: R5 reversed on the reviewer's evidence — a live `cancelAll` delivers the queue first and the head (which leaves a hold) last, one rule with D107 for restore, disposal and cancelAll; R6, R7 stand (R7: format 0 names-only a stated limit; `sameVersion` made symmetric); R8 changed — the rule 15 check stays strict (not a false positive), not reading other ops a stated limit; R9 `forget` removes the record, a held lane stays unbound and reported, a hold whose op is gone is dropped with evidence, forget of a live actor disposes first; R10 a rule 60 release wins over `cancelAll`; R11 lies for the oracle loosenings; R12 small gaps. Sent to the phase 1 lead.
- 2026-11-08 phase 1 area H done (`e6b0db23`): H1 built (an Effect default is a construction error, `ImpureDefault`, proposed name), H2 already done by U17 (round 13's exact case added), M2 built (decline beside an old-version hold is `NotSent { OldVersion }`, not Rejected); R5-R12 built; a harness bug fixed (the reference model was built once per run, hiding the op-removed exemption). Suite 890/890, gates 25/25. Runner calls on its findings: 2.2.2's per-door default is an implementation freedom under U12 B; a later `latest` commit must never lose a pending cancel; a stay-put alternative at the owner state counts for the rule 15 check; round 13's M3 (`OldVersionLane` as an issue, `previous: [{ key }]`) to record migration. Started: OD51 design writer; phase 1 entities lead (medium). No separate close-out review for area H (folded into the entities area's hourly reviews; prototype guidance). Usage: weekly 38%.
- 2026-11-08 phase 1 entities round 1 (`19b6ab2e`): 0a (a pending cancel is never lost) and 0b (owner-state stay-put counts) settled; D3: the prototype joined at mint, now joins when a write becomes its lane's head (a W commit is a draft: prediction shown, holds no record; a sent hold still stalls others); price: send order, not commit order across actors. U10/rule 32, U7/D46, D39, D49's record half settled. Real source: a supabase-js PostgREST update (200 with `data: []` on conflict, status 0 on a dropped connection), passing with no runtime change. Open: D18 (keep the basedOn rebase cut, reversing the user's OD19 Q32 A), D12/D40/D15 Flow timers (builder: drop D12/D40, keep D15), the D47-D76 judge (four differences, incl. public words .covers/.gone/delta/row/guarded). Gates 25/25 in 222 s, lock 898/898. Review started (Opus owning its sidecars).
- 2026-11-08 amendment 10 (the user: adversarial re-audit of new prototype additions): four-angle audit per phase 1 area by an independent Opus auditor writing its own wrong runtimes from the design. Started: the audit of rounds 14, 15, 15b and area H (`158cb5db`..`e6b0db23`), its wrong runtimes in `round-14/mutants-audit-1.ts`. Planned: the entities audit after entities' last build round, before entities is recorded settled; streams and record migration likewise.
- 2026-11-08 entities round 1 review: built honestly, D3 as directed; D3's price stated correctly (screen and server agree; on a last-writer-wins source an earlier draft may silently overwrite a later commit from another actor). Runner rulings for round 2: D18 keep OD19 Q32 A narrowed (rebase only across an earlier-minted write; the user to confirm in the entities round); D12/D40 count-bounded repair (3 asks then RepairOverdue), D15 an unbound sent hold yields when another write joins its record (no clocks); judge: lower version silently stale with evidence, higher version applies when ordered, Schema.toEquivalence; U10 demotion field-scoped; S13 fixed to send order plus a drain oracle; PostgREST without idempotency (settle unknowns by a read); 4,096 quiet-mark cap. The builder drafts ENTITIES-QUESTIONS.md (guarded, .gone, .covers, delta/row, D18) for the user's round.
- 2026-11-08 adversarial audit 1 (rounds 14-15b, area H): NOT yet trustworthy. 22 design-derived wrong runtimes, 11 killed (4 only off target), 10 survivors (disposal order pinned against C179/OD51; keyed cancelAll; undecodable and old-version lanes vs unbound; forget on undecodable/old-version records and with queues; R2 in NotSent handlers; newer-format downgrade; R10's head; subroutines as live work), plus two runtime gaps (an Effect.fail default accepted against C184; lookup heads not counted as live work) and four excuses built from the runtime's own evidence (forbidden by policy-testing). Wrong runtimes committed (`mutants-audit-1.ts`); the gap-closing batch queued for the entities lead after its round 2; then a re-audit.
- 2026-11-08 the user accepted the entities round ("all accepted"): Q1 A `guarded: true` on a contract (the author's claim that the commit sends `basedOn` as a precondition; a version past it ends a given-up mark's doubt); Q2 A `.gone(tag)` on a read (that failure removes the row); Q3 A `.covers(pred)` on `listen`, default "the records it delivered" when absent; Q4 A `delta` (partial, versioned, listen only) and `row` (whole) split from `patch` (predictions only); Q5 A the narrowed `basedOn` rebase (only across an earlier-minted write), revising OD19 Q32 A. Next: one lead batch building Q1-Q4 plus audit 1's open items; then the entities adversarial audit and audit 1's re-audit; then OD52; then streams.
- 2026-11-08 17:1x wake: entities round 2 (`dd8b89ac`) and audit batch (`fed2906a`) get no separate hourly review; the scheduled entities adversarial audit and audit 1's re-audit cover them after round 3 (runner call, to avoid a duplicate review). Usage: weekly 43%; runner context 78%.
- 2026-11-08 the user asked for a convergence pass on `guarded` (the proof it claims lives one level down, in app service code). Last convergence touching it: round 9's entity-proposal-2 (2026-11-03, `e8bf2804`), where `guarded` was introduced; no convergence on it since. `guarded` is held out of entities round 3. Convergence started: Opus designer with its own four Haiku research sidecars (prior art: Replicache/Zero, TanStack DB, HTTP conditional requests, PostgREST), writing `round-9/released-write-proof-proposal.md`; then one review and one revision, then the user (a public API concept).
- 2026-11-08 the user: Flow not seeing into the commit is a fundamental limitation to resolve. Convergence widened: design the seam that makes the server contract visible to Flow without Flow owning transport ("Flow is not a network library"): proof in the answer, first-party source adapters at the edge (PostgREST, REST+ETag, Zero/TanStack DB), or a typed request description; the released-write proof becomes one consequence. A large public API decision: the user's, after review and revision.
- 2026-11-08 the user: "i don't want to own networking. i will abandon this exploration if we need to dive into that." Hard constraint sent to the designer: Flow touches data only (inputs, answers, Schemas, mapped outcomes), never requests, clients or transport; a typed request description is out; adapters only as pure data shims; if the only resolution needs networking, recommend abandoning and fall back to a data-only answer.
- 2026-11-08 released-write proof convergence, proposal 1 (`round-9/released-write-proof-proposal.md`): verdict — making the server contract visible needs Flow to own networking, so recommend abandoning the wider seam; data-only design: `precondition: { failure }` on the contract (a type error unless the tag is in the commit's errors); proof = an answer showing a version past the sent base, the precondition's refusal on that base, or a same-key success (C129); a live `.covers` session hides a mark; `PreconditionContradicted` evidence; the sent base kept durable; content-hash ETags unsound (need a never-repeating revision). Replaces Q1's `guarded` (the user's yes needed). Adversarial review started (Opus owning sidecars).
- 2026-11-08 the user rejected `precondition: { failure }` ("even guarded is better than this, precondition also hard to understand"). Runner calls (small API, amendment 9): keep `guarded: true` (Q1 A) with the convergence's soundness rules underneath — proof only from an answer showing the target record's version past the sent base or a same-key success; others keep the cap; equal version and refusals prove nothing; `guarded` requires a per-record version; a `.covers` session hides a doubt only if its filter reads no written field; `GuardContradicted` evidence (proposed name); the sent base durable. `allOrNothing` not added (revisit.md); runtime visibility of the server contract abandoned (the user's no-networking line); the data-only CI probe owed to revisit.md. Sent to the entities round 3 lead.
- 2026-11-08 the user: "go back to the original simpler additions i approved and fix any remaining issues that still exist then continue with the prototype work." The lead keeps the public surface to the approved words (`guarded`, `.gone`, `.covers`, `delta`/`row`, the narrowed rebase), with the convergence's fixes as internal rules only; then the entities audit, audit 1's re-audit, OD52, streams.
- 2026-11-08 19:34 the entities round 3 lead failed on a network error (API unreachable); its uncommitted work after `70c252ac` kept; resumed with its context once the network was back.
- 2026-11-08 entities round 3 done (`70c252ac`, `1864221d`, `0d1a1c95`): guarded (internal soundness rules; one public word), .gone, .covers, delta/row via a new `entity()`, basedOn durable, S13 rebuilt and the drain oracle kept with standing wrong runtimes (the send-order copy removed), chain (n), spelling pins; item 5 partly (3 of 4 excuses have lies; the self-release and forget excuses don't). Suite 941/941; gates 25/25 at checkpoint 2. 18 design findings in STATUS. Started: the entities adversarial audit (own wrong runtimes in `mutants-audit-2.ts`) and audit 1's re-audit (`mutants-audit-1b.ts`), both Opus owning Haiku sidecars.
- 2026-11-08 entities adversarial audit (audit 2): NOT yet trustworthy. 80 design-derived wrong runtimes, 61 killed, 17 real survivors (guarded soundness: business-key replay across values/contracts, proofs only from reads, rebase after send; rule 28 two-record heads; unresolved marks removed by replay or cap; all four .covers mask limits; U10 partial overlap and frame demotion; GuardContradicted on resend; .gone on a gap refetch; cap per entity and its 4,096 value). Runtime gaps: rule 35's many cap missing; key fields marked; coveredBy under-marks a record moving into the cover. Runtime-trusting excuses in ctx.ts and like.search.ts. Wrong runtimes committed (`mutants-audit-2.ts`); gaps go to one batch with audit 1's re-audit.
- 2026-11-08 audit 1 re-audit (1b): mostly closed — audit-1 wrong runtimes red by assertion (16 on target, 4 off target, 1 vacuous); 26 new design-derived wrong runtimes, 7 survivors (disposal definite-first order, lateness not transitive, denied turn keeps its lane effect, history re-entry, retired identities' unbound lanes, old-version holds under latest/cancel); the self-release excuse hides a faked release and is load-bearing; the forget excuse is unused (delete). Combined gap list `round-14/AUDIT-GAPS-2.md` committed with `mutants-audit-1b.ts`; a lead (medium) is closing both audits' gaps; then both auditors re-run before entities is settled (OD52).
- 2026-11-08 audit gaps 2/1b closed (`b0360416`, `33383b92`, `380b3f62`): every reachable survivor now red by assertion on its own case; rule 35's many cap, key fields without cells, coveredBy over-marking fixed; excuses rebuilt on harness-observed facts, the unused forget excuse deleted; the re-entry oracle fixed in the reference model; pins loosened. Suite 970/970; gates 24/25 under load with lifetime-falsify green when rerun alone. Runner ruling on its Finding 1 (D3 delegation): rule 30 / 2.8.5 win — a record's queue is released once the forced repair settles, the held write keeps its own lane hold (liveness; correctness by the hold plus the version check); being built with item 3 (rebase after send). Then both auditors re-run.
- 2026-11-08 rule 30 ruling built (`3ce7da6c`): an unknown holds its record queue only until its forced repair settles; the held write keeps its lane hold; item 3 closed; 11 cases re-pinned; LIB-02 now differs from TanStack DB's KeyScheduler; lifetime-falsify re-measured at 100 s. Full gates 25/25. Re-audit of entities and rounds 14-15b started (one Opus auditor owning sidecars; fresh wrong runtimes in `mutants-audit-3.ts`).
- 2026-11-08 re-audit 3: every earlier gap closed and every earlier survivor red by assertion on its own case; but the rule 30 ruling opened 8 new survivors (a regression on Released withdrawing a queue entry, rule 30 per record, re-send rehold, restored holds; rule 35 counting items; three .covers over-marking parts; a non-id key fixture) and one like-drain lie passes; three more runtime-trusting checks found. Gap list `AUDIT-GAPS-3.md` with `mutants-audit-3.ts`; the gap lead resumed on it; then a narrow re-audit of those items.
- 2026-11-08 audit gaps 3 closed (`d347f8e3`): all 8 survivors were missing cases (no runtime change); harness items rebuilt on what the fake/suite observed; pins loosened; suite 980/980; gates green across two runs (a full run went unknown under outside load, the 8 rerun alone passed). Left as stated limit: the `disabled` wait excuse rests on the runtime's `ModuleDefect` issue. Narrow re-audit started (`mutants-audit-3b.ts`).
- 2026-11-08 narrow re-audit (3b): audit 3's items all red by assertion, no regressions; 6 new survivors (2 reached but unasserted: a release keeps predictions; per-record repair) and two rebuilt checks fakeable (the like drain on an empty settled row; `business:` id prefix steering `spare`), `ledgerOff` not reset at a kill. Runner call: stop the entities audit loop after one last batch — each audit now finds fewer, narrower combination gaps (17, 8, 6), the design decisions are settled, and the production suite is rewritten in phase 3, where the remaining combination survivors and their wrong runtimes are carried (STATUS) and the rewritten suite gets its own full audit. The last batch: the two reached survivors, the two fakeable checks, ledgerOff. Then OD52 settles entities, then streams.
- 2026-11-09 the last entities batch done (`1819a851`): the two reached survivors asserted, the like drain compares empty settled rows, business keys from the compiled contract's idempotency (C129), `ledgerOff` reset at a kill; seven combination survivors carried to phase 3 in STATUS. Suite 981/981; gates 23/25 with the two timed-out gates green alone. Runner ruling on the auditor's question: `Released` frees the record queue entry of a never-re-sent unknown at once. ENTITIES SETTLED: OD52 being written. Streams area started (lead, medium, round 1).
- 2026-11-09 OD52 written (C185-C200): entities settled. Owed (a)-(i) for the runner, to OD53 with streams: runner calls now — (a) the repair bound is 3 asks per doubt in total, not per news (bounded, simplest); (b) U10's later success is by landing order after the give-up (the mark is about the server after the give-up); (c)-(i) settle with streams' design text.
- 2026-11-09 streams round 1 (`0b704aef`): sessions follow key changes (rule 68/O4), `subscribe.each` over one multiplexed socket, `IdleWithoutPing`, `latest` persisted across reload, a real EventSource path green first; suite 995/995, gates green. Questions: Q1 `Feed.multiplex` (a library helper for multiplexed sockets; the user's: a new public concept, borderline on networking); Q2 a key change with a `fills` field — runner's call: A (empty the field in the same turn, Inspection flag `FillsOtherKey`, proposed name). Runner calls on findings: a session's select runs every turn and a throw keeps what is placed with one issue; a select returning undefined releases with an issue, not silently; rule 71 saves latest's last value and heard flag (one write per change, 256 bound). Adversarial streams audit started (`mutants-audit-s1.ts`).
- 2026-11-09 the user accepted Q1 B ("all accepted"): `Feed.multiplex` as a library helper beside `Feed.callback` (the app opens the socket and parses frames; the helper fans out with `emit.to`/`emit.all`, counts references with `add`/`remove`, and gives `hub.stream(key)`); runtime unchanged. The user is asleep: run unattended (stops only for large public API changes and the roadmap's hard stops). Next: the streams audit, then streams round 2 (Feed.multiplex, Q2 A, the finding rulings, audit gaps), then streams' close, OD53, record migration.
- 2026-11-09 amendment 11: no stop before or during phase 2 (the user won't read the merged plans; the prototype is the main source of truth). Labels, criteria and every merge decision go to an independent agent judge, recorded for the user's read; the merge applies at once. The run continues through phase 2 into phase 3 and beyond; stops only for large public API changes and the hard stops.
- 2026-11-09 streams audit (S1): not trustworthy yet — 26 design-derived wrong runtimes, 16 survivors (rule 70 waits per key and actor, T1 flaps and deadlines, T5 stamps and own values, T6 group merge untested, Feed.callback's default bound), and the shipped runtime breaks three rows (down never stamps last.at; Dropped values aged from now; no 256-entry bound), plus DuplicateSession, the default backoff and per-operation entries missing; a ReleaseOverdue excuse switches the rule 70 oracle off. Wrong runtimes committed (`mutants-audit-s1.ts`). Streams round 2 started: Feed.multiplex (Q1 B), Q2 A, the finding rulings, every audit gap; then a narrow streams re-audit.
- 2026-11-09 streams round 2 (`99db9436`): Feed.multiplex built (library code, runtime unchanged), Q2 A, the rulings, all 16 audit survivors closed by design-cited cases, runtime bugs fixed (down stamps last.at, Dropped values aged from the drop, 256 bookmarks per operation, entries and waits per operation, the default backoff 500 ms x 2^n jittered by a session-id hash, capped 30 s), harness excuses rebuilt, a browser-like fake EventSource. Suite 1026/1026; gates green in batches; lifetime-falsify now times out at --parallel 2 (owed: raise it, first item of the next builder). Runner calls: `emit.fail(e, key)` on Feed.multiplex accepted (small API); the 9 findings go to OD53. Narrow streams re-audit started (`mutants-audit-s1b.ts`).
- 2026-11-09 streams narrow re-audit (S1b): all round 2 targets red by assertion; 8 new narrow survivors (exact bound and backoff constants, jitter, unconfirmed stamps, repeated drops, multiplex re-add, FillsOtherKey on return) and three lies fooling SEARCH-SESSION's rule 70/71 checks (full-input compare, the runtime's private mark format, any epoch). Runner call, as with entities: one last streams batch closes them (plus the lifetime-falsify gate setting), unreachable items carried to phase 3, then streams is settled in OD53 without another re-audit. Wrong runtimes committed (`mutants-audit-s1b.ts`).
- 2026-11-09 last streams batch (`6a4d272a`): the 8 survivors and 3 search lies closed (rule 70 grouped by the contract key, rule 71 checked through resumed bookmarks, the Repairing oracle rebuilt as a drain check), lifetime-falsify at --parallel 4 (210 s, CPU-bound), two runtime/library fixes (jitter hash mixing, Feed.multiplex registering a late joiner). Suite 1036/1036, gates green in batches. STREAMS SETTLED: OD53 being written (also closing OD52's owed items). Record migration started (phase 1's last area; lead, high effort).
- 2026-11-09 OD53 written (C201-C209): streams settled; runner decisions via the writer: T1 wins over T5 on Waiting; dropAt set on leaving Live/Repairing or when unset (the prototype's lose owes a fix — to the migration lead or phase 3); T3 oldest by last write; jitter = mixed hash of (session id, step); Feed.callback's bound counts the queue only; OD52 (c)-(i) closed (quiet removal shows non-key fields unconfirmed; version field marked after a gap; .one answers are whole rows; UnboundLane/LaneRekeyed/GoneWithoutKey proposed names; collection-wide version to revisit.md; Abandoned a reserved reason).
- 2026-11-09 the user: phase 3 onward is production code, so every build brief and review carries the quality rules: AGENTS.md "Code style (v3 production)"; tools/lint-bomb/STYLE.md with examples/style.ts, booking.ts, tracking.ts; tools/lint-bomb/FLOW-STATE.md; core in packages/flow-state-v3/src/ plain, pure, synchronous, deterministic, work as data; Effect only in src/host/ and edges; doc comments only on exported API in Effect's shape; no plan or invariant ids in code; nub run check:fix then nub run check with zero errors and warnings. Every Opus review from phase 3 on gets a fifth angle, a code-quality sidecar judging the diff against STYLE.md and FLOW-STATE.md (and folder layout), in addition to correctness.
- 2026-11-09 migration round 1 (`fe343c92`, `4ca9c708`): previous[i].retry/cancel(k) typed (M3), OldVersionLane a boot issue, no-migration quarantines and starts fresh (the runtime was right, oracle (j) fixed), purity a stated limit for Flow, a release1→release2 path. Suite 1045/1045, gates green. WAITING ON THE USER (large API, that item only): Q1 in `round-14/MIGRATION-QUESTIONS.md` — app-level migration of memory and states (A Schema only; B `previous` on the definition, recommended; C a version number). Runner rulings for round 2: previous[i].retryable exists; a dropped field gives an issue (FieldDropped, proposed); a held lane on a gone record is reported (HoldWithoutRecord, proposed); Rejected before OldVersion on fragment ops; OD53's dropAt gaps fixed and dropAt persisted; Flow's own format tag built. Then the migration audit.
- 2026-11-09 the user: production code (phase 3 on) is built from `.spec` files written with the workflow suite's `to-design` skill (/Users/arpit/Developer/workflow/skills/suites/workflow/to-design/SKILL.md), alongside `to-spec`; build each module from its spec, with the prototype as the reference implementation to move fast (read and copy ideas, never move prototype code in). Every production builder brief cites the spec it implements; reviews check code against its spec.
- 2026-11-09 the migration lead stopped on a network error during round 2's lock step; resumed with its context.
- 2026-11-09 migration round 2 (`0c0b2017`): Flow's record format 2 with a pure format-1 upgrade at boot, newer/invalid formats quarantined; previous[i].retryable, FieldDropped, HoldWithoutRecord, Rejected before OldVersion pinned, dropAt as one rule kept on latest bookmarks. Gates 25/25. Migration adversarial audit started (`mutants-audit-m1.ts`). Q1 (app-level migration) still waits on the user; migration settles after Q1 is answered and built.
- 2026-11-09 migration adversarial audit (M1): not trustworthy yet — 21 design-derived wrong runtimes, 12 survivors (format edge values, format-1 lossy upgrades, previous[i].retryable budget, FieldDropped on fragments and its negative, HoldWithoutRecord for in-flight heads and old-version variants, the fresh actor saved, the encoded side of keys), two runtime breaks (an op rename quarantines its lane; a new-version actor with equal name text hears the old hold), and oracle (j)'s quarantine excuse trusts the runtime and misses OldVersionActor. Committed (`mutants-audit-m1.ts`); migration round 3 closes them.
- 2026-11-09 the user answered migration Q1: "versioning with cache invalidation, like tanstack query" — option D: a version (buster) on the definition; a changed version discards memory and state and starts fresh with an issue (proposed `RecordVersionChanged`); lanes and holds are kept (write safety, existing unbound/adopt rules); field Schemas still decode within a version; migration functions to revisit.md. Sent to the migration lead after round 3.
- 2026-11-09 the user: the migration version is app-wide, not per definition ("top level for the whole app"), like TanStack Query's single buster: one version in the Runtime's persistence options; a change discards every persisted actor's memory and state at boot (one issue, proposed `AppVersionChanged`), lanes and holds kept. Sent to the migration lead.
- 2026-11-09 the user decided migration Q1: "A without optional manual version" — automatic per-definition reset: when a definition's persisted memory/state shape changes incompatibly (its structural version, rule 74/U17), that definition's saved memory and state are discarded at boot with an issue (proposed `RecordShapeChanged`); others untouched; writes in flight kept; `flow explain` lists the definitions a release resets; no manual or app-wide version (both to revisit.md). Replaces the earlier app-wide direction. Sent to the migration lead.
- 2026-11-09 migration round 3 (`e8cd6d55`) and Q1 built (`31a0eec6`): lane records carry their contract id (format 3; an op rename moves the lane to the one write op over that contract); lanes stamped with identity version (another version's lane never adopted, listed unbound); audit M1's 12 survivors stand in `mutants-am1.ts`; oracle (j) from what the suite saw (the lie red in 24 cases). Q1: records carry their definition's saved shape (format 4); a kept field's Schema version change or a gone saved state resets that record at boot, one `RecordShapeChanged` per definition; writes in flight kept unbound until adopted; `flow explain <release> --since <release>` lists resets; 6 wrong runtimes red. Suite 1066/1066, 25 gates green. Lead's findings: a renamed field is dropped+added (never resets); pre-format-4 records never reset; a new identity's keyed `cancel(k)` and its commit still reach the old identity's lane (to judge in audit M2). Next: migration audit M2 (last for this area), then OD54, stage A close-out.
- 2026-11-09 review wake: the new checkpoints (`e8cd6d55`, `31a0eec6`) are under audit M2 (an independent Opus with 4 Haiku sidecars, running), so M2 is this hour's review; no second reviewer on the same commits.
- 2026-11-09 audit M2 (`f16feba1`): 14 wrong runtimes, 8 survive; 4 runtime breaks (a new identity's own decline parked on the old lane; an op rename overwrites a quarantined hold; a removed history-target state quarantines instead of resetting; explain --since calls an identity change a reset). Sidecars 40 findings: 22 accepted, 9 changed, 9 rejected. Runner rulings (for the user's read): Q17 lane = (identity, contract, key), a new identity gets its own lane; the old hold kept, unbound, exits by its own ending or forget (else a stated limit); Q18 reset decided per record, reported once per definition; Q19 the upfront structural-version rule stays, computed fields unstamped; Q20 a field drop is applied at that release's boot (bounded D111 exception) so a re-add never resurrects data. Closing batch sent to the migration lead; then OD54 and stage A close-out.
- 2026-11-09 migration closing batch (`5ccc6944`): Q17-Q20 built (an old identity's lane renamed at boot to key#identityTag; a revert hands the key's lane back), breaks 1-4 fixed (LaneRekeyCollision, proposed), all 8 survivors and the weak kill closed by case (`m2.rename-any-op-kind` red only by oracle (j) at boot, accepted: the wrong move happens before any step), standing gates in `mutants-am2.ts`. Suite 1080/1080, 25 gates ok. Stated limits for revisit.md: an old identity's unknown hold has no user exit (cancel reaches only the current identity; forget keeps a hold whose op exists) and ends only by its own ending; memory field rename = drop + add; unstamped records never reset; computed initial values are stamped in the prototype. Open: --since across a release chain, stamps across a format bump, a revert after release 2's ensure overwrote release 1's old-version record, a rekeyed lane saved only on its next write. lifetime-falsify at 282 s of its 290 s bound: split before the next area. Migration's audit loop is closed; next OD54, then stage A close-out.
- 2026-11-09 OD54 written (migration settled, C210-C216, 18 items; Q18 per record flagged for the user's read; contradictions amended inline: rule 74's newer format, the citation in 2.7.17; open: rule 74's forget vs the overwrite as built, an old identity's hold has no exit). revisit.md gains migration's limits and open items plus the missing OD52 allOrNothing and OD53 (19) entries. Phase 1's areas are done; next the stage A close-out review.
- 2026-11-09 stage A close-out audit (`4d6d1cf2`): FAIL on 5 blocking items, gates 25/25 ok at `eb746c9e` (532 s). B1 repair count reset at RepairOverdue vs C207 (runner: adopt the runtime, amend C207); B2 lanes keyed by op name vs (identity, contract, key) (runner: fix the runtime); B3 compile refusals ModuleDisabled/Abandoned/byReason/GoneWithoutKey not built; B4 the user's-read list stale since 2026-11-08 (fixed by the runner now: a new section with 10 entries, the per-record reset first); B5 fragstore.row red at depth 7 since entities round 1 (gate runs depth 4). No rubber-stamping found. A fix lead (Opus, with sidecars) has B1-B3, B5, the lifetime-falsify split and the minors; then a narrow re-check of the close-out, then phase 2.
- 2026-11-09 stage A close-out fixes (`d3d89576`): B1 the repair count resets at RepairOverdue (rule 30, 2.8.6, C207, OD53 (8) amended; 3 wrong runtimes red); B2 the design already forbids two write ops on one contract (`SharedContract`, F2) — the lead built the missing flow check error instead of re-keying lanes; runner accepts (read list entry 6 updated); B3 ModuleDisabled/Abandoned reserved, GoneWithoutKey in flow check (byReason keys carried to phase 3's type-level check); B5 fragstore.row was a stale oracle (the quiet unconfirmed level), now pinned at depth 7 with a lie; listen.none inconclusive at depth 7 (carried); lifetime-falsify split 143 s + 146 s; minors fixed; round 13's M5 settled as an oracle (h) harness bug (STATUS). Gates 27/27 at --budget 580, but 574 s used: raise the budget or split the depth-7 search before more work. Suite 1080/1080. Next: a narrow re-check of the close-out, then phase 2.
- 2026-11-09 stage A re-check (STAGE-A-CLOSEOUT.md "Re-check"): B1, B2 (with limits n2-n4: two placements of one writing fragment compile silently, carried with a corrected reason; host-level pins only; the check is flow check only), B3, B5 closed; gates 27/27 at 900 s budget (585 s). B4 incomplete; the runner completed it (read list entries 11-17, names batch, entry 4 corrected: forget keeps an old identity's hold), added rule 30's n1 sentence (news during a running ask joins it), fixed the stale Resume block, phases list and the M5 line. STAGE A DONE; phase 2 (plan merge, no stop) next. Owed before phase 3 load: the depth-7 search into its own gate job (limits.ts says 40 s, it takes 192 s).
- 2026-11-09 phase 2 started: one Opus merge lead (Haiku research sidecars allowed, amendment 5), plan by plan (Machines first), merge log `workflow/plans/flow/references/proposals/plan-merge-log.md`, `workflow check` and a commit per plan; large public API or guarantee conflicts held for the user, the rest applied. Then an independent merge audit (Opus + 4 Haiku, which also re-checks the runner's B4 list completion), then Specs.
- 2026-11-09 phase 2 merge done (`75a73b84`..`1183c948`): 14 plans, 170 edits, 247 superseded sentences quoted with pointers, 25 conflicts all runner-judged or user-decided and applied (none held), merge log `plan-merge-log.md`. Finding for the workflow CLI: `workflow check` passes a dangling `@plan.X.O99` reference (falsified on a scratch copy); the lead ran its own read-only ref check per plan. Notable conflicts for the user's read: PC1 a removed machine's lanes quarantined (U4), CLC1 `diff --base` cut, FSC1 build target `packages/flow-state-v3/src/`, OC1 `descriptor.get` → `contract.get` (proposed), PKC1 `PropertyTestFailed` exported per C82. Next: the independent merge audit (Opus + 4 Haiku; also re-checks the runner's B4 list), then Specs.
- 2026-11-09 merge audit (`17032125`): FAIL on 8 blocking text items, no re-merge: per-record reset credited to the user; `trace diff` back against the user's 2026-11-02 CLI cut; unmarked runner rulings (PC1, PC2, EC2); InvalidWrite rules deleted silently; lane tuple without version in 3 places; Diagnostics' closed list missing stream flags; unconfirmed names as final; no conflict reached the read list (amendment 11's independent judge: this audit is the first). 24/25 conflicts agreed. Merge lead's sidecars S2/S3 partly rubber-stamped. Read-list gaps listed. Fix pass sent to the merge lead (it may edit only the read-list sections of progress.md); then a narrow re-check by the same auditor, then Specs.
- 2026-11-09 the user: "everything that is superseded should be extracted out into a separate superseded items file". Roadmap amendment 12 (version 13): superseded plan text moves to `workflow/plans/flow/references/superseded.md`, plans carry the current contract only; machine-design.md keeps its inline markers. Sent to the merge lead with the fix pass.
- 2026-11-09 merge fix pass (`a8a2551d`..`6c7c5f43`): B1-B8 and minors fixed; OD55 records the user's 2026-11-02 CLI scope (trace diff cut); InvalidWrite rules restored in Operations O3; read list extended (phase 2 merge section with the audit's judgement beside each conflict); 270 superseded items moved to `superseded.md` (amendment 12). Three design ambiguities carried to the Specs (dehydrate settling vs moving time, hydration rejection vs rethrow, Hydrate's owner plan). Narrow re-check by the same auditor started.
- 2026-11-09 merge re-check: PASS-WITH-FINDINGS, B1-B8 closed (0 dangling refs of 419, 0 of 293 pointers in superseded.md, 282 quoted segments each once). Runner fixed the minors inline: OD55's runner sentence marked and its quote noted as the runner's record; superseded.md's revision-diff entry (cut, no replacement); the merge log's trace diff line; RecordHeld and stalled: "record" marked proposed; read list entry 19's (b)(d)(e), contract.get in entry 10, entry 21 (OD54's stated limits; PC3 is a behaviour call). Not done: an evidence column on the phase 2 table, and reasons for entries 4/10/12/13 (they cite their ODs). PHASE 2 MERGE DONE; next Specs (to-spec / to-design, the user's rule for production).
- 2026-11-09 Specs started (phase 2's last step): one Opus Specs lead with to-spec and to-design, the split proposed first in `spec-split.md` (runner's call via the lead), Specs under `specs/<area>/`, the old `specs/runtime/Runtime.spec` (from the frozen rewrite plans) superseded, not deleted; log `spec-log.md`. Then a Specs audit (Opus + 4 Haiku) as phase 2's completion audit, then phase 3.
- 2026-11-09 the user: "over designing upfront can be bad, only do what we intend to soon first, all specs are guides and up for modification at any point if required". Amendment 13 (version 14): phase 2's Specs cover phases 3-4 only; feature Specs at phase 5's start; every Spec a revisable guide. Sent to the Specs lead (hydration questions deferred to server rendering's phase).
- 2026-11-09 core Specs done (`97277826`..`90d4ffa0`): 10 Specs under `specs/core/` (Compile, Turn, Actors, WriteLanes, Reads, WriteAhead, Restore, Diagnostics, Codec, StaticCli; 151 Requirements, 189 Invariants, 110 tests naming prototype cases or wrong runtimes phase 3 writes); 82 plan outcomes placed (36 core, 43 at their phase, 3 out of scope); each Spec headed as a revisable guide; old Runtime.spec marked superseded in its basis; `spec-refcheck.pl` added. Open: the hydration questions (server rendering's phase), Runtime Q1 (can the services Layer be acquired storage-first) in Actors. Next: phase 2's completion audit (Opus + 4 Haiku).
- 2026-11-09 phase 2 completion audit (`7feb7df4`): PASS-WITH-FINDINGS; 5 blocking Spec text items (old-version lanes contradict Restore; delivery count; Attempt ids random vs exceeds; 7 dead cited wrong runtimes; WriteAhead I12 unmeetable), 27 minors, over-design (Reads parts never prototyped, entity rules in WriteLanes). Runner rulings: prototype wins on old-version lanes; the plan wins on a denied turn's lane effects; Attempt ids unique across devices via a host-supplied boot seed fed through the mint (correctness: a server may key idempotency on it; for the user's read); capture issued within 5 s; unproved Reads parts moved to their phase. Fix pass sent to the Specs lead.
- 2026-11-09 Specs fix pass (`9c3fc40c`): all 5 blocking and 27 minors fixed; checks green (workflow check, spec-refcheck with the mutant-applies check folded in: 88 apply, 0 rotted; no untested Invariant). An eighth dead wrong runtime found and dropped. Tooling finding: `workflow format` joins two words when re-wrapping a line with no trailing space. PHASE 2 DONE. Paused before phase 3: the user asked to delete everything no longer relevant (old runtimes, proposals, references), noting the commit; keep list proposed to the user, waiting for their yes.
- 2026-11-09 the user: delete everything absorbed, accepted, merged or rejected in the workflow folder ("machine-design has been absorbed so why keep it around"; only revisit and open items remain in proposals; archived plans deleted; keep the dispatch-desk and checkout examples, which will run as real apps; old packages stay for now) and "delete beads too". Done: machine-design.md and its merged/ record, references/design/, COVERAGE.md, every proposal but revisit.md and open-items.md, plans/archive, tasks/archive, specs/runtime, .beads and its SessionStart hook. Kept: the 14 plans, superseded.md, checkout/, dispatch-desk/, typecheck/. Spec tooling moved to `specs/` (spec-split.md, spec-log.md, checks/). Last commit with everything: `20986677` (the references README says how to read it; OD/C/D/U ids cite its machine-design.md). workflow check and spec-refcheck pass. Next: STATUS.md summarised (the user), then phase 3.
- 2026-11-09 round-14 STATUS.md summarised (`ef4052d8`): 1,890 → 147 lines (how to run, file map — inferred, stated limits, the phase 3 carry list, open findings, standing wrong-runtime files); full history at `36f5cb16`. Its open findings were checked against nothing now (machine-design deleted): phase 3 checks them against the plans and Specs. Waiting on the user: delete `.beads/`'s 337 MB untracked local database (irreversible). PHASE 3 STARTED: the conformance rewrite, round 1 (layout, Port, runner skeleton, first oracle slices), weekly usage 72%.
- 2026-11-09 the user: "delete beads": the untracked local `.beads/` database (337 MB) deleted, and its .gitignore lines removed.
- 2026-11-09 review of phase 3 round 1 checkpoints `976ca17c`, `18ceeaf2` started (Opus high plus its own four Haiku sidecars: Port, oracles and lies, runner and fake world, code quality; the layout review point).
- 2026-11-09 phase 3 round 1 done (`976ca17c`, `18ceeaf2`, `6d60a9d7`): suite in `packages/flow-state-v3/conformance/` (Port with round-14 and null adapters, fake world by host, DSL, oracle + lies per guarantee, runner with suite/--parallel/--runtime null/falsify); slice WriteLanes I3, I6 with PAY-01..05; same verdicts as the old suite on round-14 and 4 lies; old-suite weakness: `lie.resend-new-input` caught only by its recorded-output compare. Work list ~45 oracle modules (2 done). nub run check clean. Stated limits: runs under bun; main.ts calls Effect.runFork (platform-node pinned to another Effect); the old suite needs --no-catalog (its catalog read the deleted design). Round 2 (the ending ledger, PAY-06..16) waits for the round 1 review, since the layout is a review point.
- 2026-11-09 review of phase 3 round 1: sound, layout sane, no High; 5 Medium open at HEAD (three-channels check skippable on a missing attempt id; falsify doesn't require a lie per oracle; the Port can't express ending a use, actor on endings, publication identity, boot failure, a disk reader — plan now; the suite mints Attempt ids instead of the runtime's seeded mint; no carry table) and lows; no rubber-stamping. Round 2 sent to the same lead: the fixes first, then the ending ledger (one-delivery, PAY-06..16).
- 2026-11-09 phase 3 round 2 (`3b088390`, `ec727f2d`, `395b7cfa`): review M1-M5 and lows fixed (lie.ending-without-id; one registry entry per oracle with its lies; Port gains release/use, actor on Minted/Ended/Delivered, Parked/Unparked/Recorded/Unhandled/Denied, Boot.sessionSeed; seeded mint a stated prototype limit, phase 4 builds; carry table); one-delivery oracle catches its 4 lies (DLV-01..03 added since Pay never fires them); PAY-06..16: 31 variants ported, 17 wait on planned Port parts. 38/38 on round-14 under two seeds, falsify 9/9 lies. Round 3 (fresh lead, high): lane-cells with PAY-17..20, runtime disposal on the Port.
- 2026-11-09 review wake: round 2's checkpoints (`3b088390`..`395b7cfa`) are unreviewed, but the 5-hour window is at 93% (resets in 27 min) with two agents running (round 3 lead, the spec-lang builder); the review is deferred to the next wake, after the reset, so it doesn't stall them.
- 2026-11-09 the user: "fix this and check where our lint rules aren't even covered. flow-state-v3 should be covered." Found: no-unknown, no-object-type, no-module-level-mutable-state, no-direct-process-env and no-optional-domain-properties were scoped to src/ only, so the conformance suite (production code) escaped them; the mutable-exports/param-reassign/no-var override too; the staged hook; and test coverage still pointed at the frozen flow-state-rewrite. Widened all to src + conformance, added a determinism rule for the suite (outside runner/), coverage to v3. Result: 77 errors (73 no-unknown, 2 no-object-type, 1 no-param-reassign) and 3 warnings, sent to the round 3 lead to fix via a Port typed per fixture (generics), no blanket waivers. Core-only rules stay on src.
- 2026-11-09 the user: "we should update lint rules to handle this" (a readonly field inside a Data.TaggedEnum member is redundant: TaggedEnum maps fields readonly). Plan: extend lint-bomb's no-redundant-readonly-wrapper upstream (/Users/arpit/Developer/workflow/lint-bomb, main) with a failing target, test and RULES.md entry, then re-vendor into tools/lint-bomb; the round 3 lead drops the redundant readonly now. Agent start deferred to after the 5-hour reset (96%).
- 2026-11-09 phase 3 round 3 (`6003c856`, `714ace7a`): lane-cells oracle (WriteLanes I8, I9, I11, I12, I20, I21; unkeyed lanes only until Minted carries the key), 12 lies caught by it, LANE-01..10 and PAY-13/15/16/18/19/20 ported, disposeRuntime on the Port; suite 61/61 under two seeds, falsify 21/21; both suites catch all 12 lies, two old wrong-runtime edits no longer apply to round-14. Spec log: WriteLanes R14 idle cancel wording; three wrong runtimes moved to the guarantee they break. TaggedEnum readonly removed. NOT clean: 79 lint findings from the widened scope (74 no-unknown, 2 no-object-type, 3 warnings) → round 4's first item (Port typed per fixture). Slips: python/sed/perl edits (perl to restore Spec trailing spaces the Edit tool strips). After the 5-hour reset: round 4 lead (generic Port first), the to-loop/wiki build review, the lint-bomb TaggedEnum rule; rounds 2-3 review at the next wake.
- 2026-11-09 the user: the suite isn't following STYLE.md (Port/Runtime and the Case DSL are service-shaped records; the fake world was 'plain owned state, not services'); "go ahead, and for code quality reviews launch 2 haikus to make sure they can cover more". Round 4 started (fresh lead): Runtime as a Context.Service with scoped Layers per runtime, world hosts as services the production host can take, Case as a per-case service, oracles stay pure; Port typed per fixture with generics; check to zero; then key on Minted, members, disposal lies. Rule from now: code-quality review angles use TWO Haiku sidecars. Also started: the review of the to-loop/wiki build (Opus + 4 Haiku, two on code quality) and the lint-bomb TaggedEnum readonly rule (Sonnet, then re-vendor). Rounds 2-3 review at the next wake.
- 2026-11-09 lint-bomb TaggedEnum rule: lint-bomb `5f29b4b` (no-redundant-readonly-wrapper flags a top-level readonly on a Data.TaggedEnum member field; 4 invalid + 7 valid tests, failing before; also fixed two stale lint-bomb checks), vendored at `d72af619`. 0 new findings in the suite because round 3 already removed them; the runner probed it: the rule is enabled (vite.config.ts:131) and fires through `nub run lint` on a planted file (the agent wrongly said it wasn't enabled).
- 2026-11-09 review of the to-loop/wiki build (spec-lang `to-loop` 6c65b42.., skills uncommitted): no High; 12 test failures confirmed pre-existing (14 at base). Medium: the harness model pair never applies (setup's default inherit wins); Q2 (delegating skills apply to-loop) presented as decided in DESIGN.md though it was the runner's call; renames rewrite code spans; the v3 roadmap's 'Source of truth, by area' has no conversion row; gaps for a fresh orchestrator (current Task undefined, skill pin wrong for installed copies, convergence count disagrees with policy-convergence, two roadmap rules lost). Lows and code-quality items. Fix pass sent to the builder (skills stay uncommitted). Open for the user: proposal Q2.
- 2026-11-09 skills suite (workflow repo, not flow-state): the to-epic/to-loop build and its review fixes landed (spec-lang to-loop `325ca35`, `0af1301`; skills uncommitted for the user's diff). The user: skills must be self-contained for first-time readers, three classes (verifiable / not readily verifiable / non-verifiable), summary first; a new generic `policy-verification` (procedure to build and maintain verification targets; ideas from pstack's verification skills, not TLA+), principle-design-for-verification stays as is (Q1 A), coverage record in the Plan's Verification targets (Q2 A, open to new syntax). One Opus is writing it and rewriting to-epic/to-loop; a fresh first-reader check follows.
- 2026-11-09 review of phase 3 rounds 2-4 (`3b088390`..`c7f72a9c`, incl. round 4's services restructure, claimed verdict-identical and lint-clean) started: Opus high with its own 4 Haiku sidecars (oracles and lies; Port; two on code quality), parity re-measured by the reviewer. Weekly usage 82%.
- 2026-11-09 review of rounds 2-4: the services restructure (`c7f72a9c`) kept verdicts (re-measured: suite 61/61, null 0/61, falsify 21/21, byte-identical; check clean); generics real at call sites. High: one-delivery excuses an ending on the runtime's own Superseded report, wider than WriteLanes.spec:250; lane-cells never judges a re-sent Held head (R3). Medium: issue-clears-delivery without matching; disposal parking taken from the prototype; the adapter guesses actors and lane-cells skips actorless mints; Row shape vs Reads R14; the phase-4 'no shim' claim untested. Lows. Rubber-stamp: rounds 2-3 genuine; round 4 has no sidecar log. All sent to the round 4 lead before new oracles.
- 2026-11-09 phase 3 round 4 done (`c7f72a9c`, `3097ea3c`): Runtime, world hosts, Timeline and Case as Context.Services (scoped prototype Layer), scenarios as Effect.gen with yield* Case, oracles pure; fixtures typed by their own Schemas, typed actor views; nub run check zero (79 → 0, nothing waived); 61/61 under two seeds, falsify 25/25; parity byte-identical. Review H1-M5 fixed (excuses from suite facts, re-sent Held head judged, issue matching, disposal parking from the Spec, actorless mint a violation, rows per Reads R14, 'no shim' claim replaced by what phase 4 must add). Stated limits: StillUnknown lenient (round-14 doesn't report the failure), keyed lanes unjudged on round-14. Slips: two python edits. Round 5 next: judged disposal at each case's end + disposal oracle; members oracle; held-head-last lie; shared scenario helpers. Pending the user: drop readonly from Context.Service shapes (+ a narrow lint rule).
- 2026-11-09 review wake: round 4's fix commit `3097ea3c` (fixes for the rounds 2-4 review) is unreviewed; deferred to round 5's first checkpoint review to keep the weekly reserve (86%; the user's 90% stop) for the skills finalisation and the v3 migration. No builder running (round 5 held for usage).
- 2026-11-09 the user: "i regret turning those conformance functions into services cause the scenarios have to use yield* everywhere ... let's revert the Context.Service change specifically". Round 5 (one Opus, no sidecars): revert Runtime/world hosts/Timeline/Case to plain synchronous values (as before round 4), keep the typed fixtures and views, JSON Port, lint zero and all review fixes; parity byte-identical; README decision 6 restored with the user's reason. The round 4 fix review is folded into round 5's review.
- 2026-11-09 phase 3 round 5 (`bc8dffba`): the Context.Service restructure reverted (plain Port/Runtime record, plain world built by make* functions, plain Case, scenarios as (c: Case) => void; yield* in scenarios 736 → 0); typed fixtures, views, JSON Port, review fixes kept. Parity byte-identical (suite 61/61, null, falsify 25/25), two seeds green, check zero. One behaviour change: the runtime is no longer disposed at each case's end (round 4's scope release did it, no verdict depended on it) → stated limit; the judged per-case disposal planned for the next round covers it. Unreviewed: `3097ea3c` and `bc8dffba`, for the next review.
- 2026-11-09 queued for when phase 3 work restarts (the user: "add these to the task, will be taken care of when work starts again"), in the suite README's work list items 7-9: the suite's own Conformance.spec (to-spec, next to the module) first; then the rename to Spec-area folders and behaviour names (lies → mutants, PAY-nn kept as a field); then the pending review of 3097ea3c/bc8dffba, judged per-case Runtime disposal, and @effect/tsgo in check. They become Tasks when the v3 roadmap moves to the Epic.
- 2026-11-09 v3 roadmap migration: the user confirmed the summary ("all accepted": Q1-Q6 A, skills root at the source checkout). workflow/tasks/V3/ written as draft: epic.task (pinned workflow@1c49650, loop fields, 30 notes incl. 20 pending decisions, 7 amendments) and P0-P10 (39 Tasks: P0-P2 done, P3 T4-T15 open, P4-P10 drafts); workflow check valid; migrator's own cold read done, a fresh-agent cold read running. Not committed; old roadmap untouched until the user approves the Epic and loop together. Skill defect: to-epic's template puts skill before description, the CLI requires after.
