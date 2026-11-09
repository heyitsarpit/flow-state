---
name: principle-explain-measurements
description: >-
  Assess whether a measured speedup, regression, throughput, latency, or evaluation result
  means what it claims. Identify the limiter and rule out errors, skipped work, and noise.
metadata:
  kind: principle
---

# Explain the Number

A measured number is a claim about a system. Before you trust it, report it, or act on it, find
what limits it and check that the run measured the intended work.

**Why:** A run that went wrong still prints a plausible number. Requests that failed, a cache that
skipped the work, code that never ran, one side of a comparison tuned less carefully than the other,
and run-to-run noise all produce results that look fine. If you cannot say why the number is not
twice as good, you do not know what you measured.

**Pattern:**

- **Explain what prevents a better result** ("why not double?": twice the throughput, half the
  latency). For performance, name the resource or code path that bounds it, such as a core, a lock,
  the disk, the network, or the load generator itself; get it from a profile or system counters
  taken during a run, then map it to source. Reading code can suggest a limiter, but only a
  measurement confirms it. For an evaluation, the limiter may be the task, the instructions, or the
  model; show it from the failing runs, with evidence that rules out the other two. For example, the
  same failure across several models points away from the model.
- **List what else the number could be measuring, and rule out each one with evidence.** The usual
  suspects are errors, skipped or cached work, unequal tuning between the sides, noise, and a
  changed component too small to affect the end-to-end result.
- **Keep the evidence with the number.** Include the run count, spread, limiter, code revision,
  workload, and measurement conditions so a reader can check the claim.

For an evaluation result, ask the same of the trials: did every run do the task, does the gap hold
across trials and relevant models, and does the tested scenario resemble real use?

The explanation is incomplete if the evidence lacks a run count, spread, or named limiter, or if the
time saved exceeds the time the changed piece took (a piece that took 10 ms cannot save 20 ms, so
the number measured something else). Missing evidence limits the claim; do not substitute a guessed
explanation.

This principle checks that a measured number means what you say it means. Checking that an
output exists or a feature ran is necessary, but does not settle the measurement claim.
