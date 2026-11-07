# Roadmap: Flow State v3 production

Status: proposed. Not yet approved by the user. A runner never starts an unapproved roadmap.
Shape confirmed: 2026-11-04, in the Claude Code session. The user gave points 1-10: plans first,
conformance rewritten, the core, features, Next.js hardening, examples and docs.
Goal: production code for Flow State v3 at high quality, with good error messages and the
correctness guarantees the prototypes proved, plus example apps and generated documentation.
Runner: agent, until a stop (proposed). Claude coordinates and starts builders and reviewers.
Built from: suite commit `ae99594079459f68f75ed3b13fa5fba0d4ab3b33`
(`/Users/arpit/Developer/workflow/skills/suites/workflow`), plus uncommitted edits to `roadmap/`,
`policy-delegation/` and `ONBOARDING.md` made on 2026-11-04. Until the user commits them, the pin
is that commit plus those files as they stand.
Records:
- Plans: `workflow/plans/flow/*.plan` (stale until phase 1).
- Design: `workflow/plans/flow/references/explorations/machine-fragments/machine-design.md`.
- Open proposals: every file under `workflow/plans/flow/references/explorations/` not marked
  merged or superseded, and `packages/flow-state-v3/prototypes/round-9/entity-proposal-2.md`.
- Prototype record: `packages/flow-state-v3/prototypes/FOR-ARPIT.md`, `HANDOFF.md`,
  `convergence-1.md` to `convergence-13.md` and `round-13/review.md`, all in that folder.
- Epic, Specs and Tasks: none yet. Specs are written in phase 1. Tasks are drafted with `to-task`
  at the start of phases 4 and 5; drafting Tasks is not a plan edit.
Source of truth, by area:
- Until phase 1 merges the plans, the latest prototype is authoritative for everything it built:
  `packages/flow-state-v3/prototypes/round-13/` and `packages/flow-state-v3/prototypes/conformance/`,
  with the decisions in the prototype record above.
- For everything the prototype never touched, the plans and the design are authoritative.
- Code style: `AGENTS.md`, section "Code style (v3 production)", and
  `tools/lint-bomb/FLOW-STATE.md`.
