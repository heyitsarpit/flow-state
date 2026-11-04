# Roadmap: Flow State v3 production

Status: proposed. It replaces the first draft of 2026-11-04 (in git at `0ecda35d`), which planned
new prototype rounds that Arpit rejected. Arpit gave its shape on 2026-11-04, and this file writes
it down; he has not yet approved this text. A runner never starts an unapproved roadmap.
Goal: production code for Flow State v3 at high quality, with good error messages and the
correctness guarantees the prototypes proved, plus example apps and generated documentation.
Runner: agent, until a stop (proposed). Claude coordinates and starts builders and reviewers.
Built from: suite commit `ae99594079459f68f75ed3b13fa5fba0d4ab3b33`
(`/Users/arpit/Developer/workflow/skills/suites/workflow`).

Records:
- Plans: `workflow/plans/flow/*.plan`. Out of date until phase 1.
- Design: `workflow/plans/flow/references/explorations/machine-fragments/machine-design.md`.
- Authority, until phase 1 is done: the latest prototype (`packages/flow-state-v3/prototypes/round-13/`) and its conformance suite (`prototypes/conformance/`).
- Prototype record: `prototypes/FOR-ARPIT.md`, `HANDOFF.md`, `convergence-1.md` to `convergence-13.md`, `round-13/review.md`.
- Lint: `tools/lint-bomb/FLOW-STATE.md`. Docs: `apps/docs/`. Examples: a top-level `examples/` folder, later.

Progress: progress.md, beside this file.

## What Arpit set (2026-11-04)

- Prototyping is over, except one short pre-work phase for entities, streams and record migration. After that, production work may converge again, but builds no new prototypes.
- The prototype and the conformance suite are the authority until the plans are merged. The plans are out of date. `machine-design.md` and the open proposals merge into them first, and every decision the prototype superseded is found and marked. Plans still fill the gaps where the prototype never went. Arpit approved the merge.
- Conformance is rewritten cleanly as a new suite, copying what is already clean. It is ported first, and it runs against both the prototype runtime and the new runtime. Only the latest conformance and prototype are used.
- The core is written cleanly, with the prototype open beside it.
- New features are built in production from the finished plans, with CLI outputs that are well formatted and well considered.
- UI is React and Next.js only. Electron is out for now.
- Docs live in `apps/docs/`. As much documentation as possible lives in the code and is generated to Markdown, to avoid drift. The example apps are linked from the docs.
- Example apps go in a top-level `examples/` folder and import the `flow-state` package. They come later. The existing `checkout` and `dispatch-desk` references don't work yet, so their state doesn't matter. Hardening runs in real Next.js apps.
- `tools/oxlint/anti-slop/` is deleted, superseded by lint-bomb (`6bd32fbb`).

## How to run

Repeat until a stop. Reread this file, progress.md, and the current phase's records. Do one
iteration of the current phase. Put results in the records and the run's state in progress.md.
When the phase's done condition holds, get the completion audit from an agent that did not do
the work. On PASS, start the next phase if Authority allows it; otherwise stop.

## Stages and gates

| Stage | Phases | Gate to the next stage |
| --- | --- | --- |
| A. Settle | 1, 2 | Plans merged and marked; the pre-work prototype settled entities, streams and migration |
| B. Suite and core | 3, 4 | The new suite audited and green on both runtimes; the core passes it alone |
| C. Features | 5 | Each feature's slice audited, then green on production |
| D. Docs and examples | 6, 7 | Docs generated from source; example apps run in real browsers |
| E. Hardening and release | 8, 9 | Budgets met, findings swept; release as far as Arpit asks |

## Method: the working practice, used by every phase

This is how the project already works. Phases point here rather than repeating it.

**Rounds.**
- A round is one builder session, test first.
- Cases are written and seen failing before the build. Each case cites the rule or decision it tests.
- The builder commits a checkpoint and a status file at about minute 50.
- At each 60-minute checkpoint, a reviewer checks it in parallel while the builder keeps going. The 60 minutes triggers a review; it is never a stop.
- A final independent review runs on the round's last commit.
- Reviewers write mutants and attacks before reading results, rerun the headline numbers, include a section on the tests, and continue the assumptions table.
- Findings are advice. The coordinator decides each one, with a reason.

