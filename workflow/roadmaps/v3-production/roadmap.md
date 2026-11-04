# Roadmap: Flow State v3 production

Status: proposed. Arpit has not approved it. A runner never starts an unapproved roadmap.
Goal: production code for Flow State v3 at high quality, with good error messages and the
correctness guarantees the prototypes proved, plus several example projects and documentation.
Runner: agent, until a stop (proposed). Claude coordinates and starts builders and reviewers.
Built from: suite commit `ae99594079459f68f75ed3b13fa5fba0d4ab3b33`
(`/Users/arpit/Developer/workflow/skills/suites/workflow`).
Records:
- Plans: `workflow/plans/flow/*.plan`. Out of date until the merge in phase 1.
- Design: `workflow/plans/flow/references/explorations/machine-fragments/machine-design.md`.
- Prototype record: `packages/flow-state-v3/prototypes/FOR-ARPIT.md`, `HANDOFF.md`,
  `convergence-1.md` to `convergence-13.md`, `round-13/review.md`.
- Epic: none yet. Specs: none yet for v3.
- Lint: `tools/lint-bomb/FLOW-STATE.md`.
Progress: progress.md, beside this file.

## How to run

Repeat until a stop. Reread this file, progress.md, and the current phase's records. Do one
iteration of the current phase. Put results in the records and the run's state in progress.md.
When the phase's done condition holds, get the completion audit from an agent that did not do
the work. On PASS, start the next phase if Authority allows it; otherwise stop.

## Prerequisites for production work

Production code, starting with phase 3, waits on all of these, in this order. **[Arpit]** marks
the ones that wait on him.

1. **[Arpit]** Approve this roadmap and answer its questions under "Decisions about this run".
2. **[Arpit]** Answer `FOR-ARPIT.md`: the 20 calls in section 2, and Q1 to Q8 in section 7.
   - Q1 (what counts as the same key version) blocks the H2 fix.
   - Q2 (reaching an old-version hold) blocks M3.
   - Q8 (the Story API) decides what the foundation builds.
   - Q6 decides whether contracts carry `idempotency` data. Q7 decides the Plan edits for
     rule 32.
   - Q3, Q4 and Q5 become Spec behavior.
3. **[Arpit]** Accept or change the proposals in `FOR-ARPIT.md` section 6:
   - Safari's four host requirements;
   - the CLI output redesign;
   - fast suite parts in `nub run verify`, with lie, graph and real-browser runs on final
     commits.
4. Settle M5, the key-less `cancel` that oracle (h) flags red: is the runtime wrong, or the
   ledger? This is the runner's call. If the design says nothing, it goes to **[Arpit]**.
5. **[Arpit]** Merge the Plans: list every edit from `machine-design.md`, convergence 1-13 and
   the answers above, as before and after. Apply them only after his yes. Superseded text stays
   as prior art.
6. Round 14 on the prototype fixes H1, H2 and M1 to M5 (`FOR-ARPIT.md` section 5). Mutants come
   first: a counter default for H1, and `k` changed from `S.String` to `S.Number` for H2. The
   ported suite then has a reference runtime it passes on.
7. Specs for each production module (`to-spec`), checked in a fresh context (`check-spec`).
   "Test the spec, not the code" needs a current spec. This is where it comes from.
8. The conformance suite moves out of `prototypes/`, behind the `--runtime` adapter. Its expected
   results are derived again from the Specs, and it passes a four-angle audit and a re-audit.
   **[Arpit]** confirms that it tests the right thing.
9. **[Arpit]** Repair `nub run verify`. It already fails at `build:library`: the frozen
   `packages/flow-state` packed-consumer check can't find `effect/dist/unstable/cli.js`. This
   was true before the lint change, at `d4d54074`. Options: drop the frozen build from verify,
   or fix it in the frozen package, which needs his yes.
10. Decide the production module layout and entrypoints (`to-design`). Then turn on the deferred
    lint rules, as `tools/lint-bomb/FLOW-STATE.md` "Deferred" lists. Public entrypoint names are
    API, so they go to **[Arpit]**.

## Stages and gates

Five stages. Each gate is the done condition of the stage's last phase, checked by a fresh-context
audit.

