---
name: policy-verification
description: >-
  Build, prove and maintain your own verification suites: the tests, end-to-end drivers,
  reference models, benchmarks and data checks that decide whether a verification target holds.
  Says what must be known about each suite, not which tool or file format to use. Apply when work
  has no proven check yet, before new code is built against existing suites, and when a defect
  slips past a check.
metadata:
  kind: policy
  applies:
    - principle-design-for-verification
    - policy-testing
    - policy-records
---

# Verification Policy

A **verification suite** is the executable check (a test suite, an end-to-end test and its driver,
a reference model, a benchmark suite, a data check) that decides whether a **verification
target**, a condition that must hold, recorded in the Plan or a Spec, holds.
skill:principle-design-for-verification says why you decide how you will know before you build.
This policy is the procedure: how to choose, build, prove and maintain suites. How to write tests
and audit them is skill:policy-testing.

It applies to any project: a web app, a CLI, a library, a service, a data pipeline, a model. It
prescribes what must be known about each suite, never a file format or a tool. Use the project's
own tools and names. Its terms (mutant, test oracle, test double, reference model, survey before
adding) are defined in skill:to-epic#terms.

## What a suite is

Choose a suite by the question it answers. These are examples, not a menu; one piece of work may
need several suites.

| Question                                           | Example suites                                                                                                         |
|----------------------------------------------------|------------------------------------------------------------------------------------------------------------------------|
| Does it behave as specified?                       | Behavior tests at a public boundary (skill:policy-testing), and property-based tests; a reference model written from the requirements |
| Does it work for a user?                           | An end-to-end test whose driver runs the real app, CLI, API or UI through its public surfaces and checks the side effects |
| Does it hold under ordering, retries, concurrency? | Scenario suites with fault injection (delays, drops, restarts, reordering); a reference model or property check over generated sequences |
| Is it fast or cheap enough?                        | A benchmark suite with a measured baseline and a named workload                                                       |
| Does it still match reality?                       | Golden files; contract tests against the real dependency; data or schema checks on real inputs                        |

## Choose

1. **Start from the strongest promise:** the one where a break hurts most and the current checks
   reach least. A suite for an easy, already-covered promise adds little.
2. **Choose the method by the question** (the table above), not by the tools you already have.
3. **With no specialised tool, test the real code with generated inputs.** Random operation
   sequences checked against a small reference model, or properties over generated data, find real
   defects without a framework. Missing tooling is work to plan, not a reason to skip the suite.
4. **Reuse a suite that still holds.** Run the survey before adding first (below).

## Build

- **Tie each part to code a reviewer can open,** in the project's own names: each check names the
  promise it covers and the code that keeps it (a path, a function, an endpoint, a table).
- **Drive through public surfaces and stable handles:** a public API, a CLI command, a URL, a
  documented event, a test id on an element. Never internal setters, private state or test-only
  endpoints; a suite that uses them passes on paths real users never reach.
- **Check side effects, not just what is visible:** read persisted state back, check messages sent
  and files written, and check that nothing else changed.
- **No flaky tests; keep them hermetic:** control clocks, seeds and ordering; give each run its own
  state and resources; keep the seed and the failing input of every failure.
- **Evidence survives cleanup:** logs, captures and failing inputs are saved where the cleanup
  does not remove them.
- **One rerun command:** anyone can rerun the suite from a clean checkout with one command, with
  its setup stated.

## Prove

A suite that has never run end to end, or has not killed its mutants at its `Matched at` revision,
is a draft, not a deliverable. A lint, type or format gate is proven the same way, by a planted
violation: a probe file it must reject.

1. **Run it end to end** on the current code.
2. **Write and run mutants.** In a copy or a scratch branch, make the mistake the suite exists to
   catch: skip a write, swap an order, return a stale value, drop a retry guard. Run the suite and
   see it kill the mutant: fail by the check you expected, for the reason you expected. Revert and
   see it pass. Do this for each promise the suite covers. Keep each mutant reapplicable (a patch, a
   switch in the suite), so an audit or a later survey before adding can run it again.
3. **Get it audited** by someone who did not build it: skill:policy-testing#audit-a-suite. Work that
   relies on the suite's verdict waits for the audit to pass.

A change to the suite, or to the code it covers, after the last mutant run means the mutants run
again before the suite counts as proven.

## Scope

Every suite states its scope, so a claim based on it stays inside what it checks:

- **Bounds:** the inputs, sizes, environments and versions it covers.
- **Assumptions:** what it takes as given, such as a test double for a dependency, a fixed clock or
  one process.
- **Exclusions:** what it does not check, by name.

**On a failure, decide whether the code or the suite is wrong** before you fix either. Replay the
failing case against the real code, through the real interface and the real dependency where you
can, before believing the suite: a test double, an assumption or a stale expectation can fail a
correct implementation. If the suite is wrong, fix it, log why, and prove it again. Never change an
expected result only to make a check pass.

