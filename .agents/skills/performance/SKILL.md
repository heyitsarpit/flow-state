---
name: performance
description: >-
  Make software fast enough for a named workload and budget: find what limits it, reduce work,
  and prove the result. Works by measuring running code, or by modeling costs when choosing a
  shape before code exists. Use for slow software, performance reviews, optimization plans,
  hardware-aware
  tuning, and design choices where scale matters. Repeated rounds toward a target use hillclimb.
metadata:
  kind: procedure
  applies:
    - principle-design-for-performance
    - principle-explain-measurements
    - principle-design-for-verification
    - principle-claim-only-what-you-checked
    - policy-testing
    - policy-records
---

# Performance

Performance work is one loop: set the target, find the cost that limits it, reduce that cost, and
prove the result. The only fork is where the cost comes from. If code already runs on the target
workload, measure it. If there is no code you can run on the workload (you are choosing a shape
before code exists, or the code cannot be run), estimate the costs from the design and label every
one a prediction. For repeated rounds toward a target, use `hillclimb` instead.

## 1. Target

Read the Task, Plan, Spec, current changes, and existing measurements. Stay within the assigned
analysis or implementation scope.

- Name consumer operations, input distributions, query and update frequency, concurrency, and
  environment. For changing inputs, record change size and the work each change invalidates.
- Confirm the metric and budget: startup, first result, completion, tail latency, throughput,
  memory, build time, or cost. Confirm the guarantees to preserve, the run budget, and the
  stopping condition.
- Reuse settled targets, design decisions, and evidence. Do not change the metric partway through:
  a gain on a new metric can hide a regression on the old one.
- Missing choices that matter go to the user. If recording them is in your scope, add them to the
  Plan or Spec as open questions; otherwise list them in your report.

## 2. Cost

Trace the critical path from the highest-level input to each result.
Count repeated passes, allocations, retained bytes, copies, serialization, boundary crossings,
and waits. State how they grow with input size and concurrency.

**Measured.** Profile representative workloads. Distinguish computation, memory latency and
bandwidth, I/O, allocation, coordination, and excess work. Measure queueing, locks, saturation,
and dependency latency alongside computation. Separate successful and failed operations.
Find the limiting cost. Use `diagnose` when the cause needs causal evidence. Use `check-benchmark`
before relying on any comparison.

**Modeled.** Estimate the same costs from the design and the workload. Label each one a
prediction. Use `prototype` to test risky predictions when the user chooses the experiment.

For where costs usually live in a kind of system, read the matching domain guide. Follow the whole
path when it spans domains.

| Domain | Read |
|---|---|
| Terminal commands | [CLI](references/domains/cli.md) |
| Services and APIs | [Servers](references/domains/servers.md) |
| Queries and storage | [Databases](references/domains/databases.md) |
| Browser applications | [Websites](references/domains/websites.md) |
| Bulk data processing | [Pipelines](references/domains/pipelines.md) |
| Compilers and build systems | [Build tools](references/domains/build-tools.md) |
| Libraries and native kernels | [Libraries and kernels](references/domains/libraries-kernels.md) |
| Interactive native applications | [Desktop apps](references/domains/desktop.md) |

## 3. Reduce

Look for repetition, ordering, bounded values, selective predicates, shared values, actual field
access, and localized changes. Decide where work happens, what results are retained, and which
changes invalidate them. Work through [the reduction questions](references/reduction.md) before
reaching for a technique, and use them again when combining candidates.

Then pick techniques for the limiting cost that remains. Follow the measured limits, or the labeled
predictions when you are modeling; do not apply every technique.

| Limiting cost or opportunity | Read |
|---|---|
| Excess work or query structure | [Formulation](references/techniques/formulation.md) |
| Repeated searches or poor scaling | [Algorithms](references/techniques/algorithms.md) |
| Allocation, copying, or locality | [Memory and lifetimes](references/techniques/memory.md) |
| I/O, scheduling, or contention | [Execution and concurrency](references/techniques/execution.md) |
| Measured CPU kernel costs | [Kernels](references/techniques/kernels.md) |
| Build, compiler, or runtime settings | [Configuration](references/techniques/configuration.md) |
| Loading, rendering, or interaction | [Frontend](references/techniques/frontend.md) |

For each candidate, state the workload conditions where it should help, work removed, work added,
preserved invariant, and validation metric. Rank by expected impact, evidence, and implementation
cost, and choose one bounded next attempt.

- Move nonessential work off the critical path only within freshness, deadline, and resource
  bounds. Report shifted latency separately from reduced total work.
- Compare lifetime costs and retained resources against the workload and budgets.
- For caches and concurrent work, define where applicable freshness, queue limits, retries,
  deadlines, cancellation, and overload behavior. Apply `policy-code-correctness` for ownership,
  lifetimes, and resource bounds, and `policy-code-composition` for access patterns, batching, and
  boundary costs.
- Review persistent formats, APIs, and deployment constraints early; they are costly to reverse.
- Reject complexity without demonstrated benefit unless an explicit architectural contract requires
  it.
- Verify version-specific APIs, defaults, and techniques against [sources](references/sources.md).

## 4. Prove

Preserve outputs, ordering, precision, overflow, null handling, consistency, durability,
cancellation, failure behavior, and memory safety. Test relevant growth, skew, boundaries, stale
results, overload, and partial failures. Use [specialized checks](references/validation.md);
separate diagnostic builds from performance runs.

Your assignment says which of these applies; if it does not say, treat it as analysis only.

**Measured, analysis only.** Return ranked candidates and unresolved evidence. Stop before
implementation.

**Measured, implementation authorized.** Make one bounded change (`execute-task` describes how),
including the configured lint. Pair targeted and end-to-end measures; include cold and warm
behavior. Check acceptance on the final snapshot with `check-task`, independent of the author.
Remeasure the assembled path and find its new limiting cost. Do not assume separate speedups add or
multiply. Keep useful regression workloads. Report any acceptance that is still unmet as open.

**Modeled.** Return the workload, budget, cost model, chosen strategy, why it meets the workload
and budget, its preconditions, alternatives, preserved guarantees, and the measurements that will
confirm each prediction once code exists.

## Report

Report comparisons through `check-benchmark`. Include correctness results, tradeoffs, limits, and
evidence locations. Label unmeasured recommendations as hypotheses. Keep small findings brief.
Record material findings in the owning Task within scope; report changed-contract proposals for
the Spec. Revisit the model and the contracts when the workload or implementation changes.
