---
name: policy-testing
description: >-
  Choose and assess tests of observable production behavior through public boundaries.
  Apply when designing, writing, changing, or reviewing integration, E2E, fuzz, or golden tests.
metadata:
  kind: policy
  applies:
    - principle-design-for-verification
    - policy-records
    - policy-delegation
---

# Testing Policy

Tests in this project check behavior that a consumer can observe, through the same public interface
real callers use. They do not check implementation details: private functions, internal structure,
or how the code is wired together. Tests tied to those details break during refactors without
catching anything a user would notice, and they cost upkeep. So do not add unit tests in that sense,
and do not relabel an isolated check of an implementation detail as a behavior test. A test of a
public, consumer-facing function is a behavior test and is fine, as long as it uses the real
components behind it and derives its expectations independently of the code. This narrows the old
blanket ban on "unit tests" on purpose: the aim was always implementation-detail tests.

What to test, and what evidence counts, comes from `principle-design-for-verification`. When a test
exposes a consequential gap in the contract or an expectation that conflicts with one, do not
quietly change the test: cite the commitment you expected, report the failure with its reproduction,
and reconcile the intended behavior against the recorded commitments first (`policy-records`). A
failing test on its own never creates a new guarantee.

## Choose the boundary

Name the production interface, behavior under test, and dependencies actually exercised. Exercise a
boundary through its public interface used by real consumers; a test-only export does not qualify.
Trace existing callers when the boundary is unclear. For example, exercise save/load through the
public API with real serialization and storage, rather than testing a private serializer with test
doubles for its collaborators.

| Test scope           | Exercise                                      | Protect                       |
|----------------------|-----------------------------------------------|-------------------------------|
| Module integration   | Public API with real module components        | Behavior across boundaries    |
| Data/API integration | Real producers, adapters, and consumers       | Schema and protocol agreement |
| Full E2E             | Full flow; real dependencies; no test doubles | Assembled system behavior     |

Behavior is what a consumer can observe at a public boundary for given inputs and conditions:
outputs, errors, persisted changes, side effects, ordering, and resource lifetimes promised by
the contract. Internal calls or structure count only when they affect that observable contract.
Do not replace owners or internal collaborators with test doubles that implement the claimed
behavior. If an external dependency is replaced by a test double, name it.
Limit the claim to the real boundary exercised.
That check does not prove the substituted adapter or full E2E integration.

## Choose inputs and expected results

Fuzz and golden tests describe inputs and expectations; they complement the chosen test scope.

- **Golden examples:** use realistic inputs and independently reviewed expected outputs.
  Include meaningful edge cases and regressions. Do not regenerate expected output merely to pass.
- **Fuzz properties:** state the invariant and input constraints before generating cases.
  Exercise production behavior. Retain the seed and failing input; minimize useful counterexamples
  into reviewable regression examples.
- **Behavior assertions:** derive expectations from a test oracle: the contract, a worked example,
  or a reference model. Do not compute them with the same implementation being tested.

For data and API boundaries, test accepted and rejected inputs, plus any formats or versions that
must stay compatible. An expected value copied from the implementation is not a test oracle.

## Keep tests useful

- Before keeping a test, identify the credible regression that makes it fail and the coverage gap.
  Exercise the real production path and assert observable behavior.
- Reject tests that only check their own test doubles or setup data.
- For a bug regression, show pre-fix failure for the intended reason and success after repair.
- No flaky tests: control time and race order through clocks, checkpoints, or observable gates; do
  not synchronize with sleeps. Keep tests hermetic: each run owns its state and resources. Capture
  enough context to reproduce failures.
- Keep skipped, pending, and unrun checks distinct from passing evidence.
- This policy does not authorize deleting existing tests or rewriting the whole suite.

## Audit a suite

A suite can pass a wrong implementation. Before building on a suite's verdicts, such as a
conformance or benchmark suite that gates later work, audit it:

- **Audit from four angles,** each by a reviewer who has not read earlier reviews: bugs in the
  test harness; false assumptions about reality in test doubles and cases; assumptions so narrow
  that a correct variation fails; and missing requirements, where a mutant survives.
- **Audit adversarially, by someone who did not build it.** Before an area's tests are
  relied on, a lead auditor that did not build it runs the four angles, one sidecar per angle
  (skill:policy-delegation). The auditor writes its own mutants from the requirements, never from
  the builder's code, and a named check must kill each. Re-audit each new area; stop when each
  audit finds fewer, narrower combination gaps, and carry the rest to the production suite.
- **Inventory each check's inputs.** Mark each one as observed by the test harness or reported by
  the code under test.
- **Excuse only what the harness observed.** A check may excuse a missing obligation only for a
  cause the harness saw. A report from the code under test may be checked for consistency, but
  never trusted as an excuse.
- **Give the suite its own reference model** when the harness cannot observe an answer: a small
  model written from the requirements that imports nothing from the code under test.
- **Make every check able to fail.** Each gate must kill its mutants: a null, broken, or tampered
  implementation. Add a mutant for each report the checks read, and require a named check to kill
  it. Keep the mutants with the suite and rerun them whenever it changes.
- **Re-audit after fixing the suite.** Work that relies on its verdicts waits for a pass.

Building a verification suite, proving it with mutants, recording what it covers, and surveying it
before new code is built against it: skill:policy-verification. Terms such as mutant, test oracle
and test double are defined in skill:to-epic#terms.