| Stage | Phases | Gate to the next stage |
| --- | --- | --- |
| A. Settle the spec | 1, 2 | Decisions recorded, Specs PASS, suite audited and confirmed |
| B. Foundation | 3 | Audited suite green on production, every gate falsified there |
| C. Features not yet prototyped | 4, 5 | Each feature's suite slice audited, then green on production |
| D. Hardening | 6, 7, 8 | Budgets met, findings swept, examples and docs accepted |
| E. Release | 9 | As far as Arpit asks |

## Method: the working practice, used by every phase

This is how the project already works. The phases point here instead of repeating it.

**Rounds.**
- A round is one builder session, test first.
- The cases are written and seen failing before the build. Each case cites the rule or decision
  it tests.
- The builder commits a checkpoint and a short status file by minute 50.
- At 60 minutes, a reviewer checks that checkpoint in parallel while the builder keeps going.
  60 minutes triggers a review; it is never a stop.
- Each round ends with a final independent review on the round's last commit.
- Reviewers write mutants and attacks from the code and the rules before reading the builder's
  results. They rerun the headline numbers, include a section on the tests themselves, and
  continue the assumptions table across rounds.
- Findings are advice. The coordinator decides each one by the project's priorities, with a
  reason.

**Convergence instead of patching.**
- Write the round's notes before the next round's code: findings by root cause, and numbered
  decisions marked proposed or decided, with what each replaced.
- Converge when the same part fails review twice, when a fix moves a failure one step further
  on, when a rule grows a list of cases, or when reviews repeat a kind of finding.
- To converge, gather every finding and requirement and name each root cause in one sentence.
  Then redesign from scratch: the designer gets the problems and the traces, not the old draft.
  Write a new proposal, and keep the old one as prior art.
- Review the new proposal once, adversarially. Revise once, from all of that review's findings.
  Prove it with a check that can fail.
- Patch only a finding that stands alone, with a small change and a known cause.
- The same rule applies to the test suite.

**Gates that must be able to fail.**
- A gate counts only if it is shown failing on a null, broken or tampered runtime:
  - falsify;
  - the lie gate: targeted by default, with one full run before a phase's final commit;
  - `mutate-one`;
  - the graph gate, in both directions;
  - the reference model, which imports nothing from the code under test.
- Every old failing trace stays as a standing case that fails on a broken version.
- Expected results come from the Spec, with the rule cited, and are derived without running the
  code. Someone other than the builder writes them, before the code.
- Recorded output is a change detector only, never evidence of correctness.
- An expected result changes only with a logged, specific reason. Relaxing a gate needs Arpit.
- Audit the suite from four angles, each with an agent that has not read earlier reviews:
  - bugs in the harness;
  - false assumptions about reality in the fakes and cases;
  - assumptions so narrow that a correct variation fails;
  - missing requirements, where a wrong implementation passes.

  Fix from all findings at once, then re-audit. Work that relies on the suite waits for the pass.
- A check excuses a missing obligation only for a cause the harness itself observed.

**Shell.**
- Never run a command that reads stdin unless you feed it. Append `</dev/null` otherwise. `cat`
  is `bat`; use `command cat`.
- Create and edit files only with the Write and Edit tools. No `>` redirection, `sed -i` or Python
  patches.
- Bound every command's time with `conformance/watch.ts --seconds N` or
  `perl -e 'alarm N; exec @ARGV' --`. There is no `timeout` command.
- Never wait on unbounded background work.
- Check `ps` for your own shells older than 5 minutes and kill them by exact pid, after checking
  the parent chain. Never kill Arpit's processes, or anything by name.

**Parallel runs.**
- Deterministic work (suite slices, lies, mutants) runs up to 8 processes at once, each under
  `watch.ts`, about 16 GB in total. Check `vm_stat` for swapping before adding one.
- Real-browser runs, benchmarks and timing-sensitive searches run alone.

**Records.**
- Decisions go to the Plans, guarantees to the Specs, and work and evidence to the Tasks.
- Before editing a Plan, list the change and wait for Arpit's yes.
- Never present something as decided unless Arpit accepted it.
- New ideas go in a new proposal file. Deferred items go in `revisit.md`.
- Run `nub run check:fix` after code changes. Claim full verification only after `nub run verify`.

