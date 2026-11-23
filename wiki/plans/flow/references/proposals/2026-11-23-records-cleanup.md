---
review records-cleanup
status open 2026-11-23
---
# Records cleanup: inventory and verdicts (2026-11-23)

**Bottom line:** 6 absorbed files are deleted now. 15 more are settled but a kept record still links to them, so they
are updated, not deleted. `wk agenda` loses 32 of its 77 open items and 13 of its 26 proposed proposals. The other 45
open items sit in files a draft Task cites, and wait
for the user's yes.

**Why now:** the algorithm and Spec rounds of 2026-11-20 and 11-21 became the v3 Specs and Tasks, and the user
authorised updating or deleting every outdated file (V3 log, 2026-11-23). Nothing is committed.

**Read first:** `AGENTS.md` ("Workflow"), skill:policy-records#deleting-absorbed-records, skill:compact-records.

## How the verdicts were reached

- **A file is deleted only when nothing that survives links to it.** `wk check` flags a dangling link in a Task, a Plan
  or a Spec, `code:` links included. Task descriptions in P4 and P5 cite proposals, and `P4.task` takes `wk edit`
  comments only while the run is live. Plans change only with the user's yes. What a kept file links is pinned too.
- **Kept untouched:** `capability-gaps`, `loop-findings`, every proposal a draft or open Task cites, and what they link.
- **Evidence:** `wk refs`, `grep` for the name and the file name, V3 and Spec log notes, Task status.

## Delete (absorbed): 6 files

| File (in `proposals/`)              | Last commit | Absorbed in                      |
| ----------------------------------- | ----------- | -------------------------------- |
| 2026-11-11-invariant-audit.md       | 3a84b878    | @task.V3.T41, @task.V3.T42       |
| 2026-11-16-conventions.md           | c3fd18e6    | `wiki/conventions/`              |
| 2026-11-17-fixture-catalog-check.md | 3a84b878    | @convention.fixture-catalog      |
| 2026-11-19-rules-cohesion.md        | 3a84b878    | @plan.Rules, @task.V3.T106       |
| 2026-11-22-review-specs.md          | 9fda6b6d    | specs.log notes of 2026-11-21    |
| 2026-11-22-review-tasks.md          | 37e70116    | P4 Order, R48 comment 2026-11-22 |

- **invariant-audit:** its verdict (cut 18, reword 7, resolve 26 conflicts) is what @task.V3.T42 "Core Specs revised
  from the Invariant audit and the open rulings" delivered; T41 is the coverage gate. No tags, no links in.
- **conventions:** accepted; the folder exists with README and 12 pages. Its decision 4 is already a deferral in
  revisit.md. Links to fix: `conventions/README.md:27` and `revisit.md:117`.
- **fixture-catalog-check:** it judged the first catalog; @task.V3.T82 and @task.V3.T86 (done) rebuilt it. Link to
  fix: `conventions/fixture-catalog.md:20`.
- **rules-cohesion:** frontmatter says merged 2026-11-20 into @task.V3.T106. No link in.
- **review-specs:** blockers B1 to B7 and minors M1 to M6, M8 to M10, M12 to M14 are each answered by a specs.log note
  of 2026-11-21T19:39Z to 19:48Z. M7 and M11 are not fixed: they move to revisit.md as a deferral.
- **review-tasks:** the blockers are the R48 breakdown review (P4 comment 2026-11-22T03:50Z) and the accepted Order.
  Minors still standing move to revisit.md: blockers on done Tasks, `@proposal.*` citations in descriptions, slice
  labels in the titles of T21 (`P4.task:373`) and T110 (`:3246`), T98 in P9 though it blocks P5 Tasks, and Host R15 with
  no Task that tests it.

## Update: 15 proposals, 1 review and 7 other records

| File (in `proposals/` unless noted) | Change                                            |
| ----------------------------------- | ------------------------------------------------- |
| 2026-11-21-algo-schedules           | merged [@spec.Schedules, @task.V3.T118]           |
| 2026-11-20-schedule-issues          | merged [@task.V3.T118, @spec.Schedules]           |
| 2026-11-21-algorithm-round          | merged [the six v3 Specs]                         |
| 2026-11-20-body-capture-settled     | merged [@spec.Types, @task.V3.T144]               |
| 2026-11-20-spec-boundary-channels   | superseded [@proposal.algo-turn]; 2 tags dropped  |
| 2026-11-20-spec-data-layer          | superseded [@proposal.algo-records]; 6 dropped    |
| 2026-11-20-spec-errors-trust        | superseded [@proposal.algo-operations]; 2 dropped |
| 2026-11-20-spec-fragments           | superseded [@proposal.algo-turn]; 4 dropped       |
| 2026-11-20-spec-reads-operations    | superseded [@proposal.algo-operations]; 3 dropped |
| 2026-11-20-spec-saved-records       | superseded [@proposal.algo-records]; 4 dropped    |
| 2026-11-20-spec-static-rules        | superseded [@proposal.algo-types]; 2 dropped      |
| 2026-11-20-spec-turn-parts          | superseded [@proposal.algo-turn]; 4 dropped       |
| 2026-11-20-spec-ui-host             | superseded [@proposal.algo-host]; 2 dropped       |
| 2026-11-20-spec-typed-machine       | superseded [@proposal.algo-types]                 |
| 2026-11-20-spec-cohesion            | resolved (spec-cohesion-r2 redid it)              |
| open-items.md                       | items 1, 4, 15: tags answered or dropped          |
| revisit.md                          | commit pointer for conventions; 3 rows appended   |
| conventions/README.md               | Source line: commit pointer                       |
| conventions/fixture-catalog.md      | line 20: commit pointer (file has live edits)     |
| references/README.md                | v3 Specs; one line for this cleanup               |
| tasks/V3/V3.log, specs/specs.log    | compacted (see "Logs")                            |