Locations: the production package is `packages/flow-state-v3/src/`, and the new conformance suite
is `packages/flow-state-v3/conformance/` (proposed; the user decides at phase 3's layout stop).
Example apps go in a top-level `examples/` folder. They import the v3 package; its published name
is decided at release, and is not the frozen `packages/flow-state/`.
Progress: progress.md, beside this file.

## The user's constraints

Each constraint has its source, date and scope. A step that contradicts one is a defect: stop and
log it.
- No new prototyping, except in phase 2: entities, streams, record migration, and round 13's H1
  and H2. Production work may converge again (session, 2026-11-04; whole run).
- The plans are stale. Merge the design and the open proposals into them, find and mark every
  decision the prototype superseded, and keep the plans where the prototype never went. Merging
  is approved (session, 2026-11-04; phase 1, and phase 2's results, 2026-11-07).
- Conformance is rewritten cleanly as a new suite, copying what is clean. It is ported first and
  runs against the prototype runtime and the new one. Only the latest conformance and prototype
  are used (session, 2026-11-04; phase 3).
- The core is written cleanly, with the prototype open beside it. Reading and copying ideas is
  expected; the prototype folder never becomes the package (session, 2026-11-04; phase 4).
- New features are built from the finished plans, with CLI outputs that are well formatted and
  well considered (session, 2026-11-04; phase 5).
- UI is React and Next.js only. Electron is out (session, 2026-11-04; whole run).
- TanStack DB integration is out (session, 2026-11-03; whole run).
- Docs live in `apps/docs/`, written in the source in Effect's shape: a summary, When to use,
  Details, Gotchas, named runnable examples, and `@see`. They are generated to Markdown, with long
  guides beside the package. Prose, not type annotations. Example apps are linked from the docs
  (session, 2026-11-04; phase 7).
- Example apps go in `examples/` and are built with Next.js. Each explains what it demos, with a
  write-up and tooltips that show a feature as it happens, and one demos Story presentation
  (session, 2026-11-04; phase 6).
- Code style follows `AGENTS.md`: lint-bomb's style; the core is plain TypeScript, pure,
  synchronous and deterministic, returning work as data; Effect is used at the host and edges.
  Doc comments go only on exported API, and lint and format are clean with zero warnings before
  finishing (session, 2026-11-04; whole run).
- Don't cite plan or invariant IDs in code. The spec owns the IDs and tests cite them (session,
  2026-11-04; whole run).
- Commit locally with explicit paths; never push (AGENTS.md; whole run).
- Ask the user in numbered rounds, and never present a recommendation as decided (AGENTS.md;
  whole run).
- One or two agents at a time by default; limits must last the project (memory, 2026-11-03;
  whole run).
- No fixed time caps. Review at each 60-minute checkpoint while the builder keeps going (memory,
  2026-11-02, widened 2026-11-03; whole run).
- Deterministic work runs up to 8 processes in parallel, about 16 GB in total. Real-browser runs
  and benchmarks run alone (memory, 2026-11-04; whole run).
- Kill your own stray processes by exact pid; never the user's (memory, 2026-11-04; whole run).
- Business keys for money (`packages/flow-state-v3/prototypes/round-8/RESULTS.md`; whole run).
- Entities are optional but not up for cutting (memory, 2026-11-01; whole run).
- No tla-ts (memory, 2026-11-03; whole run).
- Usage: the 90% weekly stop was lifted for the prototypes (memory, 2026-11-03; prototypes only).
  For production, see question R3.

## Glossary

- **Gate:** a check a phase relies on, which counts only if it has been seen failing on a wrong
  implementation (runner rule 6).
- **Lie:** a deliberately wrong runtime that a named check must catch. Lies live in
  `packages/flow-state-v3/prototypes/conformance/falsify.ts`, part `lies`.
- **Falsify:** the gate that runs every gate against null, broken, tampered and lying runtimes
  (same file).
- **Mutant:** a one-change copy of the runtime that the suite must kill
  (`packages/flow-state-v3/prototypes/conformance/mutate-one.ts`).
- **Graph gate:** `flow graph` checked against every transition the runtime is seen to take, in
  both directions (`packages/flow-state-v3/prototypes/round-13/RESULTS.md`).
- **Four-angle audit:** auditing a suite from four angles, each by an agent with no prior reading:
  harness bugs, false assumptions about reality, assumptions so narrow that a correct variation
  fails, and missing requirements (`policy-testing`).
- **Same class:** failures with the same root cause, as named in one sentence in the failure
  ledger.
- **Failure ledger:** the table in progress.md: part or gate, root-cause class, failure count,
  last revision, state.
- **`listen.load`, `fragstore.row`:** two entity searches in
  `packages/flow-state-v3/prototypes/conformance/search/` that fail today (round 7 onwards).
- **H1, H2, M5:** findings in `packages/flow-state-v3/prototypes/round-13/review.md`.
- **The Pay path:** checkout's Pay machine, `packages/flow-state-v3/prototypes/conformance/typed/pay.ts`,
  run end to end through the public API.
- **Safari's four requirements:** host adapter requirements in
  `packages/flow-state-v3/prototypes/safari/RESULTS.md`, listed in `HANDOFF.md`.
- **Issue catalog:** every issue the runtime raises, each with a name, a cause and a next step,
  generated from the code.
- **Packed-consumer check:** installing the exact published tarball in a fresh project and
  importing every public route.
- **Final-commit gates:** gates too slow for every commit (the full lie run, searches,
  real-browser runs), run before a phase's final commit.
- **`watch.ts`:** the process watchdog, `packages/flow-state-v3/prototypes/conformance/watch.ts`.

## Stops and the review queue

A blocking stop halts the run until the user answers. There are only these: phase 1's question
rounds, public entrypoint names, a public API change beyond what the user accepted, a guarantee
that can't be met, a feature call only the user can make, picking the example apps, the docs
criteria, a finding whose fix changes a guarantee, the real-phone run (that item only), and each
ship stage.

Everything else is a review: the runner records it under "Calls for the user's read" in
progress.md, with its reason, evidence and how reversible it is, and keeps working. The user works
through the queue at their own pace, ideally daily, and may overrule any item. Overruling late
costs rework of what was built on the call; the runner names that cost in each entry.

## How to run

Repeat until a stop. Reread this file, progress.md, and the current phase's records. Do one
iteration of the current phase. Put results in the records and the run's state in progress.md.
When the phase's done condition holds, get the completion audit from an agent that did not do
the work. On PASS, start the next phase if Authority allows it; otherwise stop.

## Stages and gates

| Stage | Phases | Gate to the next stage |
| --- | --- | --- |
| A. Settle | 1, 2 | Plans merged and marked; phase 2 settled entities, streams and migration |
| B. Suite and core | 3, 4 | The new suite audited and green on both runtimes; the core passes it alone |
| C. Features | 5 | Each feature's slice audited, then green on production |
| D. Examples and docs | 6, 7 | Example apps run in real browsers; docs generated from source |
| E. Hardening and release | 8, 9 | Budgets met and findings swept; release as far as the user asks |

## Phases

Methods are pinned at `/Users/arpit/Developer/workflow/skills/suites/workflow/NAME/SKILL.md` (see
"Built from"). Open one only when its trigger fires.
- `policy-convergence`: when the failure ledger says to converge.
- `policy-testing`: when building or auditing a suite.
- `review`: at each 60-minute checkpoint and at a round's end.
- `check-task` and `check-runtime`: at acceptance.
- `check-benchmark`: on any performance number.
- `interview`: for every question round.
- `to-task`: when drafting Tasks.

### 1. Plan merge: not verifiable goal

Goal: current plans, and Specs for production. The design, the open proposals and the prototype's
decisions are merged into the plans. Every superseded decision is found and marked with a pointer
to its replacement. The plans keep their content where the prototype never went. Specs record the
guarantees (`to-spec`), so later phases test what is supposed to happen.
Verified by: the user's judgment, `workflow check`, and an audit that compares each merged rule
with the latest decision that touches it.
Gates relied on: `workflow check`. Fails on: a record with a broken reference or schema.
Falsified by: running it on a deliberately broken copy of one plan.
One iteration: one plan or area. List the edits as before and after, with the decision behind
each. Apply them, under the user's approval of the merge, and run `workflow check`.
Done when:
- every `.plan` the prototype touched is merged;
- every superseded decision is marked;
- Specs exist for each production area;
- `FOR-ARPIT.md`'s 20 calls and Q1-Q8 are answered, or listed as open;
- no plan text claims a decision the user didn't make;
- `workflow check` passes.
Blocking: each question round. Reviews: a page listing what changed, at the end.
Could succeed at the wrong thing by: merging from the stale design where the prototype replaced
it, or recording a recommendation as decided. Caught by: the audit, rule by rule, against the
latest convergence decision and the user's words.
Budget: up to 10 merge iterations and 3 question rounds; small usage (no builders).
Steps:
- Ask `FOR-ARPIT.md` Q1-Q8 first, since Q1 and Q2 block the most work. Then the 20 calls, then
  the remaining open calls. The services choice is settled: a required `services` list on every
  operation (Q2 B, 2026-11-07).
- Merge one plan or area per iteration, with `workflow check` after each.
- Write the Specs last, from the merged plans.

### 2. Pre-work prototype: not readily verifiable goal

Goal: the last prototyping, for entities (`packages/flow-state-v3/prototypes/round-9/entity-proposal-2.md`),
streams, and persisted record migration across deploys. Also round 13's H1 (a default
computed once) and H2 (key versions told apart by field names only), so the prototype the new
suite ports from is right. Settle round 13's M5 (a cancel inside its own unknown handler) from its
traces.
Verified by: each area's suite slice, test first, audited against lies, with a review at each
60-minute checkpoint and a final independent review.
Gates relied on: the suite, falsify, lies, the graph gate, the reference model. Fails on: a null,
broken or lying runtime. Falsified by: `packages/flow-state-v3/prototypes/conformance/falsify.ts`,
each part.
One iteration: one round on one area, building against its slice.
Done when:
- each area's design is settled and recorded in the plans, listed for the user's read;
- its slice passes and is audited;
- `listen.load` and `fragstore.row` pass;
- H1 and H2 are fixed and pinned;
- M5 is settled, or listed for the user.
Blocking: none. Reviews: each area's settled decisions, and one page at the end, in the review
queue.
Could succeed at the wrong thing by: designs that fit the harness but not real apps. Caught by: one
path per area that takes the data from a real source, such as a real `fetch` or SDK call.
Budget: up to 6 rounds per area and 15 in total; stop after 2 same-class failures after
convergence.

