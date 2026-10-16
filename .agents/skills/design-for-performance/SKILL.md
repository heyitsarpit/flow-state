---
name: design-for-performance
description: >-
  Design performance around workloads, cost models, resource budgets, and correctness contracts.
  Apply when scale or performance requirements affect representation and execution boundaries.
disable-model-invocation: true
metadata:
  kind: procedure
---

# Design for Performance

Model the workload before choosing representations, execution boundaries, and resource budgets.

## 1. Define the workload and budget

Name consumer operations, input distributions, query/update frequency, concurrency, and environment.
For changing inputs, record change size and the work each change invalidates.
Choose targets for startup, first result, completion, tail latency, throughput, memory, build time,
or cost. Preserve guarantees; expose consequential unknowns.
Apply [design-for-verification](../design-for-verification/SKILL.md) to targets and diagnostics.

## 2. Account for work

When workload modeling or measurement needs stronger methods, use [deepen](../deepen/SKILL.md)
to propose a stronger investigation brief within the agreed scope.

Trace the critical path. Count repeated passes, allocations, retained bytes, copies, serialization,
boundary crossings, and waits. State growth with input size and concurrency.
For existing paths, measure queueing, locks, saturation, I/O, and dependency latency alongside
computation. Separate successful and failed operations; identify the limiting cost.
Label predicted costs as assumptions; use [prototype](../prototype/SKILL.md) for risky choices.
Move nonessential work off the critical path only within freshness, deadline, and resource bounds.
Report shifted latency separately from reduced total work.

## 3. Exploit workload structure

Identify repetition, ordering, selective predicates, shared values, and localized changes.
Decide where work happens, what results are retained, and which changes invalidate them.
Use [work reduction](../work-reduction/SKILL.md) to discover and compose reductions.
Compare lifetime costs and retained resources against the workload and budgets.

Read relevant domain guides below; follow the whole path when it spans domains.
State why the strategy meets the workload and budgets; identify preconditions and alternatives.
Review persistent formats, APIs, and deployment constraints early; they are costly to reverse.

Apply [code-correctness](../code-correctness/SKILL.md) to ownership, lifetimes, and resource bounds.
For caches and concurrent work, define freshness, queue limits, retries, deadlines, cancellation,
and overload behavior where applicable.
Apply [code-composition](../code-composition/SKILL.md) to access patterns, batching, and boundary
costs.

| Domain | Read |
|---|---|
| Terminal commands | [CLI](references/cli.md) |
| Services and APIs | [Servers](references/servers.md) |
| Queries and storage | [Databases](references/databases.md) |
| Browser applications | [Websites](references/websites.md) |
| Bulk data processing | [Pipelines](references/pipelines.md) |
| Compilers and build systems | [Build tools](references/build-tools.md) |
| Libraries and native kernels | [Libraries and kernels](references/libraries-kernels.md) |
| Interactive native applications | [Desktop apps](references/desktop.md) |

## 4. Verify semantics and performance

Preserve outputs, ordering, precision, overflow, null handling, consistency, durability,
cancellation, failure behavior, and memory safety. Under
[testing-policy](../testing-policy/SKILL.md),
test relevant growth, skew, boundaries, stale results, overload, and partial failures.
Use [benchmark-checklist](../benchmark-checklist/SKILL.md) for measured comparisons.
Pair targeted and end-to-end measures; include cold/warm behavior and retain useful regression
workloads.
Verify version-specific APIs and defaults before applying techniques.

## 5. Keep the design current

Return workload, budget, cost model, strategy, alternatives, guarantees, and verification.
Separate results from hypotheses; keep small findings brief.
Reconcile material commitments through [keep-intent-aligned](../keep-intent-aligned/SKILL.md).
Report changed-contract proposals for Spec reconciliation.
Revisit contracts when workload or implementation changes.