## Phases

### 1. Arpit's read and the Plan merge: not verifiable goal

Goal: every open call in `FOR-ARPIT.md` answered, and the Plans brought up to date from the
design and the convergence decisions.
Verified by: Arpit's judgment, against criteria written before the first round. Each answer is
recorded with his words, where he said it and when. Each Plan edit was listed before and after,
and he said yes to it.
One iteration: one numbered round of at most 5 questions, each with before and after and a
recommendation. Arpit replies `Q1 A`. Record only what he confirms.
Done when: prerequisites 1 to 5 hold, the merged Plans pass `workflow check`, and no Plan text
claims a decision Arpit did not make.
Stops for the owner: every iteration.
Could succeed at the wrong thing by: recording a recommendation as decided, or merging from the
stale `machine-design.md` where a convergence decision replaced it.
Caught by: the audit compares each recorded decision with Arpit's words, and each merged rule
with the latest convergence file that touches it.
Budget: no round cap. Usage is small: questions and edits, no builders.
Steps:
- Ask FOR-ARPIT Q1-Q8 first, then the 20 calls, then section 6, then this roadmap's questions.
  Q1 and Q2 block the most work.
- Settle M5 from the round 13 traces first. Ask Arpit only if the design says nothing.
- List the Plan edits by `.plan` object, before and after, with the decision id behind each one.
  Wait for his yes, apply them, and run `workflow check`.

### 2. Spec and suite: not readily verifiable goal

