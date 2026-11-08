# Roadmap: Flow State v3 production

Status: approved by the user on 2026-11-07, in the Claude Code session ("the roadmap is approved"), handing
its execution to Claude as the agent runner.
Version: 9, approved 2026-11-07, after amendment 8.
Shape confirmed: 2026-11-04, in the Claude Code session. The user gave points 1-10: plans first,
conformance rewritten, the core, features, Next.js hardening, examples and docs.
Goal: production code for Flow State v3 at high quality, with good error messages and the
correctness guarantees the prototypes proved, plus example apps and generated documentation.
Runner: agent, until a stop (proposed). Claude coordinates and starts builders and reviewers.
Built from: suite commit `9b1dd09b1b4436e26e103f9632bb63153593d5e3`
(`/Users/arpit/Developer/workflow/skills/suites/workflow`).
Records:
- Plans: `workflow/plans/flow/*.plan` (stale until phase 2 writes them from the settled design).
- Design: `workflow/plans/flow/references/explorations/machine-fragments/machine-design.md`.
- Open proposals: every file under `workflow/plans/flow/references/proposals/`, and
  `packages/flow-state-v3/prototypes/round-9/entity-proposal-2.md`. History is in
  `workflow/plans/archive/flow-design-2026-11/` (read-only).
- Prototype record: `FOR-ARPIT.md` (accepted by the user on 2026-11-07, every recommended answer; deleted,
  read it with `git show 04e314f4:packages/flow-state-v3/prototypes/FOR-ARPIT.md`), `HANDOFF.md`,
  `convergence-1.md` to `convergence-13.md` and `round-13/review.md`, all in
  `packages/flow-state-v3/prototypes/`.
- Epic, Specs and Tasks: none yet. Specs are written in phase 2. Tasks are drafted with `to-task`
  at the start of phases 4 and 5; drafting Tasks is not a plan edit.
Source of truth, by area:
- Until phase 0 reconciles them, the latest prototype is authoritative for everything it built
  (`packages/flow-state-v3/prototypes/round-13/`, `packages/flow-state-v3/prototypes/conformance/`,
  and the decisions in the prototype record above), and machine-design.md for its decisions newer
  than the prototype (OD28-OD31). After phase 0, machine-design.md is the one source until phase 2
  writes the plans from it.
- For everything the prototype never touched, the plans and the design are authoritative.
- Code style: `AGENTS.md`, section "Code style (v3 production)", and
  `tools/lint-bomb/FLOW-STATE.md`.
Locations: the production package is `packages/flow-state-v3/src/`, and the new conformance suite
is `packages/flow-state-v3/conformance/` (proposed; the runner decides in phase 3, for the user's
review).
Example apps go in a top-level `examples/` folder. They import the v3 package; its published name
is decided at release, and is not the frozen `packages/flow-state/`.
Progress: progress.md, beside this file.

## The user's constraints

Each constraint has its source, date and scope. A step that contradicts one is a defect: stop and
log it.
- No new prototyping, except in phases 0 and 1: the reconciliation with the design (phase 0), and
  entities, streams, record migration and round 13's H1 and H2 (phase 1). Production work may
  converge again (session, 2026-11-04; reordered 2026-11-07; whole run).
- Everything merges into machine-design.md first; the plans are written from it once, in phase 2,
  from its plan-amendment rows (session, 2026-11-07; whole run).
- The plans are stale. Merge the open proposals into machine-design.md first, then the design into
  the plans, find and mark every
  decision the prototype superseded, and keep the plans where the prototype never went. Merging
  is approved (session, 2026-11-04; phase 2, after phases 0 and 1 have settled the design, 2026-11-07).
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
- One or two agents at a time by default; up to 3 when the work does not overlap (the user,
  2026-11-07); limits must last the project (memory, 2026-11-03; whole run).
- No fixed time caps. Review at each 60-minute checkpoint while the builder keeps going (memory,
  2026-11-02, widened 2026-11-03; whole run).
