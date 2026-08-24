---
name: performance-quality-bug-hunt
description: Perform a read-only, evidence-backed review of a diff or bounded code slice for correctness regressions, edge-case bugs, concurrency and cleanup failures, performance risks, and missing adversarial tests. Use for generic bug hunts and performance or quality reviews; do not replace domain-contract or framework-specific architecture review.
---

# Performance Quality Bug Hunt

Search for failures the implementation and its happy-path tests missed. Favor
reproducible bugs and measurable risks over style preferences.

## Scope first

Before reviewing, obtain:

1. The requested diff, changed-file list, or explicit path allowlist.
2. The intended behavior and relevant tests or acceptance criteria.
3. The commands that are safe to run and any known baseline failures.

In a dirty worktree, never treat the full repository diff as the author's
slice. Do not edit files unless the user explicitly changes the request from
review to repair.

## Hunt order

### 1. Correctness and regression

- Trace inputs through branches, state changes, outputs, and externally visible
  side effects.
- Test empty, boundary, malformed, duplicate, reordered, stale, and repeated
  inputs where the code claims to handle them.
- Look for partial updates, incorrect defaults, lost information, incompatible
  return shapes, exception leaks, swallowed failures, and changed behavior at
  existing call sites.
- Check that validation occurs before mutation or irreversible work.

### 2. Concurrency and lifecycle

- Look for races, stale completion, double settlement, missed cancellation,
  use-after-dispose, leaked timers/listeners/fibers/handles, and cleanup that
  fails on only one exit path.
- Review success, failure, cancellation/interruption, timeout, retry, and
  shutdown independently.
- Require deterministic synchronization in tests; scheduler luck and real
  sleeps are not proof.

### 3. Performance and resource use

- Identify hot-path algorithmic growth, repeated parsing/serialization,
  avoidable full copies, unbounded queues/caches/history, N+1 I/O, duplicated
  work, blocking operations, missing backpressure, and retained resources.
- Label every claim `measured` or `inferred`. A measured finding names the
  benchmark/profile and result. An inferred finding names the triggering input
  shape and expected growth.
- Do not demand caching, parallelism, batching, or memoization without a real
  workload and invalidation/ordering analysis; those fixes can create worse
  bugs than the original cost.

### 4. Defect-producing quality

- Flag duplicated ownership, misleading APIs, hidden invariants, inconsistent
  representations, fragile cross-module knowledge, dead branches that mask
  behavior, and abstractions that make failures harder to observe.
- Ignore cosmetic naming and formatting unless they conceal a correctness
  boundary.
- Prefer the smallest fix at the canonical owner. Do not prescribe a broad
  rewrite when a local invariant closes the failure.

### 5. Adversarial proof

- Inspect whether tests can fail for the bug being claimed; implementation-text
  assertions and snapshots of incidental structure are weak evidence.
- Add no tests during a read-only review. Describe the minimal decisive test,
  its production owner, setup, action, and observable assertion.
- Run the narrowest existing tests, type checks, lints, or benchmarks needed to
  confirm a finding. Report commands and exits exactly.

## Finding standard

Prioritize findings by consequence:

- `P0`: data loss, security boundary break, unrecoverable corruption, or
  generally catastrophic behavior.
- `P1`: likely correctness regression, deadlock/leak, public incompatibility,
  or severe performance collapse.
- `P2`: bounded bug or material maintainability/performance risk with a concrete
  trigger.
- `P3`: non-blocking hardening backed by a realistic scenario.

Each finding must use this shape:

```text
[P1] Short title — /absolute/path:line
Trigger:
Observed or inferred failure:
User/system consequence:
Smallest owning fix:
Decisive proof:
Confidence: high | medium
```

Do not include low-confidence speculation as a finding. Put unresolved
questions under evidence limits.

## Handback

Return findings first, ordered P0 to P3, followed by:

```text
Checks run:
Measured performance evidence:
Remaining evidence limits:
Verdict: PASS | BLOCKED
```

`PASS` means no confirmed blocking bug in the reviewed scope; it does not mean
contract compliance, architectural excellence, security certification, or
whole-repository correctness.

## Separation from specialist reviews

- Domain contracts and proof ownership belong to the relevant contract-review
  skill.
- Effect-native architecture, type-system ambition, and structural code-judo
  belong to `thermo-nuclear-code-quality-review`.
- Mechanical Flow State TypeScript bans belong to
  `typescript-style-guide` and the repository linter.
- A deletion-only minimalism pass may run after correctness reviews. It must not
  remove validation, failure handling, cleanup, security, accessibility, or
  behavior required by the task.
