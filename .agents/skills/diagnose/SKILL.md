---
name: diagnose
description: >-
  Find out why something fails: reproduce the failure, or analyze a captured profile, trace, heap,
  or dump, and test competing explanations until one is demonstrated. Returns the cause with its
  evidence, or the next observation that would settle it. Use for diagnosis requests or an unknown
  cause during a repair.
metadata:
  kind: procedure
  applies:
    - principle-design-for-verification
    - principle-fix-root-causes
    - policy-records
    - principle-make-work-rerunnable
    - principle-claim-only-what-you-checked
---

# Diagnose

This skill establishes why something fails. It reproduces the exact symptom (or works from a capture
someone supplied), lists the explanations that could produce it, and runs the cheapest observations
that tell them apart, until one is demonstrated: a plausible story is a hypothesis, not a cause. It
does not change production code; the repair is a separate step.

There are two modes. In *live mode* you can run the failing software yourself. In *capture mode*
you were only given a capture (a trace, profile, heap, or dump) to analyze; then follow
[captured-artifact diagnosis](references/captured-artifacts.md) instead of reproducing live, and
return its findings the way step 4 describes.

## Steps

1. **Frame the failure.** Write down the expected behavior, the observed behavior, the action or
   event that triggered it (a user action, a scheduled job, a monitoring alert), and how the two end
   states differ. Read the relevant contracts, the Git state, any existing fixes, and the evidence
   you were given. Name the revision, build, environment, input data, scope, and your investigation
   budget: time, probes, or attempts. If a fix already exists, compare it against the failing
   baseline before proposing a new one. When you only have captures, compare the captures, and name
   the missing live evidence as a limitation.

2. **Reproduce it.** Use the project's verifier or the real interface the user touches, and confirm
   the setup before driving the path. Only cause side effects on targets you own or are explicitly
   allowed to use; otherwise observe read-only or report that you are blocked. Keep the exact
   inputs, the commands or actions, and the final state you saw. When you need repeatable runs,
   reset only test state you own; never reset the user's state to force a reproduction. Report one
   of three results: **reproduced**, **not reproduced within the budget**, or **blocked by a missing
   capability**. A screenshot, a build, or a reading of the source does not, on its own, count as
   reproducing it.

3. **Tell the causes apart.** List the plausible causes and, for each, what you would expect to
   observe if it were true. Pick the cheapest observation whose predicted results differ, say what
   you expect before running it, then run it: an isolated probe, a look at state, or temporary
   instrumentation in a disposable copy. Record the actual result, where the evidence is, and which
   explanations it supports or rules out. For uneven load or failures concentrated on a few workers,
   failures after a restart, and other tricky shapes, read [discriminating
   observations](references/discriminating-observations.md). With only a capture, query the capture
   and propose live probes without running them.

   Trace the symptom to the owner, state transition, or boundary responsible, and keep the
   demonstrated mechanism separate from speculation. Use `explain-how` for missing facts about
   execution and `explain-why` for the history behind the code, and reuse findings you were given
   rather than repeating settled work. For performance failures, look at the workload's costs and
   waits with `performance`, and vet any timing comparison with `check-benchmark`.

   If your probes keep failing on the same assumption, question that assumption before the next
   one. Stop when a cause is demonstrated or the budget runs out. An inconclusive probe is not
   confirmation.

4. **Report what you found.** In live mode, if a fix already exists, run the failing path again with
   that fix (in a disposable checkout, or on the revision that already contains it), under
   comparable conditions, and disclose any differences, to show whether it removes the failure. With
   only a capture, report what the capture shows and which live check is still needed, without
   running it. Point out material differences in setup, and never treat an unrelated passing check
   as proof. Clean up the processes, instrumentation, and test state you created, and keep the
   evidence that is useful.

## What to return

Whether it reproduced; the expected and observed states; the revision and conditions; the causal
evidence; the explanations you ruled out; the remaining uncertainty; and one bounded direction for a
repair or the next probe. For material findings, especially ones that change a recorded commitment,
name the record they affect (`policy-records`). Report the evidence a repair will need and any
contract gaps you found, with a recommended next step. A standalone diagnosis returns findings only;
conflicts about the objective stay with the user.