- Deterministic work runs up to 8 processes in parallel, about 16 GB in total. Real-browser runs
  and benchmarks run alone (memory, 2026-11-04; whole run).
- Kill your own stray processes by exact pid; never the user's (memory, 2026-11-04; whole run).
- Business keys for money (`packages/flow-state-v3/prototypes/round-8/RESULTS.md`; whole run).
- Entities are optional but not up for cutting (memory, 2026-11-01; whole run).
- No tla-ts (memory, 2026-11-03; whole run).
- Usage: the 90% weekly stop was lifted for the prototypes (memory, 2026-11-03; prototypes only).
  For production: no weekly stop, with a 5% reserve (R3 A, 2026-11-07; whole run).

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
- **Judgment goal:** a phase no check can settle, only a ruling against written criteria. Each
  decision names its judge, agent or user, up front.
- **Judge:** who rules on a decision: the user, or a reviewing agent that did not write the draft.
- **Guarantee map:** a table, one row per guarantee: the checks that cover it, the lie that breaks
  it, and its audit state. Read instead of the tests.
- **Guarantee change:** any finding, fix or design that adds, drops or changes a guarantee recorded
  in a Spec, or, before phase 2 writes the Specs, in machine-design.md. It always blocks on the user.
- **Amendment:** a numbered, recorded change to this file (runner rule 4).
- **The lock:** the suite's recorded expected results (`conformance/expected.lock`); a changed verdict
  must be logged in `conformance/expected-changes.log`. **Searches:** generated-input runs under
  `conformance/search/`. **Front-check:** pins on the compiler's findings. **CLI pins:** expected
  `flow` command outputs. **Story checks:** `round-N/checks/story-check.ts`. **Reference model:** the
  suite's independent model of the expected endings. **Type tests:** `typed/type-tests.ts`, which must
  compile. All under `packages/flow-state-v3/prototypes/`.
- **Section 5:** machine-design.md's plan amendments, the C rows naming each plan sentence they replace.
- **`watch.ts`:** the process watchdog, `packages/flow-state-v3/prototypes/conformance/watch.ts`.

## Stops and the review queue

A blocking stop halts the run until the user answers. There are only these, plus the user-decided items under Authority: the label round and
the user-judged decisions of a judgment phase (phases 2, 6 and 7), a conflict between the design and
the prototype that only the user can decide (phase 0), public entrypoint names, a
public API change beyond what the user accepted, a guarantee that can't be met, a guarantee
change, a feature call only the user can make, a change proposal whose judge is the user, the
real-phone run (that item only), and each ship stage.

**Who judges a decision.** In a judgment phase, and for any conflict phase 0 finds, each decision is
labelled up front with the question, the recommended answer and its reason, the judge and how
reversible it is. **The judge is the user** when the decision is a public name or API shape, a
guarantee, scope or budget, or touches a preference the user has stated; **otherwise it is a
reviewing agent that did not write the draft**. The runner proposes every label; the user confirms
the labels once per phase, before its first iteration, and may move any decision to either judge.
A decision found during a phase is labelled by the same rule: a user label blocks, an agent label
goes to the review queue with the agent's ruling and reasons. Criteria for a judgment phase are
drafted by the runner before the first draft and approved by each decision's judge.

Every other call within Authority is a review, including every agent-judged ruling: the runner records it under
"Calls for the user's read" in progress.md, with its reason, evidence and how reversible it is, and keeps working. The user works
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
| A. Settle | 0, 1, 2 | The design and the prototype agree; entities, streams and migration settled into the design; plans written from it and marked |
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
- `to-spec`: when writing the Specs in phase 2.

### 0. Reconcile the design and the prototype: not readily verifiable goal

Goal: one source of truth before any plan is written, reconciled in both directions.
- **The prototype and suite are brought up to machine-design.md's newest decisions:** OD28
  (`Flow.ignore`, P1), OD29 (J, E step 2, F, the optional handler target), OD30 (identity folded into
  input) and OD31 (actor lifetime). Round 14, started on 2026-11-07 at the user's request in the
  worktree `/Users/arpit/Developer/flow-state/.claude/worktrees/agent-acee8f40b71d961fd` (branch
  `worktree-agent-acee8f40b71d961fd`), is this phase's first iteration. It started before the label
  round, by the user's request; its conflicts are labelled at the end of the iteration instead.