Goal: a checked Spec for each production module. The conformance suite becomes its executable
form, out of `prototypes/` and audited, so that phase 3 is readily verifiable.
Verified by:
- `check-spec` in a fresh context on each Spec;
- the four-angle audit and re-audit;
- every gate falsified;
- an independent review at the end of each round.
One iteration: one round, using the Method.
Done when:
- round 14's fixes pass their own mutants;
- every Spec has `check-spec` PASS;
- the moved suite passes on the prototype runtime, its expected results derived from the Specs;
- every gate fails on its broken runtime;
- the re-audit passes;
- Arpit has confirmed the suite.
Stops for the owner:
- when a Spec question finds the design silent;
- when the suite first passes its audit, so he can confirm that it tests the right thing;
- at the end, with one page for his read.
Could succeed at the wrong thing by: porting the suite with expected results copied from the
prototype's output, so it certifies the prototype's quirks rather than the Spec.
Caught by: the blind derivation (each case cites a Spec rule, and its value is derived without
running the code) and the missing-requirements angle of the audit.
Budget: up to 6 rounds (proposed).
Steps:
- Round 14 on the prototype: H1, H2 (per Q1), M1 (falsify the graph gate and check both
  directions), M2 (pin D221's 7 unpinned paths), M3 (per Q2), M4 and M5. Write the mutants first.
- Write the Specs with `to-spec`, from the merged Plans and Arpit's answers, never from the
  prototype code. Every Requirement gets Invariants and test obligations at public boundaries.
- Move `conformance/` to a production location: lock, falsify, lies, mutants, reference model,
  issue catalog and `watch.ts`. Keep it behind the `--runtime` adapter, independent of any
  round's internals.
- An oracle writer who is not the builder derives each case's expected results from the Spec.
  Where the design is silent, the case goes to Arpit as a question; the suite doesn't pin it.
- Run the four-angle audit with separate agents, fix from all findings at once, then re-audit.
- Put the fast gates in `nub run verify`, and list the final-commit gates in the Spec.

### 3. Foundation: readily verifiable goal

Goal: the production runtime for everything the prototypes proved, passing the audited suite.
That is `Compiled` and the compiler from the public API; turns, actors, mail and lanes;
operations; the persistence edge and the host adapter with Safari's requirements; diagnostics with
actionable messages; the Story API decided in Q8; and the CLI (check, explain, graph, story,
trace).
Starts when: prerequisites 1 to 10 hold.
Verified by:
- each Task's acceptance, checked by `check-task` in a fresh context;
- the audited suite and every gate at the assembled revision;
- `check-runtime` in real Chrome and Safari;
- lint with zero errors and zero warnings;
- the final independent review.
One iteration: the next ready Task in dependency order: build, check independently, repair.
First, make one narrow path work end to end: Pay, the checkout example, through the public API
in a real browser.
Done when:
- the suite passes on the production runtime at the final revision;
- falsify, lies, `mutate-one` and the graph gate each fail on their broken runtime and pass on
  production;
- the real-browser runs pass;
- every issue code has a case whose expected message names the cause and the fix;
- `nub run verify` passes;
- the completion audit passes.
Stops for the owner:
- a public API change beyond what Arpit accepted;
- a Spec guarantee that can't be met;
- the end.
Could succeed at the wrong thing by: the suite passing because the runtime adapter does the work
the runtime should, or because it still boots the prototype runtime.
Caught by: the lies and mutants run against the production adapter, a review section on the
adapter's size and role, and `check-runtime` on the real interface.
Budget: no round cap (proposed). Review at every 60-minute checkpoint and at each assembled
milestone.
Steps:
- Record the layout in a design (`to-design`), then enable the deferred lint rules.
- Draft the Tasks with `to-task`, split by complete behavior, each with its acceptance and
  evidence path.
- Narrow path first: Pay, end to end on the production runtime, accepted with `check-runtime`.
- Build with `execute-task` and accept with `check-task`. Never accept your own work.
- Error messages: goldens reviewed by someone other than the author, phrased for an agent that
  reads them cold.

### 4. Features not yet prototyped, rounds: not readily verifiable goal

Goal: a settled design and an audited suite slice for each feature `FOR-ARPIT.md` section 6 lists
as not prototyped. Proposed order:
1. entities (`round-9/entity-proposal-2.md`; `listen.load` and `fragstore.row` must pass);
2. streams;
3. record migration;
4. React;
5. server rendering and lazy features (version 1 scope in `FlowState.plan` C2);
6. phones and iOS;
7. `Story.app`, tabs and `Fake.storage`;
8. TanStack DB, last.
Verified by: each feature's suite slice, grown test first and audited against wrong
implementations, with an independent review every round.
One iteration: one round on one feature, using the Method, on the production runtime from
phase 3.
Done when, for each feature: its open questions have Arpit's answers, its slice passes, the
re-audit passes, and its guarantees are in Specs.
Stops for the owner:
- before each feature's first round, to settle its decisions and which calls the runner may make;
- when the slice first passes its audit;
- at the end of each feature, with one page for his read.
Could succeed at the wrong thing by: a slice too lenient to fail, or a feature API that fits the
prototype harness but not real apps.
Caught by: the lying implementations in the audit, and one real fetch or SDK path per feature,
written from the data's real source.
Budget: up to 8 rounds per feature and 50 in total (proposed). A round that produces no new
decision ends the feature early.
Steps:
- Entity stories are written test first, in the Story API from phase 3.
- Keep the outside world thin: one real path per feature. Prior art is cited from `codebases/`.

### 5. Features not yet prototyped, build: readily verifiable goal

Goal: production code for each feature settled in phase 4, built against its audited slice.
Verified by, Done when, Stops and the misfire are as in phase 3, per feature.
One iteration: the next ready Task of the earliest settled feature.
Budget: no round cap (proposed).
Steps: as in phase 3. Each feature gets a narrow path first: one example screen through its
real data source.

### 6. Budgets: performance work

Goal: production budgets in place of the prototype's stress tests (10,000 messages at 6x CPU
slowdown was a stress test, not a target).
Verified by: a benchmark suite run at the baseline and at the final revision under the same
conditions, checked by someone other than the author (`check-benchmark`), with the suite still
green.
One iteration: one isolated change, measured against the accepted baseline. Keep it only if the
checked comparison shows a gain.
Done when: every agreed budget is met on its named device and workload, with no regression.
Stops for the owner: after the checked baselines, to agree the targets; at the end.
Could succeed at the wrong thing by: a speedup that skips work, such as a coalesced write that
drops a flush.
Caught by: `check-benchmark` compares the work done, and the suite and lie gate rerun.
Budget: proposed with the targets, after the baselines.
Steps:
- Name the workloads and devices first: desktop Chrome and Safari, a low-end Android, an iPhone.
- Measure Safari's codec cost (call 14).
- Benchmarks run alone.