### 3. Conformance rewrite: readily verifiable goal

Goal: a new, clean conformance suite at production code quality, running against both the
prototype runtime and the new one.
- **Copy, mostly as they are:** fixtures and typed machines, scenarios, the reference model, the
  lies, and the fake world's behaviours.
- **Rewrite:**
  - the runner, the ending ledger and oracles (`drive.ts`, `scenarios/ctx.ts`, `main.ts` in the
    prototype's `conformance/`);
  - the lock and reporting;
  - `legacy.ts` and the hand-`Compiled` shims;
  - the text formats the harness parses.
- **Shape:**
  - one `Port` interface, with a prototype adapter and a production adapter;
  - one oracle module per guarantee, each with its lie beside it;
  - a scenario DSL that never touches internals;
  - the fake world split by host: storage, network, lifecycle, clock;
  - one runner for the suite, lies, searches and mutants, with `--parallel`;
  - falsify built in;
  - lint-bomb clean.
Verified by: the new suite green on the prototype runtime with the old suite's verdicts, every
gate falsified, a four-angle audit and re-audit, and a final review.
Gates relied on: the new suite, falsify, lies, mutants, the graph gate. Fails on: a null, broken or
lying runtime. Falsified by: the new suite's own falsify part, run on every final commit.
One iteration: one part of the suite: rewrite, run on the prototype runtime, compare verdicts.
Done when:
- the new suite passes on the prototype runtime;
- it catches every lie the old suite catches;
- it passes its re-audit;
- its fast gates run in `nub run verify`.
Blocking: none. Reviews: the suite's location and layout (the runner decides; the user may
overrule), its first audit pass, and the end.
Could succeed at the wrong thing by: agreeing with the old suite because it was copied, weaknesses
included. Caught by: the four-angle audit on the new suite, not the old one.
Budget: up to 12 rounds; stop after 2 same-class failures after convergence.

