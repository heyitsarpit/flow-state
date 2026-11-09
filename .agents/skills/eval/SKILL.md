---
name: eval
description: >-
  Test whether a change to a skill, playbook, or prompt actually changes how agents behave: run
  small, realistic trials across versions and both harnesses, judge from what the agents did
  rather than what they said, and recommend adopt, revise, retain, or inconclusive. Use before
  promoting a guidance change, or when you doubt a package works.
metadata:
  kind: procedure
  applies:
    - principle-design-for-verification
    - principle-explain-measurements
    - principle-claim-only-what-you-checked
    - policy-delegation
---

# Eval

A skill can read well and still be ignored. This skill finds out what agents actually do with a
piece of guidance, by running small, controlled trials and looking at their real activity. It
returns evidence and a recommendation; it never promotes guidance on its own.

## Steps

1. **Design the trial.** Settle these before running anything:
   - **The question:** the one behavior the change should produce, for example "workers read the
     skill they are handed" or "the playbook stops at its endpoint".
   - **What you compare:** the versions of guidance, handoff methods, or models under test. Change
     one factor between versions, so you can test whether it explains a difference.
   - **Tasks:** ordinary, realistic requests in a real or throwaway project. Put the requirements
     the agent must meet into the task prompt itself.
   - **Harnesses and models:** Codex and Claude Code by default, with the models the user actually
     uses. Name them.
   - **Counts and budget:** trials per version and the limits per trial (read-only or a write scope,
     a tool-call cap, a reply length). Start with one cheap trial per version; add runs only where
     results disagree.
   - **Criteria:** three to six criteria, each checked from activity or artifacts, never from the
     agent's own report. Record revisions and run identities.

   Keep the trial blind, or the agent may play to the test. It sees an ordinary task. It never sees
   the other versions or their labels, the scoring criteria or answer key, the suspected defect, or
   the fact that it is being evaluated. Use ordinary project
   names, state where the agent should stop, and define any executable checks before running.
   Separate folders are not real isolation, so say what the agent could still see.

   Show the user the design (question, versions, tasks, criteria, counts, budget, open
   prerequisites, revisions) and wait for their go-ahead before running.

2. **Install and run.** Install the guidance the way users do, for example into a throwaway
   project's `.agents/skills/` or `.claude/skills/`. Run only the declared trials, within budget.
   Before a batch, confirm one run produces command events within a minute.
   - **Claude Code subagents:** each subagent's transcript is in the session's task output; read
     its tool calls.
   - **Codex:** run `codex exec --json ... < /dev/null` and read the command events. Close stdin:
     from a background shell, `codex exec` otherwise waits on stdin and never starts.

   Keep every run's artifacts, final message, and activity log. Record failed and blocked runs too,
   and for a run that never started, record that it is missing and why.

3. **Judge.** Score each run against the criteria from its activity and artifacts: which files it
   read, which commands it ran, what it produced. Read every output in full and rerun the supplied
   checks, writing only to temporary locations you own. Keep two questions apart: was the output
   good, and did the agent follow the method under test. Note per-criterion results and missing
   checks for each run.

   Any consequential recommendation (adopt or revise always, and retain when the change mattered)
   needs an independent judge: someone who did not write any trial, given neutral run labels and
   the criteria, but not the model or version names, with all the evidence left intact. Use a
   different model where available, and say when judge and trials share a model family. Settle
   disagreements against the artifacts.

4. **Explain the difference before claiming it.** Did every run actually do the task? Does the gap
   hold across trials and both harnesses? Could noise or a setup difference explain it? Read the
   design, all the results, and the evidence before you recommend anything.

## What to return

One of:

- **Adopt:** every run of the changed version produced the target behavior, and none of the
  declared regression criteria got worse.
- **Revise:** it helped but missed a criterion, or caused a regression you can name.
- **Retain:** the current guidance did as well or better.
- **Inconclusive:** the runs disagree or the evidence cannot settle it.

Include the versions, criteria, counts, conditions, per-run results, failures, where the evidence
is, and the limits. One successful case proves only that case. Recommend the next step without
applying it; record material findings in the owning records when that is in scope. Keep the
evidence until the user has seen it, then clean up only the throwaway resources you created.