**Convergence instead of patching.** This is `policy-convergence`.
- Converge when the same part fails review twice, when a fix moves a failure one step further on, when a rule grows a list of cases, or when reviews repeat a kind of finding.
- To converge: gather everything, name the root causes, redesign from the problems rather than the old draft, review once, revise once, and prove it with a check that can fail.
- The same rule applies to the test suite.

**Gates that must be able to fail.**
- Falsify, lies (targeted by default, full before a final commit), `mutate-one`, the graph gate in both directions, and the reference model (which imports nothing from the code under test).
- Each counts only if it is shown failing on a null, broken or tampered runtime.
- Recorded output is a change detector, never evidence. An expected result changes only with a logged, specific reason, and relaxing a gate needs Arpit.
- A check excuses a missing obligation only for a cause the harness observed.
- Audit the suite from four angles (harness bugs, false assumptions, narrow assumptions, missing requirements), fix from all findings at once, then re-audit.
- After phase 1, "test the spec, not the code" applies: expected results come from the merged plans, with the rule cited.

**Shell.**
- Never read stdin unfed; append `</dev/null` otherwise. `cat` is `bat`.
- Create and edit files only with the Write and Edit tools.
- Bound every command with `watch.ts --seconds N` or `perl -e 'alarm N; exec @ARGV' --`.
- Never wait on unbounded background work.
- Kill your own strays by exact pid after checking the parent chain. Never kill Arpit's processes, or anything by name.

**Parallel runs.** Deterministic work runs up to 8 processes at once, about 16 GB in total, after checking `vm_stat`. Real-browser runs and benchmarks run alone.

**Records.** Decisions go to the plans, guarantees to the specs, and work and evidence to the tasks. Never present something as decided unless Arpit accepted it. New ideas go in a new proposal file. Deferred items go in `revisit.md`.

## Phases

### 1. Plan merge: not verifiable goal

Goal: the plans current. `machine-design.md`, the open proposals and the prototype's decisions are merged in. Every superseded decision is found and marked, with a pointer to what replaced it. The plans keep their content where the prototype never went.
Verified by: Arpit's judgment, plus `workflow check`, plus an audit that compares each merged rule with the latest decision that touches it (convergence 1-13, round 13's review, Arpit's answers).
One iteration: one plan or area: list the changes (before, after, decision id), apply them under Arpit's approval of the merge, run `workflow check`.
Done when:
- every `.plan` touched by the prototype is merged;
- every superseded decision is marked;
- `FOR-ARPIT.md`'s calls and Q1-Q8 are answered or listed as open;
- no plan text claims a decision Arpit didn't make;
- `workflow check` passes.
Stops for the owner: each `FOR-ARPIT.md` question round; the end, with a page listing what changed.
Could succeed at the wrong thing by: merging from the stale `machine-design.md` where the prototype replaced it, or recording a recommendation as decided.
Caught by: the audit, rule by rule, against the latest convergence decision and Arpit's words.

### 2. Pre-work prototype: not readily verifiable goal

Goal: the last prototyping, for entities (`round-9/entity-proposal-2.md`), streams, and persisted record migration across deploys. Also round 13's open items, H1 (a default computed once) and H2 (key versions by name only), so the prototype the new suite ports from is right.
Verified by: each area's suite slice, test first, audited against lying implementations, with the Method's reviews.
One iteration: one round, using the Method.
Done when: each area's design is settled and in the plans, its slice passes and is audited, `listen.load` and `fragstore.row` pass, and H1 and H2 are fixed and pinned.
Stops for the owner: before each area's first round, to settle its decisions; at the end, with one page for his read.
Could succeed at the wrong thing by: designs that fit the harness but not real apps.
Caught by: one real fetch or SDK path per area, from the data's real source.
Budget: proposed with the area's first round.

### 3. Conformance rewrite: readily verifiable goal