## The coverage record

Each suite has one record, a prose convention (no typed fields). It is lines in the verification
entry, in this order:

- `Covers:` links to the Plan outcomes, Spec items and `code:` paths it checks.
- `Suite:` `code:` links to the checks.
- `Rerun:` one command, and its setup.
- `Mutants:` each mutant and the check that kills it.
- `Audit:` not audited, or audited by whom and when, with any open findings.
- `Matched at:` a revision at which the suite last matched the code: run end to end, every
  mutant killed, and the audit still valid.
- `Scope:` bounds, assumptions and exclusions.

**Where it lives.** In a project that uses Workflow records, in the Plan's `verification` entry for
the target it checks. Any object may link any object in prose, so `workflow check` resolves its
links, including `@spec.` items and `code:PATH#TEXT`. Otherwise, wherever the project keeps such
records: a README section, the test file's header, the CI configuration. Keep one record per
suite; everything else links to it. A reviewer or judge reads the record, not the tests.
`workflow refs code:PATH` lists the targets that cover a path (use it for the survey). Staleness
is checked by comparing the covered paths' history with `Matched at:`.

For example, a Plan entry in Workflow records:

```text
verification
    V3  An order survives a payment-provider timeout
        Covers: @O2, @spec.Checkout.R4; code:src/checkout/pay.ts#confirmPayment, code:src/checkout/retry.ts.
        Suite: code:test/checkout/timeout.scenario.ts, a scenario suite that injects timeouts.
        Rerun: npm run test:scenarios -- timeout. Needs the payment-provider test double on 4010.
        Mutants: retry without the idempotency key, killed by "one charge per order"; give up
        after the first timeout, killed by "order completes after two timeouts". Both killed
        at 4f2c1e9.
        Audit: passed 2026-11-02, independent reviewer; no open findings.
        Matched at: 4f2c1e9.
        Scope: one region, provider test double with injected delays; real latency excluded.
```

## Maintain

- **Survey before adding.** The survey before adding is an impact analysis of the existing suites
  that also confirms they are still correct. Before new code is built against existing suites,
  find every suite the change touches, by the code it changes and the promises it serves
  (skill:change-impact does this well). For each, use its record to confirm two things. It still covers the new
  behavior. And it is still correct: no change to the code it checks lands after its `Matched at`
  revision (for example, `git log <revision>..HEAD -- <covered paths>` is empty), and its mutants
  still apply to today's code.
- **A suite that fails the survey before adding blocks building on it.** A suite that no longer
  covers the change, or whose record predates a change to the code it checks, makes that work not
  readily verifiable: extend the suite, prove it again and get it re-audited (audited again after
  the change) first, then build. Record the survey's result where the work's evidence goes.
- **A change to covered code reopens the record.** Once code it covers changes after its
  `Matched at` revision, rerun the suite and its mutants and move `Matched at`. Get a new audit
  when the suite's checks or scope changed.
- **Strengthen a suite when a defect slips past it.** Add the check that would have caught it,
  see it fail on the defect, then fix the defect and keep the check as a regression test.
- **Never weaken a check to make it pass.** Loosening an expectation, raising a tolerance,
  skipping a case or narrowing the scope needs a logged reason; relaxing an agreed guarantee needs
  the user.
- **Checks cited elsewhere must still apply.** A Spec, audit or record that cites a check or a
  mutant relies on it still applying to today's code. A mutant whose edit no longer applies,
  because the code moved, cannot be killed and proves nothing: re-point it or rewrite it.
- **Gates are falsified at every audit:** every gate is run against a null implementation and
  against its recorded mutants; a gate that stays green on either is not a gate.
- **Retire a suite only with its promise,** and say so in its record.

## Split work that has no proven suite

A suite is **proven** when it has run end to end, killed every mutant at its `Matched at`
revision with no covered code changed since, and passed its audit; an existing suite must also
pass its survey before adding. A piece of work without one becomes two steps. When the suite
follows directly from agreed requirements, such as tests written straight from a Spec, the steps
are two Tasks in one piece of work (in an Epic, two Tasks in one phase). When the suite needs its
own design or audit, they are two phases in an Epic (skill:to-epic), or two Tasks otherwise.

1. **Build and prove the suite.** Its exit criteria: everything under "Prove" holds and its
   coverage record exists. It may fail the current product; that is expected.
2. **Do the work against it,** blocked by the first. Its exit criteria: the suite passes at the
   final revision with no regression.

When the code and its suite grow together, as in a runtime, a protocol or a compiler, split per
area within each iteration instead of once for the whole: an area with a proven suite is built
against it; an area without one gets its suite built and proven first.
