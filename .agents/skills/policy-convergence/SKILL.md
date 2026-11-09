---
name: policy-convergence
description: >-
  Gather every finding, name its root-cause class, and redesign once, instead of patching finding
  by finding. Apply when one part of a design, implementation, or test suite keeps failing review,
  when a fix moves the failure one step further instead of removing it, or when a rule has grown
  one exception per failing case.
metadata:
  kind: policy
  applies:
    - principle-fix-root-causes
    - principle-design-for-verification
    - policy-testing
    - policy-records
---

# Convergence Policy

Fixing findings one review at a time solves problems in increments and leaves case-by-case rules.
Run the reviews first. Once several rounds have surfaced the problems, gather every requirement and
finding at once and redesign from scratch, so that one design handles all of them. Keep the current
draft as prior art.

A holistic design is possible only after that iteration: review early to find the problems,
redesign late to remove them. This policy covers designs, implementations, and test or benchmark
suites alike. `principle-fix-root-causes` covers one defect; this policy covers a pattern across
reviews.

## When to converge, and when to patch

Converge when any of these is true:

- **The same part fails twice.** Two reviews in a row find the same root cause in one part: two
  designs or fixes of one mechanism have failed (counted from the Failure comments,
  skill:to-loop's R35). Start the third from every requirement at once, not from the second
  attempt. This is the default convergence threshold: 2 consecutive reviews.
- **The failure moves one step.** A fix closes one trace and the next review finds the same kind of
  failure one step further on. That is one root cause, not several bugs.
- **A rule grows a list of cases.** Special cases, exemptions, or allowances each answer one trace.
- **Reviews repeat a kind of finding,** even though each finding is new.

Patch when a finding stands alone, the change is small, and its cause is understood. Not every
finding needs a redesign.

## Steps

1. **Gather.** Collect every finding and requirement for the part: from all reviews, from the
   current draft's stated limits, and from failing traces. Read the traces, not their proposed
   fixes.
2. **Name the class.** Group findings by root cause, not by symptom. Write each root cause as one
   sentence about what was assumed and is false. If the root causes do not explain every finding,
   keep looking.
3. **State the requirements together.** List what a correct design must do, including what earlier
   fixes broke. Put conflicting requirements side by side; resolving them is the design's job.
4. **Redesign from scratch.** Give the designer the problems, the traces, and the requirements, not
   the old draft, so it does not inherit the draft's assumptions. The designer may read the draft
   afterwards, to check the boundary and list what the new design drops.
5. **Aim for one rule.** A rule with one exception per trace means the class is not named yet.
6. **Write a new proposal.** Do not overwrite the old one; superseded proposals stay as prior art.
7. **Review it once, adversarially.** Judge it by correctness, simplicity, generality, consistency,
   and the experience of whoever uses it. These views judge a proposal; they do not shape it.
8. **Revise once,** from all of that review's findings together, into another new proposal.
9. **Prove it with a check that can fail:** a reference model, or a mutant the check kills. Keep
   each old failing trace as a regression test, which must kill a mutant that brings it back.

## Judging the redesign

- Say what the change means for the rest of the system, not only for the failing trace.
- Record what is added and what is dropped, each with a reason (`policy-records`).
- Reopen only the decisions a finding invalidates.

## Converging a verification suite

A test, conformance, or benchmark suite is a design too, and it fails the same way: a green result
that a mutant can also earn. When the tests keep being fooled one step further on,
converge the suite, audit it under `policy-testing`, and re-audit before building on its verdicts.

## Signs it worked

- The next review finds new kinds of problems, not the same kind one step further on.
- The design stayed the same size or got smaller while covering more cases.
- Every old failing trace is a regression test, and each kills a mutant that brings it back.