Why updated, not deleted: the four merged ones are linked by kept algo-* designs and, for T118, by `P4.task`. The nine
`spec-*` files are linked from kept algo-* designs, @review.spec-cohesion-r2 and @proposal.spec-handover. They go
with the algo-* designs once those merge (see "For the user").

## Keep: untouched, with the reason

| File (in `proposals/` unless noted)            | Why kept                                             |
| ---------------------------------------------- | ---------------------------------------------------- |
| 2026-11-23-capability-gaps                     | the user's rule                                      |
| 2026-11-22-loop-findings                       | the user's rule; epic.task:387                       |
| 2026-11-21-algo-host                           | draft T97, T111, T117, T30                           |
| 2026-11-21-algo-operations                     | draft T115                                           |
| 2026-11-21-algo-records                        | draft T112, T115                                     |
| 2026-11-21-algo-turn                           | draft T76, T109                                      |
| 2026-11-21-algo-types                          | draft T22, T112                                      |
| 2026-11-22-algo-resolutions                    | 26 places in P4, P5 Tasks, draft ones included       |
| 2026-11-22-external-rules                      | draft T106, T77; Rules.plan, Runtime.plan            |
| 2026-11-20-react-instrumentation-bippy         | draft T30, T108                                      |
| 2026-11-20-spec-handover                       | draft T21, T24; every core Spec header               |
| 2026-11-20-spec-test-tooling                   | draft T117                                           |
| 2026-11-21-spec-cohesion-r2                    | P4, P5, P9 Tasks                                     |
| 2026-11-19-alchemy-adoption                    | partial; linked by kept prover-ideas                 |
| 2026-11-17-prover-ideas                        | superseded by the partial alchemy-adoption           |
| 2026-11-15-test-system                         | partial; epic.task:24, P2, P3                        |
| 2026-11-15-test-tooling-reuse                  | epic, P2, Pending.plan:25                            |
| 2026-11-11-plan-task-coverage                  | draft P6, P8 scope lines                             |
| 2026-11-16-code-quality-review                 | `P4.task:2373`; revisit.md                           |
| 2026-11-16-code-quality-review-2               | `P4.task:2374`                                       |
| 2026-11-18-test-efficacy                       | `P3.task:579`; revisit.md                            |
| 2026-11-18-test-strategy-r2                    | partly built; items below still owed                 |
| 2026-11-19-type-coverage                       | resolved; `P4.task` (T104), 3 proposals              |
| 2026-11-19-type-gaps-deep                      | resolved; `P4.task` (T104), 3 proposals              |
| 2026-11-19-runtime-lifetimes                   | Pending.plan:280, `P4.task:2441`: for the user       |
| 2026-11-20-context-slots                       | Machines.plan:694, Pending.plan:135: for the user    |
| 2026-11-20-rules                               | linked by kept algo-resolutions                      |
| 2026-11-20-advisor-questions                   | open list; V3.log, spec-typed-machine link it        |
| 2026-11-21-algorithm-review                    | linked by kept algo-* designs                        |
| 2026-11-21-case-studies                        | linked by every kept algo-* design                   |
| 2026-11-21-code-audit                          | linked by every kept algo-* design                   |
| 2026-11-21-complexity-sweep                    | linked by kept algo-operations, -host, -turn         |
| 2026-11-21-final-review                        | linked by kept algo-resolutions                      |
| 2026-11-21-review-algo-schedules               | linked by kept algo-schedules                        |
| 2026-11-21-review-algo-host-a, -b              | unabsorbed: algo-resolutions:814 did not read them   |
| 2026-11-22-review-external-rules, -a, -b       | linked by kept external-rules                        |
| 2026-11-22-rules-exactness-inventory           | live edit; linked by kept review-external-rules-b    |
| 2026-11-22-declared-schedules-inventory        | `code:` link at `P4.task:7227` (T140, done)          |
| advisor-consult-2026-11-20/                    | the user's branch copy; prior art named by kept docs |
| body-capture-spike-2026-11-20/                 | spike output, cited by kept algo-types               |
| references/superseded.md                       | linked by references/README, kept test-tooling-reuse |
| references/usage/v3-usage-log.csv              | usage pacing input                                   |
| references/{checkout,dispatch-desk,typecheck}/ | 6 Plans and P2, P4, P5 cite them                     |
| tasks/V3/P3-coverage.md, P3-routing.md         | `code:` links from P3, P4, P5, P9 Tasks              |
| tasks/V3/T99-worktree-notes.md                 | `code:` link at `P4.task:2443`                       |
| specs/spec-split.md                            | cites @proposal.test-system                          |
| specs/v3/, specs/testing/Stories.spec          | live Specs                                           |
| conventions/ (11 other pages)                  | live; history already by `git show <hash>`           |