Goal: a new, clean conformance suite in its own location, at production code quality, that runs against both the latest prototype runtime and the new runtime.
- **Copy over, mostly as they are:** fixtures and typed machines, scenarios, the reference model, the lies, and the fake world's behaviours.
- **Rewrite:** the runner, the ending ledger and oracles (`drive.ts`, `ctx.ts`, `main.ts`), the lock and reporting, `legacy.ts` and the hand-`Compiled` shims, and text formats the harness parses.
- **Shape:**
  - one `Port` interface, with a prototype adapter and a production adapter;
  - one oracle module per guarantee, each with its lie beside it;
  - a scenario DSL that never touches internals;
  - the fake world split by host: storage, network, lifecycle, clock;
  - one runner for the suite, lies, searches and mutants, with `--parallel`;
  - falsify built in;
  - lint-bomb clean.
Verified by: the new suite green on the prototype runtime with the same verdicts as the old one, every gate falsified, the four-angle audit and re-audit, and a final review.
Done when: the new suite passes on the prototype runtime, catches every lie the old suite catches, passes its re-audit, and its fast gates run in `nub run verify`.
Stops for the owner: the layout of the suite's package (it is API for contributors); when it first passes its audit; the end.
Could succeed at the wrong thing by: a suite that agrees with the old one because it was copied, weaknesses included.
Caught by: the four-angle audit on the new suite, not the old one.

### 4. Core: readily verifiable goal

Goal: the production runtime for what the prototypes proved, written cleanly with the prototype open beside it, one module at a time:
1. `Compiled` and the compiler, from the public API;
2. lane, step and turn;
3. the persistence edge, write-ahead and the driver;
4. restore and key versions;
5. fragments;
6. operations and services;
7. the CLI's `check`, `explain` and `graph`.
Verified by: the new suite on the production runtime, every gate, lint with zero errors, `check-task` per module, and the final review.
One iteration: the next module: build, check independently, repair. First, one narrow path end to end: Pay through the public API.
Done when: the suite passes on the production runtime alone, with the prototype adapter retired; every gate fails on its broken runtime; `nub run verify` passes; the completion audit passes.
Stops for the owner: a public API change beyond what he accepted; a guarantee that can't be met; the end.
Could succeed at the wrong thing by: the production adapter doing work the runtime should.
Caught by: lies and mutants against the production adapter, and a review section on the adapter's size and role.

### 5. Features: readily verifiable goal

