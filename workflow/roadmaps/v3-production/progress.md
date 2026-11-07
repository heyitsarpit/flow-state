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
  undecodable record (all approved);
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
| Builder, prototype round 14 (Opus), worktree `.claude/worktrees/agent-acee8f40b71d961fd` | 2026-11-07 | — | — |

## Calls for the user's read

Calls made under delegation before this roadmap are listed in
`FOR-ARPIT.md` section 2 (in git at `04e314f4`; accepted 2026-11-07). New calls go here, one line each: the
call, its reason, its evidence, and how reversible it is.

## Calls for the user's read (added 2026-11-07)

- Amendment 1 (cold read, wording only): the runner judged it agent-level because it only reconciles
  text with the user's own decisions; reversible by reverting `fadf004f`. Not changed, for the user's
  read: the cold read also noted that "business keys for money" binds no phase explicitly, and that
  phase 1's number of areas is implied (entities, streams, migration, H1/H2) rather than counted.

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

