---
name: policy-delegation
description: >-
  How to hand work to other agents: a lead on the strongest model owns sidecars on the cheapest,
  for coding and for reviews; briefs that stand alone with installed skill paths; write scopes
  that never overlap; results taken from evidence. Apply whenever a playbook, skill or loop
  delegates work to a subagent or another session.
metadata:
  kind: policy
  applies: [principle-claim-only-what-you-checked, policy-authority]
---

# Delegation

Do bounded work yourself when you can. Delegate when work benefits from parallel slices, an
independent check, or a capability you lack. A role label is not an agent: start a real one with
the agent harness's tools (the tool that runs agents, such as Claude Code or Codex).

A **lead** does the work that needs judgment. A **sidecar** does one bounded slice for the lead
that started it. The tier sets the model; the role sets what an agent may do:

- An **author** (a building lead, a coder) never accepts its own work.
- A **checker** never edits what it reviews, and never commits. A reviewing or auditing lead
  returns the verdict; a reviewer sidecar returns findings to its lead, never a verdict. Only a
  building lead commits.
- An **investigator** (a runner) collects evidence and changes no product code.
- A **delegator** (the orchestrator that runs a loop, or a lead running sidecars) starts, tracks
  and routes, never doing the substantive work it routes.

## Models

| Agent harness | Lead (strongest model) | Sidecar (cheapest model) |
|---------------|------------------------|--------------------------|
| Claude Code   | Opus                   | Haiku                    |
| Codex         | Sol                    | Luna                     |

Whoever delegates detects its agent harness and tells the user which pair it chose. The user's
explicit choice overrides the pair (in the request, an Epic's `instructions`, or a preference
skill:setup-workflow recorded because the user set it). With neither pair available, use the
strongest and the cheapest models the harness offers, and say so.

## Coding

| Role             | Does                                                                                                                                                                     | Never                                                | Reports to                        |
|------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------|-----------------------------------|
| Building lead    | Plans the iteration, cuts bounded tasks, reads every diff, re-runs every check itself, logs each sidecar result as accepted, changed or rejected with why, alone commits | Accepts a result on a sidecar's word                 | Whoever started it, in one report |
| Coder sidecar    | One disjoint file or function, with an acceptance check                                                                                                                  | Edits shared records, expected results or lock files | Its lead                          |
| Runner sidecar   | Gates, searches, traces; returns the failing lines                                                                                                                       | Fixes anything                                       | Its lead                          |
| Reviewer sidecar | One diff against one rule, returning findings with file:line evidence; one on every change to a check, a test harness or a core runtime                                  | Gives a verdict or edits what it reviews             | Its lead                          |

## Reviews

| Angle                                                                                                                                         | Sidecars                                                                          | Returns                                                                     |
|-----------------------------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------|-----------------------------------------------------------------------------|
| Correctness, one named angle each (for example soundness of each change, equivalence of a rewrite, concurrency and shared state, determinism) | One per angle                                                                     | Findings with file:line evidence                                            |
| Code quality                                                                                                                                  | Two, on different angles (for example style and idioms; types, comments and lint) | Findings with file:line evidence                                            |
| The builder's accepted, changed or rejected log                                                                                               | None: the reviewing lead checks it itself                                         | Whether results were rubber-stamped; all "accepted as is" is a warning sign |
| Research, one named question or source each                                                                                                   | One per angle, up to four                                                         | Findings with their sources                                                 |

Review sidecars are read-only, run no gates or benchmarks, and never give verdicts. The reviewing
lead verifies every finding itself and returns one combined report, naming the findings it used or
rejected and why.

## Every delegation

- **Sidecars run at high effort,** up to 4 at once per lead.
- **Sidecars report only to their lead,** so their raw findings stay out of the delegator's context.
- **Briefs stand alone.** Every agent starts with fresh context (in Codex, `fork_turns: none`: the
  new agent gets none of the parent's conversation) and a brief by [Briefs](#briefs), with the
  installed `SKILL.md` paths it needs and their `metadata.applies`, resolved by the delegator.
- **Write scopes never overlap:** one owner per file, branch, runtime or Git operation; separate
  checkouts or disjoint paths for parallel writers; a required independent check never by the
  author.
- **Consume results from evidence:** activity within a minute of starting; PASS, ISSUES or BLOCKED
  with changed paths, revision and checks run; re-run checks on the integrated version.
- **Missing evidence:** ask once, then record the gap in the owning Task.
- **No delegation available:** work serially, say so, and keep required independent checks open.
- **Route failures to their owner:** a defect to its author; a contract gap to the Spec or Plan
  owner; an evidence gap to the checker; a missing tool, an authority or objective conflict, or a
  product question to the user. Diagnose before retrying.

## Briefs

A brief states the goal, the write paths, the input record paths, the installed copy's skill paths,
the authority that applies, the agent's role and model, the revision to work from, the acceptance
and checks, the budget, the open questions, and what to return. It says: read every listed file
first and report any you could not read.

## Parallel slices

Run slices in parallel only on disjoint write paths or in separate checkouts; one lead integrates
them and runs the checks on the integrated result. Pilot one slice before scaling out. Account for
every attempt, and stop every agent you started.

## Pause

Each agent stops at a safe point, commits or notes its state, and records where to resume in the
owning Task's comments or an Epic note.