Goal: production code for the features not in the core, built from the finished plans:
- the entity store;
- streams;
- record migration;
- multi-tab and sessions;
- host adapters (IndexedDB with Safari's four requirements, in-memory);
- Stories with `flow story` and `flow trace`;
- React and Next.js bindings;
- the CLI outputs designed for people: source locations, a trace that reads like a story, a graph grouped by state, and messages from an issue catalog (name, cause, next step).
Verified by: each feature's slice in the suite, audited; real-browser runs in Chrome and Safari; reviews per the Method.
One iteration: the next ready Task of the earliest feature. Up to 2-4 features can run in parallel once the core is stable.
Done when: each feature's slice passes on production after its audit, and the CLI outputs are accepted by Arpit.
Stops for the owner: before each feature, if its plan has open calls; the CLI output mocks; the end.
Could succeed at the wrong thing by: a slice too lenient to fail.
Caught by: lying implementations in each feature's audit.

### 6. Documentation: not verifiable goal

Goal: docs in `apps/docs/`, generated from source wherever possible, following Effect's approach (`codebases/effect-v4`). Every public export carries JSDoc with `@since`, `@category` and examples. A docgen step (as `@effect/docgen` with `packages/effect/docgen.json`) generates the API reference to Markdown, type-checking every example. Some examples run as tests. Guides are hand-written Markdown that pull checked snippets from the example apps. The issue catalog is generated from the code. Example apps are linked from the docs.
Verified by: Arpit's judgment against criteria written first. The checkable part: every example compiles; generated Markdown is current in `nub run verify`; a fresh agent builds a small feature from the docs alone.
Stops for the owner: the criteria; each docs section draft.

### 7. Example apps: not verifiable goal

Goal: medium-sized example apps in `examples/`, each importing the `flow-state` package. Each is a striking demo that highlights its own features, simple and to the point, built with Next.js. They also drive conformance runs and benchmarks. Which apps to build is Arpit's pick (see progress.md).
Verified by: Arpit's judgment. Each builds, lints, runs its Stories, and works in real Chrome and Safari.
Stops for the owner: picking the apps; each app's first working version.

### 8. Hardening and budgets: readily verifiable goal

Goal: the whole system tested inside the real Next.js example apps in real Chrome and Safari (and an iOS simulator), with production performance and bundle budgets met on named devices, and every finding from every round given a disposition.
Verified by: real-browser and device runs; `check-benchmark` on baselines and finals; a harness-only review by an agent with no prior reading; tamper checks; the final review.
Done when: budgets are met on their devices, every finding has a disposition, quota and disk durability are measured on a real device, and `nub run verify` passes along with the final-commit gates.
Stops for the owner: agreeing the budget targets after baselines; a finding whose fix changes a guarantee; the end.

### 9. Release: small ticket

Goal: the package published, only as far as Arpit asks. Verified by the packed-consumer check on the exact tarball, `nub run verify`, and an independent review. Stops before each ship stage.

## Authority

By default: read, edit within the phase's scope, run checks, repair own defects, update records.
Also allowed by Arpit's approval of this roadmap (proposed until he approves):
- commit locally to `flow-rewrite` with explicit paths, never pushing;
- start builder and reviewer agents as the Agents section says;
- apply the plan merge in phase 1 (approved 2026-11-04);
- make design calls under delegation in phases 2-5, record why, and list them for Arpit to overrule;
- start the next phase after its audit passes, unless it starts with a stop.
Still needs the owner: public API changes he hasn't accepted, relaxing a gate, deleting work the runner didn't create, and any publishing.

## Agents

- Builders: Opus, medium effort, every third round high. Reviewers: Opus, high, never the builder.
- One or two agents at a time by default, a builder plus its mid-run reviewer. More only in phase 5's parallel features, or if Arpit allows it after a plan upgrade.
- No time caps. Every blocking command stays under 5 minutes.
- Briefs stand alone: the goal, steps and checks copied from here, the Method's shell and parallel-run rules, write scope, and what to return.
- Check soon after starting that each agent is doing something, and stop or replace one that stalls.

## Budget

Running out is a stop, not success. Check usage between agents. Arpit lifted the 90% weekly stop for the prototypes. Whether it holds for production is question R3.

## Decisions about this run

Confirmed by Arpit (2026-11-04 unless dated): everything in "What Arpit set" above, plus:
- commit locally and never push;
- builders on Opus at medium effort, reviews on high;
- 60-minute reviews, never a stop;
- one or two agents at a time;
- up to 8 parallel deterministic runs;
- bounded shell commands;
- the CLI is check, explain, graph, story and trace;
- no tla-ts;
- entities are not up for cutting;
- business keys for money.

Proposed, as questions (answer `R1 A`):
- **R1.** Phases as above: nine phases in five stages. A: accept. B: change. Rec. A.
- **R2.** Phase 2 also fixes round 13's H1 and H2 in the prototype before the suite is rewritten. A: yes, so the new suite has a correct runtime to pass on. B: fix them only in production. Rec. A.
- **R3.** Budget: keep the 90% weekly stop lifted for production. A: lifted. B: stop at 90%. Rec. A, since you upgrade when needed.
- **R4.** Runner: Claude as an agent runner, until a stop. A: yes. B: Arpit runs one phase at a time. Rec. A.
- **R5.** Lint choices in `tools/lint-bomb/FLOW-STATE.md`. A: accept. B: change. Rec. A.

## Runner rules

1. Reread every iteration: `roadmap.md`, `progress.md`, and the phase's records.
2. Run only an approved roadmap.
3. Write only `progress.md` of the two roadmap files.
4. Never edit `roadmap.md` or change a phase's class. If it looks wrong, stop and propose the change in `progress.md`.
5. Never weaken a check to pass it.
6. Audit before done: an agent that didn't do the work checks the done condition, in a fresh context.
7. Act within authority.
8. Stop when a phase is done and the next isn't authorized, at a stop for the owner, when the budget runs out, when a decision is the owner's, when the roadmap looks wrong, or when the owner says stop. Record the state and the first resume action in `progress.md`.
9. Claim only what you checked.
10. Brief agents fully.
