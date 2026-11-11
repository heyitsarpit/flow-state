# Catalog

Every package in the skill library, once, with when to use it. Each one is at
`<library>/NAME/SKILL.md`.
In records a package is a link, `skill:NAME`; `workflow refs skill:NAME` lists what links to it.
Here packages are named in backticks.
Keep this list by hand: when a package is added, renamed, or deleted, change its line here.

## Entry points

- `workflow`: explain the skill library, recommend what to run, answer "what's next?", or stop a
  run.
- `to-epic`: from a Plan, choose and order the playbooks and skills for a task, written as an Epic
  with phases and Tasks; with no Plan, recommend `playbook-plan` first.
- `build-a-loop`: the entry point for long work. Check, in order, that intent is clear (else
  `interview`), a Plan exists (else `playbook-plan`) and an Epic exists (else `to-epic`), then
  write the loop that runs the Epic into the Epic file: starting and resuming, the review cron,
  mid-run instructions, done states and stops.

## Playbooks

- `playbook-prototype`: a design whose correctness shows only under many conditions, settled in
  rounds with a verification suite grown and audited alongside.
- `playbook-reimagine`: look for a much stronger approach before committing to one.
- `playbook-plan`: shape a feature or project into an approved Plan and drafted Tasks.
- `playbook-specify`: write and independently check module Specs for planned work.
- `playbook-build`: build ready Tasks, with independent acceptance, repair, and evidence.
- `playbook-fix`: something is broken; prove the cause, and repair it when asked.
- `playbook-performance`: make something faster or lighter against a workload and budget.
- `playbook-understand`: answer how or why existing work is the way it is, with citations.
- `playbook-ship`: review, open a PR, get it green, land it, or clean up, as far as asked.
- `playbook-improve-skills`: learn from a session, or write, fix, or test a skill.

## Plan and specify

- `interview`: settle the user's decisions in numbered rounds with a recommendation.
- `to-plan`: record outcomes, decisions with reasons, and verification targets in the Plan.
- `to-task`: break an approved Plan or a clear request into checkable Tasks.
- `to-spec`: record a module's Requirements, Invariants, and the tests that catch violations.
- `to-design`: choose how a module is built: representation, state ownership, algorithm.
- `change-impact`: find what a change touches, what could break, and what can be reused.
- `prototype`: settle one design question with the smallest throwaway experiment.

## Build and check

- `execute-task`: implement one ready Task, or an authorized set, with its own checks.
- `check-task`: check a finished Task against its acceptance, by someone other than its author.
- `check-spec`: try to show a Spec is incomplete, and judge whether its tests would catch it.
- `check-runtime`: drive the real interface and record exactly what the run proved.
- `check-benchmark`: test whether a performance number supports its claim before using it.
- `review`: independently review a change against what was agreed and the project's standards.

## Fix and performance

- `diagnose`: find why something fails, from a reproduction or a captured trace or profile.
- `performance`: find what limits speed or resources, by measuring or by modeling costs.
- `hillclimb`: improve one agreed metric through repeated measured attempts with a ledger.

## Explore

- `reimagine-speed`: measure, research comparisons, and propose ambitious performance targets.
- `reimagine-altitude`: look at other ways to serve the purpose behind the task.
- `reimagine-depth`: make a task more rigorous with professional methods and primary evidence.
- `reimagine-range`: borrow techniques from other fields and propose how to test them.

## Understand

- `explain-how`: how existing software works at runtime, one-shot or taught step by step.
- `explain-why`: why code or a decision took its shape, from records and history.
- `catch-up`: rebuild recent context before resuming work.

## Learn

- `reflect`: turn a session's lessons into skill edits, checks, records, or preferences.
- `eval`: test with trials whether a skill or prompt change changes how agents behave.

## Records

- `workflow-cli`: find work (list, next, status), read and write Plans, Epics, Tasks, Specs and
  Epic notes, link records (`@`, `code:`, `skill:`), check them (check, refs).
- `compact-records`: shrink grown records (notes, logs, Task comments, status files, instructions)
  by replaying them against their sources; run at a close-out or when a record passes its limit.

## Principles

Each applies across all work; a package that follows one lists it in `metadata.applies`.

- `principle-design-for-verification`: decide how you will know it works before building it.
- `principle-claim-only-what-you-checked`: report only what the evidence covers.
- `principle-design-for-performance`: name the workload and budget when you design.
- `principle-fix-root-causes`: find the demonstrated cause before choosing a repair.
- `principle-explain-measurements`: check that a measurement means what it claims.
- `principle-enforce-with-structure`: turn a repeated correction into a type, check, or lint.
- `principle-make-work-rerunnable`: script consequential edits, analyses, and checks.
- `principle-truth-is-a-compilation-target`: make the system compile into something checkable.

## Policies

Each is the standard for one kind of work.

- `policy-authority`: what an agent may do without asking, and what needs the user.
- `policy-convergence`: after repeated failed reviews, gather every finding and redesign once.
- `policy-testing`: test observable behavior at public boundaries; audit the tests themselves.
- `policy-verification`: build, prove and maintain verification suites, with a coverage record
  each, and the survey before adding.
- `policy-delegation`: hand work to other agents: models by harness, lead and sidecar roles for
  coding and reviews, briefs, write scopes, results from evidence.
- `policy-code-composition`: module boundaries, interfaces, and how parts compose.
- `policy-code-correctness`: valid states, invariant ownership, and operation contracts.
- `policy-records`: what belongs in Plans, Specs, Epics, Tasks, and explorations; the decision
  convention.
- `policy-writing`: plain, lead-with-the-point prose for records, skills, and instructions.