- **machine-design.md is brought up to the prototype** where the prototype's decisions are newer and
  win: `convergence-1.md` to `convergence-13.md` (D1-D222, for example D221's key versions and D222's
  single default), `round-13/api-changes.md`, the `services` list, and `FOR-ARPIT.md`'s accepted calls,
  questions, change log and carry-over requirements (from git, `04e314f4`). Each goes in with its decision entry and plan rows. A conflict the design and the
  prototype disagree on is a decision with a judge, never a silent edit.
Verified by: suite cases derived from the design's text, each seen failing on a wrong runtime first;
the gates; an independent review comparing the design and the prototype area by area.
Gates relied on: the suite and its lock, falsify, lies, mutants, the searches, the graph gate, the type
tests, front-check, the CLI pins, the Story checks. Fails on: a null, broken or lying runtime.
Falsified by: `packages/flow-state-v3/prototypes/conformance/falsify.ts`, each part.
One iteration: one area: implement it in the prototype or record it in the design, run the suite,
review.
Done when:
- every decision in machine-design.md has prototype cases that pass;
- every prototype decision is in machine-design.md, or listed as a conflict for the user;
- the review finds no remaining disagreement between the two;
- the gates pass at the final commit.
Blocking: a guarantee change; a conflict between the design and the prototype that only the user can
decide. Reviews: each area's reconciliation, and one page at the end.
Decisions: each conflict between machine-design.md and the prototype, labelled by "Who judges a
decision" (for example: a public API shape or a guarantee, user; which of two equivalent internal
spellings, agent). The first iteration lists the conflicts it can foresee from the prototype record
(D1-D222 against the design) with proposed labels, and the user confirms them in one round.
Could succeed at the wrong thing by: bending cases to fit the code, or copying the prototype's choices
into the design without the user. Caught by: expected results derived from the design; the review
checks each design change against its decision record.
Budget: up to 8 rounds; stop after 2 same-class failures after convergence.

### 1. Pre-work prototype: not readily verifiable goal

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
- each area's design is settled and recorded in machine-design.md (its decision and plan rows), listed
  for the user's read;
- its slice passes and is audited;
- `listen.load` and `fragstore.row` pass;
- H1 and H2 are fixed and pinned;
- M5 is settled, or listed for the user.
Blocking: a guarantee change, including each area's guarantee map if it adds or changes a public
guarantee. Reviews: each area's guarantee map at its first audit pass, its settled decisions, and
one page at the end, in the review queue.
Could succeed at the wrong thing by: designs that fit the harness but not real apps. Caught by: one
path per area that takes the data from a real source, such as a real `fetch` or SDK call.
Budget: up to 6 rounds per area and 15 in total; stop after 2 same-class failures after
convergence.

### 2. Plan merge: judgment goal

