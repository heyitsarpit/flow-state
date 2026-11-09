---
name: to-epic
description: >-
  From the user's description of a task, choose and order the playbooks and skills that fit it
  and write the result as Workflow records: an Epic with its goal, stages, scope, constraints,
  authority and budget, one phase per unit of work with its class and its verification suites,
  and every Task through to-task. Shows the user a one-page summary first and writes only after
  the user confirms it. Use for a task that needs more than one playbook or a long run, after its Plan exists
  (playbook-plan first if it has none); then write its loop with to-loop. Does no work toward the
  goal.
metadata:
  kind: procedure
  applies:
    - principle-design-for-verification
    - policy-verification
    - policy-delegation
    - policy-authority
    - policy-records
    - policy-writing
---

# To Epic

The user describes a task. You choose the playbooks and skills from this skill library that fit
it, put them in order, and write the result as an Epic: phases, each verified or decided in a
stated way, and the Tasks inside them. You write the plan of work. You do none of the work, and you
start nothing. How the Epic is run (who builds, who reviews, how often, when to stop) is its loop,
written into the same file afterwards by skill:to-loop.

## Start here: the Plan comes before the Epic

Long work goes in this order: skill:interview, only if the user's intent is unclear;
skill:playbook-plan, only if the work has no adequate Plan; this skill, which writes the Epic from
the Plan; then skill:to-loop. Before you read further, check for a Plan that covers the work. If
there is none, recommend skill:playbook-plan (or skill:interview first when the intent itself is
unclear) and stop; you never run another procedure skill yourself. Write the Epic from the Plan.

## Terms

These terms are shared. skill:to-loop links this list and repeats a few entries word for word,
which the library's validator checks. Both skills, and the Epics they write, use each word only in
the sense given here.

The skill library:

- **Skill library and suite:** this collection of skills is the **skill library**. A **suite** is
  always a set of tests, benchmarks or other checks.
- **Package:** one folder of the skill library, holding a `SKILL.md`; named in records as
  skill:NAME.
- **Skill:** a package that holds one method with inputs, steps and a result.
- **Playbook:** a package that combines skills into one assignment with an endpoint.
- **Policy:** a package that sets the standard for one kind of work, such as tests or records.
- **Principle:** a package that states one belief shaping judgment across all work.
- **Library revision:** the commit of the skill library the packages were read from. An Epic has
  one: its `skill` field, which pins to-epic, to-loop and every package the Epic links.
- **The library's validator:** the library's own check of its packages (names, declared
  dependencies, links and these shared terms), `scripts/validate-suite.py` in the library's
  repository.
- **Tools record:** skill:setup-workflow's `tools.md`, which records the project's commands, model
  preferences and the installed library revision.

Records and planning:

- **Workflow records:** the plain-text files the `workflow` CLI formats, checks and links: Plans in
  `workflow/plans/`, Epics, phases and Tasks in `workflow/tasks/`, and Specs where the project
  keeps them. `workflow check` validates them and resolves every link in them.
- **Plan:** the project's decision record: outcomes, decisions with their reasons, constraints, and
  verification targets.
- **Spec:** one module's contract: its Requirements and Invariants.
- **Epic:** one large piece of work as a record, `workflow/tasks/<EPIC>/epic.task`: its goal,
  stages, scope, authority and budget, then its loop and its notes. Its phases are files beside it.
- **Contract fields:** the Epic's fields before its loop: `title`, `status`, `description`,
  `blocked_by` and `derives_from`. The first field after them, `skill`, is the Epic's one pin: the
  skill library's name and revision (for example `workflow@ab12cd3`), which every linked skill is
  read at. skill:to-epic writes it when it creates the Epic, because the plan is read at that
  revision too; the loop fields follow it.
- **Deferred item:** a finding or piece of work set aside on purpose. It is recorded as an Epic note
  starting "Deferred:", and in the project's deferred list if it keeps one.
