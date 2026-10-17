---
name: code-correctness
description: >-
  Design valid states, invariant ownership, and operation contracts that preserve correctness.
  Apply when designing or changing algorithms, shared state, failures, or resource lifetimes.
metadata:
  kind: procedure
---

# Code Correctness

Start from agreed requirements and existing contracts. Name invariant owners, choose algorithms
that preserve invariants, and define the rules governing shared state. Use the `to-design` skill for
an optional implementation proposal or review.
Only behavioral requirements, invariants, and test obligations belong in a Spec through to-spec.

- **Invariant:** a property that must hold at the states or observation points the contract names.
- **Owner:** the authority responsible for preserving an invariant or managing a resource lifetime.
- **Contract:** accepted inputs, required facts, results, failures, and state/lifetime obligations.
  An operation contract states these for one public operation.
- **Established fact:** a property supported at a stated point; changing state may invalidate it.
- **Publication:** the point at which a state change becomes visible as one consistent decision.

## Establish ownership

```text
Group entities, state, invariants, and operations
  by shared state or changes that must publish together.

Can an existing owner enforce the invariant?
  +-- Yes: reuse or extend that owner.
  `-- No:  justify a new owner.
```

- **Value validity:** construction and transformation preserve it; no state owner is needed.
- **Shared-state rules:** first check whether separate ownership eliminates shared mutation.
  When sharing is required, coordinate operations under one owner and consistent publication,
  even when only one operation depends on that state.
- **Resource lifetime:** name the owner responsible for acquisition, use, and cleanup.

A slice may have zero, one, or multiple owners. Name the authority for each invariant and
the coordination required when changes affect a guarantee spanning owners.
Justify a new owner by explaining why existing owners cannot enforce the invariant without
weakening their boundaries. Establish its contract before using its public operations.

## Validate before transforming

Declare input constraints in schemas or validated constructors at untrusted entry boundaries.
Transform established values internally without repeating those same input checks.

## Choosing the algorithm

Trace reads, writes, and dominant access patterns before choosing the representation.
Replace synchronized flags or repeated branches when a state machine, union, or registry removes
them.
Build valid values by construction: a nonempty sequence has a head and rest.
An ordered range has a start and nonnegative duration.
Strengthen types where an operation would otherwise be partial; keep simpler types for total
operations.
Pick the representation whose properties keep the invariant true with the least ongoing work,
and write *why*, not just *what*:

- **Weak:** "uses a heap."
- **Strong:** "popMax returns the maximum because the heap holds exactly the Queued jobs.
  Every transition removing a job from Queued removes it from the heap in the same publication."

Record complexity when scale or a requirement makes it observable.

## Operational rules

Define operational rules where sharing, growth, or asynchronous lifetime needs them.

- **Publication:** recheck facts that depend on changing state, decide, and expose new state
  as one indivisible change.
  Name what observers cannot see half-applied, not just the primitive used.
- **Locks:** hold only for atomic publication; no I/O or callbacks inside.
- **Bounds:** every growing queue, retry sequence, or list needs a limit and behavior at that limit.
- **Monotonic values:** check before incrementing; define behavior near the numeric limit.
- **Background tasks:** name the owner responsible for stopping each task.

## Choose enforcement for each required property

Prefer preventing violations through representation or construction where possible.
Use state ownership and runtime checks for facts those mechanisms cannot establish.
A typed error reports rejection; the check and controlled transition enforce the rule.
Tests and correctness arguments check enforcement; they do not replace it.

## Attacking the design

- **Escape hatches:** casts, deserialization, direct storage writes, FFI, and reflection.
- **Stale evidence:** tokens or handles whose established facts no longer hold at use.

For retryable operations, check repeated execution and interruption after each consequential effect.
Name how re-execution reconciles partial state and converges without duplicating completed effects.
Also attack interruption and partial external effects between publications.
A local atomic update cannot make an external side effect atomic; require idempotency,
durable convergence, an outbox, or an explicit visible risk.

Resolve honestly. An attack is blocked only when a named mechanism prevents it — not when it
"would be caught in review." Otherwise state its observable outcome or keep the risk explicit.

## Deriving verification

```text
invariant              -> public-boundary sequence/property check
eventual completion    -> fairness/progress argument; observe through the production boundary
construction-only fact -> a construction-time or compile-time check
```

Design targets and diagnostic evidence in accordance with design-for-verification (Use the
`design-for-verification` skill). Use the `testing-policy` skill for executable
checks.
Keep liveness assumptions explicit; sampled executions alone do not prove eventual completion.

Report owners, invariants, representation, contracts, enforcement, and verification targets.