Goal: current plans, and Specs for production, written once from the design settled by phases 0 and
1. machine-design.md's plan-amendment rows (section 5) are the change list, merged into the plans. Every superseded decision is found and marked with a pointer
to its replacement. The plans keep their content where the prototype never went. Specs record the
guarantees (`to-spec`), so later phases test what is supposed to happen.
Verified by: each decision's judge, `workflow check`, and an audit that compares each merged rule
with the latest decision that touches it.
Gates relied on: `workflow check`. Fails on: a record with a broken reference or schema.
Falsified by: running it on a deliberately broken copy of one plan.
One iteration: one plan or area. List the edits as before and after, with the decision behind
each. Apply them, under the user's approval of the merge, and run `workflow check`.
Done when:
- every `.plan` the prototype touched is merged;
- every superseded decision is marked;
- Specs exist for each production area;
- no plan text claims a decision the user didn't make;
- `workflow check` passes.
Blocking: the label round, then each round of user-judged decisions. Reviews: agent-judged
rulings, and a page listing what changed, at the end.
Criteria (drafted by the runner before the first merge, approved by the user): the plans say what
machine-design.md says and nothing it doesn't; every superseded sentence is marked with its
replacement; a reader of one plan needs no other document to know its contract.
Decisions: each conflict found while merging (`FOR-ARPIT.md`'s Q1-Q8 and 20 calls are accepted and
recorded in phase 0). The
first round labels every one (the recommended answer and why, the judge, how reversible it is),
and the user confirms the labels. Merge edits that follow a ruled decision are the approved merge,
not new decisions.
Could succeed at the wrong thing by: merging from the stale design where the prototype replaced
it, or recording a recommendation as decided. Caught by: the audit, rule by rule, against the
latest convergence decision and the user's words.
Budget: up to 10 merge iterations and 3 question rounds; small usage (no builders).
Steps:
- Label round first, then the remaining open calls; agent-judged ones are ruled by
  the reviewer and queued. The services choice is settled: a required `services` list on every
  operation (Q2 B, 2026-11-07).
- Merge one plan or area per iteration, with `workflow check` after each.
- Write the Specs last, from the merged plans.

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
Blocking: a guarantee change. Reviews: the suite's location and layout (the runner decides; the
user may overrule), the guarantee map at its first audit pass, and the end. A wrong check found
here or later sends only its part back to the not readily verifiable rules: fix, re-audit,
resume.
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
that can't be met; a guarantee change. Reviews: the internal module layout (the runner decides) and the end.
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
One iteration: the next ready Task of the earliest feature. One feature at a time, with a builder and its
reviewer (R4 B).
Done when: each feature's slice passes on production after its audit, and the user accepts the CLI
outputs.
Blocking: a feature whose plan has an open call that only the user can make; a guarantee change;
the user's acceptance of the CLI outputs, batched for one round. Reviews: the CLI output mocks
before that round, and the end.
Could succeed at the wrong thing by: a slice too lenient to fail. Caught by: lying implementations
in each feature's audit.
Budget: up to 8 rounds per feature and 40 in total; stop after 2 same-class failures after
convergence.

### 6. Example apps: judgment goal

Goal: medium-sized Next.js example apps in `examples/`, each importing the v3 package, each a
striking demo that explains what it shows. One demos Story presentation. Which apps is the user's
pick (candidates in progress.md). They also drive conformance runs and benchmarks.
Verified by: each decision's judge. Each app builds, lints, runs its Stories, and works in real Chrome
and Safari.
Gates relied on: each app's Stories in `nub run verify`. Fails on: a broken Story. Falsified by: one
deliberately broken Story per app.
One iteration: one app's next slice, reviewed, then shown to the user.
Done when: every decision has its judge's ruling, and each app is accepted.
Blocking: picking the apps (answerable any time before this phase), and accepting each app.
Reviews: each app's first working version, and agent-judged slice calls.
Criteria (drafted by the runner before the first app, approved by the user): each app explains
what it demos with a write-up and in-place tooltips; it shows one guarantee happening, not just a UI;
it runs in real Chrome and Safari; one app demos Story presentation.
Decisions (proposed labels): which apps, user; each app's acceptance, user, since the user set
its requirements; design calls inside an app's slice, agent.
Could succeed at the wrong thing by: a demo that hides the guarantee it claims to show. Caught by:
the user's review against the app's own write-up.
Budget: up to 6 rounds per app.

### 7. Documentation: judgment goal

