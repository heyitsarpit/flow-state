---
name: hillclimb
description: >-
  Improve one agreed metric through repeated, measured attempts: build and validate a benchmark
  harness, try one change at a time, keep only what a checked comparison proves, and record every
  attempt. Use for sustained tuning toward a target (latency, throughput, a score, a pass rate),
  not a one-off fix.
metadata:
  kind: procedure
  applies:
    - policy-records
    - principle-fix-root-causes
    - principle-claim-only-what-you-checked
---

# Hillclimb

Use this loop to improve one agreed metric through checked attempts. You build a harness you trust,
try one change at a time against it, keep a change only when a checked comparison says it helped,
and write down every attempt, including the ones that failed. Before step 1, read [the experiment
method](references/experiment.md): its shared run contract, the section for your role, and its
ledger format. This page is the loop.

If you were assigned only one piece (building the harness, taking a measurement, or keeping the
ledger), follow just that part of the experiment method and return the result. Do not start the
loop or hand out work to others.

## Before you start

A hillclimb needs an owning Task and a bounded run contract before you build a harness or take a
measurement. If there is no Task, report that; do not invent one.

## Steps

1. **Agree the target.** Reproduce the workload, and propose the metric, target, invariants to
   preserve, sampling rule, baseline, and stopping condition from what is already agreed. Choices
   that belong to the user go back to them. A baseline measurement, if authorized, can inform the
   target, but settle the target before tuning, and the sampling rule before comparing candidates.

2. **Build a harness you can trust.** Whoever builds the harness also proves it is sensitive: that
   it would notice the kind of change you are hunting. A separate measurement checker vets it with
   `check-benchmark`, confirming the work really ran, the outputs are right, and the noise is
   understood. Freeze the harness only after it passes that check: from then on, its code, workload,
   and sampling rule stay fixed, so every attempt is compared on the same terms.

3. **Try one thing at a time.** The experiment author chooses a hypothesis you can measure, using
   `performance` when you need candidate ideas, and an executor makes one attempt on an isolated
   copy of the current baseline. Never stack changes that have not been measured, because then
   nobody knows which one helped.

4. **Judge each attempt.** The checker runs the frozen comparisons and regression checks and returns
   keep, reject, or inconclusive. The checker returns the verdict with the revision, run conditions,
   evidence, and configured lint results. A keep is valid only when the gain beats noise under the
   agreed rule, the guarantees still hold, regressions pass, and lint is clean; only a valid keep
   advances the baseline. A rejected attempt keeps its patch and evidence, and only that attempt's
   changes are undone. Kept changes are committed only within the commit authority the user granted.
   If the conditions change, measure a new checked baseline before comparing again.

5. **Record every attempt** in the owning Task, using the experiment method's ledger format: a dated
   comment after every attempt, including failures and inconclusive ones; the record must outlive
   the scratch samples. For example:

   ```text
           comment 2026-10-07T12:00:00+05:30
               H1: Avoid repeated decoding on the measured request path.
               Change: reuse the decoded request within its existing lifetime.
               Baseline: <commit>. Candidate: <commit>. Conditions: <workload, harness revision>.
               Before: median 41 ms (7 runs, 40-43). After: median 33 ms (7 runs, 32-35).
               Regressions: pass. Lint: clean. Verdict: keep. Evidence: <path>.
   ```


   Keep going through ready attempts until you reach the target, a limit, or an unresolved gate (a
   failed check, a broken harness, or a decision for the user); an unresolved gate stops the
   attempts that depend on it. Product and test failures go back to whoever made the attempt;
   harness failures go back to the harness's author. Recheck affected evidence before the next keep.

## Who does what

One agent may build attempts, run them, and keep the record, as long as you tell the user which
roles it holds; the checking must stay independent of the attempt it judges. If a finding changes a
contract, return it through `policy-records`. If attempts keep failing for the same reason, question
that shared assumption before trying again, and hand repeated failures to an investigator
(`diagnose`).

## What to return

The starting and final metric, the attempt counts by verdict, the current verdict, the revisions,
the ledger, and the gap that remains to the target.