### 4. Core: readily verifiable goal

Goal: the production runtime for what the prototypes proved, written cleanly with the prototype
open beside it, one module at a time:
1. `Compiled` and the compiler, from the public API;
2. lane, step and turn;
3. the persistence edge, write-ahead and the driver;
4. restore and key versions;
5. fragments;
6. operations;
7. the CLI's `check`, `explain` and `graph`.
Verified by: the new suite on the production runtime, every gate, lint with zero errors and
warnings, `check-task` per module, and the final review.
Gates relied on: as phase 3, plus lint. Fails on: a broken runtime, and a lint violation. Falsified
by: the suite's falsify part, and a probe file per lint rule.
One iteration: the next ready Task: build, check independently, repair. Draft the Tasks first, with
`to-task`. Then make one narrow path work end to end: the Pay path.
Done when:
- the suite passes on the production runtime alone, with the prototype adapter retired;
- every gate fails on its broken runtime;
- `nub run verify` passes;
- the completion audit passes.
Blocking: public entrypoint names; a public API change beyond what the user accepted; a guarantee
that can't be met. Reviews: the internal module layout (the runner decides) and the end.
Could succeed at the wrong thing by: the production adapter doing work the runtime should. Caught
by: lies and mutants against the production adapter, and a review section on the adapter's role.
Budget: up to 25 rounds; stop after 2 same-class failures after convergence.