Goal: docs in `apps/docs/`, written in the source in Effect's shape and generated to Markdown, as
`@effect/docgen` does with `codebases/effect-v4/packages/effect/docgen.json`, with every example
type-checked and some run as tests. Long guides sit beside the package, as
`codebases/effect-v4/packages/effect/SCHEMA.md`, and pull checked snippets from phase 6's example
apps. The issue catalog is generated from the code. The example apps are linked from the docs.
Verified by: each decision's judge against criteria written first. The checkable part:
- every example compiles;
- the generated Markdown is current in `nub run verify`;
- a fresh agent, given only the docs, builds a small feature whose Story passes.
Gates relied on: example type-checking, and generated-docs freshness. Fails on: an example that
doesn't compile, and a stale page. Falsified by: one deliberately broken example and one stale
page.
One iteration: draft or revise one section, get an independent review, then put each open
decision to its judge.
Done when: every section has its judge's ruling, and the checkable part passes.
Blocking: the docs criteria, once. Reviews: each section's draft and its ruling.
Decisions (proposed labels): the docs criteria, user; each section against the criteria, agent;
any public name a section introduces, user.
Could succeed at the wrong thing by: documenting the planned API rather than the built one.
Caught by: examples compiled against the package packed locally (`npm pack`), as phase 9 checks it.
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
Blocking: the real-phone run (only that item; other work continues); a guarantee change. Reviews: budget targets, which the runner proposes from the baselines, and the end.
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
- apply the plan merge in phase 2 (approved 2026-11-04), and write the Specs;
- record phases 0 and 1's settled designs in machine-design.md, not the plans;
- draft Tasks with `to-task`;
- start the next phase after its audit passes, unless it starts with a stop for the user;
- apply agent-judged change proposals as amendments (runner rule 4), each also in the review
  queue.
Runner decides: design calls in phases 0, 1, 3-5 and 8, and agent-judged decisions in phases 2, 6
and 7, recorded with reasons in progress.md for the user's read.
User decides (blocking): public entrypoint names, public API changes beyond what was accepted,
relaxing a gate, plan edits beyond the approved merge, scope, budgets, the example apps, a
guarantee change, user-judged decisions and change proposals, and running more than two agents at
once.
Runner decides, then reviews: the suite's location and layout, and the internal module layout;
each goes to the review queue and the user may overrule. Budget targets are proposed by the runner
from baselines and set by the user (phase 8).
Everything else still needs the user.

## Agents

- Builders: Opus, medium effort, every third round high. Reviewers: Opus, high; never the builder. Haiku agents
  (sidecars of any kind): always high (the user, 2026-11-08).
- Agents at once: one builder and, at review time, one reviewer; work runs serially (the user,
  2026-11-08, replacing the 2026-11-07 allowance of 3). Exception (amendment 5): up to 4 Haiku research agents,
  read-only, in phase 0's close-out and phase 2, while no builder runs; they return tables, never verdicts.
  **Haiku sidecars (amendment 7):** every review, research or survey task given to Opus is launched with 4 Haiku
  sidecars at the same time, each attacking the same problem from a different named angle (for a code review, for
  example: soundness of each change, equivalence of a rewrite, concurrency and shared state, purity and determinism).
  Sidecars are read-only, run no gates or benchmarks, and return findings with file:line evidence, never verdicts.
  The Opus agent that owns the task starts its own sidecars and receives their findings; it verifies them and folds
  them into its one report to the runner, which names the sidecar findings it used or rejected. Sidecars never report
  to the runner (the user, 2026-11-08: "sidecars should report the owner opus, not to you"). They count outside the
  one-builder, one-reviewer limit. Haiku agents run at effort high.
  **Builder sidecars (amendment 8):** in prototype work, the Opus builder is a lead that plans its round's tasks up
  front and delegates bounded ones to up to 4 Haiku sidecars at a time: coders (a disjoint file or function each,
  with an acceptance check), runners (gates, searches, traces; they report results, never fix) and reviewers (one diff
  against one rule). The lead owns the design, integrates, reads every diff before it lands, and is the only one who
  commits; sidecars never edit the design, the plans or expected results. This is separate from the hourly review.
  The procedure: Work serially: one builder at a time, always busy on the queue. One independent Opus review of the latest committed checkpoint every 60 minutes, and one close-out review when a round or area finishes. Reviews only report; the runner fixes minor findings itself. When several reviews in a row keep finding many issues, stop patching: collect every finding as a requirement and run one convergence pass (`policy-convergence`), then keep going.

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