### 7. Hardening: readily verifiable goal

Goal: no known finding left without a disposition, and the gates proven again on the whole
system.
Verified by: a harness-only review by an agent with no prior reading; tamper checks and a
change-log audit; real-browser and device runs; the final independent review.
One iteration: one finding group: pin it, teach it to the fake, search or oracle, mark it known
failing, or drop it with a reason.
Done when: every finding from every round has a disposition, including round 6's M5, M6, M10 and
M12; quota and disk durability are measured on a real device; the final review has no blocking
findings; `nub run verify` and the final-commit gates pass.
Stops for the owner: a finding whose fix changes a guarantee; the end.
Could succeed at the wrong thing by: closing findings as "dropped" to finish.
Caught by: the audit checks each drop's reason against the Spec.
Budget: proposed after phase 5.

### 8. Examples and documentation: not verifiable goal

Goal: several example projects and the documentation, judged by Arpit. Candidates: checkout
with Pay, the dispatch desk, an entity-heavy app, and a Next.js server-rendered app.
Verified by: Arpit's judgment, against criteria written first. The checkable part:
- each example builds and type-checks, lints clean with lint-bomb, and runs its Stories in
  `nub run verify`;
- every docs sample compiles against the packed package;
- a fresh agent builds a small feature from the docs alone (`eval`).
One iteration: draft or revise one example or docs section, get an independent review, then put
the open choices to Arpit as numbered questions.
Done when: Arpit accepts each example and the docs, and the checkable criteria pass.
Stops for the owner: every iteration.
Could succeed at the wrong thing by: docs that describe the planned API rather than the built one.
Caught by: samples compiled from the docs against the packed package, and the cold-read trial.
Budget: proposed with the criteria.

### 9. Release: small ticket

Goal: the package published, only as far as Arpit asks.
Verified by: the packed-consumer check for every public route, `nub run verify`, and an
independent review of the release change.
One iteration: implement, check independently, repair.
Done when: acceptance passes at the final revision, and each requested ship stage is confirmed.
Stops for the owner: before each ship stage (publish, land, tag); at the end.
Could succeed at the wrong thing by: publishing a package whose installed form differs from what
was tested.
Caught by: the packed-consumer check on the exact tarball.
Budget: one Task.

## Authority

By default: read, edit within the phase's scope, run checks, repair own defects, update records.
Also allowed, by the owner's approval of this roadmap (all proposed until he approves):
- Commit locally to branch `flow-rewrite` with explicit paths. Never push.
- Start builder and reviewer agents as the Agents section says.
- In the round phases (2 and 4), make design calls under delegation, record the reasons, and list
  them for Arpit to overrule.
- Start the next phase after its audit passes, unless that phase starts with a stop for him.
Everything else still needs the owner: editing `.plan` files, public API changes he hasn't
accepted, relaxing a gate, deleting work the runner did not create, and any publishing.

## Agents

- Builders: Opus, medium effort, every third round high. Reviewers: Opus, high, never the
  builder. Haiku only for research fan-out.
- One agent at a time by default, two at most, for example a builder and its mid-run reviewer.
- Time cap: none. At 60 minutes a reviewer checks a committed checkpoint while the builder keeps
  going. Each builder commits a checkpoint and status file by minute 50 and keeps every blocking
  command under 5 minutes.
- Each brief stands alone: the goal, the steps and checks copied from this roadmap, the shell
  and parallel-run rules from the Method, the write scope, the budget, and what to return.
  Never only a path to the suite.
- Within a minute of starting, confirm each agent is doing something. After that, compare its
  progress with what its brief expected. Stop or replace one that has stalled, and kill its stale
  shells by exact pid.

## Budget

Total: proposed per phase above. Running out is a stop, not success.
Pace (proposed):
- Check usage between agents.
- Stop and report at 90% of the weekly limit. Arpit lifted this stop for the prototypes on
  2026-11-03, so production needs his confirmation.
- Keep usage limits lasting the whole project: one agent at a time by default.

## Decisions about this run

