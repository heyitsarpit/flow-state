---
name: reimagine-speed
description: >-
  Measure current performance, research credible comparisons, and propose ambitious targets.
metadata:
  kind: procedure
---

# Reimagine Speed

Use this skill before choosing an optimization target, to find out how fast or cheap the system
could really be. Your own baseline suggests incremental targets; credible results from comparable
systems show what a stretch target could be.

## Steps

1. **Name what you are measuring.** Write down the operation, the workload, the environment, the
   guarantees that must hold, and the investigation budget: time, compute, and the access you have.

2. **Measure the current system.** Benchmark it, following `check-benchmark`'s full checklist
   (limiter, tuning, physical limits, errors, repeatability, relevance, and whether the work ran).
   Reuse earlier measurements only if they pass the same checklist for the same code, workload, and
   machine. If you can neither run the benchmark nor reuse a valid measurement, report the baseline
   as missing rather than guessing one.

3. **Research what others achieve.** Find credible published measurements from comparable systems,
   in industry or research, and cite the original sources with their conditions. Explain how
   hardware, workload, and guarantees differ from yours, and throw out comparisons that would
   mislead.

4. **Propose a stretch target.** Propose an ambitious target, beyond an incremental improvement.
   Separate three things: what you measured, what comparable systems show, and what you only believe
   is feasible. Name the single cheapest experiment, in time and effort, that could test whether the
   target is reachable.

## What to return

The baseline, the references, the proposed target, the tradeoffs, and the cost of the experiment
that would test it. Recommend a target for the user to choose; never replace an agreed target or
start optimizing.