Total: the round caps per phase above, about 128 rounds (round 2's about 120, plus phase 0's 8). Running out is a stop, not success.
Pace: one builder and one reviewer at a time; up to 3 agents for non-overlapping work. Usage is measured against the weekly limit on the
user's plan; check it between agents and log it every iteration. Reserve: 5% of the weekly limit,
kept for the user: stop at 95% (R3 A).

## Decisions about this run

Confirmed by the user (2026-11-04 unless dated): every item in "The user's constraints", the shape
above, and the plan merge. Round 1, on 2026-11-07:
- Stops block only where the work can't go on without the user; everything else goes to a
  non-blocking review queue (Q1 A). See "Stops and the review queue".
- Every operation declares a required `services` list, checked against the commit's `R` (Q2 B).
- Phase 2 fixes round 13's H1 and H2 in the prototype before the suite is rewritten (Q3 A, R2). (Now
  phase 1, after round 4's reorder.)
- No weekly stop; a 5% reserve is kept for the user (Q4 A, R3).
- Phase 2's settled designs go straight into the plans, listed for the user's read (Q5 A, R6).
  **Superseded by round 4:** they go into machine-design.md first.

Round 2, on 2026-11-07:
- The phases as above, nine phases in five stages, examples before docs (R1 A). (Ten phases after
  round 4.)
- Claude runs as an agent runner until a stop, with 2 agents at once throughout (R4 B).
- The lint choices in `tools/lint-bomb/FLOW-STATE.md` are accepted (R5 A).
- The round caps above, about 120 in total (R7 A).
- `nub run verify` drops the frozen library build; `build` points at `packages/flow-state-v3`
  once it has a build step, in phase 4 at the latest.

Round 3, the roadmap skill, on 2026-11-07 (this file rebuilt from it):
- Not verifiable goals become judgment goals: each decision names its judge, agent or user, up
  front with a recommended answer. The runner proposes the labels; the user confirms them once
  per phase (Q1 B).
- A new phase always needs the user's yes (Q2 A). This means a phase added by amendment; starting
  the next planned phase after its audit is Authority's.
- The guarantee map, one guarantee-change event, criteria approved by their judge, and back moves
  for a wrong check (Q3 A).
- The skill changes first, then this roadmap is rebuilt from it before phase 1 (Q4 B; phase numbers before round 4's reorder).
- Two files only; `handoff.md` is deleted and `progress.md` carries a Resume block (Q5 A).

Round 4, on 2026-11-07, in the Claude Code session:
- Stage A is reordered so the plans are written once, from a settled design: phase 0 reconciles
  machine-design.md and the prototype in both directions (round 14 is its first iteration); phase 1
  is the pre-work prototype (entities, streams, migration, H1, H2), recorded in machine-design.md;
  phase 2 is the plan merge from the design's plan-amendment rows. Phases 3-9 are unchanged.
- Everything merges into machine-design.md first; the plans are written from it once.

Round 5, on 2026-11-07, in the Claude Code session (at approval):
- The roadmap is approved, with its proposed items at their recommended answers.
- D1-D7 from the round-14 review are approved: an end parks `Interrupted` for each read it stops; the
  ref form is fixed per machine in the types and identity is encoded with its Schema; re-arming or
  leaving removes a waiting deadline; a return mints a new incarnation id; a local actor's remount
  within the grace reuses it; `disposeActor`'s endings stay on lane records; an undecodable record
  reads as quarantined. They go into machine-design.md in phase 0.
- Up to 3 agents when the work does not overlap; reviews every 60 minutes.

## Amendments

Numbered, oldest first (runner rule 4).
1. 2026-11-07, judge agent (the runner), from the cold read after approval: wording only, no change to
   scope, classes or budgets beyond the user's own decisions. Version 2. The agent count, the stop
   list and Authority made consistent with the user's approval (up to 3 agents for non-overlapping
   work; user-decided Authority items block); "everything else" scoped to Authority; budget targets
   set by the user, as phase 8 says; phase 5 blocks on the CLI outputs and a guarantee change; a
   guarantee change defined before Specs exist; "a new phase" means one added by amendment; round 14
   labels its conflicts at its end; the constraint on merging says proposals go into machine-design.md
   first; packing for phase 7; full paths; glossary terms; `to-spec` in the methods; the round total
   explained. Phases worked out again: none.