- **Usage:** the agent harness's usage windows (for example a weekly limit). Read them from the
  harness's usage view or command; where none exists, count iterations against the budget instead
  and say so in the summary.
- **Stage and phase:** a **phase** is one unit of work with one class, one set of exit criteria and
  one file. A **stage** groups phases and ends at its **stage exit**, a condition the user cares
  about. The summary shows stages; the records hold phases.
- **Class:** how a phase is settled, asked in this order (section 2): non-verifiable (by a ruling),
  not readily verifiable (by a suite that must be built and proven first), verifiable (by a proven
  suite). A part of a phase whose suite turns out wrong or fails its survey follows the not readily
  verifiable rules until its suite is proven again; that is not a stop, and the phase keeps its class.
- **Kind:** what a phase delivers, which sets its iteration and its stops: `ticket`, `feature` or
  `performance` for verifiable work, `verification-suite` for a not readily verifiable phase that
  builds and proves a suite. A non-verifiable phase has no kind.
- **Area:** one part of the system with its own verification suite, such as a module or a protocol
  feature. A phase whose code and suite grow together is split into areas.
- **Task:** one bounded piece of work inside a phase, with its acceptance criteria and its
  evidence.
- **Item:** a phase or Task. A **new item** is one added after the user approved the Epic.
- **Exit criteria and acceptance criteria:** **exit criteria** are the conditions that must hold
  for a phase to end. **Acceptance criteria** are the conditions a Task must meet to be accepted;
  they live in its `acceptance` field.
- **Iteration:** one pass of a phase's work: build or draft, check, review, gather the findings.
- **Proposal file:** the draft for a non-verifiable phase's decisions, with their criteria, kept
  where the Epic's Locations line says.
- **Note:** a timestamped, append-only entry at the end of the Epic file.
- **Guarantee:** a promise users rely on, recorded as a Spec Requirement or Invariant or a Plan
  outcome.
- **Judge:** who rules on a non-verifiable decision: the user, or an agent that did not write the
  draft (a reviewing agent, or the orchestrator for its own calls).
- **Decision pending the user's read:** a decision an agent made under delegation, written in
  skill:policy-records's decision convention with its reason and how to reverse it, for the user to
  review while work goes on.

Verification:

- **Check:** anything that runs and returns a verdict: a test, a lint, a script.
- **Gate:** a check that must pass before work moves on: before a Task, phase or stage is done. A
  lint, type or format gate is proven by a planted violation, a probe file it must reject.
- **Verification target:** a condition that must hold, recorded in the Plan or a Spec
  (skill:principle-design-for-verification).
- **Verification suite:** the executable artifact that decides whether a verification target
  holds: a test suite, an end-to-end test and its driver (the script that runs the real
  interface), a reference model, a benchmark suite, a data check (skill:policy-verification).
