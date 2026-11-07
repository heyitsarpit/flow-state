# Progress: Flow State v3 production

## Resume

A fresh context reads, in order:
1. `AGENTS.md`, then the memory index
   `/Users/arpit/.claude/projects/-Users-arpit-Developer-flow-state/memory/MEMORY.md` and the files
   it points to;
2. `workflow/roadmaps/v3-production/roadmap.md`;
3. this file;
4. `FOR-ARPIT.md` from git (`git show 04e314f4:packages/flow-state-v3/prototypes/FOR-ARPIT.md`; accepted
   on 2026-11-07, deleted), then `packages/flow-state-v3/prototypes/HANDOFF.md`
   ("Where it stopped") and `packages/flow-state-v3/prototypes/round-13/review.md`;
5. the roadmap skill, `/Users/arpit/Developer/workflow/skills/suites/workflow/roadmap/SKILL.md`;
   other pinned packages only when the roadmap's triggers fire.

First action: the same as Next action below.

Roadmap: roadmap.md
State: running: approved 2026-11-07; phase 0, iteration 1 (round 14)
Phase: 0 (reconcile the design and the prototype), iteration 1 running before approval, at the user's
request: prototype round 14. Revision: see `git log` on `flow-rewrite`
Budget used: none of the proposed total
Next action: take round 14's results (the merged OD28-OD31 on the prototype and suite) and continue
phase 0: record the prototype's newer decisions (D1-D222, api-changes, FOR-ARPIT's accepted calls and answers) in
machine-design.md, then review. The plan merge (now phase 2) and its label round come after phases 0
and 1.
Waiting on the user:
- phase 0's conflicts between the design and the prototype, as they are found. **Approved by the user
  (2026-11-07)**, to be written into machine-design.md in phase 0; from the round-14
  review at `48d1dc46`: D1 an end parks `Interrupted` for each read it stops (user's call); D4 the ref
  form fixed per machine in the types, identity encoded with its Schema (user's call); D2 re-arming or
  leaving removes a waiting deadline; D3 a return mints a new incarnation id; D5 a local actor's
  remount within the grace; D6 whether `disposeActor` still parks endings; D7 `getSnapshot` for an
  undecodable record (all approved). **Recorded** in machine-design.md as OD45 (phase 0b, `d1117383`);
- phase 0's label round on the user-judged conflicts of the design catch-up, U1-U18 in
  `workflow/plans/flow/references/proposals/design-catch-up/change-list.md` (none decided; recommendation after each):
  - U1 operation timeouts: keep the design, the timeout is the commit's Effect (this overturns the user's own remark
    of 2026-11-01, "rule 25 is cancelled, timeouts return");
  - U2 key-less members: name the ending's own Attempt only (prototype);
  - U3 restore order within a lane: `W`'s `NotSent { Restored }` first, then the head's unknown (prototype);
  - U4 a lane whose key no longer decodes: quarantine it, keep the hold, cut key-equality adoption (prototype);
  - U5 `concurrency: "allow"`: cut from v1, text to `revisit.md`;
  - U6 values that cannot be encoded: `NotSent { Unencodable }` and `UnencodableValue`, encoding never fails a turn
    (prototype);
  - U7 a module's defect: settle in phase 1 with the entity store;
  - U8 sends before ready: queue until boot (prototype);
  - U9 creation checks input by its type side, no transforming decode (prototype);
  - U10 rule 32: Q7 A's two levels of doubt, written in phase 1;
  - U11 entity-store decisions: defer to phase 1;
  - U12 defaults must be pure; an Effect-valued default is a construction error;
  - U13 Runtime disposal past its bound: `unknown { Disposed }`;
  - U14 `disposeActor` durability: flush the removal at once; an unbound lane record ends at an adopting ensure or
    `forget`, listed meanwhile;
  - U15 `persist`: per machine, not per ref;
  - U16 waits on storage (D30, D48, D94): no bound, the limit stated, `StorageSilent` names it;
  - U17 a new version: type and encoded side, ignoring annotations, for actors and operation keys (amends Q1 A);
  - U18 the proposed names `ReservedStateName`, `InputFieldForm`, `StorageSilent`, `RestoreMissingInput`: accept;
- phase 2's label round, then its user-judged decisions;
- which example apps to build, any time before phase 6. Candidates are below.

## Phases

- [ ] 0 Reconcile the design and the prototype: iteration 1 (round 14) running
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
| Builder, round 14 fix pass (Opus), worktree | 2026-11-08 | — | final review of `ad2a6315` |
| Builder, phase 0b design catch-up (Opus), main checkout | 2026-11-08 | — | — |

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

## Change proposals

One entry each (runner rule 4): the kind (insert, modify, split, reorder, reclassify), why, the
class, gates and misfire of anything new, the budget cost, the judge, and its state (proposed,
applied as amendment <n>, or rejected).
- (none yet)

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
- 2026-11-08 0a.1 `ad2a6315` (worktree branch): round 14 done, 822/822, lock clean, every gate green except `fragstore.row` (failing differently: an ending reached nobody after dispose and reload); 46 lifetime mutants red; D1-D7 and the mid-review fixes in. Final independent review started; phase 0b (design catches up, `proposals/design-catch-up/`) started alongside, separate write scope. Usage: not measured.
- 2026-11-08 0a.1 final review of `ad2a6315`: not merged yet. H-A: Runtime disposal pinned to `Interrupted` against Runtime O6 (two cases rewritten to the runtime); `fragstore.row` misdiagnosed (a suite-ledger gap: boot mail on a record kept at ready has no evidence, not a D6 hole); D1 lost when woken at ready; D3 unguarded; prototype call 2 departs from rule 73; persist order-dependent; 12 templated output reasons hide real differences; a lie retired on weak grounds. 0a.2 fix pass started in the worktree; the review's nine design corrections passed to phase 0b for labelling.
- 2026-11-08 0b `818bd236`, `d1117383`: design catch-up. Inventory of D1-D228, FOR-ARPIT, R14 D1-D7 and the final
  review's nine items (`workflow/plans/flow/references/proposals/design-catch-up/inventory.md`); change list applied
  to machine-design.md, 52 blocks, none skipped: OD32-OD44 (FOR-ARPIT accepted), OD45 (R14 D1-D7), OD46
  (agent-judged), plan rows C128-C146. Fifteen user-judged conflicts U1-U15 not applied, waiting for the label round.
  OD and C ids unique, links resolve; `workflow check` shows only the worktree's `DUPLICATE_SPEC_ID` and
  `SPEC_INDEX_STALE` (no `.spec` touched). Not yet reviewed by an independent agent. Usage: not measured.
- 2026-11-08 0b pass 2: an independent review upheld pass 1 with 16 findings, all applied (change-list E50-E70, 34
  blocks, none skipped): R14R 7 overturned to U17; D30, D94 and D48's wait to U16; D2 and call 19's third part
  recorded as the user's (OD47); stale reason lists fixed; `UnencodableValue` back with U6; accepted names marked
  decided, the rest batched as U18; C128, C144 fixed, C147-C149 added. OD1-OD47 and C1-C149 unique, links resolve.
  Waiting on the user: U1-U18. Usage: not measured.