2. 2026-11-08, judge the user (in the Claude Code session: "you need a busy thread all the time, i need a simpler
   phase ordering, by actual work"): stage A runs as one queue of actual work (finish round 14; round 15, the rulings
   owed to the prototype; phase 1's areas one after another) in one continuously busy builder thread, with one
   independent review every 60 minutes and one completion audit at the end of stage A, instead of a review and an
   audit for every pass and phase. Minor findings are fixed inline by the runner. Phases worked out again: 0 and 1
   (their content is unchanged; only how they are run). progress.md's Resume block holds the queue.
3. 2026-11-08, judge the user ("work serially. one builder, one review every 60 minutes and one close out review,
   after multiple rounds of reviews finding lots of issues you collect all issues as requirements and do a convergence
   pass. and keep going"): replaces amendment 2's agent counts and audit cadence. One builder at a time; one review
   every 60 minutes; one close-out review per round or area; repeated heavy findings trigger one convergence pass;
   the run continues. The stage A completion audit before the plan merge is the close-out review of stage A.
   Phases worked out again: none (how they run only).
4. 2026-11-08, judge the user ("let's fix it as 3 for now"): the convergence trigger in runner rule 7 is the third
   review in a row that finds the same root-cause class in the same part; before it, findings are patched. Version 5.
   Unchanged: each phase's stop count ("stop after 2 same-class failures after convergence") still applies after a
   convergence pass. Phases worked out again: none (how they run only).
5. 2026-11-08, judge the user (Q1 A): up to 4 Haiku agents for read-only research fan-out in phase 0's close-out
   (the design against the prototype, area by area) and in phase 2 (the plan merge), only while no builder runs.
   Each takes a slice (a plan file or a range of C rows) and returns a table of locations and matches, never a
   verdict; one Opus reviewer judges from those tables and the text. Version 6. Phases worked out again: none (how
   they run only).
6. 2026-11-08, judge the user ("any new task added to a roadmap has to use the roadmap skill to construct it"):
   runner rule 4 gains "Build every new item with the roadmap skill", and the roadmap skill's own runner rule 4
   gains the same text, so every roadmap it writes carries it (skill edited in
   `/Users/arpit/Developer/workflow/skills/suites/workflow/roadmap/SKILL.md`, not yet committed in that repository;
   "Built from" stays at `9b1dd09` until it is). Version 7. Applied at once to the speed pass (queue item 0, added
   before this rule): rebuilt as a change proposal in progress.md. Phases worked out again: none.
7. 2026-11-08, judge the user ("every review or research or survey task that requires opus will launch 4 haiku
   sidecars that attack the problem from different angles"): the Agents section gains Haiku sidecars, four per Opus
   review, research or survey task, read-only, each with its own angle, outside the agent-count limit. Also in
   `AGENTS.md`, section "Agents". Version 8. Phases worked out again: none (how they run only).
8. 2026-11-08, judge the user ("the opus agent is responsible to managing and delegating. i want you to apply this
   strategy for the next prototype work"): in prototype work the Opus builder leads up to 4 Haiku sidecars (coders on
   disjoint files, runners, reviewers), planned up front; the lead integrates, reviews every diff and alone commits.
   A **trial** on round 14's remaining work only (the user: "use the second variant for one test only so we can judge
   well it worked and how long it took"); later rounds use it only if the user adopts it after seeing the trial's
   timings and rework. **Adopted 2026-11-08** (the user: "well you tell me, was it good enough. 39 minutes sounds
   good"; the runner judged it good enough): the trial took 39 minutes from plan to done with 7 sidecars and no diff
   redone. Two refinements from it: runners get the oracle code they check against, and a reviewer sidecar checks
   every oracle, harness or runtime change. Applied from round 15's remaining rulings on. Also in `AGENTS.md`. Version 9. Phases worked out again: none (how
   they run only).

## Runner rules

1. **Reread every iteration.** Start each iteration by reading `roadmap.md`, `progress.md`, and
   the records the phase names. Trust the files, not memory, so a fresh context loses nothing.
2. **Run only an approved roadmap.**
3. **Keep the run's state in `progress.md`.** It holds the phase, iteration, revision, verdicts,
   budget used, the failure ledger, the agents running, the calls for the user's read, the change
   proposals, next action, and what the run waits on. Its Resume block, at the top, says what a
   fresh context reads, in order, and the first action. Never write a separate handoff file: each
   fact lives in one place. Results go to the project's Plans, Tasks, and Specs.
4. **Change `roadmap.md` only by amendment.** The frame (the user's constraints, each phase's
   class, the Authority, the Budget total, and these rules) changes only with the user's yes. The
   work (phases, items, their gates and budgets) may change as the run learns. To change either,
   write a change proposal in `progress.md`: the kind (insert, modify, split, reorder,
   reclassify), why, the class, gates and likely misfire of anything new, its cost to the budget,
   and its judge:
   - agent: inserting a Task inside a phase, splitting a phase, or reordering without breaking a
     dependency. Apply it and record it as a review;
   - user, blocking: a new phase, a changed goal, the Budget total, a class with fewer checks, or
     the Authority.

   Apply an accepted change as a numbered entry in `roadmap.md`'s Amendments section (date, judge,
   change), raise the version, and cold-read only the changed phase. Work out again every phase
   that depends on a changed goal. Leave replaced text in place, marked with a pointer to its
   replacement. "Done" is judged against the current version. If the roadmap looks wrong (the
   wrong class, a check that cannot be built, the named misfire happening, a step that contradicts
   one of the user's constraints), that is a change proposal too.

   **Build every new item with the roadmap skill** (amendment 6). Any phase, Task or queue item added to
   this roadmap after approval, by either judge, is constructed with the `roadmap` skill
   (`/Users/arpit/Developer/workflow/skills/suites/workflow/roadmap/SKILL.md`), not written freehand. Choose its
   class (section 1); choose and pin the packages it draws from, and write its goal, verification, one iteration,
   done condition, likely misfire, gates, budget, and blocking stops and reviews (section 2, steps 3-5, 7 and 10),
   in the template's phase shape; then cold-read the new item alone (step 13). An item too small for a phase, such
   as one Task inside a phase, still names its class, its acceptance, its gates and its misfire. Record in its
   change proposal that it was built this way.
5. **Never weaken a check to pass it.** An expected result changes only for a specific reason,
   logged in the record that owns it. Relaxing a check, target, or budget needs the user.
6. **Count only gates that can fail.** A gate counts only if it has been seen failing on a wrong
   implementation at the current harness revision. A change to the harness or suite triggers its
   re-audit before its verdicts count.
7. **Converge instead of patching.** Update the failure ledger every iteration. When the third
   review in a row finds the same root-cause class in the same part (a part failing, a fix moving a
   failure one step further on, or a repeated kind of finding), stop patching and converge
   (`policy-convergence`): gather every finding, list every dimension the part must cover, and
   redesign once. Minor findings with different causes are patched inline and never count. This
   holds for suites as well as code. (Amendment 4; replaces "when one part fails twice, when a fix
   moves a failure one step further on, or when reviews repeat a kind of finding".)
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
    - in a not readily verifiable or judgment phase, a round produces no new decision (end the
      phase early; a readily verifiable phase ends only at its done condition);
    - a decision is the user's, including a guarantee change;
    - a change proposal needs the user;
    - passing would mean weakening a check;
    - the user says stop.

    Record the state and the first resume action in `progress.md`.
14. **Claim only what you checked:** what ran, on which revision, and what is still unverified.
15. **Brief agents fully.** An agent you start gets a brief that stands alone: its goal, the steps
    and checks it needs, its write scope, its budget, the Agents values, and what to return.
