---
name: playbook-understand
description: >-
  Answer a question about existing work with cited evidence: how something works, why it is this
  way, what a change would affect, or where work was left off. Changes nothing. Use for "how does
  X work", "why is it like this", "what would break if", "teach me", or "catch me up". For "where
  do I start" on new work, use workflow.
metadata:
  kind: playbook
  uses: [explain-how, explain-why, change-impact, catch-up]
  applies:
    - principle-claim-only-what-you-checked
    - policy-writing
    - policy-authority
    - policy-delegation
---

# Understand

This playbook answers a question about existing work with evidence the user can follow: how
something works, why it was built that way, what a change would touch, or where work was left off.
It ends with a cited answer and the uncertainty that remains. It changes nothing in code or
records; the output is an explanation or a briefing.

You read the code, the records, the history, and the conversation.

This page is an outline. Each question type has a skill that holds the actual method. Open that
skill's `SKILL.md` in the folder beside this one (`<skills-root>/NAME/SKILL.md`), along with the
principles and policies in its `metadata.applies`. An answer built from this outline alone misses
most of what makes it work.

## Pick the question

| Question | Run |
|---|---|
| How does it work? Teach me. | `explain-how` |
| Why is it built this way? | `explain-why` |
| Where does a change belong, what can it reuse, what could break? | `change-impact` |
| Where did we leave off? Catch me up. | `catch-up` |

A question can need more than one; run the ones it needs, in parallel when they are independent.
For a teaching request, run `explain-how` in teaching mode and work in what `explain-why` finds.

## Steps

1. **State the question as you understood it,** so the user can correct you early. Investigate
   only the facts that are missing, and reuse findings that are still current.

2. **Prove the pivotal claim.** Back the claim the answer hinges on with the code, or with a
   read-only observation you are authorized to make, where that is practical. Keep source
   evidence, runtime evidence, inference, and missing information distinguishable in the answer.

3. **Give your judgment and its reasons.** When comparing alternatives, compare what each means for
   the consumer and for the maintainer. If the question rests on a wrong premise, say so; the goal
   is an accurate answer, not agreement.

4. **Keep the uncertainty.** When evidence is missing or contradictory, investigate further
   yourself while the budget allows. If you delegated the investigation, send the investigator one
   specific question to settle instead. When the sources cannot settle it, say so plainly; never
   turn a gap into a confident conclusion.

## Catching up

For a pickup, `catch-up` reads the recent working state first, then the decisions behind it. Then
compare what was intended with what actually happened: the Git base and head, uncommitted files,
Tasks, Specs, pull requests, and any running workers. Sort the evidence into complete, stale,
pending, and unavailable, and name the first gate that is not yet passed. Do not redo a valid
reproduction or design just to get your bearings, and never assume an old worker identifier is
still live. A request for a briefing gets a briefing; resuming the work needs the user to ask for
it, unless the original request already covered it.

If you delegate a step, apply skill:policy-delegation and hand over the installed
skill paths, not the names.

## What to return

Give the answer, the evidence it rests on, a recommendation when one is relevant, and the
uncertainty that remains. When catching up, report the current revision, what is still valid, the
choices still open, and the first check or decision needed before work resumes. If the user also
asked for a repair or a design, recommend the playbook that does it.