- **Coverage record:** the one record per verification suite that says what it covers, how to
  rerun it, its mutants, its audit and its scope (skill:policy-verification#the-coverage-record).
- **Matched at:** the coverage record's revision at which the suite last ran end to end, killed
  every mutant and kept a valid audit (skill:policy-verification#the-coverage-record).
- **Test oracle:** the source of the correct result for an input: a Spec, a worked example, a
  reference model. It never comes from the code under test.
- **Reference model:** a small model of the requirements, written from them and importing nothing
  from the code under test, that serves as a test oracle. "Model" alone means an AI model.
- **Test double:** a stand-in for a real component in a test: a fake works through a shortcut, a
  stub returns canned answers, a mock checks the calls it receives.
- **Mutant:** a deliberately wrong version of the code, with one or more planted faults, such as a
  null, broken or tampered implementation. A verification suite **kills** it by failing on it, for
  the expected reason; a mutant the suite passes **survived**.
- **Proven:** a verification suite that has run end to end, killed every mutant at its `Matched
  at` revision with no covered code changed since, and passed its audit. An existing suite must
  also pass its survey before adding.
- **Survey before adding:** the impact analysis done before new code is built against existing
  verification suites: which suites the change touches, whether they still cover it, and whether
  they are still correct (skill:policy-verification#maintain).
- **Audit and re-audit:** an **audit** is a review of a verification suite by an agent that did not
  build it, which writes its own mutants from the requirements to make the suite pass wrong code
  (skill:policy-testing#audit-a-suite). A **re-audit** is the same audit again after the suite was
  fixed or changed.
- **False pass:** a check that passes on wrong behavior. In an agent, it is often specification
  gaming: meeting the letter of a goal but not its intent.
- **Regression test:** a test kept after a fix, so the failure cannot return unnoticed.
- **Flaky and hermetic tests:** a **flaky test** sometimes fails on correct code, from clocks,
  scheduling or the network. A **hermetic test** brings everything it needs and assumes nothing
  about order or shared state.
- **Walking skeleton:** the first narrow path built end to end for a real consumer; it grows into
  the product and is not thrown away.
- **Prototype:** throwaway code built to answer a question (skill:playbook-prototype). Its findings
  carry over into the Plan and Specs; its code does not.
- **Revision:** the exact version of the code a result belongs to, named by its commit id.

Agents and the run:

- **Orchestrator:** the agent that runs the loop. It starts and tracks the other agents, routes
  their results, sets statuses and writes notes. It never builds.
- **Lead and sidecar:** a **lead** runs on the strongest model and does the work that needs
  judgment. A **building lead** also integrates its sidecars' work into one change and commits it;
  reviewing and auditing leads never edit code or the records they review, and write only their own
  comments and notes. A **sidecar** runs on the cheapest model and does one
  bounded slice for the lead that started it (skill:policy-delegation). The **builder** is the
  building lead at work.
- **Agent harness and test harness:** an **agent harness** is the tool that runs agents, such as
  Claude Code or Codex. A **test harness** is the code that runs a test suite. In Codex, Sol and
  Luna are the strongest and cheapest models.
- **Session cron:** a scheduled prompt that lives only in the agent session, such as Claude Code's
  session cron, created with the harness's own scheduling tool.
- **Wake:** a moment the orchestrator acts: an agent finishes, a scheduled check fires, or the user
  returns.
- **Independent:** done by an agent that did none of the work it checks, in a fresh context.
- **Checkpoint:** a commit the builder makes at a stable point, with its checks run and its records
  up to date. Reviews look at checkpoints; a run resumes from one.
- **Close-out review and completion audit:** a **close-out review** is an independent review of the
  last checkpoint at the end of each phase, and of each area when a phase is split into areas. A
  **completion audit** is an independent check of a phase's exit criteria, or the Epic's goal, in a
  fresh context.
- **Convergence:** redesigning once from every finding at once, instead of patching one finding at
  a time (skill:policy-convergence).
- **Convergence threshold and failure limit:** the **convergence threshold** is the number of
  consecutive reviews that find the same root cause in the same part; reaching it means converge.
  It defaults to 2, skill:policy-convergence's "the same part fails twice". The **failure limit**
  is how many failures with the same root cause, after convergence, end a phase.
- **Stop:** a point where work cannot go on without the user. Everything else the user should see
  is recorded for the user's read while work goes on. The stop list is skill:to-loop's R20.
- **Usage limit, usage reserve and pace:** the **usage limit** is the agent harness's allowance per
  usage window. The **usage reserve** is the share of it kept unspent; reaching it stops the run.
  The **pace** is the usage planned per iteration. All three are set in the Epic's Budget section.
- **Cold read:** a fresh agent given only the named files, to prove they stand alone. It is a
  review, not a check.
- **Root-cause class:** a group of findings with one shared cause (skill:policy-convergence); these
  skills say "the same root cause" for it.

Also named: skill:interview asks the user numbered rounds of questions, each with before-and-after
examples and a recommendation; skill:setup-workflow writes the tools record; skill:catch-up
rebuilds where work stands from records and the repository before resuming.

## Why an Epic

Given only a goal, an agent picks its own methods and checks, judges its own result and decides
for itself when it is done. Long runs then fail in familiar ways: the wrong method for the kind of
work, done declared early, a check weakened until it passes, the wrong thing built well, a failure
patched one step at a time without end, a review that never happens, or the budget spent and
reported as success. The Epic settles each of those in writing, and the user confirms it, before
any work starts.

The library has a method for each weak point: independent checks (skill:check-task,
skill:review), verification suites that must kill their mutants (skill:policy-verification,
skill:policy-testing), redesign from all findings at once (skill:policy-convergence),
measurements that mean what they claim (skill:check-benchmark), records a fresh agent can continue
from (skill:policy-records), what an agent may do without asking (skill:policy-authority), and how
to run other agents (skill:policy-delegation).

You read the library once, while you write the Epic. It need not be installed: `<library>` is the
folder that holds this skill's folder, and every package is at `<library>/NAME/SKILL.md`. Each
class below names the packages that usually fit; for anything they miss, read the `name` and
`description` of the packages beside this one. Read the `SKILL.md` of each package you choose.

Write what the orchestrator needs from each package into the phase card: when it applies, its
method in a line or two, and the package as skill:NAME. Never copy a whole method into a record;
a copy drifts from its source. Link it instead, at the Epic's one library revision.

## Where everything goes

Everything lives in Workflow records under `workflow/tasks/<EPIC>/`. [The
template](references/template.md) shows each record.

| Content                                                                                   | Record                                                                      |
|-------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------|
| Title, approval state                                                                     | Epic `title`; `status` `draft`, then `active` once the user approves        |
| The library revision                                                                      | Epic `skill`, the one pin                                                   |
| Goal, records, locations, stages, scope, constraints, authority, budget, project glossary | Epic `description`                                                          |
| Each phase: class, kind, suites, iteration, exit criteria, false pass, gates, stops       | Phase `description` (the phase card)                                        |
| Each piece of work, with skill:to-task's five-line block; class and kind as labels        | A Task, written with skill:to-task                                          |
| Verification targets and the coverage records of their suites                             | The Plan's `verification` entries (skill:policy-verification)               |
| The queue, and each phase with its Tasks                                                  | Derived: `workflow next --epic <EPIC>`, `workflow show @epic.<EPIC> --tree` |
| Agents, cadence, this project's overrides of the run rules                                | The loop, written by skill:to-loop                                          |
| Approvals, rulings, stops, events                                                         | Epic notes                                                                  |
| Decisions pending the user's read                                                         | A note, or the record the decision governs (skill:policy-records)           |
| Per-Task results                                                                          | Task comments                                                               |
| Phase results, including the completion audit's PASS                                      | Phase comments                                                              |

## 1. Read

Work from the project root. Start with `workflow --help`. Look up facts yourself instead of asking:
the request, existing Plans, Epics, Tasks and Specs, the code where it matters, the existing
verification suites and their coverage records, and the `SKILL.md` of every package you will
name. Read the user's standing rules too: project instruction files (for example AGENTS.md,
CLAUDE.md), any memory or handoff files, and the latest notes of any running Epic. Collect every
constraint the user has set, with its source, date and scope; a constraint set for one stage may
not hold for the next. They go into the Epic's Constraints section, where skill:to-loop reads them.

## 2. Choose a class for each phase

Split the goal into phases. Each phase has exactly one class, chosen by how its result is verified
or decided. Ask in this order; the first yes decides:

1. Can only a ruling decide it, by the user or by an agent? **Non-verifiable.**
2. Does a proven verification suite cover it? **Verifiable.** Also verifiable when a suite follows
   directly from agreed requirements, such as tests written straight from a Spec, with no design
   or audit of its own: the phase's first Task writes and proves the suite, and the work Tasks are
   blocked by it (skill:policy-verification#split-work-that-has-no-proven-suite).
3. Otherwise **not readily verifiable:** the suite needs its own design or audit. It gets its own
   phase of kind `verification-suite`, which builds and proves it; the work follows in a verifiable
   phase.

Label every Task of a phase with its class, `verifiable`, `not-readily-verifiable` or
`non-verifiable`, and with its kind as a separate label; a non-verifiable Task carries no kind
label. A class says how a phase is verified or decided; it does not choose a playbook by itself.
The same class can be met in production code or in a prototype, and the user's constraints decide
which.

### Verifiable

Its verification suites decide it.

- **Verified by:** the phase's named suites, each with where its coverage record lives; each
  Task's acceptance criteria, checked independently (skill:check-task); the project's tests;
  behavior on the real interface (skill:check-runtime) where users touch it.
- **Before building:** run the survey before adding on the existing suites the work touches
  (skill:policy-verification#maintain). A part whose suite fails it follows the not readily
  verifiable rules until its suite is extended and proven again; the rest of the phase goes on.
- **One iteration and its stops:** set by the phase's kind (below). Every phase also has the stop
  list (skill:to-loop#rules, R20).
- **Exit criteria:** every suite passes at the final revision with no regression, and the
  completion audit passes.

The kind changes the iteration and the stops, never how the phase is verified:

- **Ticket** (label `ticket`).
  - One iteration: one bounded change: implement, check independently, repair. A fixed bug gets
    a regression test.
  - Stops: the stop list only.
  - Draw from: skill:playbook-build (skill:playbook-fix when something is broken), skill:to-task,
    skill:execute-task, skill:check-task.
- **Feature** (label `feature`), including a port to another runtime or platform.
  - One iteration: the next ready Task in dependency order: build, check independently, repair.
    Build a walking skeleton before building broadly.
  - Stops: the stop list only; it already covers decisions only the user can make and guarantee
    changes.
  - Draw from: skill:playbook-build (its long-runs reference), skill:playbook-specify when
    contracts are missing, skill:execute-task, skill:check-task, skill:check-runtime,
    skill:review, skill:diagnose.
- **Performance** (label `performance`).
  - One iteration: one isolated change, measured against the accepted baseline under the same
    conditions; kept only if the checked comparison shows a gain, with the tests still green.
  - Stops: after the checked baseline, to agree the performance budget unless already agreed;
    then the stop list.
  - Draw from: skill:playbook-performance, skill:performance, skill:hillclimb,
    skill:check-benchmark, skill:principle-explain-measurements; skill:reimagine-speed for an
    ambitious budget.

A performance phase needs a proven benchmark suite; without one, the benchmark suite is built
first, in a not readily verifiable phase of kind `verification-suite`.

### Not readily verifiable

No proven verification suite covers it yet, and the suite needs its own design or audit:
correctness shows only under many conditions, or the test oracle is itself hard to build.
Examples: a runtime, a protocol, a sync engine, a scheduler, a compiler pass, a data migration, an
end-to-end user journey that nothing drives yet.

- **Split it in two** (skill:policy-verification). First a phase of kind `verification-suite`:
  build and prove the suite. Then the work, in a verifiable phase built against it.
- **Verified by:** the suite run end to end, every mutant killed and the suite passing again after
  the revert, and an audit by a lead that did not build it (skill:policy-testing#audit-a-suite).
- **One iteration:** grow the suite from the requirements, run it on the current code, run its
  mutants, get an independent review, then gather the findings by root cause before the next
  iteration.
- **Exit criteria:** everything under "Prove" in skill:policy-verification holds and the coverage
  record exists, with each guarantee it covers recorded in a Spec or the Plan. The completion
  audit reads the coverage record, never the tests.
- **Stops:** before the first iteration, to settle open decisions and which calls the agent may
  make; when the suite adds or changes a guarantee (a change to the coverage record that touches no
  guarantee is a decision pending the user's read); then the stop list.
- **Code and suite that grow together** (a runtime, a protocol, a compiler): one phase of kind
  `verification-suite` that holds both the suite Tasks and the product Tasks, split into areas. It
  keeps this class until every area's suite is proven; each iteration splits per area: an area with
  a proven suite is built against it, an area without one gets its suite first
  (skill:policy-verification#split-work-that-has-no-proven-suite).
- **Prototype (optional).** The work can run in production code, with the suite growing inside it
  and convergence between iterations, or in a prototype (skill:playbook-prototype). A prototype is
  the user's choice: suggest it to the user, use one only when the user asks, or when no earlier
  evidence exists and the user agrees, and reuse earlier evidence that still holds. The phase card
  says "Prototype: yes" when it uses one; skill:to-loop's prototype rules then apply to it.
- **Draw from:** skill:policy-verification, skill:policy-testing, skill:policy-convergence,
  skill:review, skill:check-benchmark, skill:to-spec, skill:to-design,
  skill:principle-truth-is-a-compilation-target; skill:playbook-prototype and skill:prototype only
  for a prototype.

### Non-verifiable

No check decides it; a ruling does: an API's shape, naming, documentation, product direction, a
skill's wording. The ruling belongs to a judge.

- **Decisions and judges, named up front:** list each decision the phase must make, with the
  question, the recommended answer and its reason, the judge, and how reversible it is. You propose
  each judge in the summary (section 3); the user confirms them there, and the orchestrator applies
  them. The judge is the user when the decision is a public entry-point name, a new concept or a
  large API change, a guarantee, scope or budget, or touches a preference the user has stated.
  Small public API changes (a flag, a default, a field or member name, where an option sits: any
  surface others call) are the orchestrator's, noted for the user's read (skill:policy-authority).
  Otherwise the judge is a reviewing agent that did not write the draft. A decision found during
  the phase gets its judge by the same rule: a user decision is a stop; an agent decision is
  pending the user's read.
- **Criteria:** drafted before the first draft and approved by the decision's judge. They live in
  the proposal file beside the draft.
- **Verified by:** the judge's ruling against the approved criteria. Independent reviews are advice.
- **One iteration:** draft or redesign the proposal file, get an independent review, gather its
  findings, then put each open decision to its judge: user decisions as numbered questions with
  before-and-after examples, batched into one round (skill:interview); agent decisions ruled with
  reasons, pending the user's read.
- **Exit criteria:** every decision has its judge's ruling, recorded in the Plan; the phase ends
  when a round produces no new decision.
- **Stops:** each round of user-judged decisions; then the stop list.
- **Draw from:** skill:interview, skill:playbook-reimagine, skill:playbook-plan,
  skill:policy-convergence, skill:review, skill:policy-writing; skill:eval when the subject is a
  skill or a prompt.

### Moving between classes

- **Toward more checks.** Where a check can be built, plan a phase that builds it. Part of a
  non-verifiable phase becomes checkable when a criterion turns into a check, such as examples that
  compile or an skill:eval trial. Each such move is its own phase, whose exit criteria are that the
  new check exists and is proven.
- **Back, when a suite is wrong.** When a verifiable phase finds its suite wrong (it passes wrong
  code, fails right code, or fails its survey before adding), only that part follows the not
  readily verifiable rules: fix or extend the suite, prove it again, then resume the part. The rest
  of the phase goes on, and the phase keeps its class.
- **A guarantee change** is one event, whichever phase finds it: a finding, a fix or a design that
  adds, drops or changes a recorded guarantee. It is always a stop, and the affected part follows
  the not readily verifiable rules until its suite is changed and proven again.

### Examples

A new service taken to production:

1. Public API direction, non-verifiable: exit criteria, every decision has its judge's ruling, in
   the Plan.
2. Core behavior and its scenario suite, grown together, `verification-suite`, split into areas:
   exit criteria, every area's suite is proven and passes, and the re-audit passes.
3. The remaining features, verifiable, `feature`: built against the proven suite.
4. Latency budgets: a benchmark suite (`verification-suite`), then the performance work
   (`performance`), with the Plan's budgets met as exit criteria.
5. Release, verifiable, `ticket`: as far as the user asks (skill:playbook-ship).

Export to CSV in a web app: the export format, non-verifiable (the user's ruling); an end-to-end
test whose driver runs the real export through the UI and checks the downloaded file, not readily
verifiable (`verification-suite`); the export itself, verifiable (`feature`).

A nightly data job that silently drops rows: one verifiable `ticket` phase, because the check
follows directly from the requirement: its first Task writes and proves a data check that compares
input and output row counts on recorded inputs; the fix is built against it.

## 3. Show the summary, then stop

Before writing any record, show the user one page:

- **Goal,** in the user's words.
- **Scope:** bounds, assumptions and exclusions, naming deferred features, prototypes, and
  earlier evidence to reuse.
- **Phases in order,** each with its class, its kind, and its exit criteria in one line, grouped
  into three to seven stages, each with its stage exit.
- **Judges:** for each decision you can foresee in a non-verifiable phase, its proposed judge.
- **Budget:** the total, the per-phase budgets and the usage reserve.
- **Authority headline:** what the agents may do without asking, and what stays the user's.
- **Loop headline:** the lead and sidecar models, the review cadence, and the stops.
- **Constraints** you found, each with its source.
- **Main risks.**
- **At most five numbered questions,** each with before and after and a recommendation, in
  skill:interview's round format.

Stop until the user confirms or changes it. Write only from the confirmed summary, and record
where and when the user confirmed it in the Epic's first note. The loop headline is where
skill:to-loop starts; the user approves the written loop together with the Epic (section 4, step
12).

## 4. Write the Epic

Create records with `workflow create` and edit longer prose with the Edit tool. Write for a fresh
reader throughout: every path in full from the repository root, and every budget as a number.

1. **Create the Epic** with `status draft` and its `skill` field, `workflow@<revision>` (the library name and revision), where
   `<revision>` is the library revision (`git -C <library> rev-parse --short HEAD`; in an installed
   copy, the tools record's). This is the Epic's one pin. Its description holds, in this order: the
   goal in the user's words; "Built with skill:to-epic at the library revision in `skill`"; the
   Records line (the Plan and Specs, as `@` links); the Locations line (where the code, the
   verification suites, the proposal files and the examples live); the stages and stage exits
   table; the scope; the constraints, each with its source, date and scope; the authority (step
   6); the budget (step 5); and last, a glossary.
2. **Write the glossary** with this project's terms only. It links the library's terms
   (skill:to-epic#terms) and never copies them.
3. **Write the phases,** one file per phase, in the order they run. Choose the packages that fit
   each; drop one the phase does not need, and add one the class misses if the task calls for it.
   The phase card (its `description`) holds the class and, except for a non-verifiable phase, the
   kind; the goal; "Verified by", naming each verification suite and where its coverage record
   lives; one iteration; the exit criteria; its `Failure limit:` (default: the Epic's); and for each
   package, when it applies, its method in a line, and skill:NAME. Every step must be doable from the records and the named packages alone.
   A phase has no status of its own: it is done when every Task in it is done and its completion
   audit's PASS is a phase comment.
4. **Name the likely false pass** of each phase and the check that catches it. A suite too lenient
   to fail: caught by its mutants and its audit. A speedup that skipped work: caught by
   skill:check-benchmark comparing the work done. A feature that passes tests whose test doubles
   stand in for its boundary: caught by skill:check-runtime on the real interface. A proposal that
   answers the brief but not the need: caught by the user's criteria, written first.
5. **Set the budget** in the Epic's Budget section: the total, the usage reserve, the pace, the
   failure limit (the default for each phase card's `Failure limit:` line), and a table of each
   phase's budget (iterations, time and usage). A Task's or new item's own `Budget:` line is that item's budget, within its phase's. Running out is a stop, not
   success.
6. **Write the authority.** By default the orchestrator and its agents may read, edit within the
   phase's scope, run checks, repair their own defects and update records, including writing
   coverage records and agent-judged rulings into the Plan. List what else they may do, such as
   starting the next phase, committing to a named branch, starting subagents, or deleting proposal
   and design files outside the Epic once absorbed (skill:policy-authority). Then split the calls.
   The orchestrator decides what is delegated to it, including small public API changes (a flag, a
   default, a field or member name, where an option sits: any surface others call), each noted for
   the user's read. The user decides public entry-point names, new concepts, large API changes,
   relaxing a gate, changes to the Plan's decisions or outcomes, scope and budgets. Once the user
   approves the Epic, the list is the user's explicit request for those actions. Everything not
   listed still needs the user.
7. **Separate stops from the user's read.** A stop is only what cannot go on without the user: a
   decision only the user can make, publishing, or a step only the user can do. Everything else is
   recorded for the user's read: a decision with its reason, evidence and how to reverse it, while
   the work goes on. Each phase card says "Stops: ..." and "User's read: ...", and names the gates
   of the phase: the mutants or planted violations each must reject, and where they live. A gate
   that has not rejected them at the current revision counts as unrun (skill:policy-verification).
8. **Write the Tasks with skill:to-task,** which holds the method and the five-line block every
   Epic Task ends with. Label each with its phase's class and kind. A Task that builds a
   verification suite has "Prove" in skill:policy-verification and the suite's coverage record as
   its acceptance criteria. Where a Task names its source before its Plan exists, write the
   decision and who made it in the description; link `derives_from` once the Plan exists.
9. **Mark decisions.** Every decision about the run is either confirmed (the user said so; a note
   says where and when) or proposed. Product decisions go to the Plan.
10. **Format and check.** For each changed file, `workflow format PATH --write`, then `workflow
    check` (it fails on any dangling link), `workflow show @epic.<EPIC> --tree`, and `workflow next
    --epic <EPIC>` once the Epic is active. Read the diff.
11. **Check it cold.** Give a fresh agent only the Epic and phase files. It must say what each
    phase does first, how it judges a result, when it stops, and what it may not do. Fix whatever
    it got wrong.
12. **Get approval of the Epic and its loop together.** Hand the `draft` Epic to skill:to-loop,
    which writes the loop into it and shows the user the loop, or its difference from the
    confirmed loop headline. Then present the Epic and its loop, with the proposed decisions as
    numbered questions. When the user approves both, set `status active` and append a note quoting
    the user's words, with where and when. An orchestrator never runs a `draft` Epic. If the user
    will run the phases by hand, skip the loop and say so in that note.

## Adding work later

Read this skill before adding a phase, skill:to-task before adding or editing a Task, and
skill:to-loop before changing the loop fields (`run`, `instructions`, `cadence`, `stops`), each at
the pinned revision. Every new item is built with this skill and skill:to-task, never freehand:
choose its class and kind (section 2), name its packages, and write its goal, suites, one iteration, exit criteria,
false pass, gates, budget, stops and user's read (section 4, steps 3-7); then cold-read the new
item on its own. An item too small for a phase, such as one Task inside a phase, still names its
class, kind, acceptance criteria, gates and false pass in skill:to-task's five-line block. A new
item's own `Stops:` and `Budget:` lines belong to the item; they are not a change to the Epic's
`stops` or Budget section.

A proposal to add work is the new item itself plus a note saying it was built this way, with who
decided and what it costs:

- **The orchestrator's:** inserting a Task, splitting a phase that keeps its goal, or reordering
  without breaking a dependency.
- **The user's, and a stop for the part it touches:** a phase with a new goal, a changed Epic
  goal, the budget, reclassifying a phase as non-verifiable (settled by a ruling instead of a
  check), or a change to the authority or `stops`; a change to the frame is an Amendment note
  (skill:to-loop, R16).

## Return

Return the Epic path, the confirmed summary, the phases with their classes and kinds, the proposed
decisions waiting on the user, the cold-read result, and what stayed unverified. Then stop. You do
not start the run.