Confirmed:
- Commit locally, never push (AGENTS.md).
- Prototypes never become production code. The conformance harness carries into production, and
  new harness work goes through the runtime adapter (Arpit, 2026-11-02).
- Builders run Opus at medium effort, every third round high; reviews run high (2026-11-02). All
  v3 agents use Opus (handover, 2026-11-01).
- No builder runs past 60 minutes without a mid-session review, and there are no fixed time caps
  (2026-11-02, widened 2026-11-03).
- One agent at a time, two at most (2026-11-03).
- Deterministic runs in parallel, up to 8 processes and about 16 GB. Browsers and benchmarks run
  alone (2026-11-04).
- Shell commands are bounded (2026-11-03).
- "Test the spec, not the code" applies to production, once a current spec exists (2026-11-04).
- Audit the suite from several angles and converge it like a design (2026-11-03).
- The CLI is check, explain, graph, story and trace only (2026-11-02).
- No tla-ts (2026-11-03).
- Entities are optional but not up for cutting (2026-11-01).
- Plan edits wait for Arpit's yes. After approval, they merge with no further sign-off
  (2026-10-28, 2026-11-01).
- Business keys for money (`round-8/RESULTS.md`).

Proposed, as questions for Arpit (answer `R1 A`):
- **R1.** Phases and classes as above, nine phases in five stages. A: accept. B: change them.
  Rec. A.
- **R2.** Round 14 on the prototype fixes H1, H2 and M1-M5 before the suite moves. A: yes, so the
  moved suite has a runtime it passes on. B: fix them only in the Specs and in production.
  Rec. A: a case never seen passing could be wrong too.
- **R3.** Runner. A: Claude as an agent runner, until a stop. B: Arpit, one phase at a time.
  Rec. A.
- **R4.** Feature order in phase 4: entities first, TanStack DB last. A: accept. B: reorder.
  Rec. A: entities are the sync seam the rest depends on.
- **R5.** Budgets: 6 rounds for phase 2, 8 per feature and 50 in total for phase 4, and a 90%
  weekly-usage stop. A: accept. B: change them. Rec. A.
- **R6.** Lint choices in `tools/lint-bomb/FLOW-STATE.md`. A: accept. B: change them. Rec. A.
- **R7.** The old `tools/oxlint/anti-slop/` plugin is no longer referenced. A: delete it. B: keep
  it as prior art. Rec. A.

## Runner rules

1. **Reread every iteration.** Start each iteration by reading `roadmap.md`, `progress.md`, and
   the records the phase names. Trust the files, not memory, so a fresh context loses nothing.
2. **Run only an approved roadmap.**
3. **Write only `progress.md` of the two roadmap files.** It holds the run's state: phase,
   iteration, revision, verdicts, budget used, next action, and what the run waits on. Results go
   to the project's Plans, Tasks, and Specs.
4. **Never edit `roadmap.md` or change a phase's class.** If the roadmap looks wrong (the wrong
   class, a check that cannot be built, the named misfire happening), stop and write the proposed
   change in `progress.md`.
5. **Never weaken a check to pass it.** An expected result changes only for a specific reason,
   logged in the record that owns it. Relaxing a check, target, or budget needs the owner.
6. **Audit before done.** A phase is done only when an agent that did not do the work checks its
   done condition against the evidence, in a fresh context, and passes it. Self-checks do not
   count.
7. **Act within authority.** Read, edit within the phase's scope, run checks, repair your own
   defects, and update records. Do anything else, such as committing, pushing, deleting work you
   did not create, or widening scope, only if the Authority section lists it.
8. **Stop** when a phase is done and the next is not authorized, at a stop for the owner, when
   the budget runs out (report it as not done, with the gap), when a decision is the owner's, when
   the roadmap looks wrong, when passing would mean weakening a check, or when the owner says
   stop. Record the state and the first resume action in `progress.md`.
9. **Claim only what you checked:** what ran, on which revision, and what is still unverified.
10. **Brief agents fully.** An agent you start gets a brief that stands alone: its goal, the steps
    and checks it needs copied from the roadmap, its write scope, its budget, and what to return.
    Follow the Agents section for models, limits, time caps, and stall checks.
