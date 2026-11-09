---
name: check-task
description: >-
  Check whether a finished Task meets its acceptance: go through each claim against the actual
  code and evidence, and return PASS, ISSUES, or BLOCKED per claim. Use after execute-task; when
  the Task requires independent acceptance (the usual case), someone other than the author runs it.
metadata:
  kind: procedure
  applies:
    - policy-testing
    - principle-claim-only-what-you-checked
---

# Check Task Acceptance

Check each acceptance claim of a finished Task against the actual behavior and the recorded
evidence. You judge; you do not fix. Leave the code, the Task, and its acceptance criteria
unchanged, and send defects back to the author.

Most Tasks require independent acceptance: then you work in a fresh context and you are not the
author, because an author tends to check what they meant to build rather than what they built. If
you were explicitly asked to self-check, do it, and say in your report that the check was not
independent.

## Steps

1. **Read what the Task promised.** Read the Task, the guarantees it relies on, the exact revision
   you are checking, any reproduction or design findings, and the evidence the author recorded.
   Include the Plan Verification targets it serves and the module's Requirements, Invariants, and
   test obligations.

2. **Check each claim against real behavior.** Go through the acceptance criteria one at a time.
   If a check already ran on this exact revision (including any uncommitted changes under review),
   with the same inputs and environment, reuse it; otherwise run it
   yourself. Use `check-runtime` for claims about running behavior. Judge tests by
   `policy-testing`: they must exercise public boundaries; a missing or private-only test is an
   ISSUE to report, not something you write. Write any temporary output to a scratch location you
   own.

3. **Check that the passing checks cover every claim.** A passing slice is not the whole outcome:
   any acceptance claim that still lacks a passing check gets ISSUES.

4. **For code changes, check lint and formatting.** Read the configured commands from the tools
   record (`setup-workflow`'s `references/tools.md` in the installed library) and assess the
   author's final output: formatting must succeed and lint must report zero errors and zero warnings. Read
   the output, not just the exit status. Rerun only commands that do not change files; if a check
   would modify files, or something needs repair, return it to the author.

## What to return

A verdict for each acceptance claim, then stop:

- **PASS:** a check ran on this revision and the claim holds.
- **ISSUES:** a check ran and found a defect, or the claim has no passing check yet.
- **BLOCKED:** a missing prerequisite or tool prevented the check. When you could check but
  coverage is missing, the verdict is ISSUES, not BLOCKED.

With each verdict, give the revision you checked, the conditions, the evidence, and any gates still
missing.
