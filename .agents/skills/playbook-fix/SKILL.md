---
name: playbook-fix
description: >-
  Diagnose and repair a defect: reproduce it or analyze a supplied capture, prove the cause, then,
  when repair is requested, fix it and show the original symptom failing before and passing after.
  Use for "this is broken", a failing test, a live symptom, or a trace, profile, heap, or dump.
  Diagnosis alone stops at findings.
metadata:
  kind: playbook
  uses: [diagnose, change-impact, to-task, to-spec, execute-task, check-runtime, check-task, review]
  applies:
    - principle-fix-root-causes
    - principle-design-for-verification
    - principle-claim-only-what-you-checked
    - policy-testing
    - policy-records
    - policy-authority
    - policy-delegation
---

# Fix

This playbook finds out why something is broken and, when the user asks for a repair, fixes it and
proves the fix. Diagnosis alone ends with a cited cause, or with the next observation that would
tell the candidate causes apart. A repair ends with a checked patch whose original reproduction
fails before the change and passes after it. Code stays uncommitted unless the user asked;
publishing belongs to `playbook-ship`.

You read the symptom or capture, the matching Task and contracts, and the repository state. You
write diagnosis evidence, a repair inside a Task's scope, and Task evidence.

This page is an outline. Most steps name a skill that holds the actual method. Before such a step,
open that skill's `SKILL.md` in the folder beside this one (`<skills-root>/NAME/SKILL.md`) and
follow it, along with the principles and policies in its `metadata.applies`. A step run from this
outline alone misses most of what makes it work.

## Pick the mode

| What you have | Mode |
|---|---|
| A failure you can trigger, a failing test, or a bug report | Live diagnosis |
| A running system with an unknown cause (slow, stuck, leaking) | Live diagnosis, capture first |
| Only a supplied trace, profile, heap, or dump | Capture analysis; no live reproduction |

## Steps

1. **Frame the failure.** Recover the consumer's failing action and the final state they expected.
   Find the matching Task and the relevant contracts. If a valid reproduction was supplied, reuse
   it instead of starting over. Use `change-impact` when the boundaries are unclear.

2. **Diagnose.** Run `diagnose`.
   - *Live:* name the revision, running instance, and workload, then reproduce the failure on the
     real surface, in test state you own or are authorized to use. For a running system, capture
     whatever suits the symptom (a profile, heap, trace, or blocked state), and label the
     instrumentation's overhead and any access you lacked. In a disposable environment, test the
     likeliest cause with a probe that would come out differently if one of the alternatives were
     true. If a probe is inconclusive, repeat the cheapest probe that still tells them apart,
     within budget, and keep the failed evidence.
   - *Capture:* treat the supplied artifact as fixed data. Identify its format, capture conditions,
     revision, time range, and symbols. Missing provenance limits what you can attribute, so record
     the gap rather than guessing a source line. Convert large data into a shape you can query with
     existing tools, and keep the originals. Compare paired captures only when their conditions
     are comparable. Do not run live probes in this mode; name the one that would settle the
     question instead. Recheck revised findings within budget, and keep unresolved provenance as a
     stated limitation.
   - In either mode, treat hot frames, retaining paths, timing correlations, and plausible stories
     as clues until evidence distinguishes the proposed cause from the alternatives. If a fix
     already exists, compare it with the failing baseline before writing another.

3. **Stop here for diagnosis only.** Return the findings. A repair needs the user's request.

4. **Prepare the repair.** Plan the smallest repair the evidence justifies. Draft or reuse the
   owning Task with `to-task`. A defect in how an existing guarantee is enforced needs no new
   guarantee; a consequential gap in the contract goes through `to-spec` first. Refine the Task
   against the settled contracts and require it to be ready.

   A repair needs a live reproduction, because step 6 must show the symptom failing and then
   passing. If you diagnosed from a capture, capture analysis ends here: switch to live mode by
   reproducing the failure from what the capture showed, for example with a test or workload that
   triggers the same mechanism. If you cannot reproduce it, the repair stays blocked. Report what
   access or reproduction you need, and do not ship a fix you cannot check.

5. **Repair.** Run `execute-task` with the cause, the original reproduction, the settled contract,
   the write paths, and the pass condition.

6. **Prove it.** Run the original reproduction at the final revision with `check-runtime`: it must
   fail before the change and pass after it, for the reason you stated. Exercise the affected public
   behavior and any recovery it needs, and do not substitute an easier path. Run `check-task`
   independently, and `review` when required. Send defects back to step 5, contract gaps to step
   4, and missing reproduction evidence to step 2. Recheck each repaired revision, keeping the
   original symptom and acceptance criteria unchanged.

7. **Record.** Keep findings and evidence in the Task as you go. For diagnosis only with no matching
   Task, return the evidence paths instead of creating one. For a repair, mark the Task done only
   after its required gates pass. After preserving the evidence, clean up the instrumentation and
   processes you own, including any handed to you.

If you delegate a step, apply skill:policy-delegation and hand over the installed
skill paths, not the names.

## What to return

Describe the failure and its demonstrated cause, or your strongest hypothesis with your confidence
in it. Give the observation that decided it, the source attribution, the capture paths, the
repair, the before-and-after evidence, the revision, and the limits that remain. If the cause is a
performance problem, recommend `playbook-performance`.
