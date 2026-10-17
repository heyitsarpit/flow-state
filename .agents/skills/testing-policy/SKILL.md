---
name: testing-policy
description: >-
  Choose and assess tests of observable production behavior through public boundaries.
  Apply when designing, writing, changing, or reviewing integration, E2E, fuzz, or golden tests.
metadata:
  kind: policy
---

# Testing Policy

Do not add unit tests. Do not relabel isolated implementation-detail checks as behavior tests.
The ban prioritizes refactor freedom and avoids implementation coupling and maintenance overhead.
Use the `design-for-verification` skill for targets and evidence.
When a test exposes a consequential contract gap or conflicting expectation, apply
keep-intent-aligned (Use the `keep-intent-aligned` skill): cite the expected commitment,
return the
failure and reproduction, and reconcile intended behavior against existing commitments before
changing expectations. A failing test alone does not authorize a new guarantee.

## Choose the boundary

Name the production interface, behavior under test, and dependencies actually exercised.
Exercise a boundary through its public interface used by real consumers; a test-only export
does not qualify.
Trace existing callers when the boundary is unclear.
For example, exercise save/load through the public API with real serialization and storage,
rather than testing a private serializer with mocked collaborators.

| Test scope           | Exercise                                | Protect                       |
|----------------------|-----------------------------------------|-------------------------------|
| Module integration   | Public API with real module components  | Behavior across boundaries    |
| Data/API integration | Real producers, adapters, and consumers | Schema and protocol agreement |
| Full E2E             | Full flow; real dependencies; no mocks  | Assembled system behavior     |

Behavior is what a consumer can observe at a public boundary for given inputs and conditions:
outputs, errors, persisted changes, side effects, ordering, and resource lifetimes promised by
the contract. Internal calls or structure count only when they affect that observable contract.
Do not replace owners or internal collaborators with fixtures that implement the claimed behavior.
If an external dependency is substituted, name it.
Limit the claim to the real boundary exercised.
That check does not prove the substituted adapter or full E2E integration.

## Choose inputs and expected results

Fuzz and golden tests describe inputs and expectations; they complement the chosen test scope.

- **Golden examples:** use realistic inputs and independently reviewed expected outputs.
  Include meaningful edge cases and regressions. Do not regenerate expected output merely to pass.
- **Fuzz properties:** state the invariant and input constraints before generating cases.
  Exercise production behavior. Retain the seed and failing input; minimize useful counterexamples
  into reviewable regression examples.
- **Behavior assertions:** derive expectations from the contract, a worked example,
  or an independent oracle. Do not compute them with the same implementation being tested.

For a data/API boundary, cover valid, rejected, and compatibility-sensitive data where applicable.
An expected value copied from the implementation is not an independent oracle.

## Keep tests useful

- Before keeping a test, identify the credible regression that makes it fail and the coverage gap.
  Exercise the real production path and assert observable behavior.
- Reject tests that only check their own fixtures.
- For a bug regression, show pre-fix failure for the intended reason and success after repair.
- Control time and race order through clocks, checkpoints, or observable gates; do not synchronize
  with sleeps. Isolate each run's state and resources. Capture enough context to reproduce failures.
- Keep skipped, pending, and unrun checks distinct from passing evidence.
- This policy does not authorize deleting existing tests or rewriting the whole suite.