`wiki/specs/core/*.spec` (10 files, all superseded) are kept: a Plan, the live `Stories.spec` or a draft Task cites
each.

Still owed from test-strategy-r2 (in no Task, not in revisit.md): the stress reload sweep and the dispose mode for the
reload pass, the double-reload merge into one run rule, the deep files moved to stress, the measured stress kill matrix,
and context-order equivalence. The pair sweep and the fork from a cut are built (@task.V3.T83, @task.V3.T90).

Stale text found, not fixed (Spec files belong to the live run): `Types.spec:919` says the body capture "is not built";
specs.log 2026-11-22T11:00Z and T144 say it is built. The last specs.log note (2026-11-23T07:41Z) still says
`resource.write(key, data)`; the user replaced it with `read.set` and `read.update` the same day (V3.log, @plan.Pending
D41). The first is in the revisit.md row on Spec minors; the second is only reported; both notes stay as written.

## Open items

| Where                                     | Count | Verdict                                                          |
| ----------------------------------------- | ----- | ---------------------------------------------------------------- |
| deleted files                             | 0     | none carries a live tag                                          |
| nine spec-* proposals                     | 29    | `dropped`: redone in the algo-* design the file is superseded by |
| open-items.md item 1                      | 1     | `answered`: its own text says Resolved 2026-10-29                |
| open-items.md item 4                      | 1     | `dropped`: v4 text deleted; @spec.Operations keeps `unknown`     |
| open-items.md item 15                     | 1     | `answered`: its own text says absorbed by the streams merge      |
| algo-host 9, records 12, turn 13, types 8 | 42    | untouched; for the user                                          |
| spec-handover consult-gaps                | 1     | untouched; for the user                                          |
| advisor-questions 8 and 10                | 2     | untouched; the advisor consult answers them                      |

The 29 are settled by the user's answers of 2026-11-22 (V3.log 2026-11-21T20:14Z: all 36 open calls as recommended;
specs.log 2026-11-21T20:12Z: Types, Changes, Host, Operations and Records questions answered A) and by the algo-*
designs, which each name the departure from a `spec-*` call. The `spec-errors-trust` PD4 answer is in algo-operations
(item 10) and algo-resolutions, not in a Spec.

Moved to `revisit.md`, three rows: the record sweep after P4 (review-tasks minors, plus deleting the pinned proposals);
the Spec wording minors M7 and M11 of review-specs; the open test-strategy-r2 items above.

## Logs

| Log             | Before | After | Rule                                                                   |
| --------------- | ------ | ----- | ---------------------------------------------------------------------- |
| tasks/V3/V3.log | 963    | 590   | keep user decisions, amendments, pointers; drop progress; last 20 kept |
| specs/specs.log | 836    | 779   | drop superseded chains and housekeeping; keep every Why and Reverse    |

specs.log is mostly Why and Reverse notes on the ten superseded core Specs. Collapsing them by subject needs each one
replayed against the code, which was not done; this pass dropped only notes a later note replaces.

## For the user (not done here)

| Record                              | Edit                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------ |
| Machines.plan:694, Pending.plan:135 | replace @proposal.context-slots by a commit pointer, then delete it            |
| Pending.plan:280                    | same for @proposal.runtime-lifetimes (and `P4.task:2441`)                      |
| Rules.plan (6), Runtime.plan:53     | when external-rules merges: point at @spec.Types and @spec.Host                |
| 10 Plans citing core Specs          | repoint to the v3 Specs, then delete `wiki/specs/core/`                        |
| algo-host, -records, -turn, -types  | answer the 42 tags as recommended, set merged, then delete with the pinned set |

## Reviewer findings

A Sonnet reviewer read this inventory against the records. Each finding was checked here.

1. **body-capture-settled is not merged (specs reversed it): rejected.** specs.log 2026-11-22T11:00Z and 14:10Z reverse
   the 2026-11-21 note; `Types.spec:32`, `:261` and `src/machine.ts` agree the body is captured; only `Types.spec:919`
   is stale.
2. **declared-schedules-inventory has a `code:` link at `P4.task:7227`: accepted.** grep confirms; moved to keep.
3. **test-strategy-r2 is only partly absorbed: accepted.** The stress sweeps are still in the tree; moved to keep.
4. **review-specs M7 and M11 are not fixed: accepted.** A revisit row carries them; the file is still deleted.
5. **review-tasks has more standing minors: accepted.** Title labels at `P4.task:373` and `:3246` joined the row.
6. **`@proposal.spec-cohesion-r2` should read `@review.`: accepted.** Fixed.
7. **spec-errors-trust PD4 is in no v3 Spec: accepted.** Worded as redone in the algo-* design.
8. **alchemy-adoption is not cited by T106: accepted.** The reason is corrected.
