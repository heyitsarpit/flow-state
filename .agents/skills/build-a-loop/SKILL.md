---
name: build-a-loop
description: >-
  Write the loop that runs an Epic into the Epic itself: how to start and resume it, a link to the
  run rules this skill keeps as defaults at the Epic's library revision, this project's overrides
  of them, the review cadence and the stops, so a fresh orchestrator pointed at the Epic file can
  run the work. Entry point for long work: checks that the Plan and Epic exist and recommends
  the missing step first. Runs nothing.
metadata:
  kind: procedure
  applies:
    - policy-delegation
    - policy-authority
    - policy-records
    - policy-writing
    - principle-claim-only-what-you-checked
---

# Build a Loop

An Epic (written by skill:to-epic) says what work to do, in which phases, and how each phase is
verified or decided. Its **loop** says how that work is run: who builds, who reviews and how often,
what the user has said about this project, and when to stop. This skill writes the loop into the
`draft` Epic file and runs nothing; the user approves the Epic and its loop together. Starting a
run is then one line: "run the loop in `workflow/tasks/<EPIC>/epic.task`". The agent given that
line is the orchestrator; it follows the loop's `run` and opens only the packages the loop names.

## Start here: what must exist first

Long work goes in this order: skill:interview, only if the user's intent is unclear;
skill:playbook-plan, only if the work has no adequate Plan; skill:to-epic, which writes the Epic
from the Plan; then this skill, which writes the loop. Check in that order. If intent is unclear,
recommend skill:interview to extract it in full; if there is no adequate Plan, recommend
skill:playbook-plan; if there is no Epic, recommend skill:to-epic. Say which is missing and why, and
stop: you never run another procedure skill yourself. Continue only when the Plan and a `draft`
Epic exist.

## Terms

Read this skill with skill:to-epic#terms, where every term is defined once. The entries below are
the ones this skill uses most, copied from there word for word; the library's validator checks
that they match.

- **Epic:** one large piece of work as a record, `workflow/tasks/<EPIC>/epic.task`: its goal,
  stages, scope, authority and limits, then its loop. Its notes are in `log.task` and its phases
  are files beside it.
- **Orchestrator:** the agent that runs the loop. It starts and tracks the other agents, routes
  their results, sets statuses and writes notes. It never builds.
- **Lead and sidecar:** a **lead** runs on the strongest model and does the work that needs
  judgment. A **building lead** also writes every line it commits and commits it; reviewing and
  auditing leads never edit code or the records they review, and write only their own comments and
  notes. A **sidecar** runs on the cheapest model and does one bounded slice for the lead that
  started it, never writing committed code (skill:policy-delegation). The **builder** is the
  building lead at work.
- **Session cron:** a scheduled prompt that lives only in the agent session, such as Claude Code's
  session cron, created with the harness's own scheduling tool.
- **Wake:** a moment the orchestrator acts: an agent finishes, a scheduled check fires, or the user
  returns.
- **Checkpoint:** a commit the builder makes at a stable point, with its checks run and its records
  up to date. Reviews look at checkpoints; a run resumes from one.
- **Close-out review and completion audit:** a **close-out review** is an independent review of the
  last checkpoint at the end of each phase, and of each area when a phase is split into areas. A
  **completion audit** is an independent check of a phase's exit criteria, or the Epic's goal, in a
  fresh context.
- **Convergence threshold and failure limit:** the **convergence threshold** is the number of
  consecutive reviews that find the same root cause in the same part; reaching it means converge.
  It defaults to 2, skill:policy-convergence's "the same part fails twice". The **failure limit**
  is how many failures with the same root cause, after convergence, end a phase.
- **Stop:** a point where work cannot go on without the user. Everything else the user should see
  is recorded for the user's read while work goes on. The stop list is skill:build-a-loop's R20.
- **Usage limit and usage reserve:** the **usage limit** is always the agent harness's weekly
  allowance across all models, never a shorter window such as a 5-hour limit. The **usage
  reserve** is written as the weekly usage, in percent used, at which the run stops (for example
  "stop at 50 percent weekly"); reaching it stops the run. It is set in the Epic's Limits section,
  and the user changes it as their planned work changes.
- **Note:** a timestamped, append-only entry in the Epic's `log.task`, beside its Epic file.
- **Agent decision:** a decision an agent made under delegation, written in
  skill:policy-records's decision convention with its reason and how to reverse it. Work goes on,
  and the user may overturn it at any time.