### 5. Features: readily verifiable goal

Goal: production code for the features outside the core, built from the finished plans:
- the entity store;
- streams;
- record migration;
- multi-tab and sessions;
- host adapters (IndexedDB with Safari's four requirements, and in-memory);
- Stories with `flow story` and `flow trace`;
- React and Next.js bindings;
- CLI outputs designed for people: source locations, a trace that reads like a story, a graph
  grouped by state, and messages from the issue catalog.
Verified by: each feature's slice, audited; real-browser runs in Chrome and Safari; reviews.
Gates relied on: as phase 4, plus each feature's lies. Fails on: a feature-specific lie. Falsified
by: each slice's falsify entries.
One iteration: the next ready Task of the earliest feature. Up to two features may run in parallel
once the core is stable, or up to four if the user allows (R4).
Done when: each feature's slice passes on production after its audit, and the user accepts the CLI
outputs.
Blocking: a feature whose plan has an open call that only the user can make. Reviews: the CLI
output mocks, batched for one review, and the end.
Could succeed at the wrong thing by: a slice too lenient to fail. Caught by: lying implementations
in each feature's audit.
Budget: up to 8 rounds per feature and 40 in total; stop after 2 same-class failures after
convergence.

### 6. Example apps: not verifiable goal

Goal: medium-sized Next.js example apps in `examples/`, each importing the v3 package, each a
striking demo that explains what it shows. One demos Story presentation. Which apps is the user's
pick (candidates in progress.md). They also drive conformance runs and benchmarks.
Verified by: the user's judgment. Each app builds, lints, runs its Stories, and works in real Chrome
and Safari.
Gates relied on: each app's Stories in `nub run verify`. Fails on: a broken Story. Falsified by: one
deliberately broken Story per app.
One iteration: one app's next slice, reviewed, then shown to the user.
Done when: the user accepts each app.
Blocking: picking the apps, answerable any time before this phase. Reviews: each app's first
working version.
Could succeed at the wrong thing by: a demo that hides the guarantee it claims to show. Caught by:
the user's review against the app's own write-up.
Budget: up to 6 rounds per app.

### 7. Documentation: not verifiable goal

Goal: docs in `apps/docs/`, written in the source in Effect's shape and generated to Markdown, as
`@effect/docgen` does with `codebases/effect-v4/packages/effect/docgen.json`, with every example
type-checked and some run as tests. Long guides sit beside the package, as
`codebases/effect-v4/packages/effect/SCHEMA.md`, and pull checked snippets from phase 6's example
apps. The issue catalog is generated from the code. The example apps are linked from the docs.
Verified by: the user's judgment against criteria written first. The checkable part:
- every example compiles;
- the generated Markdown is current in `nub run verify`;
- a fresh agent, given only the docs, builds a small feature whose Story passes.
Gates relied on: example type-checking, and generated-docs freshness. Fails on: an example that
doesn't compile, and a stale page. Falsified by: one deliberately broken example and one stale
page.
One iteration: draft or revise one section, get an independent review, then put open choices to
the user as numbered questions.
Done when: the user accepts each section, and the checkable part passes.
Blocking: the docs criteria, once. Reviews: each section's draft.
Could succeed at the wrong thing by: documenting the planned API rather than the built one.
Caught by: examples compiled against the packed package.
Budget: up to 3 rounds per section.

### 8. Hardening and budgets: readily verifiable goal

Goal: the whole system tested inside the real Next.js example apps in Chrome and Safari (and an iOS
simulator), with production performance and bundle budgets met on named devices, and every finding
from every round given a disposition.
Verified by: real-browser runs; `check-benchmark` on baselines and finals; a harness-only review by
an agent with no prior reading; tamper checks; the final review.
Gates relied on: the suite, the real-browser runs, the benchmarks. Fails on: a broken runtime, and a
deliberately slowed build. Falsified by: falsify and one slowed build per budget.
One iteration: one finding group or one budget.
Done when:
- budgets are met on their devices;
- every finding has a disposition;
- quota and disk durability are measured on a real phone, run by the user, since an agent here
  reaches only browsers and a simulator;
- `nub run verify` and the final-commit gates pass.
Blocking: the real-phone run (only that item; other work continues); a finding whose fix changes a
guarantee. Reviews: budget targets, which the runner proposes from the baselines, and the end.
Could succeed at the wrong thing by: closing findings as "dropped" to finish. Caught by: the audit
checking each drop's reason against the spec.
Budget: up to 10 rounds; budget targets set by the user after baselines.

### 9. Release: small ticket

Goal: the package published, only as far as the user asks.
Verified by: the packed-consumer check on the exact tarball, `nub run verify`, and an independent
review of the release change.
Gates relied on: the packed-consumer check. Fails on: a route missing from the tarball. Falsified
by: packing with one entrypoint removed.
One iteration: implement, check independently, repair.
Done when: acceptance passes at the final revision, and each requested ship stage is confirmed.
Blocking: before each ship stage (publish, land, tag).
Could succeed at the wrong thing by: publishing a package whose installed form differs from what
was tested. Caught by: the packed-consumer check.
Budget: one Task.

## Authority

By default: read, edit within the phase's scope, run checks, repair own defects, update records.
Also allowed, by the user's approval of this roadmap:
- commit locally to `flow-rewrite` with explicit paths; never push;
- start builder and reviewer agents as the Agents section says;
- apply the plan merge in phase 1 (approved 2026-11-04), and write the Specs;
- record phase 2's settled designs in the plans;
- draft Tasks with `to-task`;
- start the next phase after its audit passes, unless it starts with a stop for the user.
Runner decides: design calls in phases 2-5 and 8, recorded with reasons in progress.md for the
user's read.
User decides (blocking): public entrypoint names, public API changes beyond what was accepted,
relaxing a gate, plan edits beyond the approved merge, scope, budgets, the example apps, and running
more than two agents at once.
Runner decides, then reviews: the suite's location and layout, the internal module layout, and
budget targets proposed from baselines; each goes to the review queue and the user may overrule.
Everything else still needs the user.

## Agents

- Builders: Opus, medium effort, every third round high. Reviewers: Opus, high; never the builder.
- Agents at once: 2 by default, a builder and its reviewer; up to 4 in phase 5 if the user allows
  (R4).
- Processes at once: up to 8 deterministic processes, about 16 GB in total, after checking
  `vm_stat`. Always alone: real-browser runs and benchmarks.
- Review interval: 60 minutes on the latest committed checkpoint; a trigger, never a stop. Time
  cap: none. Builders commit a checkpoint and status file about every 50 minutes.
- Command bound: `watch.ts --seconds N` or `perl -e 'alarm N; exec @ARGV' --`, each command under
  5 minutes. Never read stdin unfed (`</dev/null`; `cat` is `bat`). Create and edit files only with
  the Write and Edit tools.
- Each brief stands alone: the goal, the steps and checks it needs, the write scope, the budget,
  these values, the user's constraints that apply, and what to return.
- Within a minute of starting, confirm each agent is doing something. After that, compare its
  progress with what its brief expected; stop or replace one that has stalled.

## Budget

Total: the round caps per phase above, about 120 rounds. Running out is a stop, not success.
Pace: one builder and one reviewer at a time. Usage is measured against the weekly limit on the
user's plan; check it between agents and log it every iteration. Reserve: 5% of the weekly limit,
kept for the user: stop at 95% (R3 A).

## Decisions about this run

Confirmed by the user (2026-11-04 unless dated): every item in "The user's constraints", the shape
above, and the plan merge. Round 1, on 2026-11-07:
- Stops block only where the work can't go on without the user; everything else goes to a
  non-blocking review queue (Q1 A). See "Stops and the review queue".
- Every operation declares a required `services` list, checked against the commit's `R` (Q2 B).
- Phase 2 fixes round 13's H1 and H2 in the prototype before the suite is rewritten (Q3 A, R2).
- No weekly stop; a 5% reserve is kept for the user (Q4 A, R3).
- Phase 2's settled designs go straight into the plans, listed for the user's read (Q5 A, R6).

Proposed, as questions (answer `R1 A`):
- **R1.** Phases as above, nine phases in five stages, with examples before docs because the docs
  pull snippets from the examples. A: accept. B: change. Rec. A.
- **R4.** Runner and parallelism. A: Claude as an agent runner until a stop, with up to 4 agents in
  phase 5. B: the same, with 2 agents throughout. C: you run one phase at a time. Rec. A.
- **R5.** Lint choices in `tools/lint-bomb/FLOW-STATE.md`. A: accept. B: change. Rec. A.
- **R7.** The round caps above, about 120 in total. A: accept. B: change them. Rec. A.

## Runner rules

1. **Reread every iteration.** Start each iteration by reading `roadmap.md`, `progress.md`, and
   the records the phase names. Trust the files, not memory, so a fresh context loses nothing.
2. **Run only an approved roadmap.**
3. **Write only `progress.md` of the two roadmap files.** It holds the run's state: phase,
   iteration, revision, verdicts, budget used, the failure ledger, the agents running, the calls
   for the user's read, next action, and what the run waits on. Results go to the project's
   Plans, Tasks, and Specs.
4. **Never edit `roadmap.md` or change a phase's class.** If the roadmap looks wrong (the wrong
   class, a check that cannot be built, the named misfire happening, a step that contradicts one
   of the user's constraints), stop and write the proposed change in `progress.md`.
5. **Never weaken a check to pass it.** An expected result changes only for a specific reason,
   logged in the record that owns it. Relaxing a check, target, or budget needs the user.
6. **Count only gates that can fail.** A gate counts only if it has been seen failing on a wrong
   implementation at the current harness revision. A change to the harness or suite triggers its
   re-audit before its verdicts count.
7. **Converge instead of patching.** Update the failure ledger every iteration. When one part
   fails twice, when a fix moves a failure one step further on, or when reviews repeat a kind of
   finding, stop patching and converge (`policy-convergence`): gather every finding, list every
   dimension the part must cover, and redesign once. This holds for suites as well as code.
8. **Fix the last review's findings first,** then take the next planned step.
9. **Review on time.** Before waiting on an agent, set a wake for its next review. On every wake or
   reread, a review that is overdue runs now, on the latest checkpoint or a snapshot of the
   working tree, and is logged as missed. Each round or phase ends with an independent final
   review of its last commit, before the completion audit.
10. **Audit before done.** A phase is done only when an agent that did not do the work checks its
    done condition against the evidence, in a fresh context, tries to break it, and passes it.
    Self-checks do not count.
11. **Act within authority.** Read, edit within the phase's scope, run checks, repair your own
    defects, and update records. Do anything else, such as committing, pushing, deleting work you
    did not create, or widening scope, only if the Authority section lists it. Record each call you
    make under delegation in `progress.md`, for the user's read.
12. **Keep agents and processes clean.** Before each wait, check for your own stray processes and
    stop them by exact process id, after checking their parent chain. Never stop the user's own
    processes or anything by name.
13. **Stop** when:
    - a phase is done and the next is not authorized;
    - a blocking stop for the user is reached (a review is not a stop: record it and go on);
    - the budget or the reserve runs out (report it as not done, with the gap);
    - a converged part fails on the same class as many times as the phase's stop count (report a
      stated limit, with the evidence);
    - in a not readily verifiable or not verifiable phase, a round produces no new decision (end
      the phase early; a readily verifiable phase ends only at its done condition);
    - a decision is the user's;
    - the roadmap looks wrong;
    - passing would mean weakening a check;
    - the user says stop.

    Record the state and the first resume action in `progress.md`.
14. **Claim only what you checked:** what ran, on which revision, and what is still unverified.
15. **Brief agents fully.** An agent you start gets a brief that stands alone: its goal, the steps
    and checks it needs, its write scope, its budget, the Agents values, and what to return.
