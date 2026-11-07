# Progress: Flow State v3 production

## Resume

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
   entities (`packages/flow-state-v3/prototypes/round-9/entity-proposal-2.md`, settling U7, U10, U11 and D3's price,
   which is the user's); streams; record migration. Each area's settled design goes into machine-design.md.
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
Next action: queue item 0, the harness speed pass (builder running), then item 1.
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

- [ ] 0 Reconcile the design and the prototype: 0b done (design caught up, U1-U19 ruled); 0a's round 14 fix pass stopped for hand-off
- [ ] 1 Pre-work prototype (entities, streams, migration; round 13's H1 and H2): not started
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
  - M5 moved to phase 2, and the H1/H2 fixes are named in the prototyping constraint;
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