## Where the loop lives

The loop is a set of fields in the Epic file, after its contract fields, which `workflow check`
validates and whose links it resolves:

| Field              | Holds                                                                                              |
|--------------------|----------------------------------------------------------------------------------------------------|
| `skill`            | The Epic's one library pin, such as `workflow@9b1dd09`, written by skill:to-epic                    |
| `run`              | How to start and resume the run, and the link to [the rules](#rules) at the pinned library revision |
| `instructions`     | The models, this project's overrides of the rules' defaults, and the user's mid-run instructions, each with its source |
| `cadence`          | The review cron: its expression, its exact prompt, and the quiet rule                             |
| `stops`            | The stops this Epic adds                                                                           |
| `note <timestamp>` | In `log.task` beside the Epic: append-only rulings, agent decisions, stops, events                |

**The rules live once, in this skill,** under [Rules](#rules), as defaults. The Epic never copies
them: its `run` links them, with skill:policy-delegation and skill:policy-verification, at the
library revision its `skill` field pins. A rule therefore cannot change under a running loop; the
pin moves only with the user's yes, recorded in an Amendment note (R16). The Epic's `instructions` override
any default for that project, each with its source. The user's constraints from before the run are
in the Epic's Constraints section, and its limits only in its Limits section; `instructions`
links them, never copies them.

## Write the loop

Write the loop into the `draft` Epic, after the user confirmed its summary.

1. **Read** the Epic file, `workflow show @epic.<EPIC> --tree`, and the Plans and Specs it links.
   Take the user's constraints from the Epic's Constraints section rather than asking again; check
   project instruction files (for example AGENTS.md, CLAUDE.md), memory and handoff files only for
   constraints newer than the Epic.
2. **Detect the agent harness and choose the lead and sidecar models** by skill:policy-delegation,
   starting from the loop headline in the summary the user confirmed (skill:to-epic). Note each
   difference from it, with its reason, for step 10.
3. **Check `skill`.** skill:to-epic wrote the Epic's one library pin. If the library you read this
   skill from is at another revision, ask the user which to use; never write a second pin.
4. **Write `run`** from [the template](references/template.md): the start and resume procedure,
   keeping the machine awake, then the line that links the rules.
5. **Write `instructions`:** the lead and sidecar models; this project's value for any rule
   default it changes, such as the convergence threshold, each with its source; agents and
   processes at once; what always runs alone; the command time limit. Link the Epic's Constraints
   and Limits sections. Name skills as `skill:NAME` and link records with `@` references.
6. **Write `cadence`:** the cron expression, the exact prompt (the whole review procedure, R22),
   and the quiet rule (R23), so a fresh orchestrator re-creates the same cron.
7. **Write `stops`:** the stops this Epic adds to the stop list (R20), such as decisions the user
   kept, each as a short sentence.
8. **Validate.** Edit the Epic with the Edit tool or `workflow edit @epic.<EPIC> --file run=PATH`,
   then `workflow format workflow/tasks/<EPIC>/epic.task --write` and `workflow check`. Fix every
   diagnostic, including dangling links.
9. **Check it cold.** Give a fresh agent only the Epic file and the packages its `run` links. It
   must say what it does first, how it judges a result, when it stops, what it may not do, and
   which of the user's instructions apply. Fix what it got wrong.
10. **Show the user the loop,** or its difference from the confirmed loop headline, with the
    reasons, for approval together with the Epic (skill:to-epic, section 4, step 12). Return the
    Epic path, the chosen models and why, the stops, and the cold-read result. Then stop. The Epic
    stays `draft` until the user approves both.

To add a note during a run, write it to a file with the agent harness's file tool, then run
`workflow edit @epic.<EPIC> --set note=<UTC timestamp> --file note=<path>`, then `workflow
check`. Notes are append-only: a correction is a new note linking the old one. Per-Task results
stay in Task comments.

## Rules

These are the defaults every loop follows; its `run` links them at the pinned library revision. A
number in a rule is a default, with its reason: the Epic's `instructions` or `cadence` overrides it
for that project. Rules are numbered R1 to R46 across all sections, and are cited by number and
short name.

### Start or resume a run

- **R1 Read.** Read the Epic file, then `workflow show @epic.<EPIC> --tree`, then the records the
  current Task links. On a resume, rebuild where work stands with skill:catch-up first. Trust the
  files, not memory. If the Epic's status is not `active`, or its loop fields are missing, stop and
  tell the user.
- **R2 Current Task.** It is the Epic's `in_progress` Task if there is one (`workflow list task
  --epic <EPIC> --status in_progress`), otherwise `workflow next --epic <EPIC>`. The orchestrator
  sets a Task `in_progress` when it starts a building lead on it.
- **R3 Review cron.** Where the harness has a session cron, list the session's crons first and
  create one from `cadence`'s expression and exact prompt only if it is missing, so a resume never
  leaves two. Otherwise follow R25.
- **R4 Real agent state.** From the notes and the agent harness, list the agents and processes this
  run started; check each one is alive and what it last did. Never assume a saved agent id is still
  live. Check the branch, the last checkpoint and any uncommitted work, and who owns it.
- **R5 Start note.** Note "Run started" or "Run resumed", with the revision, the current Task, the
  live agents, and the first action, as SBAR (skill:policy-writing#lead-with-a-point): what is true
  now, the notes and records since the last run as links, what is at risk, and the first action.
- **R6 One building lead.** Start one on the current Task with a standalone brief
  (skill:policy-delegation), or resume a stopped one by message: its transcript is kept, so it
  continues where it was. The orchestrator never builds; it starts, tracks and routes. Every build
  and review brief tells the lead to run `workflow brief @task.<EPIC>.<T>` first: it prints the
  Task, its phase card, the Spec and Plan items it links, the constraints in its phase's scope and
  the decisions that govern those items. The brief adds the skills the phase links and what this
  run needs that the records don't say. Name a skill once, on the phase whose work uses it, not on every Task.
- **R7 Activity.** Confirm activity within a minute of starting an agent. Activity is the agent's
  output and tool calls as the harness shows them (its transcript, output or event stream), plus
  commits and Task status changes. An agent that shows none is replaced, and the replacement noted;
  its uncommitted work is handled by R4 before the replacement starts.

### Each iteration

- **R8 Findings first.** Fix the last review's findings, then take the next planned step.
- **R9 No weakened checks.** Never weaken a check to pass it. An expected result changes only for a
  logged reason; relaxing a check, a verification suite or a performance budget is the user's.
- **R10 Proven gates only.** Count only gates that rejected their mutants or planted violations at
  their `Matched at` revision, with no covered code changed since. A change to a suite, its test
  harness or the code it covers means proving it again (skill:policy-verification).
- **R11 Close-out reviews.** A close-out review at the end of each phase, and of each area when a
  phase is split into areas; at the end of a phase, the completion audit follows (R18).
- **R12 Authority and claims.** Act within the authority in the Epic's description. Claim only what
  you checked. A step that contradicts a user constraint is a defect: stop and note it.
- **R13 One place per fact.** New items go through skill:to-epic#adding-work-later, which also
  says which changes are the orchestrator's and which are the user's. Append a note for every
  ruling, agent decision and stop; per-Task results go in that Task's comments.
  Never write a separate handoff or progress file. Before changing the loop fields (`run`,
  `instructions`, `cadence`, `stops`), read skill:build-a-loop at the pinned revision; before adding or
  editing a Task, read skill:to-task (and skill:to-epic for a phase); before adding a phase, read
  skill:to-epic.

### A new instruction from the user

- **R14 Record it** as a note: `Decision (user, <date>): "<the user's words>". Scope: <the whole
  run, or named phases or Tasks>.`
- **R15 Apply it.** A new usage reserve applies at once: edit the Epic's Limits section and note
  it. If it changes the approved authority, stops, the failure limit or a phase goal, restate it
  to the user in one line ("I read this as: ...") and wait for the user's confirmation before
  editing anything; only the work it touches waits. Then, or at once for any other instruction,
  edit `instructions` to match, citing the note, and send it to every running agent it touches
  before their work goes on. An agent that cannot take a message is stopped and restarted with a
  brief that includes it. "Stop", "hold" or "pause" stops now, by
  skill:policy-delegation#pause.
- **R16 No changes on its own.** Only the user changes the frame: the constraints, the phase
  classes, the rules' overrides in `instructions`, the authority, `stops`, the failure limit, the
  usage reserve and the `skill` pin. A change the orchestrator wants is a numbered question to the
  user; other work goes on while it waits. A change made with the user's yes is an Epic note,
  `Amendment (<date>, <judge>): <change>. Commit: <rev>.`, with `instructions` or the description
  edited in the same change.

### Done states

- **R17 Task done.** The author sets `status review` when it hands its work over. An independent
  agent checks it (skill:check-task) and writes its verdict in a Task comment: PASS, ISSUES or
  BLOCKED, with the revision and the evidence. On PASS, the orchestrator sets `status done`; on
  ISSUES, the Task goes back to its author. An author never marks its own Task done.
- **R18 Phase done.** A phase has no status. It is done when every Task in it is done, every
  finding of its close-out review is fixed or recorded as deferred, and its completion audit has
  written PASS as a phase comment. The orchestrator then notes "Phase <P> done". The next phase
  starts only if the authority allows it; otherwise that is a stop.
- **R19 Epic done.** After the last phase, a completion audit of the goal and every stage exit. On
  PASS, the orchestrator sets the Epic's `status closed`, removes the review cron, and appends a
  closing note: what was delivered, at which revision, what stayed unverified, deferred items, and
  the agent decisions made.

### Stops

- **R20 The stop list.** When two sources disagree, the stricter wins: the earlier stop, the
  narrower authority. Only the user loosens a stop.
  - (a) The user says stop, hold or pause: stop now.
  - (b) The usage reserve in the Epic's Limits section is reached: the work is not done; note the
    gap. There is no budget of iterations, time or usage to run out.
  - (c) Anything in the Epic's `stops`, the current phase card's `Stops:` line, or the current
    Task's `Stops:` line.
  - (d) A decision only the user can make: one the user kept, a public entry-point name, a new
    concept or a large API change (R31 Small public API), a guarantee change, or a change to the
    authority, stops, the failure limit or a phase goal.
  - (e) A phase is done and the next one is not authorized.
  - (f) A part keeps failing with the same root cause after convergence, past the failure limit
    (the phase card's `Failure limit:` line, else the Epic's Limits section).
  - (g) Passing would mean weakening a check.
  - (h) A missing tool, model or capability that only the user can supply.
- **R21 What a stop holds.** Stop (a) and the usage reserve end the whole run. Any other stop that
  concerns one part holds only that part, when the rest of the authorized work does not depend on
  it. At every stop, write a note with the state and the first action to resume.

### The review cron

- **R22 One cron.** By default hourly, often enough to catch a stall within the hour and rarely
  enough that each review has a new checkpoint to see; at an off minute (such as `7 * * * *`),
  because many scheduled jobs start on the hour. Its prompt is the whole review procedure: check
  for a checkpoint newer than the last noted review; if there is one, start one independent
  reviewing lead with its sidecars (R30); if the builder has stalled, resume or replace it (R7);
  stop at the usage reserve. A stall is judged by expected progress; by default its ceiling is 70
  minutes without activity, just over one review period so a single quiet hour is not mistaken for
  one, or an agent that is gone.
- **R23 Silent when idle.** A wake that finds nothing writes no note and sends no message. Only a
  started review or a stall is noted, and a review that was due and did not run is noted as missed.
- **R24 Not the main signal.** Builders and reviewers report when they finish, which wakes the
  orchestrator anyway; the cron keeps the cadence and catches a hung agent. A review already
  covering the new checkpoint, such as an audit, counts as that period's review.
- **R25 Without a session cron.** A session cron lives only in its session and may expire (check
  the harness), so R3 re-creates it on every start or resume. Where there is none, as in Codex, run
  the review procedure at each wake, checking each running agent's activity (R7). If the harness
  offers scheduled tasks, use one for the hourly check; otherwise a hung builder is noticed at the
  next wake.
- **R26 Keep the machine awake.** If the machine sleeps, the loop stops: keep it awake for the run
  (for example `caffeinate` on macOS, or the agent app's keep-awake setting).
- **R27 `cadence` spells it out:** the expression, the exact prompt and the quiet rule, so a fresh
  orchestrator re-creates the same cron. The interval is the user's to change.

### Agents in the run

- **R28 Delegation** follows skill:policy-delegation: its models, its coding and review tables,
  briefs that stand alone, write scopes that never overlap, results from evidence, and failures
  routed to their owner. The chosen models go in `instructions`.
- **R29 One builder at a time.** One building lead always busy on the queue, one review per cadence
  period, and the close-out reviews (R11).
- **R30 Reviews go to a lead with its sidecars.** Every review, audit or research task goes to a
  lead with its sidecars, by skill:policy-delegation's Reviews table. Sidecars report only to their
  lead; the orchestrator receives one combined report. Default effort, where the harness offers
  effort levels (Claude Code's effort, Codex's reasoning effort): building leads medium, and every
  third building iteration high, for a periodic deeper pass at a fraction of the cost; reviewing
  and auditing leads high, so reviews stay a fixed measure. Where it offers none, this default does
  not apply.

### Decisions and authority

- **R31 Small public API.** Small public API changes are the orchestrator's: a flag, a default, a
  field or member name, where an option sits: any surface others call; each decided and noted for
  the user's read (skill:policy-authority). Public entry-point names, new concepts and large
  changes stay the user's: a change to how users structure their code, removing a feature,
  anything touching many call sites. When in doubt, it is large.
- **R32 Delegated calls** are noted as delegated, quoting the delegation. The orchestrator stops
  only for what the user kept.
- **R33 Complete decisions.** An agent decision goes in a note or in the record it governs, in
  skill:policy-records's decision convention, linking what it is about. Never credit the user with
  an agent's decision. An independent check reviews the agent decisions at each stage exit, and a
  decision that narrows one of the user's own comes first.
- **R34 Declining a ruling.** A builder may decline a ruling that breaks a decided rule, with the
  evidence, such as a ruling that would make legal what the design forbids. The orchestrator, as
  judge of its own calls, then rules again.

### Review, convergence and verification

- **R35 Converge at the threshold.** When the convergence threshold is reached, converge
  (skill:policy-convergence); before that, patch. `instructions` may set another threshold. Minor
  findings with different causes never count. A failure is a comment on the failing part's Task (a
  phase comment for a phase-wide part): `Failure (<date>): root cause: <class>. Count: <n>.
  Revision: <rev>. Review: <link or note>.` The count is per part and root cause, over consecutive
  reviews; the convergence check and the failure limit read these comments.
- **R36 Audit before relying.** Each new area's verification suites are audited by
  skill:policy-testing#audit-a-suite, with a lead that did not build them, before work relies on
  them.
- **R37 Survey before adding.** Before new code is built against existing verification suites, run
  the survey before adding (skill:policy-verification#maintain); a suite that fails it makes that
  part not readily verifiable until it is extended and proven again.
- **R38 Cited checks still apply.** A Spec, audit or record that cites a check or a mutant is
  re-checked against today's code before it is relied on (skill:policy-verification).

### Prototypes

These apply only when the Epic uses prototypes, to a phase whose card says "Prototype: yes".

- **R39 Prototype test harness.** Its test harness is a prototype too: fix it only where it would
  give a wrong verdict today, carry the rest to the production verification suite, and spend review
  effort on the design and the core.
- **R40 Findings for the Plan and Specs.** Every iteration returns its findings for the Plan and
  Specs: requirements found, wrong assumptions cleared, decisions made.

### Changing the work

- **R41 Specs just in time.** Write Specs only for what is about to be built; later areas get
  theirs when their phase starts. A Spec is revised whenever building shows it wrong, with the
  change and why logged.
- **R42 Deleting absorbed files.** Only when the Epic keeps proposal or design files outside
  itself, and its authority lists their deletion: a file that has been merged, accepted or rejected
  is deleted, with a note naming the last commit that holds it; only deferred and open items stay.
  Epic notes, Task comments, Plans and Specs are never deleted this way. Without that line in the
  authority, list the files in a note for the user instead.

### Workspace and shell

- **R43 Checkouts, by default.** Serial work uses no worktree: one builder works in the main
  checkout on the run's branch and commits only with explicit paths. It never uses `git stash`,
  because the stash is shared with the user's own work in that repository. Parallel slices that
  write each get their own checkout or disjoint write paths
  (skill:policy-delegation#parallel-slices). `instructions` may set another default.
- **R44 Bounded commands:** a time limit on each shell command, stdin never read, and files created
  and edited only with the agent harness's file tools. Every brief repeats it and every report
  states any slip.
- **R45 Own processes only.** Kill only processes this run started, by exact pid, after checking
  the parent chain. Never stop the user's own processes, or anything by name.
- **R46 Strays before waits.** Before each wait, check for stray processes this run started and
  stop them by R45.

## What to return

The Epic path, the lead and sidecar models and why, the loop's difference from the confirmed loop
headline, the stops, the open questions, and the cold-read result. Then stop. You do not start the
run.
