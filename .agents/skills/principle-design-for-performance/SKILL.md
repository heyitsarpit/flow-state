---
name: principle-design-for-performance
description: >-
  Treat performance as a contract: name the workload and budget when you design, reduce work
  before speeding up what remains, and trust only measured costs. Apply when planning outcomes,
  specifying modules, or choosing shapes where scale, latency, or resources matter.
metadata:
  kind: principle
  applies:
    - principle-explain-measurements
---

# Design for Performance

Set performance requirements during design, while formats, APIs, and ownership are still easy to
change. Name the workload and the budget, choose a design (representation, algorithm, and
boundaries) that fits them, and verify the result by measurement.

**Why:** A shape chosen without a workload is a guess, and the most expensive performance fixes
change persistent formats, APIs, or ownership after code depends on them.

## Rules

- **Make it a contract.** A performance-sensitive outcome names its workload (input sizes,
  frequency, concurrency, environment) and its budget as a measurable limit, for example "p95
  latency under 50 ms for note search, at 200 concurrent requests averaging 20 per second each, on
  100k notes, on the production instance type". Record it as a Plan Verification target or a Spec
  invariant, not as a vague goal.
- **Reduce work first.** Remove, reuse, restrict, or filter work before accelerating what remains.
- **Predictions are hypotheses.** A cost estimated from reading code or from a cost model stays a
  prediction until a measurement confirms it. Plan the measurement that will confirm it.
- **Faster must not change behavior.** Preserve outputs, ordering, failures, precision,
  durability, and resource limits.
- **Decide costly-to-reverse things early.** Before committing to a design, review its persistent
  formats, public APIs, and deployment constraints.

## Where it applies

- **Planning:** give performance-sensitive outcomes a workload and budget.
- **Specifying:** state resource guarantees as behavior when consumers rely on them.
- **Designing:** choose representations and algorithms for the named workload.
- **Later passes:** measure, confirm or replace the predictions, and keep regression workloads.

The method lives in `performance`. Repeated tuning toward a target lives in `hillclimb`.
Whether a measured number means what it claims belongs to `principle-explain-measurements`.
